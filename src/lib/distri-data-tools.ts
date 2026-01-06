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
import { analyzeWithLLM } from '@/lib/analyze-with-llm';

// Data tool names (8 tools - 4 original + 2 two-phase analysis + 1 label discovery + 1 hybrid LLM)
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
  // Tool execution errors
  /unknown tool/i,
  /tool .* not found/i,
  /unrecognized function/i,
  /function .* does not exist/i,
  // Hidden/subtle errors (for silent failures)
  /could not find/i,
  /could not locate/i,
  /could not retrieve/i,
  /empty results/i,
  /no results/i,
  /service unavailable/i,
  /checksum mismatch/i,
  /may be corrupted/i,
  /may be outdated/i,
  /cached fallback/i,
  /stale cache/i,
  /degraded/i,
  /truncated/i,
  /partial.success/i,
  /quality.*(low|poor)/i,
  /confidence.*(low|below)/i,
  /cannot be verified/i,
  /unverified/i,
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

// Contradictory instruction patterns to detect in system prompts
const CONTRADICTION_PAIRS = [
  { a: /must use tools/i, b: /answer directly|from your knowledge/i, desc: '"MUST use tools" vs "answer directly"' },
  { a: /at least \d+ times/i, b: /minimize.*calls|be efficient/i, desc: '"at least N times" vs "minimize calls"' },
  { a: /always/i, b: /never/i, desc: '"always" vs "never" directives' },
  { a: /json object/i, b: /plain text/i, desc: '"JSON object" vs "plain text" format' },
  { a: /include citations/i, b: /without citations|brief/i, desc: '"include citations" vs "without citations"' },
];

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
    source?: 'output' | 'input' | 'system_prompt';
  }>;
  prompt_issues: Array<{
    issue: string;
    severity: 'high' | 'medium';
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
  const semanticIssues: Array<{ pattern: string; context: string; severity: 'high' | 'medium' | 'low'; source?: 'output' | 'input' | 'system_prompt' }> = [];
  const promptIssues: Array<{ issue: string; severity: 'high' | 'medium' }> = [];

  // High severity: tool execution errors, explicit errors
  const highSeverityPatterns = [
    /error:/i, /exception/i, /failed to/i, /unauthorized/i, /forbidden/i,
    /unknown tool/i, /tool .* not found/i, /unrecognized function/i,
  ];
  // Medium severity: not found, timeouts
  const mediumSeverityPatterns = [/not found/i, /does not exist/i, /cannot be found/i, /timeout/i, /rate limit/i];
  // Low severity: validation issues
  const lowSeverityPatterns = [/invalid/i, /missing/i, /undefined/i, /null/i];

  const checkPatterns = (text: string, patterns: RegExp[], severity: 'high' | 'medium' | 'low', source: 'output' | 'input') => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const idx = text.toLowerCase().indexOf(match[0].toLowerCase());
        const start = Math.max(0, idx - 100);
        const end = Math.min(text.length, idx + match[0].length + 100);
        semanticIssues.push({
          pattern: match[0],
          context: text.slice(start, end),
          severity,
          source,
        });
      }
    }
  };

  // Check output for errors
  checkPatterns(outputStr, highSeverityPatterns, 'high', 'output');
  checkPatterns(outputStr, mediumSeverityPatterns, 'medium', 'output');
  checkPatterns(outputStr, lowSeverityPatterns, 'low', 'output');

  // Check input for errors (tool results with errors)
  checkPatterns(inputStr, highSeverityPatterns, 'high', 'input');

  // Check for contradictory instructions in system prompts
  // System prompt is usually in input as first message with role="system"
  const systemPromptMatch = inputStr.match(/"role"\s*:\s*"system"[^}]*"content"\s*:\s*"([^"]+)"/i);
  if (systemPromptMatch) {
    const systemPrompt = systemPromptMatch[1];
    for (const pair of CONTRADICTION_PAIRS) {
      if (pair.a.test(systemPrompt) && pair.b.test(systemPrompt)) {
        promptIssues.push({
          issue: `Contradictory instructions: ${pair.desc}`,
          severity: 'high',
        });
      }
    }
  }

  // Check for tool calls
  const hasToolCalls = !!(attr.tool_calls || attr.function_call);

  // Generate client-side assessment
  let assessment = 'No issues detected.';
  const issues: string[] = [];

  if (attr.error) {
    issues.push(`Explicit error: ${attr.error}`);
  }
  if (semanticIssues.length > 0) {
    const highCount = semanticIssues.filter(i => i.severity === 'high').length;
    const mediumCount = semanticIssues.filter(i => i.severity === 'medium').length;
    issues.push(`${semanticIssues.length} semantic issues (${highCount} high, ${mediumCount} medium)`);
  }
  if (promptIssues.length > 0) {
    issues.push(`${promptIssues.length} prompt issues (contradictory instructions)`);
  }
  if (outputStr.length === 0) {
    issues.push('Empty output response');
  }

  if (issues.length > 0) {
    assessment = issues.join('; ');
  }

  return {
    span_id: span.span_id,
    operation_name: span.operation_name,
    duration_ms,
    model: (attr.model_name || attr.model?.name) as string | undefined,
    explicit_error: attr.error as string | undefined,
    semantic_issues: semanticIssues,
    prompt_issues: promptIssues,
    content_stats: {
      input_length: inputStr.length,
      output_length: outputStr.length,
      has_tool_calls: hasToolCalls,
    },
    assessment,
  };
}

/**
 * Extract tool call info from span attributes
 */
function extractToolCalls(attr: Record<string, any>): Array<{ name: string; id?: string }> {
  const toolCalls: Array<{ name: string; id?: string }> = [];

  // Check tool_calls field (OpenAI format)
  if (attr.tool_calls) {
    try {
      const calls = typeof attr.tool_calls === 'string' ? JSON.parse(attr.tool_calls) : attr.tool_calls;
      if (Array.isArray(calls)) {
        for (const call of calls) {
          if (call.function?.name) {
            toolCalls.push({ name: call.function.name, id: call.id });
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check function_call field (legacy format)
  if (attr.function_call?.name) {
    toolCalls.push({ name: attr.function_call.name });
  }

  // Check tool.name attribute (vLLora format)
  if (attr['tool.name']) {
    toolCalls.push({ name: attr['tool.name'] });
  }

  return toolCalls;
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
  semantic_error_source?: 'input' | 'output';
  model?: string;
  provider?: string;
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  ttft_ms?: number;
  tool_calls?: Array<{ name: string; id?: string }>;
  label?: string;
} {
  // Cast to any for dynamic field access (spans have varying attribute structures)
  const attr = (span.attribute || {}) as Record<string, any>;
  const duration_ms = span.finish_time_us && span.start_time_us
    ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
    : 0;

  // Check for explicit errors
  const hasError = !!(attr.error || attr.status_code >= 400 || attr.status === 'error');
  const errorMessage = attr.error as string | undefined;

  // Check for semantic errors in BOTH input and output
  // Input contains tool results (where "Unknown tool" errors appear)
  // Output contains LLM response
  const inputStr = typeof attr.input === 'string' ? attr.input : JSON.stringify(attr.input || '');
  const outputStr = attr.output || attr.response || attr.content;

  // Check input first (tool results with errors)
  let semanticError = containsErrorPattern(inputStr);
  let semanticErrorSource: 'input' | 'output' | undefined = semanticError ? 'input' : undefined;

  // If no error in input, check output
  if (!semanticError) {
    semanticError = containsErrorPattern(outputStr as string);
    semanticErrorSource = semanticError ? 'output' : undefined;
  }

  // Extract TTFT (time to first token) - convert from microseconds if needed
  let ttft_ms: number | undefined;
  if (attr.ttft) {
    const ttft = typeof attr.ttft === 'string' ? parseInt(attr.ttft, 10) : attr.ttft;
    // If ttft > 1000000, assume it's in nanoseconds or microseconds
    ttft_ms = ttft > 1000000 ? Math.round(ttft / 1000) : ttft;
  }

  // Extract cached tokens
  const cachedTokens = attr.usage?.prompt_tokens_details?.cached_tokens
    || attr.usage?.cached_tokens
    || attr.cached_tokens;

  // Extract tool calls
  const toolCalls = extractToolCalls(attr);

  // Extract provider name
  const provider = attr.provider_name || attr.provider;

  return {
    id: span.span_id,
    operation: span.operation_name,
    duration_ms,
    status: hasError ? 'error' : 'success',
    has_error: hasError,
    error_message: errorMessage,
    semantic_error: semanticError || undefined,
    semantic_error_source: semanticErrorSource,
    model: (attr.model_name || attr.model?.name || attr.model) as string | undefined,
    provider: provider as string | undefined,
    cost: typeof attr.cost === 'string' ? parseFloat(attr.cost) : attr.cost as number | undefined,
    input_tokens: (attr.usage?.input_tokens || attr.input_tokens) as number | undefined,
    output_tokens: (attr.usage?.output_tokens || attr.output_tokens) as number | undefined,
    cached_tokens: cachedTokens as number | undefined,
    ttft_ms,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    label: attr.label as string | undefined,
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
   * @param spanIds - Filter by span IDs (string or array) - use to fetch specific spans by ID
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
      if (params.spanIds) query.spanIds = toCommaSeparated(params.spanIds as string | string[]);
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
        by_provider: {} as Record<string, { count: number; cost: number; tokens: number }>,
        by_model: {} as Record<string, { count: number; cost: number; input_tokens: number; output_tokens: number }>,
        total_duration_ms: 0,
        total_cost: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cached_tokens: 0,
        models_used: new Set<string>(),
        tool_call_counts: {} as Record<string, number>,
        labels_found: new Set<string>(),
        durations: [] as number[],
        ttfts: [] as number[],
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
        stats.total_cached_tokens += summary.cached_tokens || 0;

        // Track durations for percentiles
        if (summary.duration_ms > 0) {
          stats.durations.push(summary.duration_ms);
        }

        // Track TTFTs for percentiles
        if (summary.ttft_ms && summary.ttft_ms > 0) {
          stats.ttfts.push(summary.ttft_ms);
        }

        // Group by model
        if (summary.model) {
          stats.models_used.add(summary.model);
          if (!stats.by_model[summary.model]) {
            stats.by_model[summary.model] = { count: 0, cost: 0, input_tokens: 0, output_tokens: 0 };
          }
          stats.by_model[summary.model].count++;
          stats.by_model[summary.model].cost += summary.cost || 0;
          stats.by_model[summary.model].input_tokens += summary.input_tokens || 0;
          stats.by_model[summary.model].output_tokens += summary.output_tokens || 0;
        }

        // Group by provider
        if (summary.provider) {
          if (!stats.by_provider[summary.provider]) {
            stats.by_provider[summary.provider] = { count: 0, cost: 0, tokens: 0 };
          }
          stats.by_provider[summary.provider].count++;
          stats.by_provider[summary.provider].cost += summary.cost || 0;
          stats.by_provider[summary.provider].tokens += (summary.input_tokens || 0) + (summary.output_tokens || 0);
        }

        // Count tool calls
        if (summary.tool_calls) {
          for (const tool of summary.tool_calls) {
            stats.tool_call_counts[tool.name] = (stats.tool_call_counts[tool.name] || 0) + 1;
          }
        }

        // Track labels
        if (summary.label) {
          stats.labels_found.add(summary.label);
        }
      }

      // Calculate percentiles helper
      const percentile = (arr: number[], p: number): number => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
      };

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

      // Detect repeated failures (same tool/operation failing multiple times)
      const repeatedFailures: Array<{ name: string; count: number; type: 'tool' | 'operation' }> = [];

      // Check for tools that appear in semantic errors multiple times
      const toolErrorCounts: Record<string, number> = {};
      for (const span of semanticErrorSpans) {
        if (span.semantic_error?.toLowerCase().includes('unknown tool')) {
          // Extract tool name from error pattern
          const match = span.semantic_error.match(/unknown tool[:\s]+(\w+)/i);
          if (match) {
            toolErrorCounts[match[1]] = (toolErrorCounts[match[1]] || 0) + 1;
          }
        }
      }
      for (const [name, count] of Object.entries(toolErrorCounts)) {
        if (count >= 2) {
          repeatedFailures.push({ name, count, type: 'tool' });
        }
      }

      // Check for operations that fail repeatedly
      const operationErrorCounts: Record<string, number> = {};
      for (const span of errorSpans) {
        operationErrorCounts[span.operation] = (operationErrorCounts[span.operation] || 0) + 1;
      }
      for (const [name, count] of Object.entries(operationErrorCounts)) {
        if (count >= 2) {
          repeatedFailures.push({ name, count, type: 'operation' });
        }
      }

      // Format model breakdown for response
      const modelBreakdown = Object.entries(stats.by_model).map(([model, data]) => ({
        model,
        count: data.count,
        cost: Math.round(data.cost * 10000) / 10000,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
      })).sort((a, b) => b.cost - a.cost);

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
          total_cached_tokens: stats.total_cached_tokens,
          cache_hit_rate: stats.total_input_tokens > 0
            ? Math.round((stats.total_cached_tokens / stats.total_input_tokens) * 100)
            : 0,
          models_used: Array.from(stats.models_used),
          labels_found: Array.from(stats.labels_found),
        },
        // New: Latency percentiles
        latency: {
          p50_ms: percentile(stats.durations, 50),
          p95_ms: percentile(stats.durations, 95),
          p99_ms: percentile(stats.durations, 99),
          max_ms: Math.max(...stats.durations, 0),
        },
        // New: TTFT percentiles (if available)
        ttft: stats.ttfts.length > 0 ? {
          p50_ms: percentile(stats.ttfts, 50),
          p95_ms: percentile(stats.ttfts, 95),
          avg_ms: Math.round(stats.ttfts.reduce((a, b) => a + b, 0) / stats.ttfts.length),
        } : undefined,
        // New: Model breakdown with costs
        model_breakdown: modelBreakdown.length > 0 ? modelBreakdown : undefined,
        // New: Tool call frequency
        tool_usage: Object.keys(stats.tool_call_counts).length > 0
          ? Object.entries(stats.tool_call_counts)
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count)
          : undefined,
        // New: Repeated failures detection
        repeated_failures: repeatedFailures.length > 0 ? repeatedFailures : undefined,
        error_spans: errorSpans.map(s => ({
          span_id: s.id,
          operation: s.operation,
          error_message: s.error_message,
        })),
        semantic_error_spans: semanticErrorSpans.map(s => ({
          span_id: s.id,
          operation: s.operation,
          detected_pattern: s.semantic_error,
          source: s.semantic_error_source, // 'input' (tool results) or 'output' (LLM response)
        })),
        slowest_spans: slowestSpans.map(s => ({
          span_id: s.id,
          operation: s.operation,
          duration_ms: s.duration_ms,
          ttft_ms: s.ttft_ms,
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

  // ============================================================================
  // HYBRID LLM ANALYSIS TOOL
  // Uses LLM for deep semantic analysis beyond regex patterns
  // ============================================================================

  /**
   * Analyze flagged spans with LLM for deeper semantic understanding
   * This is Phase 3 of the hybrid analysis approach:
   * 1. fetch_spans_summary (fast regex scan) → flags suspicious spans
   * 2. get_span_content (client-side analysis) → extracts patterns
   * 3. analyze_with_llm (LLM deep analysis) → understands context, correlates issues
   *
   * @param spanIds - Array of span IDs to analyze (max 5)
   * @param focus - Optional focus area: 'errors', 'performance', 'semantic', 'all' (default: 'all')
   * @param context - Optional additional context about what to look for
   */
  analyze_with_llm: async (params) => {
    return analyzeWithLLM(params, spanStorage);
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
    description: 'Fetch RAW span data. Use ONLY for metadata queries on 1-3 specific spans (e.g., "what model was used?"). WARNING: Returns full span objects - causes context overflow if used for content analysis. For analyzing span content, use fetch_spans_summary + get_span_content instead.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by span IDs. Use this to fetch specific spans by their IDs.',
        },
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
    description: 'PREFERRED for analysis. Phase 1: Fetches ALL spans via API, stores in browser memory, returns lightweight summary only (stats, errors, slowest, expensive). Use with get_span_content (Phase 2) for deep analysis. Context-efficient - never causes overflow.',
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
    description: 'Phase 2: Analyzes CACHED spans from memory (requires fetch_spans_summary first). Returns ANALYSIS RESULTS only - semantic_issues, content_stats, assessment. NOT raw span data. Max 5 spans per call. Context-efficient.',
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

  // ============================================================================
  // HYBRID LLM ANALYSIS TOOL
  // ============================================================================

  {
    name: 'analyze_with_llm',
    description: 'Phase 3 (optional): Deep LLM analysis of flagged spans. Use AFTER fetch_spans_summary + get_span_content when you need deeper semantic understanding. The LLM analyzes span content to: (1) verify if regex-flagged issues are real problems, (2) identify complex issues regex cannot detect, (3) correlate issues across spans, (4) provide root cause analysis. Max 5 spans per call.',
    type: 'function',
    parameters: {
      type: 'object',
      properties: {
        spanIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Span IDs to analyze with LLM (max 5 at a time). Should be spans flagged by fetch_spans_summary.',
        },
        focus: {
          type: 'string',
          enum: ['errors', 'performance', 'semantic', 'all'],
          description: 'Focus area for analysis. "errors" for failures/issues, "performance" for bottlenecks, "semantic" for prompt/logic issues, "all" for comprehensive. Default: "all"',
        },
        context: {
          type: 'string',
          description: 'Optional additional context about what to look for (e.g., "user reported slow responses", "tool calls seem to fail silently")',
        },
      },
      required: ['spanIds'],
    },
    handler: async (input: object) => JSON.stringify(await dataToolHandlers.analyze_with_llm(input as Record<string, unknown>)),
  } as DistriFnTool,
];
