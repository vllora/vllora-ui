use std::time::Duration;
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State, Emitter};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_shell::ShellExt;

/// Backend status for event emission
#[derive(Clone, serde::Serialize)]
struct BackendStatus {
  ready: bool,
  port: u16,
  error: Option<String>,
}

/// Application state to store the backend port and sidecar PID
struct AppState {
  backend_port: Arc<Mutex<u16>>,
  backend_pid: Arc<Mutex<Option<u32>>>,
  restart_count: Arc<Mutex<u32>>,
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

/// Start the backend sidecar
fn start_backend_sidecar(app: &tauri::AppHandle, backend_port: u16) -> Result<u32, String> {
  let sidecar_result = if cfg!(debug_assertions) {
    // In dev mode, use cargo run from the ai-gateway submodule
    log::info!("Starting AI Gateway backend (dev mode) via cargo run");

    let project_root = std::env::current_dir()
      .map_err(|e| format!("Failed to get current directory: {}", e))?
      .parent()
      .ok_or("Failed to get parent directory")?
      .to_path_buf();

    let backend_path = project_root.join("ai-gateway");

    app.shell()
      .command("cargo")
      .args(["run", "--release", "--", "serve", "--port", &backend_port.to_string()])
      .current_dir(&backend_path)
      .spawn()
  } else {
    // In production, use bundled sidecar binary
    log::info!("Starting AI Gateway backend (production) via sidecar");

    let resource_dir = app.path().resource_dir()
      .map_err(|e| format!("Failed to get resource directory: {}", e))?;

    // Config files are bundled in _up_/ai-gateway/ due to relative path
    let backend_config_dir = resource_dir.join("_up_").join("ai-gateway");

    log::info!("Resource directory: {:?}", resource_dir);
    log::info!("Backend config directory: {:?}", backend_config_dir);

    // Check if config files exist
    let env_file = backend_config_dir.join(".env");
    let config_file = backend_config_dir.join("config.yaml");
    log::info!("Checking for .env at: {:?} - exists: {}", env_file, env_file.exists());
    log::info!("Checking for config.yaml at: {:?} - exists: {}", config_file, config_file.exists());

    // Get HOME directory to pass to backend
    let home_dir = std::env::var("HOME")
      .or_else(|_| app.path().home_dir().map(|p| p.to_string_lossy().to_string()))
      .unwrap_or_else(|_| "/tmp".to_string());

    log::info!("Setting HOME for backend: {}", home_dir);

    app.shell()
      .sidecar("ai-gateway")
      .map_err(|e| format!("Failed to create ai-gateway sidecar command: {}", e))?
      .args(["serve", "--port", &backend_port.to_string()])
      .current_dir(&backend_config_dir)
      .env("HOME", home_dir)
      .spawn()
  };

  match sidecar_result {
    Ok((mut rx, child)) => {
      let pid = child.pid();
      log::info!("AI Gateway backend sidecar spawned (PID: {})", pid);

      // Spawn a task to read and log backend output
      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
              log::info!("[Backend stdout] {}", String::from_utf8_lossy(&line));
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
              log::error!("[Backend stderr] {}", String::from_utf8_lossy(&line));
            }
            tauri_plugin_shell::process::CommandEvent::Error(err) => {
              log::error!("[Backend error] {}", err);
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
              log::warn!("[Backend terminated] code: {:?}, signal: {:?}", payload.code, payload.signal);
              break;
            }
            _ => {}
          }
        }
      });

      Ok(pid)
    }
    Err(e) => {
      log::error!("Failed to spawn AI Gateway backend: {}", e);
      Err(format!("Failed to spawn backend: {}", e))
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Find an available port for the backend before building the app
  let backend_port = find_available_port(8080, 10)
    .expect("Failed to find an available port for backend (tried 8080-8090)");

  let app_state = AppState {
    backend_port: Arc::new(Mutex::new(backend_port)),
    backend_pid: Arc::new(Mutex::new(None)),
    restart_count: Arc::new(Mutex::new(0)),
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

      // Start the backend sidecar
      match start_backend_sidecar(&app.handle(), backend_port) {
        Ok(pid) => {
          log::info!("AI Gateway backend sidecar spawned, waiting for it to be ready...");

          // Store the sidecar PID in app state
          if let Some(state) = app.try_state::<AppState>() {
            *state.backend_pid.lock().unwrap() = Some(pid);
          }

          // Emit initial status event
          let _ = app.emit("backend-status", BackendStatus {
            ready: false,
            port: backend_port,
            error: None,
          });

          // Wait for backend to be ready by polling the health endpoint with auto-restart
          let app_handle = app.handle().clone();
          tauri::async_runtime::spawn(async move {
            let client = reqwest::Client::new();
            let max_retries = 60; // Wait up to 2 minutes (60 * 2s = 120s)
            let mut retries = 0;
            let health_url = format!("http://localhost:{}/v1/models", backend_port);

            // Initial startup health check
            loop {
              match client.get(&health_url).send().await {
                Ok(response) if response.status().is_success() => {
                  log::info!("AI Gateway backend is ready on port {}!", backend_port);

                  // Emit ready status
                  let _ = app_handle.emit("backend-status", BackendStatus {
                    ready: true,
                    port: backend_port,
                    error: None,
                  });

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

                    // Emit error status
                    let _ = app_handle.emit("backend-status", BackendStatus {
                      ready: false,
                      port: backend_port,
                      error: Some("Backend failed to start within timeout".to_string()),
                    });

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

            // Continuous health monitoring after initial startup
            if retries < max_retries {
              tokio::time::sleep(Duration::from_secs(10)).await; // Start monitoring after 10s

              loop {
                tokio::time::sleep(Duration::from_secs(5)).await; // Check every 5 seconds

                match client.get(&health_url).send().await {
                  Ok(response) if response.status().is_success() => {
                    // Backend is healthy, continue monitoring
                  }
                  _ => {
                    // Backend is down! Attempt restart
                    log::warn!("Backend health check failed, attempting restart...");

                    if let Some(state) = app_handle.try_state::<AppState>() {
                      // Check restart count and increment if needed
                      let should_restart = {
                        let mut restart_count = state.restart_count.lock().unwrap();
                        if *restart_count < 3 {
                          *restart_count += 1;
                          Some(*restart_count)
                        } else {
                          None
                        }
                      }; // Lock is dropped here

                      if let Some(attempt) = should_restart {
                        log::info!("Restarting backend (attempt {} of 3)", attempt);

                        // Emit crashed status
                        let _ = app_handle.emit("backend-status", BackendStatus {
                          ready: false,
                          port: backend_port,
                          error: Some(format!("Backend crashed, restarting... (attempt {})", attempt)),
                        });

                        // Try to restart
                        match start_backend_sidecar(&app_handle, backend_port) {
                          Ok(new_pid) => {
                            // Store new PID
                            *state.backend_pid.lock().unwrap() = Some(new_pid);
                            log::info!("Backend restarted successfully with PID: {}", new_pid);

                            // Wait for it to be ready
                            tokio::time::sleep(Duration::from_secs(5)).await;

                            // Emit ready status if health check passes
                            if let Ok(response) = client.get(&health_url).send().await {
                              if response.status().is_success() {
                                let _ = app_handle.emit("backend-status", BackendStatus {
                                  ready: true,
                                  port: backend_port,
                                  error: None,
                                });
                              }
                            }
                          }
                          Err(e) => {
                            log::error!("Failed to restart backend: {}", e);
                            let _ = app_handle.emit("backend-status", BackendStatus {
                              ready: false,
                              port: backend_port,
                              error: Some(format!("Failed to restart: {}", e)),
                            });
                          }
                        }
                      } else {
                        log::error!("Backend restart limit reached (3 attempts), giving up");
                        let _ = app_handle.emit("backend-status", BackendStatus {
                          ready: false,
                          port: backend_port,
                          error: Some("Backend restart limit reached".to_string()),
                        });
                        break; // Stop monitoring
                      }
                    }
                  }
                }
              }
            }
          });
        }
        Err(e) => {
          log::error!("Failed to start AI Gateway backend: {}", e);

          // Emit error status
          let _ = app.emit("backend-status", BackendStatus {
            ready: false,
            port: backend_port,
            error: Some(e.clone()),
          });

          // Show window anyway so user can see the error
          if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
          }
        }
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        // Kill backend sidecar when window close is requested
        if let Some(state) = window.try_state::<AppState>() {
          if let Some(pid) = state.backend_pid.lock().unwrap().take() {
            log::info!("Terminating AI Gateway backend sidecar (PID: {})...", pid);
            #[cfg(unix)]
            {
              // On Unix systems, use SIGTERM for graceful shutdown
              unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
              }
              // Wait a bit for graceful shutdown
              std::thread::sleep(Duration::from_millis(500));
              // Force kill if still running
              unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
              }
            }
            #[cfg(windows)]
            {
              // On Windows, use taskkill
              let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .output();
            }
            log::info!("AI Gateway backend sidecar terminated");
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
