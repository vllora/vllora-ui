# Multi-Agent Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              vLLora UI (React)                              │
│                                                                             │
│  ┌──────────────┐  ┌─────────────────────────────────────────────────────┐ │
│  │  AgentPanel  │  │              Tool Handlers                          │ │
│  │  (Chat UI)   │  │  UI Tools (17)            Data Tools (6)            │ │
│  └──────────────┘  │  + Validation Cache       + Span Storage            │ │
│         │          └─────────────────────────────────────────────────────┘ │
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
│  │  max_iterations = 10                                                  │ │
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
│  │ 17 tools     │          │ 6 tools      │          │ 4 tools      │     │
│  │ max_iter=5   │          │ max_iter=8   │          │ max_iter=10  │     │
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

| Agent | Purpose | Tools | Max Iterations |
|-------|---------|-------|----------------|
| **vllora_orchestrator** | Routes requests, manages 8 workflows | `call_vllora_*` (auto) | 10 |
| **vllora_ui_agent** | UI: select, expand, navigate, modals, validation | 17 external | 5 |
| **vllora_data_agent** | Data: runs, spans, two-phase analysis | 6 external | 8 |
| **vllora_experiment_agent** | Experiment: analyze, apply, run, evaluate | 4 external | 10 |

## Orchestrator Workflows

```
User Message → Orchestrator identifies workflow → Executes steps → Returns result

Workflow 1: COMPREHENSIVE ANALYSIS (default)
  └─ call_vllora_data_agent("Fetch all spans with full analysis")
  └─ final: comprehensive report

Workflow 5: OPTIMIZE SPAN (not on experiment page)
  └─ Step 1: call_vllora_ui_agent("Check if span is valid")
  └─ Step 2: call_vllora_ui_agent("Navigate to experiment page")
  └─ Step 3: call_vllora_experiment_agent("Analyze and suggest")
  └─ Step 4: final: optimization suggestions

Workflow 7: APPLY OPTIMIZATION (on experiment page)
  └─ call_vllora_experiment_agent("Apply changes, run, evaluate")
  └─ final: results comparison
```

## Two-Phase Analysis Flow

Prevents LLM context overflow when analyzing many spans:

```
Phase 1: fetch_spans_summary
     │
     ├─── Fetch ALL spans (parallel pagination)
     ├─── Store in browser memory (spanStorage Map)
     └─── Return lightweight summary:
            - Aggregate stats
            - Error spans (explicit + semantic)
            - Slowest spans (top 5)
            - Expensive spans (top 5)

Phase 2: get_span_content (if needed)
     │
     ├─── Retrieve specific spans from storage
     ├─── Perform client-side semantic analysis
     └─── Return analysis RESULTS (not raw data):
            - semantic_issues with severity
            - content_stats
            - assessment
```

## Validation Cache Flow

Prevents duplicate is_valid_for_optimize calls:

```
is_valid_for_optimize(spanId)
     │
     ├─── Check cache → HIT: return cached result
     │                      (includes _cached: true)
     │
     └─── MISS: Call API
              ├─── Store in cache (5-min TTL)
              └─── Return result
```

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
Orchestrator continues workflow or calls final
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
     │  listSpans({...})         │
     │──────────────────────────▶│
     │                           │
     │  { data: [...] }          │
     │◀──────────────────────────│
```

## Why Multi-Agent?

1. **Focused prompts** - Each sub-agent has fewer tools (4-17 vs all 27)
2. **Better tool selection** - LLM chooses from smaller set
3. **Separation of concerns** - Clear responsibilities
4. **Context-based routing** - Experiment agent only on `/experiment` page
5. **Workflow management** - Orchestrator handles multi-step processes

## Loop Prevention

The orchestrator includes explicit loop prevention:

1. **Workflow completion signals** - Recognize when results contain "cost savings", "Results:", etc.
2. **Error handling** - Call `final` immediately when sub-agent returns error
3. **Step tracking** - Explicit "Step 1 → Step 2 → Step 3 → Step 4 (final)"
4. **Caching** - Validation results cached to prevent duplicate calls

## Service Stack

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  localhost:5173 │     │  localhost:8081 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```
