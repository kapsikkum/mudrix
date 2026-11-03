//! Updates from the release channel of the running version (`-next` builds follow next): checked
//! every 10 minutes, downloaded in the background, installed when the user clicks the update button.

use std::{sync::Mutex, time::Duration};

use tauri::{AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Written by CI on every release tag (see docs/BUILDING.md)
const FEEDS: &str =
    "https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop";
const INTERVAL: Duration = Duration::from_secs(10 * 60);

#[derive(Default)]
pub struct Downloaded(Mutex<Option<(Update, Vec<u8>)>>);

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

async fn check(app: &AppHandle, feed: &Url) -> tauri_plugin_updater::Result<()> {
    if app.state::<Downloaded>().0.lock().unwrap().is_some() {
        return Ok(());
    }
    let updater = app
        .updater_builder()
        .endpoints(vec![feed.clone()])?
        .build()?;
    let Some(update) = updater.check().await? else {
        return Ok(());
    };
    let bytes = update.download(|_, _| {}, || {}).await?;
    *app.state::<Downloaded>().0.lock().unwrap() = Some((update, bytes));
    let _ = app.emit("update-downloaded", ());
    Ok(())
}

pub fn start(app: AppHandle) {
    if cfg!(debug_assertions) || !has_pubkey(&app) {
        return;
    }
    // Only the AppImage updates itself on Linux; the tarball and packages are updated by their package manager
    if cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_none() {
        return;
    }
    let next = app.package_info().version.pre.as_str().starts_with("next");
    let channel = if next { "next" } else { "stable" };
    let Ok(feed) = Url::parse(&format!("{FEEDS}/{channel}/latest.json")) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = check(&app, &feed).await {
                eprintln!("[update] {error}");
            }
            tokio::time::sleep(INTERVAL).await;
        }
    });
}

#[tauri::command]
pub fn update_ready(downloaded: State<'_, Downloaded>) -> bool {
    downloaded.0.lock().unwrap().is_some()
}

/// Installs the downloaded update and restarts (on Windows the installer restarts the app)
#[tauri::command]
pub fn install_update(app: AppHandle, downloaded: State<'_, Downloaded>) -> Result<(), String> {
    let Some((update, bytes)) = downloaded.0.lock().unwrap().take() else {
        return Err("no update".into());
    };
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart()
}
