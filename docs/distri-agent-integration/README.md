# Lucy - vLLora AI Assistant

## What is Lucy?

Lucy is the AI assistant embedded in vLLora, an observability platform for AI agents. Lucy helps users analyze their AI agent traces, identify issues, and optimize performance.

## Why Lucy Exists

When debugging AI agents, users face several challenges:

1. **Trace Overload** - A single agent run can have hundreds of spans (LLM calls, tool calls, etc.)
2. **Hidden Failures** - Tools may return `status: "success"` but contain empty results or buried warnings
3. **Context Switching** - Users need to navigate between traces, metrics, and experiments
4. **Pattern Recognition** - Identifying issues like gradual degradation or silent failures requires expertise

Lucy solves these by:
- Automatically fetching and summarizing trace data
- Detecting semantic errors that explicit status codes miss
- Providing actionable insights with actual data snippets
- Navigating the UI on behalf of the user
- Running experiments to optimize LLM calls

## Architecture Overview

Lucy uses the **Distri multi-agent framework**:

```
User Message
     ↓
┌─────────────────────────────────────┐
│       vllora_orchestrator           │
│  - Routes to specialized agents     │
│  - Manages 11 workflow types        │
└─────────────────────────────────────┘
         │                   │
         ↓                   ↓
   ┌──────────┐       ┌──────────┐
   │ UI Agent │       │Data Agent│
   │ 4 tools  │       │ 8 tools  │
   └──────────┘       └──────────┘
```

**Key Design Decisions:**
- **Multi-agent** - Each agent has focused tools (4-8 instead of 16)
- **Three-phase analysis** - Prevents LLM context overflow with large traces
- **Pass-through formatting** - Data agent formats response, orchestrator passes verbatim
- **Structured output** - JSON schema ensures consistent LLM analysis results

## Key Files

### Agent Definitions (Prompts)

| File | Purpose |
|------|---------|
| [gateway/agents/vllora-orchestrator.md](../../../../gateway/agents/vllora-orchestrator.md) | Routes requests, manages workflows |
| [gateway/agents/vllora-data-agent.md](../../../../gateway/agents/vllora-data-agent.md) | Fetches and analyzes trace data |
| [gateway/agents/vllora-ui-agent.md](../../../../gateway/agents/vllora-ui-agent.md) | UI interactions (navigate, filter) |

### Tool Implementations

| Directory/File | Purpose |
|----------------|---------|
| [ui/src/lib/distri-data-tools/](../../../src/lib/distri-data-tools/) | Data tools (modular, 8 files) |
| [ui/src/lib/distri-ui-tools.ts](../../../src/lib/distri-ui-tools.ts) | UI tools + validation cache |

### Documentation

| File | Purpose |
|------|---------|
| [lucy-architecture.md](./lucy-architecture.md) | Complete architecture with diagrams |
| [debugging-lucy.md](./debugging-lucy.md) | How to debug Lucy's responses |
| [tools.md](./tools.md) | Tool specifications |
| [agents.md](./agents.md) | Agent definitions |

## Common Tasks

### 1. Changing Agent Prompts

Agent prompts are in markdown files with TOML frontmatter:

```markdown
---
name = "vllora_data_agent"
description = "Fetches and analyzes trace data"
max_iterations = 8
tool_format = "provider"

[tools]
builtin = ["final"]
external = ["fetch_runs", "fetch_spans", ...]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
---

# ROLE
You are a trace analyzer...

# WORKFLOW
1. Call `fetch_spans_summary(...)`
2. If errors found → call `analyze_with_llm(...)`
3. Call `final()` with your report

# TASK
{{task}}
```

**To modify behavior:**
- Edit the markdown content (workflow, response format, rules)
- Change `max_iterations` if agent needs more/fewer steps
- Adjust `temperature` for more/less creative responses
- Add/remove tools in the `[tools]` section

### 2. Adding a New Tool

**Step 1: Define the tool handler**

```typescript
// In ui/src/lib/distri-data-tools/my-new-tool.ts
import type { ToolDefinition } from './helpers';

export const myNewToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'my_new_tool',
    description: 'What this tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'First parameter' },
      },
      required: ['param1'],
    },
  },
};

export async function handleMyNewTool(
  args: { param1: string },
  context: { projectId: string }
): Promise<string> {
  // Implementation
  return JSON.stringify({ result: 'success' });
}
```

**Step 2: Export from index.ts**

```typescript
// In ui/src/lib/distri-data-tools/index.ts
export { myNewToolDefinition, handleMyNewTool } from './my-new-tool';
```

**Step 3: Register in the tool handler**

```typescript
// In the main tool handler
case 'my_new_tool':
  return handleMyNewTool(args, context);
```

**Step 4: Add to agent's tool list**

```markdown
[tools]
external = ["fetch_runs", ..., "my_new_tool"]
```

### 3. Adjusting Tool Implementation

Tools are in `ui/src/lib/distri-data-tools/`:

```
distri-data-tools/
├── index.ts                 # Entry point, exports all
├── helpers.ts               # Shared utilities
├── fetch-runs.ts            # List runs
├── fetch-spans.ts           # List spans (paginated)
├── get-run-details.ts       # Single run with spans
├── fetch-groups.ts          # Aggregated metrics
├── fetch-spans-summary.ts   # Phase 1: fetch all, summarize
├── get-span-content.ts      # Phase 2: retrieve specific
├── list-labels.ts           # Available labels
└── analyze-with-llm.ts      # Phase 3: LLM analysis
```

**Key patterns:**

1. **Return JSON strings** - Tools return `JSON.stringify(result)`
2. **Include error info** - Return `{ error: "message" }` on failure
3. **Limit data size** - Summarize large datasets to avoid context overflow

### 4. Debugging Issues

See [debugging-lucy.md](./debugging-lucy.md) for detailed steps.

**Quick checks:**

```bash
# Check span flow for a thread
sqlite3 ~/.vllora/vllora.db \
  "SELECT operation_name, json_extract(attribute, '$.\"tool.name\"') \
   FROM traces WHERE thread_id = '<THREAD_ID>' ORDER BY start_time_us;"

# Check data agent's final response
sqlite3 ~/.vllora/vllora.db \
  "SELECT substr(attribute, 1, 5000) FROM traces \
   WHERE thread_id = '<THREAD_ID>' \
   AND json_extract(attribute, '$.\"tool.name\"') = 'final' \
   AND json_extract(attribute, '$.label') = 'vllora_data_agent';"
```

## How Sub-Agent Communication Works

Distri auto-generates `call_<agent_name>` tools for sub-agents:

```
1. Orchestrator calls: call_vllora_data_agent("Analyze thread X")
2. Distri creates child ExecutorContext
3. Data Agent executes with the task
4. Data Agent calls: final("formatted markdown response")
5. Result stored in ExecutorContext
6. Orchestrator receives: tool response = "formatted markdown response"
7. Orchestrator calls: final(data_agent_response) ← PASS THROUGH
8. User sees the response
```

**Critical Rule:** The orchestrator must pass through the data agent's response VERBATIM. It should NOT reformat or add tables.

## Three-Phase Analysis

To handle large trace datasets without overflowing LLM context:

| Phase | Tool | Purpose |
|-------|------|---------|
| 1 | `fetch_spans_summary` | Fetch ALL spans, store in memory, return summary stats + flagged spans |
| 2 | `get_span_content` | Retrieve specific spans for inspection (optional) |
| 3 | `analyze_with_llm` | Deep semantic analysis of flagged spans using LLM |

**Phase 1 returns:**
- Aggregate stats (total spans, by operation, by status)
- Cost/token summary
- Latency percentiles (p50, p95, p99)
- Error spans (explicit errors)
- Semantic error spans (regex-detected patterns)
- Slowest/expensive spans (top 5 each)

**Phase 3 uses structured output:**
```json
{
  "span_analyses": [{
    "span_id": "abc123",
    "issue_title": "Silent Failure",
    "issues": [{
      "severity": "high",
      "data_snippet": "{\"status\": \"success\", \"results\": []}",
      "explanation": "Status says success but results empty"
    }]
  }],
  "recommendations": ["Add empty result checks"]
}
```

## Response Format

The data agent formats its response in markdown:

```markdown
## Summary
**Task**: Analyzing thread for hidden issues
**Result**: 3 hidden issues found | Cost: $0.0037 | Duration: 2500ms

## Stats

| Metric | Value |
|--------|-------|
| Spans | 15 total (12 success, 3 errors, 2 semantic issues) |
| Operations | run: 5, tools: 10 |
| Duration | 2500ms total |
| Cost | $0.0037 (1500 in / 800 out tokens) *(omit if 0)* |
| Latency | p50=245ms, p95=1200ms, p99=2100ms, max=2500ms |
| Models | gpt-4o-mini, gpt-4 |
| Labels | flight_search, hotel_search |
| Cache Hit | 45% (675 cached tokens) |
| TTFT | p50=150ms, p95=350ms, avg=200ms |
| Slowest | `abc123` (search_flights) - 2500ms |
| Most Expensive | `def456` (gpt-4 call) - $0.0012 |

### Model Breakdown

| Model | Calls | Cost | Tokens (in/out) |
|-------|-------|------|-----------------|
| gpt-4o-mini | 10 | $0.002 | 1000/500 |
| gpt-4 | 5 | $0.0017 | 500/300 |

### Tool Usage

| Tool | Calls |
|------|-------|
| search_flights | 3 |
| book_hotel | 2 |

### Repeated Failures *(if patterns detected)*

| Name | Count | Type |
|------|-------|------|
| search_web | 3 | tool |

## Issues Detected *(only shown if issues found)*

| # | Issue | Span | Severity | What Happened | Why It's a Problem |
|---|-------|------|----------|---------------|-------------------|
| 1 | Silent Search Failure | `abc123` | High | Results empty: `{"results": []}` | Status says success but no data returned |
| 2 | Truncated Response | `def456` | Medium | Content cut off: `"...overview of t..."` | User misses important information |

## Recommendations *(only shown if issues found)*
- Add checks for empty results
```

## Service Stack

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  localhost:5173 │     │  localhost:8081 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

- **vLLora UI** - React frontend, hosts tool handlers
- **Distri Server** - Agent execution, manages orchestrator + sub-agents
- **vLLora Backend** - Rust API, SQLite database (`~/.vllora/vllora.db`)

## Troubleshooting Checklist

- [ ] Agent prompt has correct `[tools]` section
- [ ] Tool is exported from `index.ts`
- [ ] Tool is registered in handler switch statement
- [ ] Tool returns JSON string (not object)
- [ ] Error cases return `{ error: "message" }`
- [ ] Agent prompt includes `{{task}}` placeholder
- [ ] Orchestrator passes data agent response verbatim (no reformatting)

## Related Documentation

- [Distri Framework](https://github.com/anthropics/distri) - Multi-agent framework
- [vLLora Backend API](../../../../README.md) - Backend endpoints
