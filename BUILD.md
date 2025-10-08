# Ellora Build Process

This document describes the complete build process for the Ellora desktop application, which combines a React frontend with a Tauri wrapper and a Rust-based AI Gateway backend.

## Architecture Overview

Ellora consists of three main components:

1. **Frontend (React + TypeScript + Vite)** - UI layer
2. **Tauri Desktop App (Rust)** - Native desktop wrapper
3. **AI Gateway Backend (Rust)** - API server for AI model interactions

## Prerequisites

- **Node.js** (v18+)
- **pnpm** package manager
- **Rust** (latest stable)
- **Cargo** (comes with Rust)
- **Git** (for submodule management)

## Initial Setup

Before building, ensure the ai-gateway submodule is properly initialized:

```bash
# Clone the repository
git clone https://github.com/langdb/llm-studio-ui.git
cd ellora-ui

# Initialize and update submodules (automatically checks out feat/oss-refactor branch)
git submodule update --init --recursive

# Configure backend (required for API keys)
cd ai-gateway
cp .env.example .env
cp config.sample.yaml config.yaml
# Edit .env and config.yaml with your API keys and settings
cd ..

# Install frontend dependencies
pnpm install
```

**Note:** The ai-gateway submodule is configured to track the `feat/oss-refactor` branch automatically via `.gitmodules`. You don't need to manually switch branches.

**Why `feat/oss-refactor` branch?**
- This branch contains the open-source refactored version of the ai-gateway
- The main branch may have different dependencies or configurations
- Required for compatibility with the Ellora desktop app
- Configured in `.gitmodules` to track this branch automatically

## Project Structure

```
ellora-ui/
├── src/                    # React frontend source
├── src-tauri/              # Tauri desktop app
│   └── src/
│       └── lib.rs         # Main Tauri application logic
├── ai-gateway/             # AI Gateway backend (git submodule)
│   └── target/release/
│       └── ai-gateway     # Compiled backend binary
├── dist/                   # Built frontend (generated)
└── package.json           # Frontend dependencies & scripts
```

## Build Scripts

### Available Commands

```bash
# Development
pnpm dev                    # Start Vite dev server (frontend only)
pnpm start:backend         # Start backend only (port 8080)
pnpm tauri:dev             # Start Tauri in dev mode (full app)

# Production Build
pnpm build                 # Build frontend only (outputs to dist/)
pnpm tauri:build           # Build Tauri app (uses dist/)
pnpm build-app             # Complete build (backend + frontend + Tauri)
```

## Complete Build Process

### 0. Backend Only Mode (`pnpm start:backend`)

**Use case:** Testing backend independently, API development, or debugging backend issues.

**What happens:**
1. Starts ai-gateway server on port 8080
2. No frontend or Tauri app
3. Backend accessible at `http://localhost:8080`

**Command:**
```bash
pnpm start:backend
  ↓
cd ai-gateway && cargo run --release -- serve --port 8080
  ↓
Backend starts on http://localhost:8080
  ↓
Test endpoints:
  - http://localhost:8080/v1/models
  - http://localhost:8080/providers
  - http://localhost:8080/projects
```

**Common use cases:**
- Testing API endpoints with Postman/curl
- Running backend for separate frontend development
- Debugging backend without UI
- Performance testing

**Example API test:**
```bash
# In terminal 1
pnpm start:backend

# In terminal 2
curl http://localhost:8080/v1/models
```

### 1. Development Mode (`pnpm tauri:dev`)

**What happens:**

1. **Frontend**: Vite dev server starts on `http://localhost:5173`
2. **Backend**: Cargo runs `ai-gateway` from source in dev mode
3. **Tauri**: Opens desktop window pointing to Vite dev server
4. **Hot reload**: Frontend changes reflect immediately

**Command flow:**
```bash
pnpm tauri:dev
  ↓
beforeDevCommand: "pnpm run dev" (starts Vite)
  ↓
Tauri runs and executes setup in lib.rs
  ↓
Finds available port (8080-8090)
  ↓
Spawns backend: cargo run --release -- serve --port <PORT>
  ↓
Polls backend health endpoint
  ↓
Shows window when backend is ready
```

**Backend startup (dev mode):**
- Runs from `ai-gateway/` directory via `cargo run`
- Uses dynamic port allocation (8080-8090)
- Frontend fetches port via Tauri IPC command `get_backend_port`

### 2. Production Build (`pnpm build-app`)

**What happens:**

1. **AI Gateway Build**: Compiles backend binary
2. **Frontend Build**: Bundles React app for production
3. **Tauri Build**: Creates native macOS/Windows/Linux app
4. **Bundle**: Packages everything into distributable format

**Complete command flow:**

```bash
pnpm build-app
  ↓
1. cd ai-gateway && cargo build --release
   → Builds ai-gateway binary at ai-gateway/target/release/ai-gateway
  ↓
2. pnpm tauri:build
  ↓
  2a. beforeBuildCommand: "pnpm run build && cd ai-gateway && cargo build --release"
      → pnpm run build: tsc && vite build
         - TypeScript compilation
         - Vite bundling to dist/
      → Backend rebuild (ensures latest binary)
  ↓
  2b. Tauri build process
      - Compiles Rust Tauri app (src-tauri/)
      - Bundles frontend (dist/) into app resources
      - Bundles backend binary (ai-gateway/target/release/ai-gateway)
      - Creates platform-specific installers
  ↓
3. Output
   → macOS: Ellora.app + Ellora_0.1.0_aarch64.dmg
   → Windows: Ellora.exe + installer
   → Linux: AppImage / deb / rpm
```

### Build Artifacts

**Development:**
- No artifacts (runs from source)

**Production:**
```
src-tauri/target/release/
├── bundle/
│   ├── macos/
│   │   └── Ellora.app              # macOS application bundle
│   └── dmg/
│       └── Ellora_0.1.0_aarch64.dmg # macOS installer
├── app                              # Tauri binary
└── [platform-specific bundles]
```

## Dynamic Port Allocation

### Problem
The backend runs on port 8080, but this port might already be in use.

### Solution
The application dynamically allocates an available port:

1. **Port Discovery** (Rust - `src-tauri/src/lib.rs`):
   ```rust
   // Try ports 8080-8090
   let backend_port = find_available_port(8080, 10)
     .expect("Failed to find an available port");
   ```

2. **Backend Startup**:
   ```rust
   Command::new("cargo")
     .arg("serve")
     .arg("--port")
     .arg(backend_port.to_string())
     .spawn()
   ```

3. **Frontend Port Fetch** (`src/config/api.ts`):
   ```typescript
   // Called on app startup
   export async function initializeBackendPort() {
     backendPort = await invoke<number>('get_backend_port');
   }
   ```

4. **Dynamic API URLs**:
   ```typescript
   export function getBackendUrl() {
     return `http://localhost:${backendPort}`;
   }
   ```

### Port Allocation Flow

```
App Start
  ↓
Check port 8080 available?
  ├─ Yes → Use 8080
  └─ No → Try 8081, 8082... up to 8090
  ↓
Backend starts on available port
  ↓
Health check polls: http://localhost:<PORT>/v1/models
  ↓
Backend ready → Window shows
  ↓
Frontend calls get_backend_port() → Gets actual port
  ↓
All API calls use dynamic port
```

## Backend Bundling

### Development Mode
- Backend runs from source: `cargo run --release -- serve --port <PORT>`
- Location: `../ai-gateway` (relative to `src-tauri`)

### Production Mode
- Backend binary bundled as resource
- Location in bundle: `<app>/Contents/Resources/ai-gateway` (macOS)
- Configuration in `src-tauri/tauri.conf.json`:
  ```json
  "bundle": {
    "resources": [
      "../ai-gateway/target/release/ai-gateway"
    ]
  }
  ```

## Window Visibility Management

The app window starts **hidden** and only shows when the backend is ready:

1. **Initial State** (`tauri.conf.json`):
   ```json
   "windows": [{
     "visible": false  // Window hidden on start
   }]
   ```

2. **Health Check Loop** (`lib.rs`):
   ```rust
   // Poll every 2 seconds, max 60 retries (2 minutes)
   loop {
     match client.get(&health_url).send().await {
       Ok(response) if response.is_success() => {
         window.show();  // Show when ready
         break;
       }
       _ => tokio::time::sleep(Duration::from_secs(2)).await
     }
   }
   ```

### Timeline
```
[0s]   App starts → Window hidden
[0s]   Backend spawns on available port
[0-5s] React loads in hidden window
[0-5s] Backend initializes (DB, models, providers)
[~5s]  Backend ready → Health check succeeds
[~5s]  Window shows → User sees app
[~5s]  Frontend gets backend port → All API calls work
```

## Configuration Files

### Backend Configuration

The backend requires two configuration files in the `ai-gateway/` directory:

#### 1. **ai-gateway/.env** (API Keys)

**Location:**
- **Dev mode**: `ai-gateway/.env` (runs from submodule directory)
- **Production**: Bundled in app resources (copied from `ai-gateway/.env`)

**Setup:**
```bash
cd ai-gateway
cp .env.example .env
# Edit .env with your API keys
```

**Example:**
```bash
LANGDB_OPENAI_API_KEY=sk-your-key-here
LANGDB_ANTHROPIC_API_KEY=sk-ant-your-key-here
LANGDB_GEMINI_API_KEY=your-gemini-key
# ... other provider keys
```

**Important:**
- `.env` is gitignored - never commit API keys
- Each user/developer must create their own `.env` file
- Production builds bundle this file into the app

#### 2. **ai-gateway/config.yaml** (Server Config)

**Location:**
- **Dev mode**: `ai-gateway/config.yaml`
- **Production**: Bundled in app resources

**Setup:**
```bash
cd ai-gateway
cp config.sample.yaml config.yaml
# Edit config.yaml with your settings
```

**Example:**
```yaml
http:
  host: "0.0.0.0"
  port: 8080  # Overridden by --port flag from Tauri

# Optional: ClickHouse integration
# clickhouse:
#   url: http://localhost:8123

# Optional: Cost controls
# cost_control:
#   daily: 10
#   monthly: 100
```

### Frontend Configuration (Optional)

Create `.env` in project root for frontend-specific settings:

```bash
VITE_LANGDB_API_URL=        # Optional: Override backend URL
VITE_LANGDB_API_KEY=        # Optional: LangDB API key
VITE_LANGDB_PROJECT_ID=     # Optional: LangDB Project ID
VITE_CONNECT_LOCAL=true     # Use local backend
```

### Configuration File Locations

| Mode | Backend .env | Backend config.yaml | Frontend .env |
|------|--------------|---------------------|---------------|
| **Dev** | `ai-gateway/.env` | `ai-gateway/config.yaml` | `.env` (project root) |
| **Production** | Bundled in app resources | Bundled in app resources | N/A (compiled into JS) |

**How it works:**
1. **Dev mode**: Backend runs with `.current_dir("ai-gateway")`, finds config files in submodule
2. **Production**: Config files bundled into `<app>/Contents/Resources/` (macOS) alongside backend binary
3. Backend working directory set to resource dir, finds config files automatically

## Troubleshooting

### Build fails: "ai-gateway directory not found"
**Issue**: ai-gateway submodule not initialized
**Fix**:
```bash
# Initialize submodule (will automatically checkout feat/oss-refactor)
git submodule update --init --recursive
```

**Verify correct setup:**
```bash
cd ai-gateway
git branch  # Should show: * feat/oss-refactor
```

**Note:** The branch is configured in `.gitmodules`, so `git submodule update` will automatically checkout the correct branch.

### Build fails: TypeScript errors
**Issue**: Unused imports or type errors
**Fix**:
```bash
pnpm run build  # See specific errors
```

### Backend doesn't start
**Issue**: Port 8080-8090 all in use
**Fix**: Free up ports or increase range in `lib.rs`
```bash
# Check what's using ports
lsof -ti:8080-8090

# Kill processes
lsof -ti:8080 | xargs kill -9
```

### Window doesn't show
**Issue**: Backend failed to start within 2 minutes
**Check**: Terminal logs for backend errors
**Fix**: Check backend can start manually:
```bash
cd ai-gateway
cargo run --release -- serve --port 8080
```

### "Failed to Load Local Models"
**Issue**: Frontend can't reach backend
**Debug**:
1. Open DevTools (Inspect)
2. Check Console for port initialization logs
3. Check Network tab for failed API calls
4. Verify `getBackendUrl()` returns correct port

### Backend fails: "Config file not found"
**Issue**: Missing `config.yaml` or `.env` in ai-gateway directory
**Fix**:
```bash
cd ai-gateway

# Create config files from samples
cp config.sample.yaml config.yaml
cp .env.example .env

# Edit with your settings
# For .env: Add your API keys
# For config.yaml: Configure host, port, etc.
```

### Production build: Backend can't find API keys
**Issue**: `.env` or `config.yaml` not bundled correctly
**Check**:
```bash
# Verify files exist before building
ls -la ai-gateway/.env ai-gateway/config.yaml

# Check bundled resources (after build)
# macOS:
open src-tauri/target/release/bundle/macos/Ellora.app/Contents/Resources/
```
**Fix**: Ensure `ai-gateway/.env` and `ai-gateway/config.yaml` exist before running `pnpm build-app`

## Platform-Specific Notes

### macOS
- **Output**: `.app` bundle + `.dmg` installer
- **Location**: `src-tauri/target/release/bundle/macos/`
- **Binary location**: `Ellora.app/Contents/Resources/ai-gateway`
- **Warning**: Bundle identifier ends with `.app` (conflicts with extension)

### Windows
- **Output**: `.exe` + `.msi` installer
- **Location**: `src-tauri/target/release/bundle/msi/`

### Linux
- **Output**: `.AppImage`, `.deb`, `.rpm`
- **Location**: `src-tauri/target/release/bundle/appimage/`

## Build Performance

Typical build times (M1 Mac):
- **Frontend build**: ~4s (Vite)
- **Backend build**: ~3-4 min (Rust, first build)
- **Backend rebuild**: ~1s (incremental)
- **Tauri build**: ~1-2 min
- **Total fresh build**: ~5-6 min
- **Total incremental**: ~2-3 min

## CI/CD Recommendations

```bash
# Install dependencies
pnpm install

# Initialize submodules (automatically checks out feat/oss-refactor)
git submodule update --init --recursive

# Lint & Test
pnpm run build  # Check TypeScript
cd ai-gateway && cargo test && cd ..
cd src-tauri && cargo test && cd ..

# Build
pnpm build-app

# Package
# Output in: src-tauri/target/release/bundle/
```

## Related Files

- `package.json` - npm scripts and dependencies
- `.gitmodules` - Git submodule configuration (tracks feat/oss-refactor branch)
- `src-tauri/tauri.conf.json` - Tauri configuration
- `src-tauri/Cargo.toml` - Tauri Rust dependencies
- `src-tauri/src/lib.rs` - Main Tauri app logic
- `ai-gateway/Cargo.toml` - Backend dependencies
- `vite.config.ts` - Frontend build configuration
