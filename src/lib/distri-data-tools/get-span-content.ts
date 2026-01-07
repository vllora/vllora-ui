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

// Contradictory instruction patterns to detect in system prompts
const CONTRADICTION_PAIRS = [
  { a: /must use tools/i, b: /answer directly|from your knowledge/i, desc: '"MUST use tools" vs "answer directly"' },
  { a: /at least \d+ times/i, b: /minimize.*calls|be efficient/i, desc: '"at least N times" vs "minimize calls"' },
  { a: /always/i, b: /never/i, desc: '"always" vs "never" directives' },
  { a: /json object/i, b: /plain text/i, desc: '"JSON object" vs "plain text" format' },
  { a: /include citations/i, b: /without citations|brief/i, desc: '"include citations" vs "without citations"' },
];

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
  data?: SpanDeepAnalysis[];
  not_found?: string[];
  _note?: string;
}

/**
 * Perform deep semantic analysis on a span (client-side)
 * Returns analysis results, NOT raw span data
 */
function analyzeSpanDeep(span: Span): SpanDeepAnalysis {
  const attr = (span.attribute || {}) as Record<string, unknown>;
  const duration_ms = span.finish_time_us && span.start_time_us
    ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
    : 0;

  // Get content for analysis
  const inputStr = typeof attr.input === 'string' ? attr.input : JSON.stringify(attr.input || '');
  const outputStr = typeof attr.output === 'string' ? attr.output :
    (typeof attr.response === 'string' ? attr.response : JSON.stringify(attr.output || attr.response || ''));

  // Detect semantic issues with severity
  const semanticIssues: SpanDeepAnalysis['semantic_issues'] = [];
  const promptIssues: SpanDeepAnalysis['prompt_issues'] = [];

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
    model: (attr.model_name || (attr.model as Record<string, unknown>)?.name) as string | undefined,
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
    const analysisResults: SpanDeepAnalysis[] = [];
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
}
