/**
 * Utility functions for Finetune Jobs
 */

import { formatDistanceToNow, differenceInSeconds, differenceInMinutes, differenceInHours } from "date-fns";
import { BASE_MODELS } from "./constants";

export function formatDate(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

export function formatDuration(startDate: string, endDate?: string | null): string {
  try {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();

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
