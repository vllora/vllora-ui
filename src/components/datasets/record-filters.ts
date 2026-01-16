/**
 * Shared filtering and sorting logic for dataset records.
 * Used by both UI components and Lucy agent tools to ensure consistency.
 */

import { DatasetRecord } from "@/types/dataset-types";
import { getLabel, getDataAsObject } from "./record-utils";

export type SortField = "timestamp" | "topic" | "evaluation";
export type SortDirection = "asc" | "desc";

export interface RecordFilterOptions {
  /** Search query to filter by content, topic, or span ID */
  search?: string;
  /** Filter by exact topic match */
  topic?: string;
  /** Filter by generated traces */
  generated?: "all" | "generated" | "not_generated";
}

export interface RecordSortOptions {
  /** Field to sort by */
  field?: SortField;
  /** Sort direction */
  direction?: SortDirection;
}

/**
 * Filter records by search query and/or topic.
 * Searches in: label (from data.attribute.label), topic, and spanId.
 */
export function filterRecords(
  records: DatasetRecord[],
  options: RecordFilterOptions
): DatasetRecord[] {
  let filtered = records;

  // Filter by exact topic match
  if (options.topic) {
    const topicLower = options.topic.toLowerCase();
    filtered = filtered.filter(r => r.topic?.toLowerCase() === topicLower);
  }

  // Filter by generated status
  if (options.generated === "generated") {
    filtered = filtered.filter(r => !!r.is_generated);
  } else if (options.generated === "not_generated") {
    filtered = filtered.filter(r => !r.is_generated);
  }

  // Filter by search query (searches in label, topic, and spanId)
  if (options.search?.trim()) {
    const query = options.search.toLowerCase();
    filtered = filtered.filter(r => {
      // Search in label (from data.attribute.label)
      const label = getLabel(r)?.toLowerCase() || "";
      if (label.includes(query)) return true;

      // Search in topic
      const topic = r.topic?.toLowerCase() || "";
      if (topic.includes(query)) return true;

      // Search in spanId
      const data = getDataAsObject(r);
      const spanId = ((data.span_id as string) || r.id).toLowerCase();
      if (spanId.includes(query)) return true;

      return false;
    });
  }

  return filtered;
}

/**
 * Sort records by the specified field and direction.
 * Empty topics/evaluations are sorted to the end.
 */
export function sortRecords(
  records: DatasetRecord[],
  options: RecordSortOptions
): DatasetRecord[] {
  const field = options.field || "timestamp";
  const direction = options.direction || "desc";
  const multiplier = direction === "asc" ? 1 : -1;

  return [...records].sort((a, b) => {
    switch (field) {
      case "timestamp":
        return (a.createdAt - b.createdAt) * multiplier;

      case "topic": {
        const topicA = a.topic?.toLowerCase() || "";
        const topicB = b.topic?.toLowerCase() || "";
        // Empty topics go last
        if (!topicA && !topicB) return 0;
        if (!topicA) return 1;
        if (!topicB) return -1;
        return topicA.localeCompare(topicB) * multiplier;
      }

      case "evaluation": {
        const scoreA = a.evaluation?.score ?? -1;
        const scoreB = b.evaluation?.score ?? -1;
        // No evaluation goes last
        if (scoreA === -1 && scoreB === -1) return 0;
        if (scoreA === -1) return 1;
        if (scoreB === -1) return -1;
        return (scoreA - scoreB) * multiplier;
      }

      default:
        return 0;
    }
  });
}

/**
 * Apply both filtering and sorting to records.
 */
export function filterAndSortRecords(
  records: DatasetRecord[],
  filterOptions: RecordFilterOptions,
  sortOptions: RecordSortOptions
): DatasetRecord[] {
  const filtered = filterRecords(records, filterOptions);
  return sortRecords(filtered, sortOptions);
}
