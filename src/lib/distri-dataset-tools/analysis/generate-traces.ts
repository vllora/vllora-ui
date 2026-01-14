import { DistriClient, type DistriMessage, type DistriFnTool } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import * as datasetsDB from '@/services/datasets-db';
import type { DataInfo, DatasetRecord } from '@/types/dataset-types';
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

// When seeding from selected records, generate 1 trace per leaf topic path.
// This value caps the number of leaf topics used per seed record.
const DEFAULT_LEAF_TRACES_PER_SEED = 2;

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

function isPrefixPath(prefix: string[], full: string[]): boolean {
  if (prefix.length >= full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

function getLeafTopicPaths(topicPaths: string[][]): string[][] {
  const cleaned = topicPaths
    .filter((p) => Array.isArray(p) && p.length > 0)
    .map((p) => p.map((t) => (t || '').trim()).filter(Boolean))
    .filter((p) => p.length > 0);

  const leaves: string[][] = [];
  for (const candidate of cleaned) {
    const isPrefixOfAny = cleaned.some((other) => isPrefixPath(candidate, other));
    if (!isPrefixOfAny) leaves.push(candidate);
  }

  return leaves.sort((a, b) => a.join('/').localeCompare(b.join('/')));
}

function extractSeedTools(record?: DatasetRecord): any[] {
  if (!record) return [];
  const data = (record.data || {}) as any;

  // DataInfo-style
  const inputTools = data?.input?.tools;
  if (Array.isArray(inputTools) && inputTools.length > 0) return inputTools;

  // Span-like fallback
  const requestStr = data?.attribute?.request;
  if (typeof requestStr === 'string') {
    try {
      const parsed = JSON.parse(requestStr);
      if (Array.isArray(parsed?.tools) && parsed.tools.length > 0) return parsed.tools;
    } catch {
      // ignore
    }
  }

  return [];
}

function condenseToolsForPrompt(tools: any[]): Array<{ name: string; required: string[]; properties: string[] }> {
  const out: Array<{ name: string; required: string[]; properties: string[] }> = [];
  for (const t of tools) {
    const fn = t?.function;
    const name = fn?.name;
    const params = fn?.parameters;
    if (typeof name !== 'string') continue;
    const required = Array.isArray(params?.required) ? params.required : [];
    const properties = params?.properties && typeof params.properties === 'object' ? Object.keys(params.properties) : [];
    out.push({ name, required, properties });
  }
  return out;
}

function normalizeAndValidateMessages(messages: SyntheticMessage[], toolNames: Set<string>): SyntheticMessage[] {
  const normalized: SyntheticMessage[] = [];
  const assistantToolCallIds = new Set<string>();

  for (const raw of messages) {
    const role = raw.role;
    const msg: SyntheticMessage = {
      role,
      content: raw.content ?? null,
      tool_calls: raw.tool_calls ?? null,
      tool_call_id: raw.tool_call_id ?? null,
    };

    if (role === 'user' || role === 'system') {
      msg.tool_calls = null;
      msg.tool_call_id = null;
    }

    if (role === 'assistant') {
      if (Array.isArray(msg.tool_calls)) {
        const cleaned: SyntheticToolCall[] = [];
        for (const tc of msg.tool_calls) {
          const name = tc?.function?.name;
          if (!name || !toolNames.has(name)) continue;
          const id = tc.id || crypto.randomUUID();
          cleaned.push({
            id,
            type: 'function',
            function: {
              name,
              arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments ?? {}),
            },
          });
          assistantToolCallIds.add(id);
        }
        msg.tool_calls = cleaned.length > 0 ? cleaned : null;
      }
      msg.tool_call_id = null;
    }

    if (role === 'tool') {
      // tool messages must reference a prior assistant tool call id
      if (!msg.tool_call_id || !assistantToolCallIds.has(msg.tool_call_id)) {
        continue;
      }
      msg.tool_calls = null;
      if (msg.content === null) msg.content = '';
    }

    normalized.push(msg);
  }

  return normalized;
}

function buildSyntheticTraceDataInfo(
  rec: SyntheticTraceRecord,
  tools: any[]
): DataInfo {
  const toolNames = new Set(
    tools
      .map((t: any) => t?.function?.name)
      .filter((n: any) => typeof n === 'string')
  );

  const normalizedMessages = normalizeAndValidateMessages(rec.messages, toolNames);
  const lastAssistant = [...normalizedMessages].reverse().find((m) => m.role === 'assistant');

  return {
    input: {
      messages: normalizedMessages,
      tools,
    },
    output: {
      messages: lastAssistant || { role: 'assistant', content: '' },
      tool_calls: (lastAssistant as any)?.tool_calls,
      finish_reason: 'stop',
    },
  };
}

function buildPrompt(
  topicPath: string[],
  maxTurns: number,
  count: number,
  seedRecordId: string | undefined,
  seedMessages: any[] | undefined,
  tools: any[]
): string {
  const condensedTools = condenseToolsForPrompt(tools);
  const seedExcerpt = Array.isArray(seedMessages)
    ? seedMessages.slice(Math.max(0, seedMessages.length - 8))
    : [];

  return `You are generating realistic synthetic agent traces.

Seed record id: ${seedRecordId || 'none'}
Target topic_path (MUST match exactly): ${JSON.stringify(topicPath)}

Seed trace excerpt (last messages):
${JSON.stringify(seedExcerpt, null, 2)}

Available tools (MUST match these schemas):
${JSON.stringify(condensedTools, null, 2)}

Task:
Generate ${count} synthetic traces similar in style and domain to the seed trace.

Hard requirements:
- Output JSON matching the schema.
- tool_calls may ONLY appear on assistant messages.
- user/system/tool messages must have tool_calls=null.
- Every tool call must be followed by a tool message with matching tool_call_id.
- Tool arguments must be valid JSON and must include required fields.
- Produce a conversation with up to ${maxTurns} user turns.
- Include at least 1 tool call + tool result.
- topic_path must be lowercase_with_underscores and MUST equal the provided Target topic_path.
`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
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

    const normalize = (t: string) => t.trim().replace(/\s+/g, '_').toLowerCase();

    const turns = typeof maxTurns === 'number' ? maxTurns : typeof max_turns === 'number' ? max_turns : DEFAULT_MAX_TURNS;

    const seedRecords = selectedIds.length > 0
      ? allRecords.filter((r) => selectedIds.includes(r.id))
      : [undefined];

    const TRACE_BATCH_SIZE = 3;
    let createdTotal = 0;
    const batchErrors: string[] = [];

    for (const seedRecord of seedRecords) {
      const seedData = (seedRecord?.data || {}) as any;
      const seedMessages = seedData?.input?.messages;
      const tools = (extractSeedTools(seedRecord).length > 0 ? extractSeedTools(seedRecord) : TOOL_CATALOG.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })));

      // When seeding from selected records, interpret `count` as the number of leaf topic paths to use.
      // We generate exactly one trace per leaf topic path.
      if (seedRecord) {
        const leafLimit = typeof count === 'number' ? count : DEFAULT_LEAF_TRACES_PER_SEED;
        const leaves = getLeafTopicPaths(seedRecord.topic_paths || []);
        const targets = (leaves.length > 0 ? leaves : [pickTopicPathFromRecord(seedRecord) || [dataset.name]])
          .map((p) => p.map(normalize));

        for (const targetTopicPath of targets.slice(0, Math.max(0, leafLimit))) {
          const prompt = buildPrompt(targetTopicPath, turns, 1, seedRecord.id, seedMessages, tools);
          const llmResult = await callLLM(prompt);

          const recordsToAdd = llmResult.records.map((r) => {
            // Enforce the requested topic path for this generated trace.
            const topicPath = targetTopicPath;
            const topicPaths = topicPathsFromPath(topicPath);
            const data = buildSyntheticTraceDataInfo(
              { ...r, topic_path: topicPath },
              tools
            );

            return {
              data,
              metadata: {
                persona: r.persona,
                seed_record_id: seedRecord.id,
                seed_topic_path: targetTopicPath,
                generated_at_ms: Date.now(),
              },
              topic_paths: topicPaths,
              is_generated: true,
              evaluation: undefined,
            };
          });

          try {
            const created = await datasetsDB.addRecordsToDataset(resolvedDatasetId, recordsToAdd);
            createdTotal += created;
          } catch (e) {
            batchErrors.push(
              `seed=${seedRecord.id} leaf=${targetTopicPath.join('/')} : ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }

        continue;
      }

      // No selection: generate count TOTAL traces (batched).
      const totalCount = typeof count === 'number' ? count : DEFAULT_COUNT;
      const seedTopicPath = [normalize(dataset.name)];

      for (let remaining = totalCount; remaining > 0; remaining -= TRACE_BATCH_SIZE) {
        const batchCount = Math.min(TRACE_BATCH_SIZE, remaining);
        const prompt = buildPrompt(seedTopicPath, turns, batchCount, undefined, seedMessages, tools);
        const llmResult = await callLLM(prompt);

        const recordsToAdd = llmResult.records.map((r) => {
          const topicPath = (r.topic_path || []).map((t) => (t || '').trim()).filter(Boolean).map(normalize);
          const topicPaths = topicPathsFromPath(topicPath);
          const data = buildSyntheticTraceDataInfo(
            { ...r, topic_path: topicPath },
            tools
          );

          return {
            data,
            metadata: {
              persona: r.persona,
              seed_record_id: undefined,
              seed_topic_path: seedTopicPath,
              generated_at_ms: Date.now(),
            },
            topic_paths: topicPaths,
            is_generated: true,
            evaluation: undefined,
          };
        });

        try {
          const created = await datasetsDB.addRecordsToDataset(resolvedDatasetId, recordsToAdd);
          createdTotal += created;
        } catch (e) {
          batchErrors.push(
            `seed=none batchCount=${batchCount}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }

    return {
      success: true,
      dataset_name: dataset.name,
      created_count: createdTotal,
      error: batchErrors.length > 0 ? `${batchErrors.length} batch(es) failed: ${batchErrors.join(' | ')}` : undefined,
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
      count: { type: 'number', description: 'If record_ids provided: number of leaf topics to generate per record (default 2). Else: total traces (default 5).' },
      max_turns: { type: 'number', description: 'Max user turns per trace (default 3)' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) => JSON.stringify(await generateTracesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
