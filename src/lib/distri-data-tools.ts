/**
 * Distri Data Tool Handlers
 *
 * These tools fetch data from the vLLora backend.
 * All tools use external = ["*"], meaning they are handled here in the frontend.
 *
 * These tools REUSE existing vLLora API services to ensure consistency
 * with the UI and avoid code duplication.
 *
 * Existing services used:
 * - @/services/runs-api.ts   -> listRuns, getRunDetails
 * - @/services/spans-api.ts  -> listSpans
 * - @/services/groups-api.ts -> listGroups
 *
 * IMPORTANT: API services use different field naming conventions:
 * - runs-api.ts uses snake_case: thread_ids, run_ids, model_name
 * - spans-api.ts uses camelCase: threadIds, runIds, operationNames
 * - groups-api.ts uses snake_case: thread_ids, group_by, bucket_size
 *
 * TWO-PHASE ANALYSIS:
 * To avoid LLM context overflow when analyzing many spans:
 * 1. fetch_spans_summary - Fetches ALL spans, stores in memory, returns lightweight summary
 * 2. get_span_content - Retrieves specific spans by ID for deep analysis
 */

import { DistriFnTool } from '@distri/core';
import { listRuns, getRunDetails, type ListRunsQuery } from '@/services/runs-api';
import { listSpans, type ListSpansQuery, type Span } from '@/services/spans-api';
import { listGroups, type ListGroupsQuery } from '@/services/groups-api';
import { listLabels } from '@/services/labels-api';

// Data tool names (7 tools - 4 original + 2 two-phase analysis + 1 label discovery)
export const DATA_TOOL_NAMES = [
  'fetch_runs',
  'fetch_spans',
  'get_run_details',
  'fetch_groups',
  'fetch_spans_summary',
  'get_span_content',
  'list_labels',
] as const;

// ============================================================================
// Span Storage for Two-Phase Analysis
// ============================================================================

// In-memory storage for spans (cleared when page refreshes)
const spanStorage: Map<string, Span> = new Map();

// Common error patterns to detect semantic errors in responses
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

/**
 * Check if a string contains potential error patterns
 */
function containsErrorPattern(text: string | undefined | null): string | null {
  if (!text) return null;
  const textStr = typeof text === 'string' ? text : JSON.stringify(text);
  for (const pattern of ERROR_PATTERNS) {
    const match = textStr.match(pattern);
    if (match) {
      // Return a snippet around the match
      const idx = textStr.toLowerCase().indexOf(match[0].toLowerCase());
      const start = Math.max(0, idx - 30);
      const end = Math.min(textStr.length, idx + match[0].length + 30);
      return '...' + textStr.slice(start, end) + '...';
    }
  }
  return null;
}

/**
 * Perform deep semantic analysis on a span (client-side)
 * Returns analysis results, NOT raw span data
 */
function analyzeSpanDeep(span: Span): {
  span_id: string;
  operation_name: string;
  duration_ms: number;
  model?: string;
  // Analysis results (not raw data)
  explicit_error?: string;
  semantic_issues: Array<{
    pattern: string;
    context: string;  // 200 chars around the match
    severity: 'high' | 'medium' | 'low';
  }>;
  content_stats: {
    input_length: number;
    output_length: number;
    has_tool_calls: boolean;
  };
  assessment: string;  // Brief client-side assessment
} {
  const attr = (span.attribute || {}) as Record<string, any>;
  const duration_ms = span.finish_time_us && span.start_time_us
    ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
    : 0;

  // Get content for analysis
  const inputStr = typeof attr.input === 'string' ? attr.input : JSON.stringify(attr.input || '');
  const outputStr = typeof attr.output === 'string' ? attr.output :
    (typeof attr.response === 'string' ? attr.response : JSON.stringify(attr.output || attr.response || ''));

  // Detect semantic issues with severity
  const semanticIssues: Array<{ pattern: string; context: string; severity: 'high' | 'medium' | 'low' }> = [];

  const highSeverityPatterns = [/error:/i, /exception/i, /failed to/i, /unauthorized/i, /forbidden/i];
  const mediumSeverityPatterns = [/not found/i, /does not exist/i, /cannot be found/i, /timeout/i, /rate limit/i];
  const lowSeverityPatterns = [/invalid/i, /missing/i, /undefined/i, /null/i];

  const checkPatterns = (patterns: RegExp[], severity: 'high' | 'medium' | 'low') => {
    for (const pattern of patterns) {
      const match = outputStr.match(pattern);
      if (match) {
        const idx = outputStr.toLowerCase().indexOf(match[0].toLowerCase());
        const start = Math.max(0, idx - 100);
        const end = Math.min(outputStr.length, idx + match[0].length + 100);
        semanticIssues.push({
          pattern: match[0],
          context: outputStr.slice(start, end),
          severity,
        });
      }
    }
  };

  checkPatterns(highSeverityPatterns, 'high');
  checkPatterns(mediumSeverityPatterns, 'medium');
  checkPatterns(lowSeverityPatterns, 'low');

  // Check for tool calls
  const hasToolCalls = !!(attr.tool_calls || attr.function_call);

  // Generate client-side assessment
  let assessment = 'No issues detected.';
  if (attr.error) {
    assessment = `Explicit error: ${attr.error}`;
  } else if (semanticIssues.length > 0) {
    const highCount = semanticIssues.filter(i => i.severity === 'high').length;
    const mediumCount = semanticIssues.filter(i => i.severity === 'medium').length;
    assessment = `Found ${semanticIssues.length} potential issues: ${highCount} high, ${mediumCount} medium severity.`;
  } else if (outputStr.length === 0) {
    assessment = 'Warning: Empty output response.';
  }

  return {
    span_id: span.span_id,
    operation_name: span.operation_name,
    duration_ms,
    model: (attr.model_name || attr.model?.name) as string | undefined,
    explicit_error: attr.error as string | undefined,
    semantic_issues: semanticIssues,
    content_stats: {
      input_length: inputStr.length,
      output_length: outputStr.length,
      has_tool_calls: hasToolCalls,
    },
    assessment,
  };
}

/**
 * Extract key info from a span for summary
 * Uses 'any' type for attribute access since spans have dynamic fields
 */
function extractSpanSummary(span: Span): {
  id: string;
  operation: string;
  duration_ms: number;
  status: string;
  has_error: boolean;
  error_message?: string;
  semantic_error?: string;
  model?: string;
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
} {
  // Cast to any for dynamic field access (spans have varying attribute structures)
  const attr = (span.attribute || {}) as Record<string, any>;
  const duration_ms = span.finish_time_us && span.start_time_us
    ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
    : 0;

  // Check for explicit errors
  const hasError = !!(attr.error || attr.status_code >= 400 || attr.status === 'error');
  const errorMessage = attr.error as string | undefined;

  // Check for semantic errors in output/response
  const output = attr.output || attr.response || attr.content;
  const semanticError = containsErrorPattern(output as string);

  return {
    id: span.span_id,
    operation: span.operation_name,
    duration_ms,
    status: hasError ? 'error' : 'success',
    has_error: hasError,
    error_message: errorMessage,
    semantic_error: semanticError || undefined,
    model: (attr.model_name || attr.model || attr.model?.name) as string | undefined,
    cost: attr.cost as number | undefined,
    input_tokens: (attr.usage?.input_tokens || attr.input_tokens) as number | undefined,
    output_tokens: (attr.usage?.output_tokens || attr.output_tokens) as number | undefined,
  };
}

export type DataToolName = (typeof DATA_TOOL_NAMES)[number];

import { listProjects } from '@/services/projects-api';

// Cache for the default project ID
let cachedDefaultProjectId: string | null = null;

/**
 * Get current project ID from URL, localStorage, or fetch from API
 * Priority: URL params > localStorage > cached default > fetch default
 */
async function getCurrentProjectId(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot get project ID in server context');
  }

  // First try URL params
  const params = new URLSearchParams(window.location.search);
  const urlProjectId = params.get('project_id') || params.get('projectId');
  if (urlProjectId) return urlProjectId;

  // Then try localStorage (set by ProjectDropdown when user selects a project)
  const storedProjectId = localStorage.getItem('currentProjectId');
  if (storedProjectId) return storedProjectId;

  // Use cached default if available
  if (cachedDefaultProjectId) return cachedDefaultProjectId;

  // Fetch default project from API
  try {
    const projects = await listProjects();
    const defaultProject = projects.find(p => p.is_default) || projects[0];
    if (defaultProject) {
      cachedDefaultProjectId = defaultProject.id;
      // Also cache in localStorage for next time
      localStorage.setItem('currentProjectId', defaultProject.id);
      return defaultProject.id;
    }
  } catch (error) {
    console.error('[distri-data-tools] Failed to fetch default project:', error);
  }

  throw new Error('No project ID available. Please select a project or add project_id to URL.');
}

/**
 * Helper to convert array to comma-separated string (API format)
 */
function toCommaSeparated(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join(',') : value;
}

// ============================================================================
// Data Tool Handlers
// ============================================================================

export const dataToolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  /**
   * Fetch runs with filtering
   * Reuses: @/services/runs-api.ts -> listRuns
   *
   * @param threadIds - Filter by thread IDs (string or array)
   * @param runIds - Filter by run IDs (string or array)
   * @param modelName - Filter by model name
   * @param limit - Max results (default: 50)
   * @param offset - Pagination offset
   * @param period - Time filter: 'last_hour', 'last_day', 'last_week', etc.
   * @param projectId - Project ID (defaults to current)
   */
  fetch_runs: async (params) => {
    try {
      const projectId = (params.projectId as string) || await getCurrentProjectId();

      const query: ListRunsQuery = {};

      // Convert agent params (camelCase) to API params (snake_case for runs-api)
      if (params.threadIds) query.thread_ids = toCommaSeparated(params.threadIds as string | string[]);
      if (params.runIds) query.run_ids = toCommaSeparated(params.runIds as string | string[]);
      if (params.modelName) query.model_name = params.modelName as string;
      if (params.limit) query.limit = params.limit as number;
      if (params.offset) query.offset = params.offset as number;
      if (params.period) query.period = params.period as ListRunsQuery['period'];

      const result = await listRuns({ projectId, params: query });

      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch runs',
      };
    }
  },

  /**
   * Fetch spans with filtering
   * Reuses: @/services/spans-api.ts -> listSpans
   *
   * @param threadIds - Filter by thread IDs (string or array)
   * @param runIds - Filter by run IDs (string or array)
   * @param operationNames - Filter by operation types (string or array)
   * @param parentSpanIds - Filter by parent span IDs (string or array)
   * @param labels - Filter by labels (string or array) - filters by attribute.label
   * @param limit - Max results (default: 10, to prevent context overflow)
   * @param offset - Pagination offset
   * @param projectId - Project ID (defaults to current)
   */
  fetch_spans: async (params) => {
    try {
      const projectId = (params.projectId as string) || await getCurrentProjectId();

      const query: ListSpansQuery = {};

      // spans-api uses camelCase, just pass through with conversion
      if (params.threadIds) query.threadIds = toCommaSeparated(params.threadIds as string | string[]);
      if (params.runIds) query.runIds = toCommaSeparated(params.runIds as string | string[]);
      if (params.operationNames) query.operationNames = toCommaSeparated(params.operationNames as string | string[]);
      if (params.parentSpanIds) query.parentSpanIds = toCommaSeparated(params.parentSpanIds as string | string[]);
      if (params.labels) query.labels = toCommaSeparated(params.labels as string | string[]);
      // Default limit to 10 to prevent context overflow (spans can contain large payloads ~9KB each)
      query.limit = (params.limit as number) || 10;
      if (params.offset) query.offset = params.offset as number;

      const result = await listSpans({ projectId, params: query });

      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
        _note: result.pagination && result.pagination.total > query.limit
          ? `Showing ${query.limit} of ${result.pagination.total} spans. Use limit/offset for more.`
          : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch spans',
      };
    }
  },

  /**
   * Get detailed information about a specific run
   * Reuses: @/services/runs-api.ts -> getRunDetails
   *
   * @param runId - Required: The run ID to fetch details for
   * @param projectId - Project ID (defaults to current)
   */
  get_run_details: async (params) => {
    try {
      const runId = params.runId as string;
      if (!runId) {
        return { success: false, error: 'runId is required' };
      }

      const projectId = (params.projectId as string) || await getCurrentProjectId();
      const result = await getRunDetails({ runId, projectId });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch run details',
      };
    }
  },

  /**
   * Fetch aggregated groups
   * Reuses: @/services/groups-api.ts -> listGroups
   *
   * @param groupBy - 'time' | 'thread' | 'run' (default: 'time')
   * @param threadIds - Filter by thread IDs (string or array)
   * @param modelName - Filter by model name
   * @param bucketSize - Time bucket size in seconds (for groupBy='time')
   * @param limit - Max results
   * @param offset - Pagination offset
   * @param projectId - Project ID (defaults to current)
   */
  fetch_groups: async (params) => {
    try {
      const projectId = (params.projectId as string) || await getCurrentProjectId();

      const query: ListGroupsQuery = {};

      // Convert agent params (camelCase) to API params (snake_case for groups-api)
      if (params.groupBy) query.group_by = params.groupBy as 'time' | 'thread' | 'run';
      if (params.threadIds) query.thread_ids = toCommaSeparated(params.threadIds as string | string[]);
      if (params.modelName) query.model_name = params.modelName as string;
      if (params.bucketSize) query.bucket_size = params.bucketSize as number;
      if (params.limit) query.limit = params.limit as number;
      if (params.offset) query.offset = params.offset as number;

      const result = await listGroups({ projectId, params: query });

      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch groups',
      };
    }
  },

  // ============================================================================
  // TWO-PHASE ANALYSIS TOOLS
  // These tools solve the LLM context overflow problem:
  // 1. fetch_spans_summary - Fetches ALL spans, stores in memory, returns lightweight summary
  // 2. get_span_content - Retrieves specific spans by ID for semantic analysis
  // ============================================================================

  /**
   * Fetch ALL spans for a thread, store in memory, return lightweight summary
   * This solves context overflow by:
   * 1. Fetching all spans internally (paginated)
   * 2. Storing full span data in browser memory
   * 3. Returning only summary stats + flagged spans to the LLM
   *
   * @param threadIds - Filter by thread IDs (required)
   * @param runIds - Filter by run IDs (optional)
   * @param labels - Filter by labels (optional) - filters by attribute.label
   * @param projectId - Project ID (defaults to current)
   */
  fetch_spans_summary: async (params) => {
    try {
      const projectId = (params.projectId as string) || await getCurrentProjectId();

      // Validate required params
      if (!params.threadIds && !params.runIds) {
        return { success: false, error: 'threadIds or runIds is required' };
      }

      const query: ListSpansQuery = {};
      if (params.threadIds) query.threadIds = toCommaSeparated(params.threadIds as string | string[]);
      if (params.runIds) query.runIds = toCommaSeparated(params.runIds as string | string[]);
      if (params.labels) query.labels = toCommaSeparated(params.labels as string | string[]);

      // Fetch ALL spans with PARALLEL pagination (internal, not exposed to LLM)
      const batchSize = 100;

      // First call to get total count
      const firstResult = await listSpans({
        projectId,
        params: { ...query, limit: batchSize, offset: 0 },
      });

      const allSpans: Span[] = [...firstResult.data];
      const total = firstResult.pagination?.total || allSpans.length;

      // If more spans exist, fetch remaining batches in parallel
      if (total > batchSize) {
        const remainingBatches = Math.ceil((total - batchSize) / batchSize);
        const batchPromises: Promise<Span[]>[] = [];

        for (let i = 1; i <= remainingBatches; i++) {
          const offset = i * batchSize;
          batchPromises.push(
            listSpans({
              projectId,
              params: { ...query, limit: batchSize, offset },
            }).then(result => result.data)
          );
        }

        // Wait for all parallel requests
        const batchResults = await Promise.all(batchPromises);
        for (const batch of batchResults) {
          allSpans.push(...batch);
        }
      }

      // Store all spans in memory for later retrieval
      spanStorage.clear();
      for (const span of allSpans) {
        spanStorage.set(span.span_id, span);
      }

      // Generate summary for each span
      const spanSummaries = allSpans.map(extractSpanSummary);

      // Aggregate statistics
      const stats = {
        total: allSpans.length,
        by_operation: {} as Record<string, number>,
        by_status: { success: 0, error: 0 },
        total_duration_ms: 0,
        total_cost: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        models_used: new Set<string>(),
      };

      for (const summary of spanSummaries) {
        // Count by operation
        stats.by_operation[summary.operation] = (stats.by_operation[summary.operation] || 0) + 1;

        // Count by status
        if (summary.has_error) {
          stats.by_status.error++;
        } else {
          stats.by_status.success++;
        }

        // Accumulate totals
        stats.total_duration_ms += summary.duration_ms;
        stats.total_cost += summary.cost || 0;
        stats.total_input_tokens += summary.input_tokens || 0;
        stats.total_output_tokens += summary.output_tokens || 0;

        if (summary.model) {
          stats.models_used.add(summary.model);
        }
      }

      // Find error spans (explicit errors)
      const errorSpans = spanSummaries.filter(s => s.has_error);

      // Find spans with potential semantic errors (detected by patterns)
      const semanticErrorSpans = spanSummaries.filter(s => s.semantic_error);

      // Find slowest spans (top 5)
      const slowestSpans = [...spanSummaries]
        .sort((a, b) => b.duration_ms - a.duration_ms)
        .slice(0, 5);

      // Find most expensive spans (top 5)
      const expensiveSpans = [...spanSummaries]
        .filter(s => s.cost && s.cost > 0)
        .sort((a, b) => (b.cost || 0) - (a.cost || 0))
        .slice(0, 5);

      return {
        success: true,
        summary: {
          total_spans: stats.total,
          by_operation: stats.by_operation,
          by_status: stats.by_status,
          total_duration_ms: stats.total_duration_ms,
          total_cost: Math.round(stats.total_cost * 10000) / 10000, // Round to 4 decimals
          total_input_tokens: stats.total_input_tokens,
          total_output_tokens: stats.total_output_tokens,
          models_used: Array.from(stats.models_used),
        },
        error_spans: errorSpans.map(s => ({
          span_id: s.id,
          operation: s.operation,
          error_message: s.error_message,
        })),
        semantic_error_spans: semanticErrorSpans.map(s => ({
          span_id: s.id,
          operation: s.operation,
          detected_pattern: s.semantic_error,
        })),
        slowest_spans: slowestSpans.map(s => ({
          span_id: s.id,
          operation: s.operation,
          duration_ms: s.duration_ms,
        })),
        expensive_spans: expensiveSpans.map(s => ({
          span_id: s.id,
          operation: s.operation,
          cost: s.cost,
          model: s.model,
        })),
        _note: 'Full span data stored in memory. Use get_span_content with span_ids to retrieve specific spans for deep analysis.',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch spans summary',
      };
    }
  },

  /**
   * Retrieve specific spans by ID for deep semantic analysis
   * This retrieves from in-memory storage (populated by fetch_spans_summary)
   *
   * @param spanIds - Array of span IDs to retrieve (required, max 5 to prevent context overflow)
   */
  get_span_content: async (params) => {
    try {
      const spanIds = params.spanIds as string | string[];
      if (!spanIds) {
        return { success: false, error: 'spanIds is required' };
      }

      const ids = Array.isArray(spanIds) ? spanIds : [spanIds];

      // Limit to 5 spans to prevent context overflow
      if (ids.length > 5) {
        return {
          success: false,
          error: 'Maximum 5 spans can be retrieved at once. Please reduce the number of span_ids.',
        };
      }

      // Check if storage has data
      if (spanStorage.size === 0) {
        return {
          success: false,
          error: 'No spans in memory. Call fetch_spans_summary first to load spans.',
        };
      }

      // Perform client-side deep analysis on requested spans
      // Returns analysis RESULTS, not raw span data
      const analysisResults: ReturnType<typeof analyzeSpanDeep>[] = [];
      const notFound: string[] = [];

      for (const id of ids) {
        const span = spanStorage.get(id);
        if (span) {
          // Analyze span client-side, return only results
          analysisResults.push(analyzeSpanDeep(span));
        } else {
          notFound.push(id);
        }
      }

      return {
        success: true,
        data: analysisResults,
        not_found: notFound.length > 0 ? notFound : undefined,
        _note: `Analyzed ${analysisResults.length} spans client-side. Results include: semantic_issues (with severity), content_stats, and assessment. Raw span data NOT included.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get span content',
      };
    }
  },

  // ============================================================================
  // LABEL DATA TOOLS
  // ============================================================================

  /**
   * List available labels with counts
   * Reuses: @/services/labels-api.ts -> listLabels
   *
   * @param threadId - Filter to labels within a specific thread (optional)
   * @param limit - Maximum number of labels to return (default: 100)
   * @param projectId - Project ID (defaults to current)
   */
  list_labels: async (params) => {
    try {
      const projectId = (params.projectId as string) || await getCurrentProjectId();

      const result = await listLabels({
        projectId,
        params: {
          threadId: params.threadId as string | undefined,
          limit: (params.limit as number) || 100,
        },
      });

      return {
        success: true,
        data: result.labels,
        total: result.labels.length,
        _note: params.threadId
          ? `Labels found in thread ${params.threadId}`
          : 'Labels found across entire project',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list labels',
      };
    }
  },
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

/**
 * Data tools in DistriFnTool format for use with @distri/react Chat component
 */
export const dataTools: DistriFnTool[] = [
  {
    name: 'fetch_runs',
    description: 'Fetch a list of runs with optional filtering by thread, run IDs, model, or time period',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by thread IDs',
        },
        runIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by run IDs',
        },
        modelName: { type: 'string', description: 'Filter by model name' },
        limit: { type: 'number', description: 'Maximum number of results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        period: {
          type: 'string',
          enum: ['last_hour', 'last_day', 'last_week', 'last_month'],
          description: 'Time period filter',
        },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_runs(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'fetch_spans',
    description: 'Fetch spans with optional filtering by thread, run, operation type, parent span, or labels. Returns max 10 spans by default.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by thread IDs',
        },
        runIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by run IDs',
        },
        operationNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by operation names (e.g., llm_call, tool_call)',
        },
        parentSpanIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by parent span IDs',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by labels (attribute.label). E.g., ["flight_search", "budget_agent"]',
        },
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
        groupBy: {
          type: 'string',
          enum: ['time', 'thread', 'run'],
          description: 'How to group the results (default: time)',
        },
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by thread IDs',
        },
        modelName: { type: 'string', description: 'Filter by model name' },
        bucketSize: { type: 'number', description: 'Time bucket size in seconds (for groupBy=time)' },
        limit: { type: 'number', description: 'Maximum number of results' },
        offset: { type: 'number', description: 'Pagination offset' },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_groups(input as Record<string, unknown>)),
  } as DistriFnTool,

  // ============================================================================
  // TWO-PHASE ANALYSIS TOOLS
  // ============================================================================

  {
    name: 'fetch_spans_summary',
    description: 'Fetch ALL spans for a thread, analyze them, and return a lightweight summary. Full span data is stored in memory for later retrieval with get_span_content. Use this instead of fetch_spans when you need to analyze many spans. Supports label filtering.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by thread IDs (required if runIds not provided)',
        },
        runIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by run IDs (required if threadIds not provided)',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by labels (attribute.label). E.g., ["flight_search", "budget_agent"]',
        },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.fetch_spans_summary(input as Record<string, unknown>)),
  } as DistriFnTool,

  {
    name: 'get_span_content',
    description: 'Perform deep client-side analysis on specific spans and return ANALYSIS RESULTS (not raw data). Must call fetch_spans_summary first. Returns: semantic_issues (pattern, context, severity), content_stats, and assessment for each span.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Span IDs to analyze (max 5 at a time)',
        },
      },
      required: ['spanIds'],
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.get_span_content(input as Record<string, unknown>)),
  } as DistriFnTool,

  // ============================================================================
  // LABEL DATA TOOLS (fetch label information)
  // ============================================================================

  {
    name: 'list_labels',
    description: 'List available labels with their counts. Use this to discover what labels exist in the project or a specific thread before filtering.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Filter to labels within a specific thread (optional). If not provided, returns all labels in the project.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of labels to return (default: 100)',
        },
        projectId: { type: 'string', description: 'Project ID (defaults to current)' },
      },
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.list_labels(input as Record<string, unknown>)),
  } as DistriFnTool,
];
