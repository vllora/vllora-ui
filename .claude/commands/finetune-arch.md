Load the full-stack architecture sources for the Lucy Finetune feature across all repositories. Use this to understand how the layers connect before investigating or building.

## System Architecture

### Layer 1: Agent Definition (Distri A2A agent — defines the AI's behavior and tools)
!`cat /Users/anhthuduong/Documents/GitHub/vllora/gateway/agents/finetune/vllora-finetune-agent.md`

### Layer 2: Backend — distri.rs (Rust — downloads distri binary, starts server, health checks)
!`cat /Users/anhthuduong/Documents/GitHub/vllora/gateway/src/distri.rs`

### Layer 3: Distri Server — orchestrator (loads agent defs, runs agent loop)
!`cat /Users/anhthuduong/Documents/GitHub/distri/server/distri-core/src/agent/orchestrator.rs`

### Layer 3: Distri Server — agent loop (main execution loop)
!`cat /Users/anhthuduong/Documents/GitHub/distri/server/distri-core/src/agent/agent_loop.rs`

### Layer 3: Distri Server — tool execution framework
!`cat /Users/anhthuduong/Documents/GitHub/distri/server/distri-core/src/tools/mod.rs`

### Layer 3: Distri Server — A2A protocol handler
!`cat /Users/anhthuduong/Documents/GitHub/distri/server/distri-core/src/a2a/handler.rs`

### Layer 3: Distri Server — A2A streaming
!`cat /Users/anhthuduong/Documents/GitHub/distri/server/distri-core/src/a2a/stream.rs`

### Layer 3: Distri Server — HTTP routes
!`cat /Users/anhthuduong/Documents/GitHub/distri/server/distri-server/src/routes.rs`

### Layer 3: Distri Server — A2A types
!`cat /Users/anhthuduong/Documents/GitHub/distri/distri-a2a/src/a2a_types.rs`

### Layer 4: Frontend — LucyDatasetAssistant (React — main UI entry point)
!`cat src/components/datasets/LucyDatasetAssistant.tsx`

### Layer 4: Frontend — Finetune Tools Index (tool registry and exports)
!`cat src/lib/distri-finetune-tools/index.ts`

### Layer 4: Frontend — Finetune Tools Types
!`cat src/lib/distri-finetune-tools/types.ts`

### Layer 5: @distri/react — useChat hook (message streaming, tool execution)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/useChat.ts`

### Layer 5: @distri/react — chatStateStore (Zustand state management)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/stores/chatStateStore.ts`

### Layer 5: @distri/core — distri-client (A2A protocol client)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/core/src/distri-client.ts`

### Layer 5: @distri/core — types (core type definitions)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/core/src/types.ts`

### Layer 5: @distri/core — events (event system)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/core/src/events.ts`

### Sync Mechanism (how distrijs changes reach the vllora/ui repo)
!`cat scripts/sync-distrijs.sh`

---

## Layer Summary
```
User ↔ LucyDatasetAssistant.tsx (React UI)
         ↕ useChat / chatStateStore (@distri/react)
         ↕ distri-client (@distri/core, A2A protocol)
         ↕ WebSocket/HTTP
       distri.rs (Rust gateway — manages distri binary lifecycle)
         ↕ spawns
       Distri Server (Rust)
         ├── routes.rs — HTTP API endpoints
         ├── orchestrator.rs — loads agent defs, manages sessions
         ├── agent_loop.rs — runs the LLM ↔ tool execution loop
         ├── a2a/handler.rs — handles A2A protocol messages
         ├── a2a/stream.rs — streams responses back to client
         └── tools/mod.rs — executes tools (built-in + external)
         ↕ tool calls (external tools sent back to browser)
       distri-finetune-tools/ (execute locally in browser)
```

You now have the full architecture across all repos. $ARGUMENTS
