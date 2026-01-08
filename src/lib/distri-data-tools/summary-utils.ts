/**
 * Pure utility functions for span summary extraction
 */

import type { Span } from '@/services/spans-api';
import { tryParseJson } from '@/utils/modelUtils';

/**
 * Span summary for lightweight response
 */
export interface SpanSummary {
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
}

// Common error patterns to detect semantic errors in responses
export const ERROR_PATTERNS = [
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
  /could not connect/i,
  /empty results/i,
  /no results/i,
  /service unavailable/i,
  /checksum mismatch/i,
  /may be corrupted/i,
  /may be outdated/i,
  /cached fallback/i,
  /stale cache/i,
  /using.*cache/i,
  /from.*cache/i,
  /degraded/i,
  /truncated/i,
  /data truncated/i,
  /partial.success/i,
  /quality.*(low|poor)/i,
  /confidence.*(low|below)/i,
  /cannot be verified/i,
  /unverified/i,
  // Warnings and degradation indicators
  /WARNING:/i,
  /INTERNAL NOTE:/i,
  /fallback/i,
  /retry.after/i,
  /maximum.*exceeded/i,
  /limit.*exceeded/i,
  /malformed/i,
  /primary.*failed/i,
  /connection.*failed/i,
  // Prompt issues (contradictions)
  /must.*never|never.*must/i,
  /always.*don't|don't.*always/i,
];

/**
 * Check if a string contains potential error patterns
 */
export function containsErrorPattern(text: string | undefined | null): string | null {
  if (!text) return null;
  const textStr = typeof text === 'string' ? text : JSON.stringify(text);
  for (const pattern of ERROR_PATTERNS) {
    const match = textStr.match(pattern);
    if (match) {
      const idx = textStr.toLowerCase().indexOf(match[0].toLowerCase());
      const start = Math.max(0, idx - 30);
      const end = Math.min(textStr.length, idx + match[0].length + 30);
      return '...' + textStr.slice(start, end) + '...';
    }
  }
  return null;
}

/**
 * Extract tool call info from span attributes
 */
export function extractToolCalls(attr: Record<string, unknown>): Array<{ name: string; id?: string }> {
  const toolCalls: Array<{ name: string; id?: string }> = [];

  if (attr.tool_calls) {
    const calls = typeof attr.tool_calls === 'string' ? tryParseJson(attr.tool_calls) : attr.tool_calls;
    if (Array.isArray(calls)) {
      for (const call of calls) {
        if (call.function?.name) {
          toolCalls.push({ name: call.function.name, id: call.id });
        }
      }
    }
  }

  if ((attr.function_call as Record<string, unknown>)?.name) {
    toolCalls.push({ name: (attr.function_call as Record<string, unknown>).name as string });
  }


  return toolCalls;
}

/**
 * Extract key info from a span for summary
 */
export function extractSpanSummary(span: Span): SpanSummary {
  const attr = (span.attribute || {}) as Record<string, unknown>;
  
  const duration_ms = span.finish_time_us && span.start_time_us
    ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
    : 0;

  const hasError = !!(attr.error || (attr.status_code as number) >= 400 || attr.status === 'error');
  const errorMessage = attr.error as string | undefined;

  const inputStr = typeof attr.input === 'string' ? attr.input : JSON.stringify(attr.input || '');
  const outputStr = attr.output || attr.response || attr.content;

  let semanticError = containsErrorPattern(inputStr);
  let semanticErrorSource: 'input' | 'output' | undefined = semanticError ? 'input' : undefined;

  if (!semanticError) {
    semanticError = containsErrorPattern(outputStr as string);
    semanticErrorSource = semanticError ? 'output' : undefined;
  }

  let ttft_ms: number | undefined;
  if (attr.ttft) {
    const ttft = typeof attr.ttft === 'string' ? parseInt(attr.ttft, 10) : attr.ttft as number;
    ttft_ms = ttft > 1000000 ? Math.round(ttft / 1000) : ttft;
  }

  const usage = attr.usage
    ? (typeof attr.usage === 'string' ? tryParseJson(attr.usage) : attr.usage) as Record<string, unknown> | undefined
    : undefined;
  const cachedTokens = (usage?.prompt_tokens_details as Record<string, unknown>)?.cached_tokens
    || usage?.cached_tokens
    || attr.cached_tokens;

  const toolCalls = extractToolCalls(attr);
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
    model: (attr.model_name || (attr.model as Record<string, unknown>)?.name || attr.model) as string | undefined,
    provider: provider as string | undefined,
    cost: typeof attr.cost === 'string' ? parseFloat(attr.cost) : attr.cost as number | undefined,
    input_tokens: (usage?.input_tokens || attr.input_tokens) as number | undefined,
    output_tokens: (usage?.output_tokens || attr.output_tokens) as number | undefined,
    cached_tokens: cachedTokens as number | undefined,
    ttft_ms,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    label: attr.label as string | undefined,
  };
}
