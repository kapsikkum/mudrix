#![recursion_limit = "256"]

mod activity;
mod badge;
mod dev;
mod downloads;
mod global_keys;
mod keep_awake;
mod keyfile;
mod links;
mod loopback;
mod popout;
mod rpc;
mod screen_share;
mod screenshare;
mod settings;
mod shell;
mod toast;
mod tray;
mod update;

use std::sync::Mutex;

use tauri::{
    webview::{PermissionKind, PermissionResponse},
    window::Color,
    AppHandle, Manager, Runtime, Url, WebviewWindow, WebviewWindowBuilder,
};
#[cfg(debug_assertions)]
use tauri_plugin_single_instance as _;
use tauri_plugin_window_state::WindowExt as _;

pub const MAIN_WINDOW: &str = "main";

/// Where the window's size and place are kept. A dev build gets a file of its own, or it would
/// open exactly over the installed app's window.
const WINDOW_STATE_FILE: &str = if cfg!(debug_assertions) {
    ".window-state.dev.json"
} else {
    ".window-state.json"
};

/// The autostart entry passes this flag, so "start minimised" only applies to a start at login
const AUTOSTART_FLAG: &str = "--autostart";

/// The directory account stores live in (`StoreConfig.location` is relative to it): app data, or
/// its `dev` child for a development build, so dev stores do not mix with the installed app's.
fn store_dir<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<std::path::PathBuf> {
    let data = app.path().app_data_dir()?;
    Ok(if cfg!(debug_assertions) {
        data.join("dev")
    } else {
        data
    })
}

/// The store directory names the web app makes: `mudrix-<uuid>`, and `wizardchat-<uuid>` for
/// accounts migrated from before the rename. Anything else (`.`, `..`, a path, ...) is refused.
fn is_store_location(location: &str) -> bool {
    ["mudrix-", "wizardchat-"]
        .iter()
        .any(|prefix| location.strip_prefix(prefix).is_some_and(is_uuid))
}

/// The canonical UUID `crypto.randomUUID()` makes (version 4, RFC 4122 variant).
fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => *b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
        && bytes[14] == b'4'
        && matches!(bytes[19], b'8' | b'9' | b'a' | b'b' | b'A' | b'B')
}

/// Deletes the database directory of a signed-out account (`StoreConfig.location`)
#[tauri::command]
fn core_delete_store(app: AppHandle, location: String) -> Result<(), String> {
    if !is_store_location(&location) {
        return Err("invalid store location".into());
    }
    let path = store_dir(&app).map_err(|e| e.to_string())?.join(&location);
    match std::fs::remove_dir_all(&path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// The origins the app's own pages come from: Tauri's custom protocol in a built app, and Vite's
/// server when this is a dev build. Nothing outside them may load in a webview.
fn is_app_url(url: &Url) -> bool {
    let production = if cfg!(windows) {
        url.scheme() == "http" && url.host_str() == Some("tauri.localhost") && url.port().is_none()
    } else {
        url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none()
    };
    let dev = cfg!(debug_assertions)
        && url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port() == Some(5190);
    production || dev
}

/// Whether a webview may navigate to `url`: the app's own origins, plus `about:blank`, the empty
/// page the call popout is built on before it loads its app page.
pub(crate) fn may_navigate(url: &Url) -> bool {
    is_app_url(url) || url.as_str() == "about:blank"
}

/// The navigation guard for every webview, including the call popout and the screen share bar,
/// which are built in their own modules.
struct NavigationGuard;

impl<R: Runtime> tauri::plugin::Plugin<R> for NavigationGuard {
    fn name(&self) -> &'static str {
        "mudrix-navigation"
    }

    fn on_navigation(&mut self, _webview: &tauri::Webview<R>, url: &Url) -> bool {
        may_navigate(url)
    }
}

/// The theme's background behind the web app, so resizing and reloading don't flash another colour
#[tauri::command]
fn set_background_color(window: WebviewWindow, color: Color) {
    let _ = window.set_background_color(Some(color));
}

pub(crate) fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Closing the main window hides it to the tray when "keep running in the background" is on
/// (macOS always keeps the app running when the window closes, like other Mac apps)
fn hide_on_close<R: Runtime>(window: &tauri::Window<R>, event: &tauri::WindowEvent) {
    let tauri::WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() != MAIN_WINDOW {
        return;
    }
    let keep = cfg!(target_os = "macos")
        || settings::get_if_ready(window.app_handle()).is_none_or(|s| s.keep_running_in_background);
    if !keep {
        return;
    }
    api.prevent_close();
    let app = window.app_handle().clone();
    if window.is_fullscreen().unwrap_or(false) {
        // A fullscreen window that hides leaves a black space behind: leave fullscreen first
        let _ = window.set_fullscreen(false);
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(800));
            shell::hide_main_window(&app);
        });
    } else {
        shell::hide_main_window(&app);
    }
}

#[cfg(all(debug_assertions, windows))]
fn webview_data_folder() -> &'static str {
    // A `tauri dev` session and a built debug installer are both debug builds. They must not share
    // WebView2's user data folder: the second one then fails to create its webview with
    // ERROR_INVALID_STATE. Installed debug builds keep the old folder so they do not lose data.
    if crate::dev::IS_DEV {
        "dev-webview-dev"
    } else {
        "dev-webview"
    }
}

pub fn run() {
    #[cfg(all(debug_assertions, windows))]
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        if let Ok(local_data) = std::env::var("LOCALAPPDATA") {
            let dev_webview = std::path::PathBuf::from(local_data)
                .join("chat.mudrix.desktop")
                .join(webview_data_folder());
            let _ = std::fs::create_dir_all(&dev_webview);
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dev_webview);
        }
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app)
        }));
    }

    let app = builder
        // Only the app's own pages may navigate, in every window (see the builder below too)
        .plugin(NavigationGuard)
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename(WINDOW_STATE_FILE)
                .with_state_flags(shell::window_state_flags())
                .with_denylist(&[screenshare::BAR_WINDOW, popout::POPOUT_WINDOW])
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(rpc::Core::new())
        .manage(keyfile::KeyFiles::default())
        .manage(shell::FullscreenState::default())
        .manage(links::Pending::default())
        .manage(global_keys::GlobalKeys::default())
        .manage(keep_awake::KeepAwake::default())
        .manage(update::PendingUpdate::default())
        .manage(screen_share::Capture::default())
        // Calls, screen sharing, location sharing and what WebView2 asks the host for. Only the
        // app's own pages may ask: a page that somehow loaded elsewhere gets nothing.
        .on_permission_request(|webview, kind| {
            let app_page = webview.url().is_ok_and(|url| is_app_url(&url));
            match kind {
                PermissionKind::Microphone
                | PermissionKind::Camera
                | PermissionKind::DisplayCapture
                | PermissionKind::Geolocation
                // WebView2 has no permission prompt of its own, so a kind left at the default
                // answer counts as refused. That muted message sounds (WebView2 gates
                // `audio.play()` on the media autoplay permission) and made
                // `Notification.requestPermission()` come back denied, so the web app's
                // notification switch could never be turned on.
                | PermissionKind::Notifications
                | PermissionKind::Autoplay
                    if app_page =>
                {
                    PermissionResponse::Allow
                }
                PermissionKind::Microphone
                | PermissionKind::Camera
                | PermissionKind::DisplayCapture
                | PermissionKind::Geolocation
                | PermissionKind::Notifications
                | PermissionKind::Autoplay => PermissionResponse::Deny,
                _ => PermissionResponse::Default,
            }
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW {
                return;
            }
            hide_on_close(window, event);
            if matches!(
                event,
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) {
                shell::check_fullscreen(window.app_handle());
            }
            if matches!(event, tauri::WindowEvent::Destroyed) {
                screenshare::close_bar(window.app_handle());
                popout::close_popout(window.app_handle());
            }
        })
        .setup(|app| {
            // Account stores (`StoreConfig.location`) are relative paths: keep them in app data
            let data = store_dir(app.handle())?;
            std::fs::create_dir_all(&data)?;
            std::env::set_current_dir(&data)?;

            if let Some(config) = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == MAIN_WINDOW)
            {
                let window =
                    WebviewWindowBuilder::from_config(app, config)?.on_navigation(may_navigate);
                let popout_handle = app.handle().clone();
                let window = window.on_new_window(move |url, features| {
                    popout::on_new_window(&popout_handle, url, features)
                });
                #[cfg(all(debug_assertions, windows))]
                let window = window
                    .data_directory(app.path().app_local_data_dir()?.join(webview_data_folder()));
                window.build()?;
            }
            let loaded = settings::load(app.handle());
            let start_hidden =
                loaded.start_minimized && std::env::args().any(|a| a == AUTOSTART_FLAG);
            app.manage(settings::SettingsState(Mutex::new(loaded)));
            #[cfg(windows)]
            toast::init(app.handle());
            tray::build(app.handle())?;
            activity::init(app.handle());
            // The app draws its own title bar and, unless the setting asks for the system's frame,
            // the window buttons too. macOS keeps its native traffic lights.
            #[cfg(not(target_os = "macos"))]
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                shell::apply_window_frame(&window, settings::get(app.handle()).window_controls);
            }
            // The window starts hidden (no flash): place it, then show it unless this is a start
            // at login that should stay in the tray
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                if let Some(icon) = dev::window_icon() {
                    let _ = window.set_icon(icon);
                }
                if dev::IS_DEV {
                    let _ = window.set_title(&dev::name(app.handle()));
                }
                let _ = window.restore_state(shell::window_state_flags());
                if !start_hidden {
                    focus_main(app.handle());
                }
            }
            links::setup(app.handle());
            update::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            rpc::rpc_connect,
            rpc::rpc_call,
            rpc::rpc_release,
            rpc::rpc_cancel,
            core_delete_store,
            set_background_color,
            loopback::loopback_listen,
            loopback::loopback_wait,
            loopback::loopback_cancel,
            downloads::save_download,
            downloads::save_files,
            keyfile::pick_key_file_to_save,
            keyfile::pick_key_file_to_open,
            shell::get_desktop_settings,
            shell::set_desktop_settings,
            shell::set_unread_count,
            links::show_notification,
            links::take_pending_room,
            links::take_deep_link,
            global_keys::global_key_set,
            global_keys::global_keys_permission,
            keep_awake::keep_awake,
            popout::hide_call_popout,
            update::update_ready,
            activity::set_activity_detection,
            activity::get_activity,
            activity::list_running_programs,
            update::check_for_update,
            update::install_update,
            screen_share::screen_capture_supported,
            screen_share::desktop_sources,
            screen_share::start_screen_capture,
            screen_share::stop_screen_capture,
            screenshare::show_screen_share_bar,
            screenshare::hide_screen_share_bar,
            screenshare::screen_share_bar_stop,
            screenshare::screen_share_bar_return,
            tray::set_app_icon,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Mudrix");
    app.run(|_app, _event| {
        // The Dock icon brings the hidden window back
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = _event
        {
            focus_main(_app);
        }
    });
}

#[cfg(test)]
mod navigation_tests {
    use super::is_app_url;
    use tauri::Url;

    fn url(value: &str) -> Url {
        Url::parse(value).expect("a valid test url")
    }

    #[test]
    fn the_app_origin_is_allowed() {
        if cfg!(windows) {
            assert!(is_app_url(&url("http://tauri.localhost/index.html")));
        } else {
            assert!(is_app_url(&url("tauri://localhost/index.html")));
        }
        // The Vite dev server is allowed in debug builds only.
        assert_eq!(
            is_app_url(&url("http://localhost:5190/")),
            cfg!(debug_assertions)
        );
    }

    #[test]
    fn other_origins_are_refused() {
        for value in [
            "https://example.com/",
            "http://localhost:5180/",
            "http://localhost:5191/",
            "http://tauri.localhost.evil.com/index.html",
            "http://localhost.evil.com:5190/",
            "file:///etc/passwd",
        ] {
            assert!(!is_app_url(&url(value)), "{value} must be refused");
        }
    }
}

#[cfg(test)]
mod store_location_tests {
    use super::is_store_location;

    const UUID: &str = "123e4567-e89b-42d3-a456-426614174000";

    #[test]
    fn the_web_apps_store_names_are_accepted() {
        assert!(is_store_location(&format!("mudrix-{UUID}")));
        // Accounts migrated from before the rename keep their old store names.
        assert!(is_store_location(&format!("wizardchat-{UUID}")));
    }

    #[test]
    fn dot_parent_and_paths_are_refused() {
        for location in [
            "",
            ".",
            "..",
            "../..",
            "mudrix-..",
            "mudrix-",
            "/mudrix-123e4567-e89b-42d3-a456-426614174000",
            "mudrix-123e4567-e89b-42d3-a456-426614174000/..",
            "mudrix-123e4567-e89b-42d3-a456-426614174000\\..",
            "C:\\mudrix-123e4567-e89b-42d3-a456-426614174000",
            "other-123e4567-e89b-42d3-a456-426614174000",
            "mudrix-not-a-uuid",
        ] {
            assert!(!is_store_location(location), "{location:?} must be refused");
        }
    }

    #[test]
    fn a_store_name_is_a_version_4_uuid() {
        assert!(!is_store_location(&format!(
            "mudrix-{}",
            UUID.replace("-42d3-", "-12d3-")
        )));
        assert!(!is_store_location(&format!(
            "mudrix-{}",
            UUID.replace("a456", "0456")
        )));
    }
}
