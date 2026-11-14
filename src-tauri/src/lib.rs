// Replaces src-tauri/src/lib.rs once image_ops.rs is added next to it (see rust-phase2/README.md).
mod image_ops;

/// Example command, callable from the React app as `invoke("app_info")`.
#[derive(serde::Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "VibeBook",
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![app_info, image_ops::process_image])
        .run(tauri::generate_context!())
        .expect("error while running VibeBook");
}
