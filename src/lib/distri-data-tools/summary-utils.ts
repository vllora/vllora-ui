/**
 * Pure utility functions for span summary extraction
 */

import type { Span } from '@/services/spans-api';
import { tryParseFloat, tryParseJson } from '@/utils/modelUtils';

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
  tool_call_errors?: Array<{ tool_name?: string; message: string }>;
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
  /no .{0,80} found/i,
  /failed to/i,
  /error:/i,
  /TypeError:/i,
  /unexpected keyword argument/i,
  /got an unexpected keyword argument/i,
  /failed:/i,
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
  /❌/,
  /unknown tool/i,
  /tool .{0,80} not found/i,
  /unrecognized function/i,
  /function .{0,80} does not exist/i,
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
  /using.{0,80}cache/i,
  /from.{0,80}cache/i,
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
  /maximum.{0,80}exceeded/i,
  /limit.{0,80}exceeded/i,
  /malformed/i,
  /primary.{0,80}failed/i,
  /connection.{0,80}failed/i,
  // Prompt issues (contradictions)
  /must.{0,80}never|never.{0,80}must/i,
  /always.{0,80}don't|don't.{0,80}always/i,
];

/**
 * Check if a string contains potential error patterns
 */
export function containsErrorPattern(text: string | undefined | null): string | null {
  if (!text) return null;

  const textStr = typeof text === 'string' ? text : JSON.stringify(text);

  // Keep snippets very short so agents can pick the right spans.
  // 30 chars of context on each side is usually enough.
  const contextBeforeChars = 30;
  const contextAfterChars = 30;
  const maxSnippetChars = contextBeforeChars + contextAfterChars + 60;

  for (const pattern of ERROR_PATTERNS) {
    const match = textStr.match(pattern);
    if (!match) continue;

    const matchedText = match[0];
    const matchStart = textStr.toLowerCase().indexOf(matchedText.toLowerCase());
    const start = Math.max(0, matchStart - contextBeforeChars);
    const patternStr = pattern.toString();
    const isLikelyToolFailureAnchor = patternStr.includes('failed:') || patternStr.includes('❌');
    const afterChars = isLikelyToolFailureAnchor ? 140 : contextAfterChars;

    let end = Math.min(textStr.length, matchStart + matchedText.length + afterChars);

    if (end - start > maxSnippetChars && !isLikelyToolFailureAnchor) {
      end = Math.min(textStr.length, start + maxSnippetChars);
    }

    const snippet = textStr.slice(start, end);
    const truncated = start > 0 || end < textStr.length;

    return '...' + snippet + '...' + (truncated ? ' (truncated)' : '');
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

function extractApiInvokeToolErrors(attr: Record<string, unknown>): Array<{ tool_name?: string; message: string }> {
  if (!attr.request) return [];

  const request = typeof attr.request === 'string' ? tryParseJson(attr.request) : attr.request;
  const messages = (request as Record<string, unknown> | undefined)?.messages;
  if (!Array.isArray(messages)) return [];

  const results: Array<{ tool_name?: string; message: string }> = [];

  for (const msg of messages) {
    const msgObj = msg as Record<string, unknown>;
    if (msgObj.role !== 'tool') continue;

    const content = typeof msgObj.content === 'string' ? msgObj.content : JSON.stringify(msgObj.content ?? '');
    if (!content) continue;

    const toolFailure = containsErrorPattern(content);
    if (!toolFailure) continue;

    const failedToolMatch = content.match(/❌\s*([a-zA-Z0-9_\-]+)\s*failed\b/i);

    results.push({
      tool_name: failedToolMatch?.[1],
      message: content.length > 500 ? content.slice(0, 500) + '…' : content,
    });

    // Keep payload small: enough to pick the right spans.
    if (results.length >= 5) break;
  }

  return results;
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

  const outputValue = attr.output ?? attr.response ?? attr.content;
  const outputStr = typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue ?? '');

  const apiInvokeToolErrors = span.operation_name === 'api_invoke' ? extractApiInvokeToolErrors(attr) : [];

  let semanticError = containsErrorPattern(inputStr);
  let semanticErrorSource: 'input' | 'output' | undefined = semanticError ? 'input' : undefined;

  if (!semanticError) {
    semanticError = containsErrorPattern(outputStr);
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

   let costAtt = attr.cost;
   let cost : number | undefined = undefined;
   if (typeof costAtt === 'string') {
    let costAsFloat = tryParseFloat(costAtt);

    if (costAsFloat) {
      cost = costAsFloat;
    }
    else {
      let jsonCost = tryParseJson(costAtt);
      if (jsonCost && jsonCost.cost) {
        cost = jsonCost.cost;
      }
    }
   } else {
    cost = attr.cost as number | undefined;
   }

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
    tool_call_errors: apiInvokeToolErrors.length > 0 ? apiInvokeToolErrors : undefined,
    model: (attr.model_name || (attr.model as Record<string, unknown>)?.name || attr.model) as string | undefined,
    provider: provider as string | undefined,
    cost,
    input_tokens: (usage?.input_tokens || attr.input_tokens) as number | undefined,
    output_tokens: (usage?.output_tokens || attr.output_tokens) as number | undefined,
    cached_tokens: cachedTokens as number | undefined,
    ttft_ms,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    label: attr.label as string | undefined,
  };
}
