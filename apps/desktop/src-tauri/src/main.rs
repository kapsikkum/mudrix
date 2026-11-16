// A GUI app should never open a console window beside it, including the debug-profile test
// installers CI publishes; only the terminal that runs `tauri dev` keeps the log output.
#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    mudrix_desktop::run()
}
