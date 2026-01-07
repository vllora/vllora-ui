# Lucy Architecture

Lucy is vLLora's AI assistant built on Distri's multi-agent framework. This document explains the complete architecture.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Message                                   │
│                     "analyze this thread for issues"                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                          vllora_orchestrator                                │
│  - Routes requests to specialized sub-agents                                │
│  - Manages 11 workflow types                                                │
│  - Passes through sub-agent responses (does NOT reformat)                   │
│                                                                             │
│  Auto-generated tools:                                                      │
│  • call_vllora_data_agent                                                   │
│  • call_vllora_ui_agent                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                         │
                    ▼                         ▼
          ┌─────────────────┐     ┌─────────────────┐
          │ vllora_ui_agent │     │vllora_data_agent│
          │                 │     │                 │
          │ 4 tools         │     │ 8 tools         │
          │ max_iter=5      │     │ max_iter=8      │
          └─────────────────┘     └─────────────────┘
```

## Agent Definitions

All agents are defined in markdown files with TOML frontmatter:

| Agent | File | Purpose |
|-------|------|---------|
| **vllora_orchestrator** | `gateway/agents/vllora-orchestrator.md` | Routes requests, manages workflows |
| **vllora_data_agent** | `gateway/agents/vllora-data-agent.md` | Fetches and analyzes trace data |
| **vllora_ui_agent** | `gateway/agents/vllora-ui-agent.md` | UI interactions (navigate, filter) |

## Agent Communication (Distri Framework)

### How sub-agent calling works

1. **Orchestrator** has `sub_agents = ["vllora_data_agent", ...]` in TOML
2. **Distri** auto-generates tools: `call_vllora_data_agent`, etc.
3. **Tool takes single string parameter**: the task to delegate

```
Orchestrator calls: call_vllora_data_agent("Fetch spans for thread X")
        ↓
Distri creates child ExecutorContext
        ↓
Data Agent executes with the task
        ↓
Data Agent calls: final("formatted markdown response")
        ↓
Result stored in ExecutorContext via set_final_result()
        ↓
Orchestrator receives: tool response = "formatted markdown response"
        ↓
Orchestrator calls: final(data_agent_response) ← PASS THROUGH
        ↓
User sees the response
```

### The `final()` tool

- Marks agent completion
- Stores result in ExecutorContext
- Returns result to parent agent as tool response
- Can accept string or JSON

## Data Agent Workflow (Three-Phase Analysis)

The data agent uses a three-phase approach to avoid LLM context overflow:

```
Phase 1: fetch_spans_summary
├── Fetches ALL spans (parallel pagination)
├── Stores in browser memory (spanStorage Map)
└── Returns lightweight summary:
    • total_spans, by_operation, by_status
    • total_cost, tokens, models_used
    • latency: p50, p95, p99
    • error_spans (explicit errors)
    • semantic_error_spans (regex-detected patterns)
    • slowest_spans, expensive_spans (top 5 each)

Phase 2: get_span_content (optional)
├── Retrieves specific spans from storage
└── Returns span data for inspection (max 5)

Phase 3: analyze_with_llm
├── Takes flagged span IDs from Phase 1
├── Calls LLM with structured output schema
└── Returns deep semantic analysis:
    • issue_title, severity
    • data_snippet (actual JSON from trace)
    • explanation (why it's a problem)
    • recommendations
```

### Data Agent Response Format

The data agent formats its response using data from BOTH tools:

```markdown
## Summary
**Task**: [What the agent was doing]
**Result**: [X] hidden issues found | Cost: $[total_cost] | Duration: [ms]

## Stats

| Metric | Value |
|--------|-------|
| Spans | [total] total ([success] success, [error] errors) |
| Cost | $[cost] ([input] in / [output] out tokens) |
| Latency | p50=[X]ms, p95=[Y]ms, p99=[Z]ms |
| Models | [models_used] |

## Hidden Issues Found

| # | Issue | Span | Severity | What Happened | Why It's a Problem |
|---|-------|------|----------|---------------|-------------------|
| 1 | [issue_title] | `[span_id]` | High | [Brief + data: `{"results": []}`] | [explanation] |
| 2 | [issue_title] | `[span_id]` | Medium | [Brief + data snippet] | [explanation] |

## Recommendations
- [from analyze_with_llm recommendations array]
```

## Orchestrator Behavior

### Workflow Routing

The orchestrator identifies the workflow from user's question:

| Workflow | Trigger | Action |
|----------|---------|--------|
| 1. Run Analysis | "analyze this run" | data_agent → final |
| 2. Span Analysis | "check this span" | data_agent → final |
| 3. Comprehensive | "what's wrong?", generic | data_agent → final |
| 4. Error Analysis | "check for errors" | data_agent → final |
| 5. Performance | "why is it slow?" | data_agent → final |
| 6. Cost Analysis | "how much did it cost?" | data_agent → final |
| 7. Greetings | "hello", "help" | final (direct) |
| 8-11. Label workflows | "show labels", "filter by X" | data_agent or ui_agent → final |

### Response Handling (CRITICAL)

For data analysis workflows (1-6, 8-11):

```
**CRITICAL: Copy the data agent's response VERBATIM to final(). Do NOT reformat.**

DO NOT:
- Add tables (Errors & Issues, Performance, Latency, Cost)
- Convert "What happened" / "Why this is a problem" format into tables
- Add sections that weren't in the data agent's response

DO:
- Copy the data agent's markdown response exactly as-is
- Call final(data_agent_response) without modification
```

## Tools

### Data Agent Tools (8)

| Tool | File | Purpose |
|------|------|---------|
| `fetch_runs` | `fetch-runs.ts` | Get runs with filters |
| `fetch_spans` | `fetch-spans.ts` | Get spans (default limit: 10) |
| `get_run_details` | `get-run-details.ts` | Get run + all spans |
| `fetch_groups` | `fetch-groups.ts` | Get aggregated metrics |
| `fetch_spans_summary` | `fetch-spans-summary.ts` | Phase 1: fetch all, store, summarize |
| `get_span_content` | `get-span-content.ts` | Phase 2: retrieve specific spans |
| `list_labels` | `list-labels.ts` | Get available labels with counts |
| `analyze_with_llm` | `analyze-with-llm.ts` | Phase 3: LLM semantic analysis |

### UI Agent Tools (4)

| Tool | Purpose |
|------|---------|
| `get_collapsed_spans` | Get collapsed span IDs |
| `is_valid_for_optimize` | Check if span can be optimized (cached) |
| `navigate_to_experiment` | Navigate to /experiment page |
| `apply_label_filter` | Apply label filter to UI |

## Tool Implementation Location

```
ui/src/lib/
├── distri-data-tools/           # Data tools (modular)
│   ├── index.ts                 # Entry point, exports all tools
│   ├── helpers.ts               # Shared utilities
│   ├── fetch-runs.ts
│   ├── fetch-spans.ts
│   ├── get-run-details.ts
│   ├── fetch-groups.ts
│   ├── fetch-spans-summary.ts   # Phase 1 + spanStorage
│   ├── get-span-content.ts      # Phase 2
│   ├── list-labels.ts
│   └── analyze-with-llm.ts      # Phase 3 (LLM call)
└── distri-ui-tools.ts           # UI tools + validation cache
```

## Span Storage (Context Sharing)

The three-phase analysis tools share data via `spanStorage`:

```typescript
// In fetch-spans-summary.ts
export const spanStorage: Map<string, Span> = new Map();

// Phase 1: Store spans
spanStorage.clear();
for (const span of allSpans) {
  spanStorage.set(span.span_id, span);
}

// Phase 2 & 3: Retrieve spans
import { spanStorage } from './fetch-spans-summary';
const span = spanStorage.get(spanId);
```

## Semantic Error Detection

### Phase 1: Regex patterns (fast)

```typescript
const ERROR_PATTERNS = [
  /not found/i,
  /does not exist/i,
  /failed to/i,
  /error:/i,
  /exception/i,
  /timeout/i,
  /rate limit/i,
  /unauthorized/i,
  // ... more patterns
];
```

### Phase 3: LLM analysis (deep)

Issue types detected:
1. **Silent Failures** - status="success" but results empty
2. **Buried Warnings** - warnings hidden in long responses
3. **Gradual Degradation** - responses getting worse over time
4. **Tool Errors** - tool name mismatches, invalid calls

## Structured Output (analyze_with_llm)

Uses OpenAI JSON schema for consistent results:

```typescript
const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'trace_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        overall_assessment: { type: 'string' },
        span_analyses: [{
          span_id: { type: 'string' },
          issue_title: { type: 'string' },
          issues: [{
            type: { enum: ['error', 'performance', 'semantic', 'other'] },
            severity: { enum: ['high', 'medium', 'low'] },
            data_snippet: { type: 'string' },  // Actual trace data
            explanation: { type: 'string' },   // Why it's a problem
          }],
        }],
        recommendations: [{ type: 'string' }],
      },
    },
  },
};
```

## Validation Caching

`is_valid_for_optimize` results are cached (5-min TTL):

```typescript
const VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const validationCache: Map<string, ValidationResult> = new Map();

// Returns cached result with _cached: true flag
if (cached) {
  return { ...cached, _cached: true };
}
```

## Service Stack

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  localhost:5173 │     │  localhost:8081 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │                                               ▼
        │                                    ┌─────────────────┐
        └───────────────────────────────────▶│  SQLite DB      │
          (tools call backend API directly)  │  ~/.vllora/     │
                                             └─────────────────┘
```

## Key Design Decisions

1. **Three-phase analysis** - Prevents LLM context overflow with large trace datasets
2. **Sub-agent delegation** - Each agent focused on specific domain (data, UI)
3. **Pass-through formatting** - Data agent formats, orchestrator passes through verbatim
4. **Structured output** - JSON schema ensures consistent LLM responses
5. **Span storage** - Browser memory sharing between tool phases
6. **Validation caching** - Prevents duplicate API calls from agent retries

## Related Documents

- [Debugging Lucy](./debugging-lucy.md) - How to check Lucy's responses
- [Tools](./tools.md) - Tool implementations
- [Agents](./agents.md) - Agent definitions
- [Architecture](./architecture.md) - System overview
