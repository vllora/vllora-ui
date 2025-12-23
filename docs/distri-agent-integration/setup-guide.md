# Complete Setup Guide

This guide walks you through setting up the entire multi-agent system from scratch.

## Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  (React App)    │     │  (Agent Runtime)│     │   (Rust API)    │
│  localhost:5173 │     │  localhost:8081 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
      │                        │                        │
      │ @distri/react          │ Agents                 │ /traces, /runs
      │ Chat, useAgent         │ vllora-main-agent      │ /spans, /groups
      └────────────────────────┴────────────────────────┘
```

---

## Step 1: Install Dependencies

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui

# Install Distri packages
pnpm add @distri/core @distri/react
```

> **Note:** The `@distri/core` and `@distri/react` packages must be published from the Distri project first.
> If they don't exist yet, you'll need to either:
> 1. Build and publish them from the Distri repo, OR
> 2. Use local linking: `pnpm link ../distri/packages/core ../distri/packages/react`
>
> The packages should export:
> - `@distri/core`: `DistriClient`, types
> - `@distri/react`: `DistriProvider`, `useDistriClient`, `useChat`, `useAgent`

---

## Step 2: Create Agent Files

### 2.1 Create Directory Structure

```bash
# Agents go directly in public/agents/ (served by Vite)
mkdir -p public/agents
mkdir -p src/lib
mkdir -p src/providers
mkdir -p src/components/agent
mkdir -p src/components/agent/hooks
```

### 2.2 Create Main Agent

```bash
cat > public/agents/vllora-main-agent.md << 'EOF'
---
name = "vllora_main_agent"
description = "Main orchestrator for vLLora trace analysis"
max_iterations = 10
tool_format = "provider"

[tools]
builtin = ["call_agent"]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
max_tokens = 2000
---

# ROLE
You are the main AI assistant for vLLora, a real-time debugging platform for AI agents.

You orchestrate two specialized agents:
- **vllora_ui_agent**: Controls the vLLora UI
- **vllora_data_agent**: Fetches trace data from the backend

# TASK
{{task}}
EOF
```

### 2.3 Create UI Agent

```bash
cat > public/agents/vllora-ui-agent.md << 'EOF'
---
name = "vllora_ui_agent"
description = "Controls vLLora UI display, navigation, and context awareness"
max_iterations = 5
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.2
max_tokens = 800
---

# ROLE
You control the vLLora UI with 11 tools in 2 categories:

## GET STATE (5 tools) - Read context
- get_current_view: page, project, thread, theme, modal
- get_selection_context: selected run, span, text selection
- get_thread_runs: list runs in current thread
- get_span_details(spanId): get span info
- get_collapsed_spans: list collapsed span IDs

## CHANGE UI (6 tools) - Modify interface
- open_modal(modal): tools, settings, provider-keys
- close_modal: close current modal
- select_span(spanId): select and highlight span
- select_run(runId): select run to display
- expand_span(spanId): expand collapsed span
- collapse_span(spanId): collapse expanded span

# TASK
{{task}}
EOF
```

### 2.4 Create Data Agent

```bash
cat > public/agents/vllora-data-agent.md << 'EOF'
---
name = "vllora_data_agent"
description = "Fetches trace data from vLLora backend"
max_iterations = 8
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.1
max_tokens = 1500
---

# ROLE
You fetch and analyze trace data from the vLLora backend.
All tools are handled by the frontend which calls the vLLora API.
Tools reuse existing services from @/services/* for consistency.

## Available tools (4):
- fetch_runs: Get execution runs (threadIds, modelName, limit)
- fetch_spans: Get individual spans (runIds, operationNames, limit)
- get_run_details: Get details of a specific run (runId)
- fetch_groups: Get aggregated data (groupBy: time/thread/run)

# TASK
{{task}}
EOF
```

---

## Step 3: Create Tool Handler Files

### 3.1 Create UI Tools

```bash
mkdir -p src/lib
# Create src/lib/distri-ui-tools.ts (see tools.md for full implementation)
```

### 3.2 Create Data Tools

```bash
# Create src/lib/distri-data-tools.ts (see tools.md for full implementation)
```

### 3.3 Create Agent Sync

```bash
# Create src/lib/agent-sync.ts (see frontend-integration.md for full implementation)
```

---

## Step 4: Create Provider and UI Components

### 4.1 Create DistriProvider

```bash
# Create src/providers/DistriProvider.tsx (see frontend-integration.md)
```

### 4.2 Create Agent UI Components

```bash
# Create src/components/agent/AgentPanel.tsx (uses @distri/react Chat)
# Create src/components/agent/AgentToggleButton.tsx
# Create src/components/agent/AgentPanelWrapper.tsx
# Create src/components/agent/hooks/useDraggable.ts
# Create src/components/agent/index.ts
# See ui-design.md for implementation details
```

---

## Step 5: Update Event Emitter

Add Distri events to `src/utils/eventEmitter.ts` (see tools.md for event types).

---

## Step 6: Setup Environment Variables

```bash
cat > .env.local << 'EOF'
# Distri Server URL
VITE_DISTRI_URL=http://localhost:8081

# vLLora Backend URL (for reference)
VITE_API_URL=http://localhost:9090
EOF
```

---

## Step 7: Update package.json Scripts

```json
{
  "scripts": {
    "push-agents": "distri --base-url http://localhost:8081 agents push ./public/agents --all",
    "dev": "pnpm push-agents && vite",
    "build": "pnpm push-agents && vite build"
  }
}
```

> **Note:** Agents are now stored directly in `public/agents/` which is served by Vite.
> The `push-agents` script registers them with the Distri server.
> At runtime, `agent-sync.ts` will auto-register any missing agents from `/agents/*.md`.

---

## Step 8: Wrap App with DistriProvider and Add AgentPanelWrapper

Update `src/App.tsx`:

```typescript
import { DistriProvider } from '@/providers/DistriProvider';
import { AgentPanelWrapper } from '@/components/agent';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={
              <ProtectedRoute>
                <DistriProvider>
                  <ProjectsProvider>
                    {/* ... other providers ... */}
                    <Layout />
                    <AgentPanelWrapper />
                  </ProjectsProvider>
                </DistriProvider>
              </ProtectedRoute>
            }>
              {/* ... routes ... */}
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

---

## Step 9: Run Everything

With the hybrid approach, you only need **3 terminal windows**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      STARTUP SEQUENCE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Terminal 1           Terminal 2           Terminal 3                │
│  ──────────           ──────────           ──────────                │
│  vLLora Backend       Distri Server        vLLora UI                 │
│  (cargo run)          (distri serve)       (pnpm dev)                │
│       │                    │                    │                    │
│       ▼                    ▼                    ▼                    │
│  localhost:9090       localhost:8081       localhost:5173            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Terminal 1: Start vLLora Backend

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora
cargo run

# Should see: Server running on http://localhost:9090
```

### Terminal 2: Start Distri Server

```bash
cd /Users/anhthuduong/Documents/GitHub/distri

# Set environment variables
export VLLORA_API_URL=http://localhost:9090
export OPENAI_API_KEY=sk-...  # Required for LLM calls

# Start the server (default port is 8081)
cargo run -p distri-cli -- serve --headless

# Or specify host and port explicitly
cargo run -p distri-cli -- serve --host 0.0.0.0 --port 8081 --headless

# Should see: Server running on http://localhost:8081
```

### Terminal 3: Start vLLora UI

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui

# This single command does everything:
# 1. Copies agents to public/ folder
# 2. Pushes agents to Distri server (CLI)
# 3. Starts Vite dev server
pnpm dev

# Should see:
# Copying agents to public/...
# ✓ Registered: vllora_main_agent
# ✓ Registered: vllora_ui_agent
# ✓ Registered: vllora_data_agent
# Local: http://localhost:5173
```

---

## Step 10: Verify Connection

### Check Distri Server Health

```bash
curl http://localhost:8081/health
# Expected: {"status":"ok"}
```

### List Available Agents

```bash
curl http://localhost:8081/agents
# Expected: ["vllora_main_agent", "vllora_ui_agent", "vllora_data_agent"]
```

### Test Agent Call

```bash
curl -X POST http://localhost:8081/chat \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "vllora_main_agent",
    "message": "Hello, what can you help me with?"
  }'
```

---

## Hybrid Approach Summary

| Stage | What happens | Where |
|-------|--------------|-------|
| `pnpm dev` starts | 1. Pushes agents via CLI to Distri server | Build time |
| | 2. Starts Vite dev server | Build time |
| App loads in browser | 3. `ensureAgentsRegistered()` runs | Runtime |
| | 4. Verifies agents exist on server | Runtime |
| | 5. Re-registers if any missing (self-heal) | Runtime |

**Why agents are in `public/`:** Vite serves `public/` files statically. The runtime self-healing fetches agent `.md` files via `fetch('/agents/vllora-main-agent.md')` to re-register missing agents.

**Graceful degradation:** If Distri server is down during `pnpm dev`, the CLI push fails but the app still starts. When the server comes back up, the runtime sync will recover the agents automatically from `public/agents/`.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Failed to connect to Distri server" | Check VITE_DISTRI_URL in .env.local matches Distri port |
| "Agent not found" | With hybrid approach, agents auto-recover on next page load. Check browser console for `[Agent Sync]` logs. Manual fix: run `pnpm push-agents` |
| "Plugin error" | Check VLLORA_API_URL env var is set for Distri |
| "CORS error" | Distri server may need CORS config for localhost:5173 |
| "LLM error" | Ensure OPENAI_API_KEY is set for Distri server |
| "[Agent Sync] Missing agents" | Normal during first load after DB wipe. Agents will auto-register from `public/agents/` |
| "Agent sync failed" | Check if `public/agents/*.md` files exist |

### CORS Configuration

The Distri server handles CORS automatically for localhost origins. If you encounter CORS issues, ensure:
1. The vLLora UI is running on `localhost:5173`
2. The Distri server is running on `localhost:8081`

To bind to all interfaces (for network access):

```bash
cargo run -p distri-cli -- serve --host 0.0.0.0 --port 8081 --headless
```

> **Note:** The `distri serve` command supports `--host`, `--port`, `--headless`, and `--disable-plugins` options.

---

## Environment Variables Summary

| Variable | Where | Value |
|----------|-------|-------|
| `VLLORA_API_URL` | Distri Server | `http://localhost:9090` |
| `OPENAI_API_KEY` | Distri Server | Your OpenAI API key |
| `VITE_DISTRI_URL` | vLLora UI | `http://localhost:8081` |
| `VITE_API_URL` | vLLora UI | `http://localhost:9090` |

---

## Next Steps

1. Read [UI Design](./ui-design.md) to implement the floating agent panel
2. Add event listeners in trace components for highlight/scroll/expand
3. Add keyboard shortcuts for panel toggle (`Cmd/Ctrl + J`)

## Related Documents

- [Architecture](./architecture.md) - System design
- [Agents](./agents.md) - Agent definitions
- [Tools](./tools.md) - Tool implementations
- [Frontend Integration](./frontend-integration.md) - React integration
