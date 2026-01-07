# Multi-Agent Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              vLLora UI (React)                              │
│                                                                             │
│  ┌──────────────┐  ┌─────────────────────────────────────────────────────┐ │
│  │  AgentPanel  │  │              Tool Handlers                          │ │
│  │  (Chat UI)   │  │  UI Tools (4)             Data Tools (8)            │ │
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
│  │  model = "gpt-4.1"                                                    │ │
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
│  │ 4 tools      │          │ 8 tools      │          │ 4 tools      │     │
│  │ max_iter=5   │          │ max_iter=8   │          │ max_iter=10  │     │
│  └──────────────┘          └──────────────┘          └──────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (Data Tools)
┌─────────────────────────────────────────────────────────────────────────────┐
│                           vLLora Backend (Rust)                             │
│  /api/runs, /api/spans, /api/groups, /api/labels                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Agent Responsibilities

| Agent | Purpose | Tools | Max Iterations |
|-------|---------|-------|----------------|
| **vllora_orchestrator** | Routes requests, manages 14 workflows | `call_vllora_*` (auto) | 10 |
| **vllora_ui_agent** | UI: navigate, expand/collapse, validation | 4 external | 5 |
| **vllora_data_agent** | Data: runs, spans, three-phase analysis | 8 external | 8 |
| **vllora_experiment_agent** | Experiment: analyze, apply, run, evaluate | 4 external | 10 |

## Orchestrator Workflows

```
User Message → Orchestrator identifies workflow → Executes steps → Returns result

Workflow 3: COMPREHENSIVE ANALYSIS (default)
  └─ call_vllora_data_agent("Fetch all spans with full analysis")
  └─ final: comprehensive report

Workflow 7: EXPERIMENT/OPTIMIZE (not on experiment page)
  └─ Step 0: Resolve target spanId
  └─ Step 1: call_vllora_ui_agent("Check if span is valid")
  └─ Step 2: call_vllora_ui_agent("Navigate to experiment page")
  └─ Step 3: call_vllora_experiment_agent("Analyze and suggest")
  └─ Step 4: final: optimization suggestions

Workflow 9: APPLY OPTIMIZATION (on experiment page)
  └─ call_vllora_experiment_agent("Apply changes, run, evaluate")
  └─ final: results comparison
```

## Three-Phase Analysis Flow

Prevents LLM context overflow when analyzing many spans:

```
Phase 1: fetch_spans_summary
     │
     ├─── Fetch ALL spans (parallel pagination)
     ├─── Store in browser memory (spanStorage Map)
     └─── Return lightweight summary:
            - Aggregate stats (total, by operation, by status)
            - Error spans (explicit + semantic via regex)
            - Slowest spans (top 5)
            - Expensive spans (top 5)
            - Flagged spans for LLM analysis

Phase 2: get_span_content (optional - for pattern details)
     │
     ├─── Retrieve specific spans from storage
     └─── Return span data for inspection (max 5 spans)

Phase 3: analyze_with_llm (for semantic errors)
     │
     ├─── Take flagged span IDs from Phase 1
     ├─── Call LLM API with structured output schema
     └─── Return deep semantic analysis:
            - Issue types (silent failures, buried warnings, etc.)
            - Actual data snippets from trace
            - Root cause + recommendations
```

## Data Agent Workflow

```markdown
# vllora_data_agent workflow (from agent prompt)

1. Call `fetch_spans_summary(threadIds=["<thread-id>"])`
2. If `semantic_error_spans` is non-empty → call `analyze_with_llm(spanIds=[...], focus="semantic")`
3. Call `final()` with your report - TRANSLATE the JSON into markdown format:
   - `data_snippet` → **What happened**: section
   - `explanation` → **Why this is a problem**: section
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
     ├─── call_vllora_data_agent("Fetch spans for thread X")
     │         │
     │         ▼
     │    Data Agent calls fetch_spans_summary({threadIds: ["X"]})
     │         │
     │         ▼ (external tool via SSE)
     │    Frontend: Fetch from backend API
     │         │
     │         ▼
     │    Store spans in spanStorage Map
     │         │
     │         ▼
     │    Returns {summary: {...}, semantic_error_spans: [...]}
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

### LLM Analysis (Hybrid)

```
Tool Handler              OpenAI API (via provider config)
     │                           │
     │  POST /chat/completions   │
     │  (structured output)      │
     │──────────────────────────▶│
     │                           │
     │  { issues: [...] }        │
     │◀──────────────────────────│
```

## Why Multi-Agent?

1. **Focused prompts** - Each sub-agent has fewer tools (4-8 vs all 16)
2. **Better tool selection** - LLM chooses from smaller set
3. **Separation of concerns** - Clear responsibilities
4. **Context-based routing** - Experiment agent only on `/experiment` page
5. **Workflow management** - Orchestrator handles multi-step processes

## Loop Prevention

The orchestrator includes explicit loop prevention:

1. **Workflow completion signals** - Recognize when results contain "cost savings", "Results:", etc.
2. **Error handling** - Call `final` immediately when sub-agent returns error
3. **Step tracking** - Explicit "Step 0 → Step 1 → Step 2 → Step 3 → Step 4 (final)"
4. **Caching** - Validation results cached to prevent duplicate calls

## Service Stack

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  localhost:5173 │     │  localhost:8081 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```
