use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

/// How deep and how many files `index_folder` looks at, so opening a model
/// that sits in e.g. the Downloads folder stays fast.
const INDEX_MAX_DEPTH: usize = 3;
const INDEX_MAX_FILES: usize = 5000;

/// Pick the file path out of a command line (`Lighter.exe "C:\models\part.stl"`).
/// Windows passes the file as the first non-flag argument when you double-click
/// a file or use "Open with". Relative paths are resolved against `cwd`.
fn file_from_args(args: &[String], cwd: &Path) -> Option<String> {
    args.iter()
        .skip(1) // skip the program itself
        .find(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a).to_string_lossy().into_owned())
}

/// Called by the frontend once at start-up: the file this launch should open, if any.
#[tauri::command]
fn startup_file() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    file_from_args(&args, &cwd)
}

/// Read a model file from disk and hand its raw bytes to the frontend.
#[tauri::command]
fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("Could not read {path}: {e}"))
}

/// Prepare loading the textures / .mtl / .bin files that sit next to a model:
/// - lets the webview load files from the model's folder (asset protocol), and
/// - returns the files in that folder (relative paths, a few levels deep),
///   so the frontend can find textures even when the model names them by an
///   old absolute path from the artist's computer.
#[tauri::command]
fn index_folder(app: tauri::AppHandle, model_path: String) -> Result<Vec<String>, String> {
    let dir = Path::new(&model_path)
        .parent()
        .ok_or("Model has no parent folder")?
        .to_path_buf();

    app.asset_protocol_scope()
        .allow_directory(&dir, true)
        .map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    collect_files(&dir, &dir, 0, &mut files);
    Ok(files)
}

fn collect_files(root: &Path, dir: &Path, depth: usize, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if out.len() >= INDEX_MAX_FILES {
            return;
        }
        let path: PathBuf = entry.path();
        if path.is_dir() {
            if depth < INDEX_MAX_DEPTH {
                collect_files(root, &path, depth + 1, out);
            }
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first. When Lighter is already open and the user
        // double-clicks another file, the new launch exits immediately and this
        // callback runs in the existing window instead.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(path) = file_from_args(&args, Path::new(&cwd)) {
                let _ = app.emit("open-file", path);
            }
        }))
        .plugin(tauri_plugin_dialog::init()) // native Open dialog (Ctrl+O)
        .invoke_handler(tauri::generate_handler![startup_file, read_file, index_folder])
        .run(tauri::generate_context!())
        .expect("error while running Lighter");
}
