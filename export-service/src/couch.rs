use std::collections::{HashMap, HashSet};

use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tracing::warn;

use crate::config::Config;
use crate::error::{ExportError, Result};
use crate::model::{
    AttributeValuePair, EncodedRecord, HydratedRecord, ProjectDocument, Revision, ViewResponse,
};
use crate::notebook::{
    filter_relationship_value, get_hrid_field_name_for_viewset, get_ids_by_field_name,
    relationship_field_multiple, relationship_field_names, relationship_record_ids,
};

#[derive(Clone)]
pub struct CouchClient {
    client: Client,
    base_url: String,
    username: String,
    password: String,
}

impl CouchClient {
    pub fn new(config: &Config) -> Self {
        Self {
            client: Client::new(),
            base_url: config.couchdb_url.clone(),
            username: config.couchdb_username.clone(),
            password: config.couchdb_password.clone(),
        }
    }

    pub async fn project(&self, project_id: &str) -> Result<ProjectDocument> {
        self.get_json(&format!("projects/{}", encode_path(project_id)))
            .await
    }

    pub async fn record_batch(
        &self,
        db_name: &str,
        bookmark: Option<&str>,
        limit: usize,
    ) -> Result<Vec<HydrationSeed>> {
        let url = format!(
            "{}/{}/_design/index/_view/recordRevisions",
            self.base_url,
            encode_path(db_name)
        );
        let mut request = self
            .client
            .get(url)
            .basic_auth(&self.username, Some(&self.password))
            .query(&[("include_docs", "true"), ("limit", &limit.to_string())]);
        let startkey;
        if let Some(bookmark) = bookmark {
            startkey = serde_json::to_string(bookmark)?;
            request = request.query(&[("startkey", &startkey)]);
        }

        let response: ViewResponse<Revision> = self.send_json_request(request).await?;
        Ok(response
            .rows
            .into_iter()
            .filter_map(|row| {
                let revision = row.doc?;
                let record_id = if revision.record_id.is_empty() {
                    row.id
                } else {
                    revision.record_id.clone()
                };
                Some(HydrationSeed {
                    record_id,
                    conflict: row
                        .value
                        .get("conflict")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    record_type: row
                        .value
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or(&revision.r#type)
                        .to_string(),
                    created: row
                        .value
                        .get("created")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    created_by: row
                        .value
                        .get("created_by")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    revision,
                })
            })
            .collect())
    }

    pub async fn hydrate_seed(
        &self,
        project_id: &str,
        db_name: &str,
        ui_spec: &crate::model::UiSpec,
        seed: HydrationSeed,
    ) -> Result<Option<HydratedRecord>> {
        if seed.revision.deleted {
            return Ok(None);
        }

        let avps = self
            .avps(db_name, seed.revision.avps.values().cloned().collect())
            .await?;
        let mut data = HashMap::new();
        let mut annotations = HashMap::new();
        let mut types = HashMap::new();

        for (field_name, avp_id) in &seed.revision.avps {
            if let Some(avp) = avps.get(avp_id) {
                let value = if let Some(refs) = &avp.faims_attachments {
                    serde_json::to_value(refs)?
                } else {
                    avp.data.clone()
                };
                data.insert(field_name.clone(), value);
                annotations.insert(field_name.clone(), avp.annotations.clone());
                types.insert(field_name.clone(), avp.r#type.clone());
            }
        }

        let hrid = resolve_hrid(ui_spec, &seed.revision, &data);
        Ok(Some(HydratedRecord {
            project_id: project_id.to_string(),
            record_id: seed.record_id,
            revision_id: seed.revision.id.clone(),
            created_by: seed.created_by,
            created: seed.created,
            updated_by: seed.revision.created_by.clone(),
            updated: seed.revision.created.clone(),
            deleted: seed.revision.deleted,
            hrid,
            relationship: seed.revision.relationship.clone(),
            data,
            annotations,
            types,
            conflicts: seed.conflict,
            record_type: seed.record_type,
        }))
    }

    pub async fn records(
        &self,
        project_id: &str,
        db_name: &str,
        ui_spec: &crate::model::UiSpec,
        view_id: Option<&str>,
    ) -> Result<Vec<HydratedRecord>> {
        let mut records = Vec::new();
        let mut bookmark: Option<String> = None;
        loop {
            let batch = self.record_batch(db_name, bookmark.as_deref(), 20).await?;
            if batch.is_empty() {
                break;
            }
            let last_id = batch.last().map(|seed| seed.record_id.clone());
            for seed in batch {
                if view_id.is_some_and(|view| seed.record_type != view) {
                    continue;
                }
                if let Some(record) = self
                    .hydrate_seed(project_id, db_name, ui_spec, seed)
                    .await?
                {
                    records.push(record);
                }
            }
            bookmark = last_id;
        }
        Ok(records)
    }

    pub async fn strip_deleted_related_refs(
        &self,
        db_name: &str,
        ui_spec: &crate::model::UiSpec,
        view_fields: &[crate::model::FieldSummary],
        data: &mut HashMap<String, Value>,
    ) -> Result<()> {
        let relationship_fields = relationship_field_names(view_fields, data);
        if relationship_fields.is_empty() {
            return Ok(());
        }

        let mut ids = HashSet::new();
        for field_name in &relationship_fields {
            if let Some(value) = data.get(field_name) {
                ids.extend(relationship_record_ids(value));
            }
        }

        let keep = self
            .related_record_keep_map(db_name, ids.into_iter().collect())
            .await?;
        for field_name in relationship_fields {
            if let Some(value) = data.get(&field_name).cloned() {
                let multiple = relationship_field_multiple(ui_spec, &field_name);
                data.insert(
                    field_name,
                    filter_relationship_value(&value, &keep, multiple),
                );
            }
        }
        Ok(())
    }

    pub async fn attachment_bytes(&self, db_name: &str, attachment_id: &str) -> Result<Vec<u8>> {
        let path = format!(
            "{}/{}/{}/{}",
            self.base_url,
            encode_path(db_name),
            encode_path(attachment_id),
            encode_path(attachment_id)
        );
        let response = self
            .client
            .get(path)
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(couch_status_error(response).await);
        }
        Ok(response.bytes().await?.to_vec())
    }

    async fn avps(
        &self,
        db_name: &str,
        keys: Vec<String>,
    ) -> Result<HashMap<String, AttributeValuePair>> {
        if keys.is_empty() {
            return Ok(HashMap::new());
        }
        let response: ViewResponse<AttributeValuePair> = self
            .post_json(
                &format!(
                    "{}/_design/index/_view/avp?include_docs=true",
                    encode_path(db_name)
                ),
                &json!({ "keys": keys }),
            )
            .await?;
        Ok(response
            .rows
            .into_iter()
            .filter_map(|row| row.doc.map(|doc| (doc.id.clone(), doc)))
            .collect())
    }

    async fn related_record_keep_map(
        &self,
        db_name: &str,
        record_ids: Vec<String>,
    ) -> Result<HashMap<String, bool>> {
        let mut result = HashMap::new();
        let mut head_by_record = HashMap::new();
        for record_id in record_ids {
            match self.get_record(db_name, &record_id).await {
                Ok(record) => {
                    if let Some(head) = pick_last_head(&record.heads) {
                        head_by_record.insert(record_id, head);
                    } else {
                        result.insert(record_id, false);
                    }
                }
                Err(error) => {
                    warn!(record_id, error = %error, "failed to load related record");
                    result.insert(record_id, false);
                }
            }
        }

        for (record_id, head_id) in head_by_record {
            let deleted = self
                .revision_deleted(db_name, &head_id)
                .await
                .unwrap_or(true);
            result.insert(record_id, !deleted);
        }
        Ok(result)
    }

    async fn get_record(&self, db_name: &str, record_id: &str) -> Result<EncodedRecord> {
        self.get_json(&format!(
            "{}/{}",
            encode_path(db_name),
            encode_path(record_id)
        ))
        .await
    }

    async fn revision_deleted(&self, db_name: &str, revision_id: &str) -> Result<bool> {
        let revision: Revision = self
            .get_json(&format!(
                "{}/{}",
                encode_path(db_name),
                encode_path(revision_id)
            ))
            .await?;
        Ok(revision.deleted)
    }

    async fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let request = self
            .client
            .get(format!("{}/{}", self.base_url, path))
            .basic_auth(&self.username, Some(&self.password));
        self.send_json_request(request).await
    }

    async fn post_json<T: DeserializeOwned>(&self, path: &str, body: &Value) -> Result<T> {
        let request = self
            .client
            .post(format!("{}/{}", self.base_url, path))
            .basic_auth(&self.username, Some(&self.password))
            .json(body);
        self.send_json_request(request).await
    }

    async fn send_json_request<T: DeserializeOwned>(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<T> {
        let response = request.send().await?;
        if !response.status().is_success() {
            return Err(couch_status_error(response).await);
        }
        Ok(response.json::<T>().await?)
    }
}

#[derive(Debug, Clone)]
pub struct HydrationSeed {
    pub record_id: String,
    pub conflict: bool,
    pub record_type: String,
    pub created: String,
    pub created_by: String,
    pub revision: Revision,
}

fn resolve_hrid(
    ui_spec: &crate::model::UiSpec,
    revision: &Revision,
    data: &HashMap<String, Value>,
) -> Option<String> {
    for candidate in revision.avps.keys() {
        if let Ok((viewset_id, _)) = get_ids_by_field_name(ui_spec, candidate) {
            if let Some(hrid_field) = get_hrid_field_name_for_viewset(ui_spec, &viewset_id) {
                if let Some(value) = data.get(&hrid_field).and_then(Value::as_str) {
                    return Some(value.to_string());
                }
            }
        }
    }
    for candidate in revision.avps.keys() {
        if candidate.starts_with("hrid") {
            if let Some(value) = data.get(candidate).and_then(Value::as_str) {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn pick_last_head(heads: &[String]) -> Option<String> {
    let mut heads = heads.to_vec();
    heads.sort();
    heads.pop()
}

async fn couch_status_error(response: reqwest::Response) -> ExportError {
    let status = response.status();
    let message = response.text().await.unwrap_or_else(|_| {
        status
            .canonical_reason()
            .unwrap_or("CouchDB error")
            .to_string()
    });
    ExportError::CouchStatus { status, message }
}

fn encode_path(value: &str) -> String {
    value
        .split('/')
        .map(|part| percent_encode(part))
        .collect::<Vec<_>>()
        .join("/")
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

#[allow(dead_code)]
fn _status_to_bool(status: StatusCode) -> bool {
    status.is_success()
}
