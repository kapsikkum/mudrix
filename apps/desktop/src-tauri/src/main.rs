// A console window only belongs beside `tauri dev`; every built installer, including CI's
// debug-profile test builds, is a GUI app (tauri-build sets the `dev` cfg).
#![cfg_attr(all(windows, not(dev)), windows_subsystem = "windows")]

fn main() {
    mudrix_desktop::run()
}
