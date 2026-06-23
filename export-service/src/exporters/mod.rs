use std::io::{Cursor, Write};

use serde_json::{json, Value};
use tokio::sync::mpsc;
use tonic::Status;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::config::Config;
use crate::couch::CouchClient;
use crate::error::{ExportError, Result};
use crate::format::csv::{
    data_for_output, headers_for_fields, record_prefix, safe_csv_filename, CSV_PREFIX_HEADERS,
};
use crate::format::filenames::generate_attachment_filename;
use crate::format::spatial::{geojson_feature, kml_document, spatial_features};
use crate::model::{FieldSummary, HydratedRecord};
use crate::notebook::{
    build_viewset_field_summaries, get_notebook_field_types, project_has_spatial_fields,
};
use crate::proto::export::v1::{ExportFormat, ExportRequest, FileChunk};

pub type ChunkResult = std::result::Result<FileChunk, Status>;

pub async fn run_export(
    config: Config,
    request: ExportRequest,
    tx: mpsc::Sender<ChunkResult>,
) -> Result<()> {
    let couch = CouchClient::new(&config);
    let format = ExportFormat::try_from(request.format)
        .map_err(|_| ExportError::InvalidRequest("Invalid export format".to_string()))?;

    let bytes = match format {
        ExportFormat::Csv => export_csv(&couch, &request).await?,
        ExportFormat::Zip => export_attachments_zip(&couch, &request).await?,
        ExportFormat::Geojson => export_geojson(&couch, &request).await?,
        ExportFormat::Kml => export_kml(&couch, &request).await?,
        ExportFormat::Full => export_full_zip(&couch, &request).await?,
        ExportFormat::JsonRecords => export_json_records(&couch, &request).await?,
        ExportFormat::Unspecified => {
            return Err(ExportError::InvalidRequest(
                "format is required".to_string(),
            ));
        }
    };

    send_bytes(bytes, config.chunk_bytes, tx).await
}

async fn export_csv(couch: &CouchClient, request: &ExportRequest) -> Result<Vec<u8>> {
    let project = couch.project(&request.project_id).await?;
    let ui_spec = project.ui_specification.ui_spec;
    let view_id = request
        .view_id
        .as_deref()
        .ok_or_else(|| ExportError::InvalidRequest("view_id is required for CSV export".into()))?;
    let fields = get_notebook_field_types(&ui_spec, view_id)?;
    let mut records = couch
        .records(
            &request.project_id,
            &project.data_db.db_name,
            &ui_spec,
            Some(view_id),
        )
        .await?;
    for record in &mut records {
        couch
            .strip_deleted_related_refs(
                &project.data_db.db_name,
                &ui_spec,
                &fields,
                &mut record.data,
            )
            .await?;
    }
    csv_bytes(&records, &fields, view_id)
}

async fn export_geojson(couch: &CouchClient, request: &ExportRequest) -> Result<Vec<u8>> {
    let project = couch.project(&request.project_id).await?;
    let ui_spec = project.ui_specification.ui_spec;
    let view_fields = build_viewset_field_summaries(&ui_spec)?;
    if !project_has_spatial_fields(&view_fields) {
        return Ok(Vec::new());
    }
    let mut records = couch
        .records(
            &request.project_id,
            &project.data_db.db_name,
            &ui_spec,
            None,
        )
        .await?;
    let mut features = Vec::new();
    for record in &mut records {
        if let Some(fields) = view_fields.get(&record.record_type) {
            couch
                .strip_deleted_related_refs(
                    &project.data_db.db_name,
                    &ui_spec,
                    fields,
                    &mut record.data,
                )
                .await?;
            features.extend(
                spatial_features(record, fields)
                    .into_iter()
                    .map(|feature| geojson_feature(&feature)),
            );
        }
    }
    Ok(serde_json::to_vec(&json!({
        "type": "FeatureCollection",
        "features": features,
    }))?)
}

async fn export_kml(couch: &CouchClient, request: &ExportRequest) -> Result<Vec<u8>> {
    let project = couch.project(&request.project_id).await?;
    let ui_spec = project.ui_specification.ui_spec;
    let view_fields = build_viewset_field_summaries(&ui_spec)?;
    if !project_has_spatial_fields(&view_fields) {
        return Ok(Vec::new());
    }
    let mut records = couch
        .records(
            &request.project_id,
            &project.data_db.db_name,
            &ui_spec,
            None,
        )
        .await?;
    let mut features = Vec::new();
    for record in &mut records {
        if let Some(fields) = view_fields.get(&record.record_type) {
            couch
                .strip_deleted_related_refs(
                    &project.data_db.db_name,
                    &ui_spec,
                    fields,
                    &mut record.data,
                )
                .await?;
            features.extend(spatial_features(record, fields));
        }
    }
    Ok(kml_document(&features).into_bytes())
}

async fn export_json_records(couch: &CouchClient, request: &ExportRequest) -> Result<Vec<u8>> {
    let project = couch.project(&request.project_id).await?;
    let ui_spec = project.ui_specification.ui_spec;
    let view_fields = build_viewset_field_summaries(&ui_spec)?;
    let mut records = couch
        .records(
            &request.project_id,
            &project.data_db.db_name,
            &ui_spec,
            None,
        )
        .await?;
    let mut filenames = Vec::new();
    let mut output = Vec::new();
    for record in &mut records {
        if let Some(fields) = view_fields.get(&record.record_type) {
            couch
                .strip_deleted_related_refs(
                    &project.data_db.db_name,
                    &ui_spec,
                    fields,
                    &mut record.data,
                )
                .await?;
            replace_attachment_values(record, &mut filenames);
        }
        output.push(record_to_json(record));
    }
    Ok(serde_json::to_vec(&json!({ "records": output }))?)
}

async fn export_attachments_zip(couch: &CouchClient, request: &ExportRequest) -> Result<Vec<u8>> {
    let project = couch.project(&request.project_id).await?;
    let ui_spec = project.ui_specification.ui_spec;
    let records = couch
        .records(
            &request.project_id,
            &project.data_db.db_name,
            &ui_spec,
            request.view_id.as_deref(),
        )
        .await?;
    let mut zip = ZipArchiveBuilder::new();
    add_attachments_to_zip(couch, &project.data_db.db_name, &records, "", &mut zip).await?;
    zip.finish()
}

async fn export_full_zip(couch: &CouchClient, request: &ExportRequest) -> Result<Vec<u8>> {
    let project = couch.project(&request.project_id).await?;
    let ui_spec = project.ui_specification.ui_spec;
    let config = request.full_config.clone().unwrap_or_default();
    let include_tabular = config.include_tabular;
    let include_attachments = config.include_attachments;
    let include_geojson = config.include_geojson;
    let include_kml = config.include_kml;
    let include_metadata = config.include_metadata;

    let view_fields = build_viewset_field_summaries(&ui_spec)?;
    let mut records = couch
        .records(
            &request.project_id,
            &project.data_db.db_name,
            &ui_spec,
            None,
        )
        .await?;
    for record in &mut records {
        if let Some(fields) = view_fields.get(&record.record_type) {
            couch
                .strip_deleted_related_refs(
                    &project.data_db.db_name,
                    &ui_spec,
                    fields,
                    &mut record.data,
                )
                .await?;
        }
    }

    let mut zip = ZipArchiveBuilder::new();
    let mut included_files = Vec::new();
    let mut warnings = Vec::new();

    if include_tabular {
        for (view_id, fields) in &view_fields {
            let label = ui_spec
                .viewsets
                .get(view_id)
                .and_then(|viewset| viewset.label.clone())
                .unwrap_or_else(|| view_id.clone());
            let view_records: Vec<HydratedRecord> = records
                .iter()
                .filter(|record| &record.record_type == view_id)
                .cloned()
                .collect();
            let filename = format!("records/{}.csv", safe_csv_filename(&label));
            zip.add_file(&filename, csv_bytes(&view_records, fields, view_id)?)?;
            included_files.push(filename);
        }
    }

    let mut attachment_count = 0usize;
    if include_attachments {
        attachment_count = add_attachments_to_zip(
            couch,
            &project.data_db.db_name,
            &records,
            "attachments/",
            &mut zip,
        )
        .await?;
        if attachment_count > 0 {
            included_files.push("attachments/".to_string());
        }
    }

    let has_spatial = project_has_spatial_fields(&view_fields);
    let mut spatial_feature_count = 0usize;
    if (include_geojson || include_kml) && !has_spatial {
        if include_geojson {
            warnings
                .push("No spatial fields found in project - GeoJSON export skipped".to_string());
        }
        if include_kml {
            warnings.push("No spatial fields found in project - KML export skipped".to_string());
        }
    } else if include_geojson || include_kml {
        let mut spatial = Vec::new();
        for record in &records {
            if let Some(fields) = view_fields.get(&record.record_type) {
                spatial.extend(spatial_features(record, fields));
            }
        }
        spatial_feature_count = spatial.len();
        if include_geojson && spatial_feature_count > 0 {
            let features: Vec<Value> = spatial.iter().map(geojson_feature).collect();
            let filename = "spatial/export.geojson";
            zip.add_file(
                filename,
                serde_json::to_vec(&json!({"type": "FeatureCollection", "features": features}))?,
            )?;
            included_files.push(filename.to_string());
        }
        if include_kml && spatial_feature_count > 0 {
            let filename = "spatial/export.kml";
            zip.add_file(filename, kml_document(&spatial).into_bytes())?;
            included_files.push(filename.to_string());
        }
    }

    if include_metadata {
        let metadata = json!({
            "@context": "https://w3id.org/ro/crate/1.1/context",
            "@graph": [
                {
                    "@id": "ro-crate-metadata.json",
                    "@type": "CreativeWork",
                    "conformsTo": {"@id": "https://w3id.org/ro/crate/1.1"},
                    "about": {"@id": "./"}
                },
                {
                    "@id": "./",
                    "@type": "Dataset",
                    "name": format!("Export of Project {}", request.project_id),
                    "datePublished": chrono::Utc::now().to_rfc3339(),
                    "author": {"@id": "#author"},
                    "hasPart": included_files.iter().map(|path| json!({"@id": path})).collect::<Vec<_>>(),
                    "spatialFeatures": spatial_feature_count,
                    "recordCount": records.len(),
                    "attachmentCount": attachment_count,
                    "warnings": warnings
                },
                {
                    "@id": "#author",
                    "@type": "Person",
                    "name": request.user_id
                }
            ]
        });
        zip.add_file(
            "ro-crate-metadata.json",
            serde_json::to_vec_pretty(&metadata)?,
        )?;
    }

    zip.finish()
}

fn csv_bytes(
    records: &[HydratedRecord],
    fields: &[FieldSummary],
    viewset_id: &str,
) -> Result<Vec<u8>> {
    let mut writer = csv::WriterBuilder::new().from_writer(Vec::new());
    let data_headers = headers_for_fields(fields);
    let mut headers: Vec<String> = CSV_PREFIX_HEADERS
        .iter()
        .map(|value| value.to_string())
        .collect();
    headers.extend(data_headers.clone());
    writer.write_record(&headers)?;

    let mut filenames = Vec::new();
    for record in records {
        let hrid = record
            .hrid
            .clone()
            .unwrap_or_else(|| record.record_id.clone());
        let mut row = record_prefix(record);
        let output = data_for_output(
            fields,
            &record.data,
            &record.annotations,
            &hrid,
            &mut filenames,
            viewset_id,
        );
        for header in &data_headers {
            row.push(output.get(header).cloned().unwrap_or_default());
        }
        writer.write_record(row)?;
    }
    writer
        .into_inner()
        .map_err(|error| ExportError::Io(error.into_error()))
}

async fn add_attachments_to_zip(
    couch: &CouchClient,
    db_name: &str,
    records: &[HydratedRecord],
    path_prefix: &str,
    zip: &mut ZipArchiveBuilder,
) -> Result<usize> {
    let mut filenames = Vec::new();
    let mut count = 0usize;
    for record in records {
        let hrid = record.hrid.as_deref().unwrap_or(&record.record_id);
        for (field_id, value) in &record.data {
            if record.types.get(field_id).map(String::as_str) != Some("faims-attachment::Files") {
                continue;
            }
            let Some(items) = value.as_array() else {
                continue;
            };
            for item in items {
                let Some(attachment_id) = item.get("attachment_id").and_then(Value::as_str) else {
                    continue;
                };
                let file_type = item.get("file_type").and_then(Value::as_str);
                let base = generate_attachment_filename(
                    file_type,
                    field_id,
                    hrid,
                    &record.record_type,
                    &filenames,
                );
                filenames.push(base.clone());
                let filename = format!("{path_prefix}{base}");
                let bytes = couch.attachment_bytes(db_name, attachment_id).await?;
                zip.add_file(&filename, bytes)?;
                count += 1;
            }
        }
    }
    Ok(count)
}

fn replace_attachment_values(record: &mut HydratedRecord, filenames: &mut Vec<String>) {
    let hrid = record
        .hrid
        .as_deref()
        .unwrap_or(&record.record_id)
        .to_string();
    for (field_id, value) in record.data.clone() {
        if record.types.get(&field_id).map(String::as_str) != Some("faims-attachment::Files") {
            continue;
        }
        let Some(items) = value.as_array() else {
            continue;
        };
        let names = items
            .iter()
            .filter_map(|item| {
                let file_type = item.get("file_type").and_then(Value::as_str);
                let attachment_id = item.get("attachment_id").and_then(Value::as_str)?;
                let name = generate_attachment_filename(
                    file_type,
                    &field_id,
                    &hrid,
                    &record.record_type,
                    filenames,
                );
                filenames.push(name.clone());
                Some(json!({
                    "attachment_id": attachment_id,
                    "filename": name,
                    "file_type": file_type.unwrap_or("")
                }))
            })
            .collect::<Vec<_>>();
        record.data.insert(field_id, Value::Array(names));
    }
}

fn record_to_json(record: &HydratedRecord) -> Value {
    json!({
        "project_id": record.project_id,
        "record_id": record.record_id,
        "revision_id": record.revision_id,
        "created_by": record.created_by,
        "updated": record.updated,
        "updated_by": record.updated_by,
        "deleted": record.deleted,
        "hrid": record.hrid,
        "relationship": record.relationship,
        "data": record.data,
        "annotations": record.annotations,
        "field_types": record.types,
        "created": record.created,
        "conflicts": record.conflicts,
        "type": record.record_type,
    })
}

struct ZipArchiveBuilder {
    writer: ZipWriter<Cursor<Vec<u8>>>,
}

impl ZipArchiveBuilder {
    fn new() -> Self {
        Self {
            writer: ZipWriter::new(Cursor::new(Vec::new())),
        }
    }

    fn add_file(&mut self, name: &str, bytes: Vec<u8>) -> Result<()> {
        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
        self.writer
            .start_file(name, options)
            .map_err(|error| ExportError::Zip(error.to_string()))?;
        self.writer.write_all(&bytes)?;
        Ok(())
    }

    fn finish(mut self) -> Result<Vec<u8>> {
        self.writer
            .finish()
            .map(|cursor| cursor.into_inner())
            .map_err(|error| ExportError::Zip(error.to_string()))
    }
}

async fn send_bytes(
    bytes: Vec<u8>,
    chunk_bytes: usize,
    tx: mpsc::Sender<ChunkResult>,
) -> Result<()> {
    if bytes.is_empty() {
        return Ok(());
    }
    for (sequence, chunk) in bytes.chunks(chunk_bytes).enumerate() {
        tx.send(Ok(FileChunk {
            data: chunk.to_vec(),
            sequence: sequence as u64,
            filename: String::new(),
            content_type: String::new(),
        }))
        .await
        .map_err(|_| ExportError::Cancelled)?;
    }
    Ok(())
}
