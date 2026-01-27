import { DistriClient, type DistriFnTool, type DistriMessage } from '@distri/core';
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

export interface GenerateTracesResult {
  success: boolean;
  error?: string;
  dataset_name?: string;
  created_count?: number;
  record_ids?: string[];
}

export interface GenerateTracesParams {
  dataset_id?: string;
  dataset_name?: string;
  record_ids?: string[];
  count?: number; 
  max_turns?: number;
  /** Number of parallel generation requests (default: 5) */
  concurrency?: number;
  /** Whether to generate for all topics or only selected ones */
  target_topics?: 'all' | 'selected';
  /** List of topic names to generate for (when targetTopics is 'selected') */
  selected_topics?: string[];
  /** Callback for progress updates (can be async) */
  on_progress?: (progress: { completed: number; total: number }) => void | Promise<void>;
  /** Callback when new records are added - receives the created records */
  on_records_added?: (records: DatasetRecord[]) => void | Promise<void>;
}

const DEFAULT_PERSONA_GUIDANCE = 'Diverse and realistic';

const SIMULATED_PERSONA_BATCH_PROMPT = `Create a JSON list of 10 diverse user personas who would be interested in the following topic.

Topic: {{subtopics}}
Topic Guidance: {{persona_guidance}}

For each persona, provide:
1. A short, catchy name for the persona (e.g., "The Curious Child", "The Skeptical Debater").
2. A 1–2 sentence description of the persona's personality, goals, typical behavior and chatting style.

Make the personas highly varied across dimensions such as:
- Age and life stage (child, teenager, adult, elderly)
- Attitude toward the AI (trusting, skeptical, playful, commanding, fearful, worshipful)
- Communication style (formal, casual, poetic, terse, overly polite, rude)
- Goals or intent (seeking knowledge, entertainment, emotional support, debate, creative collaboration, practical help, testing limits)
- Background or archetype (scientist, artist, detective, conspiracy theorist, etc.)

Output Format:
[
  "Persona Description 1...",
  "Persona Description 2...",
  ...
]

Ensure the list is diverse and creative. Return ONLY the JSON array of strings.`;

const FINAL_USER_MESSAGE_VARIATION_PROMPT = `You are a user in an ongoing conversation with an AI assistant.

Your Persona:
{{persona}}

Topic Context:
{{subtopics}}

Conversation History:
{{conversation_history}}

Original Last User Message:
{{original_user_message}}

Your task is to create a VARIATION of the original last user message above.
- Keep the same intent and topic as the original
- Rephrase it in a way that fits your persona
- Keep it natural and concise (1-3 sentences)
- It should still make sense in the conversation context
- Do NOT copy the original verbatim - create a meaningful variation

Write only the new user message, nothing else.`;

function initMessage(role: 'system' | 'user' | 'assistant', content: string): DistriMessage {
  return DistriClient.initDistriMessage(role, [{ part_type: 'text', data: content }]);
}

function cleanJsonString(raw: string): string {
  return raw.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(cleanJsonString(raw));
  } catch {
    return null;
  }
}

function parsePersonaList(raw: string): string[] {
  const parsed = tryParseJson<unknown>(raw);
  if (Array.isArray(parsed)) {
    return parsed.map((p) => (typeof p === 'string' ? p : JSON.stringify(p)));
  }
  if (typeof parsed === 'string') {
    return [parsed];
  }
  const cleaned = cleanJsonString(raw);
  return cleaned ? [cleaned] : [];
}

interface TopicHierarchyNode {
  id: string;
  name: string;
  children?: TopicHierarchyNode[];
}

interface LeafTopic {
  name: string;
  path: string[];
}

function extractLeafTopicsFromHierarchy(nodes: TopicHierarchyNode[], parentPath: string[] = []): LeafTopic[] {
  const leaves: LeafTopic[] = [];
  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];
    if (node.children && node.children.length > 0) {
      // Recurse into children with current path
      leaves.push(...extractLeafTopicsFromHierarchy(node.children, currentPath));
    } else {
      // Leaf node - add with full path
      leaves.push({ name: node.name, path: currentPath });
    }
  }
  return leaves;
}

function extractSeedTools(record?: DatasetRecord): any[] {
  if (!record) return [];
  const data = (record.data || {}) as any;

  const inputTools = data?.input?.tools;
  if (Array.isArray(inputTools) && inputTools.length > 0) return inputTools;

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

function extractSeedMessages(record?: DatasetRecord): any[] {
  const data = (record?.data || {}) as any;
  return Array.isArray(data?.input?.messages) ? data.input.messages : [];
}

function normalizeAssistantToolCalls(toolCalls: unknown, toolNames: Set<string>): SyntheticToolCall[] | null {
  if (!Array.isArray(toolCalls) || toolNames.size === 0) return null;

  const cleaned: SyntheticToolCall[] = [];
  for (const tc of toolCalls as Array<any>) {
    const name = tc?.function?.name;
    if (!name || !toolNames.has(name)) continue;
    const id = typeof tc.id === 'string' ? tc.id : crypto.randomUUID();
    const args = typeof tc?.function?.arguments === 'string'
      ? tc.function.arguments
      : JSON.stringify(tc?.function?.arguments ?? {});
    cleaned.push({
      id,
      type: 'function',
      function: { name, arguments: args },
    });
  }

  return cleaned.length > 0 ? cleaned : null;
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
        const cleaned = normalizeAssistantToolCalls(msg.tool_calls, toolNames) || [];
        for (const tc of cleaned) assistantToolCallIds.add(tc.id);
        msg.tool_calls = cleaned.length > 0 ? cleaned : null;
      }
      msg.tool_call_id = null;
    }

    if (role === 'tool') {
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

function buildSyntheticTraceDataInfo(rec: SyntheticTraceRecord, tools: any[]): DataInfo {
  const toolNames = new Set(
    tools
      .map((t: any) => t?.function?.name)
      .filter((n: any) => typeof n === 'string')
  );

  const normalizedMessages = normalizeAndValidateMessages(rec.messages, toolNames);

  return {
    input: {
      messages: normalizedMessages,
      tools,
    },
    output: {},
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureResponseFormat(format?: unknown): unknown | undefined {
  if (!format || typeof format !== 'object') return undefined;
  const jsonSchema = (format as { json_schema?: { name?: unknown } }).json_schema;
  if (!jsonSchema || typeof jsonSchema !== 'object') return format;
  const name = (jsonSchema as { name?: unknown }).name;
  if (typeof name !== 'string') {
    return { ...(format as object), json_schema: { ...jsonSchema, name: 'assistant_turn' } };
  }
  const normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeName = normalized.length > 0 ? normalized : 'assistant_turn';
  if (safeName !== name) {
    return { ...(format as object), json_schema: { ...jsonSchema, name: safeName } };
  }
  return format;
}

async function callLLM(
  messages: DistriMessage[],
  options?: { responseFormat?: unknown; temperature?: number }
): Promise<string> {
  const lucyConfig = await fetchLucyConfigCached();
  const rawUrl = lucyConfig.distri_url || getDistriUrl();
  const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
  const distriClient = DistriClient.create({ baseUrl });
  const modelSettingsFromConfig = lucyConfig.model_settings || {};
  const { response_format: _ignoredResponseFormat, ...modelSettingsBase } = modelSettingsFromConfig as Record<string, unknown>;
  const responseFormat = ensureResponseFormat(options?.responseFormat);

  const modelSettings = {
    ...modelSettingsBase,
    model: modelSettingsFromConfig.model || 'openai/gpt-4.1-mini',
    temperature: options?.temperature ?? modelSettingsFromConfig.temperature ?? 0.5,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await distriClient.llm(messages, [], { model_settings: modelSettings });
      if (!response.content) {
        throw new Error('LLM returned empty response');
      }
      return response.content.trim();
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await sleep(800 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

async function callLLMText(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = systemPrompt
    ? [initMessage('system', systemPrompt), initMessage('user', prompt)]
    : [initMessage('user', prompt)];
  return callLLM(messages);
}

async function ensurePersona(
  personaCache: Map<string, string[]>,
  topicKey: string,
  contextStr: string
): Promise<string> {
  const cached = personaCache.get(topicKey) || [];
  if (cached.length === 0) {
    const prompt = SIMULATED_PERSONA_BATCH_PROMPT
      .replace('{{subtopics}}', contextStr)
      .replace('{{persona_guidance}}', DEFAULT_PERSONA_GUIDANCE);
    const raw = await callLLMText(prompt);
    const personas = parsePersonaList(raw);
    if (personas.length > 0) {
      personaCache.set(topicKey, personas);
    } else {
      personaCache.set(topicKey, ['A curious user interested in the topic.']);
    }
  }

  const next = personaCache.get(topicKey) || [];
  return next.shift() || 'A curious user interested in the topic.';
}

async function generateFinalUserMessage(
  contextStr: string,
  persona: string,
  existingMessages: SyntheticMessage[],
  originalUserMessage: string
): Promise<string> {
  // Build conversation history string (excluding the last user message we're replacing)
  const historyParts: string[] = [];
  for (const msg of existingMessages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') historyParts.push(`User: ${msg.content}`);
    if (msg.role === 'assistant') historyParts.push(`Assistant: ${msg.content}`);
    if (msg.role === 'tool') historyParts.push(`[Tool result]: ${msg.content}`);
  }

  const prompt = FINAL_USER_MESSAGE_VARIATION_PROMPT
    .replace('{{subtopics}}', contextStr)
    .replace('{{persona}}', persona)
    .replace('{{conversation_history}}', historyParts.join('\n'))
    .replace('{{original_user_message}}', originalUserMessage);

  const content = await callLLMText(prompt);
  return content.trim();
}

async function simulateConversation(
  topicPath: string[],
  seedMessages: any[],
  tools: any[],
  personaCache: Map<string, string[]>
): Promise<SyntheticTraceRecord | null> {
  const topicStr = topicPath.join(' -> ');
  const topicKey = topicPath.join('/');
  const contextStr = topicStr;

  const persona = await ensurePersona(personaCache, topicKey, contextStr);

  // Copy seed messages
  const messages: SyntheticMessage[] = seedMessages.map(m => ({
    role: m.role,
    content: m.content ?? null,
    tool_calls: m.tool_calls ?? null,
    tool_call_id: m.tool_call_id ?? null,
  }));

  // Find last user message index
  const lastUserIndex = messages.map((m, i) => m.role === 'user' ? i : -1)
    .filter(i => i !== -1)
    .pop();

  if (lastUserIndex !== undefined && lastUserIndex >= 0) {
    // Get original user message content
    const originalUserMessage = messages[lastUserIndex].content || '';

    // Get conversation history BEFORE the last user message (for context)
    const historyBeforeLastUser = messages.slice(0, lastUserIndex);

    // Generate variation of the last user message
    const newUserMsg = await generateFinalUserMessage(
      contextStr,
      persona,
      historyBeforeLastUser,
      originalUserMessage
    );

    // Replace the last user message with the variation
    messages[lastUserIndex] = {
      role: 'user',
      content: newUserMsg,
      tool_calls: null,
      tool_call_id: null,
    };
  }

  return { topic_path: topicPath, persona, messages };
}

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_RECORDS_PER_TOPIC = 5;

interface TopicGenerationTask {
  topicName: string;
  topicPath: string[];
  recordsToGenerate: number;
  seedRecords: (DatasetRecord | undefined)[];
  tools: any[];
}

interface TopicGenerationResult {
  topicName: string;
  records: Array<{
    data: DataInfo;
    metadata?: Record<string, unknown>;
    topic?: string;
    is_generated?: boolean;
    evaluation?: undefined;
  }>;
  errors: string[];
}

/**
 * Callbacks for tracking generation progress across parallel topics
 */
interface GenerationCallbacks {
  datasetId: string;
  totalExpectedRecords: number;
  /** Shared counter for tracking total created records across parallel topics */
  progressCounter: { count: number };
  on_progress?: (progress: { completed: number; total: number }) => void | Promise<void>;
  on_records_added?: (records: DatasetRecord[]) => void | Promise<void>;
}

/**
 * Generate a single record for a topic
 * Returns the record data or null if generation failed
 */
async function generateSingleRecord(
  task: TopicGenerationTask,
  recordIndex: number,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<{ record: TopicGenerationResult['records'][0]; error?: string } | { record: null; error: string }> {
  try {
    const seedRecord = task.seedRecords[recordIndex % task.seedRecords.length];
    const seedMessages = extractSeedMessages(seedRecord);

    const simulated = await simulateConversation(
      task.topicPath,
      seedMessages,
      task.tools,
      personaCache
    );

    if (!simulated) {
      return { record: null, error: `${task.topicName}[${recordIndex + 1}]: simulation returned empty` };
    }

    const data = buildSyntheticTraceDataInfo(simulated, task.tools);
    const leafTopic = task.topicPath.length > 0 ? task.topicPath[task.topicPath.length - 1] : undefined;

    const recordData = {
      data,
      metadata: {
        persona: simulated.persona,
        seed_record_id: seedRecord?.id,
        seed_topic_path: task.topicPath,
        generated_at_ms: Date.now(),
      },
      topic: leafTopic,
      is_generated: true,
      evaluation: undefined,
    };

    // Add record to DB immediately for real-time UI update
    try {
      const addedRecords = await datasetsDB.addRecordsToDataset(callbacks.datasetId, [recordData]);

      // Update shared progress counter atomically
      callbacks.progressCounter.count += addedRecords.length;

      // Notify UI with newly created record
      if (callbacks.on_records_added && addedRecords.length > 0) {
        await callbacks.on_records_added(addedRecords);
      }

      // Report progress after each record
      if (callbacks.on_progress) {
        await callbacks.on_progress({
          completed: callbacks.progressCounter.count,
          total: callbacks.totalExpectedRecords
        });
      }

      return { record: recordData };
    } catch (dbErr) {
      return { record: null, error: `${task.topicName}[${recordIndex + 1}]: DB add failed - ${dbErr instanceof Error ? dbErr.message : String(dbErr)}` };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { record: null, error: `${task.topicName}[${recordIndex + 1}]: ${errorMsg}` };
  }
}

/**
 * Generate multiple records for a single topic
 * Generates all records in parallel for maximum throughput
 */
async function generateRecordsForTopic(
  task: TopicGenerationTask,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<TopicGenerationResult> {
  // Generate all records for this topic in parallel
  const recordPromises = Array.from({ length: task.recordsToGenerate }, (_, i) =>
    generateSingleRecord(task, i, personaCache, callbacks)
  );

  const results = await Promise.allSettled(recordPromises);

  const records: TopicGenerationResult['records'] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.record) {
        records.push(result.value.record);
      }
      if (result.value.error) {
        errors.push(result.value.error);
      }
    } else {
      errors.push(`${task.topicName}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  }

  return { topicName: task.topicName, records, errors };
}

export async function generateTraces(params: GenerateTracesParams): Promise<GenerateTracesResult> {
  try {
    const { dataset_id, record_ids, count, concurrency, target_topics, selected_topics, on_progress, on_records_added } =
      params;

    const resolvedDatasetId = dataset_id;
    if (!resolvedDatasetId) {
      return { success: false, error: 'dataset_id is required' };
    }

    const dataset = await datasetsDB.getDatasetById(resolvedDatasetId);
    if (!dataset) {
      return { success: false, error: `Dataset ${resolvedDatasetId} not found` };
    }
    const topicHierarchy = dataset.topicHierarchy;

    const selectedIds = (record_ids || []).filter(Boolean) as string[];
    // Fetch seed records if IDs provided, otherwise use undefined as placeholder
    const selectedRecords = selectedIds.length > 0
      ? await datasetsDB.getRecordsByDatasetId(resolvedDatasetId, selectedIds)
      : [];
    const seedRecords = selectedRecords.length > 0 ? selectedRecords : [undefined];

    // Build target topics list based on target_topics setting
    // Extract leaf topics from hierarchy with full paths
    const hierarchyLeafTopics = topicHierarchy?.hierarchy && topicHierarchy.hierarchy.length > 0
      ? extractLeafTopicsFromHierarchy(topicHierarchy.hierarchy)
      : [];

    let targetLeafTopics: LeafTopic[] = [];
    if (target_topics === 'selected' && selected_topics && selected_topics.length > 0) {
      // Find the full paths for selected topic names from hierarchy
      targetLeafTopics = selected_topics
        .map(name => hierarchyLeafTopics.find(t => t.name === name))
        .filter((t): t is LeafTopic => t !== undefined);
    } else {
      targetLeafTopics = hierarchyLeafTopics;
    }

    // Error if no topics found
    if (targetLeafTopics.length === 0) {
      return {
        success: false,
        error: 'No topics found. Please configure a topic hierarchy or select specific topics to generate data for.'
      };
    }

    const recordsPerTopic = typeof count === 'number' && count > 0 ? count : DEFAULT_RECORDS_PER_TOPIC;
    const totalExpectedRecords = targetLeafTopics.length * recordsPerTopic;

    const effectiveConcurrency = typeof concurrency === 'number' && concurrency > 0
      ? Math.min(concurrency, 10)
      : DEFAULT_CONCURRENCY;

    // Extract tools from seed records (use first available or fallback to catalog)
    const seedTools = seedRecords.find(r => r !== undefined) ? extractSeedTools(seedRecords.find(r => r !== undefined)) : [];
    const effectiveTools = seedTools.length > 0
      ? seedTools
      : [];

    // Create one task per topic with full path
    const topicTasks: TopicGenerationTask[] = targetLeafTopics.map(topic => ({
      topicName: topic.name,
      topicPath: topic.path,
      recordsToGenerate: recordsPerTopic,
      seedRecords,
      tools: effectiveTools,
    }));
    const personaCache = new Map<string, string[]>();
    const allErrors: string[] = [];

    // Shared progress counter for real-time tracking across parallel topics
    const progressCounter = { count: 0 };

    // Callbacks object shared by all parallel tasks
    const callbacks: GenerationCallbacks = {
      datasetId: resolvedDatasetId,
      totalExpectedRecords,
      progressCounter,
      on_progress,
      on_records_added,
    };

    // Process topics in parallel batches
    for (let batchStart = 0; batchStart < topicTasks.length; batchStart += effectiveConcurrency) {
      const batchTasks = topicTasks.slice(batchStart, batchStart + effectiveConcurrency);

      // Run topic tasks in parallel - each task handles DB writes and progress updates internally
      const batchResults = await Promise.allSettled(
        batchTasks.map(task => generateRecordsForTopic(task, personaCache, callbacks))
      );
      // Collect errors from completed tasks
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const task = batchTasks[j];

        if (result.status === 'fulfilled') {
          allErrors.push(...result.value.errors);
        } else {
          const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          allErrors.push(`${task.topicName}: ${errorMsg}`);
        }
      }
    }

    const createdTotal = progressCounter.count;

    if (createdTotal === 0) {
      return {
        success: false,
        dataset_name: dataset.name,
        error: allErrors.length > 0 ? allErrors.join(' | ') : 'No traces were generated',
      };
    }

    return {
      success: true,
      dataset_name: dataset.name,
      created_count: createdTotal,
      error: allErrors.length > 0 ? `${allErrors.length} error(s): ${allErrors.slice(0, 5).join(' | ')}${allErrors.length > 5 ? '...' : ''}` : undefined,
    };
  } catch (error) {
    return { success: false, error: `LLM error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export const generateTracesHandler: ToolHandler = async (input) => {
  return generateTraces(input as GenerateTracesParams);
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
      count: { type: 'number', description: 'Total traces to generate (default 5).' },
      max_turns: { type: 'number', description: 'Max user turns per trace (default 3)' },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input: object) => JSON.stringify(await generateTracesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
