import { DistriClient, type DistriMessage } from '@distri/core';
import type { DistriFnTool } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import type { Span } from '@/types/common-type';
import type { DatasetRecord } from '@/types/dataset-types';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

// Cache for Lucy config
let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

// =========================================================================
// Types
// =========================================================================

interface RecordForAnalysis {
  record_id: string;
  operation: string;
  label?: string;
  input_summary: string;
  output_summary: string;
  error?: string;
  existing_topic?: string;
}

interface SuggestedTopic {
  topic: string;
  description: string;
  applies_to: string[];
  confidence: number;
}

interface RecordTopicSuggestion {
  record_id: string;
  operation: string;
  suggested_topic: string;
}

interface TopicAnalysisResult {
  summary: string;
  suggested_topics: SuggestedTopic[];
  record_suggestions: RecordTopicSuggestion[];
}

export interface AnalyzeRecordsForTopicsParams {
  datasetId?: string;
  datasetName?: string;
  recordIds?: string[];
  maxTopics?: number;
}

export interface AnalyzeRecordsForTopicsResult {
  success: boolean;
  error?: string;
  dataset_name?: string;
  records_analyzed?: number;
  analysis?: TopicAnalysisResult;
  applied_count?: number;
  auto_applied?: boolean;
}

export interface GenerateTopicsParams {
  datasetId?: string;
  dataset_id?: string;
  datasetName?: string;
  dataset_name?: string;
  recordIds?: string[];
  record_ids?: string[];
  maxTopics?: number;
  max_topics?: number;
}

// =========================================================================
// Helpers
// =========================================================================

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractInputSummary(span: Span): string {
  const attr = (span.attribute || {}) as Record<string, unknown>;

  if (span.operation_name === 'api_invoke' && attr.request) {
    const request = typeof attr.request === 'string' ? safeParseJson(attr.request) : attr.request;
    const requestObj = request && typeof request === 'object' ? (request as Record<string, unknown>) : undefined;

    if (requestObj?.messages && Array.isArray(requestObj.messages)) {
      const userMsg = requestObj.messages.find((m: any) => m.role === 'user');
      if (userMsg?.content) {
        const content = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
        return content.substring(0, 300);
      }
    }
  }

  const input = attr.input;
  if (typeof input === 'string') {
    const parsed = safeParseJson(input);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed)) {
        const userMsg = parsed.find((m: any) => m.role === 'user');
        if (userMsg?.content) {
          return (typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content)).substring(0, 500);
        }
        const lastMsg = parsed[parsed.length - 1];
        if (lastMsg?.content) {
          return (typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)).substring(0, 500);
        }
      }
      return JSON.stringify(parsed).substring(0, 500);
    }
    return input.substring(0, 500);
  } else if (input) {
    return JSON.stringify(input).substring(0, 500);
  }

  return '';
}

function extractOutputSummary(span: Span): string {
  const attr = (span.attribute || {}) as Record<string, unknown>;

  if (span.operation_name === 'api_invoke' && attr.response) {
    const response = typeof attr.response === 'string' ? safeParseJson(attr.response) : attr.response;
    const responseObj = response && typeof response === 'object' ? (response as Record<string, unknown>) : undefined;

    if (responseObj?.choices && Array.isArray(responseObj.choices)) {
      const firstChoice = responseObj.choices[0] as any;
      if (firstChoice?.message?.content) {
        const content = typeof firstChoice.message.content === 'string'
          ? firstChoice.message.content
          : JSON.stringify(firstChoice.message.content);
        return content.substring(0, 300);
      }
    }
  }

  const output = attr.output || attr.response || attr.content;
  if (typeof output === 'string') {
    const parsed = safeParseJson(output);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        if (first?.message?.content) return JSON.stringify(first.message.content).substring(0, 500);
        return JSON.stringify(parsed).substring(0, 500);
      }
      const choices = (parsed as any).choices;
      if (Array.isArray(choices) && choices[0]?.message?.content) {
        return String(choices[0].message.content).substring(0, 500);
      }
      return JSON.stringify(parsed).substring(0, 500);
    }
    return output.substring(0, 500);
  } else if (output) {
    return JSON.stringify(output).substring(0, 500);
  }

  return '';
}

function extractRecordData(record: DatasetRecord): RecordForAnalysis {
  const span = record.data as Span;
  const attr = (span.attribute || {}) as Record<string, unknown>;

  return {
    record_id: record.id,
    operation: span.operation_name,
    label: attr.label as string | undefined,
    input_summary: extractInputSummary(span),
    output_summary: extractOutputSummary(span),
    error: attr.error as string | undefined,
    existing_topic: record.topic,
  };
}

// =========================================================================
// LLM setup
// =========================================================================

const TOPIC_ANALYSIS_SYSTEM_PROMPT = `You are a dataset topic categorization expert.

Goal: Analyze AI agent traces (dataset records) and suggest 2-4 meaningful topic tags.

Rules:
- Topics should be lowercase_with_underscores
- Focus on what the records DO, not their status (avoid "failed", "error", "success")
- Be specific, not generic (avoid "api_call", "request")
- Group similar patterns together
- Output MUST be valid JSON matching the provided schema (no markdown, no code fences)

Good topic examples:
- payment_processing
- flight_search
- user_authentication  
- rate_limit_handling
- hotel_booking

Bad topic examples:
- error (too generic)
- api_call (too generic)
- failed_request (focuses on status, not behavior)
`;

const TOPIC_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'topic_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of the records and why these topics were chosen',
        },
        suggested_topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic: { type: 'string', description: 'lowercase_with_underscores topic tag' },
              description: { type: 'string', description: 'Why this topic fits these records' },
              applies_to: {
                type: 'array',
                items: { type: 'string' },
                description: 'Record IDs that match this topic',
              },
              confidence: { type: 'number', description: 'Confidence 0-100' },
            },
            required: ['topic', 'description', 'applies_to', 'confidence'],
            additionalProperties: false,
          },
        },
        record_suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              record_id: { type: 'string' },
              operation: { type: 'string' },
              suggested_topic: { type: 'string' },
            },
            required: ['record_id', 'operation', 'suggested_topic'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'suggested_topics', 'record_suggestions'],
      additionalProperties: false,
    },
  },
};

function buildTopicAnalysisPrompt(records: RecordForAnalysis[], maxTopics: number): string {
  return `## Task
Analyze these ${records.length} dataset records and suggest ${maxTopics} topic tags.

## Records to Analyze
${JSON.stringify(records, null, 2)}

## Requirements
- Suggest ${maxTopics} topics maximum
- Each topic should apply to at least one record
- Provide confidence score 0-100 for each topic
- Match each record to its best suggested topic`;
}

async function callLLMForTopics(prompt: string): Promise<string> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const { response_format: _ignored, ...modelSettingsFromConfig } = lucyConfig.model_settings || {};

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: TOPIC_ANALYSIS_SYSTEM_PROMPT }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: prompt }]),
  ];

  const response = await distriClient.llm(messages, [], {
    headers: { 'x-label': 'finetune-topic-analysis' },
    model_settings: {
      ...modelSettingsFromConfig,
      model: modelSettingsFromConfig.model || 'openai/gpt-4.1',
      temperature: modelSettingsFromConfig.temperature ?? 0.3,
      response_format: TOPIC_ANALYSIS_RESPONSE_SCHEMA,
    },
  });

  if (!response.content) {
    throw new Error('LLM returned empty response');
  }

  return response.content;
}

function parseTopicAnalysisResponse(content: string): TopicAnalysisResult {
  try {
    return JSON.parse(content.trim());
  } catch {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
    } catch {
      // ignore
    }
    return { summary: 'Failed to parse LLM response', suggested_topics: [], record_suggestions: [] };
  }
}

// =========================================================================
// Tool implementations
// =========================================================================

export async function analyzeRecordsForTopics(params: Record<string, unknown>): Promise<AnalyzeRecordsForTopicsResult> {
  try {
    const { datasetId: paramDatasetId, datasetName, recordIds, maxTopics = 3 } = params as unknown as AnalyzeRecordsForTopicsParams;
    const autoApply = true;

    if (!paramDatasetId && !datasetName) {
      return { success: false, error: 'Either datasetId or datasetName is required' };
    }

    const allDatasets = await datasetsDB.getAllDatasets();
    let targetDatasetId = paramDatasetId;

    if (!targetDatasetId && datasetName) {
      const match = allDatasets.find(d => d.name.toLowerCase() === datasetName.toLowerCase());
      if (match) {
        targetDatasetId = match.id;
      } else {
        return {
          success: false,
          error: `Dataset with name "${datasetName}" not found. Available: ${allDatasets.map(d => d.name).join(', ')}`,
        };
      }
    }

    const dataset = allDatasets.find(d => d.id === targetDatasetId);
    if (!dataset || !targetDatasetId) {
      return { success: false, error: `Dataset ${targetDatasetId} not found` };
    }

    const allRecords = await datasetsDB.getRecordsByDatasetId(targetDatasetId);

    let selectedRecords = allRecords;
    if (recordIds && Array.isArray(recordIds) && recordIds.length > 0) {
      selectedRecords = allRecords.filter(r => recordIds.includes(r.id));
    }

    const MAX_ANALYSIS_LIMIT = 50;
    if (selectedRecords.length > MAX_ANALYSIS_LIMIT) {
      selectedRecords = selectedRecords
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_ANALYSIS_LIMIT);
    }

    if (selectedRecords.length === 0) {
      return { success: false, error: 'No matching records found in dataset' };
    }

    const recordsForAnalysis = selectedRecords.map(extractRecordData);

    const prompt = buildTopicAnalysisPrompt(recordsForAnalysis, maxTopics);
    const analysisContent = await callLLMForTopics(prompt);
    const analysis = parseTopicAnalysisResponse(analysisContent);

    let appliedCount = 0;
    if (autoApply && analysis.record_suggestions.length > 0) {
      for (const suggestion of analysis.record_suggestions) {
        const recordExists = selectedRecords.some(r => r.id === suggestion.record_id);
        if (recordExists) {
          await datasetsDB.updateRecordTopic(targetDatasetId, suggestion.record_id, suggestion.suggested_topic);
          appliedCount++;
        }
      }
    }

    return {
      success: true,
      dataset_name: dataset.name,
      records_analyzed: selectedRecords.length,
      analysis,
      applied_count: appliedCount,
      auto_applied: autoApply,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to analyze records' };
  }
}

export async function generateTopics(params: Record<string, unknown>): Promise<AnalyzeRecordsForTopicsResult> {
  const { datasetId, dataset_id, datasetName, dataset_name, recordIds, record_ids, maxTopics, max_topics } =
    params as unknown as GenerateTopicsParams;

  return analyzeRecordsForTopics({
    datasetId: datasetId || dataset_id,
    datasetName: datasetName || dataset_name,
    recordIds: recordIds || record_ids,
    maxTopics: maxTopics ?? max_topics,
  });
}

// =========================================================================
// Tool handler for provider/agent
// =========================================================================

export const generateTopicsHandler: ToolHandler = async ({ dataset_id, dataset_name, record_ids, max_topics }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }

  return generateTopics({
    dataset_id,
    dataset_name,
    record_ids: Array.isArray(record_ids) ? record_ids : undefined,
    max_topics: typeof max_topics === 'number' ? max_topics : undefined,
  });
};

export const generateTopicsTool: DistriFnTool = {
  name: 'generate_topics',
  description: 'Generate and auto-apply topic tags for dataset records using the LLM.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      dataset_name: { type: 'string', description: 'Optional dataset name for logging' },
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: specific record IDs to analyze (default: all)',
      },
      max_topics: {
        type: 'number',
        description: 'Optional: maximum number of topics to suggest (default: 3)',
      },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) => JSON.stringify(await generateTopicsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
