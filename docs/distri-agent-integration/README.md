# Distri Agent Integration for vLLora

AI assistant (Lucy) for vLLora trace analysis using Distri's multi-agent architecture.

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
   │ (4 tools) │  │ (8 tools) │  │   (4 tools)   │
   └───────────┘  └───────────┘  └───────────────┘
```

## Agents

| Agent | Purpose | Tools |
|-------|---------|-------|
| **vllora_orchestrator** | Routes requests, manages workflows (14 workflow types) | `call_vllora_*` (auto-generated) |
| **vllora_ui_agent** | UI interactions: navigate, visibility, label filtering | 4 external |
| **vllora_data_agent** | Data fetching with three-phase analysis + label discovery | 8 external |
| **vllora_experiment_agent** | Experiment page optimization | 4 external |

## Key Features

### Three-Phase Analysis (Context Overflow Prevention)
1. `fetch_spans_summary` - Fetches ALL spans, stores in browser memory, returns lightweight summary with flagged spans
2. `get_span_content` - Retrieves specific spans by ID for pattern matching
3. `analyze_with_llm` - Deep LLM semantic analysis of flagged spans (structured output)

### Semantic Error Detection
- `fetch_spans_summary` detects error patterns via regex (fast, initial scan)
- `analyze_with_llm` performs deep semantic analysis with LLM (slow, accurate)
- Patterns: silent failures, buried warnings, gradual degradation, tool errors

### Validation Caching
- `is_valid_for_optimize` results are cached per span_id (5-minute TTL)
- Prevents duplicate API calls when agents retry

### Label Filtering
- `list_labels` - Discover available labels with counts
- `fetch_spans` and `fetch_spans_summary` support `labels` parameter
- `apply_label_filter` - Update UI label filter

## Quick Start

```bash
# Start vLLora backend
cd vllora/gateway && cargo run

# Start vLLora UI
cd vllora/ui && pnpm dev

# Agents auto-register on app load via agent-sync.ts
```

## Key Files

```
gateway/
├── agents/                        # Agent definitions
│   ├── vllora-orchestrator.md    # Main entry point (14 workflows)
│   ├── vllora-ui-agent.md        # UI interactions (4 tools)
│   ├── vllora-data-agent.md      # Data analysis (8 tools)
│   └── vllora-experiment-agent.md # Experiment optimization (4 tools)

ui/
├── src/lib/
│   ├── agent-sync.ts              # Auto-registers agents
│   └── distri-data-tools/         # Data tools (modular)
│       ├── index.ts               # Entry point, exports all tools
│       ├── helpers.ts             # Shared utilities
│       ├── fetch-runs.ts          # Fetch runs
│       ├── fetch-spans.ts         # Fetch spans
│       ├── get-run-details.ts     # Get run details
│       ├── fetch-groups.ts        # Fetch aggregated groups
│       ├── fetch-spans-summary.ts # Three-phase: fetch + store + summarize
│       ├── get-span-content.ts    # Three-phase: retrieve specific spans
│       ├── list-labels.ts         # List available labels
│       └── analyze-with-llm.ts    # Three-phase: LLM semantic analysis
├── src/lib/distri-ui-tools.ts     # UI tools (4) + validation cache
└── src/components/agent/          # Chat panel UI
```

## How It Works

1. **User sends message** → Orchestrator receives it with page context
2. **Orchestrator identifies workflow** → Matches against 14 workflow types
3. **Orchestrator routes to sub-agent** → Calls `call_vllora_*` with specific task
4. **Sub-agent executes** → Uses external tools (handled by frontend)
5. **Result returned** → Orchestrator continues workflow or calls `final`

## Workflows

| # | Workflow | Trigger |
|---|----------|---------|
| 1 | Run Analysis | Questions about a run/workflow |
| 2 | Span Analysis | Questions about a specific span |
| 3 | Comprehensive Analysis | Generic questions ("what's wrong?", "analyze this") |
| 4 | Error Analysis | "check for errors" |
| 5 | Performance Analysis | "performance", "latency", "slow" |
| 6 | Cost Analysis | "cost", "tokens", "expensive" |
| 7 | Experiment/Optimize | "optimize", "improve" (not on experiment page) |
| 8 | Analyze Experiment | "optimize" (on experiment page, no explicit change) |
| 9 | Apply Optimization | "apply", "switch to {model}" |
| 10 | Greetings/Help | "hello", "help" |
| 11 | Label Discovery | "what labels exist?", "show me labels" |
| 12 | Label Filtering (data) | "show me flight_search traces" |
| 13 | Label Filtering (UI) | "filter by label", "apply label filter" |
| 14 | Label Comparison | "compare flight_search with hotel_search" |

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
