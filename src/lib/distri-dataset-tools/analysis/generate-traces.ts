import { DistriClient, type DistriMessage, type DistriFnTool } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import * as datasetsDB from '@/services/datasets-db';
import type { DatasetRecord } from '@/types/dataset-types';
import type { ToolHandler } from '../types';

let cachedLucyConfig: LucyConfig | null = null;
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

interface SyntheticToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface SyntheticMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: SyntheticToolCall[] | null;
  tool_call_id: string | null;
}

interface SyntheticTraceRecord {
  topic_path: string[];
  persona: string;
  messages: SyntheticMessage[];
}

interface GenerateTracesLLMResult {
  records: SyntheticTraceRecord[];
}

export interface GenerateTracesResult {
  success: boolean;
  error?: string;
  dataset_name?: string;
  created_count?: number;
  record_ids?: string[];
}

export interface GenerateTracesParams {
  datasetId?: string;
  dataset_id?: string;
  datasetName?: string;
  dataset_name?: string;
  recordIds?: string[];
  record_ids?: string[];
  count?: number;
  maxTurns?: number;
  max_turns?: number;
}

const DEFAULT_COUNT = 5;
const DEFAULT_MAX_TURNS = 3;

const TOOL_CATALOG = [
  {
    name: 'get_dataset_records',
    description: 'Fetch records from a dataset by id.',
    parameters: {
      type: 'object',
      properties: { dataset_id: { type: 'string' } },
      required: ['dataset_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'summarize_dataset',
    description: 'Summarize a dataset content and characteristics.',
    parameters: {
      type: 'object',
      properties: { dataset_id: { type: 'string' } },
      required: ['dataset_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_duplicates',
    description: 'Find potential duplicate records in a dataset.',
    parameters: {
      type: 'object',
      properties: { dataset_id: { type: 'string' } },
      required: ['dataset_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_topics',
    description: 'Generate hierarchical topic tags for dataset records.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string' },
        record_ids: { type: 'array', items: { type: 'string' } },
        max_depth: { type: 'number' },
        degree: { type: 'number' },
      },
      required: ['dataset_id'],
      additionalProperties: false,
    },
  },
] as const;

const GENERATE_TRACES_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'synthetic_traces',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic_path: { type: 'array', items: { type: 'string' } },
              persona: { type: 'string' },
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
                    content: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    tool_calls: {
                      anyOf: [
                        { type: 'null' },
                        {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              type: { type: 'string', enum: ['function'] },
                              function: {
                                type: 'object',
                                properties: {
                                  name: { type: 'string' },
                                  arguments: { type: 'string' },
                                },
                                required: ['name', 'arguments'],
                                additionalProperties: false,
                              },
                            },
                            required: ['id', 'type', 'function'],
                            additionalProperties: false,
                          },
                        },
                      ],
                    },
                    tool_call_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  },
                  required: ['role', 'content', 'tool_calls', 'tool_call_id'],
                  additionalProperties: false,
                },
              },
            },
            required: ['topic_path', 'persona', 'messages'],
            additionalProperties: false,
          },
        },
      },
      required: ['records'],
      additionalProperties: false,
    },
  },
};

function topicPathsFromPath(path: string[]): string[][] {
  const clean = path.map((t) => (t || '').trim()).filter(Boolean);
  const out: string[][] = [];
  for (let i = 1; i <= clean.length; i++) out.push(clean.slice(0, i));
  return out;
}

function pickTopicPathFromRecord(record: DatasetRecord): string[] | null {
  const paths = record.topic_paths || [];
  if (paths.length === 0) return null;
  // Pick the deepest leaf-ish path.
  let chosen = paths[0];
  for (const p of paths) {
    if (p.length > chosen.length) chosen = p;
  }
  return chosen;
}

function buildSyntheticTraceData(datasetId: string, datasetName: string, rec: SyntheticTraceRecord) {
  const trace_id = crypto.randomUUID();
  const span_id = crypto.randomUUID();
  const now = Date.now();

  const requestObj = {
    model: 'synthetic',
    messages: rec.messages,
    tools: TOOL_CATALOG.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    metadata: {
      dataset_id: datasetId,
      dataset_name: datasetName,
      topic_path: rec.topic_path,
      persona: rec.persona,
      generated_at_ms: now,
    },
  };

  const lastAssistant = [...rec.messages].reverse().find((m) => m.role === 'assistant');
  const responseObj = {
    choices: [
      {
        message: lastAssistant || { role: 'assistant', content: '', tool_calls: null, tool_call_id: null },
        finish_reason: 'stop',
      },
    ],
  };

  return {
    trace_id,
    span_id,
    operation_name: 'synthetic_trace',
    attribute: {
      provider_name: 'synthetic',
      model_name: 'synthetic',
      label: 'generated_trace',
      request: JSON.stringify(requestObj),
      response: JSON.stringify(responseObj),
    },
  };
}

function buildPrompt(topicPath: string[], maxTurns: number, count: number): string {
  return `Generate ${count} synthetic agent traces for training.

Topic context: ${topicPath.join(' -> ')}

Available tools (call some of these):
${TOOL_CATALOG.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

Requirements:
- Output JSON matching the schema.
- For each record, include a realistic persona.
- Produce a conversation with up to ${maxTurns} user turns.
- Include at least 1 tool call and a matching tool result message (role=tool with tool_call_id).
- Messages must be coherent and realistic.
- topic_path must be lowercase_with_underscores.
`;
}

async function callLLM(prompt: string): Promise<GenerateTracesLLMResult> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });

  const modelSettingsFromConfig = lucyConfig.model_settings || {};

  const messages: DistriMessage[] = [
    DistriClient.initDistriMessage('system', [{ part_type: 'text', data: 'You generate realistic synthetic agent traces with tool calls.' }]),
    DistriClient.initDistriMessage('user', [{ part_type: 'text', data: prompt }]),
  ];

  const response = await distriClient.llm(messages, [], {
    model_settings: {
      ...modelSettingsFromConfig,
      model: modelSettingsFromConfig.model || 'openai/gpt-4.1-mini',
      temperature: modelSettingsFromConfig.temperature ?? 0.5,
      response_format: GENERATE_TRACES_SCHEMA,
    },
  });

  if (!response.content) {
    throw new Error('LLM returned empty response');
  }

  return JSON.parse(response.content.trim());
}

export async function generateTraces(params: Record<string, unknown>): Promise<GenerateTracesResult> {
  try {
    const { datasetId, dataset_id, recordIds, record_ids, count, maxTurns, max_turns } =
      params as unknown as GenerateTracesParams;

    const resolvedDatasetId = datasetId || dataset_id;
    if (!resolvedDatasetId) {
      return { success: false, error: 'dataset_id is required' };
    }

    const allDatasets = await datasetsDB.getAllDatasets();
    const dataset = allDatasets.find((d) => d.id === resolvedDatasetId);
    if (!dataset) {
      return { success: false, error: `Dataset ${resolvedDatasetId} not found` };
    }

    const allRecords = await datasetsDB.getRecordsByDatasetId(resolvedDatasetId);
    const selectedIds = (recordIds || record_ids || []).filter(Boolean);
    const seedRecords = selectedIds.length > 0 ? allRecords.filter((r) => selectedIds.includes(r.id)) : allRecords;

    const topicSeedPath = seedRecords.length > 0
      ? (pickTopicPathFromRecord(seedRecords[Math.floor(Math.random() * seedRecords.length)]) || [dataset.name.toLowerCase().replace(/\s+/g, '_')])
      : [dataset.name.toLowerCase().replace(/\s+/g, '_')];

    const n = typeof count === 'number' ? count : DEFAULT_COUNT;
    const turns = typeof maxTurns === 'number' ? maxTurns : typeof max_turns === 'number' ? max_turns : DEFAULT_MAX_TURNS;

    const prompt = buildPrompt(topicSeedPath, turns, n);
    const llmResult = await callLLM(prompt);

    const recordsToAdd = llmResult.records.map((r) => {
      const normalize = (t: string) => t.trim().replace(/\s+/g, '_').toLowerCase();
      const topicPath = (r.topic_path || []).map((t) => (t || '').trim()).filter(Boolean).map(normalize);
      const topicPaths = topicPathsFromPath(topicPath);
      const data = buildSyntheticTraceData(resolvedDatasetId, dataset.name, { ...r, topic_path: topicPath });

      return {
        data,
        topic_paths: topicPaths,
        is_generated: true,
        evaluation: undefined,
      };
    });

    const createdCount = await datasetsDB.addRecordsToDataset(resolvedDatasetId, recordsToAdd);

    return {
      success: true,
      dataset_name: dataset.name,
      created_count: createdCount,
    };
  } catch (error) {
    return { success: false, error: `LLM error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export const generateTracesHandler: ToolHandler = async (input) => {
  return generateTraces(input);
};

export const generateTracesTool: DistriFnTool = {
  name: 'generate_traces',
  description: 'Generate synthetic trace records (with tool calls) and add them to a dataset.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_ids: { type: 'array', items: { type: 'string' }, description: 'Optional: seed from selected records' },
      count: { type: 'number', description: 'Number of traces to generate (default 5)' },
      max_turns: { type: 'number', description: 'Max user turns per trace (default 3)' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) => JSON.stringify(await generateTracesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
