# Distri Multi-Agent Integration for vLLora

This guide explains how to build a multi-agent system using Distri that helps users analyze traces, identify issues, find bottlenecks, and optimize their LLM products through the vLLora platform.

## System Purpose

vLLora is a real-time debugging platform for AI agents. The multi-agent system helps users:
- **Analyze traces** in real-time and historically
- **Identify issues** in LLM workflows
- **Find bottlenecks** in agent execution
- **Optimize LLM products** based on trace data

---

## Prerequisites

### Install Distri Packages in vLLora UI

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui
pnpm add @distri/core @distri/react
```

These packages provide:
- `@distri/core` - API client, streaming, message handling, tool management
- `@distri/react` - React hooks (`useChat`, `useAgent`), context provider

---

## Multi-Agent Architecture

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
│  │   UI AGENT (11)     │    │              DATA AGENT                 │    │
│  │                     │    │                                         │    │
│  │  GET STATE (5):     │    │  • fetch_traces    • fetch_runs         │    │
│  │  • get_current_view │    │  • fetch_spans     • get_run_details    │    │
│  │  • get_selection_   │    │  • fetch_groups                         │    │
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
│        (External)                        (Backend)                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Definitions (Distri Project)

### 1. Main Agent (Orchestrator)

Create `distri/agents/vllora-main-agent.md`:

```markdown
---
name = "vllora_main_agent"
description = "Main orchestrator for vLLora trace analysis and optimization"
max_iterations = 10
tool_format = "provider"

[tools]
builtin = ["call_agent"]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
max_tokens = 2000
---

# ROLE

You are the main AI assistant for vLLora, a real-time debugging platform for AI agents.
Your purpose is to help users:
- Analyze LLM execution traces to understand system behavior
- Identify issues, errors, and failures in their AI workflows
- Find performance bottlenecks (slow spans, expensive calls, high token usage)
- Optimize their LLM products based on trace data insights

You orchestrate two specialized agents:
- **ui_agent**: Controls the vLLora UI (navigation, display, highlighting)
- **data_agent**: Fetches and analyzes trace data from the backend

# CAPABILITIES

## Analysis Tasks
- Trace analysis: Examine execution flow, timing, and dependencies
- Error detection: Find failed spans, error messages, and exceptions
- Performance analysis: Identify slow operations and bottlenecks
- Cost analysis: Calculate token usage and estimated costs
- Comparison: Compare runs to identify regressions or improvements

## Orchestration
- Delegate UI tasks to ui_agent (e.g., "highlight the slow span", "navigate to traces")
- Delegate data fetching to data_agent (e.g., "get traces for thread X", "find errors")
- Combine insights from both agents to provide comprehensive analysis

# WORKFLOW PATTERNS

## Pattern 1: Investigate an Issue
1. Ask data_agent to fetch relevant traces/runs
2. Analyze the data for errors or anomalies
3. Ask ui_agent to navigate to and highlight the problematic span
4. Provide recommendations

## Pattern 2: Performance Analysis
1. Ask data_agent to fetch runs with timing data
2. Calculate duration statistics and identify slow spans
3. Ask ui_agent to display the trace visualization
4. Highlight bottlenecks and suggest optimizations

## Pattern 3: Cost Optimization
1. Ask data_agent to fetch token usage and cost data
2. Identify high-cost operations
3. Suggest ways to reduce token usage

# RESPONSE FORMAT
- Be concise and actionable
- Use data to support your analysis
- Provide specific recommendations
- Reference span IDs and trace IDs when discussing specific issues

# TASK
{{task}}
```

---

### 2. UI Agent

Create `distri/agents/vllora-ui-agent.md`:

```markdown
---
name = "vllora_ui_agent"
description = "Controls vLLora UI display, navigation, and context awareness"
max_iterations = 5
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.2
max_tokens = 800
---

# ROLE

You are the UI control agent for vLLora. You have two responsibilities:
1. **Read UI state** - Understand what the user is currently viewing
2. **Change UI** - Manipulate the interface to help users visualize traces

# AVAILABLE TOOLS (11 total)

## GET STATE (5 tools) - Read current UI context

| Tool | Description | Returns |
|------|-------------|---------|
| **get_current_view** | Get current page, project, thread, theme, modal state | `{ page, projectId, threadId, theme, modal }` |
| **get_selection_context** | Get what user has selected | `{ selectedRunId, selectedSpanId, detailSpanId, textSelection }` |
| **get_thread_runs** | Get list of runs in current thread | `{ runs: [{ run_id, status, model, duration }] }` |
| **get_span_details** | Get detailed info about a span | `{ span: { span_id, operation_name, duration, status, attributes } }` |
| **get_collapsed_spans** | Get list of collapsed span IDs | `{ collapsedSpanIds: string[] }` |

## CHANGE UI (6 tools) - Modify the interface

| Tool | Description | Parameters |
|------|-------------|------------|
| **open_modal** | Open a modal dialog | `modal: "tools" \| "settings" \| "provider-keys"` |
| **close_modal** | Close the current modal | (none) |
| **select_span** | Select and highlight a span | `spanId: string` |
| **select_run** | Select a run to display | `runId: string` |
| **expand_span** | Expand a collapsed span | `spanId: string` |
| **collapse_span** | Collapse an expanded span | `spanId: string` |

# WORKFLOW PATTERNS

## Pattern 1: Context-Aware Assistance
1. Call `get_current_view` to understand where user is
2. Call `get_selection_context` to see what they're focused on
3. Take appropriate action based on context

## Pattern 2: Navigate to Specific Span
1. Call `select_run` to show the run
2. Call `expand_span` if span is collapsed
3. Call `select_span` to highlight it

## Pattern 3: Prepare View for Analysis
1. Call `get_collapsed_spans` to see what's hidden
2. Expand relevant spans
3. Call `select_span` on the span of interest

# GUIDELINES
- Always check context before acting (call GET STATE tools first when needed)
- Confirm what was changed after each action
- If an element can't be found, report the span_id clearly
- For multi-step actions, report each step

# TASK
{{task}}
```

---

### 3. Data Agent

Create `distri/agents/vllora-data-agent.md`:

```markdown
---
name = "vllora_data_agent"
description = "Fetches and analyzes trace data from vLLora backend"
max_iterations = 8
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.1
max_tokens = 1500
---

# ROLE

You are the data agent for vLLora. You fetch, filter, and analyze trace data
from the backend to support the main agent's analysis tasks.

# AVAILABLE TOOLS (5 total)

All tools are handled by the vLLora UI frontend, which calls the vLLora backend API.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| **fetch_traces** | Get traces with filtering | runId, threadIds, limit, offset |
| **fetch_runs** | Get execution runs with usage info | threadIds, modelName, limit |
| **fetch_spans** | Get individual spans | spanId, runIds, operationNames |
| **get_run_details** | Get detailed info about a run | runId (required) |
| **fetch_groups** | Get aggregated data | groupBy (time/thread/run), limit |

# DATA ANALYSIS CAPABILITIES

When analyzing data, you can:
- Calculate statistics (avg duration, total cost, token counts)
- Identify outliers (unusually slow spans, high-cost operations)
- Find patterns (common error types, frequent operations)
- Compare data across time periods or runs

# RESPONSE FORMAT

When returning data, structure it clearly:
- Summarize key findings first
- Include relevant IDs (trace_id, span_id, run_id)
- Provide metrics with units (duration in ms, cost in $)
- Flag any errors or anomalies found

# TASK
{{task}}
```

---

## Important: No Distri Plugin Modifications Needed

**All tools are marked as `external = ["*"]`** in the agent definitions. This means:

- **No plugin code needed in Distri repo**
- **All tool implementations stay in vLLora UI**
- Distri server just passes tool calls to the frontend
- Frontend handles both UI tools AND Data tools

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     How External Tools Work                                  │
│                                                                              │
│  vLLora UI                    Distri Server                                  │
│  ─────────                    ─────────────                                  │
│  1. User asks question ──────▶ 2. Agent decides to call tool                │
│                               │                                              │
│  4. Frontend executes tool ◀── 3. Returns tool call to frontend             │
│     (UI tools: change theme)  │    (external = ["*"])                       │
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

---

## Data Agent Tools (Handled by Frontend)

The Data Agent uses `external = ["*"]`, so its tools are handled by the vLLora UI frontend.

**Important:** We reuse the existing API services from `@/services/*` to ensure consistency with the UI and avoid code duplication.

Create `src/lib/distri-data-tools.ts`:

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

// Data tool names (4 tools - removed fetch_traces, use fetch_spans instead)
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

**Benefits of reusing existing services:**
- Uses the shared `apiClient` from `@/lib/api-client` with proper error handling
- Includes correct headers (x-project-id, Content-Type, etc.)
- Has proper TypeScript types for all DTOs (`RunDTO`, `Span`, `GenericGroupDTO`)
- Already tested and used by the UI
- Any API changes only need to be made in one place

---

## Frontend Implementation (vLLora UI)

### 1. Extend Event Emitter Types

Update `src/utils/eventEmitter.ts` to add new event types for the 12 UI tools:

```typescript
import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';

type Events = {
  // ============================================================================
  // Existing events (keep as-is)
  // ============================================================================
  vllora_input_fileAdded: { files: any[] };
  vllora_input_chatSubmit: {
    inputText: string;
    files: any[];
    searchToolEnabled?: boolean;
    otherTools?: string[];
    toolsUsage?: Map<string, McpServerConfig>;
  };
  vllora_chatTerminate: { threadId: string; widgetId?: string };
  vllora_clearChat: { threadId?: string; widgetId?: string };
  vllora_chat_scrollToBottom: { threadId?: string; widgetId?: string };
  vllora_usageStats: { usage: any; threadId?: string; widgetId?: string };
  vllora_chatWindow: {
    widgetId: string;
    state: string;
    threadId?: string;
    messageId?: string;
    traceId?: string;
    runId?: string;
    error?: string;
  };
  vllora_input_speechRecognitionStart: Record<string, never>;
  vllora_input_speechRecognitionEnd: Record<string, never>;

  // ============================================================================
  // GET STATE events (5 tools) - Request/Response pattern
  // Components listen for requests and emit responses
  // ============================================================================

  // get_current_view: page, project, thread, theme, modal
  vllora_get_current_view: Record<string, never>;
  vllora_current_view_response: {
    page: string;
    projectId: string | null;
    threadId: string | null;
    theme: string;
    modal: string | null;
  };

  // get_selection_context: selected run, span, detail span, text
  vllora_get_selection_context: Record<string, never>;
  vllora_selection_context_response: {
    selectedRunId: string | null;
    selectedSpanId: string | null;
    detailSpanId: string | null;
    textSelection: string | null;
  };

  // get_thread_runs: list of runs in current thread
  vllora_get_thread_runs: Record<string, never>;
  vllora_thread_runs_response: {
    runs: Array<{
      run_id: string;
      status: string;
      model?: string;
      duration_ms?: number;
    }>;
  };

  // get_span_details: detailed info about specific span
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

  // get_collapsed_spans: list of collapsed span IDs
  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: { collapsedSpanIds: string[] };

  // ============================================================================
  // CHANGE UI events (7 tools) - Fire-and-forget pattern
  // Components listen and update state
  // ============================================================================

  // select_span: select and highlight a span (uses existing setSelectedSpanId)
  vllora_select_span: { spanId: string };

  // select_run: select a run to display (uses existing setSelectedRunId)
  vllora_select_run: { runId: string };

  // expand_span: expand a collapsed span (removes from collapsedSpans)
  vllora_expand_span: { spanId: string };

  // collapse_span: collapse an expanded span (adds to collapsedSpans)
  vllora_collapse_span: { spanId: string };

  // Note: change_theme, open_modal, close_modal are handled directly
  // without events (they use imported functions from themes.ts and ModalContext)
};

export const emitter: Emitter<Events> = mitt<Events>();
```

---

### 2. UI Tool Handlers

Create `src/lib/distri-ui-tools.ts`:

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

### 3. Setup DistriProvider

Create `src/providers/DistriProvider.tsx`:

```typescript
import { DistriProvider as BaseDistriProvider } from '@distri/react';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function DistriProvider({ children }: Props) {
  return (
    <BaseDistriProvider
      config={{
        baseUrl: import.meta.env.VITE_DISTRI_URL || 'http://localhost:8080',
        // accessToken: '...' // Add if needed
      }}
    >
      {children}
    </BaseDistriProvider>
  );
}
```

---

### 4. Custom Hook with UI Tool Handling

Create `src/hooks/useVlloraAgent.ts`:

```typescript
import { useState, useCallback } from 'react';
import { useChat, useAgent } from '@distri/react';
import { executeUiTool, isUiTool } from '@/lib/distri-ui-tools';

interface AgentActivity {
  type: 'thinking' | 'tool_call' | 'agent_call' | 'response';
  content: string;
  timestamp: Date;
}

interface UseVlloraAgentOptions {
  agentId?: string;
}

export function useVlloraAgent(options: UseVlloraAgentOptions = {}) {
  const { agentId = 'vllora_main_agent' } = options;
  const [activities, setActivities] = useState<AgentActivity[]>([]);

  const { agent } = useAgent({ agentId });

  const {
    messages,
    sendMessage,
    isStreaming,
    hasPendingToolCalls,
    stopStreaming
  } = useChat({
    agent,
    // Handle tool calls - execute UI tools locally
    onToolCall: async (toolCall) => {
      const toolName = toolCall.name;
      const toolInput = toolCall.input || {};

      // Log the tool call
      setActivities(prev => [...prev, {
        type: 'tool_call',
        content: `${toolName}(${JSON.stringify(toolInput)})`,
        timestamp: new Date()
      }]);

      // If it's a UI tool, execute it locally and return the result
      if (isUiTool(toolName)) {
        const result = await executeUiTool(toolName, toolInput);
        return {
          toolCallId: toolCall.id,
          result: JSON.stringify(result)
        };
      }

      // For non-UI tools, return undefined to let Distri handle it
      return undefined;
    },
    onMessage: (message) => {
      // Log text responses
      if (message.role === 'assistant') {
        const textParts = message.parts?.filter(p => p.type === 'text') || [];
        textParts.forEach(part => {
          if ('text' in part) {
            setActivities(prev => [...prev, {
              type: 'response',
              content: part.text,
              timestamp: new Date()
            }]);
          }
        });
      }
    }
  });

  const sendToAgent = useCallback(async (text: string) => {
    setActivities([]);
    await sendMessage({ text });
  }, [sendMessage]);

  const cancel = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  return {
    messages,
    sendToAgent,
    isProcessing: isStreaming,
    hasPendingToolCalls,
    activities,
    cancel,
    agent
  };
}
```

---

### 5. Wrap App with DistriProvider

Update your `src/App.tsx` or main layout:

```typescript
import { DistriProvider } from '@/providers/DistriProvider';

function App() {
  return (
    <DistriProvider>
      {/* Your existing app components */}
    </DistriProvider>
  );
}
```

---

### 6. Use in ChatInput

Example integration in a chat component:

```typescript
import { useVlloraAgent } from '@/hooks/useVlloraAgent';

function ChatWithAgent() {
  const [input, setInput] = useState('');
  const { sendToAgent, isProcessing, messages, activities } = useVlloraAgent();

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;

    // Check if it's an agent command
    if (text.startsWith('@agent ') || text.startsWith('/agent ')) {
      const agentMessage = text.replace(/^(@agent|\/agent)\s+/, '');
      setInput('');
      await sendToAgent(agentMessage);
      return;
    }

    // Normal chat handling...
  };

  return (
    <div>
      {/* Show agent activities */}
      {activities.map((activity, i) => (
        <div key={i} className="text-sm text-muted-foreground">
          [{activity.type}] {activity.content}
        </div>
      ))}

      {/* Chat input */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={isProcessing}
        placeholder="Type @agent to interact with the AI assistant..."
      />
    </div>
  );
}
```

---

## Usage Examples

### Example 1: Analyze Performance

```
User: @agent analyze the performance of my last 10 runs and find any bottlenecks

Main Agent:
1. Calls data_agent: "fetch the last 10 runs with timing data"
2. Analyzes durations, finds slow spans
3. Calls ui_agent: "highlight span xyz which took 5.2s"
4. Returns: "Found 3 bottlenecks:
   - Span xyz (5.2s) - OpenAI API call with large context
   - Span abc (2.1s) - Tool execution timeout
   - Span def (1.8s) - Database query

   Recommendations: Consider reducing context size for xyz..."
```

### Example 2: Investigate Errors

```
User: @agent why did my agent fail yesterday?

Main Agent:
1. Calls data_agent: "fetch runs from yesterday with errors"
2. Finds run with error
3. Calls ui_agent: "navigate to traces and select run xyz"
4. Calls ui_agent: "highlight the failed span"
5. Returns: "Your agent failed due to rate limiting from Anthropic API at 2:34 PM.
   The span is now highlighted in red. Consider adding retry logic..."
```

### Example 3: Cost Analysis

```
User: @agent show me which models are costing the most this week

Main Agent:
1. Calls data_agent: "fetch groups by model for this week"
2. Calculates costs per model
3. Calls ui_agent: "navigate to analytics"
4. Returns: "Cost breakdown this week:
   - GPT-4: $45.20 (2,340 calls)
   - Claude-3: $23.10 (890 calls)
   - GPT-3.5: $2.30 (5,600 calls)

   GPT-4 accounts for 64% of your costs. Consider using GPT-3.5 for simpler tasks."
```

---

## Complete Setup Guide

This guide walks you through setting up the entire multi-agent system from scratch.

### Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   vLLora UI     │────▶│  Distri Server  │────▶│  vLLora Backend │
│  (React App)    │     │  (Agent Runtime)│     │   (Rust API)    │
│  localhost:5173 │     │  localhost:8080 │     │  localhost:9090 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
      │                        │                        │
      │ @distri/react          │ Agents + Plugins       │ /traces, /runs
      │ useChat, useAgent      │ vllora-main-agent      │ /spans, /groups
      └────────────────────────┴────────────────────────┘
```

---

### Step 1: Setup Agents (in vLLora UI Repo)

We keep all agent definitions in the vLLora UI repo for easy management, then register them with Distri server via API.

#### Project Structure

```
vllora/ui/
├── agents/                          ← Agent definitions (markdown files)
│   ├── vllora-main-agent.md
│   ├── vllora-ui-agent.md
│   └── vllora-data-agent.md
├── src/
│   ├── components/agent/            ← Agent UI components
│   ├── hooks/useVlloraAgent.ts      ← Agent communication hook
│   └── lib/distri-ui-tools.ts       ← UI tool handlers
```

#### How Agents Get to Distri Server

```
┌─────────────────────┐                    ┌─────────────────────┐
│    vLLora UI Repo   │  distri agents     │    Distri Server    │
│                     │      push          │                     │
│  agents/*.md ───────┼──────────────────▶│  Agent Store        │
│                     │  POST /agents      │  (SQLite DB)        │
└─────────────────────┘  Content-Type:     └─────────────────────┘
                         text/markdown
```

**Use Distri CLI to push agents:**
```bash
distri --base-url http://localhost:8080 agents push ./agents --all
```

#### How Multi-Agent Orchestration Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      Distri Agent Store                         │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │
│  │ vllora_main_agent│ │ vllora_ui_agent  │ │vllora_data_agent│ │
│  │                  │ │                  │ │                 │ │
│  │ [tools]          │ │ [tools]          │ │ [tools]         │ │
│  │ builtin =        │ │ external = ["*"] │ │ builtin = [     │ │
│  │   ["call_agent"] │ │                  │ │   "fetch_traces"│ │
│  │                  │ │ (handled by UI)  │ │   "fetch_runs"  │ │
│  └────────┬─────────┘ └──────────────────┘ │   ...]          │ │
│           │                    ▲           └─────────────────┘ │
│           │                    │                    ▲           │
│           │  call_agent(       │  call_agent(       │           │
│           │   "vllora_ui_agent"│   "vllora_data_    │           │
│           │   task: "..."      │    agent"          │           │
│           │  )                 │   task: "..."      │           │
│           └────────────────────┴────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

**Key mechanism: `call_agent` builtin tool**

The main agent has `builtin = ["call_agent"]` which gives it the ability to call any other registered agent by name. The main agent learns which agents exist from its **instructions**:

```markdown
# In main agent's instructions:
You orchestrate two specialized agents:
- **vllora_ui_agent**: Controls the vLLora UI
- **vllora_data_agent**: Fetches trace data

When you need to manipulate the UI, use call_agent with "vllora_ui_agent".
When you need to fetch data, use call_agent with "vllora_data_agent".
```

#### 1.1 Create Agent Files in vLLora UI

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui

# Create directories for agents and scripts
mkdir -p agents
mkdir -p scripts
```

#### 1.2 Create Main Agent

Create `agents/vllora-main-agent.md`:
```bash
cat > agents/vllora-main-agent.md << 'EOF'
---
name = "vllora_main_agent"
description = "Main orchestrator for vLLora trace analysis"
max_iterations = 10
tool_format = "provider"

[tools]
builtin = ["call_agent"]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
max_tokens = 2000
---

# ROLE
You are the main AI assistant for vLLora, a real-time debugging platform for AI agents.

You orchestrate two specialized agents:
- **vllora_ui_agent**: Controls the vLLora UI
- **vllora_data_agent**: Fetches trace data from the backend

# TASK
{{task}}
EOF
```

#### 1.3 Create UI Agent

Create `agents/vllora-ui-agent.md`:
```bash
cat > agents/vllora-ui-agent.md << 'EOF'
---
name = "vllora_ui_agent"
description = "Controls vLLora UI display, navigation, and context awareness"
max_iterations = 5
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.2
max_tokens = 800
---

# ROLE
You control the vLLora UI with 11 tools in 2 categories:

## GET STATE (5 tools) - Read context
- get_current_view: page, project, thread, theme, modal
- get_selection_context: selected run, span, text selection
- get_thread_runs: list runs in current thread
- get_span_details(spanId): get span info
- get_collapsed_spans: list collapsed span IDs

## CHANGE UI (6 tools) - Modify interface
- open_modal(modal): tools, settings, provider-keys
- close_modal: close current modal
- select_span(spanId): select and highlight span
- select_run(runId): select run to display
- expand_span(spanId): expand collapsed span
- collapse_span(spanId): collapse expanded span

# TASK
{{task}}
EOF
```

#### 1.4 Create Data Agent

Create `agents/vllora-data-agent.md`:
```bash
cat > agents/vllora-data-agent.md << 'EOF'
---
name = "vllora_data_agent"
description = "Fetches trace data from vLLora backend"
max_iterations = 8
tool_format = "provider"

[tools]
external = ["*"]

[model_settings]
model = "gpt-4.1-mini"
temperature = 0.1
max_tokens = 1500
---

# ROLE
You fetch and analyze trace data from the vLLora backend.
All tools are handled by the frontend which calls the vLLora API.

## Available tools (5):
- fetch_traces: Get traces with filtering (runId, threadIds, limit)
- fetch_runs: Get execution runs (threadIds, modelName, limit)
- fetch_spans: Get individual spans (spanId, runIds, operationNames)
- get_run_details: Get details of a specific run (runId)
- fetch_groups: Get aggregated data (groupBy: time/thread/run)

# TASK
{{task}}
EOF
```

#### 1.5 Hybrid Agent Registration (CLI + Programmatic)

We use a **hybrid approach** combining CLI for development/CI-CD and programmatic registration for runtime safety:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HYBRID WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  DEVELOPMENT / CI-CD (CLI)          APP RUNTIME (Programmatic)      │
│  ─────────────────────────          ──────────────────────────      │
│                                                                      │
│  ┌─────────────────────┐            ┌─────────────────────────┐     │
│  │ agents/*.md files   │            │ App startup             │     │
│  │ (version controlled)│            │                         │     │
│  └──────────┬──────────┘            │ 1. Check if agents exist│     │
│             │                       │ 2. If missing → re-sync │     │
│             ▼                       │ 3. Version verification │     │
│  ┌─────────────────────┐            └─────────────────────────┘     │
│  │ distri agents push  │                       │                    │
│  │ (CLI command)       │                       ▼                    │
│  └──────────┬──────────┘            ┌─────────────────────────┐     │
│             │                       │ Self-healing system     │     │
│             ▼                       │ (auto-recovery if DB    │     │
│  ┌─────────────────────┐            │  gets wiped)            │     │
│  │ Distri Server       │◄───────────└─────────────────────────┘     │
│  │ (Agent Store)       │                                            │
│  └─────────────────────┘                                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why Hybrid?**

| Scenario | CLI Only | Programmatic Only | Hybrid |
|----------|----------|-------------------|--------|
| Version controlled agents | ✅ | ❌ | ✅ |
| Auto-recovery if DB wiped | ❌ | ✅ | ✅ |
| CI/CD integration | ✅ | ❌ | ✅ |
| Dynamic/per-user agents | ❌ | ✅ | ✅ |
| Clear change history | ✅ | ❌ | ✅ |
| Zero manual intervention | ❌ | ✅ | ✅ |

---

##### Part A: CLI for Development & CI/CD

**Push all agents at once:**
```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui

# Push all .md files from agents/ directory to local Distri server
distri --base-url http://localhost:8080 agents push ./agents --all

# Output:
# ✓ Registered: vllora_main_agent
# ✓ Registered: vllora_ui_agent
# ✓ Registered: vllora_data_agent
```

**Push a single agent:**
```bash
distri --base-url http://localhost:8080 agents push ./agents/vllora-main-agent.md
```

**Configuration options:**

| Method | Example |
|--------|---------|
| CLI flag | `distri --base-url http://localhost:8080 agents push ...` |
| Environment variable | `export DISTRI_BASE_URL=http://localhost:8080` |
| Config file | `~/.distri/config` with `base_url = "http://localhost:8080"` |

**Add npm scripts for convenience:**
```json
{
  "scripts": {
    "push-agents": "distri --base-url http://localhost:8080 agents push ./agents --all",
    "dev": "pnpm push-agents && vite",
    "build": "pnpm push-agents && vite build"
  }
}
```

Then just run:
```bash
pnpm push-agents
# Or agents auto-push when running dev/build
pnpm dev
```

---

##### Part B: Programmatic for Runtime Safety

Create `src/lib/agent-sync.ts` for runtime agent verification:

```typescript
// src/lib/agent-sync.ts
import { DistriClient } from '@distri/core';

// Agent definitions bundled with the app (for self-healing)
const REQUIRED_AGENTS = [
  'vllora_main_agent',
  'vllora_ui_agent',
  'vllora_data_agent'
];

// Bundled agent content (imported at build time or fetched from public/)
const AGENT_CONTENT: Record<string, string> = {};

/**
 * Ensures all required agents are registered on the Distri server.
 * This provides self-healing capability if the server DB is wiped.
 */
export async function ensureAgentsRegistered(client: DistriClient): Promise<{
  status: 'ok' | 'recovered' | 'error';
  missing: string[];
  registered: string[];
}> {
  const result = {
    status: 'ok' as 'ok' | 'recovered' | 'error',
    missing: [] as string[],
    registered: [] as string[]
  };

  try {
    // Get list of agents currently on server
    const existingAgents = await client.listAgents();

    // Check which required agents are missing
    for (const agentName of REQUIRED_AGENTS) {
      if (!existingAgents.includes(agentName)) {
        result.missing.push(agentName);
      }
    }

    // If any agents are missing, try to re-register them
    if (result.missing.length > 0) {
      console.warn(`[Agent Sync] Missing agents detected: ${result.missing.join(', ')}`);

      for (const agentName of result.missing) {
        try {
          // Try to fetch agent content from public folder
          const response = await fetch(`/agents/${agentName.replace('_', '-')}.md`);
          if (response.ok) {
            const content = await response.text();
            await client.registerAgent(content);
            result.registered.push(agentName);
            console.log(`[Agent Sync] Re-registered: ${agentName}`);
          }
        } catch (err) {
          console.error(`[Agent Sync] Failed to register ${agentName}:`, err);
        }
      }

      result.status = result.registered.length > 0 ? 'recovered' : 'error';
    }

    return result;
  } catch (error) {
    console.error('[Agent Sync] Failed to verify agents:', error);
    return { ...result, status: 'error' };
  }
}

/**
 * Verifies agent versions match the deployed app version.
 * Useful for ensuring UI and agents stay in sync.
 */
export async function verifyAgentVersions(
  client: DistriClient,
  expectedVersion: string
): Promise<boolean> {
  try {
    for (const agentName of REQUIRED_AGENTS) {
      const agent = await client.getAgent(agentName);
      if (agent?.metadata?.version !== expectedVersion) {
        console.warn(`[Agent Sync] Version mismatch for ${agentName}`);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
```

**Copy agent files to public folder for runtime access:**
```bash
# Add to package.json scripts
{
  "scripts": {
    "copy-agents": "cp -r agents/ public/agents/",
    "dev": "pnpm copy-agents && pnpm push-agents && vite",
    "build": "pnpm copy-agents && pnpm push-agents && vite build"
  }
}
```

#### 1.6 No Distri Plugin Modifications Needed

Since ALL agents use `external = ["*"]`, **no plugin code is needed in the Distri repo**.

All tool implementations stay in vLLora UI:
- UI tools → `src/lib/distri-ui-tools.ts`
- Data tools → `src/lib/distri-data-tools.ts`

The Distri server just routes tool calls back to the frontend.

#### 1.7 Optional: Create Distri Config (for CORS)

If you need to configure CORS, create `distri.toml` in the Distri project:

```bash
cd /Users/anhthuduong/Documents/GitHub/distri
cat > distri.toml << 'EOF'
[server]
port = 8080
host = "0.0.0.0"
cors_origins = ["http://localhost:5173"]  # Allow vLLora UI
EOF
```

---

### Step 2: Setup vLLora UI

#### 2.1 Install Dependencies

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui

# Install Distri packages (already done)
pnpm add @distri/core @distri/react
```

#### 2.2 Create Environment File

```bash
cat > .env.local << 'EOF'
# Distri Server URL
VITE_DISTRI_URL=http://localhost:8080

# vLLora Backend URL (for reference)
VITE_API_URL=http://localhost:9090
EOF
```

#### 2.3 Create DistriProvider (with Agent Sync)

```bash
mkdir -p src/providers

cat > src/providers/DistriProvider.tsx << 'EOF'
import { DistriProvider as BaseDistriProvider, useDistriClient } from '@distri/react';
import { ReactNode, useEffect, useState } from 'react';
import { ensureAgentsRegistered } from '@/lib/agent-sync';

interface Props {
  children: ReactNode;
}

// Inner component that has access to the Distri client
function AgentSyncInitializer({ children }: { children: ReactNode }) {
  const client = useDistriClient();
  const [syncStatus, setSyncStatus] = useState<'pending' | 'ok' | 'recovered' | 'error'>('pending');

  useEffect(() => {
    if (!client) return;

    // Run agent sync on app startup (hybrid approach - runtime safety net)
    ensureAgentsRegistered(client)
      .then((result) => {
        setSyncStatus(result.status);
        if (result.status === 'recovered') {
          console.log('[DistriProvider] Recovered missing agents:', result.registered);
        }
      })
      .catch((err) => {
        console.error('[DistriProvider] Agent sync failed:', err);
        setSyncStatus('error');
      });
  }, [client]);

  // Optional: Show loading state while syncing
  // if (syncStatus === 'pending') {
  //   return <div>Initializing agent system...</div>;
  // }

  return <>{children}</>;
}

export function DistriProvider({ children }: Props) {
  const config = {
    baseUrl: import.meta.env.VITE_DISTRI_URL || 'http://localhost:8080',
  };

  return (
    <BaseDistriProvider config={config}>
      <AgentSyncInitializer>
        {children}
      </AgentSyncInitializer>
    </BaseDistriProvider>
  );
}
EOF
```

This provider:
1. Connects to the Distri server
2. **Automatically verifies agents exist** on startup (hybrid approach)
3. **Self-heals** by re-registering missing agents from bundled files
4. Provides the client to all child components via context

#### 2.4 Create UI Tool Handlers

```bash
cat > src/lib/distri-ui-tools.ts << 'EOF'
import { getThemeFromStorage } from "@/themes/themes";
import { emitter } from "@/utils/eventEmitter";

// 11 tools: 5 GET STATE + 6 CHANGE UI
export const UI_TOOL_NAMES = [
  // GET STATE (5)
  "get_current_view", "get_selection_context", "get_thread_runs",
  "get_span_details", "get_collapsed_spans",
  // CHANGE UI (6)
  "open_modal", "close_modal",
  "select_span", "select_run", "expand_span", "collapse_span"
];

// Helper: wait for response event with timeout
function waitForResponse<T>(requestEvent: string, responseEvent: string, payload: any = {}, timeout = 2000): Promise<T | null> {
  return new Promise((resolve) => {
    const handler = (data: T) => {
      emitter.off(responseEvent as any, handler);
      resolve(data);
    };
    emitter.on(responseEvent as any, handler);
    emitter.emit(requestEvent as any, payload);
    setTimeout(() => {
      emitter.off(responseEvent as any, handler);
      resolve(null);
    }, timeout);
  });
}

export async function executeUiTool(name: string, params: Record<string, unknown>) {
  switch (name) {
    // GET STATE tools
    case "get_current_view": {
      const data = await waitForResponse("vllora_get_current_view", "vllora_current_view_response");
      return data
        ? { success: true, data }
        : { success: true, data: { page: window.location.pathname, theme: getThemeFromStorage() } };
    }
    case "get_selection_context": {
      const data = await waitForResponse("vllora_get_selection_context", "vllora_selection_context_response");
      const textSelection = window.getSelection()?.toString() || null;
      return { success: true, data: data || { selectedRunId: null, selectedSpanId: null, textSelection } };
    }
    case "get_thread_runs": {
      const data = await waitForResponse("vllora_get_thread_runs", "vllora_thread_runs_response");
      return data ? { success: true, data } : { success: false, message: "No thread context" };
    }
    case "get_span_details": {
      if (!params.spanId) return { success: false, message: "spanId required" };
      const data = await waitForResponse("vllora_get_span_details", "vllora_span_details_response", { spanId: params.spanId });
      return data ? { success: true, data } : { success: false, message: `Span ${params.spanId} not found` };
    }
    case "get_collapsed_spans": {
      const data = await waitForResponse("vllora_get_collapsed_spans", "vllora_collapsed_spans_response");
      return { success: true, data: data || { collapsedSpanIds: [] } };
    }

    // CHANGE UI tools
    case "open_modal": {
      const { openModal } = await import("@/contexts/ModalContext");
      openModal(params.modal as "tools" | "settings" | "provider-keys");
      return { success: true, message: `Opened ${params.modal} modal` };
    }
    case "close_modal": {
      const { closeModal } = await import("@/contexts/ModalContext");
      closeModal();
      return { success: true, message: "Modal closed" };
    }
    case "select_span":
      emitter.emit("vllora_select_span", { spanId: params.spanId as string });
      return { success: true, message: `Selected span ${params.spanId}` };
    case "select_run":
      emitter.emit("vllora_select_run", { runId: params.runId as string });
      return { success: true, message: `Selected run ${params.runId}` };
    case "expand_span":
      emitter.emit("vllora_expand_span", { spanId: params.spanId as string });
      return { success: true, message: `Expanded span ${params.spanId}` };
    case "collapse_span":
      emitter.emit("vllora_collapse_span", { spanId: params.spanId as string });
      return { success: true, message: `Collapsed span ${params.spanId}` };

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

export function isUiTool(name: string): boolean {
  return UI_TOOL_NAMES.includes(name);
}
EOF
```

#### 2.5 Create useVlloraAgent Hook

This hook handles BOTH UI tools and Data tools since all agents use `external = ["*"]`.

```bash
mkdir -p src/hooks

cat > src/hooks/useVlloraAgent.ts << 'EOF'
import { useState, useCallback } from 'react';
import { useChat, useAgent } from '@distri/react';
import { executeUiTool, isUiTool } from '@/lib/distri-ui-tools';
import { executeDataTool, isDataTool } from '@/lib/distri-data-tools';

interface Activity {
  type: 'thinking' | 'tool_call' | 'agent_call' | 'response' | 'error';
  content: string;
  timestamp: Date;
}

export function useVlloraAgent() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const { agent } = useAgent({ agentId: 'vllora_main_agent' });

  const {
    messages,
    sendMessage,
    isStreaming,
    stopStreaming
  } = useChat({
    agent,
    onToolCall: async (toolCall) => {
      setActivities(prev => [...prev, {
        type: 'tool_call',
        content: `${toolCall.name}(${JSON.stringify(toolCall.input)})`,
        timestamp: new Date()
      }]);

      const input = toolCall.input || {};

      // Handle UI tools (11 tools: 5 GET STATE + 6 CHANGE UI)
      if (isUiTool(toolCall.name)) {
        const result = await executeUiTool(toolCall.name, input);
        return { toolCallId: toolCall.id, result: JSON.stringify(result) };
      }

      // Handle Data tools (5 tools: fetch_traces, fetch_runs, etc.)
      if (isDataTool(toolCall.name)) {
        const result = await executeDataTool(toolCall.name, input);
        return { toolCallId: toolCall.id, result: JSON.stringify(result) };
      }

      // Unknown tool - let Distri handle it (shouldn't happen with external = ["*"])
      return undefined;
    },
    onError: (error) => {
      setActivities(prev => [...prev, {
        type: 'error',
        content: error.message,
        timestamp: new Date()
      }]);
    }
  });

  const sendToAgent = useCallback(async (text: string) => {
    setActivities([]);
    await sendMessage({ text });
  }, [sendMessage]);

  return {
    messages,
    sendToAgent,
    isProcessing: isStreaming,
    activities,
    cancel: stopStreaming
  };
}
EOF
```

#### 2.6 Wrap App with DistriProvider

Update `src/App.tsx` or `src/main.tsx`:
```tsx
// Add this import
import { DistriProvider } from '@/providers/DistriProvider';

// Wrap your app
function App() {
  return (
    <DistriProvider>
      {/* ... existing app content ... */}
    </DistriProvider>
  );
}
```

---

### Step 3: Run Everything (Hybrid Approach)

With the hybrid approach, you only need **3 terminal windows**. Agent push is integrated into the dev script.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      STARTUP SEQUENCE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Terminal 1           Terminal 2           Terminal 3                │
│  ──────────           ──────────           ──────────                │
│  vLLora Backend       Distri Server        vLLora UI                 │
│  (cargo run)          (distri serve)       (pnpm dev)                │
│       │                    │                    │                    │
│       │                    │                    │                    │
│       ▼                    ▼                    ▼                    │
│  localhost:9090       localhost:8080       localhost:5173            │
│       │                    │                    │                    │
│       │                    │         ┌──────────┴──────────┐        │
│       │                    │         │ 1. copy-agents      │        │
│       │                    │         │ 2. push-agents (CLI)│        │
│       │                    │◄────────│ 3. vite dev         │        │
│       │                    │         │ 4. agent-sync       │        │
│       │                    │         │    (runtime verify) │        │
│       │                    │         └─────────────────────┘        │
│       │                    │                                         │
└─────────────────────────────────────────────────────────────────────┘
```

#### Terminal 1: Start vLLora Backend
```bash
cd /Users/anhthuduong/Documents/GitHub/vllora
cargo run

# Should see: Server running on http://localhost:9090
```

#### Terminal 2: Start Distri Server
```bash
cd /Users/anhthuduong/Documents/GitHub/distri

# Set environment variables
export VLLORA_API_URL=http://localhost:9090
export OPENAI_API_KEY=sk-...  # Required for LLM calls

# Start server
distri serve

# Should see:
# ✓ Loaded plugin: vllora_ui
# ✓ Loaded plugin: vllora_data
# Server running on http://localhost:8080
```

#### Terminal 3: Start vLLora UI (Auto-pushes Agents)
```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui

# This single command does everything:
# 1. Copies agents to public/ folder
# 2. Pushes agents to Distri server (CLI)
# 3. Starts Vite dev server
pnpm dev

# Should see:
# Copying agents to public/...
# ✓ Registered: vllora_main_agent
# ✓ Registered: vllora_ui_agent
# ✓ Registered: vllora_data_agent
# Local: http://localhost:5173
#
# Then in browser console:
# [DistriProvider] Agent sync complete: ok
```

**What happens with the hybrid approach:**

| Stage | What happens | Where |
|-------|--------------|-------|
| `pnpm dev` starts | 1. Copies agents to `public/` | Build time |
| | 2. Pushes agents via CLI | Build time |
| | 3. Starts Vite dev server | Build time |
| App loads in browser | 4. `ensureAgentsRegistered()` runs | Runtime |
| | 5. Verifies agents exist on server | Runtime |
| | 6. Re-registers if any missing (self-heal) | Runtime |

**Graceful degradation:** If Distri server is down during `pnpm dev`, the CLI push fails but the app still starts. When the server comes back up, the runtime sync will recover the agents automatically.

---

### Step 4: Verify Connection

#### 4.1 Check Distri Server Health
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok"}
```

#### 4.2 List Available Agents
```bash
curl http://localhost:8080/agents
# Expected: ["vllora_main_agent", "vllora_ui_agent", "vllora_data_agent"]
```

#### 4.3 Test Agent Call
```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "vllora_main_agent",
    "message": "Hello, what can you help me with?"
  }'
```

---

### Step 5: Use the Agent in UI

Once the AgentWidget is implemented:

1. Open vLLora UI at http://localhost:5173
2. Click the floating bot button (bottom-right)
3. Type a query like:
   - "Find slow spans from today"
   - "Show me errors in the last hour"
   - "Analyze costs by model"

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Failed to connect to Distri server" | Check VITE_DISTRI_URL in .env.local matches Distri port |
| "Agent not found" | With hybrid approach, agents auto-recover on next page load. Check browser console for `[Agent Sync]` logs. Manual fix: run `pnpm push-agents` |
| "Plugin error" | Check VLLORA_API_URL env var is set for Distri |
| "CORS error" | Distri server may need CORS config for localhost:5173 |
| "LLM error" | Ensure OPENAI_API_KEY is set for Distri server |
| "[Agent Sync] Missing agents" | Normal during first load after DB wipe. Agents will auto-register from `public/agents/` |
| "Agent sync failed" | Check if `public/agents/*.md` files exist. Run `pnpm copy-agents` if missing |

#### Enable CORS in Distri (if needed)
Add to `distri.toml`:
```toml
[server]
cors_origins = ["http://localhost:5173", "http://localhost:3000"]
```

---

### Environment Variables Summary

| Variable | Where | Value |
|----------|-------|-------|
| `VLLORA_API_URL` | Distri Server | `http://localhost:9090` |
| `OPENAI_API_KEY` | Distri Server | Your OpenAI API key |
| `VITE_DISTRI_URL` | vLLora UI | `http://localhost:8080` |
| `VITE_API_URL` | vLLora UI | `http://localhost:9090` |

---

## File Summary

All files are in the **vLLora UI repo** - no modifications to Distri repo needed.

| File | Purpose |
|------|---------|
| **Agent Definitions (pushed to Distri via CLI)** ||
| `agents/vllora-main-agent.md` | Main orchestrator agent definition |
| `agents/vllora-ui-agent.md` | UI control agent (11 tools: 5 GET STATE + 6 CHANGE UI) |
| `agents/vllora-data-agent.md` | Data fetching agent (5 tools) |
| **Tool Handlers (Frontend)** ||
| `src/lib/distri-ui-tools.ts` | UI tool handlers (modals, span/run selection) |
| `src/lib/distri-data-tools.ts` | Data tool handlers (API calls to vLLora backend) |
| **Integration** ||
| `src/lib/agent-sync.ts` | Hybrid approach - runtime agent verification & self-healing |
| `src/providers/DistriProvider.tsx` | Distri provider with agent sync |
| `src/hooks/useVlloraAgent.ts` | Custom hook handling both UI and Data tools |
| `src/utils/eventEmitter.ts` | Extended with Distri events |
| `public/agents/*.md` | Bundled agents for runtime self-healing |

---

## Package Dependencies

### vLLora UI

```bash
pnpm add @distri/core @distri/react
```

**Already installed (no action needed):**
- `mitt` - Event emitter
- `@microsoft/fetch-event-source` - SSE streaming

---

## Proposed UI Design: Floating Agent Panel

The Distri agent will appear as a **floating chat panel** in the bottom-right corner of the vLLora UI. This design allows users to interact with the agent while viewing traces, without leaving their current context.

### Current vLLora Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌──────┐ ┌─────────────────────────────────────────────────────┐│
│ │      │ │                    Header                           ││
│ │ Side │ ├─────────────────────────────────────────────────────┤│
│ │ bar  │ │                                                     ││
│ │      │ │                  Main Content                       ││
│ │ Home │ │              (Chat, Traces, etc.)                   ││
│ │ Chat │ │                                                     ││
│ │      │ │                                                     ││
│ │──────│ │                                                     ││
│ │ Sett │ │                                                     ││
│ └──────┘ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### With Agent Panel (Expanded)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌──────┐ ┌─────────────────────────────────────────────────────┐│
│ │      │ │                    Header                           ││
│ │ Side │ ├─────────────────────────────────────────────────────┤│
│ │ bar  │ │                                     ┌──────────────┐││
│ │      │ │                                     │ Agent Panel  │││
│ │ Home │ │        Main Content                 │──────────────│││
│ │ Chat │ │       (Traces View)                 │ Messages...  │││
│ │      │ │                                     │              │││
│ │──────│ │                                     │ ┌──────────┐ │││
│ │ Sett │ │                                     │ │  Input   │ │││
│ └──────┘ └─────────────────────────────────────┴──────────────┴┘│
│                                                        [🤖]     │
└─────────────────────────────────────────────────────────────────┘
                                                          ↑
                                                   Toggle Button
```

### Agent Panel Components

#### 1. Toggle Button (`AgentToggleButton`) - Draggable

The toggle button is **draggable** like iPhone's AssistiveTouch, allowing users to position it anywhere on screen.

- **Default Position**: Bottom-right corner (`bottom-4 right-4`)
- **Appearance**: Circular button (48x48px) with Bot icon
- **Behavior**:
  - **Click**: Open/close the panel
  - **Drag**: Move to any position on screen
  - **Release**: Snaps to nearest edge (left or right)
- **States**:
  - Closed: Primary color with Bot icon
  - Open: Muted color with X icon
  - Activity: Pulsing animation when agent is working
  - Dragging: Slight scale up, shadow increase

**Draggable Features:**
| Feature | Behavior |
|---------|----------|
| Edge Snapping | Snaps to left or right edge on release |
| Boundary Constraints | Stays within viewport (with 16px padding) |
| Position Persistence | Saves position to localStorage |
| Touch Support | Works with mouse and touch events |
| Drag Threshold | 5px movement before drag starts (prevents accidental drags) |
| Smooth Animation | 200ms spring animation on snap |

**Implementation Approach:**
```tsx
// Position state with persistence
const [position, setPosition] = useState(() => {
  const saved = localStorage.getItem('agent-button-position');
  return saved ? JSON.parse(saved) : { x: window.innerWidth - 64, y: window.innerHeight - 80 };
});

// Drag handling
const handleDragEnd = (x: number, y: number) => {
  // Snap to nearest edge
  const snapX = x < window.innerWidth / 2 ? 16 : window.innerWidth - 64;
  // Constrain Y within viewport
  const snapY = Math.max(16, Math.min(y, window.innerHeight - 64));

  const newPos = { x: snapX, y: snapY };
  setPosition(newPos);
  localStorage.setItem('agent-button-position', JSON.stringify(newPos));
};
```

**Panel Position Adjustment:**
When the button is on the left side, the panel opens to the right of the button, and vice versa:
```
Button on RIGHT:          Button on LEFT:
┌──────────────┐          ┌──────────────┐
│ Agent Panel  │          │ Agent Panel  │
│              │          │              │
│              │          │              │
└──────────────┘          └──────────────┘
           [🤖]          [🤖]
```

#### 2. Agent Panel (`AgentPanel`)

**Position & Size:**
- Fixed position, relative to toggle button
- Width: 384px (w-96)
- Height: 500px (max 70vh)
- Rounded corners with shadow

**Panel Structure:**
```
┌─────────────────────────────────────┐
│  🤖 vLLora Assistant           [X] │  ← Header
│  Your AI debugging companion        │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Find performance bottlenecks │   │  ← Quick Suggestions
│  └─────────────────────────────┘   │    (shown when empty)
│  ┌─────────────────────────────┐   │
│  │ Find errors from today      │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Analyze costs by model      │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤  ← Messages Area
│                                     │    (scrollable)
│  ┌─────────────────────────────┐   │
│  │ You: Find slow spans today  │   │  ← User Message
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🔧 fetch_runs({limit: 10})  │   │  ← Tool Call
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🤖 Calling data_agent...    │   │  ← Agent Call
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ I found 3 slow spans:       │   │  ← Response
│  │ • span_abc (2.3s) - OpenAI  │   │
│  │ • span_def (1.8s) - Tool    │   │
│  │ [Highlighted in trace view] │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────┐  [➤] │  ← Input Area
│  │ Ask about your traces...│       │
│  └─────────────────────────┘       │
└─────────────────────────────────────┘
```

**Section Details:**

| Section | Description |
|---------|-------------|
| **Header** | Bot icon, title "vLLora Assistant", subtitle, close button (X) |
| **Quick Suggestions** | Clickable chips shown when no messages. Disappear after first message |
| **Messages Area** | Scrollable container for conversation history |
| **Input Area** | Text input + send button. Disabled while processing |

**Message Types in Detail:**

| Type | Style | Icon | Example |
|------|-------|------|---------|
| **User** | Right-aligned, primary bg | None | "Find errors from yesterday" |
| **Response** | Left-aligned, muted bg | 🤖 | "I found 3 errors in thread-xyz..." |
| **Tool Call** | Left-aligned, amber/yellow bg, monospace | 🔧 | `highlight_span({ spanId: "abc" })` |
| **Agent Call** | Left-aligned, blue bg | 🤖 | "Calling data_agent to fetch traces..." |
| **Thinking** | Left-aligned, muted, animated | ⏳ | "Analyzing trace data..." |
| **Error** | Left-aligned, red bg | ❌ | "Failed to connect to Distri server" |

**Interactive Elements:**

1. **Quick Suggestion Chips** - Click to auto-send that query
2. **Span IDs in responses** - Clickable, triggers `highlight_span` + `scroll_to_span`
3. **Run IDs in responses** - Clickable, navigates to that run
4. **Copy button** - On responses, copies text to clipboard
5. **Retry button** - On errors, retries the last message


### Component Files to Create

```
src/components/agent/
├── AgentPanel.tsx        # Main panel component
├── AgentToggleButton.tsx # Floating draggable toggle button
├── AgentWidget.tsx       # Wrapper combining panel + button + state
├── AgentMessage.tsx      # Individual message component
├── index.ts              # Exports
└── hooks/
    └── useDraggable.ts   # Reusable drag hook with edge snapping
```

### Integration in Layout

Update `src/components/layout.tsx`:

```tsx
import { AgentWidget } from '@/components/agent';

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar ... />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader ... />
        <main className="flex-1 flex overflow-hidden">
          ...
          <Outlet />
        </main>
      </div>

      {/* Agent floating panel - available on all pages */}
      <AgentWidget />
    </div>
  )
}
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + J` | Toggle agent panel |
| `Escape` | Close agent panel |
| `Enter` | Send message |
| `Shift + Enter` | New line in input |

### State Management

The agent panel uses a combination of:
1. **Local state** for UI (open/closed, input text)
2. **Position state** with localStorage persistence (draggable button)
3. **`useVlloraAgent` hook** for agent communication
4. **`useDraggable` hook** for drag behavior
5. **Event emitter** for UI tool execution

```tsx
// In AgentWidget.tsx
function AgentWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    sendToAgent,
    isProcessing,
    activities,
    response
  } = useVlloraAgent();

  // Draggable button with edge snapping
  const {
    position,
    isDragging,
    handlers
  } = useDraggable({
    storageKey: 'agent-button-position',
    defaultPosition: { x: window.innerWidth - 64, y: window.innerHeight - 80 },
    snapToEdge: true,
    edgePadding: 16
  });

  // Panel opens on opposite side of button
  const panelSide = position.x < window.innerWidth / 2 ? 'right' : 'left';

  return (
    <>
      <AgentPanel
        isOpen={isOpen}
        side={panelSide}
        buttonPosition={position}
        onClose={() => setIsOpen(false)}
        onSend={sendToAgent}
        isProcessing={isProcessing}
        activities={activities}
        response={response}
      />
      <AgentToggleButton
        position={position}
        isOpen={isOpen}
        isDragging={isDragging}
        onClick={() => !isDragging && setIsOpen(!isOpen)}
        hasActivity={isProcessing}
        {...handlers}
      />
    </>
  );
}
```

### useDraggable Hook

```tsx
// src/components/agent/hooks/useDraggable.ts

interface Position { x: number; y: number }

interface UseDraggableOptions {
  storageKey?: string;           // localStorage key for persistence
  defaultPosition: Position;     // Initial position
  snapToEdge?: boolean;          // Snap to left/right edge on release
  edgePadding?: number;          // Padding from viewport edges (default: 16)
  dragThreshold?: number;        // Min pixels before drag starts (default: 5)
}

interface UseDraggableReturn {
  position: Position;            // Current position
  isDragging: boolean;           // True while actively dragging
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
}

export function useDraggable(options: UseDraggableOptions): UseDraggableReturn {
  // Implementation handles:
  // 1. Mouse and touch events
  // 2. Drag threshold to distinguish click vs drag
  // 3. Edge snapping on release
  // 4. Viewport boundary constraints
  // 5. localStorage persistence
  // 6. Window resize handling
}
```

### Visual Design

- **Colors**: Uses existing theme variables (`--primary`, `--muted`, etc.)
- **Border Radius**: `rounded-lg` for panel, `rounded-full` for toggle
- **Shadow**: `shadow-2xl` for elevated appearance
- **Animation**: `slide-in-from-bottom-5 fade-in` on open
- **Drag Animation**: Spring animation (200ms) when snapping to edge

---

## Next Steps

1. **Create agent component files** in `src/components/agent/`
   - `AgentToggleButton.tsx` - Draggable floating button
   - `AgentPanel.tsx` - Chat panel with position-aware placement
   - `AgentWidget.tsx` - Combines button + panel + state
   - `AgentMessage.tsx` - Message rendering
2. **Implement `useDraggable` hook** with edge snapping and persistence
3. **Implement `useVlloraAgent` hook** with Distri packages
4. **Add `DistriProvider`** to App.tsx
5. **Integrate `AgentWidget`** into Layout
6. **Implement event listeners** in trace components for highlight/scroll/expand
7. **Add keyboard shortcuts** for panel toggle
8. **Create analysis workflows** for common tasks (daily report, error summary)
