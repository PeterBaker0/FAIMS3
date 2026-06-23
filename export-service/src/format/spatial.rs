use serde_json::{json, Map, Value};

use crate::format::csv::data_for_output;
use crate::model::{FieldSummary, HydratedRecord};

#[derive(Debug, Clone)]
pub struct SpatialFeature {
    pub name: String,
    pub geometry: Value,
    pub properties: Map<String, Value>,
}

pub fn spatial_features(record: &HydratedRecord, fields: &[FieldSummary]) -> Vec<SpatialFeature> {
    let hrid = record
        .hrid
        .clone()
        .unwrap_or_else(|| record.record_id.clone());
    let mut filenames = Vec::new();
    let converted = data_for_output(
        fields,
        &record.data,
        &record.annotations,
        &hrid,
        &mut filenames,
        &record.record_type,
    );

    let mut base = Map::new();
    base.insert("hrid".to_string(), json!(hrid));
    base.insert("record_id".to_string(), json!(record.record_id));
    base.insert("revision_id".to_string(), json!(record.revision_id));
    base.insert("type".to_string(), json!(record.record_type));
    base.insert("created_by".to_string(), json!(record.created_by));
    base.insert("created_time".to_string(), json!(record.created));
    base.insert("updated_by".to_string(), json!(record.updated_by));
    base.insert("updated_time".to_string(), json!(record.updated));
    for (key, value) in converted {
        base.insert(key, json!(value));
    }

    let mut features = Vec::new();
    for field in fields {
        if !field.is_spatial {
            continue;
        }
        let Some(value) = record.data.get(&field.name) else {
            continue;
        };
        let Some(geometry) = extract_geometry(value) else {
            continue;
        };
        let mut properties = base.clone();
        properties.insert("geometry_source_view_id".to_string(), json!(field.view_id));
        properties.insert(
            "geometry_source_viewset_id".to_string(),
            json!(field.viewset_id),
        );
        properties.insert("geometry_source_field_id".to_string(), json!(field.name));
        properties.insert("geometry_source_type".to_string(), json!(field.field_type));
        features.push(SpatialFeature {
            name: hrid.clone(),
            geometry,
            properties,
        });
    }
    features
}

fn extract_geometry(value: &Value) -> Option<Value> {
    if value.get("type").and_then(Value::as_str) == Some("FeatureCollection") {
        return value
            .get("features")
            .and_then(Value::as_array)
            .and_then(|features| features.first())
            .and_then(|feature| feature.get("geometry"))
            .filter(|geometry| geometry.get("coordinates").is_some())
            .cloned();
    }
    if value.get("type").and_then(Value::as_str) == Some("Feature") {
        return value
            .get("geometry")
            .filter(|geometry| geometry.get("coordinates").is_some())
            .cloned();
    }
    None
}

pub fn geojson_feature(feature: &SpatialFeature) -> Value {
    json!({
        "type": "Feature",
        "geometry": feature.geometry,
        "properties": feature.properties,
    })
}

pub fn kml_document(features: &[SpatialFeature]) -> String {
    let mut output = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    output.push_str("<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document>");
    for feature in features {
        if let Some(geometry) = geometry_to_kml(&feature.geometry) {
            output.push_str("<Placemark>");
            output.push_str(&format!("<name>{}</name>", escape_xml(&feature.name)));
            output.push_str(&extended_data(&feature.properties));
            output.push_str(&geometry);
            output.push_str("</Placemark>");
        }
    }
    output.push_str("</Document></kml>");
    output
}

fn extended_data(properties: &Map<String, Value>) -> String {
    let mut output = String::from("<ExtendedData>");
    for (key, value) in properties {
        output.push_str(&format!(
            "<Data name=\"{}\"><value>{}</value></Data>",
            escape_xml(key),
            escape_xml(&value_to_kml_cell(value))
        ));
    }
    output.push_str("</ExtendedData>");
    output
}

fn value_to_kml_cell(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn geometry_to_kml(geometry: &Value) -> Option<String> {
    let geometry_type = geometry.get("type").and_then(Value::as_str)?;
    let coords = geometry.get("coordinates")?;
    Some(match geometry_type {
        "Point" => format!(
            "<Point><coordinates>{}</coordinates></Point>",
            format_coords(coords)
        ),
        "LineString" => format!(
            "<LineString><coordinates>{}</coordinates></LineString>",
            format_coords(coords)
        ),
        "Polygon" => format_polygon(coords.as_array()?),
        "MultiPoint" => format!(
            "<MultiGeometry>{}</MultiGeometry>",
            coords
                .as_array()?
                .iter()
                .map(|coord| format!(
                    "<Point><coordinates>{}</coordinates></Point>",
                    format_coords(coord)
                ))
                .collect::<String>()
        ),
        "MultiLineString" => format!(
            "<MultiGeometry>{}</MultiGeometry>",
            coords
                .as_array()?
                .iter()
                .map(|line| format!(
                    "<LineString><coordinates>{}</coordinates></LineString>",
                    format_coords(line)
                ))
                .collect::<String>()
        ),
        "MultiPolygon" => format!(
            "<MultiGeometry>{}</MultiGeometry>",
            coords
                .as_array()?
                .iter()
                .filter_map(|polygon| polygon.as_array().map(|coords| format_polygon(coords)))
                .collect::<String>()
        ),
        _ => return None,
    })
}

fn format_polygon(coords: &[Value]) -> String {
    let outer = coords
        .first()
        .map(|ring| {
            format!(
                "<outerBoundaryIs><LinearRing><coordinates>{}</coordinates></LinearRing></outerBoundaryIs>",
                format_coords(ring)
            )
        })
        .unwrap_or_default();
    let inner = coords
        .iter()
        .skip(1)
        .map(|ring| {
            format!(
                "<innerBoundaryIs><LinearRing><coordinates>{}</coordinates></LinearRing></innerBoundaryIs>",
                format_coords(ring)
            )
        })
        .collect::<String>();
    format!("<Polygon>{outer}{inner}</Polygon>")
}

fn format_coords(value: &Value) -> String {
    if let Some(items) = value.as_array() {
        if items.first().and_then(Value::as_f64).is_some() {
            let lon = items.first().map(number_to_string).unwrap_or_default();
            let lat = items.get(1).map(number_to_string).unwrap_or_default();
            let alt = items
                .get(2)
                .map(number_to_string)
                .unwrap_or_else(|| "0".to_string());
            format!("{lon},{lat},{alt}")
        } else {
            items
                .iter()
                .map(format_coords)
                .collect::<Vec<_>>()
                .join(" ")
        }
    } else {
        String::new()
    }
}

fn number_to_string(value: &Value) -> String {
    value
        .as_f64()
        .map(|number| {
            if number.fract() == 0.0 {
                format!("{}", number as i64)
            } else {
                number.to_string()
            }
        })
        .unwrap_or_default()
}

pub fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::escape_xml;

    #[test]
    fn escapes_xml() {
        assert_eq!(escape_xml("<x&y>"), "&lt;x&amp;y&gt;");
    }
}
