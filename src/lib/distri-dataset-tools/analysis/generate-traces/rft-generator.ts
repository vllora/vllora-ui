/**
 * RFT (Reinforcement Fine-Tuning) Generator
 *
 * Generates varied prompts with empty output for reinforcement learning rollouts.
 * Similar to the Python pipeline approach where:
 * - Input contains context + varied user message
 * - Output is empty (rollout handled separately during training)
 */

import type { DatasetRecord, DataInfo } from '@/types/dataset-types';
import type { SyntheticMessage, SyntheticTraceRecord } from './types';
import { callLLMText } from './llm';
import { RFT_USER_VARIATION_PROMPT, SIMULATED_USER_PROMPT } from './prompts';
import {
  extractSeedMessages,
  extractSeedSystemPrompt,
  ensurePersona,
  normalizeAndValidateMessages,
} from './utils';

/**
 * Generate a varied version of a user message based on persona (RFT mode)
 */
export async function generateVariedUserMessage(
  originalMessage: string,
  contextStr: string,
  persona: string
): Promise<string> {
  console.log(`[generateVariedUserMessage] Called with:`);
  console.log(`  - originalMessage: "${originalMessage.substring(0, 100)}${originalMessage.length > 100 ? '...' : ''}"`);
  console.log(`  - contextStr: "${contextStr}"`);
  console.log(`  - persona: "${persona.substring(0, 50)}${persona.length > 50 ? '...' : ''}"`);

  const prompt = RFT_USER_VARIATION_PROMPT
    .replace('{{original_message}}', originalMessage)
    .replace('{{subtopics}}', contextStr)
    .replace('{{persona}}', persona);

  console.log(`[generateVariedUserMessage] Prompt built (${prompt.length} chars), calling LLM...`);

  try {
    const content = await callLLMText(prompt);
    console.log(`[generateVariedUserMessage] LLM returned (${content.length} chars): "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
    return content.trim();
  } catch (error) {
    console.error(`[generateVariedUserMessage] LLM call failed:`, error);
    throw error;
  }
}

/**
 * Generate first user message (fallback when no seed message available)
 */
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

/**
 * Generate RFT-style record: varied prompt with empty output for rollout
 * Similar to the Python pipeline approach
 */
export async function generateRFTRecord(
  topicPath: string[],
  seedRecord: DatasetRecord | undefined,
  _tools: any[], // Tools are passed through but not used in RFT record generation
  personaCache: Map<string, string[]>
): Promise<SyntheticTraceRecord | null> {
  const topicStr = topicPath.join(' -> ');
  const topicKey = topicPath.join('/');
  const contextStr = topicStr;

  console.log(`[generateRFTRecord] Starting for topic: ${topicStr}`);
  console.log(`[generateRFTRecord] Seed record ID: ${seedRecord?.id || 'none'}`);
  console.log(`[generateRFTRecord] Seed record data keys:`, seedRecord?.data ? Object.keys(seedRecord.data as object) : 'none');

  // Get seed messages
  const seedMessages = extractSeedMessages(seedRecord);
  console.log(`[generateRFTRecord] Extracted ${seedMessages.length} seed messages`);
  if (seedMessages.length > 0) {
    console.log(`[generateRFTRecord] Message roles:`, seedMessages.map((m: any) => m?.role));
  }

  const seedSystemPrompt = extractSeedSystemPrompt(seedMessages);
  console.log(`[generateRFTRecord] Seed system prompt: ${seedSystemPrompt ? 'found' : 'none'}`);

  // Find the last user message to vary
  const lastUserMsgIndex = [...seedMessages].reverse().findIndex((m: any) => m?.role === 'user');
  console.log(`[generateRFTRecord] Last user message reverse index: ${lastUserMsgIndex}`);

  if (lastUserMsgIndex === -1 || seedMessages.length === 0) {
    console.log(`[generateRFTRecord] No user message found in seed, falling back to basic generation`);
    // Fallback: generate a fresh first message
    const persona = await ensurePersona(personaCache, topicKey, contextStr);
    const systemPrompt = seedSystemPrompt || `You are a helpful assistant specializing in ${topicStr}.`;
    const firstUserMsg = await generateFirstUserMessage(contextStr, persona, systemPrompt);

    const messages: SyntheticMessage[] = [
      { role: 'system', content: systemPrompt, tool_calls: null, tool_call_id: null },
      { role: 'user', content: firstUserMsg, tool_calls: null, tool_call_id: null },
    ];

    return { topic_path: topicPath, persona, messages };
  }

  // Get context messages (everything before the last user message)
  const actualLastUserIndex = seedMessages.length - 1 - lastUserMsgIndex;
  console.log(`[generateRFTRecord] Actual last user index: ${actualLastUserIndex}`);

  const contextMessages = seedMessages.slice(0, actualLastUserIndex);
  const lastUserMsg = seedMessages[actualLastUserIndex];
  const originalUserMessage = lastUserMsg?.content || '';

  console.log(`[generateRFTRecord] Found ${contextMessages.length} context messages`);
  console.log(`[generateRFTRecord] Last user message object:`, JSON.stringify(lastUserMsg, null, 2).substring(0, 200));
  console.log(`[generateRFTRecord] Original user message to vary (${originalUserMessage.length} chars): "${originalUserMessage.substring(0, 100)}${originalUserMessage.length > 100 ? '...' : ''}"`);

  // Generate persona and varied user message
  const persona = await ensurePersona(personaCache, topicKey, contextStr);
  console.log(`[generateRFTRecord] Persona: ${persona.substring(0, 50)}...`);

  const variedUserMessage = await generateVariedUserMessage(originalUserMessage, contextStr, persona);
  console.log(`[generateRFTRecord] Varied message generated (${variedUserMessage.length} chars)`);

  // Build messages: system (if any) + context + varied user message
  const messages: SyntheticMessage[] = [];

  // Add system message
  const systemPrompt = seedSystemPrompt || `You are a helpful assistant specializing in ${topicStr}.`;
  messages.push({ role: 'system', content: systemPrompt, tool_calls: null, tool_call_id: null });

  // Add context messages (excluding system, it's already added)
  for (const msg of contextMessages) {
    if (msg?.role === 'system') continue;
    messages.push({
      role: msg.role,
      content: msg.content ?? null,
      tool_calls: msg.tool_calls ?? null,
      tool_call_id: msg.tool_call_id ?? null,
    });
  }

  // Add varied user message
  messages.push({ role: 'user', content: variedUserMessage, tool_calls: null, tool_call_id: null });

  console.log(`[generateRFTRecord] Completed: ${messages.length} total messages (RFT mode - no assistant response)`);
  console.log(`[generateRFTRecord] Final record: topic_path="${topicPath.join('/')}", persona="${persona.substring(0, 50)}...", messages=${messages.length}`);

  const result = { topic_path: topicPath, persona, messages };
  console.log(`[generateRFTRecord] Returning valid record object`);
  return result;
}

/**
 * Build DataInfo for RFT mode: input only, empty output for rollout
 */
export function buildRFTDataInfo(rec: SyntheticTraceRecord, tools: any[]): DataInfo {
  console.log(`[buildRFTDataInfo] Building DataInfo for RFT mode`);
  console.log(`[buildRFTDataInfo] Input record has ${rec.messages.length} messages`);
  console.log(`[buildRFTDataInfo] Tools count: ${tools.length}`);

  const toolNames = new Set(
    tools
      .map((t: any) => t?.function?.name)
      .filter((n: any) => typeof n === 'string')
  );
  console.log(`[buildRFTDataInfo] Tool names: ${Array.from(toolNames).join(', ') || 'none'}`);

  const normalizedMessages = normalizeAndValidateMessages(rec.messages, toolNames);
  console.log(`[buildRFTDataInfo] Normalized messages count: ${normalizedMessages.length}`);

  if (normalizedMessages.length === 0) {
    console.error(`[buildRFTDataInfo] WARNING: Normalized messages is EMPTY! Original messages:`, JSON.stringify(rec.messages, null, 2).substring(0, 500));
  } else {
    console.log(`[buildRFTDataInfo] First message role: ${normalizedMessages[0]?.role}, content length: ${normalizedMessages[0]?.content?.length || 0}`);
  }

  const result: DataInfo = {
    input: {
      messages: normalizedMessages,
      tools,
    },
    output: {
      // Empty output - rollout handled separately during RFT training
      messages: undefined,
      finish_reason: undefined,
    },
  };

  console.log(`[buildRFTDataInfo] DataInfo built successfully`);
  return result;
}
