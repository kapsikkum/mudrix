//! Updates from Mudrix' GitHub releases: checked
//! every 10 minutes, downloaded in the background, installed when the user clicks the update button.
//! The Linux tarball and Arch package can't install updates, so there the button opens the release.

use std::{sync::Mutex, time::Duration};

use tauri::{utils::config::BundleType, AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

/// The feed Mudrix publishes with every release (`latest.json`, signed with the minisign key whose
/// public half is `plugins.updater.pubkey`). GitHub's "latest" is the newest release that is not a
/// pre-release, so `-next` builds follow it too until pre-releases get a feed of their own.
const FEED: &str = "https://github.com/kapsikkum/mudrix/releases/latest/download/latest.json";
/// Feed of the pre-release channel: the release tagged `next`, whose assets CI replaces on every `-next` build.
const NEXT_FEED: &str = "https://github.com/kapsikkum/mudrix/releases/download/next/latest.json";
const RELEASES: &str = "https://github.com/kapsikkum/mudrix/releases";
const INTERVAL: Duration = Duration::from_secs(10 * 60);

pub enum Pending {
    Install(Box<Update>, Vec<u8>),
    Download(String),
}

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Pending>>);

/// Releases are signed: without the public key in `plugins.updater.pubkey` nothing can be verified
fn has_pubkey(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .is_some_and(|key| !key.trim().is_empty())
}

/// CI marks the AppImage, deb and rpm binaries; the tarball and Arch package are left unmarked
fn can_install() -> bool {
    if !cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some() {
        return true;
    }
    matches!(
        tauri::utils::platform::bundle_type(),
        Some(BundleType::AppImage | BundleType::Deb | BundleType::Rpm)
    )
}

/// What a check found
#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum CheckOutcome {
    UpToDate,
    /// A newer version was found and is now downloaded (or, where updates can't install, linked)
    Available {
        version: String,
    },
    /// An update was already waiting from an earlier check
    Ready,
}

async fn check(
    app: &AppHandle,
    feed: &Url,
    install: bool,
) -> tauri_plugin_updater::Result<CheckOutcome> {
    if app.state::<PendingUpdate>().0.lock().unwrap().is_some() {
        return Ok(CheckOutcome::Ready);
    }
    let updater = app
        .updater_builder()
        .endpoints(vec![feed.clone()])?
        .build()?;
    let Some(update) = updater.check().await? else {
        return Ok(CheckOutcome::UpToDate);
    };
    let version = update.version.clone();
    let pending = if install {
        let bytes = update.download(|_, _| {}, || {}).await?;
        Pending::Install(Box::new(update), bytes)
    } else {
        Pending::Download(format!("{RELEASES}/tag/v{}", update.version))
    };
    *app.state::<PendingUpdate>().0.lock().unwrap() = Some(pending);
    let _ = app.emit("update-downloaded", ());
    Ok(CheckOutcome::Available { version })
}

/// The feed to ask: the stable one, or with pre-releases the `next` channel (which carries newer `-next` builds)
fn feed_url(include_prereleases: bool) -> Option<Url> {
    Url::parse(if include_prereleases { NEXT_FEED } else { FEED }).ok()
}

/// "Check for updates" in About: asks now instead of waiting for the next poll
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    include_prereleases: bool,
) -> Result<CheckOutcome, String> {
    if cfg!(debug_assertions) || !has_pubkey(&app) {
        return Err("updates are not available in this build".into());
    }
    let feed = feed_url(include_prereleases).ok_or("bad feed")?;
    check(&app, &feed, can_install())
        .await
        .map_err(|e| e.to_string())
}

pub fn start(app: AppHandle) {
    if cfg!(debug_assertions) || !has_pubkey(&app) {
        return;
    }
    let Ok(feed) = Url::parse(FEED) else {
        return;
    };
    let install = can_install();
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = check(&app, &feed, install).await {
                eprintln!("[update] {error}");
            }
            tokio::time::sleep(INTERVAL).await;
        }
    });
}

#[tauri::command]
pub fn update_ready(pending: State<'_, PendingUpdate>) -> bool {
    pending.0.lock().unwrap().is_some()
}

/// Installs the downloaded update and restarts (on Windows the installer restarts the app; deb and
/// rpm ask for the password), or opens the release page where it can't install
#[tauri::command]
pub fn install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let mut pending = pending.0.lock().unwrap();
    match pending.take() {
        Some(Pending::Install(update, bytes)) => {
            update.install(bytes).map_err(|e| e.to_string())?;
            app.restart()
        }
        Some(Pending::Download(url)) => {
            let opened = app.opener().open_url(&url, None::<&str>);
            *pending = Some(Pending::Download(url));
            opened.map_err(|e| e.to_string())
        }
        None => Err("no update".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_and_next_feeds_differ() {
        assert_eq!(feed_url(false).unwrap().as_str(), FEED);
        assert_eq!(feed_url(true).unwrap().as_str(), NEXT_FEED);
    }

    #[test]
    fn outcomes_serialise_with_a_status() {
        let json = |o: CheckOutcome| serde_json::to_string(&o).unwrap();
        assert_eq!(json(CheckOutcome::UpToDate), r#"{"status":"upToDate"}"#);
        assert_eq!(json(CheckOutcome::Ready), r#"{"status":"ready"}"#);
        assert_eq!(
            json(CheckOutcome::Available {
                version: "1.2.3".into()
            }),
            r#"{"status":"available","version":"1.2.3"}"#
        );
    }
}
