import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';

// ============================================================================
// Distri Agent Event Types
// ============================================================================

// GET STATE tool request/response events
// Using relaxed types for responses since actual data shapes vary
type DistriGetStateEvents = {
  // get_current_view
  vllora_get_current_view: Record<string, never>;
  vllora_current_view_response: Record<string, unknown>;

  // get_selection_context
  vllora_get_selection_context: Record<string, never>;
  vllora_selection_context_response: Record<string, unknown>;

  // get_thread_runs
  vllora_get_thread_runs: Record<string, never>;
  vllora_thread_runs_response: Record<string, unknown>;

  // get_span_details
  vllora_get_span_details: Record<string, never>;
  vllora_span_details_response: Record<string, unknown>;

  // get_collapsed_spans
  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: Record<string, unknown>;
};

// CHANGE UI tool events (fire-and-forget)
type DistriChangeUiEvents = {
  vllora_select_span: { spanId: string };
  vllora_select_run: { runId: string };
  vllora_expand_span: { spanId: string };
  vllora_collapse_span: { spanId: string };
  vllora_navigate_to_experiment: { spanId: string; url: string };
  // open_modal and close_modal use global ModalContext functions directly
};

// ============================================================================
// Existing vLLora Events
// ============================================================================

type VlloraEvents = {
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
};

// ============================================================================
// Combined Events Type
// ============================================================================

type Events = VlloraEvents & DistriGetStateEvents & DistriChangeUiEvents;

export const emitter: Emitter<Events> = mitt<Events>();

// Alias for consistency with distri tools
export const eventEmitter = emitter;

// Export types for use in tool handlers
export type { DistriGetStateEvents, DistriChangeUiEvents };
