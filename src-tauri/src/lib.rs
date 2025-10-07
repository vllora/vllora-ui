use std::process::Command;
use std::time::Duration;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Start AI Gateway backend server
      let backend_binary = if cfg!(debug_assertions) {
        // In dev mode, use cargo run from the ai-gateway submodule
        // Get the project root (parent of src-tauri)
        let project_root = std::env::current_dir()
          .expect("Failed to get current directory")
          .parent()
          .expect("Failed to get parent directory")
          .to_path_buf();

        let backend_path = project_root.join("ai-gateway");

        log::info!("Starting AI Gateway backend (dev mode) from: {:?}", backend_path);

        Command::new("cargo")
          .arg("run")
          .arg("--release")
          .arg("--")
          .arg("serve")
          .current_dir(&backend_path)
          .spawn()
      } else {
        // In production, use bundled binary
        let resource_path = app.path().resource_dir()
          .expect("Failed to get resource directory")
          .join("ai-gateway");

        log::info!("Starting AI Gateway backend (production) from: {:?}", resource_path);

        Command::new(&resource_path)
          .arg("serve")
          .spawn()
      };

      match backend_binary {
        Ok(_child) => {
          log::info!("AI Gateway backend process spawned, waiting for it to be ready...");

          // Wait for backend to be ready by polling the health endpoint
          let app_handle = app.handle().clone();
          tauri::async_runtime::spawn(async move {
            let client = reqwest::Client::new();
            let max_retries = 60; // Wait up to 2 minutes (60 * 2s = 120s)
            let mut retries = 0;

            loop {
              match client.get("http://localhost:8080/v1/models").send().await {
                Ok(response) if response.status().is_success() => {
                  log::info!("AI Gateway backend is ready!");

                  // Show the main window
                  if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                  }
                  break;
                }
                _ => {
                  retries += 1;
                  if retries >= max_retries {
                    log::error!("Backend failed to start after {} seconds", max_retries * 2);
                    // Show window anyway so user can see the error
                    if let Some(window) = app_handle.get_webview_window("main") {
                      let _ = window.show();
                    }
                    break;
                  }
                  tokio::time::sleep(Duration::from_secs(2)).await;
                }
              }
            }
          });
        }
        Err(e) => {
          log::error!("Failed to start AI Gateway backend: {}", e);
          // Show window anyway so user can see the error
          if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
          }
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
