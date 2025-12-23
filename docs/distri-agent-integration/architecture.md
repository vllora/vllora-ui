# Multi-Agent Architecture

This document describes the architecture of the Distri multi-agent system for vLLora.

## System Architecture

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
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         MAIN AGENT (Orchestrator)                      │ │
│  │  Purpose: Analyze traces, identify issues, find bottlenecks            │ │
│  │  Can call: ui_agent, data_agent                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                          │                         │                        │
│              ┌───────────┴───────────┐ ┌──────────┴────────────┐           │
│              ▼                       ▼ ▼                        ▼           │
│  ┌─────────────────────┐    ┌─────────────────────────────────────────┐    │
│  │   UI AGENT (11)     │    │           DATA AGENT (4)                │    │
│  │                     │    │                                         │    │
│  │  GET STATE (5):     │    │  • fetch_runs      • get_run_details    │    │
│  │  • get_current_view │    │  • fetch_spans     • fetch_groups       │    │
│  │  • get_selection_   │    │                                         │    │
│  │    context          │    │                                         │    │
│  │  • get_thread_runs  │    │                                         │    │
│  │  • get_span_details │    │                                         │    │
│  │  • get_collapsed_   │    │                                         │    │
│  │    spans            │    │                                         │    │
│  │                     │    │                                         │    │
│  │  CHANGE UI (6):     │    │                                         │    │
│  │  • open/close_modal │    │                                         │    │
│  │  • select_span/run  │    │                                         │    │
│  │  • expand/collapse_ │    │                                         │    │
│  │    span             │    │                                         │    │
│  └─────────────────────┘    └─────────────────────────────────────────┘    │
│        (External)                        (External)                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How External Tools Work

All agents use `external = ["*"]`, which means tool calls are routed back to the frontend:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     How External Tools Work                                  │
│                                                                              │
│  vLLora UI                    Distri Server                                  │
│  ─────────                    ─────────────                                  │
│  1. User asks question ──────▶ 2. Agent decides to call tool                │
│                               │                                              │
│  4. Frontend executes tool ◀── 3. Returns tool call to frontend             │
│     (UI tools: change state)  │    (external = ["*"])                       │
│     (Data tools: fetch API)   │                                              │
│                               │                                              │
│  5. Returns result ───────────▶ 6. Agent continues with result              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Benefits of this approach:**
- No modifications to Distri repo
- All code in vLLora repo (easy to maintain)
- Frontend has direct access to React context and APIs
- Data tools can call vLLora backend directly

## Multi-Agent Orchestration

The main agent uses the `call_agent` builtin tool to orchestrate sub-agents:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Distri Agent Store                         │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │
│  │ vllora_main_agent│ │ vllora_ui_agent  │ │vllora_data_agent│ │
│  │                  │ │                  │ │                 │ │
│  │ [tools]          │ │ [tools]          │ │ [tools]         │ │
│  │ builtin =        │ │ external = ["*"] │ │ external = ["*"]│ │
│  │   ["call_agent"] │ │                  │ │                 │ │
│  │                  │ │ (handled by UI)  │ │ (handled by UI) │ │
│  └────────┬─────────┘ └──────────────────┘ └─────────────────┘ │
│           │                    ▲                    ▲           │
│           │  call_agent(       │  call_agent(       │           │
│           │   "vllora_ui_agent"│   "vllora_data_    │           │
│           │   task: "..."      │    agent"          │           │
│           │  )                 │   task: "..."      │           │
│           └────────────────────┴────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

**Key mechanism: `call_agent` builtin tool**

The main agent has `builtin = ["call_agent"]` which gives it the ability to call any other registered agent by name. The main agent learns which agents exist from its **instructions**.

## Workflow Patterns

### Pattern 1: Investigate an Issue

```
User: "Why did my agent fail?"

Main Agent:
  │
  ├─▶ call_agent("vllora_data_agent", "fetch runs with errors from today")
  │   └─▶ Data Agent returns: [{run_id: "abc", error: "Rate limit exceeded"}]
  │
  ├─▶ Analyzes the error
  │
  ├─▶ call_agent("vllora_ui_agent", "select run abc and highlight the failed span")
  │   └─▶ UI Agent:
  │       ├─▶ select_run({runId: "abc"})
  │       └─▶ select_span({spanId: "xyz"})
  │
  └─▶ Returns: "Your agent failed due to rate limiting. The failed span is highlighted."
```

### Pattern 2: Performance Analysis

```
User: "Find performance bottlenecks"

Main Agent:
  │
  ├─▶ call_agent("vllora_data_agent", "fetch last 10 runs with timing")
  │   └─▶ Returns: [{run_id: "1", duration: 5200ms}, ...]
  │
  ├─▶ Identifies slow spans (> 2s)
  │
  ├─▶ call_agent("vllora_ui_agent", "expand and highlight span xyz")
  │   └─▶ UI Agent:
  │       ├─▶ expand_span({spanId: "xyz"})
  │       └─▶ select_span({spanId: "xyz"})
  │
  └─▶ Returns: "Found bottleneck: OpenAI API call taking 5.2s. Highlighted in view."
```

### Pattern 3: Context-Aware Analysis

```
User: "What's wrong with what I'm looking at?"

Main Agent:
  │
  ├─▶ call_agent("vllora_ui_agent", "get current selection context")
  │   └─▶ UI Agent:
  │       ├─▶ get_current_view() → {page: "/traces", threadId: "123"}
  │       └─▶ get_selection_context() → {selectedSpanId: "abc"}
  │
  ├─▶ call_agent("vllora_data_agent", "get details for span abc")
  │   └─▶ Returns: {span_id: "abc", error: "Timeout", duration: 30000ms}
  │
  └─▶ Returns: "The selected span failed with a 30s timeout. Consider adding retry logic."
```

## Service Stack

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  (React App)    │     │  (Agent Runtime)│     │   (Rust API)    │
│  localhost:5173 │     │  localhost:8080 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
      │                        │                        │
      │ @distri/react          │ Agents                 │ /traces, /runs
      │ useChat, useAgent      │ vllora-main-agent      │ /spans, /groups
      └────────────────────────┴────────────────────────┘
```

## Related Documents

- [Agents](./agents.md) - Detailed agent definitions
- [Tools](./tools.md) - Tool handler implementations
- [Setup Guide](./setup-guide.md) - How to run the full stack
