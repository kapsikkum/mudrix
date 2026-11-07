//! Keeps the display on during calls, which the system webviews' Wake Lock API doesn't do everywhere

use std::sync::Mutex;

use tauri::State;

#[derive(Default)]
pub struct KeepAwake(Mutex<Option<keepawake::KeepAwake>>);

#[tauri::command]
pub fn keep_awake(on: bool, state: State<'_, KeepAwake>) -> Result<(), String> {
    let mut held = state.0.lock().unwrap();
    if !on {
        *held = None;
    } else if held.is_none() {
        let lock = keepawake::Builder::default()
            .display(true)
            .idle(true)
            .reason("In a call")
            .app_name("WizardChat")
            .app_reverse_domain("org.wizardchat.desktop")
            .create()
            .map_err(|e| e.to_string())?;
        *held = Some(lock);
    }
    Ok(())
}
