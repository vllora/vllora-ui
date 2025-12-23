# Tool Handlers

This document contains the implementation details for UI and Data tool handlers.

## Overview

All tools use `external = ["*"]`, meaning they are handled by the vLLora UI frontend:

| Category | File | Tools |
|----------|------|-------|
| UI Tools | `src/lib/distri-ui-tools.ts` | 11 (5 GET STATE + 6 CHANGE UI) |
| Data Tools | `src/lib/distri-data-tools.ts` | 4 (reuse existing services) |

## UI Tool Handlers

**File:** `src/lib/distri-ui-tools.ts`

```typescript
import { getThemeFromStorage } from "@/themes/themes";
import { emitter } from "@/utils/eventEmitter";

type ToolResult = { success: boolean; message: string; data?: any };
type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

// ============================================================================
// Tool Registry - 11 total (5 GET STATE + 6 CHANGE UI)
// ============================================================================
export const UI_TOOL_NAMES = [
  // GET STATE (5 tools)
  "get_current_view",
  "get_selection_context",
  "get_thread_runs",
  "get_span_details",
  "get_collapsed_spans",
  // CHANGE UI (6 tools)
  "open_modal",
  "close_modal",
  "select_span",
  "select_run",
  "expand_span",
  "collapse_span",
];

// ============================================================================
// GET STATE TOOLS (5 tools) - Read current UI context
// These use request/response events to get data from React context
// ============================================================================

const getStateHandlers: Record<string, ToolHandler> = {
  // Get current page, project, thread, theme, modal state
  get_current_view: async () => {
    return new Promise((resolve) => {
      const handler = (data: any) => {
        emitter.off("vllora_current_view_response", handler);
        resolve({ success: true, message: "Current view", data });
      };
      emitter.on("vllora_current_view_response", handler);
      emitter.emit("vllora_get_current_view", {});

      // Timeout fallback - return basic info from window
      setTimeout(() => {
        emitter.off("vllora_current_view_response", handler);
        resolve({
          success: true,
          message: "Current view (basic)",
          data: {
            page: window.location.pathname,
            projectId: new URLSearchParams(window.location.search).get("project_id"),
            threadId: new URLSearchParams(window.location.search).get("thread_id"),
            theme: getThemeFromStorage(),
            modal: null, // Unknown without context
          }
        });
      }, 2000);
    });
  },

  // Get selected run, span, detail span, text selection
  get_selection_context: async () => {
    return new Promise((resolve) => {
      const handler = (data: any) => {
        emitter.off("vllora_selection_context_response", handler);
        resolve({ success: true, message: "Selection context", data });
      };
      emitter.on("vllora_selection_context_response", handler);
      emitter.emit("vllora_get_selection_context", {});

      setTimeout(() => {
        emitter.off("vllora_selection_context_response", handler);
        // Also include text selection from window
        const textSelection = window.getSelection()?.toString() || null;
        resolve({
          success: true,
          message: "Selection context (partial)",
          data: {
            selectedRunId: null,
            selectedSpanId: null,
            detailSpanId: null,
            textSelection,
          }
        });
      }, 2000);
    });
  },

  // Get list of runs in current thread
  get_thread_runs: async () => {
    return new Promise((resolve) => {
      const handler = (data: { runs: any[] }) => {
        emitter.off("vllora_thread_runs_response", handler);
        resolve({ success: true, message: `Found ${data.runs.length} runs`, data });
      };
      emitter.on("vllora_thread_runs_response", handler);
      emitter.emit("vllora_get_thread_runs", {});

      setTimeout(() => {
        emitter.off("vllora_thread_runs_response", handler);
        resolve({ success: false, message: "No thread context available" });
      }, 2000);
    });
  },

  // Get detailed info about a specific span
  get_span_details: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, message: "spanId is required" };
    }
    return new Promise((resolve) => {
      const handler = (data: { span: any }) => {
        emitter.off("vllora_span_details_response", handler);
        if (data.span) {
          resolve({ success: true, message: "Span details", data });
        } else {
          resolve({ success: false, message: `Span ${spanId} not found` });
        }
      };
      emitter.on("vllora_span_details_response", handler);
      emitter.emit("vllora_get_span_details", { spanId: spanId as string });

      setTimeout(() => {
        emitter.off("vllora_span_details_response", handler);
        resolve({ success: false, message: `Timeout getting span ${spanId}` });
      }, 2000);
    });
  },

  // Get list of collapsed span IDs
  get_collapsed_spans: async () => {
    return new Promise((resolve) => {
      const handler = (data: { collapsedSpanIds: string[] }) => {
        emitter.off("vllora_collapsed_spans_response", handler);
        resolve({
          success: true,
          message: `${data.collapsedSpanIds.length} spans collapsed`,
          data
        });
      };
      emitter.on("vllora_collapsed_spans_response", handler);
      emitter.emit("vllora_get_collapsed_spans", {});

      setTimeout(() => {
        emitter.off("vllora_collapsed_spans_response", handler);
        resolve({ success: true, message: "No collapsed spans", data: { collapsedSpanIds: [] } });
      }, 2000);
    });
  },
};

// ============================================================================
// CHANGE UI TOOLS (6 tools) - Modify the interface
// These emit events that are handled by React components
// ============================================================================

const changeUiHandlers: Record<string, ToolHandler> = {
  // Open a modal dialog
  open_modal: async ({ modal }) => {
    const validModals = ["tools", "settings", "provider-keys"];
    if (!validModals.includes(modal as string)) {
      return { success: false, message: `Invalid modal. Valid: ${validModals.join(", ")}` };
    }
    const { openModal } = await import("@/contexts/ModalContext");
    openModal(modal as "tools" | "settings" | "provider-keys");
    return { success: true, message: `Opened ${modal} modal` };
  },

  // Close the current modal
  close_modal: async () => {
    const { closeModal } = await import("@/contexts/ModalContext");
    closeModal();
    return { success: true, message: "Modal closed" };
  },

  // Select and highlight a span
  select_span: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, message: "spanId is required" };
    }
    emitter.emit("vllora_select_span", { spanId: spanId as string });
    return { success: true, message: `Selected span ${spanId}` };
  },

  // Select a run to display
  select_run: async ({ runId }) => {
    if (!runId) {
      return { success: false, message: "runId is required" };
    }
    emitter.emit("vllora_select_run", { runId: runId as string });
    return { success: true, message: `Selected run ${runId}` };
  },

  // Expand a collapsed span
  expand_span: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, message: "spanId is required" };
    }
    emitter.emit("vllora_expand_span", { spanId: spanId as string });
    return { success: true, message: `Expanded span ${spanId}` };
  },

  // Collapse an expanded span
  collapse_span: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, message: "spanId is required" };
    }
    emitter.emit("vllora_collapse_span", { spanId: spanId as string });
    return { success: true, message: `Collapsed span ${spanId}` };
  },
};

// ============================================================================
// Combined handlers
// ============================================================================

export const uiToolHandlers: Record<string, ToolHandler> = {
  ...getStateHandlers,
  ...changeUiHandlers,
};

export async function executeUiTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const handler = uiToolHandlers[toolName];
  if (!handler) {
    return { success: false, message: `Unknown UI tool: ${toolName}` };
  }
  try {
    return await handler(params);
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function isUiTool(toolName: string): boolean {
  return UI_TOOL_NAMES.includes(toolName);
}
```

---

## Data Tool Handlers

**File:** `src/lib/distri-data-tools.ts`

These tools reuse existing API services from `@/services/*` to ensure consistency with the UI and avoid code duplication.

```typescript
// Data tool handlers - REUSES existing vLLora API services
// This ensures consistency with the UI and avoids code duplication
//
// Existing services used:
// - @/services/runs-api.ts   -> listRuns, getRunDetails
// - @/services/spans-api.ts  -> listSpans
// - @/services/groups-api.ts -> listGroups

import { listRuns, getRunDetails, ListRunsQuery } from '@/services/runs-api';
import { listSpans, ListSpansQuery } from '@/services/spans-api';
import { listGroups, ListGroupsQuery } from '@/services/groups-api';

// Data tool names (4 tools)
export const DATA_TOOL_NAMES = [
  "fetch_runs",
  "fetch_spans",
  "get_run_details",
  "fetch_groups"
];

// Get current project ID from URL or context
function getCurrentProjectId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('project_id') || 'default';
}

// Data tool handlers - reuse existing services
export const dataToolHandlers: Record<string, (params: any) => Promise<any>> = {

  // Fetch runs with filtering
  // Reuses: @/services/runs-api.ts -> listRuns
  fetch_runs: async (params) => {
    const projectId = params.projectId || getCurrentProjectId();

    const query: ListRunsQuery = {};
    if (params.threadIds) query.thread_ids = params.threadIds;
    if (params.runIds) query.run_ids = params.runIds;
    if (params.modelName) query.model_name = params.modelName;
    if (params.limit) query.limit = params.limit;
    if (params.offset) query.offset = params.offset;

    const result = await listRuns({ projectId, params: query });
    return {
      success: true,
      data: result.data,
      pagination: result.pagination
    };
  },

  // Fetch spans with filtering
  // Reuses: @/services/spans-api.ts -> listSpans
  fetch_spans: async (params) => {
    const projectId = params.projectId || getCurrentProjectId();

    const query: ListSpansQuery = {};
    if (params.threadIds) query.threadIds = params.threadIds;
    if (params.runIds) query.runIds = params.runIds;
    if (params.operationNames) query.operationNames = params.operationNames;
    if (params.parentSpanIds) query.parentSpanIds = params.parentSpanIds;
    if (params.limit) query.limit = params.limit;
    if (params.offset) query.offset = params.offset;

    const result = await listSpans({ projectId, params: query });
    return {
      success: true,
      data: result.data,
      pagination: result.pagination
    };
  },

  // Get detailed info about a specific run
  // Reuses: @/services/runs-api.ts -> getRunDetails
  get_run_details: async (params) => {
    const { runId } = params;
    if (!runId) return { success: false, message: "runId is required" };

    const projectId = params.projectId || getCurrentProjectId();
    const result = await getRunDetails({ runId, projectId });
    return { success: true, data: result };
  },

  // Fetch aggregated groups
  // Reuses: @/services/groups-api.ts -> listGroups
  fetch_groups: async (params) => {
    const projectId = params.projectId || getCurrentProjectId();

    const query: ListGroupsQuery = {};
    if (params.groupBy) query.group_by = params.groupBy;
    if (params.threadIds) query.thread_ids = params.threadIds;
    if (params.modelName) query.model_name = params.modelName;
    if (params.bucketSize) query.bucket_size = params.bucketSize;
    if (params.limit) query.limit = params.limit;
    if (params.offset) query.offset = params.offset;

    const result = await listGroups({ projectId, params: query });
    return {
      success: true,
      data: result.data,
      pagination: result.pagination
    };
  },
};

export async function executeDataTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<any> {
  const handler = dataToolHandlers[toolName];
  if (!handler) {
    return { success: false, message: `Unknown data tool: ${toolName}` };
  }
  try {
    return await handler(params);
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function isDataTool(toolName: string): boolean {
  return DATA_TOOL_NAMES.includes(toolName);
}
```

---

## Service Mapping

Data tools map to existing services:

| Tool | Service File | Function |
|------|--------------|----------|
| `fetch_runs` | `@/services/runs-api.ts` | `listRuns` |
| `fetch_spans` | `@/services/spans-api.ts` | `listSpans` |
| `get_run_details` | `@/services/runs-api.ts` | `getRunDetails` |
| `fetch_groups` | `@/services/groups-api.ts` | `listGroups` |

**Benefits of reusing existing services:**
- Uses the shared `apiClient` from `@/lib/api-client` with proper error handling
- Includes correct headers (x-project-id, Content-Type, etc.)
- Has proper TypeScript types for all DTOs (`RunDTO`, `Span`, `GenericGroupDTO`)
- Already tested and used by the UI
- Any API changes only need to be made in one place

---

## Event Emitter Events

UI tools use events to communicate with React components. Add these to `src/utils/eventEmitter.ts`:

```typescript
type Events = {
  // ... existing events ...

  // ============================================================================
  // GET STATE events (5 tools) - Request/Response pattern
  // ============================================================================
  vllora_get_current_view: Record<string, never>;
  vllora_current_view_response: {
    page: string;
    projectId: string | null;
    threadId: string | null;
    theme: string;
    modal: string | null;
  };

  vllora_get_selection_context: Record<string, never>;
  vllora_selection_context_response: {
    selectedRunId: string | null;
    selectedSpanId: string | null;
    detailSpanId: string | null;
    textSelection: string | null;
  };

  vllora_get_thread_runs: Record<string, never>;
  vllora_thread_runs_response: {
    runs: Array<{
      run_id: string;
      status: string;
      model?: string;
      duration_ms?: number;
    }>;
  };

  vllora_get_span_details: { spanId: string };
  vllora_span_details_response: {
    span: {
      span_id: string;
      operation_name: string;
      duration_ms: number;
      status: string;
      attributes: Record<string, any>;
    } | null;
  };

  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: { collapsedSpanIds: string[] };

  // ============================================================================
  // CHANGE UI events (6 tools) - Fire-and-forget pattern
  // ============================================================================
  vllora_select_span: { spanId: string };
  vllora_select_run: { runId: string };
  vllora_expand_span: { spanId: string };
  vllora_collapse_span: { spanId: string };
};
```

---

## Tool Patterns

### GET STATE Pattern (Request/Response)

```
Tool Handler                    React Component
     │                               │
     ├─── emit("vllora_get_X") ─────▶│
     │                               │
     │◀── emit("vllora_X_response")──┤
     │                               │
     └─── resolve(data) ─────────────┘
```

### CHANGE UI Pattern (Fire-and-Forget)

```
Tool Handler                    React Component
     │                               │
     ├─── emit("vllora_action") ────▶│
     │                               │
     └─── resolve({success: true}) ──┘
```

## Related Documents

- [Agents](./agents.md) - Agent definitions that use these tools
- [Frontend Integration](./frontend-integration.md) - How tools connect to React
- [Architecture](./architecture.md) - System overview
