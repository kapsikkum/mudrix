//! Updates from the release channel of the running version (`-next` builds follow next): checked
//! every 10 minutes, downloaded in the background, installed when the user clicks the update button.
//! The Linux tarball and Arch package can't install updates, so there the button opens the release.

use std::{sync::Mutex, time::Duration};

use tauri::{utils::config::BundleType, AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

/// Written by CI on every release tag (see docs/BUILDING.md)
const FEEDS: &str =
    "https://gitlab.com/api/v4/projects/wizardchat%2Fwizardchat/packages/generic/wizardchat-desktop";
const RELEASES: &str = "https://gitlab.com/wizardchat/wizardchat/-/releases";
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

async fn check(app: &AppHandle, feed: &Url, install: bool) -> tauri_plugin_updater::Result<()> {
    if app.state::<PendingUpdate>().0.lock().unwrap().is_some() {
        return Ok(());
    }
    let updater = app
        .updater_builder()
        .endpoints(vec![feed.clone()])?
        .build()?;
    let Some(update) = updater.check().await? else {
        return Ok(());
    };
    let pending = if install {
        let bytes = update.download(|_, _| {}, || {}).await?;
        Pending::Install(Box::new(update), bytes)
    } else {
        Pending::Download(format!("{RELEASES}/v{}", update.version))
    };
    *app.state::<PendingUpdate>().0.lock().unwrap() = Some(pending);
    let _ = app.emit("update-downloaded", ());
    Ok(())
}

pub fn start(app: AppHandle) {
    if cfg!(debug_assertions) || !has_pubkey(&app) {
        return;
    }
    let next = app.package_info().version.pre.as_str().starts_with("next");
    let channel = if next { "next" } else { "stable" };
    let Ok(feed) = Url::parse(&format!("{FEEDS}/{channel}/latest.json")) else {
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
