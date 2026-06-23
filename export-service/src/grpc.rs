use std::pin::Pin;

use tokio::sync::mpsc;
use tokio_stream::{wrappers::ReceiverStream, Stream};
use tonic::{Request, Response, Status};

use crate::config::Config;
use crate::exporters::run_export;
use crate::proto::export::v1::export_service_server::ExportService;
use crate::proto::export::v1::{
    ExportFormat, ExportRequest, FileChunk, HealthRequest, HealthResponse,
};

type ChunkResult = std::result::Result<FileChunk, Status>;
type ExportStream = Pin<Box<dyn Stream<Item = ChunkResult> + Send + 'static>>;

#[derive(Clone)]
pub struct ExportGrpcService {
    config: Config,
}

impl ExportGrpcService {
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    fn validate_secret<T>(&self, request: &Request<T>) -> std::result::Result<(), Status> {
        let Some(expected) = &self.config.shared_secret else {
            return Ok(());
        };

        let provided = request
            .metadata()
            .get("x-export-service-secret")
            .and_then(|value| value.to_str().ok());

        if provided == Some(expected.as_str()) {
            Ok(())
        } else {
            Err(Status::permission_denied("Invalid export service secret"))
        }
    }
}

#[tonic::async_trait]
impl ExportService for ExportGrpcService {
    type ExportStream = ExportStream;

    async fn export(
        &self,
        request: Request<ExportRequest>,
    ) -> std::result::Result<Response<Self::ExportStream>, Status> {
        self.validate_secret(&request)?;
        let request = request.into_inner();

        if request.project_id.trim().is_empty() {
            return Err(Status::invalid_argument("project_id is required"));
        }

        let format = ExportFormat::try_from(request.format)
            .map_err(|_| Status::invalid_argument("Invalid export format"))?;
        if format == ExportFormat::Unspecified {
            return Err(Status::invalid_argument("format is required"));
        }
        if format == ExportFormat::Csv && request.view_id.as_deref().unwrap_or("").is_empty() {
            return Err(Status::invalid_argument(
                "view_id is required for CSV export",
            ));
        }

        let (tx, rx) = mpsc::channel::<ChunkResult>(32);
        let config = self.config.clone();

        tokio::spawn(async move {
            let result = run_export(config, request, tx.clone()).await;
            if let Err(error) = result {
                let _ = tx.send(Err(error.into_status())).await;
            }
        });

        Ok(Response::new(
            Box::pin(ReceiverStream::new(rx)) as Self::ExportStream
        ))
    }

    async fn health(
        &self,
        request: Request<HealthRequest>,
    ) -> std::result::Result<Response<HealthResponse>, Status> {
        self.validate_secret(&request)?;
        Ok(Response::new(HealthResponse {
            status: "ok".to_string(),
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use tonic::Request;

    use super::*;

    fn test_service(secret: Option<&str>) -> ExportGrpcService {
        ExportGrpcService::new(Config {
            bind_addr: "127.0.0.1:0".parse::<SocketAddr>().unwrap(),
            couchdb_url: "http://localhost:5984".to_string(),
            couchdb_username: "admin".to_string(),
            couchdb_password: "password".to_string(),
            shared_secret: secret.map(str::to_string),
            chunk_bytes: 64 * 1024,
        })
    }

    #[tokio::test]
    async fn health_succeeds_without_secret() {
        let service = test_service(None);
        let response = service
            .health(Request::new(HealthRequest {}))
            .await
            .unwrap();
        assert_eq!(response.into_inner().status, "ok");
    }

    #[tokio::test]
    async fn health_rejects_bad_secret() {
        let service = test_service(Some("expected"));
        let status = service
            .health(Request::new(HealthRequest {}))
            .await
            .unwrap_err();
        assert_eq!(status.code(), tonic::Code::PermissionDenied);
    }
}
