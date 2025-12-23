# Tool Handlers

This document describes the implementation of UI and Data tool handlers.

## Overview

All 15 tools use `external = ["*"]`, meaning they are handled by the vLLora UI frontend:

| Category | File | Count | Description |
|----------|------|-------|-------------|
| UI Tools | `src/lib/distri-ui-tools.ts` | 11 | 5 GET STATE + 6 CHANGE UI |
| Data Tools | `src/lib/distri-data-tools.ts` | 4 | Query backend API |

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

## UI Tools (11 total)

**File:** `src/lib/distri-ui-tools.ts`

### GET STATE Tools (5)

These tools use an event emitter pattern to request data from React components.

| Tool | Description | Returns |
|------|-------------|---------|
| `get_current_view` | Current page context | `{page, projectId, threadId, theme}` |
| `get_selection_context` | Selected items | `{selectedRunId, selectedSpanId, detailSpanId}` |
| `get_thread_runs` | Runs visible in UI | `{runs: [...]}` |
| `get_span_details` | Span info | `{span: {...}}` |
| `get_collapsed_spans` | Collapsed spans | `{collapsedSpanIds: [...]}` |

#### Event Flow Pattern

```
Tool Handler                    React Component (TracesPageContext)
     │                               │
     ├─── emit("vllora_get_X") ─────▶│
     │                               │
     │◀── emit("vllora_X_response")──┤
     │                               │
     └─── resolve(data) ─────────────┘
```

### CHANGE UI Tools (6)

These tools emit events that are handled by React components.

| Tool | Description | Parameters |
|------|-------------|------------|
| `open_modal` | Open a modal | `modal: "tools" \| "settings" \| "provider-keys"` |
| `close_modal` | Close modal | (none) |
| `select_span` | Highlight span | `spanId: string` |
| `select_run` | Select run | `runId: string` |
| `expand_span` | Expand span | `spanId: string` |
| `collapse_span` | Collapse span | `spanId: string` |

---

## Data Tools (4 total)

**File:** `src/lib/distri-data-tools.ts`

These tools call existing vLLora API services directly.

| Tool | Service | Function | Key Parameters |
|------|---------|----------|----------------|
| `fetch_runs` | `runs-api.ts` | `listRuns` | `threadIds`, `period`, `limit` |
| `fetch_spans` | `spans-api.ts` | `listSpans` | `runIds`, `operationNames` |
| `get_run_details` | `runs-api.ts` | `getRunDetails` | `runId` (required) |
| `fetch_groups` | `groups-api.ts` | `listGroups` | `groupBy`, `bucketSize` |

### API Service Reuse

Data tools import from existing services to ensure consistency:

```typescript
import { listRuns, getRunDetails } from '@/services/runs-api';
import { listSpans } from '@/services/spans-api';
import { listGroups } from '@/services/groups-api';
```

**Benefits:**
- Uses shared `apiClient` with proper error handling
- Includes correct headers (x-project-id, etc.)
- Has TypeScript types for all DTOs
- Already tested and used by the UI

### Parameter Naming

Note: Services use different naming conventions:

| Service | Convention | Example |
|---------|------------|---------|
| `runs-api.ts` | snake_case | `thread_ids`, `run_ids` |
| `spans-api.ts` | camelCase | `threadIds`, `runIds` |
| `groups-api.ts` | snake_case | `group_by`, `bucket_size` |

Tool handlers convert from agent camelCase to API format automatically.

---

## Event Emitter Types

**File:** `src/utils/eventEmitter.ts`

```typescript
// GET STATE events
type DistriGetStateEvents = {
  vllora_get_current_view: Record<string, never>;
  vllora_current_view_response: Record<string, unknown>;

  vllora_get_selection_context: Record<string, never>;
  vllora_selection_context_response: Record<string, unknown>;

  vllora_get_thread_runs: Record<string, never>;
  vllora_thread_runs_response: Record<string, unknown>;

  vllora_get_span_details: Record<string, never>;
  vllora_span_details_response: Record<string, unknown>;

  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: Record<string, unknown>;
};

// CHANGE UI events
type DistriChangeUiEvents = {
  vllora_select_span: { spanId: string };
  vllora_select_run: { runId: string };
  vllora_expand_span: { spanId: string };
  vllora_collapse_span: { spanId: string };
};
```

---

## Event Listeners

### TracesPageContext (Full Implementation)

**File:** `src/contexts/TracesPageContext.tsx` (lines 704-804)

The TracesPageContext has full event listeners that respond with actual UI state:

```typescript
useEffect(() => {
  // GET STATE: Selection context
  const handleGetSelectionContext = () => {
    eventEmitter.emit('vllora_selection_context_response', {
      selectedRunId,
      selectedSpanId,
      detailSpanId,
    });
  };

  // GET STATE: Thread runs
  const handleGetThreadRuns = () => {
    const runsWithSpans = runs.map(run => ({
      ...run,
      spans: runMap[run.run_id] || [],
    }));
    eventEmitter.emit('vllora_thread_runs_response', {
      runs: runsWithSpans,
      groups,
    });
  };

  // CHANGE UI: Select span
  const handleSelectSpan = ({ spanId }) => {
    setSelectedSpanId(spanId);
    setDetailSpanId(spanId);
  };

  // ... more handlers

  eventEmitter.on('vllora_get_selection_context', handleGetSelectionContext);
  eventEmitter.on('vllora_get_thread_runs', handleGetThreadRuns);
  eventEmitter.on('vllora_select_span', handleSelectSpan);
  // ...
}, [/* dependencies */]);
```

### useAgentToolListeners (Basic Fallback)

**File:** `src/hooks/useAgentToolListeners.ts`

Provides basic listeners for pages without TracesPageContext:

```typescript
export function useAgentToolListeners(options = {}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleGetCurrentView = () => {
      const page = location.pathname.split('/')[1] || 'home';
      const projectId = searchParams.get('project_id');
      const threadId = searchParams.get('thread_id');

      emitter.emit('vllora_current_view_response', {
        page,
        projectId,
        threadId,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      });
    };

    emitter.on('vllora_get_current_view', handleGetCurrentView);
    return () => emitter.off('vllora_get_current_view', handleGetCurrentView);
  }, [location, searchParams]);
}
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

2. **Data tools work anywhere** - They call the API directly

3. **UI tools need context** - GET STATE tools return empty without TracesPageContext

4. **CHANGE UI tools only work on Traces page** - No effect on other pages

5. **Timeout handling** - GET STATE tools have 5-second timeout with fallback

## Related Documents

- [Agents](./agents.md) - Agent definition that uses these tools
- [Frontend Integration](./frontend-integration.md) - React integration details
- [Architecture](./architecture.md) - System overview
