// Tauri 2 entry point. We deliberately keep the Rust side minimal — every
// piece of business logic lives in the React frontend so the app stays
// portable across Win/macOS/Linux without per-platform Rust forks.
//
// The plugins below register the JS-facing APIs:
//   - tauri-plugin-store   → persistent key/value on disk (chats, settings)
//   - tauri-plugin-shell   → open external links in the user's browser
//   - tauri-plugin-dialog  → native message boxes (delete confirmations etc.)
//   - tauri-plugin-updater → background download of signed update bundles
//   - tauri-plugin-process → relaunch() after install

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
