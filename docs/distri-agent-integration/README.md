# Distri Agent Integration for vLLora

AI assistant for vLLora trace analysis using Distri's multi-agent architecture.

## Architecture

```
                    User Request
                         │
                         ▼
              ┌─────────────────────┐
              │  vllora_orchestrator │  ← Routes requests, handles workflows
              │   (Main Entry)       │
              └─────────┬───────────┘
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌───────────┐  ┌───────────┐  ┌───────────────┐
   │ ui_agent  │  │data_agent │  │experiment_agent│
   │ (17 tools)│  │ (6 tools) │  │   (4 tools)   │
   └───────────┘  └───────────┘  └───────────────┘
```

## Agents

| Agent | Purpose | Tools |
|-------|---------|-------|
| **vllora_orchestrator** | Routes requests, manages workflows (8 workflow types) | `call_vllora_*` (auto-generated) |
| **vllora_ui_agent** | UI interactions: select, expand, navigate, modals, validation | 17 external |
| **vllora_data_agent** | Data fetching with two-phase analysis | 6 external |
| **vllora_experiment_agent** | Experiment page optimization | 4 external |

## Key Features

### Two-Phase Analysis (Context Overflow Prevention)
- `fetch_spans_summary` - Fetches ALL spans, stores in browser memory, returns lightweight summary
- `get_span_content` - Performs client-side semantic analysis, returns results (not raw data)
- Reduces context from ~194K tokens to ~5K tokens

### Validation Caching
- `is_valid_for_optimize` results are cached per span_id (5-minute TTL)
- Prevents duplicate API calls when agents retry

### Semantic Error Detection
- Detects error patterns in response content (not just status codes)
- Patterns: "not found", "failed to", "timeout", "rate limit", etc.

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
│   ├── vllora-orchestrator.md    # Main entry point (8 workflows)
│   ├── vllora-ui-agent.md        # UI interactions
│   ├── vllora-data-agent.md      # Data analysis (two-phase)
│   └── vllora-experiment-agent.md # Experiment optimization
├── src/lib/
│   ├── agent-sync.ts             # Auto-registers agents
│   ├── distri-ui-tools.ts        # UI tools (17) + validation cache
│   └── distri-data-tools.ts      # Data tools (6) + span storage
└── src/components/agent/          # Chat panel UI
```

## How It Works

1. **User sends message** → Orchestrator receives it with page context
2. **Orchestrator identifies workflow** → Matches against 8 workflow types
3. **Orchestrator routes to sub-agent** → Calls `call_vllora_*` with specific task
4. **Sub-agent executes** → Uses external tools (handled by frontend)
5. **Result returned** → Orchestrator continues workflow or calls `final`

## Workflows

| # | Workflow | Trigger |
|---|----------|---------|
| 1 | Comprehensive Analysis | Generic questions ("what's wrong?", "analyze this") |
| 2 | Error Analysis | "check for errors" |
| 3 | Performance Analysis | "performance", "latency", "slow" |
| 4 | Cost Analysis | "cost", "tokens", "expensive" |
| 5 | Optimize Span | "optimize", "improve" (not on experiment page) |
| 6 | Analyze Experiment | "optimize" (on experiment page) |
| 7 | Apply Optimization | "apply", "do it", "yes" |
| 8 | Greetings/Help | "hello", "help" |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | Multi-agent data flow |
| [Distri Architecture](./distri-architecture.md) | Distri framework reference |
| [Agents](./agents.md) | Agent definitions and workflows |
| [Tools](./tools.md) | Tool implementations and caching |
| [Frontend Integration](./frontend-integration.md) | React hooks and events |
| [UI Design](./ui-design.md) | Agent panel components |
| [Backend Improvements](./backend-improvements.md) | Future API enhancements |
