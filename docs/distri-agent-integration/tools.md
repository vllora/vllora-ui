# Tool Handlers

This document describes the implementation of UI and Data tool handlers.

## Overview

All tools use `external = ["*"]`, meaning they are handled by the vLLora UI frontend:

| Category | File | Count | Description |
|----------|------|-------|-------------|
| UI Tools | `src/lib/distri-ui-tools.ts` | 8 | 4 GET STATE + 4 CHANGE UI |
| Data Tools | `src/lib/distri-data-tools.ts` | 7 | 4 basic + 2 two-phase analysis + 1 label discovery |

**Total: 15 tools**

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

## UI Tools (8 total)

**File:** `src/lib/distri-ui-tools.ts`

### GET STATE Tools (4)

| Tool | Description | Returns |
|------|-------------|---------|
| `get_collapsed_spans` | Collapsed spans in trace view | `{collapsedSpanIds: [...]}` |
| `is_valid_for_optimize` | Check if span can be optimized (CACHED) | `{valid, reason, _cached?}` |
| `get_experiment_data` | Get experiment state (experiment page only) | `{experimentData, running}` |
| `evaluate_experiment_results` | Compare original vs new (experiment page only) | `{original, new, comparison}` |

### CHANGE UI Tools (4)

| Tool | Description | Parameters |
|------|-------------|------------|
| `navigate_to_experiment` | Navigate to /experiment | `spanId: string` |
| `apply_experiment_data` | Apply changes to experiment | `data: {...}` |
| `run_experiment` | Execute experiment (60s timeout) | (none) |
| `apply_label_filter` | Apply label filter to UI | `labels: string[], action: "set"\|"add"\|"clear"` |

### Validation Cache

**File:** `src/lib/distri-ui-tools.ts` (lines 19-55)

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

## Data Tools (7 total)

**File:** `src/lib/distri-data-tools.ts`

### Basic Tools (4)

| Tool | Service | Description |
|------|---------|-------------|
| `fetch_runs` | `runs-api.ts` | Get runs with filters (threadIds, period, limit) |
| `fetch_spans` | `spans-api.ts` | Get spans with filters (spanIds, threadIds, runIds, operationNames, parentSpanIds, labels). Default limit: 10 |
| `get_run_details` | `runs-api.ts` | Get run + all its spans |
| `fetch_groups` | `groups-api.ts` | Get aggregated metrics (groupBy: time/model/thread) |

### Two-Phase Analysis Tools (2)

These tools solve the LLM context overflow problem:

| Tool | Description |
|------|-------------|
| `fetch_spans_summary` | Fetch ALL spans, store in memory, return lightweight summary. Supports label filtering. |
| `get_span_content` | Perform client-side analysis on specific spans (max 5) |

### Label Discovery Tool (1)

| Tool | Description |
|------|-------------|
| `list_labels` | Get available labels with counts. Optionally scoped to a threadId. |

#### fetch_spans_summary

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
  },
  error_spans: [...],           // Explicit errors
  semantic_error_spans: [...],  // Detected patterns
  slowest_spans: [...],         // Top 5
  expensive_spans: [...],       // Top 5
};
```

#### get_span_content

Performs client-side analysis on specific spans:

```typescript
// Returns analysis RESULTS, not raw span data
return {
  data: spans.map(span => ({
    span_id,
    operation_name,
    duration_ms,
    explicit_error,
    semantic_issues: [
      { pattern: "not found", context: "...", severity: "medium" }
    ],
    content_stats: {
      input_length,
      output_length,
      has_tool_calls,
    },
    assessment: "Found 2 potential issues: 0 high, 2 medium severity.",
  })),
};
```

### Semantic Error Detection

**File:** `src/lib/distri-data-tools.ts`

Detects error patterns in response content (not just status codes):

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
const spanStorage: Map<string, Span> = new Map();
```

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

3. **Two-phase analysis** - Use `fetch_spans_summary` for large datasets

4. **Default limit 10** - `fetch_spans` returns max 10 spans by default (adjustable via limit param)

5. **Parallel fetching** - `fetch_spans_summary` uses `Promise.all()` for speed

6. **Client-side analysis** - `get_span_content` returns analysis results, not raw data

7. **Semantic errors** - Detect "not found", "failed", etc. in response content

8. **Label filtering** - Both `fetch_spans` and `fetch_spans_summary` support `labels` parameter

## Related Documents

- [Agents](./agents.md) - Agent definitions that use these tools
- [Frontend Integration](./frontend-integration.md) - React integration details
- [Architecture](./architecture.md) - System overview
