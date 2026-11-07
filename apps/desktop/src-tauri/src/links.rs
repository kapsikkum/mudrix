//! What brings the user to a place in the app from outside: `org.wizardchat.desktop://` links and
//! clicks on notifications. The target waits here until the web app takes it, so it isn't lost
//! while the app is still loading.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime, State, Url};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;

const SCHEME: &str = "org.wizardchat.desktop";

#[derive(Default)]
pub struct Pending {
    room: Mutex<Option<String>>,
    link: Mutex<Option<String>>,
}

/// The app path of a link: `org.wizardchat.desktop://app/r/...` and `org.wizardchat.desktop:/r/...` open `/r/...`
fn app_path(url: &Url) -> Option<String> {
    if url.scheme() != SCHEME {
        return None;
    }
    let mut path = match url.host_str() {
        Some(host) if host != "app" && !host.is_empty() => format!("/{host}{}", url.path()),
        _ => url.path().to_owned(),
    };
    if !path.starts_with('/') {
        path.insert(0, '/');
    }
    if let Some(query) = url.query() {
        path = format!("{path}?{query}");
    }
    if let Some(fragment) = url.fragment() {
        path = format!("{path}#{fragment}");
    }
    Some(path)
}

fn open_link<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    let Some(path) = app_path(url) else {
        return;
    };
    *app.state::<Pending>().link.lock().unwrap() = Some(path);
    crate::focus_main(app);
    let _ = app.emit("deep-link", ());
}

pub(crate) fn open_room<R: Runtime>(app: &AppHandle<R>, room: String) {
    *app.state::<Pending>().room.lock().unwrap() = Some(room);
    crate::focus_main(app);
    let _ = app.emit("open-room", ());
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) {
    let deep_link = app.deep_link();
    // Installers register the scheme; this also covers AppImages and development builds
    #[cfg(any(windows, target_os = "linux"))]
    let _ = deep_link.register_all();
    let handle = app.clone();
    deep_link.on_open_url(move |event| {
        for url in event.urls() {
            open_link(&handle, &url);
        }
    });
    if let Ok(Some(urls)) = deep_link.get_current() {
        for url in urls {
            open_link(app, &url);
        }
    }

    let handle = app.clone();
    let _ = app.notification().on_action(move |performed| {
        if performed.action_id() != "tap" {
            return;
        }
        let room = performed
            .notification()
            .and_then(|n| n.extra().get("roomUrl"))
            .and_then(|url| url.as_str())
            .filter(|url| url.starts_with('/'));
        match room {
            Some(room) => open_room(&handle, room.to_owned()),
            None => crate::focus_main(&handle),
        }
    });
}

/// The themed notification icon, a file of the web app, as a file the notification server can read
#[cfg(target_os = "linux")]
fn icon_file<R: Runtime>(app: &AppHandle<R>, icon: &str) -> Option<String> {
    let name = icon
        .rsplit('/')
        .next()
        .filter(|name| name.ends_with(".svg") || name.ends_with(".png"))?;
    let path = app
        .path()
        .app_cache_dir()
        .ok()?
        .join("notification")
        .join(name);
    if !path.exists() {
        let asset = app.asset_resolver().get(icon.to_owned())?;
        std::fs::create_dir_all(path.parent()?).ok()?;
        std::fs::write(&path, asset.bytes()).ok()?;
    }
    Some(path.to_string_lossy().into_owned())
}

/// A message notification; clicking it focuses the window and opens `room_url`
#[tauri::command]
pub fn show_notification(
    app: AppHandle,
    title: String,
    body: String,
    icon: Option<String>,
    room_url: Option<String>,
) -> bool {
    // "Mute notifications" in the tray menu
    if crate::settings::get_if_ready(&app).is_some_and(|settings| settings.notifications_muted) {
        return true;
    }
    // Windows: the plugin would label an unpackaged build "Windows PowerShell" (see `toast`)
    #[cfg(windows)]
    {
        let _ = icon;
        crate::toast::show(
            &app,
            &title,
            &body,
            room_url.filter(|url| url.starts_with('/')),
        )
        .is_ok()
    }
    #[cfg(not(windows))]
    show_with_plugin(&app, title, body, icon, room_url)
}

#[cfg(not(windows))]
fn show_with_plugin<R: Runtime>(
    app: &AppHandle<R>,
    title: String,
    body: String,
    icon: Option<String>,
    room_url: Option<String>,
) -> bool {
    let mut notification = app.notification().builder().title(title).body(body);
    // macOS and Windows always show the app icon
    #[cfg(target_os = "linux")]
    if let Some(icon) = icon.and_then(|icon| icon_file(app, &icon)) {
        notification = notification.icon(icon);
    }
    #[cfg(not(target_os = "linux"))]
    let _ = icon;
    if let Some(room_url) = room_url {
        notification = notification.extra("roomUrl", room_url);
    }
    notification.show().is_ok()
}

#[tauri::command]
pub fn take_pending_room(pending: State<'_, Pending>) -> Option<String> {
    pending.room.lock().unwrap().take()
}

#[tauri::command]
pub fn take_deep_link(pending: State<'_, Pending>) -> Option<String> {
    pending.link.lock().unwrap().take()
}
