use std::env;
use std::net::SocketAddr;

use crate::error::{ExportError, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub couchdb_url: String,
    pub couchdb_username: String,
    pub couchdb_password: String,
    pub shared_secret: Option<String>,
    pub chunk_bytes: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let bind_addr = env::var("EXPORT_SERVICE_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:50051".to_string())
            .parse()
            .map_err(|err| {
                ExportError::Config(format!("Invalid EXPORT_SERVICE_BIND_ADDR: {err}"))
            })?;

        let couchdb_url = trim_trailing_slash(
            env::var("COUCHDB_INTERNAL_URL")
                .unwrap_or_else(|_| "http://localhost:5984".to_string()),
        );

        let couchdb_username = env::var("COUCHDB_USER").unwrap_or_else(|_| "admin".to_string());
        let couchdb_password =
            env::var("COUCHDB_PASSWORD").unwrap_or_else(|_| "password".to_string());
        let shared_secret = env::var("EXPORT_SERVICE_SHARED_SECRET")
            .ok()
            .filter(|value| !value.is_empty());
        let chunk_bytes = env::var("EXPORT_CHUNK_BYTES")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(64 * 1024);

        Ok(Self {
            bind_addr,
            couchdb_url,
            couchdb_username,
            couchdb_password,
            shared_secret,
            chunk_bytes,
        })
    }
}

fn trim_trailing_slash(mut value: String) -> String {
    while value.ends_with('/') {
        value.pop();
    }
    value
}

#[cfg(test)]
mod tests {
    use super::trim_trailing_slash;

    #[test]
    fn trims_repeated_trailing_slashes() {
        assert_eq!(
            trim_trailing_slash("http://localhost:5984///".into()),
            "http://localhost:5984"
        );
    }
}
