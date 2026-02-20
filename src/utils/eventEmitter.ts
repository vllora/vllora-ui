import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';
import type { DryRunJob } from '@/types/dry-run-job';

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
  // Finetune job events
  vllora_finetune_job_created: { jobId?: string; backendDatasetId: string };
  // Dry run job events
  vllora_dry_run_job_update: { jobId: string; job: DryRunJob };
  // Lucy assistant prompt trigger (from UI actions like "Generate for topic")
  vllora_lucy_prompt: { prompt: string };
  // Knowledge source events
  vllora_knowledge_source_updated: {
    datasetId: string;
    sourceId?: string;
    progress?: {
      step: string;
      current?: number;
      total?: number;
      percent?: number;
    };
  };
  // plan execution progress
  vllora_plan_progress: { progress: import('@/lib/distri-finetune-tools/steps/execute-plan').ExecutionProgress };
  // plan generation started (show loading in right panel and open plan preview state)
  vllora_plan_generating: { datasetId: string; switchToReadme?: boolean };
  // plan proposed (for displaying in right panel)
  vllora_plan_proposed: {
    datasetId: string;
    plan: unknown;
    diff?: import('@/components/datasets/plan-section/plan-markdown-utils').PlanDiff;
  };
  // plan dismissed (user closed the card without approving)
  vllora_plan_dismissed: { datasetId: string };
  // plan approved (user approved, triggers execution)
  vllora_plan_approved: { datasetId: string; plan: unknown };
  // Workflow updated (triggers refresh in UI)
  vllora_workflow_updated: { datasetId: string };
  // Data generation progress (for showing loading state in Records tab)
  vllora_data_generation_progress: {
    datasetId: string;
    status: 'started' | 'progress' | 'completed' | 'failed';
    total: number;
    completed: number;
    currentBatch?: number;
    totalBatches?: number;
    /** Current topic being generated (for showing loading indicator) */
    currentTopic?: string;
    /** Records completed for current topic */
    topicCompleted?: number;
    /** Total records to generate for current topic */
    topicTotal?: number;
    error?: string;
  };
  // Switch to a specific tab during execution
  vllora_switch_tab: {
    datasetId: string;
    tab: 'overview' | 'records' | 'evaluator' | 'jobs' | 'deploy';
  };
  // Open a drawer (docs or readme) from non-React code
  vllora_open_drawer: {
    type: 'docs' | 'readme';
  };
  // Docs are still processing — UI should auto-prompt Lucy when they're done
  vllora_docs_awaiting_plan: { datasetId: string };
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
