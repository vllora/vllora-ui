/**
 * Utility functions for Finetune Jobs
 */

import { formatDistanceToNow, differenceInSeconds, differenceInMinutes, differenceInHours } from "date-fns";
import { BASE_MODELS } from "./constants";

/**
 * Parse a finetune job date string ensuring it's treated as UTC.
 * Handles timestamps like "2026-02-05 12:53:55" (space-separated, no timezone).
 */
export function parseFinetuneJobDate(dateString: string): Date {
  let isoString = dateString;
  // Handle space-separated format: "2025-09-29 14:11:50.395000"
  if (!dateString.includes('T')) {
    isoString = dateString.replace(' ', 'T');
  }
  // Ensure UTC timezone if not specified
  if (!isoString.endsWith('Z') && !isoString.includes('+') && !isoString.includes('-', 10)) {
    isoString += 'Z';
  }
  return new Date(isoString);
}

/**
 * Format a finetune job date as relative time (e.g., "5 minutes ago").
 */
export function formatFinetuneJobDate(dateString: string): string {
  try {
    return formatDistanceToNow(parseFinetuneJobDate(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

export function formatDuration(startDate: string, endDate?: string | null): string {
  try {
    const start = parseFinetuneJobDate(startDate);
    const end = endDate ? parseFinetuneJobDate(endDate) : new Date();

    const hours = differenceInHours(end, start);
    const minutes = differenceInMinutes(end, start) % 60;
    const seconds = differenceInSeconds(end, start) % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  } catch {
    return "-";
  }
}

export function getModelDisplayName(modelId: string): string {
  const model = BASE_MODELS.find(m => m.value === modelId);
  return model?.label || modelId;
}

/**
 * Message in a conversation
 */
export interface Message {
  role: string;
  content: string;
}

/**
 * Extract input messages and output message from a training row.
 * The last assistant message is treated as the model output.
 */
export function extractConversation(row: Record<string, unknown>): {
  inputMessages: Message[];
  outputMessage: Message | null;
} {
  const input = row.input as Record<string, unknown> | undefined;
  const messages = (input?.messages || row.messages) as Message[] | undefined;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { inputMessages: [], outputMessage: null };
  }

  // Last message is typically the assistant's response (model output)
  const lastMessage = messages[messages.length - 1];
  const isLastAssistant = lastMessage?.role === "assistant";

  if (isLastAssistant) {
    return {
      inputMessages: messages.slice(0, -1),
      outputMessage: lastMessage,
    };
  }

  // If no assistant message at the end, all messages are input
  return {
    inputMessages: messages,
    outputMessage: null,
  };
}
