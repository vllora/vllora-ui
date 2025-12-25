# Multi-Agent Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              vLLora UI (React)                              │
│                                                                             │
│  ┌──────────────┐  ┌─────────────────────────────────────────────────────┐ │
│  │  AgentPanel  │  │              Tool Handlers                          │ │
│  │  (Chat UI)   │  │  UI Tools (17)            Data Tools (4)            │ │
│  └──────────────┘  └─────────────────────────────────────────────────────┘ │
│         │                          │                                        │
│         │              ┌───────────┴───────────┐                           │
│         │              │    Event Emitter      │                           │
│         │              └───────────────────────┘                           │
│         │                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    DistriProvider (@distri/react)                       ││
│  │  - externalTools prop passes all tools                                  ││
│  │  - Tools propagate to sub-agents automatically                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (A2A Protocol)
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Distri Server                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      vllora_orchestrator                               │ │
│  │  sub_agents = [ui_agent, data_agent, experiment_agent]                │ │
│  │                                                                        │ │
│  │  Auto-generated tools:                                                │ │
│  │  - call_vllora_ui_agent                                               │ │
│  │  - call_vllora_data_agent                                             │ │
│  │  - call_vllora_experiment_agent                                       │ │
│  └────────────────────────────────┬──────────────────────────────────────┘ │
│                                   │                                         │
│         ┌─────────────────────────┼─────────────────────────┐              │
│         ▼                         ▼                         ▼              │
│  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐     │
│  │vllora_ui_agent│         │vllora_data   │         │vllora_exp    │     │
│  │              │          │  _agent      │          │  _agent      │     │
│  │ 12 tools     │          │ 4 tools      │          │ 5 tools      │     │
│  │ external=*   │          │ external=*   │          │ external=*   │     │
│  └──────────────┘          └──────────────┘          └──────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (Data Tools)
┌─────────────────────────────────────────────────────────────────────────────┐
│                           vLLora Backend (Rust)                             │
│  /api/runs, /api/spans, /api/groups                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Agent Responsibilities

| Agent | Purpose | Tools |
|-------|---------|-------|
| **vllora_orchestrator** | Routes requests to sub-agents | `call_vllora_*` (auto-generated) |
| **vllora_ui_agent** | UI: select, expand, navigate, modals | 12 external |
| **vllora_data_agent** | Data: runs, spans, metrics | 4 external |
| **vllora_experiment_agent** | Experiment page optimization | 5 external |

## External Tool Flow

All tools execute in the frontend:

```
User Message
     │
     ▼
Orchestrator (Distri)
     │
     ├─── call_vllora_ui_agent("select span X")
     │         │
     │         ▼
     │    UI Agent calls select_span({spanId: "X"})
     │         │
     │         ▼ (external tool via SSE)
     │    Frontend emits: vllora_select_span
     │         │
     │         ▼
     │    TracesPageContext updates selection
     │         │
     │         ▼
     │    Returns {success: true}
     │
     ▼
Orchestrator: "Selected span X"
```

## UI Tools vs Data Tools

### UI Tools (Event-Based)

```
Tool Handler              TracesPageContext
     │                           │
     │  emit("vllora_get_X")     │
     │──────────────────────────▶│
     │                           │
     │  emit("vllora_X_response")│
     │◀──────────────────────────│
```

### Data Tools (API-Based)

```
Tool Handler              vLLora Backend
     │                           │
     │  listRuns({...})          │
     │──────────────────────────▶│
     │                           │
     │  { data: [...] }          │
     │◀──────────────────────────│
```

## Why Multi-Agent?

1. **Focused prompts** - Each sub-agent has fewer tools (4-12 vs 21)
2. **Better tool selection** - LLM chooses from smaller set
3. **Separation of concerns** - Clear responsibilities
4. **Context-based routing** - Experiment agent only on `/experiment` page

## Service Stack

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  localhost:5173 │     │  localhost:8081 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```
