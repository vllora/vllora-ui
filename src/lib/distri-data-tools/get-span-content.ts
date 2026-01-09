/**
 * Get Span Content Tool
 *
 * Phase 2 of the two-phase analysis approach:
 * 1. fetch_spans_summary (fast regex scan) → flags suspicious spans
 * 2. get_span_content (client-side analysis) → extracts patterns, performs deep analysis
 *
 * This tool retrieves spans from memory and performs client-side semantic analysis.
 */

import type { Span } from '@/services/spans-api';
/**
 * Deep analysis result for a span
 */
export interface SpanDeepAnalysis {
  span_id: string;
  operation_name: string;
  duration_ms: number;
  model?: string;
  explicit_error?: string;
  semantic_issues: Array<{
    pattern: string;
    context: string;
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
  assessment: string;
}

/**
 * Result from get_span_content tool
 */
export interface GetSpanContentResult {
  success: boolean;
  error?: string;
  data?: Span[];
  not_found?: string[];
  _note?: string;
}



/**
 * Retrieve specific spans by ID for deep semantic analysis
 * This retrieves from in-memory storage (populated by fetch_spans_summary)
 *
 * @param params - Tool parameters
 * @param spanStorage - Map of span IDs to span data (from fetch_spans_summary)
 * @returns Analysis result
 */
export async function getSpanContent(
  params: Record<string, unknown>,
  spanStorage: Map<string, Span>
): Promise<GetSpanContentResult> {
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
    const notFound: string[] = [];

    let result: Span[] = []
    for (const id of ids) {
      const span = spanStorage.get(id);
      span && result.push(span)
    }

    return {
      success: true,
      data: result,
      not_found: notFound.length > 0 ? notFound : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get span content',
    };
  }
}
