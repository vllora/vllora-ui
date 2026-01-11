/**
 * Distri Data Tool Handlers
 *
 * These tools fetch data from the vLLora backend.
 * All tools use external = ["*"], meaning they are handled here in the frontend.
 *
 * THREE-PHASE ANALYSIS:
 * To avoid LLM context overflow when analyzing many spans:
 * 1. fetch_spans_summary - Fetches ALL spans, stores in memory, returns lightweight summary
 * 2. get_span_content - Retrieves specific spans by ID for deep analysis
 * 3. analyze_with_llm - Uses LLM for semantic analysis beyond regex patterns
 */

import { DistriFnTool } from '@distri/core';

// Tool handlers
import { fetchRuns } from './fetch-runs';
import { fetchSpans } from './fetch-spans';
import { getRunDetails } from './get-run-details';
import { fetchGroups } from './fetch-groups';
import { listLabels } from './list-labels';
import { fetchSpansSummary, spanStorage } from './fetch-spans-summary';
import { getSpanContent } from './get-span-content';
import { analyzeWithLLM } from './analyze-with-llm';

// Data tool names (8 tools)
export const DATA_TOOL_NAMES = [
  'fetch_runs',
  'fetch_spans',
  'get_run_details',
  'fetch_groups',
  'fetch_spans_summary',
  'get_span_content',
  'list_labels',
  'analyze_with_llm',
] as const;

export type DataToolName = (typeof DATA_TOOL_NAMES)[number];

// ============================================================================
// Data Tool Handlers
// ============================================================================

export const dataToolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  fetch_runs: fetchRuns,
  fetch_spans: fetchSpans,
  get_run_details: getRunDetails,
  fetch_groups: fetchGroups,
  fetch_spans_summary: fetchSpansSummary,
  get_span_content: (params) => getSpanContent(params, spanStorage),
  list_labels: listLabels,
  analyze_with_llm: (params) => analyzeWithLLM(params, spanStorage),
};

/**
 * Check if a tool name is a Data tool (fetches/analyzes data)
 */
export function isDataTool(toolName: string): toolName is DataToolName {
  return DATA_TOOL_NAMES.includes(toolName as DataToolName);
}

/**
 * Execute a Data tool by name
 */
export async function executeDataTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const handler = dataToolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown Data tool: ${toolName}`);
  }
  return handler(params);
}

// ============================================================================
// DistriFnTool[] format for Chat component
// ============================================================================

export const dataTools: DistriFnTool[] = [
  {
    name: 'fetch_runs',
    description: 'Fetch a list of runs with optional filtering by thread, run IDs, model, or time period',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadIds: { type: 'array', items: { type: 'string' }, description: 'Filter by thread IDs' },
        runIds: { type: 'array', items: { type: 'string' }, description: 'Filter by run IDs' },
        modelName: { type: 'string', description: 'Filter by model name' },
        limit: { type: 'number', description: 'Maximum number of results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        period: { type: 'string', enum: ['last_hour', 'last_day', 'last_week', 'last_month'], description: 'Time period filter' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_runs(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'fetch_spans',
    description: 'Fetch RAW span data. Use ONLY for metadata queries on 1-3 specific spans. WARNING: Returns full span objects - causes context overflow if used for content analysis. Use fetch_spans_summary + get_span_content instead.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanIds: { type: 'array', items: { type: 'string' }, description: 'Filter by span IDs' },
        threadIds: { type: 'array', items: { type: 'string' }, description: 'Filter by thread IDs' },
        runIds: { type: 'array', items: { type: 'string' }, description: 'Filter by run IDs' },
        operationNames: { type: 'array', items: { type: 'string' }, description: 'Filter by operation names' },
        parentSpanIds: { type: 'array', items: { type: 'string' }, description: 'Filter by parent span IDs' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Filter by labels' },
        limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
        offset: { type: 'number', description: 'Pagination offset' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_spans(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'get_run_details',
    description: 'Get detailed information about a specific run including all its spans',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'The run ID to fetch details for' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
      required: ['runId'],
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.get_run_details(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'fetch_groups',
    description: 'Fetch aggregated groups by time, thread, or run',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: ['time', 'thread', 'run'], description: 'How to group the results (default: time)' },
        threadIds: { type: 'array', items: { type: 'string' }, description: 'Filter by thread IDs' },
        modelName: { type: 'string', description: 'Filter by model name' },
        bucketSize: { type: 'number', description: 'Time bucket size in seconds (for groupBy=time)' },
        limit: { type: 'number', description: 'Maximum number of results' },
        offset: { type: 'number', description: 'Pagination offset' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_groups(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'fetch_spans_summary',
    description: 'PREFERRED for analysis. Phase 1: Fetches ALL spans, stores in memory, returns lightweight summary. Use with get_span_content for deep analysis. Context-efficient.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadIds: { type: 'array', items: { type: 'string' }, description: 'Filter by thread IDs (required if runIds not provided)' },
        runIds: { type: 'array', items: { type: 'string' }, description: 'Filter by run IDs (required if threadIds not provided)' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Filter by labels' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_spans_summary(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'get_span_content',
    description: 'Phase 2: Fetches RAW cached spans from memory (requires fetch_spans_summary first). Returns raw span objects. Max 5 spans per call.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanIds: { type: 'array', items: { type: 'string' }, description: 'Span IDs to analyze (max 5)' },
      },
      required: ['spanIds'],
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.get_span_content(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'list_labels',
    description: 'List available labels with counts. Use to discover labels before filtering.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Filter to labels within a specific thread (optional)' },
        limit: { type: 'number', description: 'Maximum number of labels (default: 100)' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.list_labels(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'analyze_with_llm',
    description: 'Phase 3: Deep LLM analysis of flagged spans. Auto-batches spanIds (5 per batch, capped) to avoid context overflow.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanIds: { type: 'array', items: { type: 'string' }, description: 'Span IDs to analyze (auto-batched; caps apply)' },
        focus: { type: 'string', enum: ['errors', 'performance', 'semantic', 'all'], description: 'Focus area (default: all)' },
        context: { type: 'string', description: 'Additional context about what to look for' },
      },
      required: ['spanIds'],
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.analyze_with_llm(input as Record<string, unknown>)),
  } as DistriFnTool,
];

// Re-export individual handlers for direct use
export { fetchRuns } from './fetch-runs';
export { fetchSpans } from './fetch-spans';
export { getRunDetails } from './get-run-details';
export { fetchGroups } from './fetch-groups';
export { listLabels } from './list-labels';
export { fetchSpansSummary, spanStorage } from './fetch-spans-summary';
export { getSpanContent } from './get-span-content';
export { analyzeWithLLM } from './analyze-with-llm';
