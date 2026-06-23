use tonic::Status;

pub type Result<T> = std::result::Result<T, ExportError>;

#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Invalid request: {0}")]
    InvalidRequest(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("CouchDB request failed: {0}")]
    Couch(#[from] reqwest::Error),
    #[error("CouchDB returned {status}: {message}")]
    CouchStatus {
        status: reqwest::StatusCode,
        message: String,
    },
    #[error("Serialization failed: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("CSV generation failed: {0}")]
    Csv(#[from] csv::Error),
    #[error("I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("ZIP generation failed: {0}")]
    Zip(String),
    #[error("Export stream was cancelled")]
    Cancelled,
    #[error("Internal export error: {0}")]
    Internal(String),
}

impl ExportError {
    pub fn into_status(self) -> Status {
        match self {
            Self::InvalidRequest(message) => Status::invalid_argument(message),
            Self::NotFound(message) => Status::not_found(message),
            Self::Couch(error) => {
                if error.is_connect() || error.is_timeout() {
                    Status::unavailable(error.to_string())
                } else {
                    Status::internal(error.to_string())
                }
            }
            Self::CouchStatus { status, message } => {
                if status == reqwest::StatusCode::NOT_FOUND {
                    Status::not_found(message)
                } else if status == reqwest::StatusCode::UNAUTHORIZED
                    || status == reqwest::StatusCode::FORBIDDEN
                {
                    Status::permission_denied(message)
                } else if status.is_server_error() {
                    Status::unavailable(message)
                } else {
                    Status::internal(message)
                }
            }
            Self::Cancelled => Status::cancelled("Export stream was cancelled"),
            other => Status::internal(other.to_string()),
        }
    }
}
