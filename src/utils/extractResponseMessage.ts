import { ToolCall } from "@/types/chat";

export interface ExtractedResponseMessage {
  role: 'assistant' | 'user' | 'system' | 'tool';
  content: string | any[];
  tool_calls?: ToolCall[];
}

export interface ExtractedResponse {
  messages: ExtractedResponseMessage[];
  finish_reason: string | null;
  tool_calls: any[] | null;
}

/**
 * Extracts messages from various LLM response formats (OpenAI, Anthropic, Google, etc.)
 * Handles different response structures:
 * - Direct messages array (response.messages)
 * - OpenAI format (response.choices[0].message)
 * - Google/Gemini format (response.candidates[0].content)
 * - Simple content format (response.content with response.role)
 * - Anthropic format (response.stop_reason)
 */
export function extractResponseMessage(props: {
  responseObject: any;
  otherLevelMessages?: string[];
}): ExtractedResponse {
  const { responseObject: response, otherLevelMessages } = props;

  let messages: ExtractedResponseMessage[] | null = null;
  let finish_reason: string | null = null;
  const tool_calls = response?.tool_calls || null;

  // Extract from response.choices (OpenAI format)
  const choices: any[] | null = response?.choices || null;

  // Extract from response.candidates (Google/Gemini format)
  const candidates: any[] | null = response?.candidates || null;

  // --- Extract finish_reason ---

  // 1. Direct finish_reason
  if (response?.finish_reason) {
    finish_reason = response.finish_reason;
  }

  // 2. From choices[0].finish_reason (OpenAI)
  if (!finish_reason && choices && choices.length >= 1) {
    finish_reason = choices[0].finish_reason || null;
  }

  // 3. From candidates[0].finishReason (Google/Gemini)
  if (!finish_reason && candidates && candidates.length >= 1) {
    finish_reason = candidates[0].finishReason || null;
  }

  // 4. From response.stop_reason (Anthropic)
  if (!finish_reason && response?.stop_reason) {
    finish_reason = response.stop_reason;
  }

  // --- Extract messages ---

  // 1. Direct messages array
  if (response?.messages && Array.isArray(response.messages)) {
    messages = response.messages;
  }

  // 2. From choices[0].message (OpenAI)
  if (!messages && choices && choices.length >= 1 && choices[0].message) {
    messages = [choices[0].message];
  }

  // 3. From candidates[0].content (Google/Gemini)
  if (!messages && candidates && candidates.length >= 1 && candidates[0].content) {
    messages = [candidates[0].content];
  }

  // 4. From otherLevelMessages (fallback for nested spans)
  if (!messages && otherLevelMessages && otherLevelMessages.length > 0) {
    messages = otherLevelMessages.map((message: string) => ({
      content: message,
      role: 'assistant' as const,
    }));
  }

  // 5. From response.content (simple format or Anthropic)
  if ((!messages || messages.length === 0) && response?.content) {
    messages = [{
      content: response.content,
      role: (response.role as ExtractedResponseMessage['role']) || 'assistant',
    }];
  }

  return {
    messages: messages || [],
    finish_reason,
    tool_calls,
  };
}

/**
 * Check if a response object has extractable content
 */
export function hasExtractableResponse(response: any): boolean {
  if (!response) return false;

  return !!(
    response.messages ||
    response.tool_calls ||
    response.choices ||
    response.candidates ||
    response.content
  );
}
