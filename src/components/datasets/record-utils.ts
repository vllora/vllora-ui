/**
 * Utility functions for dataset records
 */

import { analyzeCoverage } from "@/lib/distri-dataset-tools/analysis/analyze-coverage";
import { CoverageStats, DatasetRecord, TopicHierarchyConfig, TopicHierarchyNode } from "@/types/dataset-types";

/** Available topic for selection in TopicCell */
export interface AvailableTopic {
  id: string;     // Unique identifier (matches record.topic)
  name: string;   // Display name
  path: string[]; // Full path from root to this topic (names)
}

/**
 * Extract all leaf topics from a topic hierarchy.
 * Returns topics with their full paths for display.
 */
export function getLeafTopicsFromHierarchy(
  nodes: TopicHierarchyNode[] | undefined,
  parentPath: string[] = []
): AvailableTopic[] {
  if (!nodes || nodes.length === 0) return [];

  const topics: AvailableTopic[] = [];

  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];

    if (node.children && node.children.length > 0) {
      // Recurse into children
      topics.push(...getLeafTopicsFromHierarchy(node.children, currentPath));
    } else {
      // Leaf node - add as available topic
      topics.push({
        id: node.id || node.name,  // Use id for matching with record.topic
        name: node.name,
        path: currentPath,
      });
    }
  }

  return topics;
}

/**
 * Extract ALL topics from a topic hierarchy (not just leaves).
 * Used for display/filtering purposes only - NOT for record assignment.
 * Records should only be assigned to leaf topics.
 */
export function getAllTopicsFromHierarchy(
  nodes: TopicHierarchyNode[] | undefined,
  parentPath: string[] = []
): AvailableTopic[] {
  if (!nodes || nodes.length === 0) return [];

  const topics: AvailableTopic[] = [];

  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];

    // Add this topic
    topics.push({
      id: node.id || node.name,  // Use id for matching with record.topic
      name: node.name,
      path: currentPath,
    });

    // Recurse into children if any
    if (node.children && node.children.length > 0) {
      topics.push(...getAllTopicsFromHierarchy(node.children, currentPath));
    }
  }

  return topics;
}

// Helper to safely access record data as object
export const getDataAsObject = (record: DatasetRecord): Record<string, unknown> => {
  return (record.data as Record<string, unknown>) || {};
};

// Labels are not guaranteed; return undefined by default
export const getLabel = (_record: DatasetRecord): string | undefined => {
  return undefined;
};

// Get provider name from record data
export const getProviderName = (record: DatasetRecord): string => {
  const data = getDataAsObject(record);

  // Span-like records
  const attr = data.attribute as Record<string, unknown> | undefined;
  const provider = attr?.provider_name as string | undefined;
  if (provider) return provider.toLowerCase();

  // Try to infer from model name
  const model = attr?.model as Record<string, unknown> | undefined;
  const modelName = (model?.name as string) || (attr?.model_name as string) || "";

  if (modelName.includes("gpt") || modelName.includes("o1") || modelName.includes("o3")) return "openai";
  if (modelName.includes("claude")) return "anthropic";
  if (modelName.includes("llama") || modelName.includes("meta")) return "meta";
  if (modelName.includes("gemini")) return "google";
  if (modelName.includes("mistral")) return "mistral";
  return "unknown";
};

// Get record display name (label or id truncated)
export const getRecordName = (record: DatasetRecord): string => {
  const label = getLabel(record);
  if (label) return label;
  const data = getDataAsObject(record);
  const spanId = (data.span_id as string) || record.id;
  if (spanId.length > 16) return spanId.slice(0, 16) + "...";
  return spanId;
};

// Get provider badge color
export const getProviderColor = (provider: string): string => {
  switch (provider) {
    case "openai": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "anthropic": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "meta": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "google": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "mistral": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

// Predefined color palette for topic badges (20 colors)
const TOPIC_COLORS = [
  "bg-emerald-500/15 text-emerald-500",
  "bg-blue-500/15 text-blue-400",
  "bg-violet-500/15 text-violet-400",
  "bg-amber-500/15 text-amber-500",
  "bg-cyan-500/15 text-cyan-400",
  "bg-pink-500/15 text-pink-400",
  "bg-indigo-500/15 text-indigo-400",
  "bg-teal-500/15 text-teal-400",
  "bg-orange-500/15 text-orange-400",
  "bg-rose-500/15 text-rose-400",
  "bg-lime-500/15 text-lime-500",
  "bg-sky-500/15 text-sky-400",
  "bg-fuchsia-500/15 text-fuchsia-400",
  "bg-yellow-500/15 text-yellow-500",
  "bg-purple-500/15 text-purple-400",
  "bg-green-500/15 text-green-500",
  "bg-neutral-500/15 text-neutral-400",
  "bg-slate-500/15 text-slate-400",
  "bg-zinc-500/15 text-zinc-400",
];

// Simple string hash function for consistent color assignment
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

/**
 * Find a topic node in the hierarchy by its id/name.
 * Returns the node if found, undefined otherwise.
 */
export function findTopicInHierarchy(
  nodes: TopicHierarchyNode[] | undefined,
  topicId: string
): TopicHierarchyNode | undefined {
  if (!nodes || nodes.length === 0) return undefined;

  for (const node of nodes) {
    const nodeId = node.id || node.name;
    if (nodeId === topicId || node.name === topicId) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findTopicInHierarchy(node.children, topicId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Get all descendant leaf topic IDs for a given topic node.
 * If the node itself is a leaf, returns just its ID.
 * Used for aggregating records when viewing a parent topic.
 */
export function getDescendantLeafTopicIds(node: TopicHierarchyNode): string[] {
  if (!node.children || node.children.length === 0) {
    // Leaf node - return its ID
    return [node.id || node.name];
  }

  // Parent node - recurse into children
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(...getDescendantLeafTopicIds(child));
  }
  return ids;
}

// Get topic badge color based on topic name (hash-based for consistency)
export const getTopicColor = (topic: string | undefined): string => {
  if (!topic) return "";
  const t = topic.toLowerCase();

  // Reserve red for error-related topics
  if (t.includes("error") || t.includes("fail") || t.includes("exception")) {
    return "bg-red-500/15 text-red-400";
  }

  // Hash-based color for all other topics
  const hash = hashString(t);
  return TOPIC_COLORS[hash % TOPIC_COLORS.length];
};

// ============================================================================
// Dataset Insights Computation
// ============================================================================

export interface DatasetInsights {
  /** Total number of records */
  totalRecords: number;
  /** Number of generated (synthetic) records */
  generatedRecords: number;
  /** Number of original (non-generated) records */
  originalRecords: number;
  /** Percentage of generated records (0-100) */
  generatedPercent: number;
  /** Percentage of original records (0-100) */
  originalPercent: number;
  /** Number of unique topics */
  topicCount: number;
  /** Number of records without a topic */
  uncategorizedCount: number;
  /** Number of records with a topic */
  categorizedCount: number;
  /** Percentage of categorized records (0-100) */
  categorizedPercent: number;
  /** Topic distribution: topic -> count */
  topicDistribution: Record<string, number>;
}


export function computeCoverageStats(props: {records: DatasetRecord[], topic_hierarchy?: TopicHierarchyConfig}): CoverageStats {
  const { records, topic_hierarchy } = props;
  // Calculate coverage
    const coverageReport = analyzeCoverage({records, hierarchy: topic_hierarchy});
  
    // Convert to CoverageStats format for storage
    const coverageStats: CoverageStats = {
      balanceScore: coverageReport.balanceScore,
      balanceRating: coverageReport.balanceRating,
      topicDistribution: Object.fromEntries(
        Object.entries(coverageReport.distribution).map(([topic, dist]) => [topic, dist.count])
      ),
      uncategorizedCount: coverageReport.uncategorizedCount,
      totalRecords: coverageReport.totalRecords,
      lastCalculatedAt: Date.now(),
    };
    return coverageStats;
}

/**
 * Compute dataset insights from records.
 * Pure function that derives all stats from the records array.
 */
export function computeDatasetInsights(records: DatasetRecord[]): DatasetInsights {
  const totalRecords = records.length;

  // Generated vs original records
  const generatedRecords = records.filter(r => r.is_generated).length;
  const originalRecords = totalRecords - generatedRecords;
  const generatedPercent = totalRecords > 0 ? Math.round((generatedRecords / totalRecords) * 100) : 0;
  const originalPercent = totalRecords > 0 ? Math.round((originalRecords / totalRecords) * 100) : 0;

  // Topic stats
  const topicDistribution: Record<string, number> = {};
  let uncategorizedCount = 0;

  for (const r of records) {
    if (r.topic) {
      topicDistribution[r.topic] = (topicDistribution[r.topic] || 0) + 1;
    } else {
      uncategorizedCount++;
    }
  }

  const topicCount = Object.keys(topicDistribution).length;
  const categorizedCount = totalRecords - uncategorizedCount;
  const categorizedPercent = totalRecords > 0 ? Math.round((categorizedCount / totalRecords) * 100) : 0;

  return {
    totalRecords,
    generatedRecords,
    originalRecords,
    generatedPercent,
    originalPercent,
    topicCount,
    uncategorizedCount,
    categorizedCount,
    categorizedPercent,
    topicDistribution,
  };
}
