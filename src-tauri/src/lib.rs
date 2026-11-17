// TODO (milestone 2):
// - read the file path from the command line (double-click / "Open with")
// - single-instance: a second launch sends its path to the open window
// - send the path to the frontend

/// Read a model file from disk and hand its raw bytes to the frontend.
/// Used for files dropped onto the window (Tauri gives us their paths).
#[tauri::command]
fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| format!("Could not read {path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_file])
        .run(tauri::generate_context!())
        .expect("error while running Lighter");
}
