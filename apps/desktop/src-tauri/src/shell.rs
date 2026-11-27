//! The window and its settings: showing, hiding to the tray, remembered geometry, the persisted
//! shell settings (keep running, launch at login, start minimised) and the unread badge command.

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(not(target_os = "macos"))]
use tauri::WebviewWindow;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_window_state::{AppHandleExt as _, StateFlags};

#[cfg(not(target_os = "macos"))]
use crate::settings::WindowControls;
use crate::settings::{self, DesktopSettings, SettingsPatch};
use crate::{tray, MAIN_WINDOW};

/// Whether the main window was last reported as fullscreen (`fullscreen-changed`).
#[derive(Default)]
pub struct FullscreenState(AtomicBool);

/// What gets remembered (and restored) of the window
pub fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN
}

/// Tells the main window when it enters or leaves fullscreen (the web app drops the macOS
/// traffic-light padding while it is). Called on resizes, which is when fullscreen changes.
pub fn check_fullscreen<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    if app
        .state::<FullscreenState>()
        .0
        .swap(fullscreen, Ordering::SeqCst)
        != fullscreen
    {
        let _ = app.emit_to(MAIN_WINDOW, "fullscreen-changed", fullscreen);
    }
}

/// Hides to the tray, remembering the window geometry first
pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.save_window_state(window_state_flags());
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
        // Some window systems (Wayland) keep reporting the hidden window as focused, so the web
        // app is told it is gone rather than left to ask
        let _ = app.emit_to(MAIN_WINDOW, "desktop://window-hidden", ());
    }
}

/// Gives the main window the system's frame, or none when the app draws its own window buttons.
/// macOS keeps its native traffic lights under the overlay title bar whatever the setting says.
#[cfg(not(target_os = "macos"))]
pub fn apply_window_frame<R: Runtime>(window: &WebviewWindow<R>, controls: WindowControls) {
    let _ = window.set_decorations(controls.native_frame());
}

pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let showing = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    if showing {
        hide_main_window(app);
    } else {
        crate::focus_main(app);
    }
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    crate::focus_main(app);
}

/// Saves a settings patch and applies its side effects (autostart entry, tray menu), then tells
/// the web app
pub fn apply_settings(app: &AppHandle, patch: &SettingsPatch) -> DesktopSettings {
    if let Some(enable) = patch.launch_at_login {
        let autolaunch = app.autolaunch();
        let result = if enable {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        if let Err(e) = result {
            eprintln!("[desktop] could not change the autostart entry: {e}");
        }
    }
    let mut updated = settings::update(app, patch);
    #[cfg(not(target_os = "macos"))]
    if patch.window_controls.is_some() {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
            apply_window_frame(&window, updated.window_controls);
        }
    }
    sync_autostart(app, &mut updated);
    tray::sync_mute(app, updated.notifications_muted);
    let _ = app.emit("desktop://settings-changed", updated.clone());
    updated
}

/// The user may have removed the autostart entry in the OS settings: the OS wins
fn sync_autostart(app: &AppHandle, current: &mut DesktopSettings) {
    if let Ok(actual) = app.autolaunch().is_enabled() {
        if actual != current.launch_at_login {
            *current = settings::update(
                app,
                &SettingsPatch {
                    launch_at_login: Some(actual),
                    ..Default::default()
                },
            );
        }
    }
}

#[tauri::command]
pub fn get_desktop_settings(app: AppHandle) -> DesktopSettings {
    let mut current = settings::get(&app);
    sync_autostart(&app, &mut current);
    current
}

#[tauri::command]
pub fn set_desktop_settings(app: AppHandle, patch: SettingsPatch) -> DesktopSettings {
    apply_settings(&app, &patch)
}

/// Unread messages and rooms with a mention: tray icon and tooltip, taskbar overlay, dock badge
#[tauri::command]
pub fn set_unread_count(app: AppHandle, total: u32, highlight: u32) {
    tray::set_unread(&app, total, highlight);
}
