# Distri Agent Integration for vLLora

AI assistant for vLLora trace analysis using Distri's multi-agent architecture.

## Architecture

```
                    User Request
                         │
                         ▼
              ┌─────────────────────┐
              │  vllora_orchestrator │  ← Routes requests
              │   (Main Entry)       │
              └─────────┬───────────┘
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌───────────┐  ┌───────────┐  ┌───────────────┐
   │ ui_agent  │  │data_agent │  │experiment_agent│
   │ (12 tools)│  │ (4 tools) │  │   (5 tools)   │
   └───────────┘  └───────────┘  └───────────────┘
```

## Agents

| Agent | Purpose | Tools |
|-------|---------|-------|
| **vllora_orchestrator** | Routes requests to specialized agents | `call_vllora_*` (auto-generated) |
| **vllora_ui_agent** | UI interactions: select, expand, navigate, modals | 12 external |
| **vllora_data_agent** | Data fetching: runs, spans, metrics | 4 external |
| **vllora_experiment_agent** | Experiment page optimization | 5 external |

## Quick Start

```bash
# Start vLLora UI
cd vllora/ui && pnpm dev

# Agents auto-register on app load via agent-sync.ts
```

## Key Files

```
ui/
├── public/agents/                 # Agent definitions
│   ├── vllora-orchestrator.md    # Main entry point
│   ├── vllora-ui-agent.md        # UI interactions
│   ├── vllora-data-agent.md      # Data analysis
│   └── vllora-experiment-agent.md # Experiment optimization
├── src/lib/
│   ├── agent-sync.ts             # Auto-registers agents
│   ├── distri-ui-tools.ts        # UI + Experiment tools
│   └── distri-data-tools.ts      # Data API tools
└── src/components/agent/          # Chat panel UI
```

## How It Works

1. **User sends message** → Orchestrator receives it with page context
2. **Orchestrator routes** → Calls appropriate sub-agent (`call_vllora_*`)
3. **Sub-agent executes** → Uses external tools (handled by frontend)
4. **Result returned** → Orchestrator summarizes for user

All tools use `external = ["*"]`, meaning they execute in the frontend via event emitters.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | Multi-agent data flow |
| [Distri Architecture](./distri-architecture.md) | Distri framework reference |
| [Agents](./agents.md) | Agent definitions and tools |
| [Tools](./tools.md) | Tool implementations |
| [Frontend Integration](./frontend-integration.md) | React hooks and events |
| [UI Design](./ui-design.md) | Agent panel components |
| [Backend Improvements](./backend-improvements.md) | Future API enhancements |
