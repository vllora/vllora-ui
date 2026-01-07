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
  input_excerpt: string;
  output_excerpt: string;
  error?: string;
  model?: string;
}

/**
 * Issue detected by LLM analysis
 */
interface AnalysisIssue {
  type: 'error' | 'performance' | 'semantic' | 'other';
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
  root_cause: string;
  recommendation: string;
}

/**
 * Per-span analysis result
 */
interface SpanAnalysis {
  span_id: string;
  issues: AnalysisIssue[];
  assessment: string;
}

/**
 * Correlation between spans
 */
interface SpanCorrelation {
  spans: string[];
  relationship: string;
  combined_impact: string;
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
 */
const FOCUS_INSTRUCTIONS: Record<string, string> = {
  errors:
    'Focus on identifying errors, failures, and issues. Look for error messages, failed operations, tool execution problems, and unexpected behaviors.',
  performance:
    'Focus on performance issues. Analyze durations, identify bottlenecks, look for slow operations and their causes.',
  semantic:
    'Focus on semantic issues. Look for contradictory instructions, confusing prompts, misleading responses, and logical inconsistencies.',
  all: 'Analyze comprehensively. Look for errors, performance issues, semantic problems, and any other issues that might affect agent behavior.',
};

/**
 * Build the analysis prompt for the LLM
 */
function buildAnalysisPrompt(
  spansToAnalyze: SpanForAnalysis[],
  focus: string,
  userContext: string
): string {
  return `You are a trace analyzer. Find hidden issues and explain them from a data flow perspective.

## Focus Area
${FOCUS_INSTRUCTIONS[focus] || FOCUS_INSTRUCTIONS.all}

${userContext ? `## Additional Context\n${userContext}\n` : ''}

## Span Data to Analyze
${JSON.stringify(spansToAnalyze, null, 2)}

## CRITICAL: Extract Actual Data Snippets

For each issue, extract the **actual JSON or text** from the trace that shows the problem.

**GOOD** (shows actual data):
{
  "evidence": "{\\"status\\": \\"success\\", \\"results\\": [], \\"message\\": \\"could not find any relevant results\\"}",
  "explanation": "Status says success but results array is empty. Human would see 'success' and miss the failure."
}

**BAD** (generic - DO NOT DO THIS):
{
  "evidence": "Response lacks comprehensive synthesis",
  "explanation": "The agent did not provide complete information"
}

## Issue Types to Detect

1. **Silent Failures**: status="success" but results empty or message says failure
2. **Buried Warnings**: "WARNING", "INTERNAL NOTE", "fallback", "cached from 20XX" hidden in long text
3. **Rate Limiting**: "rate limit", "429", "retry after", "too many requests"
4. **Stale Data**: "cached", "outdated", "last verified on", old dates
5. **Truncated/Partial**: "truncated", "partial", "maximum exceeded"
6. **Tool Errors**: "Unknown tool:", "error", explicit error fields

Analyze the spans and return your findings.`;
}

/**
 * Extract span data for analysis from storage
 */
function extractSpanData(
  span: Span
): SpanForAnalysis {
  const attr = (span.attribute || {}) as Record<string, unknown>;
  const duration_ms =
    span.finish_time_us && span.start_time_us
      ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
      : 0;

  // Extract excerpts (limit to 2000 chars each to keep context manageable)
  const inputStr =
    typeof attr.input === 'string'
      ? attr.input
      : JSON.stringify(attr.input || '');
  const outputStr =
    typeof attr.output === 'string'
      ? attr.output
      : typeof attr.response === 'string'
        ? attr.response
        : JSON.stringify(attr.output || attr.response || '');

  return {
    span_id: span.span_id,
    operation_name: span.operation_name,
    duration_ms,
    input_excerpt:
      inputStr.slice(0, 2000) + (inputStr.length > 2000 ? '...[truncated]' : ''),
    output_excerpt:
      outputStr.slice(0, 2000) + (outputStr.length > 2000 ? '...[truncated]' : ''),
    error: attr.error as string | undefined,
    model: (attr.model_name || (attr.model as Record<string, unknown>)?.name || attr.model) as string | undefined,
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
                      enum: ['error', 'performance', 'semantic', 'other'],
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
                  },
                  required: ['type', 'severity', 'data_snippet', 'explanation'],
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
async function callLLMForAnalysis(prompt: string): Promise<string> {
  // Fetch Lucy config from backend to get model settings
  const lucyConfig = await fetchLucyConfig();
  const modelSettings = lucyConfig.model_settings;
  const provider = modelSettings?.provider;

  // Use config values with sensible defaults for analysis
  const model = modelSettings?.model || 'gpt-4o-mini';
  // Use lower temperature for analysis (more consistent) - override config if set
  const temperature = 0.2;
  const maxTokens = modelSettings?.max_tokens || 2000;

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
          content:
            'You are an expert trace analyzer. Find hidden issues in AI agent traces and explain them from a data flow perspective. Extract ACTUAL data snippets from traces, not generic descriptions.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature,
      max_tokens: maxTokens,
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

    // Limit to 5 spans to prevent context overflow
    if (ids.length > 5) {
      return {
        success: false,
        error:
          'Maximum 5 spans can be analyzed at once. Please reduce the number of span_ids.',
      };
    }

    // Check if storage has data
    if (spanStorage.size === 0) {
      return {
        success: false,
        error: 'No spans in memory. Call fetch_spans_summary first to load spans.',
      };
    }

    // Retrieve span content for analysis
    const spansToAnalyze: SpanForAnalysis[] = [];
    const notFound: string[] = [];

    for (const id of ids) {
      const span = spanStorage.get(id);
      if (span) {
        spansToAnalyze.push(extractSpanData(span));
      } else {
        notFound.push(id);
      }
    }

    if (spansToAnalyze.length === 0) {
      return {
        success: false,
        error: 'No matching spans found in memory.',
        not_found: notFound,
      };
    }

    // Build the analysis prompt and call LLM
    const prompt = buildAnalysisPrompt(spansToAnalyze, focus, userContext);
    const analysisContent = await callLLMForAnalysis(prompt);
    const analysis = parseLLMResponse(analysisContent);

    return {
      success: true,
      focus,
      spans_analyzed: spansToAnalyze.length,
      not_found: notFound.length > 0 ? notFound : undefined,
      analysis,
      _note:
        'LLM-powered deep analysis. Use this for complex issues that regex cannot detect.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze with LLM',
    };
  }
}
