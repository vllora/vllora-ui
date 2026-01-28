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

/**
 * Simple semaphore for limiting concurrent operations
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Global semaphore for LLM requests - will be configured per generateTraces call
let llmSemaphore: Semaphore | null = null;

function setLLMConcurrency(maxConcurrent: number): void {
  llmSemaphore = new Semaphore(maxConcurrent);
  console.log(`[generateTraces] LLM concurrency set to ${maxConcurrent}`);
}

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
  dataset_id?: string;
  dataset_name?: string;
  record_ids?: string[];
  count?: number;
  max_turns?: number;
  /** Maximum number of concurrent LLM requests (default: 5, max: 10) */
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

const DEFAULT_MAX_TURNS = 3;
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

// const SIMULATED_SYSTEM_PROMPT_GENERATION_PROMPT = `You are an expert in defining AI assistant personas for high-quality synthetic data generation.
// Your task is to generate a comprehensive system prompt for an AI assistant based on a specific topic.

// Topic context: {{subtopics}}
// Seed Example Context: {{seed_context}}

// Requirements:
// 1. The system prompt should define the assistant's expertise, tone, and specific responsibilities related to the Topic Context.
// 2. The tone should be consistent with the Seed Example Context provided.
// 3. Explicitly mention that the assistant should use appropriate tools when needed or if available to complete tasks effectively.
// 4. Output ONLY the system prompt text. Do not include any tags like <system_prompt> or extra commentary.
// `;

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

interface TopicHierarchyNode {
  id: string;
  name: string;
  children?: TopicHierarchyNode[];
}

interface LeafTopic {
  id: string;   // Topic ID for storing in records
  name: string; // Topic name for display/matching
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
      // Leaf node - add with full path and ID
      // Use node.id if available, otherwise fallback to node.name
      leaves.push({ id: node.id || node.name, name: node.name, path: currentPath });
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

function extractSeedSystemPrompt(messages: any[]): string | null {
  if (!Array.isArray(messages)) return null;
  const systemMsg = messages.find((m: any) => m?.role === 'system');
  if (systemMsg && typeof systemMsg.content === 'string') {
    return systemMsg.content;
  }
  return null;
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

// function formatSeedExcerpt(messages: any[]): string {
//   if (!Array.isArray(messages) || messages.length === 0) return 'N/A';
//   const excerpt = messages.slice(Math.max(0, messages.length - 8)).map((m: any) => ({
//     role: m?.role,
//     content: typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''),
//   }));
//   return JSON.stringify(excerpt, null, 2);
// }

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
  // Use semaphore to limit concurrent LLM requests
  const executeCall = async (): Promise<string> => {
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
        const startTime = Date.now();
        const response = await distriClient.llm(messages, [], { model_settings: modelSettings });
        const elapsed = Date.now() - startTime;
        if (!response.content) {
          throw new Error('LLM returned empty response');
        }
        console.log(`[callLLM] Response received in ${elapsed}ms (${response.content.length} chars)`);
        return response.content.trim();
      } catch (err) {
        lastError = err;
        console.warn(`[callLLM] Attempt ${attempt + 1}/3 failed:`, err instanceof Error ? err.message : err);
        if (attempt < 2) {
          const delay = 800 * Math.pow(2, attempt);
          console.log(`[callLLM] Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('LLM call failed');
  };

  // If semaphore is set, use it to limit concurrency
  if (llmSemaphore) {
    return llmSemaphore.run(executeCall);
  }
  return executeCall();
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

// async function generateSystemPrompt(topicPath: string[], seedMessages: any[]): Promise<string> {
//   const topicStr = topicPath.join(' -> ');
//   const seedContext = formatSeedExcerpt(seedMessages);
//   const fallbackPrompt = `You are a helpful assistant specializing in ${topicStr}.`;
//   const prompt = SIMULATED_SYSTEM_PROMPT_GENERATION_PROMPT
//     .replace('{{subtopics}}', topicStr)
//     .replace('{{seed_context}}', seedContext);

//   try {
//     const content = await callLLMText(prompt);
//     return content.trim() || fallbackPrompt;
//   } catch {
//     return fallbackPrompt;
//   }
// }

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
  seedSystemPrompt: string | null,
  _seedMessages: any[],
  tools: any[],
  maxTurns: number,
  personaCache: Map<string, string[]>
): Promise<SyntheticTraceRecord | null> {
  const topicStr = topicPath.join(' -> ');
  const topicKey = topicPath.join('/');
  const contextStr = topicStr;

  console.log(`[simulateConversation] Starting for topic: ${topicStr}`);

  // Use seed system prompt if available, otherwise use a fallback
  console.log(`[simulateConversation] Generating persona...`);
  const persona = await ensurePersona(personaCache, topicKey, contextStr);
  console.log(`[simulateConversation] Persona: ${persona.substring(0, 50)}...`);

  const systemPrompt = seedSystemPrompt || `You are a helpful assistant specializing in ${topicStr}.`;
  console.log(`[simulateConversation] Generating first user message...`);
  const firstUserMsg = await generateFirstUserMessage(contextStr, persona, systemPrompt);
  console.log(`[simulateConversation] First user message generated (${firstUserMsg.length} chars)`);

  const messages: SyntheticMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
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
    console.log(`[simulateConversation] Turn ${userMessageCount}/${maxTurns} - Generating assistant response...`);
    const assistant = await generateAssistantTurn(messages, systemPrompt, tools, toolCallNameById);
    messages.push({
      role: 'assistant',
      content: assistant.content,
      tool_calls: assistant.tool_calls,
      tool_call_id: null,
    });
    console.log(`[simulateConversation] Assistant responded (${assistant.content?.length || 0} chars, ${assistant.tool_calls?.length || 0} tool calls)`);

    if (assistant.tool_calls) {
      console.log(`[simulateConversation] Simulating ${assistant.tool_calls.length} tool call(s)...`);
      // Simulate all tool results in parallel
      const toolResults = await Promise.all(
        assistant.tool_calls.map(async (toolCall) => ({
          toolCall,
          result: await simulateToolResult(toolCall.function.name, toolCall.function.arguments, contextStr),
        }))
      );
      for (const { toolCall, result } of toolResults) {
        toolCallNameById.set(toolCall.id, toolCall.function.name);
        messages.push({
          role: 'tool',
          content: result,
          tool_calls: null,
          tool_call_id: toolCall.id,
        });
        console.log(`[simulateConversation] Tool ${toolCall.function.name} returned (${result.length} chars)`);
      }
    }

    console.log(`[simulateConversation] Generating user response...`);
    const userResponse = await generateUserResponse(messages, contextStr, firstUserMsg, persona, toolCallNameById);
    if (!userResponse || userResponse.includes('[END]')) {
      console.log(`[simulateConversation] Conversation ended (user: ${userResponse ? '[END]' : 'empty'})`);
      break;
    }

    messages.push({
      role: 'user',
      content: userResponse,
      tool_calls: null,
      tool_call_id: null,
    });
    userMessageCount += 1;
    console.log(`[simulateConversation] User message ${userMessageCount} added (${userResponse.length} chars)`);
  }

  console.log(`[simulateConversation] Completed: ${messages.length} total messages`);
  return { topic_path: topicPath, persona, messages };
}

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_RECORDS_PER_TOPIC = 5;

interface TopicGenerationTask {
  topicId: string;    // Topic ID for storing in records
  topicName: string;  // Topic name for display
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
  turns: number,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<{ record: TopicGenerationResult['records'][0]; error?: string } | { record: null; error: string }> {
  console.log(`[generateSingleRecord] Starting record ${recordIndex + 1} for topic "${task.topicName}"`);
  try {
    const seedRecord = task.seedRecords[recordIndex % task.seedRecords.length];
    const seedMessages = extractSeedMessages(seedRecord);
    const seedSystemPrompt = extractSeedSystemPrompt(seedMessages);
    console.log(`[generateSingleRecord] Seed: ${seedRecord?.id || 'none'}, messages: ${seedMessages.length}, hasSystemPrompt: ${!!seedSystemPrompt}`);

    const simulated = await simulateConversation(
      task.topicPath,
      seedSystemPrompt,
      seedMessages,
      task.tools,
      turns,
      personaCache
    );

    if (!simulated) {
      console.log(`[generateSingleRecord] Simulation returned empty for ${task.topicName}[${recordIndex + 1}]`);
      return { record: null, error: `${task.topicName}[${recordIndex + 1}]: simulation returned empty` };
    }

    console.log(`[generateSingleRecord] Building data info for ${task.topicName}[${recordIndex + 1}]...`);
    const data = buildSyntheticTraceDataInfo(simulated, task.tools);

    const recordData = {
      data,
      metadata: {
        persona: simulated.persona,
        seed_record_id: seedRecord?.id,
        seed_topic_path: task.topicPath,
        generated_at_ms: Date.now(),
      },
      topic: task.topicId, // Use topic ID (not name) for consistent lookup in UI
      is_generated: true,
      evaluation: undefined,
    };

    // Add record to DB immediately for real-time UI update
    try {
      console.log(`[generateSingleRecord] Saving record ${recordIndex + 1} to DB for topic "${task.topicName}"...`);
      const addedRecords = await datasetsDB.addRecordsToDataset(callbacks.datasetId, [recordData]);

      // Update shared progress counter atomically
      callbacks.progressCounter.count += addedRecords.length;
      console.log(`[generateSingleRecord] Record saved! Progress: ${callbacks.progressCounter.count}/${callbacks.totalExpectedRecords}`);

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
      console.error(`[generateSingleRecord] DB add failed for ${task.topicName}[${recordIndex + 1}]:`, dbErr);
      return { record: null, error: `${task.topicName}[${recordIndex + 1}]: DB add failed - ${dbErr instanceof Error ? dbErr.message : String(dbErr)}` };
    }
  } catch (err) {
    console.error(`[generateSingleRecord] Error for ${task.topicName}[${recordIndex + 1}]:`, err);
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
  turns: number,
  personaCache: Map<string, string[]>,
  callbacks: GenerationCallbacks
): Promise<TopicGenerationResult> {
  console.log(`[generateRecordsForTopic] Starting topic "${task.topicName}" - generating ${task.recordsToGenerate} records in parallel`);

  // Generate all records for this topic in parallel
  const recordPromises = Array.from({ length: task.recordsToGenerate }, (_, i) =>
    generateSingleRecord(task, i, turns, personaCache, callbacks)
  );

  const results = await Promise.allSettled(recordPromises);
  console.log(`[generateRecordsForTopic] Completed topic "${task.topicName}" - all ${task.recordsToGenerate} record promises settled`);

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
  console.log('[generateTraces] ========== STARTING TRACE GENERATION ==========');
  console.log('[generateTraces] Params:', JSON.stringify({
    dataset_id: params.dataset_id,
    record_ids: params.record_ids?.length || 0,
    count: params.count,
    max_turns: params.max_turns,
    concurrency: params.concurrency,
    target_topics: params.target_topics,
    selected_topics: params.selected_topics,
  }, null, 2));

  try {
    const { dataset_id, record_ids, count, max_turns, concurrency, target_topics, selected_topics, on_progress, on_records_added } =
      params;

    const resolvedDatasetId = dataset_id;
    if (!resolvedDatasetId) {
      console.log('[generateTraces] Error: dataset_id is required');
      return { success: false, error: 'dataset_id is required' };
    }

    console.log('[generateTraces] Fetching dataset:', resolvedDatasetId);
    const dataset = await datasetsDB.getDatasetById(resolvedDatasetId);
    if (!dataset) {
      console.log('[generateTraces] Error: Dataset not found');
      return { success: false, error: `Dataset ${resolvedDatasetId} not found` };
    }
    console.log('[generateTraces] Dataset found:', dataset.name);
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
      // Find the full paths for selected topics from hierarchy
      // Match by ID first (from coverage analysis), fallback to name
      targetLeafTopics = selected_topics
        .map(topicIdOrName =>
          hierarchyLeafTopics.find(t => t.id === topicIdOrName) ||
          hierarchyLeafTopics.find(t => t.name === topicIdOrName)
        )
        .filter((t): t is LeafTopic => t !== undefined);
    } else {
      targetLeafTopics = hierarchyLeafTopics;
    }

    // Error if no topics found
    if (targetLeafTopics.length === 0) {
      console.log('[generateTraces] Error: No topics found');
      return {
        success: false,
        error: 'No topics found. Please configure a topic hierarchy or select specific topics to generate data for.'
      };
    }

    console.log('[generateTraces] Target topics:', targetLeafTopics.map(t => t.name));

    const recordsPerTopic = typeof count === 'number' && count > 0 ? count : DEFAULT_RECORDS_PER_TOPIC;
    const totalExpectedRecords = targetLeafTopics.length * recordsPerTopic;

    const turns = typeof max_turns === 'number' ? max_turns : DEFAULT_MAX_TURNS;
    const effectiveConcurrency = typeof concurrency === 'number' && concurrency > 0
      ? Math.min(concurrency, 10)
      : DEFAULT_CONCURRENCY;

    console.log('[generateTraces] Generation config:', {
      topicCount: targetLeafTopics.length,
      recordsPerTopic,
      totalExpectedRecords,
      maxTurns: turns,
      concurrency: effectiveConcurrency,
    });

    // Set LLM concurrency limiter - this controls total concurrent LLM requests
    setLLMConcurrency(effectiveConcurrency);

    // Extract tools from seed records (use first available or fallback to catalog)
    const seedTools = seedRecords.find(r => r !== undefined) ? extractSeedTools(seedRecords.find(r => r !== undefined)) : [];
    const effectiveTools = seedTools.length > 0
      ? seedTools
      : [];

    // Create one task per topic with full path and ID
    const topicTasks: TopicGenerationTask[] = targetLeafTopics.map(topic => ({
      topicId: topic.id,
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

    // Process all topics in parallel - LLM semaphore controls the actual concurrency
    console.log(`[generateTraces] Processing ${topicTasks.length} topics (LLM concurrency limited to ${effectiveConcurrency})`);

    // Run all topic tasks in parallel - the semaphore limits concurrent LLM requests
    const allResults = await Promise.allSettled(
      topicTasks.map(task => generateRecordsForTopic(task, turns, personaCache, callbacks))
    );

    // Collect errors from completed tasks
    for (let j = 0; j < allResults.length; j++) {
      const result = allResults[j];
      const task = topicTasks[j];

      if (result.status === 'fulfilled') {
        console.log(`[generateTraces] Topic "${task.topicName}": ${result.value.records.length} records, ${result.value.errors.length} errors`);
        allErrors.push(...result.value.errors);
      } else {
        const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`[generateTraces] Topic "${task.topicName}" failed:`, errorMsg);
        allErrors.push(`${task.topicName}: ${errorMsg}`);
      }
    }

    const createdTotal = progressCounter.count;

    console.log('[generateTraces] ========== GENERATION COMPLETE ==========');
    console.log('[generateTraces] Summary:', {
      totalCreated: createdTotal,
      totalExpected: totalExpectedRecords,
      errorCount: allErrors.length,
    });

    if (createdTotal === 0) {
      console.log('[generateTraces] No traces generated - returning failure');
      return {
        success: false,
        dataset_name: dataset.name,
        error: allErrors.length > 0 ? allErrors.join(' | ') : 'No traces were generated',
      };
    }

    console.log('[generateTraces] Success!');
    return {
      success: true,
      dataset_name: dataset.name,
      created_count: createdTotal,
      error: allErrors.length > 0 ? `${allErrors.length} error(s): ${allErrors.slice(0, 5).join(' | ')}${allErrors.length > 5 ? '...' : ''}` : undefined,
    };
  } catch (error) {
    console.error('[generateTraces] Fatal error:', error);
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
