# Distri Multi-Agent Integration for vLLora

This guide explains how to build a multi-agent system using Distri that helps users analyze traces, identify issues, find bottlenecks, and optimize their LLM products through the vLLora platform.

## System Purpose

vLLora is a real-time debugging platform for AI agents. The multi-agent system helps users:
- **Analyze traces** in real-time and historically
- **Identify issues** in LLM workflows
- **Find bottlenecks** in agent execution
- **Optimize LLM products** based on trace data insights

## Quick Start

```bash
# 1. Install Distri packages
cd /Users/anhthuduong/Documents/GitHub/vllora/ui
pnpm add @distri/core @distri/react

# 2. Push agents to Distri server
pnpm push-agents

# 3. Start development
pnpm dev
```

## Documentation

| Document | Description |
|----------|-------------|
| [Implementation Plan](./implementation-plan.md) | Step-by-step implementation phases and testing plan |
| [Architecture](./architecture.md) | Multi-agent system architecture and diagrams |
| [Agents](./agents.md) | Agent definitions (Main, UI, Data agents) |
| [Tools](./tools.md) | Tool handlers for UI and Data operations |
| [Frontend Integration](./frontend-integration.md) | React provider, hooks, and event emitter setup |
| [Setup Guide](./setup-guide.md) | Complete step-by-step setup instructions |
| [UI Design](./ui-design.md) | Floating agent panel design specifications |
| [Backend Improvements](./backend-improvements.md) | Suggested vLLora backend API enhancements (optional) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              vLLora UI (React)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  ChatInput   │  │   Contexts   │  │  UI Tools    │  │   Data Tools    │ │
│  │  (@agent)    │──│   (state)    │──│  (frontend)  │  │   (API calls)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    DistriProvider (@distri/react)                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (A2A Protocol)
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Distri Server                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         MAIN AGENT (Orchestrator)                      │ │
│  │  Can call: ui_agent, data_agent                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│              │                                        │                     │
│              ▼                                        ▼                     │
│  ┌─────────────────────┐                ┌─────────────────────┐            │
│  │   UI AGENT (11)     │                │   DATA AGENT (4)    │            │
│  │   external = ["*"]  │                │   external = ["*"]  │            │
│  └─────────────────────┘                └─────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### No Distri Modifications Required

All agents use `external = ["*"]`, meaning:
- **All tool implementations stay in vLLora UI** (no Distri repo changes)
- Distri server routes tool calls back to frontend
- Frontend handles both UI tools AND Data tools

### Data Tools Reuse Existing Services

Data agent tools import from existing `@/services/*`:
- `fetch_runs` → `@/services/runs-api.ts`
- `fetch_spans` → `@/services/spans-api.ts`
- `get_run_details` → `@/services/runs-api.ts`
- `fetch_groups` → `@/services/groups-api.ts`

### Hybrid Agent Registration

- **CLI**: Push agents during dev/CI-CD (`distri agents push`)
- **Runtime**: Self-healing verification via `agent-sync.ts`

## Agent Summary

| Agent | Tools | Description |
|-------|-------|-------------|
| **vllora_main_agent** | `call_agent` (builtin) | Orchestrates UI and Data agents |
| **vllora_ui_agent** | 11 external | 5 GET STATE + 6 CHANGE UI |
| **vllora_data_agent** | 4 external | Reuses `@/services/*` APIs |

## File Structure

All files are in the **vLLora UI repo** - no modifications to Distri repo needed.

```
vllora/ui/
├── agents/                          # Agent definitions (pushed to Distri)
│   ├── vllora-main-agent.md
│   ├── vllora-ui-agent.md
│   └── vllora-data-agent.md
├── src/
│   ├── components/agent/            # Agent UI components
│   │   ├── AgentPanel.tsx
│   │   ├── AgentToggleButton.tsx
│   │   ├── AgentWidget.tsx
│   │   └── AgentMessage.tsx
│   ├── hooks/
│   │   └── useVlloraAgent.ts        # Agent communication hook
│   ├── lib/
│   │   ├── distri-ui-tools.ts       # UI tool handlers
│   │   ├── distri-data-tools.ts     # Data tool handlers
│   │   └── agent-sync.ts            # Runtime agent verification
│   ├── providers/
│   │   └── DistriProvider.tsx       # Distri provider with auto-sync
│   └── utils/
│       └── eventEmitter.ts          # Extended with Distri events
├── public/agents/                   # Bundled agents for self-healing
│   └── *.md
└── docs/distri-agent-integration/   # This documentation
    ├── README.md
    ├── architecture.md
    ├── agents.md
    ├── tools.md
    ├── frontend-integration.md
    ├── setup-guide.md
    └── ui-design.md
```

## Package Dependencies

```bash
pnpm add @distri/core @distri/react
```

**Already installed (no action needed):**
- `mitt` - Event emitter
- `@microsoft/fetch-event-source` - SSE streaming

## Usage Examples

### Analyze Performance
```
User: @agent analyze the performance of my last 10 runs

Main Agent:
1. Calls data_agent → fetches runs with timing data
2. Analyzes durations, finds slow spans
3. Calls ui_agent → highlights the slowest span
4. Returns analysis with recommendations
```

### Investigate Errors
```
User: @agent why did my agent fail yesterday?

Main Agent:
1. Calls data_agent → fetches runs from yesterday with errors
2. Finds run with error, analyzes the cause
3. Calls ui_agent → navigates to and highlights failed span
4. Returns explanation with fix suggestions
```

### Cost Analysis
```
User: @agent show me which models are costing the most

Main Agent:
1. Calls data_agent → fetches groups by model
2. Calculates costs per model
3. Returns breakdown with optimization suggestions
```

## Next Steps

1. Read [Architecture](./architecture.md) to understand the system design
2. Review [Agents](./agents.md) for agent definitions
3. Follow [Setup Guide](./setup-guide.md) to implement the integration
4. Customize [UI Design](./ui-design.md) for the floating panel
