# Agent Architecture

This document describes the architecture of the Distri agent integration for vLLora.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              vLLora UI (React)                              │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  AgentPanel  │  │  TracesPage  │  │  UI Tools    │  │   Data Tools    │ │
│  │  (Chat UI)   │──│  Context     │──│  (11 tools)  │  │   (4 tools)     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘ │
│         │                 │                 │                   │          │
│         │                 │                 └───────────────────┘          │
│         │                 │                          │                     │
│         │                 │              ┌───────────┴───────────┐         │
│         │                 │              │    Event Emitter      │         │
│         │                 │              │ (request/response)    │         │
│         │                 │              └───────────────────────┘         │
│         │                 │                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    DistriProvider (@distri/react)                       ││
│  │  - Auto-registers agent on mount (agent-sync.ts)                        ││
│  │  - Provides useAgent, useChatMessages hooks                             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (A2A Protocol / REST API)
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Distri Server                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      vllora_main_agent                                 │ │
│  │                                                                        │ │
│  │  external = ["*"]  →  All 15 tools handled by frontend                │ │
│  │                                                                        │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  UI Tools (11)              │  Data Tools (4)                   │  │ │
│  │  │  ─────────────              │  ──────────────                   │  │ │
│  │  │  get_current_view           │  fetch_runs                       │  │ │
│  │  │  get_selection_context      │  fetch_spans                      │  │ │
│  │  │  get_thread_runs            │  get_run_details                  │  │ │
│  │  │  get_span_details           │  fetch_groups                     │  │ │
│  │  │  get_collapsed_spans        │                                   │  │ │
│  │  │  open_modal, close_modal    │                                   │  │ │
│  │  │  select_span, select_run    │                                   │  │ │
│  │  │  expand_span, collapse_span │                                   │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (Data Tools call API directly)
┌─────────────────────────────────────────────────────────────────────────────┐
│                           vLLora Backend (Rust)                             │
│                                                                             │
│  /api/runs     - List runs, get run details                                │
│  /api/spans    - List spans                                                │
│  /api/groups   - Aggregated statistics                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How External Tools Work

The agent uses `external = ["*"]`, meaning all tool calls are routed back to the frontend:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     External Tool Execution Flow                             │
│                                                                              │
│  vLLora UI                    Distri Server                                  │
│  ─────────                    ─────────────                                  │
│                                                                              │
│  1. User sends message ───────▶ 2. Agent processes with LLM                 │
│                                    (gpt-4.1)                                 │
│                                │                                             │
│                                ▼                                             │
│                               3. Agent decides to call tool                  │
│                                  e.g., fetch_runs({threadIds: ["abc"]})     │
│                                │                                             │
│  4. Frontend receives ◀─────── │  (external tool returned via SSE)          │
│     tool call                  │                                             │
│     │                          │                                             │
│     ▼                          │                                             │
│  5. Execute handler            │                                             │
│     - UI tools: emit event     │                                             │
│     - Data tools: call API     │                                             │
│     │                          │                                             │
│     ▼                          │                                             │
│  6. Send result back ──────────▶ 7. Agent continues with tool result        │
│                                │                                             │
│                                ▼                                             │
│                               8. Agent generates response                    │
│                                │                                             │
│  9. Display response ◀─────────                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: UI Tools vs Data Tools

### UI Tools (Event-Based)

```
AgentPanel                 Tool Handler              TracesPageContext
    │                          │                           │
    │  externalTools prop      │                           │
    │─────────────────────────▶│                           │
    │                          │                           │
    │                          │  emit("vllora_get_X")     │
    │                          │──────────────────────────▶│
    │                          │                           │
    │                          │  emit("vllora_X_response")│
    │                          │◀──────────────────────────│
    │                          │                           │
    │  result via SSE          │                           │
    │◀─────────────────────────│                           │
```

### Data Tools (API-Based)

```
AgentPanel                 Tool Handler              vLLora Backend
    │                          │                           │
    │  externalTools prop      │                           │
    │─────────────────────────▶│                           │
    │                          │                           │
    │                          │  listRuns({...})          │
    │                          │──────────────────────────▶│
    │                          │                           │
    │                          │  { data: [...] }          │
    │                          │◀──────────────────────────│
    │                          │                           │
    │  result via SSE          │                           │
    │◀─────────────────────────│                           │
```

## Why Single Agent?

We use a single agent instead of multiple sub-agents because:

### 1. External Tools Don't Forward Through Sub-Agents

When using sub-agents with `call_agent`:
```
Main Agent (builtin = ["call_agent"])
    │
    └──▶ call_agent("ui_agent", "select span abc")
              │
              └──▶ UI Agent (external = ["*"])
                        │
                        └──▶ select_span({spanId: "abc"})
                                    ↑
                                    │
                          This tool call is NOT visible
                          to the frontend! It's internal
                          to the Distri server.
```

The external tool calls from sub-agents are not routed back to the frontend.

### 2. Single Agent Benefits

- **Simpler** - No orchestration logic needed
- **Faster** - No sub-agent coordination overhead
- **Better context** - Single agent sees full conversation
- **Easier debugging** - One agent to monitor

## Service Stack

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  (React App)    │     │  (Agent Runtime)│     │   (Rust API)    │
│  localhost:5173 │     │  localhost:8080 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
      │                        │                        │
      │ @distri/react          │ Agent                  │ /api/runs
      │ useAgent, Chat         │ vllora_main_agent      │ /api/spans
      │                        │                        │ /api/groups
      └────────────────────────┴────────────────────────┘
```

## Workflow Example: Checking Errors

```
User: "Can you check for errors in this thread?"

1. Agent calls get_current_view
   └──▶ Frontend emits event
   └──▶ Hook responds: {page: "chat", threadId: "abc123", projectId: "default"}

2. Agent calls fetch_runs({threadIds: ["abc123"]})
   └──▶ Frontend calls listRuns API
   └──▶ Backend returns: [{run_id: "run1", status: "error", ...}]

3. Agent analyzes the data
   └──▶ Finds run with status="error"

4. Agent calls get_run_details({runId: "run1"})
   └──▶ Frontend calls getRunDetails API
   └──▶ Backend returns: {run: {...}, spans: [...]}

5. Agent identifies the failed span
   └──▶ Sees span with error message

6. Agent responds:
   "Found 1 failed run. Run run1 failed with error 'Rate limit exceeded'
    in the OpenAI API call span. This typically happens when..."
```

## Related Documents

- [Agents](./agents.md) - Agent definition and prompt
- [Tools](./tools.md) - Tool handler implementations
- [Frontend Integration](./frontend-integration.md) - React integration details
