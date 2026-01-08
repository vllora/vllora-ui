import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';

// ============================================================================
// Distri Agent Event Types
// ============================================================================

// GET STATE tool request/response events
// Using relaxed types for responses since actual data shapes vary
type DistriGetStateEvents = {
  // get_collapsed_spans
  vllora_get_collapsed_spans: Record<string, never>;
  vllora_collapsed_spans_response: Record<string, unknown>;

  // get_experiment_data (experiment page only)
  vllora_get_experiment_data: Record<string, never>;
  vllora_experiment_data_response: Record<string, unknown>;

  // evaluate_experiment_results (experiment page only)
  vllora_evaluate_experiment_results: Record<string, never>;
  vllora_evaluate_experiment_results_response: Record<string, unknown>;
};

// CHANGE UI tool events (fire-and-forget)
type DistriChangeUiEvents = {
  vllora_navigate_to: { url: string };
  vllora_navigate_to_experiment: { spanId: string; url: string };

  // Experiment page tools
  vllora_apply_experiment_data: { data: Record<string, unknown> };
  vllora_apply_experiment_data_response: { success: boolean; error?: string };
  vllora_run_experiment: Record<string, never>;
  vllora_run_experiment_response: { success: boolean; result?: unknown; error?: string };

  // Label filter tool
  vllora_apply_label_filter: { labels: string[]; action: string; view?: string };
};

// ============================================================================
// Open Traces State Events (for agent panel)
// ============================================================================

export type OpenTrace = { run_id: string; tab: string };

type OpenTracesEvents = {
  // Emitted by ChatWindowContext and TracesPageContext when openTraces changes
  vllora_open_traces_changed: { openTraces: OpenTrace[]; source: 'threads' | 'traces' };
  // Emitted when hoverSpanId changes
  vllora_hover_span_changed: { hoverSpanId: string | undefined; source: 'threads' | 'traces' };
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

type Events = VlloraEvents & DistriGetStateEvents & DistriChangeUiEvents & OpenTracesEvents;

export const emitter: Emitter<Events> = mitt<Events>();

// Alias for consistency with distri tools
export const eventEmitter = emitter;

// Export types for use in tool handlers
export type { DistriGetStateEvents, DistriChangeUiEvents };
