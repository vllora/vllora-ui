/**
 * Utility functions for trace generation
 */

import type { DatasetRecord, DataInfo } from '@/types/dataset-types';
import type { DistriMessage } from '@distri/core';
import type {
  SyntheticToolCall,
  SyntheticMessage,
  SyntheticTraceRecord,
  TopicHierarchyNode,
  LeafTopic,
} from './types';
import { callLLMText } from './llm';
import { initMessage } from './llm';
import { SIMULATED_PERSONA_BATCH_PROMPT } from './prompts';
import { DEFAULT_PERSONA_GUIDANCE } from './types';

// ============================================================================
// JSON Parsing
// ============================================================================

export function cleanJsonString(raw: string): string {
  return raw.replace(/```json/gi, '').replace(/```/g, '').trim();
}

export function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(cleanJsonString(raw));
  } catch {
    return null;
  }
}

export function parsePersonaList(raw: string): string[] {
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

// ============================================================================
// Topic Hierarchy
// ============================================================================

export function extractLeafTopicsFromHierarchy(nodes: TopicHierarchyNode[], parentPath: string[] = []): LeafTopic[] {
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

// ============================================================================
// Seed Record Extraction
// ============================================================================

export function extractSeedTools(record?: DatasetRecord): any[] {
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

export function extractSeedMessages(record?: DatasetRecord): any[] {
  const data = (record?.data || {}) as any;
  return Array.isArray(data?.input?.messages) ? data.input.messages : [];
}

export function extractSeedSystemPrompt(messages: any[]): string | null {
  if (!Array.isArray(messages)) return null;
  const systemMsg = messages.find((m: any) => m?.role === 'system');
  if (systemMsg && typeof systemMsg.content === 'string') {
    return systemMsg.content;
  }
  return null;
}

// ============================================================================
// Tool Processing
// ============================================================================

export function condenseToolsForPrompt(tools: any[]): Array<{ name: string; required: string[]; properties: string[] }> {
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

export function normalizeAssistantToolCalls(toolCalls: unknown, toolNames: Set<string>): SyntheticToolCall[] | null {
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

// ============================================================================
// Message Processing
// ============================================================================

export function normalizeAndValidateMessages(messages: SyntheticMessage[], toolNames: Set<string>): SyntheticMessage[] {
  console.log(`[normalizeAndValidateMessages] Starting with ${messages.length} messages, ${toolNames.size} tool names`);
  const normalized: SyntheticMessage[] = [];
  const assistantToolCallIds = new Set<string>();

  for (const raw of messages) {
    console.log(`[normalizeAndValidateMessages] Processing message: role=${raw.role}, content length=${raw.content?.length || 0}`);
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

  console.log(`[normalizeAndValidateMessages] Completed: ${normalized.length} messages after normalization`);
  return normalized;
}

export function buildAssistantMessages(messages: SyntheticMessage[], toolCallNameById: Map<string, string>): DistriMessage[] {
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

export function buildUserHistory(messages: SyntheticMessage[], toolCallNameById: Map<string, string>): string {
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

// ============================================================================
// DataInfo Building (SFT mode)
// ============================================================================

export function buildSyntheticTraceDataInfo(rec: SyntheticTraceRecord, tools: any[]): DataInfo {
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

// ============================================================================
// Persona Generation
// ============================================================================

// Track in-flight persona generation requests to avoid race conditions
const personaGenerationInFlight = new Map<string, Promise<string[]>>();

export async function ensurePersona(
  personaCache: Map<string, string[]>,
  topicKey: string,
  contextStr: string
): Promise<string> {
  // Check if we already have cached personas
  const cached = personaCache.get(topicKey);
  if (cached && cached.length > 0) {
    return cached.shift() || 'A curious user interested in the topic.';
  }

  // Check if there's already a request in flight for this topic
  const inFlight = personaGenerationInFlight.get(topicKey);
  if (inFlight) {
    console.log(`[ensurePersona] Waiting for in-flight request for topic: ${topicKey}`);
    await inFlight;
    // After waiting, check cache again
    const nowCached = personaCache.get(topicKey);
    if (nowCached && nowCached.length > 0) {
      return nowCached.shift() || 'A curious user interested in the topic.';
    }
    return 'A curious user interested in the topic.';
  }

  // Start new persona generation and track it
  console.log(`[ensurePersona] Generating personas for topic: ${topicKey}`);
  const generationPromise = (async () => {
    const prompt = SIMULATED_PERSONA_BATCH_PROMPT
      .replace('{{subtopics}}', contextStr)
      .replace('{{persona_guidance}}', DEFAULT_PERSONA_GUIDANCE);
    const raw = await callLLMText(prompt);
    return parsePersonaList(raw);
  })();

  personaGenerationInFlight.set(topicKey, generationPromise);

  try {
    const personas = await generationPromise;
    if (personas.length > 0) {
      personaCache.set(topicKey, personas);
    } else {
      personaCache.set(topicKey, ['A curious user interested in the topic.']);
    }
  } finally {
    personaGenerationInFlight.delete(topicKey);
  }

  const next = personaCache.get(topicKey) || [];
  return next.shift() || 'A curious user interested in the topic.';
}
