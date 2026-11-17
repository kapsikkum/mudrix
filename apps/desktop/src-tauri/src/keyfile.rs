//! Room key files: the native dialogs that choose where an export is written and which file an
//! import reads. The core writes and reads key files by path itself (`exportRoomKeys` and
//! `importRoomKeys`), so the web app needs a path from the system dialog first.

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

/// The dialog's filter: key files are plain text (Element's format, armoured).
const KEY_FILE_FILTER: &str = "Key file";

/// Asks where to write the export, offering `default_name`. The chosen path, or `None` when the
/// user cancelled.
#[tauri::command]
pub async fn pick_key_file_to_save(
    app: AppHandle,
    default_name: String,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(default_name)
        .add_filter(KEY_FILE_FILTER, &["txt"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    chosen_path(rx.await.map_err(|e| e.to_string())?)
}

/// Asks which key file to read. The chosen path, or `None` when the user cancelled.
#[tauri::command]
pub async fn pick_key_file_to_open(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(KEY_FILE_FILTER, &["txt"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    chosen_path(rx.await.map_err(|e| e.to_string())?)
}

/// The path a dialog returned, as a string; `None` when nothing was chosen.
fn chosen_path(chosen: Option<FilePath>) -> Result<Option<String>, String> {
    chosen
        .map(|file| {
            file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|e| e.to_string())
        })
        .transpose()
}

#[cfg(test)]
mod key_file_tests {
    use super::*;

    #[test]
    fn a_cancelled_dialog_has_no_path() {
        assert_eq!(chosen_path(None).unwrap(), None);
    }

    #[test]
    fn a_chosen_file_is_its_path() {
        let chosen = FilePath::from(std::path::PathBuf::from("room keys.txt"));
        assert_eq!(
            chosen_path(Some(chosen)).unwrap().as_deref(),
            Some("room keys.txt")
        );
    }
}
