# Agent Definitions

## Overview

vLLora uses a multi-agent architecture with one orchestrator and three specialized sub-agents:

| Agent | File | Purpose | Max Iterations |
|-------|------|---------|----------------|
| **vllora_orchestrator** | `vllora-orchestrator.md` | Routes to sub-agents, manages workflows | 10 |
| **vllora_ui_agent** | `vllora-ui-agent.md` | UI interactions | 5 |
| **vllora_data_agent** | `vllora-data-agent.md` | Data analysis (three-phase) | 8 |
| **vllora_experiment_agent** | `vllora-experiment-agent.md` | Experiment optimization | 10 |

## 1. vllora_orchestrator

**Location:** `gateway/agents/vllora-orchestrator.md`

```toml
name = "vllora_orchestrator"
description = "Coordinates vLLora workflows across specialized sub-agents"
sub_agents = ["vllora_ui_agent", "vllora_data_agent", "vllora_experiment_agent"]
max_iterations = 10
tool_format = "provider"

[model_settings]
model = "gpt-4.1"
```

**Auto-generated tools:**
- `call_vllora_ui_agent` - Delegate UI tasks
- `call_vllora_data_agent` - Delegate data queries
- `call_vllora_experiment_agent` - Delegate optimization

### Workflows (14 total)

| # | Workflow | Trigger | Steps |
|---|----------|---------|-------|
| 1 | Run Analysis | Questions about a run | data_agent → final |
| 2 | Span Analysis | Questions about a span | data_agent → final |
| 3 | Comprehensive Analysis | Generic questions | data_agent → final |
| 4 | Error Analysis | "check for errors" | data_agent → final |
| 5 | Performance Analysis | "performance", "slow" | data_agent → final |
| 6 | Cost Analysis | "cost", "tokens" | data_agent → final |
| 7 | Experiment/Optimize | "optimize" (not on experiment page) | ui_agent (validate) → ui_agent (navigate) → experiment_agent → final |
| 8 | Analyze Experiment | "optimize" (on experiment page, no explicit change) | experiment_agent → final |
| 9 | Apply Optimization | "apply", "switch to {model}" | experiment_agent → final |
| 10 | Greetings/Help | "hello", "help" | final (direct response) |
| 11 | Label Discovery | "what labels exist?" | data_agent (list_labels) → final |
| 12 | Label Filtering (data) | "show me flight_search traces" | data_agent (fetch_spans_summary with labels) → final |
| 13 | Label Filtering (UI) | "filter by label" | ui_agent (apply_label_filter) → final |
| 14 | Label Comparison | "compare flight_search with hotel_search" | data_agent → final |

### Workflow 7: Experiment/Optimize (5 steps)

```
Step 0: Resolve target spanId
  - If user provided spanId → use it
  - Else if current_view_detail_of_span_id → use that
  - Else if open_run_ids → call data_agent to pick best candidate
  - Else → ask clarification

Step 1: call_vllora_ui_agent("Check if span {spanId} is valid for optimization")
Step 2: If valid → call_vllora_ui_agent("Navigate to experiment page for span {spanId}")
        If NOT valid → call final("Cannot optimize this span: {reason}")
Step 3: After navigation → call_vllora_experiment_agent("Analyze/apply/optimize...")
Step 4: After analysis/results → call final(results)
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

**Location:** `gateway/agents/vllora-ui-agent.md`

```toml
name = "vllora_ui_agent"
description = "Controls vLLora UI - selection, navigation, visibility"
max_iterations = 5
tool_format = "provider"

[tools]
external = ["get_collapsed_spans", "navigate_to_experiment",
            "is_valid_for_optimize", "apply_label_filter"]

[model_settings]
model = "gpt-4.1"
temperature = 0.1
```

**Tools (4):**

| Category | Tools |
|----------|-------|
| Visibility | `get_collapsed_spans` |
| Navigation | `navigate_to_experiment`, `is_valid_for_optimize` |
| Filtering | `apply_label_filter` |

### Task Types

```markdown
## "Check if span {spanId} is valid for optimization"
1. is_valid_for_optimize with spanId
2. final → { valid: true/false, reason: "..." }

## "Navigate to experiment page for span {spanId}"
1. navigate_to_experiment with spanId (DO NOT call is_valid_for_optimize)
2. final → "Navigated to experiment page"

## "Apply label filter with labels=[label_name]"
1. apply_label_filter with labels and action
2. final → "Label filter applied: {labels}"

## "Clear label filter"
1. apply_label_filter with action="clear"
2. final → "Label filter cleared"
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

**Location:** `gateway/agents/vllora-data-agent.md`

```toml
name = "vllora_data_agent"
description = "Fetches and analyzes trace data from vLLora backend"
max_iterations = 8
tool_format = "provider"

[tools]
builtin = ["final"]
external = ["fetch_runs", "fetch_spans", "get_run_details", "fetch_groups",
            "fetch_spans_summary", "get_span_content", "list_labels", "analyze_with_llm"]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
```

**Tools (8):**

| Tool | Purpose |
|------|---------|
| `fetch_runs` | Get runs with filters |
| `fetch_spans` | Get spans with filters (default limit: 10) |
| `get_run_details` | Get run + all spans |
| `fetch_groups` | Get aggregated metrics |
| `fetch_spans_summary` | Phase 1: fetch all, store, return summary |
| `get_span_content` | Phase 2: retrieve specific spans (max 5) |
| `list_labels` | Get available labels with counts |
| `analyze_with_llm` | Phase 3: LLM semantic analysis (max 5 spans) |

### Three-Phase Analysis

```markdown
# THREE-PHASE ANALYSIS WORKFLOW

1. Call `fetch_spans_summary(threadIds=["<thread-id>"])`
2. If `semantic_error_spans` is non-empty → call `analyze_with_llm(spanIds=[...], focus="semantic")`
3. Call `final()` with your report - TRANSLATE the JSON into markdown format
```

### Phase 1: fetch_spans_summary

```markdown
Fetches ALL spans, stores in browser memory, returns lightweight summary:
- Aggregate stats (total spans, by operation, by status)
- Error spans (explicit errors with status/error fields)
- Semantic error spans (patterns detected via regex)
- Slowest spans (top 5)
- Most expensive spans (top 5)
- Latency percentiles (p50, p95, p99)
```

### Phase 2: get_span_content (optional)

```markdown
Retrieves specific spans from memory for inspection:
- Max 5 spans per call
- Returns span data with input/output excerpts
```

### Phase 3: analyze_with_llm

```markdown
Deep LLM semantic analysis of flagged spans:
- Uses structured output (JSON schema)
- Returns issue types, data snippets, root cause, recommendations
- Max 5 spans per call

Issue types detected:
1. Silent Failures - status="success" but results empty
2. Buried Warnings - warnings hidden in long responses
3. Gradual Degradation - responses getting worse over time
4. Tool Errors - tool name mismatches, invalid calls
```

### Response Format Translation

The data agent must translate `analyze_with_llm` JSON into markdown:

| JSON Field | Maps To |
|------------|---------|
| `issue_title` | `### Issue X: [issue_title]` |
| `span_id` | `**Span**: \`span_id\`` |
| `severity` | `**Severity**: High/Medium/Low` |
| `data_snippet` | Inside **What happened**: block |
| `explanation` | Inside **Why this is a problem**: block |

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

**Location:** `gateway/agents/vllora-experiment-agent.md`

```toml
name = "vllora_experiment_agent"
description = "Executes experiment operations - analyze, apply, run, evaluate"
max_iterations = 10
tool_format = "provider"

[tools]
external = ["get_experiment_data", "apply_experiment_data",
            "run_experiment", "evaluate_experiment_results"]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
```

**Tools (4):**

| Tool | Purpose |
|------|---------|
| `get_experiment_data` | Get current state |
| `apply_experiment_data` | Make changes (patch semantics) |
| `run_experiment` | Execute (60s timeout) |
| `evaluate_experiment_results` | Compare original vs new |

### Task Types

```markdown
## "Analyze" / "Suggest optimizations" (no explicit change provided)
1. get_experiment_data → read current state
2. final → analysis with options

## "Apply {changes}" / "Run with {model}"
1. get_experiment_data → read current state
2. apply_experiment_data → apply changes
3. run_experiment → execute
4. evaluate_experiment_results → compare
5. final → report results with metrics

## "Optimize for quality" (auto-apply, no model changes)
1. get_experiment_data → read current state
2. apply_experiment_data → prompt/param edits only
3. run_experiment → execute
4. evaluate_experiment_results → compare
5. If hallucination → retry once with stricter prompt
6. final → report attempt(s) + verdict
```

### Evaluation Protocol

```markdown
1) Efficiency analysis ("Cheaper" check)
- Compare cost and token usage
- Cite percentage changes

2) Quality rubric ("Better" check)
- Instruction adherence
- Factuality & logic
- Signal-to-noise
- Formatting
- Tool correctness

3) Final verdict
- BETTER: higher quality OR (equal quality + lower cost)
- WORSE: lower quality OR (equal quality + higher cost)
- TRADEOFF: higher quality but higher cost
- FAILURE: hallucinated, broke format, crashed
```

### Response Format

```markdown
Applied: {changes}

Applied data (exact):
```json
{...}
```

Diff (applied keys only; before → after):
```json
{
  "<key>": { "from": <old>, "to": <new> }
}
```

Metrics:
- Cost: ${old} → ${new} ({change}%)
- Tokens: {old} → {new} ({change}%)
- Duration: {old}ms → {new}ms

Efficiency summary: {bullets citing % deltas}
Quality summary: {bullets with output snippets}
Verdict: {BETTER|WORSE|TRADEOFF|FAILURE} ({rationale})
```

## Agent Registration

Agents auto-register on app load via `agent-sync.ts`:

```typescript
// Agent files are in gateway/agents/
const AGENT_FILES = [
  'vllora-orchestrator.md',
  'vllora-ui-agent.md',
  'vllora-data-agent.md',
  'vllora-experiment-agent.md',
];
```

The main agent is `vllora_orchestrator` - all user messages go there first.

## Related Documents

- [Tools](./tools.md) - Tool implementations
- [Architecture](./architecture.md) - System overview
- [Frontend Integration](./frontend-integration.md) - React integration
