use std::process::Command;
use std::time::Duration;
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use tauri_plugin_log::{Target, TargetKind};

/// Application state to store the backend port
struct AppState {
  backend_port: Arc<Mutex<u16>>,
}

/// Tauri command to get the backend port
#[tauri::command]
fn get_backend_port(state: State<AppState>) -> u16 {
  *state.backend_port.lock().unwrap()
}

/// Check if a port is available
fn is_port_available(port: u16) -> bool {
  TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Find an available port starting from the given port
fn find_available_port(start_port: u16, max_attempts: u16) -> Option<u16> {
  for port in start_port..(start_port + max_attempts) {
    if is_port_available(port) {
      return Some(port);
    }
  }
  None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Find an available port for the backend before building the app
  let backend_port = find_available_port(8080, 10)
    .expect("Failed to find an available port for backend (tried 8080-8090)");

  let app_state = AppState {
    backend_port: Arc::new(Mutex::new(backend_port)),
  };

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(app_state)
    .invoke_handler(tauri::generate_handler![get_backend_port])
    .setup(move |app| {
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir { file_name: None }),
          ])
          .build(),
      )?;

      log::info!("Using port {} for AI Gateway backend", backend_port);

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
          .arg("--port")
          .arg(backend_port.to_string())
          .current_dir(&backend_path)
          .spawn()
      } else {
        // In production, use bundled binary
        let resource_dir = app.path().resource_dir()
          .expect("Failed to get resource directory");

        let backend_binary = resource_dir.join("ai-gateway");

        // Set working directory to resource dir so backend can find config files
        log::info!("Starting AI Gateway backend (production) from: {:?}", backend_binary);
        log::info!("Backend working directory: {:?}", resource_dir);

        Command::new(&backend_binary)
          .arg("serve")
          .arg("--port")
          .arg(backend_port.to_string())
          .current_dir(&resource_dir)
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
            let health_url = format!("http://localhost:{}/v1/models", backend_port);

            loop {
              match client.get(&health_url).send().await {
                Ok(response) if response.status().is_success() => {
                  log::info!("AI Gateway backend is ready on port {}!", backend_port);

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
                    log::error!("Backend failed to start after {} seconds on port {}", max_retries * 2, backend_port);
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
