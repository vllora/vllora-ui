# Tool Handlers

This document describes the implementation of UI and Data tool handlers.

## Overview

All tools use `external = ["*"]`, meaning they are handled by the vLLora UI frontend:

| Category | File | Count | Description |
|----------|------|-------|-------------|
| UI Tools | `src/lib/distri-ui-tools.ts` | 5 | visibility, navigation, filtering |
| Data Tools | `src/lib/distri-data-tools/` | 8 | 4 basic + 3 three-phase analysis + 1 label discovery |

**Total: 13 tools**

## Tool Format

Tools are exported as `DistriFnTool[]` arrays for use with the `@distri/react` Chat component:

```typescript
// Tools use `parameters` (not `input_schema`)
{
  name: 'fetch_runs',
  description: 'Fetch runs from API',
  type: 'function',
  parameters: {
    type: 'object',
    properties: { ... },
    required: ['threadIds'],
  },
  handler: async (input) => JSON.stringify(await handler(input)),
} as DistriFnTool
```

**Important:** DistriFnTool expects `parameters` property, not `input_schema`.

---

## UI Tools (5 total)

**File:** `src/lib/distri-ui-tools.ts`

| Tool | Description | Returns |
|------|-------------|---------|
| `get_collapsed_spans` | Collapsed spans in trace view | `{collapsedSpanIds: [...]}` |
| `is_valid_for_optimize` | Check if span can be optimized (CACHED) | `{valid, reason, _cached?}` |
| `navigate_to` | Navigate to any page in vLLora (url param) | `{success, url}` |
| `navigate_to_experiment` | Navigate to /experiment page | `{success, url}` |
| `apply_label_filter` | Apply label filter to UI | `{success}` |

### Validation Cache

**File:** `src/lib/distri-ui-tools.ts`

The `is_valid_for_optimize` tool uses a cache to prevent duplicate API calls:

```typescript
// Cache validation results for 5 minutes
const VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const validationCache: Map<string, ValidationResult> = new Map();

// Check cache before API call
const cached = getCachedValidation(spanIdStr);
if (cached) {
  return {
    valid: cached.valid,
    spanId: cached.spanId,
    reason: cached.reason,
    _cached: true,
    _note: 'Result retrieved from cache. No duplicate API call made.',
  };
}
```

**Why caching?** Agents sometimes call the same tool multiple times. Caching ensures:
- No duplicate API calls
- Instant response for repeated calls
- Agent sees `_cached: true` to know result is from cache

---

## Data Tools (8 total)

**Directory:** `src/lib/distri-data-tools/`

### File Structure

```
distri-data-tools/
├── index.ts               # Entry point, exports all tools
├── helpers.ts             # Shared utilities (getCurrentProjectId, toCommaSeparated)
├── fetch-runs.ts          # Fetch runs
├── fetch-spans.ts         # Fetch spans
├── get-run-details.ts     # Get run details
├── fetch-groups.ts        # Fetch aggregated groups
├── fetch-spans-summary.ts # Phase 1: fetch + store + summarize
├── get-span-content.ts    # Phase 2: retrieve specific spans
├── list-labels.ts         # List available labels
└── analyze-with-llm.ts    # Phase 3: LLM semantic analysis
```

### Basic Tools (4)

| Tool | File | Service | Description |
|------|------|---------|-------------|
| `fetch_runs` | `fetch-runs.ts` | `runs-api.ts` | Get runs with filters |
| `fetch_spans` | `fetch-spans.ts` | `spans-api.ts` | Get spans with filters (default limit: 10) |
| `get_run_details` | `get-run-details.ts` | `runs-api.ts` | Get run + all its spans |
| `fetch_groups` | `fetch-groups.ts` | `groups-api.ts` | Get aggregated metrics |

### Three-Phase Analysis Tools (3)

These tools solve the LLM context overflow problem:

| Tool | File | Description |
|------|------|-------------|
| `fetch_spans_summary` | `fetch-spans-summary.ts` | Phase 1: Fetch ALL spans, store in memory, return summary |
| `get_span_content` | `get-span-content.ts` | Phase 2: Retrieve specific spans (max 5) |
| `analyze_with_llm` | `analyze-with-llm.ts` | Phase 3: Deep LLM semantic analysis (max 5) |

### Label Discovery Tool (1)

| Tool | File | Description |
|------|------|-------------|
| `list_labels` | `list-labels.ts` | Get available labels with counts |

---

## Three-Phase Analysis Deep Dive

### Phase 1: fetch_spans_summary

**File:** `fetch-spans-summary.ts`

Fetches all spans for a thread and stores them in browser memory:

```typescript
// 1. Fetch ALL spans with parallel pagination
const batchSize = 100;
const firstResult = await listSpans({...});
const allSpans = [...firstResult.data];

// Parallel fetch remaining batches
if (total > batchSize) {
  const batchPromises = [];
  for (let i = 1; i <= remainingBatches; i++) {
    batchPromises.push(listSpans({offset: i * batchSize}));
  }
  const results = await Promise.all(batchPromises);
}

// 2. Store in memory
spanStorage.clear();
for (const span of allSpans) {
  spanStorage.set(span.span_id, span);
}

// 3. Return lightweight summary
return {
  summary: {
    total_spans,
    by_operation,
    by_status,
    total_cost,
    models_used,
    latency_percentiles: { p50, p95, p99 },
  },
  error_spans: [...],           // Explicit errors
  semantic_error_spans: [...],  // Detected patterns via regex
  slowest_spans: [...],         // Top 5
  expensive_spans: [...],       // Top 5
};
```

### Phase 2: get_span_content

**File:** `get-span-content.ts`

Retrieves specific spans from memory:

```typescript
// Returns span data with excerpts
return {
  data: spans.map(span => ({
    span_id,
    operation_name,
    duration_ms,
    input_excerpt,
    output_excerpt,
    error,
    model,
  })),
};
```

### Phase 3: analyze_with_llm

**File:** `analyze-with-llm.ts`

Performs deep semantic analysis using LLM with structured output:

```typescript
// Uses OpenAI structured output (JSON schema)
const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'trace_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        overall_assessment: { type: 'string' },
        issue_count: { ... },
        span_analyses: [{
          span_id: { type: 'string' },
          issue_title: { type: 'string' },
          issues: [{
            type: { enum: ['error', 'performance', 'semantic', 'other'] },
            severity: { enum: ['high', 'medium', 'low'] },
            data_snippet: { type: 'string' },  // Actual JSON from trace
            explanation: { type: 'string' },   // Why it's a problem
          }],
        }],
        correlations: [...],
        recommendations: [...],
      },
    },
  },
};
```

**Issue types detected:**
1. **Silent Failures** - status="success" but results empty
2. **Buried Warnings** - warnings hidden in long responses
3. **Gradual Degradation** - responses getting worse over time
4. **Tool Errors** - tool name mismatches, invalid calls

### Semantic Error Detection (Regex)

**File:** `fetch-spans-summary.ts`

Detects error patterns in response content (fast regex scan):

```typescript
const ERROR_PATTERNS = [
  /not found/i,
  /does not exist/i,
  /cannot be found/i,
  /no .* found/i,
  /failed to/i,
  /error:/i,
  /exception/i,
  /timeout/i,
  /rate limit/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid/i,
  /missing/i,
  /null pointer/i,
  /undefined/i,
  /connection refused/i,
  /network error/i,
];
```

Severity levels:
- **High:** error, exception, failed to, unauthorized, forbidden
- **Medium:** not found, does not exist, timeout, rate limit
- **Low:** invalid, missing, undefined, null

### Span Storage

```typescript
// In-memory storage for spans (cleared when page refreshes)
// Exported from fetch-spans-summary.ts, shared with get-span-content.ts and analyze-with-llm.ts
export const spanStorage: Map<string, Span> = new Map();
```

---

## Experiment Tools (in UI Tools)

**File:** `src/lib/distri-ui-tools.ts`

These 4 tools are experiment-specific:

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_experiment_data` | Get experiment state | (none) |
| `apply_experiment_data` | Apply changes (patch semantics) | `data: {...}` |
| `run_experiment` | Execute (60s timeout) | (none) |
| `evaluate_experiment_results` | Compare original vs new | (none) |

---

## Event Emitter Types

**File:** `src/utils/eventEmitter.ts`

```typescript
// GET STATE events
type DistriGetStateEvents = {
  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: Record<string, unknown>;

  vllora_get_experiment_data: Record<string, never>;
  vllora_experiment_data_response: Record<string, unknown>;

  vllora_evaluate_experiment_results: Record<string, never>;
  vllora_evaluate_experiment_results_response: Record<string, unknown>;
};

// CHANGE UI events
type DistriChangeUiEvents = {
  vllora_navigate_to: { url: string };
  vllora_navigate_to_experiment: { spanId: string; url: string };
  vllora_apply_experiment_data: { data: Record<string, unknown> };
  vllora_apply_experiment_data_response: { success: boolean; error?: string };
  vllora_run_experiment: Record<string, never>;
  vllora_run_experiment_response: { success: boolean; result?: unknown; error?: string };
  vllora_apply_label_filter: { labels: string[]; action: string; view?: string };
};
```

---

## Tool Registration in AgentPanel

**File:** `src/components/agent/AgentPanel.tsx`

Tools are combined and passed to the Chat component:

```typescript
import { uiTools } from '@/lib/distri-ui-tools';
import { dataTools } from '@/lib/distri-data-tools';
import { useAgentToolListeners } from '@/hooks/useAgentToolListeners';

export function AgentPanel({ ... }) {
  // Listen for agent tool events
  useAgentToolListeners();

  // Combine all tools
  const tools = useMemo(() => [...uiTools, ...dataTools], []);

  return (
    <Chat
      threadId={selectedThreadId}
      agent={agent}
      externalTools={tools}  // Pass as externalTools prop
      initialMessages={messages}
      theme="dark"
    />
  );
}
```

---

## Important Notes

1. **Use `parameters` not `input_schema`** - DistriFnTool expects `parameters`

2. **Validation cache** - `is_valid_for_optimize` uses 5-minute TTL cache

3. **Three-phase analysis** - Use `fetch_spans_summary` → `analyze_with_llm` for large datasets

4. **Default limit 10** - `fetch_spans` returns max 10 spans by default

5. **Parallel fetching** - `fetch_spans_summary` uses `Promise.all()` for speed

6. **Structured output** - `analyze_with_llm` uses OpenAI JSON schema for consistent results

7. **Shared storage** - `spanStorage` Map is shared between Phase 1, 2, and 3 tools

8. **Label filtering** - Both `fetch_spans` and `fetch_spans_summary` support `labels` parameter

9. **LLM headers** - `analyze_with_llm` adds `x-label: analyze_with_llm` for tracing

## Related Documents

- [Agents](./agents.md) - Agent definitions that use these tools
- [Frontend Integration](./frontend-integration.md) - React integration details
- [Architecture](./architecture.md) - System overview
