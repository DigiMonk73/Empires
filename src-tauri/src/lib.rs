//! Empires desktop shell. Normal mode opens one window with the game. `--smoke-test` mode (used by the
//! verify gate) opens a hidden window with no Dock icon, lets the page render a few frames, prints the page's
//! JSON report to stdout, and exits 0 on success — it never takes focus or shows anything on screen.

use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn smoke_report(app: AppHandle, report: String) {
    println!("SMOKE_REPORT {report}");
    let ok = serde_json::from_str::<serde_json::Value>(&report)
        .ok()
        .and_then(|v| v.get("ok").and_then(|b| b.as_bool()))
        .unwrap_or(false);
    app.exit(if ok { 0 } else { 1 });
}

pub fn run() {
    let smoke = std::env::args().any(|a| a == "--smoke-test");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![smoke_report])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            if smoke {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            let url = if smoke { "index.html?smoke=1&debug=1&edgeScroll=0" } else { "index.html" };
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(url.into()))
                .title("Empires")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .visible(!smoke)
                .focused(!smoke)
                .build()?;
            if !smoke {
                window.maximize().ok();
            }
            if smoke {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(90));
                    eprintln!("SMOKE_TIMEOUT no report within 90 s");
                    handle.exit(3);
                });
            }
            let _ = app.get_webview_window("main");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Empires");
}
