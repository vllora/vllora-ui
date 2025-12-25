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
import { isActualModelCall } from '@/utils/span-to-message';

// Tool handler type
type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

// UI tool names
export const UI_TOOL_NAMES = [
  // GET STATE (8)
  'get_current_view',
  'get_selection_context',
  'get_thread_runs',
  'get_span_details',
  'get_collapsed_spans',
  'is_valid_for_optimize',
  'get_experiment_data',
  'evaluate_experiment_results',
  // CHANGE UI (9)
  'open_modal',
  'close_modal',
  'select_span',
  'select_run',
  'expand_span',
  'collapse_span',
  'navigate_to_experiment',
  'apply_experiment_data',
  'run_experiment',
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

  // Get details for a specific span by ID (calls API directly)
  get_span_details: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, error: 'spanId is required' };
    }
    try {
      const { getSpanById } = await import('@/services/spans-api');
      const span = await getSpanById({ spanId: spanId as string });
      if (span) {
        return { success: true, span };
      } else {
        return { success: false, error: `Span ${spanId} not found` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch span details',
      };
    }
  },

  // Get list of collapsed span IDs
  get_collapsed_spans: async () => {
    const handler = createGetStateHandler<{
      collapsedSpanIds: string[];
    }>('vllora_get_collapsed_spans', 'vllora_collapsed_spans_response');
    return handler();
  },

  // Check if a span is valid for optimization (actual model call)
  is_valid_for_optimize: async ({ spanId }) => {
    if (!spanId) {
      return { valid: false, error: 'spanId is required' };
    }
    try {
      const { getSpanById } = await import('@/services/spans-api');
      const span = await getSpanById({ spanId: spanId as string });
      if (!span) {
        return { valid: false, error: `Span ${spanId} not found` };
      }
      const isValid = isActualModelCall(span);
      return {
        valid: isValid,
        spanId,
        operation_name: span.operation_name,
        reason: isValid
          ? 'This span is an actual model call and can be optimized'
          : 'This span is not available for optimization. Only actual model call spans (where operation_name is the model name) can be optimized.',
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to check span',
      };
    }
  },

  // Get current experiment data (experiment page only)
  get_experiment_data: async () => {
    const handler = createGetStateHandler<{
      experimentData: Record<string, unknown>;
      originalExperimentData: Record<string, unknown> | null;
      result: unknown;
      running: boolean;
    }>('vllora_get_experiment_data', 'vllora_experiment_data_response');
    return handler();
  },

  // Evaluate experiment results - compare original vs new (experiment page only)
  evaluate_experiment_results: async () => {
    const handler = createGetStateHandler<{
      hasResults: boolean;
      original: {
        output: unknown;
        model: string | null;
        cost: number | null;
        total_tokens: number | null;
        input_tokens: number | null;
        output_tokens: number | null;
      };
      new: {
        output: unknown;
        model: string | null;
        cost: number | null;
        total_tokens: number | null;
        input_tokens: number | null;
        output_tokens: number | null;
      };
      comparison: {
        cost_change_percent: number | null;
        total_tokens_change_percent: number | null;
        input_tokens_change_percent: number | null;
        output_tokens_change_percent: number | null;
      };
    }>('vllora_evaluate_experiment_results', 'vllora_evaluate_experiment_results_response');
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

  // Navigate to experiment page (saves agent state to localStorage for continuity)
  navigate_to_experiment: async ({ spanId }) => {
    if (!spanId) {
      return { success: false, error: 'spanId is required' };
    }
    const url = `/experiment?span_id=${encodeURIComponent(spanId as string)}`;

    // Emit navigation event - component will handle saving state and navigating
    emitter.emit('vllora_navigate_to_experiment', { spanId: spanId as string, url });

    return {
      success: true,
      url,
      navigated: true,
      message: `Navigation complete. The user is now on the experiment page. DO NOT call navigate_to_experiment again. Proceed to provide your optimization suggestions.`,
    };
  },

  // Apply changes to experiment data (experiment page only)
  apply_experiment_data: async ({ data }) => {
    if (!data) {
      return { success: false, error: 'data is required' };
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        emitter.off('vllora_apply_experiment_data_response', handler);
        reject(new Error('Timeout waiting for apply_experiment_data response. Make sure you are on the experiment page.'));
      }, 5000);

      const handler = (response: { success: boolean; error?: string }) => {
        clearTimeout(timeout);
        emitter.off('vllora_apply_experiment_data_response', handler);
        resolve(response);
      };

      emitter.on('vllora_apply_experiment_data_response', handler);
      emitter.emit('vllora_apply_experiment_data', { data: data as Record<string, unknown> });
    });
  },

  // Run the experiment (experiment page only)
  run_experiment: async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        emitter.off('vllora_run_experiment_response', handler);
        reject(new Error('Timeout waiting for run_experiment response. Make sure you are on the experiment page.'));
      }, 60000); // 60s timeout for experiment run

      const handler = (response: { success: boolean; result?: unknown; error?: string }) => {
        clearTimeout(timeout);
        emitter.off('vllora_run_experiment_response', handler);
        resolve(response);
      };

      emitter.on('vllora_run_experiment_response', handler);
      emitter.emit('vllora_run_experiment', {});
    });
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
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_current_view({})),
  } as DistriFnTool,

  {
    name: 'get_selection_context',
    description: 'Get the currently selected run, span, and detail span IDs',
    type: 'function',
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_selection_context({})),
  } as DistriFnTool,

  {
    name: 'get_thread_runs',
    description: 'Get the list of runs currently displayed in the UI',
    type: 'function',
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_thread_runs({})),
  } as DistriFnTool,

  {
    name: 'get_span_details',
    description: 'Get details of a specific span by ID',
    type: 'function',
    parameters: {
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
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_collapsed_spans({})),
  } as DistriFnTool,

  {
    name: 'is_valid_for_optimize',
    description: 'Check if a span can be optimized on the experiment page. Call this before navigate_to_experiment to verify the span is valid.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanId: { type: 'string', description: 'The span ID to check' },
      },
      required: ['spanId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.is_valid_for_optimize(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'get_experiment_data',
    description: 'Get the current experiment data including messages, model, parameters. Only works on the experiment page.',
    type: 'function',
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.get_experiment_data({})),
  } as DistriFnTool,

  // CHANGE UI TOOLS
  {
    name: 'open_modal',
    description: 'Open a modal dialog in the UI',
    type: 'function',
    parameters: {
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
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.close_modal({})),
  } as DistriFnTool,

  {
    name: 'select_span',
    description: 'Select and highlight a specific span in the trace view',
    type: 'function',
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
      type: 'object',
      properties: {
        spanId: { type: 'string', description: 'The span ID to collapse' },
      },
      required: ['spanId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.collapse_span(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'navigate_to_experiment',
    description: 'Navigate to the experiment page for a span. The agent panel stays open so you can continue providing optimization suggestions after navigation. Call is_valid_for_optimize first to verify the span is valid.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanId: { type: 'string', description: 'The span ID to experiment with' },
      },
      required: ['spanId'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.navigate_to_experiment(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'apply_experiment_data',
    description: 'Apply changes to the experiment data (model, messages, parameters). Only works on the experiment page. Pass partial data to update specific fields.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Partial experiment data to apply. Can include: model (string), messages (array), temperature (number), max_tokens (number), etc.',
        },
      },
      required: ['data'],
    },
    handler: async (input: object) => JSON.stringify(await uiToolHandlers.apply_experiment_data(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'run_experiment',
    description: 'Run the experiment with current data. Only works on the experiment page. Returns the result after completion.',
    type: 'function',
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.run_experiment({})),
  } as DistriFnTool,

  {
    name: 'evaluate_experiment_results',
    description: 'Compare original vs new experiment results. Returns both outputs side-by-side with calculated metrics (cost, tokens) and percentage changes. Use after run_experiment to analyze improvements.',
    type: 'function',
    parameters: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(await uiToolHandlers.evaluate_experiment_results({})),
  } as DistriFnTool,
];
