use serde::{Deserialize, Serialize};

/// Everything needed to restore a signed-in client. Apps store it securely and hand it back to
/// [`crate::WizardClient::restore`] on the next start.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub homeserver_url: String,
    pub user_id: String,
    pub device_id: String,
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub refresh_token: Option<String>,
    /// Set for next-generation (OAuth) sign-ins; needed to refresh tokens
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub oauth_client_id: Option<String>,
}

/// Where the client keeps its state, crypto keys and caches.
///
/// `location` is an IndexedDB database name on the web and a directory path on native platforms.
/// The passphrase encrypts the stores at rest and must stay the same for a given location.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typegen", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct StoreConfig {
    pub location: String,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub passphrase: Option<String>,
    /// Don't share keys with, or read messages from, devices their owner hasn't verified
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub exclude_insecure_devices: bool,
    #[serde(default)]
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub manual_encryption_setup: bool,
    /// Which process this client is, for the store locks two processes share (the SDK's
    /// cross-process lock holder name). Omitted, the SDK's own name (`main`) is used, so the app
    /// itself keeps the current behaviour.
    ///
    /// A second process that restores the same store while the app runs — the iOS
    /// `NotificationService` extension — must pass a different, stable name, e.g.
    /// `notification-service`, so the SDK's locks actually keep the two processes apart. Never
    /// give two concurrently running processes the same name: they would both think they hold
    /// the lock. The value must not be `notifications`, which the SDK's notification client uses
    /// for its own store access.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "typegen", specta(optional))]
    pub process_name: Option<String>,
}
