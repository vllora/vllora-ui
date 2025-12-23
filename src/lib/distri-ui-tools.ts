/**
 * Distri UI Tool Handlers
 *
 * These tools control the vLLora UI. All tools use external = ["*"],
 * meaning they are handled here in the frontend.
 *
 * Tools are divided into two categories:
 * - GET STATE (5 tools): Request/response pattern via event emitter
 * - CHANGE UI (6 tools): Fire-and-forget via event emitter or direct calls
 */

import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';

// Tool handler type
type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

// UI tool names
export const UI_TOOL_NAMES = [
  // GET STATE (5)
  'get_current_view',
  'get_selection_context',
  'get_thread_runs',
  'get_span_details',
  'get_collapsed_spans',
  // CHANGE UI (6)
  'open_modal',
  'close_modal',
  'select_span',
  'select_run',
  'expand_span',
  'collapse_span',
] as const;

export type UiToolName = (typeof UI_TOOL_NAMES)[number];

// ============================================================================
// GET STATE TOOLS (5 tools) - Request/response pattern
// These emit a request event and wait for a response event
// ============================================================================

/**
 * Helper to create a request/response tool handler
 * Emits request event and waits for response event with timeout
 */
function createGetStateHandler<T>(
  requestEvent: string,
  responseEvent: string,
  requestPayload?: Record<string, unknown>
): () => Promise<T> {
  return () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        emitter.off(responseEvent as any, handler);
        reject(new Error(`Timeout waiting for ${responseEvent}`));
      }, 5000);

      const handler = (data: T) => {
        clearTimeout(timeout);
        emitter.off(responseEvent as any, handler);
        resolve(data);
      };

      emitter.on(responseEvent as any, handler);
      emitter.emit(requestEvent as any, requestPayload || {});
    });
  };
}

const getStateHandlers: Record<string, ToolHandler> = {
  // Get current view state (page, project, thread, theme, modal)
  get_current_view: async () => {
    const handler = createGetStateHandler<{
      page: string;
      projectId: string | null;
      threadId: string | null;
      theme: string;
      modal: string | null;
    }>('vllora_get_current_view', 'vllora_current_view_response');
    return handler();
  },

  // Get current selection (selected run, span, text selection)
  get_selection_context: async () => {
    const handler = createGetStateHandler<{
      selectedRunId: string | null;
      selectedSpanId: string | null;
      detailSpanId: string | null;
      textSelection: string | null;
    }>('vllora_get_selection_context', 'vllora_selection_context_response');
    return handler();
  },

  // Get runs in current thread
  get_thread_runs: async () => {
    const handler = createGetStateHandler<{
      runs: Array<{
        run_id: string;
        status: string;
        model: string | null;
        duration_ms: number | null;
      }>;
    }>('vllora_get_thread_runs', 'vllora_thread_runs_response');
    return handler();
  },

  // Get details for a specific span
  get_span_details: async ({ spanId }) => {
    if (!spanId) {
      return { error: 'spanId is required' };
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        emitter.off('vllora_span_details_response', handler);
        reject(new Error('Timeout waiting for span details'));
      }, 5000);

      const handler = (data: unknown) => {
        clearTimeout(timeout);
        emitter.off('vllora_span_details_response', handler);
        resolve(data);
      };

      emitter.on('vllora_span_details_response', handler);
      emitter.emit('vllora_get_span_details', {});
    });
  },

  // Get list of collapsed span IDs
  get_collapsed_spans: async () => {
    const handler = createGetStateHandler<{
      collapsedSpanIds: string[];
    }>('vllora_get_collapsed_spans', 'vllora_collapsed_spans_response');
    return handler();
  },
};

// ============================================================================
// CHANGE UI TOOLS (6 tools) - Fire-and-forget pattern
// These emit events that are handled by React components
// ============================================================================

const changeUiHandlers: Record<string, ToolHandler> = {
  // Open a modal dialog
  open_modal: async ({ modal }) => {
    const validModals = ['tools', 'settings', 'provider-keys'];
    if (!validModals.includes(modal as string)) {
      return {
        success: false,
        error: `Invalid modal. Valid options: ${validModals.join(', ')}`,
      };
    }
    try {
      const { openModal } = await import('@/contexts/ModalContext');
      openModal(modal as 'tools' | 'settings' | 'provider-keys');
      return { success: true, message: `Opened ${modal} modal` };
    } catch (error) {
      return { success: false, error: 'Failed to open modal' };
    }
  },

  // Close current modal
  close_modal: async () => {
    try {
      const { closeModal } = await import('@/contexts/ModalContext');
      closeModal();
      return { success: true, message: 'Modal closed' };
    } catch (error) {
      return { success: false, error: 'Failed to close modal' };
    }
  },

  // Select and highlight a span
  select_span: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, error: 'spanId is required' };
    }
    emitter.emit('vllora_select_span', { spanId: spanId as string });
    return { success: true, message: `Selected span: ${spanId}` };
  },

  // Select a run and load its spans
  select_run: async ({ runId }) => {
    if (!runId) {
      return { success: false, error: 'runId is required' };
    }
    emitter.emit('vllora_select_run', { runId: runId as string });
    return { success: true, message: `Selected run: ${runId}` };
  },

  // Expand a collapsed span
  expand_span: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, error: 'spanId is required' };
    }
    emitter.emit('vllora_expand_span', { spanId: spanId as string });
    return { success: true, message: `Expanded span: ${spanId}` };
  },

  // Collapse an expanded span
  collapse_span: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, error: 'spanId is required' };
    }
    emitter.emit('vllora_collapse_span', { spanId: spanId as string });
    return { success: true, message: `Collapsed span: ${spanId}` };
  },
};

// ============================================================================
// Combined UI Tool Handlers
// ============================================================================

export const uiToolHandlers: Record<string, ToolHandler> = {
  ...getStateHandlers,
  ...changeUiHandlers,
};

/**
 * Check if a tool name is a UI tool
 */
export function isUiTool(toolName: string): toolName is UiToolName {
  return UI_TOOL_NAMES.includes(toolName as UiToolName);
}

/**
 * Execute a UI tool by name
 */
export async function executeUiTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const handler = uiToolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown UI tool: ${toolName}`);
  }
  return handler(params);
}

// ============================================================================
// DistriFnTool[] format for Chat component
// ============================================================================

/**
 * UI tools in DistriFnTool format for use with @distri/react Chat component
 */
export const uiTools: DistriFnTool[] = [
  // GET STATE TOOLS
  {
    name: 'get_current_view',
    description: 'Get information about the current page/view the user is looking at',
    type: 'function',
    input_schema: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_current_view({})),
  } as DistriFnTool,

  {
    name: 'get_selection_context',
    description: 'Get the currently selected run, span, and detail span IDs',
    type: 'function',
    input_schema: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_selection_context({})),
  } as DistriFnTool,

  {
    name: 'get_thread_runs',
    description: 'Get the list of runs currently displayed in the UI',
    type: 'function',
    input_schema: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_thread_runs({})),
  } as DistriFnTool,

  {
    name: 'get_span_details',
    description: 'Get details of a specific span by ID',
    type: 'function',
    input_schema: {
      type: 'object',
      properties: {
        spanId: { type: 'string', description: 'The span ID to get details for' },
      },
      required: ['spanId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.get_span_details(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'get_collapsed_spans',
    description: 'Get the list of span IDs that are currently collapsed in the trace view',
    type: 'function',
    input_schema: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_collapsed_spans({})),
  } as DistriFnTool,

  // CHANGE UI TOOLS
  {
    name: 'open_modal',
    description: 'Open a modal dialog in the UI',
    type: 'function',
    input_schema: {
      type: 'object',
      properties: {
        modal: {
          type: 'string',
          enum: ['tools', 'settings', 'provider-keys'],
          description: 'The type of modal to open',
        },
      },
      required: ['modal'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.open_modal(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'close_modal',
    description: 'Close the currently open modal dialog',
    type: 'function',
    input_schema: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.close_modal({})),
  } as DistriFnTool,

  {
    name: 'select_span',
    description: 'Select and highlight a specific span in the trace view',
    type: 'function',
    input_schema: {
      type: 'object',
      properties: {
        spanId: { type: 'string', description: 'The span ID to select' },
      },
      required: ['spanId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.select_span(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'select_run',
    description: 'Select a specific run in the traces view',
    type: 'function',
    input_schema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'The run ID to select' },
      },
      required: ['runId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.select_run(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'expand_span',
    description: 'Expand a collapsed span to show its children',
    type: 'function',
    input_schema: {
      type: 'object',
      properties: {
        spanId: { type: 'string', description: 'The span ID to expand' },
      },
      required: ['spanId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.expand_span(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'collapse_span',
    description: 'Collapse a span to hide its children',
    type: 'function',
    input_schema: {
      type: 'object',
      properties: {
        spanId: { type: 'string', description: 'The span ID to collapse' },
      },
      required: ['spanId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.collapse_span(input as Record<string, unknown>)),
  } as DistriFnTool,
];
