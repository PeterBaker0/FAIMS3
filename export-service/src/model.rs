#![allow(dead_code)]

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectDocument {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "dataDb", alias = "data_db")]
    pub data_db: ConnectionInfo,
    #[serde(rename = "uiSpecification")]
    pub ui_specification: ProjectUiSpecification,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectionInfo {
    #[serde(rename = "db_name")]
    pub db_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectUiSpecification {
    #[serde(rename = "uiSpec")]
    pub ui_spec: UiSpec,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UiSpec {
    #[serde(default)]
    pub fields: HashMap<String, FieldDefinition>,
    #[serde(default)]
    pub views: HashMap<String, ViewDefinition>,
    #[serde(default)]
    pub viewsets: HashMap<String, ViewsetDefinition>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FieldDefinition {
    #[serde(rename = "component-namespace", default)]
    pub component_namespace: String,
    #[serde(rename = "component-name", default)]
    pub component_name: String,
    #[serde(rename = "type-returned", default)]
    pub type_returned: String,
    #[serde(default)]
    pub meta: Option<FieldMeta>,
    #[serde(rename = "component-parameters", default)]
    pub component_parameters: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FieldMeta {
    #[serde(default)]
    pub annotation: Option<MetaFlag>,
    #[serde(default)]
    pub uncertainty: Option<MetaFlag>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetaFlag {
    #[serde(default)]
    pub include: bool,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ViewDefinition {
    #[serde(default)]
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ViewsetDefinition {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub views: Vec<String>,
    #[serde(rename = "hridField", default)]
    pub hrid_field: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldSummary {
    pub name: String,
    pub field_type: String,
    pub component_namespace: String,
    pub component_name: String,
    pub annotation: String,
    pub uncertainty: String,
    pub view_id: String,
    pub viewset_id: String,
    pub is_spatial: bool,
}

impl FieldSummary {
    pub fn component_key(&self) -> String {
        if self.component_namespace.is_empty() {
            self.component_name.clone()
        } else {
            format!("{}::{}", self.component_namespace, self.component_name)
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ViewRow<T> {
    pub id: String,
    #[serde(default)]
    pub doc: Option<T>,
    #[serde(default)]
    pub value: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ViewResponse<T> {
    #[serde(default)]
    pub rows: Vec<ViewRow<T>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EncodedRecord {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(default)]
    pub heads: Vec<String>,
    #[serde(default)]
    pub created: String,
    #[serde(rename = "created_by", default)]
    pub created_by: String,
    #[serde(default)]
    pub r#type: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Revision {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(default)]
    pub avps: HashMap<String, String>,
    #[serde(rename = "record_id", default)]
    pub record_id: String,
    #[serde(default)]
    pub parents: Vec<String>,
    #[serde(default)]
    pub created: String,
    #[serde(rename = "created_by", default)]
    pub created_by: String,
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub relationship: Option<Value>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AttributeValuePair {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub annotations: Annotations,
    #[serde(rename = "faims_attachments", default)]
    pub faims_attachments: Option<Vec<AttachmentReference>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AttachmentReference {
    pub attachment_id: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub file_type: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Annotations {
    #[serde(default)]
    pub annotation: String,
    #[serde(default)]
    pub uncertainty: bool,
}

#[derive(Debug, Clone)]
pub struct HydratedRecord {
    pub project_id: String,
    pub record_id: String,
    pub revision_id: String,
    pub created_by: String,
    pub created: String,
    pub updated_by: String,
    pub updated: String,
    pub deleted: bool,
    pub hrid: Option<String>,
    pub relationship: Option<Value>,
    pub data: HashMap<String, Value>,
    pub annotations: HashMap<String, Annotations>,
    pub types: HashMap<String, String>,
    pub conflicts: bool,
    pub record_type: String,
}
