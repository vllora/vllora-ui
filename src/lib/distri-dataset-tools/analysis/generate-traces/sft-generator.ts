/**
 * SFT (Supervised Fine-Tuning) Generator
 *
 * Generates complete multi-turn conversations with assistant responses.
 * The output includes both input messages and assistant response for SFT training.
 */

import type { SyntheticMessage, SyntheticTraceRecord, AssistantTurnOutput } from './types';
import { callLLMText, callLLMJson, initMessage } from './llm';
import {
  SIMULATED_USER_PROMPT,
  SIMULATED_TOOL_RESULT_PROMPT,
  SIMULATED_USER_SYSTEM_PROMPT,
  ASSISTANT_RESPONSE_INSTRUCTIONS,
  ASSISTANT_TURN_SCHEMA,
} from './prompts';
import {
  ensurePersona,
  condenseToolsForPrompt,
  normalizeAssistantToolCalls,
  buildAssistantMessages,
  buildUserHistory,
} from './utils';

/**
 * Generate first user message for conversation
 */
export async function generateFirstUserMessage(
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
 * Build assistant system prompt with tool instructions
 */
function buildAssistantSystemPrompt(systemPrompt: string, tools: any[]): string {
  const toolInstruction = tools.length > 0
    ? '\nYou have available tools where needed to complete the user\'s request.'
    : '';
  const condensedTools = condenseToolsForPrompt(tools);
  return `${systemPrompt}${toolInstruction}\n\n${ASSISTANT_RESPONSE_INSTRUCTIONS}\n\nAvailable tools:\n${JSON.stringify(condensedTools, null, 2)}`;
}

/**
 * Generate assistant turn (response with optional tool calls)
 */
export async function generateAssistantTurn(
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

/**
 * Simulate tool result for a tool call
 */
export async function simulateToolResult(toolName: string, args: string, contextStr: string): Promise<string> {
  const prompt = SIMULATED_TOOL_RESULT_PROMPT
    .replace('{{tool_name}}', toolName)
    .replace('{{tool_arguments}}', args)
    .replace('{{subtopics}}', contextStr);
  const content = await callLLMText(prompt);
  return content.trim();
}

/**
 * Generate user response in conversation
 */
export async function generateUserResponse(
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

/**
 * Simulate a complete multi-turn conversation (SFT mode)
 */
export async function simulateConversation(
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
