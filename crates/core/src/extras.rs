//! Link previews, thread lists, account data types, key backup and own devices.

use std::time::Duration;

use matrix_sdk::{
    room::ListThreadsOptions,
    ruma::api::client::{
        authenticated_media::get_media_preview, threads::get_threads::v1::IncludeThreads,
    },
};
use serde::Serialize;
use serde_json::{json, Value};

use crate::{Error, Result, WizardClient};

/// What the homeserver found at a link (OpenGraph)
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UrlPreview {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub site_name: Option<String>,
    /// `mxc://`
    pub image_url: Option<String>,
    pub image_width: Option<u64>,
    pub image_height: Option<u64>,
}

/// A thread in a room's thread list
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ThreadInfo {
    pub root_event_id: String,
    pub sender: String,
    pub body: String,
    pub timestamp: u64,
    pub replies: u64,
    pub latest_sender: Option<String>,
    pub latest_body: Option<String>,
    pub latest_timestamp: Option<u64>,
    /// The user wrote in it or started it
    pub participated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ThreadPage {
    pub threads: Vec<ThreadInfo>,
    /// Pass back to load older threads
    pub next: Option<String>,
}

fn text(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

impl WizardClient {
    /// A preview of a link, if the server can make one.
    pub async fn url_preview(&self, url: &str) -> Result<Option<UrlPreview>> {
        let response = self
            .sdk()
            .send(get_media_preview::v1::Request::new(url.to_owned()))
            .await?;
        let Some(data) = response.data else {
            return Ok(None);
        };
        let og: Value = serde_json::from_str(data.get()).map_err(|e| Error::Sdk(e.to_string()))?;
        let preview = UrlPreview {
            url: url.to_owned(),
            title: text(&og, "/og:title"),
            description: text(&og, "/og:description"),
            site_name: text(&og, "/og:site_name"),
            image_url: text(&og, "/og:image").filter(|u| u.starts_with("mxc://")),
            image_width: og.get("og:image:width").and_then(Value::as_u64),
            image_height: og.get("og:image:height").and_then(Value::as_u64),
        };
        Ok((preview.title.is_some()
            || preview.description.is_some()
            || preview.image_url.is_some())
        .then_some(preview))
    }

    /// The room's threads, newest activity first; `mine` only those the user took part in.
    pub async fn threads(
        &self,
        room_id: &str,
        mine: bool,
        from: Option<&str>,
    ) -> Result<ThreadPage> {
        let room = self.room(room_id)?;
        let own = self.user_id().unwrap_or_default();
        let options = ListThreadsOptions {
            include_threads: if mine {
                IncludeThreads::Participated
            } else {
                IncludeThreads::All
            },
            from: from.map(ToOwned::to_owned),
            limit: Some(30u32.into()),
        };
        let page = room.list_threads(options).await?;
        let threads = page
            .chunk
            .iter()
            .filter_map(|event| {
                let root: Value = event.raw().deserialize_as_unchecked().ok()?;
                let summary = root.pointer("/unsigned/m.relations/m.thread");
                let latest = summary.and_then(|s| s.get("latest_event"));
                let sender = text(&root, "/sender")?;
                Some(ThreadInfo {
                    root_event_id: text(&root, "/event_id")?,
                    participated: sender == own
                        || summary
                            .and_then(|s| s.get("current_user_participated"))
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    sender,
                    body: text(&root, "/content/body").unwrap_or_default(),
                    timestamp: root
                        .get("origin_server_ts")
                        .and_then(Value::as_u64)
                        .unwrap_or_default(),
                    replies: summary
                        .and_then(|s| s.get("count"))
                        .and_then(Value::as_u64)
                        .unwrap_or_default(),
                    latest_sender: latest.and_then(|l| text(l, "/sender")),
                    latest_body: latest.and_then(|l| text(l, "/content/body")),
                    latest_timestamp: latest
                        .and_then(|l| l.get("origin_server_ts"))
                        .and_then(Value::as_u64),
                })
            })
            .collect();
        Ok(ThreadPage {
            threads,
            next: page.prev_batch_token,
        })
    }
}

impl WizardClient {
    /// Every global account data type the account has, read from the server
    pub async fn account_data_types(&self) -> Result<Vec<String>> {
        use matrix_sdk::ruma::{
            api::client::{
                filter::FilterDefinition,
                sync::sync_events::v3::{Filter, Request},
            },
            presence::PresenceState,
        };
        let filter: FilterDefinition = serde_json::from_value(json!({
            "room": { "rooms": [] },
            "presence": { "not_types": ["*"] },
        }))?;
        let mut request = Request::new();
        request.filter = Some(Filter::FilterDefinition(filter));
        request.set_presence = PresenceState::Offline;
        request.timeout = Some(Duration::ZERO);
        let response = self.sdk().send(request).await?;
        let mut types: Vec<String> = response
            .account_data
            .events
            .iter()
            .filter_map(|raw| raw.get_field::<String>("type").ok().flatten())
            .collect();
        types.sort();
        types.dedup();
        Ok(types)
    }

    /// Whether the server has a key backup (usable or not by this device)
    pub async fn key_backup_exists_on_server(&self) -> Result<bool> {
        self.sdk()
            .encryption()
            .backups()
            .fetch_exists_on_server()
            .await
            .map_err(|e| Error::Sdk(e.to_string()))
    }

    /// Calls `on_change` when the account's own devices change (added, removed or renamed).
    pub async fn watch_own_devices(&self, mut on_change: impl FnMut()) -> Result<()> {
        use futures_util::StreamExt;
        let own_user = self.sdk().user_id().ok_or(Error::NotSignedIn)?.to_owned();
        let mut updates = std::pin::pin!(self.sdk().encryption().devices_stream().await?);
        while let Some(update) = updates.next().await {
            // Removed devices come as an update with no new or changed devices
            let removal = update.new.is_empty() && update.changed.is_empty();
            if removal
                || update.new.contains_key(&own_user)
                || update.changed.contains_key(&own_user)
            {
                on_change();
            }
        }
        Ok(())
    }
}
