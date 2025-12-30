# Agent Definitions

## Overview

vLLora uses a multi-agent architecture with one orchestrator and three specialized sub-agents:

| Agent | File | Purpose | Max Iterations |
|-------|------|---------|----------------|
| **vllora_orchestrator** | `vllora-orchestrator.md` | Routes to sub-agents, manages workflows | 10 |
| **vllora_ui_agent** | `vllora-ui-agent.md` | UI interactions | 5 |
| **vllora_data_agent** | `vllora-data-agent.md` | Data analysis (two-phase) | 8 |
| **vllora_experiment_agent** | `vllora-experiment-agent.md` | Experiment optimization | 10 |

## 1. vllora_orchestrator

**Location:** `public/agents/vllora-orchestrator.md`

```toml
name = "vllora_orchestrator"
description = "Coordinates vLLora workflows across specialized sub-agents"
sub_agents = ["vllora_ui_agent", "vllora_data_agent", "vllora_experiment_agent"]
max_iterations = 10
```

**Auto-generated tools:**
- `call_vllora_ui_agent` - Delegate UI tasks
- `call_vllora_data_agent` - Delegate data queries
- `call_vllora_experiment_agent` - Delegate optimization

### Workflows (8 total)

| # | Workflow | Trigger | Steps |
|---|----------|---------|-------|
| 1 | Comprehensive Analysis | Generic questions | data_agent → final |
| 2 | Error Analysis | "check for errors" | data_agent → final |
| 3 | Performance Analysis | "performance", "slow" | data_agent → final |
| 4 | Cost Analysis | "cost", "tokens" | data_agent → final |
| 5 | Optimize Span | "optimize" (not on experiment page) | ui_agent (validate) → ui_agent (navigate) → experiment_agent → final |
| 6 | Analyze Experiment | "optimize" (on experiment page) | experiment_agent → final |
| 7 | Apply Optimization | "apply", "do it", "yes" | experiment_agent → final |
| 8 | Greetings/Help | "hello", "help" | final (direct response) |

### Workflow 5: Optimize Span (4 steps)

```
Step 1: call_vllora_ui_agent("Check if span {spanId} is valid for optimization")
Step 2: If valid → call_vllora_ui_agent("Navigate to experiment page for span {spanId}")
        If NOT valid → call final("Cannot optimize this span: {reason}")
Step 3: After navigation → call_vllora_experiment_agent("Analyze and suggest optimizations")
Step 4: After analysis → call final(optimization suggestions)
```

### Loop Prevention

The orchestrator includes explicit loop prevention rules:

```markdown
## CRITICAL: Handle Sub-Agent Errors
If a sub-agent returns an error message:
→ IMMEDIATELY call `final` with the error message
→ DO NOT retry the workflow

## CRITICAL: Avoid Infinite Loops
- DO NOT call the same sub-agent with the same request again
- If experiment agent returned results (cost savings, metrics) → call final IMMEDIATELY

## Workflow Completion Signals
Call `final` immediately when you see:
- "cost savings", "% savings", "cost change"
- "Results:", "Comparison:"
- "tokens:", "latency:"
- Error messages
```

## 2. vllora_ui_agent

**Location:** `public/agents/vllora-ui-agent.md`

```toml
name = "vllora_ui_agent"
description = "Controls vLLora UI - selection, navigation, visibility"
max_iterations = 5
[tools]
external = ["select_span", "select_run", "expand_span", "collapse_span",
            "get_collapsed_spans", "open_modal", "close_modal",
            "navigate_to_experiment", "is_valid_for_optimize",
            "get_selection_context", "get_thread_runs", "get_span_details"]
```

**Tools (12):**

| Category | Tools |
|----------|-------|
| Selection | `select_span`, `select_run` |
| Visibility | `expand_span`, `collapse_span`, `get_collapsed_spans` |
| Modals | `open_modal`, `close_modal` |
| Navigation | `navigate_to_experiment`, `is_valid_for_optimize` |
| State | `get_selection_context`, `get_thread_runs`, `get_span_details` |

### Task Types

```markdown
## "Check if span {spanId} is valid for optimization"
1. is_valid_for_optimize with spanId
2. final → { valid: true/false, reason: "..." }

## "Navigate to experiment page for span {spanId}"
1. navigate_to_experiment with spanId (DO NOT call is_valid_for_optimize)
2. final → "Navigated to experiment page"

## "Select span {spanId}"
1. select_span with spanId
2. final → "Selected span {spanId}"
```

### Rules

```markdown
# RULES

1. Execute the task with the minimum required tool calls
2. Call `final` IMMEDIATELY after completing the UI action(s)
3. Trust tool results - do NOT call the same tool with the same parameters again

## Validation Cache
- `is_valid_for_optimize` results are CACHED per span_id
- If called again with the same span_id, returns cached result instantly (no API call)

## After Tool Returns
- If tool succeeded → call `final` with confirmation
- If tool failed → call `final` with error message
- Do NOT retry the same tool call
```

## 3. vllora_data_agent

**Location:** `public/agents/vllora-data-agent.md`

```toml
name = "vllora_data_agent"
description = "Fetches and analyzes trace data from vLLora backend"
max_iterations = 8
[tools]
external = ["fetch_runs", "fetch_spans", "get_run_details", "fetch_groups",
            "fetch_spans_summary", "get_span_content"]
```

**Tools (6):**

| Tool | Purpose |
|------|---------|
| `fetch_runs` | Get runs with filters |
| `fetch_spans` | Get spans with filters (max 10) |
| `get_run_details` | Get run + all spans |
| `fetch_groups` | Get aggregated metrics |
| `fetch_spans_summary` | Two-phase: fetch all, return summary |
| `get_span_content` | Two-phase: analyze specific spans |

### Two-Phase Analysis

```markdown
# TWO-PHASE ANALYSIS

## Phase 1: Get Summary
Call `fetch_spans_summary` with threadIds. This:
1. Fetches ALL spans internally (no matter how many)
2. Stores full data in browser memory
3. Returns lightweight summary with:
   - Aggregate stats (total spans, by operation, by status)
   - Error spans (explicit errors with status/error fields)
   - Semantic error spans (patterns like "not found", "failed", etc.)
   - Slowest spans (top 5)
   - Most expensive spans (top 5)

## Phase 2: Deep Analysis (if needed)
If you need to investigate specific spans:
1. Call `get_span_content` with span_ids from the summary
2. Max 5 spans per call
3. Returns analysis results (NOT raw data):
   - `semantic_issues`: detected patterns with context and severity
   - `content_stats`: input/output lengths, has_tool_calls
   - `assessment`: client-side summary of findings
```

### Task Types

```markdown
## "Fetch all spans for thread {threadId} with full analysis"
1. fetch_spans_summary with threadIds=[threadId]
2. If error_spans or semantic_error_spans found:
   get_span_content with spanIds=[flagged span IDs]
3. final → comprehensive report

## "Fetch all spans for thread {threadId} and check for errors"
1. fetch_spans_summary with threadIds=[threadId]
2. Review error_spans and semantic_error_spans
3. If semantic errors found, use get_span_content to verify
4. final → list of errors OR "no errors found"
```

### Data Model

```markdown
# DATA MODEL

## Hierarchy
Thread (conversation/session)
  └── Run (complete agent execution)
        └── Span (individual operation)
              └── Child Span (nested operation)

## Span Types (operation_name)
| operation_name | Description |
|----------------|-------------|
| `run` | Root span - entire agent execution |
| `cloud_api_invoke` | Incoming HTTP request |
| `api_invoke` | LLM API invocation wrapper |
| `model_call` | LLM model call with details |
| `openai` | OpenAI provider request/response |
| `anthropic` | Anthropic provider request/response |
| `gemini` | Google Gemini provider request/response |
| `tools` | Tool/function calls made by LLM |
```

## 4. vllora_experiment_agent

**Location:** `public/agents/vllora-experiment-agent.md`

```toml
name = "vllora_experiment_agent"
description = "Executes experiment operations - analyze, apply, run, evaluate"
max_iterations = 10
[tools]
external = ["get_experiment_data", "apply_experiment_data",
            "run_experiment", "evaluate_experiment_results"]
```

**Tools (4):**

| Tool | Purpose |
|------|---------|
| `get_experiment_data` | Get current state |
| `apply_experiment_data` | Make changes (one at a time) |
| `run_experiment` | Execute (60s timeout) |
| `evaluate_experiment_results` | Compare original vs new |

### Task Types

```markdown
## "Analyze" / "Suggest optimizations"
1. get_experiment_data → read current state
2. final → analysis with options:
   - Current model, temperature, token usage
   - Suggestions: model switch, temperature change, prompt optimization
   - Ask "Which would you like to try?"

## "Apply {changes}" / "Run with {model}"
1. get_experiment_data → read current state
2. apply_experiment_data → apply the specified changes
3. run_experiment → execute
4. evaluate_experiment_results → compare
5. final → report results with metrics
```

### Response Format

```markdown
For analysis:
Current setup: {model} with temperature {temp}

Optimization options:
1. Switch to gpt-3.5-turbo - ~80% cost savings
2. Lower temperature to 0.3 - more consistent outputs
3. Trim system prompt - reduce token usage

Which would you like to try?

For results:
Applied: {changes}

Results:
- Cost: ${old} → ${new} ({change}%)
- Tokens: {old} → {new} ({change}%)
- Latency: {old}ms → {new}ms

Output comparison: {brief quality assessment}
```

## Agent Registration

Agents auto-register on app load via `agent-sync.ts`:

```typescript
const AGENT_NAMES = [
  'vllora_orchestrator',
  'vllora_ui_agent',
  'vllora_data_agent',
  'vllora_experiment_agent',
] as const;
```

The main agent is `vllora_orchestrator` - all user messages go there first.

## Related Documents

- [Tools](./tools.md) - Tool implementations
- [Architecture](./architecture.md) - System overview
- [Frontend Integration](./frontend-integration.md) - React integration
