use std::collections::HashMap;

use serde_json::Value;

use crate::error::{ExportError, Result};
use crate::format::filenames::slugify;
use crate::model::{FieldSummary, UiSpec};

const SPATIAL_FIELDS: &[&str] = &["MapFormField", "TakePoint"];
const RELATIONSHIP_COMPONENT: &str = "faims-custom::RelatedRecordSelector";

pub fn get_notebook_field_types(ui_spec: &UiSpec, view_id: &str) -> Result<Vec<FieldSummary>> {
    let viewset = ui_spec
        .viewsets
        .get(view_id)
        .ok_or_else(|| ExportError::NotFound(format!("Form with id {view_id} not found")))?;

    let mut fields = Vec::new();
    for inner_view_id in &viewset.views {
        let Some(view) = ui_spec.views.get(inner_view_id) else {
            continue;
        };
        for field_name in &view.fields {
            let Some(field) = ui_spec.fields.get(field_name) else {
                continue;
            };
            let annotation = field
                .meta
                .as_ref()
                .and_then(|meta| meta.annotation.as_ref())
                .filter(|flag| flag.include)
                .map(|flag| slugify(&flag.label))
                .unwrap_or_default();
            let uncertainty = field
                .meta
                .as_ref()
                .and_then(|meta| meta.uncertainty.as_ref())
                .filter(|flag| flag.include)
                .map(|flag| slugify(&flag.label))
                .unwrap_or_default();
            fields.push(FieldSummary {
                name: field_name.clone(),
                field_type: field.type_returned.clone(),
                component_namespace: field.component_namespace.clone(),
                component_name: field.component_name.clone(),
                annotation,
                uncertainty,
                view_id: inner_view_id.clone(),
                viewset_id: view_id.to_string(),
                is_spatial: SPATIAL_FIELDS.contains(&field.component_name.as_str()),
            });
        }
    }
    Ok(fields)
}

pub fn build_viewset_field_summaries(
    ui_spec: &UiSpec,
) -> Result<HashMap<String, Vec<FieldSummary>>> {
    let mut result = HashMap::new();
    for view_id in ui_spec.viewsets.keys() {
        result.insert(view_id.clone(), get_notebook_field_types(ui_spec, view_id)?);
    }
    Ok(result)
}

pub fn get_ids_by_field_name(ui_spec: &UiSpec, field_name: &str) -> Result<(String, String)> {
    for (viewset_id, viewset) in &ui_spec.viewsets {
        for view_id in &viewset.views {
            if ui_spec
                .views
                .get(view_id)
                .map(|view| view.fields.iter().any(|name| name == field_name))
                .unwrap_or(false)
            {
                return Ok((viewset_id.clone(), view_id.clone()));
            }
        }
    }
    Err(ExportError::NotFound(format!(
        "Field {field_name} not found in UI specification"
    )))
}

pub fn get_hrid_field_name_for_viewset(ui_spec: &UiSpec, viewset_id: &str) -> Option<String> {
    if let Some(configured) = ui_spec
        .viewsets
        .get(viewset_id)
        .and_then(|viewset| viewset.hrid_field.clone())
        .filter(|value| !value.is_empty())
    {
        return Some(configured);
    }

    let viewset = ui_spec.viewsets.get(viewset_id)?;
    for view_id in &viewset.views {
        let view = ui_spec.views.get(view_id)?;
        for field in &view.fields {
            if field.starts_with("hrid") {
                return Some(field.clone());
            }
        }
    }
    None
}

pub fn project_has_spatial_fields(view_fields: &HashMap<String, Vec<FieldSummary>>) -> bool {
    view_fields
        .values()
        .any(|fields| fields.iter().any(|field| field.is_spatial))
}

pub fn relationship_field_names(
    fields: &[FieldSummary],
    data: &HashMap<String, Value>,
) -> Vec<String> {
    fields
        .iter()
        .filter(|field| {
            field.component_key() == RELATIONSHIP_COMPONENT && data.contains_key(&field.name)
        })
        .map(|field| field.name.clone())
        .collect()
}

pub fn relationship_record_ids(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                item.get("record_id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect(),
        Value::Object(_) => value
            .get("record_id")
            .and_then(Value::as_str)
            .map(|value| vec![value.to_string()])
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

pub fn filter_relationship_value(
    value: &Value,
    keep: &HashMap<String, bool>,
    multiple: bool,
) -> Value {
    let entries: Vec<Value> = match value {
        Value::Array(items) => items.clone(),
        Value::Object(_) => vec![value.clone()],
        _ => Vec::new(),
    };

    let kept: Vec<Value> = entries
        .into_iter()
        .filter(|item| {
            item.get("record_id")
                .and_then(Value::as_str)
                .and_then(|id| keep.get(id))
                == Some(&true)
        })
        .collect();

    if multiple {
        Value::Array(kept)
    } else {
        kept.into_iter()
            .next()
            .unwrap_or(Value::String(String::new()))
    }
}

pub fn relationship_field_multiple(ui_spec: &UiSpec, field_name: &str) -> bool {
    ui_spec
        .fields
        .get(field_name)
        .and_then(|field| field.component_parameters.get("multiple"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::model::{FieldDefinition, ViewDefinition, ViewsetDefinition};

    fn fixture_spec() -> UiSpec {
        let mut fields = HashMap::new();
        fields.insert(
            "gps".to_string(),
            FieldDefinition {
                component_namespace: "faims-custom".to_string(),
                component_name: "TakePoint".to_string(),
                type_returned: "faims-pos::Location".to_string(),
                meta: None,
                component_parameters: Value::Null,
            },
        );
        let mut views = HashMap::new();
        views.insert(
            "view1".to_string(),
            ViewDefinition {
                fields: vec!["gps".to_string()],
            },
        );
        let mut viewsets = HashMap::new();
        viewsets.insert(
            "FORM1".to_string(),
            ViewsetDefinition {
                label: Some("Form 1".to_string()),
                views: vec!["view1".to_string()],
                hrid_field: None,
            },
        );
        UiSpec {
            fields,
            views,
            viewsets,
        }
    }

    #[test]
    fn extracts_field_summaries() {
        let fields = get_notebook_field_types(&fixture_spec(), "FORM1").unwrap();
        assert_eq!(fields.len(), 1);
        assert!(fields[0].is_spatial);
        assert_eq!(fields[0].component_key(), "faims-custom::TakePoint");
    }

    #[test]
    fn filters_relationships() {
        let keep = HashMap::from([("live".to_string(), true), ("dead".to_string(), false)]);
        let value = json!([
            {"record_id": "live", "relation_type_vocabPair": ["x", "x"]},
            {"record_id": "dead", "relation_type_vocabPair": ["x", "x"]}
        ]);
        let filtered = filter_relationship_value(&value, &keep, true);
        assert_eq!(filtered.as_array().unwrap().len(), 1);
    }
}
