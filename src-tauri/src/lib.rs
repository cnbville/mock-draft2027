//! Mock Draft 2027, the Mac app shell.
//!
//! The web app in `../app` runs unchanged inside the window (see `app/js/platform.js`).
//! This side adds three things the browser can't do:
//! - `store_read` / `store_write`: text files in the app data folder. The newest data set
//!   downloaded from GitHub lives there, so the app works offline with the last copy.
//! - `save_file`: the native Save panel, for exports (the class card image, board JSON).
//! - the `img://` scheme: remote photos and logos, saved in the app cache folder after the
//!   first load and served from disk after that.

mod img;
mod store;

/// Builds and runs the app. Called by `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("img", |ctx, request, responder| {
            img::handle(ctx.app_handle().clone(), request, responder)
        })
        .invoke_handler(tauri::generate_handler![
            store::store_read,
            store::store_write,
            store::save_file
        ])
        .run(tauri::generate_context!())
        .expect("Mock Draft 2027 could not start");
}
