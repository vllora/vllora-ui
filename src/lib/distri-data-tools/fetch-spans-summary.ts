/**
 * Fetch Spans Summary Tool
 *
 * Phase 1 of the two-phase analysis approach:
 * 1. fetch_spans_summary (fast regex scan) → fetches ALL spans, stores in memory, returns lightweight summary
 * 2. get_span_content (client-side analysis) → extracts patterns from cached spans
 *
 * This tool solves context overflow by fetching all spans internally and returning only summary stats.
 */

import { listSpans, type ListSpansQuery, type Span } from '@/services/spans-api';
import { listProjects } from '@/services/projects-api';
import { extractSpanSummary } from './summary-utils';

// In-memory storage for spans (shared across tools)
export const spanStorage: Map<string, Span> = new Map();

// Cache for the default project ID
let cachedDefaultProjectId: string | null = null;

/**
 * Get current project ID from URL, localStorage, or fetch from API
 */
async function getCurrentProjectId(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot get project ID in server context');
  }

  const params = new URLSearchParams(window.location.search);
  const urlProjectId = params.get('project_id') || params.get('projectId');
  if (urlProjectId) return urlProjectId;

  if (cachedDefaultProjectId) return cachedDefaultProjectId;

  try {
    const projects = await listProjects();
    const defaultProject = projects.find(p => p.is_default) || projects[0];
    if (defaultProject) {
      cachedDefaultProjectId = defaultProject.id;
      localStorage.setItem('currentProjectId', defaultProject.id);
      return defaultProject.id;
    }
  } catch (error) {
    console.error('[fetch-spans-summary] Failed to fetch default project:', error);
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

/**
 * Result from fetch_spans_summary tool
 */
export interface FetchSpansSummaryResult {
  success: boolean;
  error?: string;
  summary?: {
    total_spans: number;
    by_operation: Record<string, number>;
    by_status: { success: number; error: number };
    total_duration_ms: number;
    total_cost: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    cache_hit_rate: number;
    models_used: string[];
    labels_found: string[];
  };
  latency?: {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    max_ms: number;
  };
  ttft?: {
    p50_ms: number;
    p95_ms: number;
    avg_ms: number;
  };
  model_breakdown?: Array<{
    model: string;
    count: number;
    cost: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  tool_usage?: Array<{ name: string; count: number }>;
  repeated_failures?: Array<{ name: string; count: number; type: 'tool' | 'operation' }>;
  error_spans?: Array<{ span_id: string; operation: string; error_message?: string }>;
  semantic_error_spans?: Array<{ span_id: string; operation: string; detected_pattern?: string; source?: string }>;
  tool_call_errors?: Array<{ span_id: string; operation: string; tool_name?: string; message: string }>;
  slowest_spans?: Array<{ span_id: string; operation: string; duration_ms: number; ttft_ms?: number }>;
  expensive_spans?: Array<{ span_id: string; operation: string; cost?: number; model?: string }>;
  _note?: string;
}

/**
 * Fetch ALL spans for a thread, store in memory, return lightweight summary
 *
 * @param params - Tool parameters
 * @returns Summary result
 */
export async function fetchSpansSummary(
  params: Record<string, unknown>
): Promise<FetchSpansSummaryResult> {
  try {
    const projectId = (params.projectId as string) || await getCurrentProjectId();

    // Allow fetching by threadIds, runIds, OR labels (for label comparison)
    if (!params.threadIds && !params.runIds && !params.labels) {
      return { success: false, error: 'threadIds, runIds, or labels is required' };
    }

    const query: ListSpansQuery = {};
    if (params.threadIds) query.threadIds = toCommaSeparated(params.threadIds as string | string[]);
    if (params.runIds) query.runIds = toCommaSeparated(params.runIds as string | string[]);
    if (params.labels) query.labels = toCommaSeparated(params.labels as string | string[]);

    // Fetch ALL spans with PARALLEL pagination
    const batchSize = 100;
    const firstResult = await listSpans({
      projectId,
      params: { ...query, limit: batchSize, offset: 0 },
    });

    const allSpans: Span[] = [...firstResult.data];
    const total = firstResult.pagination?.total || allSpans.length;

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

      const batchResults = await Promise.all(batchPromises);
      for (const batch of batchResults) {
        allSpans.push(...batch);
      }
    }

    // Store all spans in memory
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
      stats.by_operation[summary.operation] = (stats.by_operation[summary.operation] || 0) + 1;

      if (summary.has_error) {
        stats.by_status.error++;
      } else {
        stats.by_status.success++;
      }

      stats.total_duration_ms += summary.duration_ms;
      if(summary.operation === 'api_invoke') {
        stats.total_cost += summary.cost || 0;
      }
      if(summary.operation === 'model_call') {
        stats.total_input_tokens += summary.input_tokens || 0;
        stats.total_output_tokens += summary.output_tokens || 0;
        stats.total_cached_tokens += summary.cached_tokens || 0;
      }

      if (summary.duration_ms > 0 && summary.operation === 'api_invoke') {
        stats.durations.push(summary.duration_ms);
      }

      if (summary.ttft_ms && summary.ttft_ms > 0) {
        stats.ttfts.push(summary.ttft_ms);
      }

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

      if (summary.provider) {
        if (!stats.by_provider[summary.provider]) {
          stats.by_provider[summary.provider] = { count: 0, cost: 0, tokens: 0 };
        }
        stats.by_provider[summary.provider].count++;
        stats.by_provider[summary.provider].cost += summary.cost || 0;
        stats.by_provider[summary.provider].tokens += (summary.input_tokens || 0) + (summary.output_tokens || 0);
      }

      if (summary.tool_calls) {
        for (const tool of summary.tool_calls) {
          stats.tool_call_counts[tool.name] = (stats.tool_call_counts[tool.name] || 0) + 1;
        }
      }

      if (summary.label) {
        stats.labels_found.add(summary.label);
      }
    }

    // Calculate percentiles
    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    };

    const errorSpans = spanSummaries.filter(s => s.has_error);

    // Sort semantic errors so real tool failures show up first.
    const semanticSeverityScore = (semanticError: string | undefined): number => {
      if (!semanticError) return 0;
      const s = semanticError.toLowerCase();
      if (
        s.includes('unexpected keyword argument') ||
        s.includes('got an unexpected keyword argument') ||
        s.includes('unknown tool') ||
        s.includes('unrecognized function') ||
        s.includes('function not found') ||
        s.includes('error:') ||
        s.includes('exception') ||
        s.includes('failed:') ||
        semanticError.includes('❌')
      ) {
        return 100;
      }
      if (s.includes('timeout') || s.includes('rate limit') || s.includes('unauthorized') || s.includes('forbidden')) {
        return 80;
      }
      if (s.includes('invalid') || s.includes('missing') || s.includes('undefined') || s.includes('null')) {
        return 60;
      }
      return 10;
    };

    const semanticErrorSpans = [...spanSummaries]
      .filter(s => s.semantic_error)
      .sort((a, b) => semanticSeverityScore(b.semantic_error) - semanticSeverityScore(a.semantic_error));

    const toolCallErrors = spanSummaries
      .filter(s => s.operation === 'api_invoke' && s.tool_call_errors && s.tool_call_errors.length > 0)
      .flatMap(s =>
        (s.tool_call_errors || []).map(e => ({
          span_id: s.id,
          operation: s.operation,
          tool_name: e.tool_name,
          message: e.message,
        }))
      );

    const slowestSpans = [...spanSummaries]
      .sort((a, b) => b.duration_ms - a.duration_ms)
      .slice(0, 5);
    const expensiveSpans = [...spanSummaries]
      .filter(s => s.cost && s.cost > 0)
      .sort((a, b) => (b.cost || 0) - (a.cost || 0))
      .slice(0, 5);

    // Detect repeated failures
    const repeatedFailures: Array<{ name: string; count: number; type: 'tool' | 'operation' }> = [];

    const toolErrorCounts: Record<string, number> = {};
    for (const span of semanticErrorSpans) {
      const semanticError = span.semantic_error;
      if (!semanticError) continue;

      const lower = semanticError.toLowerCase();

      // Detect repeated "unknown tool" failures
      if (lower.includes('unknown tool')) {
        const match = semanticError.match(/unknown tool[:\s]+(\w+)/i);
        if (match) {
          toolErrorCounts[match[1]] = (toolErrorCounts[match[1]] || 0) + 1;
        }
      }

      // Detect repeated tool execution failures like: "❌ research_flights failed: ..."
      const failedToolMatch = semanticError.match(/❌\s*([a-zA-Z0-9_\-]+)\s*failed\b/i);
      if (failedToolMatch) {
        const toolName = failedToolMatch[1];
        toolErrorCounts[toolName] = (toolErrorCounts[toolName] || 0) + 1;
      }
    }

    for (const [name, count] of Object.entries(toolErrorCounts)) {
      if (count >= 2) {
        repeatedFailures.push({ name, count, type: 'tool' });
      }
    }

    const operationErrorCounts: Record<string, number> = {};
    for (const span of errorSpans) {
      operationErrorCounts[span.operation] = (operationErrorCounts[span.operation] || 0) + 1;
    }
    for (const [name, count] of Object.entries(operationErrorCounts)) {
      if (count >= 2) {
        repeatedFailures.push({ name, count, type: 'operation' });
      }
    }

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
        total_cost: Math.round(stats.total_cost * 10000) / 10000,
        total_input_tokens: stats.total_input_tokens,
        total_output_tokens: stats.total_output_tokens,
        total_cached_tokens: stats.total_cached_tokens,
        cache_hit_rate: stats.total_input_tokens > 0
          ? Math.round((stats.total_cached_tokens / stats.total_input_tokens) * 100)
          : 0,
        models_used: Array.from(stats.models_used),
        labels_found: Array.from(stats.labels_found),
      },
      latency: {
        p50_ms: percentile(stats.durations, 50),
        p95_ms: percentile(stats.durations, 95),
        p99_ms: percentile(stats.durations, 99),
        max_ms: Math.max(...stats.durations, 0),
      },
      ttft: stats.ttfts.length > 0 ? {
        p50_ms: percentile(stats.ttfts, 50),
        p95_ms: percentile(stats.ttfts, 95),
        avg_ms: Math.round(stats.ttfts.reduce((a, b) => a + b, 0) / stats.ttfts.length),
      } : undefined,
      model_breakdown: modelBreakdown.length > 0 ? modelBreakdown : undefined,
      tool_usage: Object.keys(stats.tool_call_counts).length > 0
        ? Object.entries(stats.tool_call_counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
        : undefined,
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
        source: s.semantic_error_source,
      })),
      tool_call_errors: toolCallErrors.length > 0 ? toolCallErrors : undefined,
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
      _note:
        'Full span data stored in memory. `tool_call_errors` is extracted from `api_invoke.attribute.request.messages` where `role=tool`. Use get_span_content with span_ids to retrieve specific spans for deep analysis.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch spans summary',
    };
  }
}
