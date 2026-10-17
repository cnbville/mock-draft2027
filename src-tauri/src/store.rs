//! Commands the web app calls with `invoke`:
//! - `store_read({path})` -> the file's text, or `null` if it isn't there.
//! - `store_write({path, text})` -> nothing, or an error message.
//! - `save_file({name, base64})` -> the saved path, or `null` if the user cancelled.
//!
//! `store_*` paths are relative to the app data folder
//! (`~/Library/Application Support/com.cnbville.mockdraft2027/` on a Mac).
//! Absolute paths and `..` are refused, so the web side can't reach any other file.

use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// Reads a text file from the app data folder. `None` when it's missing, unreadable or
/// the path isn't allowed.
#[tauri::command]
pub async fn store_read(app: AppHandle, path: String) -> Option<String> {
    let file = data_path(&app, &path).ok()?;
    tokio::fs::read_to_string(&file).await.ok()
}

/// Writes a text file in the app data folder, creating folders as needed. The file is
/// written next to its final name and then renamed, so a reader never sees half a file.
#[tauri::command]
pub async fn store_write(app: AppHandle, path: String, text: String) -> Result<(), String> {
    let file = data_path(&app, &path)?;
    write_atomic(&file, text.as_bytes())
        .await
        .map_err(|e| format!("could not write {path}: {e}"))
}

/// Shows the native Save panel with `name` as the suggested file name, then writes the
/// decoded bytes there. Accepts plain base64 or a `data:...;base64,` URL.
/// Returns the saved path, or `None` if the user cancelled or the write failed.
#[tauri::command]
pub async fn save_file(app: AppHandle, name: String, base64: String) -> Option<String> {
    let bytes = match decode_payload(&base64) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("save_file: bad base64 for {name}: {e}");
            return None;
        }
    };
    let file_name = suggested_name(&name);

    let mut dialog = app
        .dialog()
        .file()
        .set_title("Save")
        .set_file_name(&file_name)
        .set_can_create_directories(true);
    if let Some(ext) = Path::new(&file_name).extension().and_then(|e| e.to_str()) {
        let label = ext.to_uppercase();
        dialog = dialog.add_filter(label, &[ext]);
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.save_file(move |picked| {
        let _ = tx.send(picked);
    });
    let target: PathBuf = rx.await.ok()??.into_path().ok()?;

    match tokio::fs::write(&target, &bytes).await {
        Ok(()) => Some(target.to_string_lossy().into_owned()),
        Err(e) => {
            eprintln!("save_file: could not write {}: {e}", target.display());
            None
        }
    }
}

/// Plain base64, or a `data:<type>;base64,<data>` URL, to bytes.
fn decode_payload(payload: &str) -> Result<Vec<u8>, base64::DecodeError> {
    let encoded = match payload.find("base64,") {
        Some(at) => &payload[at + "base64,".len()..],
        None => payload,
    };
    BASE64.decode(encoded.trim())
}

/// The file name the Save panel suggests: the last part of `name`, or a default.
fn suggested_name(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("mock-draft-2027")
        .to_string()
}

/// Turns a relative path from the web side into a path inside the app data folder.
fn data_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let rel = safe_relative(path).ok_or_else(|| format!("path not allowed: {path}"))?;
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data folder: {e}"))?;
    Ok(base.join(rel))
}

/// Accepts only plain relative paths such as `data/meta.json`: `/`-separated names, no
/// absolute paths, no `..` or `.` parts, no empty parts, no drive prefixes, no
/// backslashes and no NUL bytes.
pub(crate) fn safe_relative(path: &str) -> Option<&Path> {
    if path.contains('\\') || path.contains('\0') {
        return None;
    }
    if path
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    let rel = Path::new(path);
    let plain = !rel.is_absolute()
        && !rel.has_root()
        && rel.components().all(|c| matches!(c, Component::Normal(_)));
    plain.then_some(rel)
}

/// Writes `bytes` to a temporary file beside `file`, then renames it into place.
pub(crate) async fn write_atomic(file: &Path, bytes: &[u8]) -> std::io::Result<()> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    if let Some(dir) = file.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let mut tmp = file.as_os_str().to_owned();
    tmp.push(format!(
        ".{}-{}.part",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let tmp = PathBuf::from(tmp);
    if let Err(e) = tokio::fs::write(&tmp, bytes).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(e);
    }
    if let Err(e) = tokio::fs::rename(&tmp, file).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(e);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{decode_payload, safe_relative, suggested_name};

    #[test]
    fn save_payloads_decode() {
        assert_eq!(decode_payload("aGk=").unwrap(), b"hi");
        assert_eq!(
            decode_payload("data:image/png;base64,aGk=\n").unwrap(),
            b"hi"
        );
        assert!(decode_payload("not base64!").is_err());
    }

    #[test]
    fn suggested_names_drop_folders() {
        assert_eq!(suggested_name("my-class.png"), "my-class.png");
        assert_eq!(suggested_name("../../x/board.json"), "board.json");
        assert_eq!(suggested_name(""), "mock-draft-2027");
        assert_eq!(suggested_name(".."), "mock-draft-2027");
    }

    #[test]
    fn plain_relative_paths_pass() {
        assert!(safe_relative("data/meta.json").is_some());
        assert!(safe_relative("meta.json").is_some());
        assert!(safe_relative("data/sub/file.json").is_some());
    }

    #[test]
    fn escapes_are_refused() {
        for bad in [
            "",
            "/etc/passwd",
            "../secret",
            "data/../../x",
            "./data/meta.json",
            "data/./meta.json",
            "data\\meta.json",
            "data/\0meta.json",
            "..",
            "/",
            "data//meta.json",
            "data/",
        ] {
            assert!(safe_relative(bad).is_none(), "{bad:?} should be refused");
        }
    }
}
