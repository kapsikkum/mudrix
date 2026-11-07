//! What tells a dev build (`tauri dev`) from the installed app, so the two do not group together on
//! the taskbar or share a toast identity: its own app id and a name that says "Dev". Release builds
//! are unchanged.

use tauri::AppHandle;

pub const IS_DEV: bool = cfg!(debug_assertions);

/// The app's name where it is shown to people (toasts, the tray tooltip).
pub fn name(app: &AppHandle) -> String {
    let name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| "WizardChat".into());
    if IS_DEV {
        format!("{name} Dev")
    } else {
        name
    }
}

/// The Windows AppUserModelID, which is what the taskbar groups windows (and toasts) by.
#[cfg(windows)]
pub fn app_id(identifier: &str) -> String {
    if IS_DEV {
        format!("{identifier}.dev")
    } else {
        identifier.to_owned()
    }
}
