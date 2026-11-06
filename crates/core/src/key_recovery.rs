//! Getting messages that couldn't be decrypted readable again: trying them once more and
//! restoring the room keys from the account's key backup

use std::collections::BTreeSet;

use futures_util::{FutureExt, StreamExt};
use matrix_sdk::event_cache::DecryptionRetryRequest;
use serde::Serialize;
use serde_json::Value;

use crate::{Error, Result, WizardClient};

/// How far restoring the room keys from the key backup has come
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct KeyRestoreProgress {
    /// Encrypted rooms whose keys have been fetched
    pub rooms_done: u32,
    /// Encrypted rooms the keys are fetched for
    pub rooms_total: u32,
    /// Keys this device didn't have and now has
    pub keys_restored: u32,
}

/// The Megolm session an encrypted event was sent with, from the event's JSON.
fn session_id_of(event: &Value) -> Option<String> {
    event
        .pointer("/content/session_id")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

impl WizardClient {
    /// Fetches the room's keys from the key backup when this device can read it, then makes
    /// the messages that couldn't be decrypted try again. Messages that decrypt show up in the
    /// room's timelines by themselves.
    pub async fn retry_decryption(&self, room_id: &str) -> Result<()> {
        let room = self.room(room_id)?;
        let backups = self.sdk().encryption().backups();
        if backups.are_enabled().await {
            if let Err(error) = backups.download_room_keys_for_room(room.room_id()).await {
                tracing::warn!("couldn't fetch the room's keys from the key backup: {error}");
            }
        }
        let (cache, _handles) = room
            .event_cache()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let events = cache
            .events()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))?;
        let session_ids: BTreeSet<String> = events
            .iter()
            .filter(|event| event.kind.is_utd())
            .filter_map(|event| event.raw().deserialize_as_unchecked::<Value>().ok())
            .filter_map(|event| session_id_of(&event))
            .collect();
        if !session_ids.is_empty() {
            self.sdk()
                .event_cache()
                .request_decryption(DecryptionRetryRequest {
                    room_id: room.room_id().to_owned(),
                    utd_session_ids: session_ids,
                    refresh_info_session_ids: BTreeSet::new(),
                });
        }
        Ok(())
    }

    /// Downloads the room keys of every encrypted room from the key backup, which needs the
    /// backup's key on this device (from the recovery key or from verifying this session; the
    /// error `noKeyBackup` says it isn't there). `on_progress` is called after each room.
    pub async fn restore_key_backup(
        &self,
        on_progress: impl Fn(KeyRestoreProgress),
    ) -> Result<KeyRestoreProgress> {
        let backups = self.sdk().encryption().backups();
        if !backups.are_enabled().await {
            return Err(Error::NoKeyBackup);
        }
        let rooms: Vec<_> = self
            .sdk()
            .joined_rooms()
            .into_iter()
            .filter(|room| room.encryption_state().is_encrypted())
            .collect();
        let mut keys = self
            .sdk()
            .encryption()
            .room_keys_received_stream()
            .await
            .map(Box::pin);
        let mut progress = KeyRestoreProgress {
            rooms_total: rooms.len().try_into().unwrap_or(u32::MAX),
            ..Default::default()
        };
        on_progress(progress);
        for room in rooms {
            if let Err(error) = backups.download_room_keys_for_room(room.room_id()).await {
                tracing::warn!(room = %room.room_id(), "couldn't restore a room's keys: {error}");
            }
            progress.rooms_done += 1;
            // One batch arrives per room; draining now keeps the stream from lagging
            if let Some(stream) = keys.as_mut() {
                while let Some(Some(batch)) = stream.next().now_or_never() {
                    if let Ok(batch) = batch {
                        progress.keys_restored += u32::try_from(batch.len()).unwrap_or(u32::MAX);
                    }
                }
            }
            on_progress(progress);
        }
        Ok(progress)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn reads_the_session_of_an_encrypted_event() {
        let event = json!({
            "type": "m.room.encrypted",
            "content": { "algorithm": "m.megolm.v1.aes-sha2", "session_id": "abc", "ciphertext": "x" },
        });
        assert_eq!(session_id_of(&event).as_deref(), Some("abc"));
    }

    #[test]
    fn no_session_without_one() {
        assert_eq!(session_id_of(&json!({ "type": "m.room.encrypted" })), None);
        assert_eq!(
            session_id_of(&json!({ "content": { "session_id": 5 } })),
            None
        );
    }
}
