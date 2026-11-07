//! Saving downloads: webview `<a download>` links do nothing in the shell, so the web app hands
//! the bytes over (`window.desktopAPI.saveDownload`) and they land in the Downloads folder.

use tauri::{AppHandle, Manager};

/// Keeps a file name safe to create: no directories, no characters Windows rejects.
fn sanitize_file_name(raw: &str) -> String {
    let name: String = raw
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() || is_invisible_format(c) => '_',
            c => c,
        })
        .collect();
    let name = name.trim().trim_matches('.').to_string();
    let name = if is_reserved_device_name(&name) {
        format!("_{name}")
    } else {
        name
    };
    // Windows drops trailing spaces and dots, so don't leave any.
    let name = name.trim_end_matches([' ', '.']).to_string();
    if name.is_empty() {
        "download".to_string()
    } else {
        name
    }
}

/// Characters that draw nothing or reorder what is drawn (right-to-left overrides and isolates, zero-width
/// and joiner characters, the byte order mark): in a file name they can make `evil.exe` read as another
/// name with another extension.
fn is_invisible_format(c: char) -> bool {
    matches!(c,
        '\u{200B}'..='\u{200F}'
        | '\u{202A}'..='\u{202E}'
        | '\u{2060}'..='\u{2064}'
        | '\u{2066}'..='\u{206F}'
        | '\u{FEFF}')
}

/// `CON`, `NUL`, `COM1`... are devices on Windows, with or without an extension.
fn is_reserved_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").trim_end();
    let upper = stem.to_ascii_uppercase();
    matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.len() == 4
            && matches!(upper.as_bytes()[3], b'1'..=b'9'))
}

/// Mark the file as downloaded from the internet (Mark of the Web) so SmartScreen and Office
/// protections apply. Best effort; filesystems without alternate data streams just fail.
#[cfg(windows)]
fn mark_downloaded(path: &std::path::Path) {
    let mut stream = path.as_os_str().to_os_string();
    stream.push(":Zone.Identifier");
    let _ = std::fs::write(stream, "[ZoneTransfer]RNZoneId=3RN".replace("RN", "\r\n"));
}

/// Picks `name`, `name (1).ext`, `name (2).ext`... so an existing file is never overwritten.
fn unique_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = std::path::Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("download");
    let ext = path.extension().and_then(|e| e.to_str());
    for n in 1..1000 {
        let numbered = match ext {
            Some(e) => format!("{stem} ({n}).{e}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = dir.join(numbered);
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(name)
}

/// Saves a downloaded attachment into the user's Downloads folder (webview `<a download>` links
/// do nothing in the desktop shell). The body is the raw file; the name comes in the
/// `x-filename` header (URL-encoded). Returns the path it was saved to.
#[tauri::command]
pub fn save_download(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file as a raw body".into());
    };
    let raw_name = request
        .headers()
        .get("x-filename")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("download");
    let decoded = percent_decode(raw_name);
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("no downloads folder: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = unique_path(&dir, &sanitize_file_name(&decoded));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    mark_downloaded(&path);
    Ok(path.to_string_lossy().into_owned())
}

/// Minimal `%XX` decoder for the file name header (invalid sequences are kept as they are).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod download_tests {
    use super::*;

    #[test]
    fn file_names_are_made_safe() {
        assert_eq!(sanitize_file_name(r"..\..\evil.exe"), "evil.exe");
        assert_eq!(sanitize_file_name("a/b:c?.txt"), "b_c_.txt");
        assert_eq!(sanitize_file_name("   "), "download");
        assert_eq!(sanitize_file_name("..."), "download");
    }

    #[test]
    fn windows_device_names_are_prefixed() {
        assert_eq!(sanitize_file_name("CON"), "_CON");
        assert_eq!(sanitize_file_name("nul.txt"), "_nul.txt");
        assert_eq!(sanitize_file_name("Com1.tar.gz"), "_Com1.tar.gz");
        assert_eq!(sanitize_file_name("lpt9"), "_lpt9");
        assert_eq!(sanitize_file_name("COM0"), "COM0");
        assert_eq!(sanitize_file_name("console.txt"), "console.txt");
        assert_eq!(sanitize_file_name("aux .txt"), "_aux .txt");
    }

    #[test]
    fn trailing_spaces_and_dots_are_removed() {
        assert_eq!(sanitize_file_name("report. . "), "report");
        assert_eq!(sanitize_file_name("a.txt "), "a.txt");
    }

    #[test]
    fn header_names_are_percent_decoded() {
        assert_eq!(
            percent_decode("New%20Text%20Document.txt"),
            "New Text Document.txt"
        );
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%E3%81%82.txt"), "あ.txt");
    }
}
