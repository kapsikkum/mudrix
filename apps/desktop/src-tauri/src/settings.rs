//! Desktop-shell settings, stored as JSON in the app config dir (`desktop.json`).
//!
//! These live natively (not in the web app's localStorage) because the shell needs
//! them before the webview has loaded: whether closing hides to the tray, and
//! whether to stay hidden after an autostart.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Which window buttons the app draws. `Auto` is the platform's own style (Windows and KDE's,
/// resolved by the web app).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WindowControls {
    #[default]
    Auto,
    /// No drawn buttons: the window manager's own frame.
    System,
    Windows,
    Kde,
    Mac,
}

// macOS keeps its native traffic lights, so only the other platforms ask what to draw
#[cfg(not(target_os = "macos"))]
impl WindowControls {
    /// Whether the window keeps the system's frame (and so its buttons)
    pub fn native_frame(self) -> bool {
        match self {
            Self::System => true,
            Self::Auto | Self::Windows | Self::Kde | Self::Mac => false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopSettings {
    /// Closing the window hides it to the tray instead of quitting.
    pub keep_running_in_background: bool,
    /// Start when the user logs in (mirrors the OS autostart entry).
    pub launch_at_login: bool,
    /// When started at login, stay in the tray.
    pub start_minimized: bool,
    /// Tray "Mute notifications".
    pub notifications_muted: bool,
    /// The style of the window's minimize, maximize and close buttons.
    pub window_controls: WindowControls,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            keep_running_in_background: true,
            launch_at_login: false,
            start_minimized: false,
            notifications_muted: false,
            window_controls: WindowControls::Auto,
        }
    }
}

#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    pub keep_running_in_background: Option<bool>,
    pub launch_at_login: Option<bool>,
    pub start_minimized: Option<bool>,
    pub notifications_muted: Option<bool>,
    pub window_controls: Option<WindowControls>,
}

impl DesktopSettings {
    pub fn apply(&mut self, patch: &SettingsPatch) {
        if let Some(v) = patch.keep_running_in_background {
            self.keep_running_in_background = v;
        }
        if let Some(v) = patch.launch_at_login {
            self.launch_at_login = v;
        }
        if let Some(v) = patch.start_minimized {
            self.start_minimized = v;
        }
        if let Some(v) = patch.notifications_muted {
            self.notifications_muted = v;
        }
        if let Some(v) = patch.window_controls {
            self.window_controls = v;
        }
    }
}

pub struct SettingsState(pub Mutex<DesktopSettings>);

fn file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("desktop.json"))
}

pub fn load(app: &AppHandle) -> DesktopSettings {
    file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, settings: &DesktopSettings) {
    let Some(path) = file(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(path, json);
    }
}

pub fn get(app: &AppHandle) -> DesktopSettings {
    app.state::<SettingsState>().0.lock().unwrap().clone()
}

/// Like `get`, for code generic over the runtime: `None` before the settings are loaded
pub fn get_if_ready<R: tauri::Runtime>(app: &AppHandle<R>) -> Option<DesktopSettings> {
    let state = app.try_state::<SettingsState>()?;
    let settings = state.0.lock().ok()?.clone();
    Some(settings)
}

/// Apply a patch, persist it and return the new settings. Side effects (autostart
/// entry, tray check mark) are the caller's business, see `shell::apply_settings`.
pub fn update(app: &AppHandle, patch: &SettingsPatch) -> DesktopSettings {
    let state = app.state::<SettingsState>();
    let mut guard = state.0.lock().unwrap();
    guard.apply(patch);
    save(app, &guard);
    guard.clone()
}
