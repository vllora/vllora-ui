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

interface AssistantTurnOutput {
  content: string;
  tool_calls: SyntheticToolCall[] | null;
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
  /** Number of parallel generation requests (default: 5) */
  concurrency?: number;
  /** Callback for progress updates (can be async) */
  onProgress?: (progress: { completed: number; total: number }) => void | Promise<void>;
  /** Callback when new records are added - receives the record IDs */
  onRecordsAdded?: (recordIds: string[]) => void | Promise<void>;
}

const DEFAULT_COUNT = 5;
const DEFAULT_MAX_TURNS = 3;
const DEFAULT_PERSONA_GUIDANCE = 'Diverse and realistic';

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

const SIMULATED_USER_PROMPT = `You are a regular user interacting with an AI assistant.
Your goal is to initiate a natural and realistic conversation about a specific topic. Keep it brief and to the point.

Topic context: {{subtopics}}
System Persona the assistant follows: {{system_prompt}}
Your Persona: {{persona}}

Based on the context and topic, write your first message as the user.
Do not provide the assistant's response.
Just write the initial user prompt.`;

const SIMULATED_TOOL_RESULT_PROMPT = `The AI assistant is trying to help you. It decided to call the tool '{{tool_name}}' with these arguments:
{{tool_arguments}}

Based on the domain context ({{subtopics}}) and the tool's purpose, simulate a realistic and helpful result that this tool would return.
The result should be concise and formatted as it would appear in a real system (e.g., JSON, a status message, or data output).
Your simulated result will be shown to the assistant so it can continue the task.
Just provide the simulated output.`;

const SIMULATED_USER_SYSTEM_PROMPT = `You are a user interacting with an AI assistant.

Your Persona:
{{persona}}

Topic Context:
{{subtopics}}

Your Goal:
{{instructions}}

Instructions:
- The conversation history is provided using <user_prompt> and <assistant_response> tags.
- Provide the next message as the user based on the conversation history, strictly in plain text and without any tags.
- Keep it concise and natural, within 1-3 sentences.
- If the assistant asks for information, provide it consistent with your persona.
- If the task is effectively complete or the conversation has reached a natural conclusion, respond with [END].
- Do not repeat previous messages verbatim.`;

const SIMULATED_SYSTEM_PROMPT_GENERATION_PROMPT = `You are an expert in defining AI assistant personas for high-quality synthetic data generation.
Your task is to generate a comprehensive system prompt for an AI assistant based on a specific topic.

Topic context: {{subtopics}}
Seed Example Context: {{seed_context}}

Requirements:
1. The system prompt should define the assistant's expertise, tone, and specific responsibilities related to the Topic Context.
2. The tone should be consistent with the Seed Example Context provided.
3. Explicitly mention that the assistant should use appropriate tools when needed or if available to complete tasks effectively.
4. Output ONLY the system prompt text. Do not include any tags like <system_prompt> or extra commentary.
`;

const ASSISTANT_RESPONSE_INSTRUCTIONS = `You are continuing a multi-turn conversation as the assistant.

Return a JSON object with exactly:
{
  "content": "...",
  "tool_calls": [
    {
      "id": "unique_id",
      "type": "function",
      "function": {
        "name": "tool_name",
        "arguments": "{\\"arg\\": \\"value\\"}"
      }
    }
  ]
}

Rules:
- If no tool is needed, set tool_calls to null.
- tool_calls may ONLY reference the available tools.
- Tool arguments must be valid JSON and include required fields.
- Never output "records", "metadata", or any extra keys.
- Keep the assistant content concise and helpful.`;

const ASSISTANT_TURN_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'assistant_turn',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
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
      },
      required: ['content', 'tool_calls'],
      additionalProperties: false,
    },
  },
};

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

function normalizeTopic(value: string): string {
  return value.trim().replace(/\s+/g, '_').toLowerCase();
}

function normalizeTopicPath(path: string[]): string[] {
  return path.map(normalizeTopic).filter(Boolean);
}

function topicPathsFromPath(path: string[]): string[][] {
  const clean = path.map((t) => (t || '').trim()).filter(Boolean);
  const out: string[][] = [];
  for (let i = 1; i <= clean.length; i++) out.push(clean.slice(0, i));
  return out;
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
  const lastAssistant = [...normalizedMessages].reverse().find((m) => m.role === 'assistant');
  const lastToolCalls = Array.isArray((lastAssistant as any)?.tool_calls) ? (lastAssistant as any).tool_calls : null;
  const finishReason = lastToolCalls && lastToolCalls.length > 0 ? 'tool_calls' : 'stop';

  return {
    input: {
      messages: normalizedMessages,
      tools,
    },
    output: {
      messages: lastAssistant || { role: 'assistant', content: '' },
      finish_reason: finishReason,
    },
  };
}

function formatSeedExcerpt(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return 'N/A';
  const excerpt = messages.slice(Math.max(0, messages.length - 8)).map((m: any) => ({
    role: m?.role,
    content: typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''),
  }));
  return JSON.stringify(excerpt, null, 2);
}

function buildAssistantSystemPrompt(systemPrompt: string, tools: any[]): string {
  const toolInstruction = tools.length > 0
    ? '\nYou have available tools where needed to complete the user\'s request.'
    : '';
  const condensedTools = condenseToolsForPrompt(tools);
  return `${systemPrompt}${toolInstruction}\n\n${ASSISTANT_RESPONSE_INSTRUCTIONS}\n\nAvailable tools:\n${JSON.stringify(condensedTools, null, 2)}`;
}

function buildAssistantMessages(messages: SyntheticMessage[], toolCallNameById: Map<string, string>): DistriMessage[] {
  const out: DistriMessage[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'user') {
      out.push(initMessage('user', message.content ?? ''));
      continue;
    }
    if (message.role === 'assistant') {
      out.push(initMessage('assistant', message.content ?? ''));
      continue;
    }
    if (message.role === 'tool') {
      const toolName = message.tool_call_id ? toolCallNameById.get(message.tool_call_id) : undefined;
      const content = toolName
        ? `Tool '${toolName}' returned: ${message.content ?? ''}`
        : `Tool returned: ${message.content ?? ''}`;
      out.push(initMessage('assistant', content));
    }
  }
  return out;
}

function buildUserHistory(messages: SyntheticMessage[], toolCallNameById: Map<string, string>): string {
  const historyParts: string[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    const content = message.content ?? '';
    if (message.role === 'user') {
      historyParts.push(`<user_prompt>: ${content}`);
      continue;
    }
    if (message.role === 'assistant') {
      historyParts.push(`<assistant_response>: ${content}`);
      continue;
    }
    if (message.role === 'tool') {
      const toolName = message.tool_call_id ? toolCallNameById.get(message.tool_call_id) : undefined;
      const toolContent = toolName
        ? `Tool '${toolName}' returned: ${content}`
        : `Tool returned: ${content}`;
      historyParts.push(`<assistant_response>: ${toolContent}`);
    }
  }
  return historyParts.join('\n');
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

async function callLLMJson<T>(messages: DistriMessage[], responseFormat: unknown): Promise<T> {
  const content = await callLLM(messages, { responseFormat });
  const parsed = tryParseJson<T>(content);
  if (!parsed) {
    throw new Error('Failed to parse JSON response');
  }
  return parsed;
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

async function generateSystemPrompt(topicPath: string[], seedMessages: any[]): Promise<string> {
  const topicStr = topicPath.join(' -> ');
  const seedContext = formatSeedExcerpt(seedMessages);
  const fallbackPrompt = `You are a helpful assistant specializing in ${topicStr}.`;
  const prompt = SIMULATED_SYSTEM_PROMPT_GENERATION_PROMPT
    .replace('{{subtopics}}', topicStr)
    .replace('{{seed_context}}', seedContext);

  try {
    const content = await callLLMText(prompt);
    return content.trim() || fallbackPrompt;
  } catch {
    return fallbackPrompt;
  }
}

async function generateFirstUserMessage(
  contextStr: string,
  persona: string,
  systemPrompt: string
): Promise<string> {
  const prompt = SIMULATED_USER_PROMPT
    .replace('{{subtopics}}', contextStr)
    .replace('{{persona}}', persona)
    .replace('{{system_prompt}}', systemPrompt);
  const content = await callLLMText(prompt);
  return content.trim();
}

async function generateAssistantTurn(
  messages: SyntheticMessage[],
  systemPrompt: string,
  tools: any[],
  toolCallNameById: Map<string, string>
): Promise<AssistantTurnOutput> {
  const assistantSystemPrompt = buildAssistantSystemPrompt(systemPrompt, tools);
  const conversationMessages = buildAssistantMessages(messages, toolCallNameById);
  const raw = await callLLMJson<AssistantTurnOutput>(
    [initMessage('system', assistantSystemPrompt), ...conversationMessages],
    ASSISTANT_TURN_SCHEMA
  );

  if (!raw || typeof raw !== 'object') {
    throw new Error('LLM returned invalid assistant_turn payload');
  }

  const rawRecord = raw as unknown as Record<string, unknown>;
  if ('records' in rawRecord) {
    throw new Error('LLM returned legacy records payload; expected assistant_turn JSON');
  }

  if (typeof rawRecord.content !== 'string') {
    throw new Error('LLM returned assistant_turn without content');
  }

  if (rawRecord.tool_calls !== null && !Array.isArray(rawRecord.tool_calls)) {
    throw new Error('LLM returned assistant_turn tool_calls in invalid format');
  }

  const toolNames = new Set(
    tools
      .map((t: any) => t?.function?.name)
      .filter((n: any) => typeof n === 'string')
  );
  return {
    content: rawRecord.content,
    tool_calls: normalizeAssistantToolCalls(rawRecord.tool_calls, toolNames),
  };
}

async function simulateToolResult(toolName: string, args: string, contextStr: string): Promise<string> {
  const prompt = SIMULATED_TOOL_RESULT_PROMPT
    .replace('{{tool_name}}', toolName)
    .replace('{{tool_arguments}}', args)
    .replace('{{subtopics}}', contextStr);
  const content = await callLLMText(prompt);
  return content.trim();
}

async function generateUserResponse(
  messages: SyntheticMessage[],
  contextStr: string,
  instructions: string,
  persona: string,
  toolCallNameById: Map<string, string>
): Promise<string> {
  const simSystemPrompt = SIMULATED_USER_SYSTEM_PROMPT
    .replace('{{subtopics}}', contextStr)
    .replace('{{instructions}}', instructions)
    .replace('{{persona}}', persona);

  const historyStr = buildUserHistory(messages, toolCallNameById);
  const content = await callLLMText(historyStr, simSystemPrompt);
  return content.trim();
}

async function simulateConversation(
  topicPath: string[],
  seedMessages: any[],
  tools: any[],
  maxTurns: number,
  personaCache: Map<string, string[]>
): Promise<SyntheticTraceRecord | null> {
  const topicStr = topicPath.join(' -> ');
  const topicKey = topicPath.join('/');
  const contextStr = topicStr;

  const persona = await ensurePersona(personaCache, topicKey, contextStr);
  const systemPrompt = await generateSystemPrompt(topicPath, seedMessages);
  const firstUserMsg = await generateFirstUserMessage(contextStr, persona, systemPrompt);
  const toolInstruction = tools.length > 0
    ? '\nYou have available tools where needed to complete the user\'s request.'
    : '';

  const messages: SyntheticMessage[] = [
    {
      role: 'system',
      content: systemPrompt + toolInstruction,
      tool_calls: null,
      tool_call_id: null,
    },
    {
      role: 'user',
      content: firstUserMsg,
      tool_calls: null,
      tool_call_id: null,
    },
  ];

  let userMessageCount = 1;
  const toolCallNameById = new Map<string, string>();

  while (userMessageCount < maxTurns) {
    const assistant = await generateAssistantTurn(messages, systemPrompt, tools, toolCallNameById);
    messages.push({
      role: 'assistant',
      content: assistant.content,
      tool_calls: assistant.tool_calls,
      tool_call_id: null,
    });

    if (assistant.tool_calls) {
      for (const toolCall of assistant.tool_calls) {
        toolCallNameById.set(toolCall.id, toolCall.function.name);
        const toolResult = await simulateToolResult(toolCall.function.name, toolCall.function.arguments, contextStr);
        messages.push({
          role: 'tool',
          content: toolResult,
          tool_calls: null,
          tool_call_id: toolCall.id,
        });
      }
    }

    const userResponse = await generateUserResponse(messages, contextStr, firstUserMsg, persona, toolCallNameById);
    if (!userResponse || userResponse.includes('[END]')) {
      break;
    }

    messages.push({
      role: 'user',
      content: userResponse,
      tool_calls: null,
      tool_call_id: null,
    });
    userMessageCount += 1;
  }

  return { topic_path: topicPath, persona, messages };
}

const DEFAULT_CONCURRENCY = 5;

interface GenerationTask {
  index: number;
  seedRecord: DatasetRecord | undefined;
  topicPath: string[];
  seedMessages: any[];
  tools: any[];
}

export async function generateTraces(params: Record<string, unknown>): Promise<GenerateTracesResult> {
  try {
    const { datasetId, dataset_id, recordIds, record_ids, count, maxTurns, max_turns, concurrency, onProgress } =
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
    const selectedRecords = selectedIds.length > 0
      ? allRecords.filter((record) => selectedIds.includes(record.id))
      : [];

    const totalCount = typeof count === 'number' ? count : DEFAULT_COUNT;
    if (totalCount <= 0) {
      return { success: true, dataset_name: dataset.name, created_count: 0 };
    }

    const turns = typeof maxTurns === 'number'
      ? maxTurns
      : typeof max_turns === 'number'
        ? max_turns
        : DEFAULT_MAX_TURNS;

    const effectiveConcurrency = typeof concurrency === 'number' && concurrency > 0
      ? Math.min(concurrency, 10) // Cap at 10 to avoid overwhelming the API
      : DEFAULT_CONCURRENCY;

    const seedRecords = selectedRecords.length > 0 ? selectedRecords : [undefined];
    const personaCache = new Map<string, string[]>();
    const topicPoolCache = new Map<string, string[][]>();
    const batchErrors: string[] = [];
    let createdTotal = 0;

    const getTopicPool = (record?: DatasetRecord): string[][] => {
      const key = record?.id || 'none';
      const cached = topicPoolCache.get(key);
      if (cached) return cached;
      const leaves = record ? getLeafTopicPaths(record.topic_paths || []) : [];
      const normalized = leaves.length > 0
        ? leaves.map(normalizeTopicPath)
        : [[normalizeTopic(dataset.name)]];
      topicPoolCache.set(key, normalized);
      return normalized;
    };

    // Prepare all generation tasks
    const tasks: GenerationTask[] = [];
    for (let i = 0; i < totalCount; i++) {
      const seedRecord = seedRecords[i % seedRecords.length];
      const topicPool = getTopicPool(seedRecord);
      const topicPath = topicPool[Math.floor(Math.random() * topicPool.length)] || [normalizeTopic(dataset.name)];
      const seedMessages = extractSeedMessages(seedRecord);
      const tools = extractSeedTools(seedRecord);
      const effectiveTools = tools.length > 0
        ? tools
        : TOOL_CATALOG.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));

      tasks.push({
        index: i,
        seedRecord,
        topicPath,
        seedMessages,
        tools: effectiveTools,
      });
    }

    // Process in batches for incremental progress updates
    const batchSize = effectiveConcurrency;
    for (let batchStart = 0; batchStart < tasks.length; batchStart += batchSize) {
      const batchTasks = tasks.slice(batchStart, batchStart + batchSize);

      // Run batch in parallel
      const batchResults = await Promise.allSettled(
        batchTasks.map(async (task) => {
          const simulated = await simulateConversation(
            task.topicPath,
            task.seedMessages,
            task.tools,
            turns,
            personaCache
          );
          if (!simulated) {
            throw new Error('simulation returned empty');
          }
          return {
            task,
            simulated,
          };
        })
      );

      // Collect successful results from this batch
      const recordsToAdd: Array<{
        data: DataInfo;
        metadata?: Record<string, unknown>;
        topic_paths?: string[][];
        is_generated?: boolean;
        evaluation?: undefined;
      }> = [];

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const task = batchTasks[j];

        if (result.status === 'fulfilled') {
          const { simulated } = result.value;
          const data = buildSyntheticTraceDataInfo(simulated, task.tools);
          recordsToAdd.push({
            data,
            metadata: {
              persona: simulated.persona,
              seed_record_id: task.seedRecord?.id,
              seed_topic_path: task.topicPath,
              generated_at_ms: Date.now(),
            },
            topic_paths: topicPathsFromPath(task.topicPath),
            is_generated: true,
            evaluation: undefined,
          });
        } else {
          const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          batchErrors.push(`trace=${task.index + 1}: ${errorMsg}`);
        }
      }

      // Add records from this batch immediately
      if (recordsToAdd.length > 0) {
        try {
          const added = await datasetsDB.addRecordsToDataset(resolvedDatasetId, recordsToAdd);
          createdTotal += added;
        } catch (err) {
          batchErrors.push(`batch add failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Report progress after each batch (await if async to allow UI refresh)
      if (onProgress) {
        await onProgress({ completed: createdTotal, total: totalCount });
      }
    }

    if (createdTotal === 0) {
      return {
        success: false,
        dataset_name: dataset.name,
        error: batchErrors.length > 0 ? batchErrors.join(' | ') : 'No traces were generated',
      };
    }

    return {
      success: true,
      dataset_name: dataset.name,
      created_count: createdTotal,
      error: batchErrors.length > 0 ? `${batchErrors.length} trace(s) failed: ${batchErrors.join(' | ')}` : undefined,
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
      count: { type: 'number', description: 'Total traces to generate (default 5).' },
      max_turns: { type: 'number', description: 'Max user turns per trace (default 3)' },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input: object) => JSON.stringify(await generateTracesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
