mod config;
mod couch;
mod error;
mod exporters;
mod format;
mod grpc;
mod model;
mod notebook;
mod proto;

use config::Config;
use error::Result;
use grpc::ExportGrpcService;
use proto::export::v1::export_service_server::ExportServiceServer;
use tonic::transport::Server;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "faims_export_service=info,tower_http=info".into()),
        )
        .init();

    let config = Config::from_env()?;
    info!(bind_addr = %config.bind_addr, "starting FAIMS export service");

    let service = ExportGrpcService::new(config.clone());

    Server::builder()
        .add_service(ExportServiceServer::new(service))
        .serve(config.bind_addr)
        .await
        .map_err(|err| crate::error::ExportError::Internal(err.to_string()))?;

    Ok(())
}
