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

const TRACE_CONTEXT_SYSTEM_PROMPT = `You generate synthetic user seeds for chat traces.

Return a JSON object that matches the provided schema. Follow these rules:
- Produce the requested number of concise personas for the topic; each is 1-2 sentences describing personality, goals, and chatting style.
- Personas must differ in tone and expertise (formal/casual/technical; novice/intermediate/expert).
- Produce the requested number of short user-message variations (≤15 words) that sound like a casual human request/command, not an AI analysis.
- Do not evaluate, praise, or analyze; avoid robotic phrasing.
- Keep language simple and natural.
- Keep each variation aligned to the style/format of the original user message (preserve any mode markers, brevity, and intent).
- Match the requested batch size exactly for both personas and variations.

Always respond with JSON only.`;

const TRACE_CONTEXT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'trace_context_batch',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        personas: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
        variations: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
      },
      required: ['personas', 'variations'],
      additionalProperties: false,
    },
  },
};

const TRACE_CONTEXT_IN_FLIGHT = new Map<string, Promise<void>>();
const DEFAULT_PERSONA_FALLBACK = 'A curious user interested in the topic.';
const DEFAULT_SUMMARY_MAX_LEN = 200;
const MAX_TRACE_CONTEXT_BATCH = 10;

interface TraceContextBatch {
  personas: string[];
  variations: string[];
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function normalizeSeedMessages(seedMessages: any[]): SyntheticMessage[] {
  return seedMessages.map(m => ({
    role: m.role,
    content: m.content ?? null,
    tool_calls: m.tool_calls ?? null,
    tool_call_id: m.tool_call_id ?? null,
  }));
}

function extractLastUserContext(messages: SyntheticMessage[]): {
  lastUserIndex: number;
  originalUserMessage: string;
  historyBeforeLastUser: SyntheticMessage[];
} | null {
  const lastUserIndex = messages
    .map((m, i) => m.role === 'user' ? i : -1)
    .filter(i => i !== -1)
    .pop();

  if (lastUserIndex === undefined || lastUserIndex < 0) return null;

  return {
    lastUserIndex,
    originalUserMessage: messages[lastUserIndex].content || '',
    historyBeforeLastUser: messages.slice(0, lastUserIndex),
  };
}

function buildSeedContextKey(
  topicKey: string,
  historyMessages: SyntheticMessage[],
  originalUserMessage: string
): string {
  const historySignature = historyMessages
    .map(msg => {
      const toolCalls = msg.tool_calls ? JSON.stringify(msg.tool_calls) : '';
      const toolCallId = msg.tool_call_id ?? '';
      return `${msg.role}:${msg.content ?? ''}:${toolCallId}:${toolCalls}`;
    })
    .join('\n');
  const keyInput = `${historySignature}|${originalUserMessage}`;
  return `${topicKey}:${hashString(keyInput)}`;
}

function summarizeText(text: string | null, maxLen = DEFAULT_SUMMARY_MAX_LEN): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function buildConversationSummary(messages: SyntheticMessage[]): string {
  if (messages.length === 0) return 'None';
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      parts.push(`System: ${summarizeText(msg.content)}`);
      continue;
    }
    if (msg.role === 'user') parts.push(`User: ${summarizeText(msg.content)}`);
    if (msg.role === 'assistant') parts.push(`Assistant: ${summarizeText(msg.content)}`);
    if (msg.role === 'tool') parts.push(`[Tool result]: ${summarizeText(msg.content)}`);
  }
  return parts.join('\n') || 'None';
}

function buildToolDetails(tools: any[]): string {
  if (tools.length === 0) return 'None';
  return tools
    .map((t: any) => {
      const name = t?.function?.name || 'unknown_tool';
      const desc = t?.function?.description ? ` - ${t.function.description}` : '';
      const paramKeys = Object.keys(t?.function?.parameters?.properties || {});
      const params = paramKeys.length > 0 ? ` (params: ${paramKeys.join(', ')})` : '';
      return `- ${name}${desc}${params}`;
    })
    .join('\n');
}

function normalizeTraceContextBatch(
  personas: string[],
  variations: string[],
  requestedCount: number,
  originalUserMessage: string
): TraceContextBatch {
  const cleanPersonas = personas.filter(p => typeof p === 'string');
  const cleanVariations = variations.filter(v => typeof v === 'string');
  while (cleanPersonas.length < requestedCount) {
    cleanPersonas.push(DEFAULT_PERSONA_FALLBACK);
  }
  while (cleanVariations.length < requestedCount) {
    cleanVariations.push(originalUserMessage);
  }
  return {
    personas: cleanPersonas.slice(0, requestedCount),
    variations: cleanVariations.slice(0, requestedCount),
  };
}

function buildTraceContextPrompt(
  contextStr: string,
  toolDetails: string,
  conversationSummary: string,
  originalUserMessage: string,
  requestedCount: number
): string {
  return [
    'Context for synthetic trace persona + user-message variations:',
    `Topic: ${contextStr}`,
    `Available tools:\n${toolDetails}`,
    `Conversation summary:\n${conversationSummary}`,
    `Original user message (full):\n${originalUserMessage}`,
    `Requested batch size (this call): ${requestedCount}`,
    'Task: Return JSON only with the requested number of personas and user-message variations that follow the rules.',
    'Formatting rule: Keep each variation aligned to the style/format of the original user message (e.g., retain mode markers, brevity, and intent).',
  ].join('\n\n');
}

async function fetchTraceContextBatch(
  contextStr: string,
  existingMessages: SyntheticMessage[],
  originalUserMessage: string,
  tools: any[],
  requestedCount: number
): Promise<TraceContextBatch> {
  const toolDetails = buildToolDetails(tools);
  const conversationSummary = buildConversationSummary(existingMessages);
  const userPrompt = buildTraceContextPrompt(
    contextStr,
    toolDetails,
    conversationSummary,
    originalUserMessage,
    requestedCount
  );

  const messages = [
    initMessage('system', TRACE_CONTEXT_SYSTEM_PROMPT),
    initMessage('user', userPrompt),
  ];

  const raw = await callLLM(messages, { responseFormat: TRACE_CONTEXT_SCHEMA, temperature: 0.7 });
  const parsed = tryParseJson<{ personas: string[]; variations: string[] }>(raw);
  const personas = parsed?.personas?.filter(p => typeof p === 'string') || [];
  const variations = parsed?.variations?.filter(v => typeof v === 'string') || [];

  return normalizeTraceContextBatch(personas, variations, requestedCount, originalUserMessage);
}

async function prefetchTraceContextBatch(params: {
  personaCache: Map<string, string[]>;
  variationsCache: Map<string, string[]>;
  contextKey: string;
  contextStr: string;
  existingMessages: SyntheticMessage[];
  originalUserMessage: string;
  tools: any[];
  batchCount: number;
}): Promise<void> {
  const requestedCount = Math.max(1, Math.floor(params.batchCount));

  while (true) {
    const existingPersonas = params.personaCache.get(params.contextKey) || [];
    const existingVariations = params.variationsCache.get(params.contextKey) || [];
    const existingPairs = Math.min(existingPersonas.length, existingVariations.length);
    const needed = Math.max(0, requestedCount - existingPairs);
    if (needed === 0) return;

    const inFlight = TRACE_CONTEXT_IN_FLIGHT.get(params.contextKey);
    if (inFlight) {
      await inFlight;
      continue;
    }

    const requestCount = Math.min(needed, MAX_TRACE_CONTEXT_BATCH);
    const fetchPromise = (async () => {
      const batch = await fetchTraceContextBatch(
        params.contextStr,
        params.existingMessages,
        params.originalUserMessage,
        params.tools,
        requestCount
      );
      const nextPersonas = (params.personaCache.get(params.contextKey) || []).concat(batch.personas);
      const nextVariations = (params.variationsCache.get(params.contextKey) || []).concat(batch.variations);
      const sharedLen = Math.min(nextPersonas.length, nextVariations.length);
      params.personaCache.set(params.contextKey, nextPersonas.slice(0, sharedLen));
      params.variationsCache.set(params.contextKey, nextVariations.slice(0, sharedLen));
    })();

    TRACE_CONTEXT_IN_FLIGHT.set(params.contextKey, fetchPromise);
    try {
      await fetchPromise;
    } finally {
      TRACE_CONTEXT_IN_FLIGHT.delete(params.contextKey);
    }
  }
}

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
      leaves.push(...extractLeafTopicsFromHierarchy(node.children, currentPath));
    } else {
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

  const modelSettings = {
    ...modelSettingsBase,
    model: modelSettingsFromConfig.model || 'openai/gpt-4.1-mini',
    temperature: options?.temperature ?? modelSettingsFromConfig.temperature ?? 0.5,
    ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
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

async function ensurePersonaAndUserMessageVariation(
  personaCache: Map<string, string[]>,
  variationsCache: Map<string, string[]>,
  topicKey: string,
  contextStr: string,
  existingMessages: SyntheticMessage[],
  originalUserMessage: string,
  tools: any[],
  batchCount: number
): Promise<{ persona: string; userMessage: string }> {
  const contextKey = buildSeedContextKey(topicKey, existingMessages, originalUserMessage);
  const cachedPersonas = personaCache.get(contextKey) || [];
  const cachedVariations = variationsCache.get(contextKey) || [];

  if (cachedPersonas.length > 0 && cachedVariations.length > 0) {
    return {
      persona: cachedPersonas.shift() || DEFAULT_PERSONA_FALLBACK,
      userMessage: cachedVariations.shift() || originalUserMessage,
    };
  }

  await prefetchTraceContextBatch({
    personaCache,
    variationsCache,
    contextKey,
    contextStr,
    existingMessages,
    originalUserMessage,
    tools,
    batchCount,
  });

  const personaPool = personaCache.get(contextKey) || [];
  const variationPool = variationsCache.get(contextKey) || [];

  return {
    persona: personaPool.shift() || DEFAULT_PERSONA_FALLBACK,
    userMessage: variationPool.shift() || originalUserMessage,
  };
}

async function simulateConversation(
  topicPath: string[],
  seedMessages: any[],
  tools: any[],
  personaCache: Map<string, string[]>,
  variationsCache: Map<string, string[]>,
  batchCount = 1
): Promise<SyntheticTraceRecord | null> {
  const topicStr = topicPath.join(' -> ');
  const topicKey = topicPath.join('/');
  const contextStr = topicStr;
  let personaForTrace = DEFAULT_PERSONA_FALLBACK;

  // Copy seed messages
  const messages: SyntheticMessage[] = normalizeSeedMessages(seedMessages);

  const context = extractLastUserContext(messages);
  if (context) {
    const { lastUserIndex, originalUserMessage, historyBeforeLastUser } = context;

    const { persona, userMessage: newUserMsg } = await ensurePersonaAndUserMessageVariation(
      personaCache,
      variationsCache,
      topicKey,
      contextStr,
      historyBeforeLastUser,
      originalUserMessage,
      tools,
      batchCount
    );
    personaForTrace = persona;

    // Truncate messages to only include up to (but not including) the last user message
    // Then add our new variation - this removes any assistant/tool responses that were
    // based on the original user message
    messages.length = lastUserIndex;
    messages.push({
      role: 'user',
      content: newUserMsg,
      tool_calls: null,
      tool_call_id: null,
    });
  }

  return { topic_path: topicPath, persona: personaForTrace, messages };
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

async function prefetchTraceContextsForTopic(
  task: TopicGenerationTask,
  personaCache: Map<string, string[]>,
  variationsCache: Map<string, string[]>
): Promise<void> {
  if (task.recordsToGenerate <= 0) return;
  const topicKey = task.topicPath.join('/');
  const contextStr = task.topicPath.join(' -> ');
  const contextRequests = new Map<string, {
    count: number;
    historyBeforeLastUser: SyntheticMessage[];
    originalUserMessage: string;
  }>();

  for (let i = 0; i < task.recordsToGenerate; i++) {
    const seedRecord = task.seedRecords[i % task.seedRecords.length];
    const seedMessages = extractSeedMessages(seedRecord);
    const normalizedMessages = normalizeSeedMessages(seedMessages);
    const context = extractLastUserContext(normalizedMessages);
    if (!context) continue;

    const { historyBeforeLastUser, originalUserMessage } = context;
    const contextKey = buildSeedContextKey(topicKey, historyBeforeLastUser, originalUserMessage);
    const existing = contextRequests.get(contextKey);

    if (existing) {
      existing.count += 1;
    } else {
      contextRequests.set(contextKey, {
        count: 1,
        historyBeforeLastUser,
        originalUserMessage,
      });
    }
  }

  if (contextRequests.size === 0) return;

  const prefetchPromises = Array.from(contextRequests.entries()).map(([contextKey, entry]) =>
    prefetchTraceContextBatch({
      personaCache,
      variationsCache,
      contextKey,
      contextStr,
      existingMessages: entry.historyBeforeLastUser,
      originalUserMessage: entry.originalUserMessage,
      tools: task.tools,
      batchCount: entry.count,
    })
  );

  await Promise.allSettled(prefetchPromises);
}

/**
 * Generate a single record for a topic
 * Returns the record data or null if generation failed
 */
async function generateSingleRecord(
  task: TopicGenerationTask,
  recordIndex: number,
  personaCache: Map<string, string[]>,
  variationsCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<{ record: TopicGenerationResult['records'][0]; error?: string } | { record: null; error: string }> {
  try {
    const seedRecord = task.seedRecords[recordIndex % task.seedRecords.length];
    const seedMessages = extractSeedMessages(seedRecord);

    const simulated = await simulateConversation(
      task.topicPath,
      seedMessages,
      task.tools,
      personaCache,
      variationsCache
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
  variationsCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<TopicGenerationResult> {
  await prefetchTraceContextsForTopic(task, personaCache, variationsCache);

  // Generate all records for this topic in parallel
  const recordPromises = Array.from({ length: task.recordsToGenerate }, (_, i) =>
    generateSingleRecord(task, i, personaCache, variationsCache, callbacks)
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
    const variationsCache = new Map<string, string[]>();
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
        batchTasks.map(task => generateRecordsForTopic(task, personaCache, variationsCache, callbacks))
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
