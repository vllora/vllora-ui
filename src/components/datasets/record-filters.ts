/**
 * Shared filtering and sorting logic for dataset records.
 * Used by both UI components and Lucy agent tools to ensure consistency.
 */

import { DatasetRecord } from "@/types/dataset-types";
import { getLabel, getDataAsObject } from "./record-utils";
import { extractMessages } from "./records-table/cells/ConversationThreadCell.utilities";
import { parseChunkRef } from "@/lib/distri-finetune-tools/steps/shared/chunk-lookup";

export type SortField = "timestamp" | "topic" | "evaluation";
export type SortDirection = "asc" | "desc";

/** Record role relative to evaluation/training pipeline */
export type RecordRole = "all" | "training" | "evaluated";

/** Stat filter type for clickable stats in RecordsSectionHeader (P0-19) */
export type StatFilter = "all" | "from_spans" | "labeled" | "evaluated";

/** P0-9: Role configuration for visual display */
export const ROLE_CONFIG = {
  training: { label: "Training", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  evaluated: { label: "Evaluated", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
} as const;

/** P0-9: Determine the role of a record based on evaluation state */
export function getRecordRole(record: DatasetRecord): "training" | "evaluated" {
  return record.evaluation?.score !== undefined ? "evaluated" : "training";
}

export interface RecordFilterOptions {
  /** Search query to filter by content, topic, or span ID */
  search?: string;
  /** Filter by exact topic match */
  topic?: string;
  /** Filter by generated traces */
  generated?: "all" | "generated" | "not_generated";
  /** Filter by record role (P0-9: eval vs training clarity) */
  role?: RecordRole;
  /** Filter by stat category (P0-19: clickable stats navigation) */
  statFilter?: StatFilter;
  /** Filter by source document ID (show only records generated from this knowledge source) */
  sourceDocumentId?: string;
}

export interface RecordSortOptions {
  /** Field to sort by */
  field?: SortField;
  /** Sort direction */
  direction?: SortDirection;
}

/**
 * Filter records by search query and/or topic.
 * Searches in: label, topic, spanId, and conversation message content.
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

  // Filter by record role (P0-9)
  if (options.role === "evaluated") {
    filtered = filtered.filter(r => r.evaluation?.score !== undefined);
  } else if (options.role === "training") {
    filtered = filtered.filter(r => r.evaluation?.score === undefined);
  }

  // Filter by stat category (P0-19)
  if (options.statFilter === "from_spans") {
    filtered = filtered.filter(r => !!r.spanId);
  } else if (options.statFilter === "labeled") {
    filtered = filtered.filter(r => !!r.topic);
  } else if (options.statFilter === "evaluated") {
    filtered = filtered.filter(r => r.evaluation?.score !== undefined);
  }

  // Filter by source document
  if (options.sourceDocumentId) {
    const targetSourceId = options.sourceDocumentId;
    filtered = filtered.filter(r => {
      const refs = (r.metadata?.sourceChunkRefs as string[]) || [];
      return refs.some(ref => parseChunkRef(ref)?.sourceId === targetSourceId);
    });
  }

  // Filter by search query (searches in label, topic, spanId, and message content)
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

      // Search in conversation message content
      const messages = extractMessages(data);
      for (const msg of messages) {
        if (msg.content.toLowerCase().includes(query)) return true;
      }

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
