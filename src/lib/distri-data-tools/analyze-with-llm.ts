/**
 * Hybrid LLM Analysis Tool
 *
 * Phase 3 of the multi-phase analysis approach:
 * 1. fetch_spans_summary (fast regex scan) → flags suspicious spans
 * 2. get_span_content (client-side analysis) → extracts patterns
 * 3. analyze_with_llm (LLM deep analysis) → understands context, correlates issues
 *
 * This tool uses an LLM to perform deep semantic analysis on flagged spans,
 * going beyond what regex patterns can detect.
 */

import { getBackendUrl, getChatCompletionsUrl } from '@/config/api';
import type { Span } from '@/services/spans-api';

/**
 * Provider configuration from Lucy config
 */
interface ProviderConfig {
  name: string;
  base_url?: string;
  api_key?: string;
  project_id?: string;
}

/**
 * Lucy configuration from backend
 */
interface LucyConfig {
  distri_url?: string;
  model_settings?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    provider?: ProviderConfig;
  };
}

// Cache for Lucy config (refreshed on each analysis call)
let cachedLucyConfig: LucyConfig | null = null;

// Storage key for Lucy thread ID (same as useAgentChat)
const THREAD_STORAGE_KEY = 'vllora:agentThreadId';

/**
 * Get current Lucy thread ID from localStorage
 */
function getCurrentThreadId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(THREAD_STORAGE_KEY);
}

/**
 * Fetch Lucy configuration from backend
 */
async function fetchLucyConfig(): Promise<LucyConfig> {
  try {
    const response = await fetch(`${getBackendUrl()}/agents/config`);
    if (!response.ok) {
      console.warn(`Failed to fetch Lucy config: ${response.status}`);
      return {};
    }
    cachedLucyConfig = await response.json();
    return cachedLucyConfig!;
  } catch (error) {
    console.warn('Error fetching Lucy config, using defaults:', error);
    return {};
  }
}

/**
 * Span data prepared for LLM analysis
 */
interface SpanForAnalysis {
  span_id: string;
  operation_name: string;
  duration_ms: number;
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cached_tokens?: number;
  input_excerpt: string;
  output_excerpt: string;
  error?: string;
  model?: string;
  label?: string;
}

/**
 * Issue detected by LLM analysis (matches JSON schema).
 */
interface AnalysisIssue {
  type: 'error' | 'performance' | 'semantic' | 'tool' | 'other';
  severity: 'high' | 'medium' | 'low';
  data_snippet: string;
  explanation: string;
  tool_name: string | null;
  tool_call_id: string | null;
}

/**
 * Per-span analysis result (matches JSON schema).
 */
interface SpanAnalysis {
  span_id: string;
  issue_title: string;
  issues: AnalysisIssue[];
}

/**
 * Correlation between spans (matches JSON schema).
 */
interface SpanCorrelation {
  spans: string[];
  pattern: string;
  description: string;
}

/**
 * Complete LLM analysis result
 */
export interface LLMAnalysisResult {
  overall_assessment: string;
  issue_count: { high: number; medium: number; low: number };
  span_analyses: SpanAnalysis[];
  correlations: SpanCorrelation[];
  recommendations: string[];
  _raw_response?: boolean;
}

/**
 * Parameters for analyze_with_llm tool
 */
export interface AnalyzeWithLLMParams {
  spanIds: string | string[];
  focus?: 'errors' | 'performance' | 'semantic' | 'all';
  context?: string;
}

/**
 * Result from analyze_with_llm tool
 */
export interface AnalyzeWithLLMResult {
  success: boolean;
  error?: string;
  focus?: string;
  spans_analyzed?: number;
  not_found?: string[];
  analysis?: LLMAnalysisResult;
  _note?: string;
}

/**
 * Focus area instructions for the LLM
 *
 * CHANGE: Logic updated to ensure FULL analysis is always performed,
 * with the 'focus' parameter strictly controlling the sorting/prioritization order.
 */
const FOCUS_INSTRUCTIONS: Record<string, string> = {
  errors:
    'MANDATE: Perform a COMPREHENSIVE analysis of all aspects (Errors, Performance, Semantic, Tools). \n\nPRIORITIZATION: When writing the "overall_assessment" and ordering "span_analyses", you MUST present Error/Failure issues FIRST. Discuss performance or semantic issues immediately after.',
  performance:
    'MANDATE: Perform a COMPREHENSIVE analysis of all aspects (Errors, Performance, Semantic, Tools). \n\nPRIORITIZATION: When writing the "overall_assessment" and ordering "span_analyses", you MUST present Performance issues (latency, cost, tokens) FIRST. Discuss errors or semantic issues immediately after.',
  semantic:
    'MANDATE: Perform a COMPREHENSIVE analysis of all aspects (Errors, Performance, Semantic, Tools). \n\nPRIORITIZATION: When writing the "overall_assessment" and ordering "span_analyses", you MUST present Semantic/Logic issues (contradictions, prompt confusion, bad output) FIRST. Discuss errors or performance issues immediately after.',
  all:
    'MANDATE: Perform a COMPREHENSIVE analysis of all aspects. \n\nPRIORITIZATION: Order issues by severity (High -> Low). Group related issues together.',
};

/**
 * Build the analysis prompt for the LLM
 */
function buildAnalysisPrompt(
  spansToAnalyze: SpanForAnalysis[],
  focus: string,
  userContext: string
): string {
  return `## Focus Area
${FOCUS_INSTRUCTIONS[focus] || FOCUS_INSTRUCTIONS.all}

${userContext ? `## Additional Context\n${userContext}\n` : ''}

## Span Data to Analyze
${JSON.stringify(spansToAnalyze, null, 2)}`;
}


/**
 * Return full text for LLM analysis.
 *
 * This tool previously truncated/"excerpted" span content and appended
 * `...[truncated]`, which prevented the model from extracting complete
 * evidence snippets.
 */
function extractRelevantExcerpt(text: string): string {
  return text || '';
}

/**
 * Extract span data for analysis from storage
 */
function extractSpanData(span: Span): SpanForAnalysis {
  const attr = (span.attribute || {}) as Record<string, unknown>;
  const duration_ms =
    span.finish_time_us && span.start_time_us
      ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
      : 0;

  // `api_invoke` spans often store the actual conversation/tool results in `attribute.request.messages`
  // rather than `attribute.input`/`attribute.output`.
  let inputValue: unknown = attr.input;

  if ((!inputValue || inputValue === '') && span.operation_name === 'api_invoke' && attr.request) {
    const request = typeof attr.request === 'string' ? safeParseJson(attr.request) : attr.request;
    const requestObj = request && typeof request === 'object' ? (request as Record<string, unknown>) : undefined;

    if (requestObj?.messages && Array.isArray(requestObj.messages)) {
      // Keep only the minimal fields needed for analysis.
      inputValue = {
        model: requestObj.model,
        messages: requestObj.messages,
      };
    } else {
      inputValue = requestObj ?? attr.request;
    }
  }

  const inputStr = typeof inputValue === 'string' ? inputValue : JSON.stringify(inputValue ?? '');

  const outputValue = attr.output ?? attr.response ?? attr.content;
  const outputStr = typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue ?? '');

  const usage = extractUsage(attr);
  const cost = extractCost(attr);

  return {
    span_id: span.span_id,
    operation_name: span.operation_name,
    duration_ms,
    cost,
    input_tokens: usage?.input_tokens,
    output_tokens: usage?.output_tokens,
    total_tokens: usage?.total_tokens,
    cached_tokens: usage?.cached_tokens,
    input_excerpt: extractRelevantExcerpt(inputStr),
    output_excerpt: extractRelevantExcerpt(outputStr),
    error: attr.error as string | undefined,
    model: (attr.model_name || (attr.model as Record<string, unknown>)?.name || attr.model) as string | undefined,
    label: attr.label as string | undefined,
  };
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractCost(attr: Record<string, unknown>): number | undefined {
  const value = attr.cost ?? attr.total_cost ?? attr.cost_usd;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function extractUsage(
  attr: Record<string, unknown>
):
  | {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      cached_tokens?: number;
    }
  | undefined {
  const usageValue = attr.usage;
  const usage =
    typeof usageValue === 'string'
      ? safeParseJson(usageValue)
      : usageValue;

  if (!usage || typeof usage !== 'object') return undefined;

  const usageObj = usage as Record<string, unknown>;

  const inputTokens = typeof usageObj.input_tokens === 'number' ? usageObj.input_tokens : undefined;
  const outputTokens = typeof usageObj.output_tokens === 'number' ? usageObj.output_tokens : undefined;
  const totalTokens = typeof usageObj.total_tokens === 'number' ? usageObj.total_tokens : undefined;

  const promptDetails = usageObj.prompt_tokens_details as Record<string, unknown> | undefined;
  const cachedTokens = typeof promptDetails?.cached_tokens === 'number' ? (promptDetails.cached_tokens as number) : undefined;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cached_tokens: cachedTokens,
  };
}

/**
 * Parse LLM response into structured analysis
 */
function parseLLMResponse(content: string): LLMAnalysisResult {
  try {
    // Handle potential markdown code blocks
    const jsonMatch =
      content.match(/```json\s*([\s\S]*?)\s*```/) ||
      content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    return JSON.parse(jsonStr.trim());
  } catch {
    // If parsing fails, return the raw content as assessment
    return {
      overall_assessment: content,
      issue_count: { high: 0, medium: 0, low: 0 },
      span_analyses: [],
      correlations: [],
      recommendations: [],
      _raw_response: true,
    };
  }
}

/**
 * Construct chat completions URL from provider config
 */
function buildChatCompletionsUrl(provider?: ProviderConfig): string {
  if (provider?.base_url) {
    // Use provider's base_url - append /chat/completions if needed
    const baseUrl = provider.base_url.replace(/\/$/, ''); // Remove trailing slash
    if (baseUrl.endsWith('/v1')) {
      return `${baseUrl}/chat/completions`;
    }
    return `${baseUrl}/v1/chat/completions`;
  }
  // Fallback to vLLora backend
  return getChatCompletionsUrl();
}

const BASE_ANALYSIS_SYSTEM_PROMPT = `You are an expert trace analyzer.

Goal: Find ALL hidden issues in AI agent traces (Errors, Performance, Semantic, and Tool use).

Data model notes:
- Spans may include tool execution evidence inside JSON (e.g., api_invoke request.messages with role='tool').

Rules:
1. **COMPLETENESS IS MANDATORY**: Do NOT filter out findings. If you see a performance issue while focusing on errors, you MUST report it.
2. **SORTING**: Use the provided "Focus Area" to decide which issues to mention *first* in the summary and list *first* in the arrays.
3. Always extract the exact evidence from the provided span data. Quote actual JSON/text.
4. Prefer deduplicating repeated root causes: report one primary issue and use "Also affects: <span_ids>" for repeats.
5. Output MUST be valid JSON matching the provided schema.
6. Always include tool_name and tool_call_id fields in every issue (use null when not applicable).

Always watch for and report these categories:
- Prompt contradictions (conflicting instructions)
- Tool/provider failures (auth, invalid_request_error, rate limits)
- Tool/schema mismatches (unexpected arguments)
- Silent failures (success status but empty results)
- Buried warnings (fallback/cached)
- Cost/token anomalies
- Repeated slow calls

Remember: The "Focus Area" determines the *Headline*, not the *Content Scope*.
`;

const FOCUS_SYSTEM_HINTS: Record<string, string> = {
  errors:
    'Scan everything. Put Provider/Tool failures and crashes at the top of the report. List performance/semantic issues below them.',
  performance:
    'Scan everything. Put bottlenecks, slow spans, and cost anomalies at the top of the report. List errors/semantic issues below them.',
  semantic:
    'Scan everything. Put logic gaps, prompt contradictions, and bad outputs at the top of the report. List errors/performance issues below them.',
  all: 'Scan everything. Sort purely by impact/severity.',
};

function buildAnalysisSystemPrompt(focus: string): string {
  const hint = FOCUS_SYSTEM_HINTS[focus] || FOCUS_SYSTEM_HINTS.all;
  return `${BASE_ANALYSIS_SYSTEM_PROMPT}\nFocus hint: ${hint}`;
}

/**
 * JSON Schema for structured output response
 */
const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'trace_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        overall_assessment: {
          type: 'string',
          description: 'Brief summary: X issues found, main problem is Y',
        },
        issue_count: {
          type: 'object',
          properties: {
            high: { type: 'number' },
            medium: { type: 'number' },
            low: { type: 'number' },
          },
          required: ['high', 'medium', 'low'],
          additionalProperties: false,
        },
        span_analyses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              span_id: { type: 'string' },
              issue_title: {
                type: 'string',
                description:
                  'Short title like "Silent Search Failure" or "Buried Warning"',
              },
              issues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['error', 'performance', 'semantic', 'tool', 'other'],
                    },
                    severity: {
                      type: 'string',
                      enum: ['high', 'medium', 'low'],
                    },
                    data_snippet: {
                      type: 'string',
                      description:
                        'ACTUAL JSON or text from the trace showing the problem',
                    },
                    explanation: {
                      type: 'string',
                      description:
                        'Why this is a problem from data flow perspective',
                    },
                    tool_name: {
                      type: ['string', 'null'],
                      description: 'Tool name if the issue is tool-related',
                    },
                    tool_call_id: {
                      type: ['string', 'null'],
                      description: 'Tool call id if available',
                    },
                  },
                  required: ['type', 'severity', 'data_snippet', 'explanation', 'tool_name', 'tool_call_id'],
                  additionalProperties: false,
                },
              },
            },
            required: ['span_id', 'issue_title', 'issues'],
            additionalProperties: false,
          },
        },
        correlations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              spans: {
                type: 'array',
                items: { type: 'string' },
              },
              pattern: {
                type: 'string',
                description: 'Pattern name like "Gradual Degradation"',
              },
              description: { type: 'string' },
            },
            required: ['spans', 'pattern', 'description'],
            additionalProperties: false,
          },
        },
        recommendations: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: [
        'overall_assessment',
        'issue_count',
        'span_analyses',
        'correlations',
        'recommendations',
      ],
      additionalProperties: false,
    },
  },
};

/**
 * Call the LLM API for analysis using Lucy config settings
 */
async function callLLMForAnalysis(prompt: string, focus: string): Promise<string> {
  // Fetch Lucy config from backend to get model settings
  const lucyConfig = await fetchLucyConfig();
  const modelSettings = lucyConfig.model_settings;
  const provider = modelSettings?.provider;

  // Force model for analysis (consistent behavior across environments)
  const model = 'openai/gpt-4.1';
  // Use lower temperature for analysis (more consistent)
  const temperature = 0.2;

  // Build URL from provider config
  const chatCompletionsUrl = buildChatCompletionsUrl(provider);

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-label': 'analyze_with_llm',
  };

  // Add Authorization if api_key is provided
  if (provider?.api_key) {
    headers['Authorization'] = `Bearer ${provider.api_key}`;
  }

  // Add x-thread-id for Lucy thread context
  const threadId = getCurrentThreadId();
  if (threadId) {
    headers['x-thread-id'] = threadId;
  }

  const response = await fetch(chatCompletionsUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: buildAnalysisSystemPrompt(focus),
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature,
      response_format: ANALYSIS_RESPONSE_SCHEMA,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM analysis failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const analysisContent = result.choices?.[0]?.message?.content;

  if (!analysisContent) {
    throw new Error('LLM returned empty response');
  }

  return analysisContent;
}

/**
 * Analyze flagged spans with LLM for deeper semantic understanding
 *
 * @param params - Tool parameters
 * @param spanStorage - Map of span IDs to span data (from fetch_spans_summary)
 * @returns Analysis result
 */
export async function analyzeWithLLM(
  params: Record<string, unknown>,
  spanStorage: Map<string, Span>
): Promise<AnalyzeWithLLMResult> {
  try {
    const spanIds = params.spanIds as string | string[];
    if (!spanIds) {
      return { success: false, error: 'spanIds is required' };
    }

    const ids = Array.isArray(spanIds) ? spanIds : [spanIds];
    const focus = (params.focus as string) || 'all';
    const userContext = (params.context as string) || '';

    // This tool auto-batches spanIds to respect model context constraints.
    const batchSize = 5;
    const maxBatches = 3;

    // Check if storage has data
    if (spanStorage.size === 0) {
      return {
        success: false,
        error: 'No spans in memory. Call fetch_spans_summary first to load spans.',
      };
    }

    const idBatches: string[][] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      idBatches.push(ids.slice(i, i + batchSize));
      if (idBatches.length >= maxBatches) break;
    }

    const notFoundSet = new Set<string>();
    const analyses: LLMAnalysisResult[] = [];
    let spansAnalyzed = 0;

    for (const batchIds of idBatches) {
      const spansToAnalyze: SpanForAnalysis[] = [];

      for (const id of batchIds) {
        const span = spanStorage.get(id);
        if (span) {
          spansToAnalyze.push(extractSpanData(span));
        } else {
          notFoundSet.add(id);
        }
      }

      if (spansToAnalyze.length === 0) continue;

      const prompt = buildAnalysisPrompt(spansToAnalyze, focus, userContext);
      const analysisContent = await callLLMForAnalysis(prompt, focus);
      analyses.push(parseLLMResponse(analysisContent));
      spansAnalyzed += spansToAnalyze.length;
    }

    if (spansAnalyzed === 0) {
      return {
        success: false,
        error: 'No matching spans found in memory.',
        not_found: Array.from(notFoundSet),
      };
    }

    const mergedRecommendations = new Set<string>();
    const merged: LLMAnalysisResult = {
      overall_assessment: analyses
        .map((a, i) => `[Batch ${i + 1}] ${a.overall_assessment}`)
        .join('\n\n'),
      issue_count: { high: 0, medium: 0, low: 0 },
      span_analyses: [],
      correlations: [],
      recommendations: [],
    };

    for (const a of analyses) {
      merged.issue_count.high += a.issue_count?.high || 0;
      merged.issue_count.medium += a.issue_count?.medium || 0;
      merged.issue_count.low += a.issue_count?.low || 0;

      merged.span_analyses.push(...(a.span_analyses || []));
      merged.correlations.push(...(a.correlations || []));

      for (const r of a.recommendations || []) {
        mergedRecommendations.add(r);
      }

      if (a._raw_response) {
        merged._raw_response = true;
      }
    }

    merged.recommendations = Array.from(mergedRecommendations);

    return {
      success: true,
      focus,
      spans_analyzed: spansAnalyzed,
      not_found: notFoundSet.size > 0 ? Array.from(notFoundSet) : undefined,
      analysis: merged,
      _note: `LLM-powered deep analysis (batched: ${idBatches.length} x ${batchSize}, capped at ${maxBatches} batches).`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze with LLM',
    };
  }
}
