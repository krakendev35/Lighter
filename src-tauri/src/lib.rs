use std::path::Path;
use tauri::{Emitter, Manager};

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
        .invoke_handler(tauri::generate_handler![startup_file, read_file])
        .run(tauri::generate_context!())
        .expect("error while running Lighter");
}
