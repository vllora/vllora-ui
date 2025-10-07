fn main() {
    tauri_build::build();

    // In release mode, ensure backend binary is included
    if std::env::var("PROFILE").unwrap_or_default() == "release" {
        let backend_binary = "../ai-gateway/target/release/ai-gateway";
        if std::path::Path::new(backend_binary).exists() {
            println!("cargo:rustc-env=BACKEND_BINARY_PATH={}", backend_binary);
            println!("cargo:rerun-if-changed={}", backend_binary);
        } else {
            eprintln!("Warning: Backend binary not found at {}", backend_binary);
            eprintln!("Run: cd ai-gateway && cargo build --release");
        }
    }
}
