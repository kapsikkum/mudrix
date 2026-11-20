//! Room key files: the native dialogs that choose where an export is written and which file an
//! import reads. The core writes and reads key files by path itself (`exportRoomKeys` and
//! `importRoomKeys`), so the web app needs a path from the system dialog first.
//!
//! A dialog's path is recorded here as a one-shot permit: `rpc_call` only lets those two core calls
//! run for a path one of these dialogs returned, so a page cannot make the core read or write a
//! file the person never chose.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

/// The dialog's filter: key files are plain text (Element's format, armoured).
const KEY_FILE_FILTER: &str = "Key file";

/// How long a path from a dialog stays usable. A person may take a while with the passphrase, but
/// a permit must not outlive the moment it was picked by much.
const PATH_LIFETIME: Duration = Duration::from_secs(10 * 60);

/// What a picked path is for: an export writes the file, an import reads it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Save,
    Open,
}

impl Kind {
    /// The dialog a core method needs, or `None` when it reads no `path` argument.
    pub fn for_method(method: &str) -> Option<Self> {
        match method {
            "MudrixClient.exportRoomKeys" => Some(Self::Save),
            "MudrixClient.importRoomKeys" => Some(Self::Open),
            _ => None,
        }
    }
}

/// Paths dialogs have returned, waiting for the one core call they were picked for.
#[derive(Default)]
pub struct KeyFiles {
    allowed: Mutex<Vec<Allowed>>,
}

struct Allowed {
    path: PathBuf,
    kind: Kind,
    picked: Instant,
}

impl KeyFiles {
    /// Records `path` as chosen in a dialog for `kind`; a path that cannot be resolved is not
    /// recorded, and the core call is refused.
    fn remember(&self, path: &Path, kind: Kind) {
        self.remember_at(path, kind, Instant::now());
    }

    fn remember_at(&self, path: &Path, kind: Kind, now: Instant) {
        let Some(path) = canonical(path) else {
            return;
        };
        let mut allowed = self.allowed.lock().unwrap_or_else(|e| e.into_inner());
        allowed.retain(|entry| now.saturating_duration_since(entry.picked) <= PATH_LIFETIME);
        allowed.push(Allowed {
            path,
            kind,
            picked: now,
        });
    }

    /// Whether `path` is an unused path a dialog returned for `kind`. A match is consumed, so the
    /// same permit cannot be used for a second call.
    pub fn take(&self, path: &str, kind: Kind) -> bool {
        self.take_at(Path::new(path), kind, Instant::now())
    }

    fn take_at(&self, path: &Path, kind: Kind, now: Instant) -> bool {
        let Some(path) = canonical(path) else {
            return false;
        };
        let mut allowed = self.allowed.lock().unwrap_or_else(|e| e.into_inner());
        allowed.retain(|entry| now.saturating_duration_since(entry.picked) <= PATH_LIFETIME);
        let Some(index) = allowed
            .iter()
            .position(|entry| entry.kind == kind && entry.path == path)
        else {
            return false;
        };
        allowed.remove(index);
        true
    }
}

/// The absolute form of `path`, with the part that exists resolved (symlinks included) and a file
/// that is about to be created kept as it was named. `None` for a relative path or a `..` tail
/// that cannot be resolved.
fn canonical(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }
    let mut rest = Vec::new();
    let mut current = path;
    loop {
        if let Ok(mut resolved) = current.canonicalize() {
            for part in rest.iter().rev() {
                resolved.push(part);
            }
            return Some(resolved);
        }
        rest.push(current.file_name()?.to_os_string());
        current = current.parent()?;
    }
}

/// Asks where to write the export, offering `default_name`. The chosen path, or `None` when the
/// user cancelled.
#[tauri::command]
pub async fn pick_key_file_to_save(
    app: AppHandle,
    keyfiles: State<'_, KeyFiles>,
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
    let path = chosen_path(rx.await.map_err(|e| e.to_string())?)?;
    if let Some(path) = &path {
        keyfiles.remember(Path::new(path), Kind::Save);
    }
    Ok(path)
}

/// Asks which key file to read. The chosen path, or `None` when the user cancelled.
#[tauri::command]
pub async fn pick_key_file_to_open(
    app: AppHandle,
    keyfiles: State<'_, KeyFiles>,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(KEY_FILE_FILTER, &["txt"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    let path = chosen_path(rx.await.map_err(|e| e.to_string())?)?;
    if let Some(path) = &path {
        keyfiles.remember(Path::new(path), Kind::Open);
    }
    Ok(path)
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
    use std::sync::atomic::{AtomicU32, Ordering};

    /// A path that does not exist yet, in a directory that does (the save dialog's case).
    fn chosen_name(test: &str) -> PathBuf {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        std::env::temp_dir().join(format!(
            "mudrix-keyfile-{}-{}-{}.txt",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
            test
        ))
    }

    #[test]
    fn a_cancelled_dialog_has_no_path() {
        assert_eq!(chosen_path(None).unwrap(), None);
    }

    #[test]
    fn a_chosen_file_is_its_path() {
        let chosen = FilePath::from(PathBuf::from("room keys.txt"));
        assert_eq!(
            chosen_path(Some(chosen)).unwrap().as_deref(),
            Some("room keys.txt")
        );
    }

    #[test]
    fn a_picked_path_is_taken_once_for_its_kind() {
        let keyfiles = KeyFiles::default();
        let path = chosen_name("once");
        keyfiles.remember(&path, Kind::Save);
        let path = path.to_string_lossy();
        assert!(keyfiles.take(&path, Kind::Save));
        assert!(!keyfiles.take(&path, Kind::Save));
    }

    #[test]
    fn a_picked_path_is_not_taken_for_another_dialog() {
        let keyfiles = KeyFiles::default();
        let path = chosen_name("kind");
        keyfiles.remember(&path, Kind::Save);
        assert!(!keyfiles.take(&path.to_string_lossy(), Kind::Open));
    }

    #[test]
    fn a_path_no_dialog_returned_is_refused() {
        let keyfiles = KeyFiles::default();
        keyfiles.remember(&chosen_name("remembered"), Kind::Save);
        assert!(!keyfiles.take(&chosen_name("other").to_string_lossy(), Kind::Save));
    }

    #[test]
    fn an_expired_path_is_refused() {
        let keyfiles = KeyFiles::default();
        let path = chosen_name("expired");
        let now = Instant::now();
        keyfiles.remember_at(
            &path,
            Kind::Save,
            now - PATH_LIFETIME - Duration::from_secs(1),
        );
        assert!(!keyfiles.take_at(&path, Kind::Save, now));
    }

    #[test]
    fn a_relative_path_is_never_recorded() {
        let keyfiles = KeyFiles::default();
        let relative = Path::new("room keys.txt");
        keyfiles.remember(relative, Kind::Save);
        assert!(!keyfiles.take("room keys.txt", Kind::Save));
    }

    #[test]
    fn dot_segments_resolve_to_the_same_path() {
        let keyfiles = KeyFiles::default();
        let path = chosen_name("dots");
        let indirect = path
            .parent()
            .unwrap()
            .join(".")
            .join(path.file_name().unwrap());
        keyfiles.remember(&indirect, Kind::Save);
        assert!(keyfiles.take(&path.to_string_lossy(), Kind::Save));
    }

    #[test]
    fn the_key_file_methods_are_the_ones_that_need_a_dialog() {
        assert_eq!(
            Kind::for_method("MudrixClient.exportRoomKeys"),
            Some(Kind::Save)
        );
        assert_eq!(
            Kind::for_method("MudrixClient.importRoomKeys"),
            Some(Kind::Open)
        );
        assert_eq!(Kind::for_method("MudrixClient.sendMessage"), None);
    }
}
