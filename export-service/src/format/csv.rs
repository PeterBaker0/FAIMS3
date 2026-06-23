use std::collections::HashMap;

use serde_json::Value;

use crate::format::filenames::{
    generate_attachment_filename, slugify_label, MAX_CSV_FILENAME_LENGTH,
};
use crate::model::{Annotations, FieldSummary, HydratedRecord};

pub const CSV_PREFIX_HEADERS: &[&str] = &[
    "identifier",
    "record_id",
    "revision_id",
    "type",
    "created_by",
    "created",
    "updated_by",
    "updated",
];

pub fn safe_csv_filename(label: &str) -> String {
    slugify_label(label, MAX_CSV_FILENAME_LENGTH)
}

pub fn headers_for_fields(fields: &[FieldSummary]) -> Vec<String> {
    let mut headers = Vec::new();
    for field in fields {
        headers.extend(component_headers(field));
        if !field.annotation.is_empty() {
            headers.push(format!("{}_{}", field.name, field.annotation));
        }
        if !field.uncertainty.is_empty() {
            headers.push(format!("{}_{}", field.name, field.uncertainty));
        }
    }
    headers
}

fn component_headers(field: &FieldSummary) -> Vec<String> {
    match field.component_key().as_str() {
        "faims-custom::TakePoint" => vec![
            field.name.clone(),
            format!("{}_latitude", field.name),
            format!("{}_longitude", field.name),
            format!("{}_accuracy", field.name),
        ],
        "faims-custom::AddressField" => vec![
            field.name.clone(),
            format!("{}_house_number", field.name),
            format!("{}_road", field.name),
            format!("{}_suburb", field.name),
            format!("{}_town", field.name),
            format!("{}_state", field.name),
            format!("{}_postcode", field.name),
            format!("{}_country", field.name),
            format!("{}_country_code", field.name),
            format!("{}_manual", field.name),
        ],
        "mapping-plugin::MapFormField" => vec![
            field.name.clone(),
            format!("{}_latitude", field.name),
            format!("{}_longitude", field.name),
        ],
        _ => vec![field.name.clone()],
    }
}

pub fn record_prefix(record: &HydratedRecord) -> Vec<String> {
    vec![
        record
            .hrid
            .clone()
            .unwrap_or_else(|| record.record_id.clone()),
        record.record_id.clone(),
        record.revision_id.clone(),
        record.record_type.clone(),
        record.created_by.clone(),
        record.created.clone(),
        record.updated_by.clone(),
        record.updated.clone(),
    ]
}

pub fn data_for_output(
    fields: &[FieldSummary],
    data: &HashMap<String, Value>,
    annotations: &HashMap<String, Annotations>,
    hrid: &str,
    filenames: &mut Vec<String>,
    viewset_id: &str,
) -> HashMap<String, String> {
    let mut output = HashMap::new();
    for field in fields {
        let Some(value) = data.get(&field.name) else {
            continue;
        };
        format_value(field, value, hrid, filenames, viewset_id, &mut output);
        if let Some(annotation) = annotations.get(&field.name) {
            if !field.annotation.is_empty() {
                output.insert(
                    format!("{}_{}", field.name, field.annotation),
                    annotation.annotation.clone(),
                );
            }
            if !field.uncertainty.is_empty() {
                output.insert(
                    format!("{}_{}", field.name, field.uncertainty),
                    if annotation.uncertainty {
                        "true"
                    } else {
                        "false"
                    }
                    .to_string(),
                );
            }
        }
    }
    output
}

fn format_value(
    field: &FieldSummary,
    value: &Value,
    hrid: &str,
    filenames: &mut Vec<String>,
    viewset_id: &str,
    output: &mut HashMap<String, String>,
) {
    match field.component_key().as_str() {
        "faims-custom::TakePhoto" | "faims-custom::FileUploader" => {
            if let Value::Array(items) = value {
                let names: Vec<String> = items
                    .iter()
                    .filter_map(|item| {
                        let file_type = item.get("file_type").and_then(Value::as_str)?;
                        let filename = generate_attachment_filename(
                            Some(file_type),
                            &field.name,
                            hrid,
                            viewset_id,
                            filenames,
                        );
                        filenames.push(filename.clone());
                        Some(filename)
                    })
                    .collect();
                output.insert(field.name.clone(), names.join(";"));
            } else {
                output.insert(field.name.clone(), value_to_cell(value));
            }
        }
        "faims-custom::TakePoint" => format_take_point(field, value, output),
        "mapping-plugin::MapFormField" => format_map_field(field, value, output),
        "faims-custom::AddressField" => format_address(field, value, output),
        "faims-custom::RelatedRecordSelector" => {
            output.insert(field.name.clone(), format_relationship(value));
        }
        _ => {
            output.insert(field.name.clone(), value_to_cell(value));
        }
    }
}

fn format_take_point(field: &FieldSummary, value: &Value, output: &mut HashMap<String, String>) {
    output.insert(field.name.clone(), value_to_cell(value));
    let coords = value
        .get("geometry")
        .and_then(|geometry| geometry.get("coordinates"))
        .and_then(Value::as_array);
    if let Some(coords) = coords.filter(|coords| coords.len() == 2) {
        output.insert(
            format!("{}_latitude", field.name),
            value_to_cell(&coords[1]),
        );
        output.insert(
            format!("{}_longitude", field.name),
            value_to_cell(&coords[0]),
        );
    } else {
        output.insert(format!("{}_latitude", field.name), String::new());
        output.insert(format!("{}_longitude", field.name), String::new());
    }
    let accuracy = value
        .get("properties")
        .and_then(|properties| properties.get("accuracy"))
        .map(value_to_cell)
        .unwrap_or_default();
    output.insert(format!("{}_accuracy", field.name), accuracy);
}

fn format_map_field(field: &FieldSummary, value: &Value, output: &mut HashMap<String, String>) {
    output.insert(field.name.clone(), value_to_cell(value));
    let coords = value
        .get("features")
        .and_then(Value::as_array)
        .and_then(|features| features.first())
        .and_then(|feature| feature.get("geometry"))
        .filter(|geometry| geometry.get("type").and_then(Value::as_str) == Some("Point"))
        .and_then(|geometry| geometry.get("coordinates"))
        .and_then(Value::as_array);
    if let Some(coords) = coords.filter(|coords| coords.len() == 2) {
        output.insert(
            format!("{}_latitude", field.name),
            value_to_cell(&coords[1]),
        );
        output.insert(
            format!("{}_longitude", field.name),
            value_to_cell(&coords[0]),
        );
    } else {
        output.insert(format!("{}_latitude", field.name), String::new());
        output.insert(format!("{}_longitude", field.name), String::new());
    }
}

fn format_address(field: &FieldSummary, value: &Value, output: &mut HashMap<String, String>) {
    let display = value
        .get("display_name")
        .or_else(|| value.get("manuallyEnteredAddress"))
        .map(value_to_cell)
        .unwrap_or_default();
    output.insert(field.name.clone(), display);
    let address = value.get("address").and_then(Value::as_object);
    for key in [
        "house_number",
        "road",
        "suburb",
        "town",
        "state",
        "postcode",
        "country",
        "country_code",
    ] {
        let cell = address
            .and_then(|address| address.get(key))
            .map(value_to_cell)
            .unwrap_or_default();
        output.insert(format!("{}_{}", field.name, key), cell);
    }
    output.insert(
        format!("{}_manual", field.name),
        value
            .get("manuallyEnteredAddress")
            .map(value_to_cell)
            .unwrap_or_default(),
    );
}

fn format_relationship(value: &Value) -> String {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(format_relationship_item)
            .collect::<Vec<_>>()
            .join(";"),
        Value::Object(_) => format_relationship_item(value).unwrap_or_default(),
        _ => value_to_cell(value),
    }
}

fn format_relationship_item(value: &Value) -> Option<String> {
    let record_id = value.get("record_id").and_then(Value::as_str)?;
    let relation = value
        .get("relation_type_vocabPair")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .unwrap_or("unknown relation");
    Some(format!("{relation}/{record_id}"))
}

pub fn value_to_cell(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => escape_formula(value),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn escape_formula(value: &str) -> String {
    if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_formula_strings() {
        assert_eq!(value_to_cell(&Value::String("=1+1".into())), "'=1+1");
    }
}
