//! Room key files (Element's "Export E2E room keys"), by file path. matrix-rust-sdk only reads
//! and writes these from a path and has no wasm version, so the browser gets `unsupported`.

use serde::Serialize;

use crate::{Error, Result, WizardClient};

/// What an import found
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct KeyImportResult {
    /// Keys that were new or better than the ones this device had
    pub imported: u32,
    /// Keys the file holds
    pub total: u32,
}

#[cfg(not(target_arch = "wasm32"))]
impl WizardClient {
    /// Writes every room key this device has to `path`, encrypted with `passphrase`.
    pub async fn export_room_keys(&self, path: &str, passphrase: &str) -> Result<()> {
        if passphrase.is_empty() {
            return Err(Error::Unsupported("the key file needs a passphrase".into()));
        }
        self.sdk()
            .encryption()
            .export_room_keys(path.into(), passphrase, |_| true)
            .await
            .map_err(|e| Error::Sdk(e.to_string()))
    }

    /// Reads the room keys of a file made by `exportRoomKeys` (or Element) and adds them;
    /// messages they unlock decrypt by themselves.
    pub async fn import_room_keys(&self, path: &str, passphrase: &str) -> Result<KeyImportResult> {
        use matrix_sdk::encryption::RoomKeyImportError;
        let result = self
            .sdk()
            .encryption()
            .import_room_keys(path.into(), passphrase)
            .await
            .map_err(|e| match e {
                RoomKeyImportError::Export(_) => Error::WrongRecoveryKey,
                other => Error::Sdk(other.to_string()),
            })?;
        Ok(KeyImportResult {
            imported: result.imported_count as u32,
            total: result.total_count as u32,
        })
    }
}

#[cfg(target_arch = "wasm32")]
impl WizardClient {
    pub async fn export_room_keys(&self, _path: &str, _passphrase: &str) -> Result<()> {
        Err(unsupported())
    }

    pub async fn import_room_keys(
        &self,
        _path: &str,
        _passphrase: &str,
    ) -> Result<KeyImportResult> {
        Err(unsupported())
    }
}

#[cfg(target_arch = "wasm32")]
fn unsupported() -> Error {
    Error::Unsupported("key files can't be read or written in the browser".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn results_serialise_in_camel_case() {
        let json = serde_json::to_value(KeyImportResult {
            imported: 2,
            total: 5,
        })
        .unwrap();
        assert_eq!(json, serde_json::json!({ "imported": 2, "total": 5 }));
    }
}
