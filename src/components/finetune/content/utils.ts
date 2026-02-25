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
 * Epoch data with average score
 */
export interface EpochData {
  epoch: number;
  avgScore: number | null;
  count: number;
}

/**
 * Training summary computed from evaluation results
 */
export interface TrainingSummary {
  totalRows: number;
  epochData: EpochData[];
  latestEpoch: number | null;
  latestAvgScore: number | null;
  /** Score change from previous epoch (null if only one epoch) */
  scoreDelta: number | null;
}

/**
 * Compute training summary from evaluation results.
 * Shared logic used by EpochSummary and FinetuneJobCard.
 */
export function computeTrainingSummary(
  results: Array<{ row_index: number; epochs: Record<string, Array<{ score?: number | null }>> }>
): TrainingSummary | null {
  if (!results || results.length === 0) return null;

  // Collect all epochs across all rows
  const epochStats = new Map<number, { scores: number[]; count: number }>();

  for (const row of results) {
    for (const [epochStr, evalResults] of Object.entries(row.epochs)) {
      const epoch = parseInt(epochStr, 10);
      if (!epochStats.has(epoch)) {
        epochStats.set(epoch, { scores: [], count: 0 });
      }
      const stats = epochStats.get(epoch)!;
      for (const result of evalResults) {
        stats.count++;
        if (typeof result.score === 'number') {
          stats.scores.push(result.score);
        }
      }
    }
  }

  // Sort epochs
  const sortedEpochs = Array.from(epochStats.entries()).sort(([a], [b]) => a - b);
  if (sortedEpochs.length === 0) return null;

  // Calculate average scores per epoch
  const epochData = sortedEpochs.map(([epoch, stats]) => {
    const avgScore = stats.scores.length > 0
      ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
      : null;
    return { epoch, avgScore, count: stats.count };
  });

  const latestEpochData = epochData[epochData.length - 1];

  // Compute score change from previous epoch
  let scoreDelta: number | null = null;
  if (epochData.length >= 2) {
    const prev = epochData[epochData.length - 2];
    const latest = epochData[epochData.length - 1];
    if (prev.avgScore !== null && latest.avgScore !== null) {
      scoreDelta = latest.avgScore - prev.avgScore;
    }
  }

  return {
    totalRows: results.length,
    epochData,
    latestEpoch: latestEpochData?.epoch ?? null,
    latestAvgScore: latestEpochData?.avgScore ?? null,
    scoreDelta,
  };
}

/**
 * Trigger a file download via an invisible anchor element.
 * Works with pre-signed URLs from cloud storage (S3, GCS, etc.).
 */
export function triggerFileDownload(url: string, filename?: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
