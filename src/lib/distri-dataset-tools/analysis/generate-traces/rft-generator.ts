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
import { callLLMText, callLLM, initMessage } from './llm';
import {
  RFT_USER_VARIATION_PROMPT,
  SIMULATED_USER_PROMPT,
  BATCH_VARIATION_PROMPT,
  BATCH_FIRST_MESSAGE_PROMPT,
  BATCH_GENERATION_RESPONSE_SCHEMA,
} from './prompts';
import {
  extractSeedMessages,
  extractSeedSystemPrompt,
  ensurePersona,
  normalizeAndValidateMessages,
  tryParseJson,
} from './utils';

/**
 * Build a compact "Tool Schema" section to inject into prompts.
 */
function buildToolsSection(tools: unknown[]): string {
  if (!tools || tools.length === 0) return "";
  const lines = tools.map((t: any) => {
    const fn = t?.function ?? t;
    const name = fn?.name ?? "unknown";
    const desc = fn?.description ?? "";
    return `- ${name}${desc ? ": " + desc : ""}`;
  });
  return `\nTool Schema:\nThe assistant has access to the following tools. Generate user messages that would naturally use one or more of these tools:\n${lines.join("\n")}\n`;
}

/**
 * Generate a varied version of a user message based on persona (RFT mode)
 */
export async function generateVariedUserMessage(
  originalMessage: string,
  contextStr: string,
  persona: string,
  tools: any[] = [],
  systemPrompt?: string,
): Promise<string> {
  console.log(`[generateVariedUserMessage] Called with:`);
  console.log(`  - originalMessage: "${originalMessage.substring(0, 100)}${originalMessage.length > 100 ? '...' : ''}"`);
  console.log(`  - contextStr: "${contextStr}"`);
  console.log(`  - persona: "${persona.substring(0, 50)}${persona.length > 50 ? '...' : ''}"`);

  const prompt = RFT_USER_VARIATION_PROMPT
    .replace('{{original_message}}', originalMessage)
    .replace('{{subtopics}}', contextStr)
    .replace('{{system_prompt}}', systemPrompt || `You are a helpful assistant specializing in ${contextStr}.`)
    .replace('{{persona}}', persona)
    .replace('{{tools_section}}', buildToolsSection(tools));

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
  systemPrompt: string,
  tools: any[] = []
): Promise<string> {
  const prompt = SIMULATED_USER_PROMPT
    .replace('{{subtopics}}', contextStr)
    .replace('{{persona}}', persona)
    .replace('{{system_prompt}}', systemPrompt)
    .replace('{{tools_section}}', buildToolsSection(tools));
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
  tools: any[],
  personaCache: Map<string, string[]>,
  knowledgeContext?: string,
  /** Pre-built shared system prompt for this topic */
  topicSystemPrompt?: string,
): Promise<SyntheticTraceRecord | null> {
  const topicStr = topicPath.join(' -> ');
  const topicKey = topicPath.join('/');
  const contextStr = knowledgeContext ? `${topicStr}\n\n${knowledgeContext}` : topicStr;

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
    const systemPrompt = topicSystemPrompt || seedSystemPrompt || `You are a helpful assistant specializing in ${topicStr}.`;
    const firstUserMsg = await generateFirstUserMessage(contextStr, persona, systemPrompt, tools);

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

  // Resolve system prompt — topic system prompt takes priority over per-record seed
  const systemPrompt = topicSystemPrompt || seedSystemPrompt || `You are a helpful assistant specializing in ${topicStr}.`;

  // Generate persona and varied user message
  const persona = await ensurePersona(personaCache, topicKey, contextStr);
  console.log(`[generateRFTRecord] Persona: ${persona.substring(0, 50)}...`);

  const variedUserMessage = await generateVariedUserMessage(originalUserMessage, contextStr, persona, tools, systemPrompt);
  console.log(`[generateRFTRecord] Varied message generated (${variedUserMessage.length} chars)`);

  // Build messages: system (if any) + context + varied user message
  const messages: SyntheticMessage[] = [];
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

// ─── Batch Generation (multiple training examples per LLM call) ───

/** Single training example returned by batch generation */
interface BatchExample {
  user_message: string;
  assistant_response: string;
  expected_score: number;
}

/**
 * Generate N training examples in a single LLM call for a topic.
 * Each example includes user_message + assistant_response + expected_score.
 *
 * Returns an array of SyntheticTraceRecord, each with the shared system prompt
 * + context messages + one unique varied user message, plus skillResponse/baseScore.
 */
export async function generateBatchRFTRecords(
  topicPath: string[],
  seedRecord: DatasetRecord | undefined,
  tools: any[],
  personaCache: Map<string, string[]>,
  count: number,
  knowledgeContext?: string,
  topicSystemPrompt?: string,
): Promise<SyntheticTraceRecord[]> {
  const topicStr = topicPath.join(' -> ');
  const topicKey = topicPath.join('/');
  const contextStr = knowledgeContext ? `${topicStr}\n\n${knowledgeContext}` : topicStr;

  console.log(`[generateBatchRFTRecords] Starting batch for topic: ${topicStr}, count: ${count}`);

  // Extract seed messages
  const seedMessages = extractSeedMessages(seedRecord);
  const seedSystemPrompt = extractSeedSystemPrompt(seedMessages);
  const systemPrompt = topicSystemPrompt || seedSystemPrompt || `You are a helpful assistant specializing in ${topicStr}.`;

  // Find the last user message to use as variation seed
  const lastUserMsgIndex = [...seedMessages].reverse().findIndex((m: any) => m?.role === 'user');

  // Generate a persona for metadata (batch shares a persona pool internally)
  const persona = await ensurePersona(personaCache, topicKey, contextStr);

  let examples: BatchExample[];

  if (lastUserMsgIndex === -1 || seedMessages.length === 0) {
    // No seed user message — generate fresh examples
    console.log(`[generateBatchRFTRecords] No seed user message, generating ${count} fresh examples`);
    examples = await generateBatchFirstMessages(contextStr, systemPrompt, tools, count, knowledgeContext);
  } else {
    // Have a seed user message — generate variations
    const actualLastUserIndex = seedMessages.length - 1 - lastUserMsgIndex;
    const originalUserMessage = seedMessages[actualLastUserIndex]?.content || '';
    console.log(`[generateBatchRFTRecords] Generating ${count} variations of: "${originalUserMessage.substring(0, 80)}..."`);
    examples = await generateBatchVariations(originalUserMessage, contextStr, tools, count, knowledgeContext, systemPrompt);
  }

  console.log(`[generateBatchRFTRecords] LLM returned ${examples.length} examples`);

  // Build context messages (everything before the last user message, excluding system)
  const contextMsgs: SyntheticMessage[] = [];
  if (lastUserMsgIndex !== -1 && seedMessages.length > 0) {
    const actualLastUserIndex = seedMessages.length - 1 - lastUserMsgIndex;
    for (const msg of seedMessages.slice(0, actualLastUserIndex)) {
      if (msg?.role === 'system') continue;
      contextMsgs.push({
        role: msg.role,
        content: msg.content ?? null,
        tool_calls: msg.tool_calls ?? null,
        tool_call_id: msg.tool_call_id ?? null,
      });
    }
  }

  // Assemble each example into a full SyntheticTraceRecord with skillResponse/baseScore
  return examples.map((example) => {
    const messages: SyntheticMessage[] = [
      { role: 'system', content: systemPrompt, tool_calls: null, tool_call_id: null },
      ...contextMsgs,
      { role: 'user', content: example.user_message, tool_calls: null, tool_call_id: null },
    ];
    return {
      topic_path: topicPath,
      persona,
      messages,
      skillResponse: example.assistant_response,
      baseScore: example.expected_score,
    };
  });
}

/**
 * Generate N training examples from a seed message in one LLM call.
 * Each example includes user_message + assistant_response + expected_score.
 */
async function generateBatchVariations(
  originalMessage: string,
  contextStr: string,
  tools: any[],
  count: number,
  knowledgeContext?: string,
  systemPrompt?: string,
): Promise<BatchExample[]> {
  const knowledgeSection = knowledgeContext
    ? `\nKnowledge Context (ground your messages in this material):\n${knowledgeContext}\n`
    : '';

  const prompt = BATCH_VARIATION_PROMPT
    .replace(/\{\{count\}\}/g, String(count))
    .replace('{{original_message}}', originalMessage)
    .replace('{{subtopics}}', contextStr)
    .replace('{{system_prompt}}', systemPrompt || `You are a helpful assistant specializing in ${contextStr}.`)
    .replace('{{tools_section}}', buildToolsSection(tools))
    .replace('{{knowledge_context}}', knowledgeSection);

  const response = await callLLM(
    [initMessage('user', prompt)],
    { responseFormat: BATCH_GENERATION_RESPONSE_SCHEMA },
  );

  const parsed = tryParseJson<{ examples: BatchExample[] }>(response);
  if (!parsed?.examples?.length) {
    console.warn(`[generateBatchVariations] Failed to parse batch response, falling back to empty`);
    return [];
  }
  return parsed.examples;
}

/**
 * Generate N fresh training examples when no seed record exists, in one LLM call.
 * Each example includes user_message + assistant_response + expected_score.
 */
async function generateBatchFirstMessages(
  contextStr: string,
  systemPrompt: string,
  tools: any[],
  count: number,
  knowledgeContext?: string,
): Promise<BatchExample[]> {
  const knowledgeSection = knowledgeContext
    ? `\nKnowledge Context (ground your messages in this material):\n${knowledgeContext}\n`
    : '';

  const prompt = BATCH_FIRST_MESSAGE_PROMPT
    .replace(/\{\{count\}\}/g, String(count))
    .replace('{{subtopics}}', contextStr)
    .replace('{{system_prompt}}', systemPrompt)
    .replace('{{tools_section}}', buildToolsSection(tools))
    .replace('{{knowledge_context}}', knowledgeSection);

  const response = await callLLM(
    [initMessage('user', prompt)],
    { responseFormat: BATCH_GENERATION_RESPONSE_SCHEMA },
  );

  const parsed = tryParseJson<{ examples: BatchExample[] }>(response);
  if (!parsed?.examples?.length) {
    console.warn(`[generateBatchFirstMessages] Failed to parse batch response, falling back to empty`);
    return [];
  }
  return parsed.examples;
}

/**
 * Build DataInfo for trace record: input only, empty output for rollout.
 * The assistant response is stored in metadata (skillResponse), not in the DataInfo output.
 */
export function buildTraceDataInfo(rec: SyntheticTraceRecord, tools: any[]): DataInfo {
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
