// TODO (milestone 2):
// - read the file path from the command line (double-click / "Open with")
// - single-instance: a second launch sends its path to the open window
// - send the path to the frontend

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Lighter");
}
