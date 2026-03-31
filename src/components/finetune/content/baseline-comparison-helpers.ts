/**
 * baseline-comparison-helpers
 *
 * Data processing and utility functions for BaselineComparisonPanel.
 * Extracts scores from eval results, computes per-topic comparisons.
 */

import type {
  RowEpochResult,
  RowEpochResults,
} from "@/services/finetune-api";

// ============================================================================
// Types
// ============================================================================

export interface TopicComparison {
  readonly topic: string;
  readonly baselineMean: number;
  readonly baselineCount: number;
  readonly bestEpochMean: number;
  readonly bestEpoch: number;
  readonly delta: number;
  readonly improvementPct: number;
}

export type SortField = "topic" | "baselineMean" | "bestEpochMean" | "delta" | "improvementPct";
export type SortDir = "asc" | "desc";

export interface ChartDatum {
  readonly topic: string;
  readonly shortTopic: string;
  readonly baseline: number;
  readonly bestEpoch: number;
  readonly delta: number;
  readonly improvementPct: number;
}

// ============================================================================
// Color helpers
// ============================================================================

export const COLOR_BASELINE = "#6b7280";
export const COLOR_IMPROVED = "#22c55e";
export const COLOR_REGRESSED = "#ef4444";

export function scoreColor(score: number): string {
  if (score >= 0.8) return "#22c55e";
  if (score >= 0.6) return "#eab308";
  return "#ef4444";
}

export function deltaColor(delta: number): string {
  if (delta > 0.001) return "text-green-400";
  if (delta < -0.001) return "text-red-400";
  return "text-zinc-400";
}

export function deltaBgColor(delta: number): string {
  if (delta > 0.001) return "bg-green-500/10";
  if (delta < -0.001) return "bg-red-500/10";
  return "bg-zinc-800/40";
}

// ============================================================================
// Data processing
// ============================================================================

/** Build a map from record ID to topic name. */
export function buildRecordTopicMap(
  records: ReadonlyArray<{ id: string; topic?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of records) {
    if (r.topic) {
      map.set(r.id, r.topic);
    }
  }
  return map;
}

/** Extract per-row mean scores from baseline eval results, keyed by record ID. */
export function extractBaselineScores(
  results: readonly RowEpochResult[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const row of results) {
    const rowId = row.row?.id;
    if (!rowId || !row.epochs) continue;

    const epochKeys = Object.keys(row.epochs).map(Number).filter((n) => !isNaN(n));
    if (epochKeys.length === 0) continue;

    const latestEpoch = Math.max(...epochKeys);
    const entries = row.epochs[String(latestEpoch)] ?? [];
    const validScores = entries
      .map((e) => e.score)
      .filter((s): s is number => typeof s === "number");

    if (validScores.length > 0) {
      const mean = validScores.reduce((a, b) => a + b, 0) / validScores.length;
      scores.set(rowId, mean);
    }
  }
  return scores;
}

/** For finetune eval results, compute per-epoch per-row mean scores. */
export function extractEpochScores(
  results: readonly RowEpochResults[],
): Map<number, Map<string, number>> {
  const epochMap = new Map<number, Map<string, number>>();

  for (const row of results) {
    const rowId = row.row?.id;
    if (!rowId || !row.epochs) continue;

    for (const [epochStr, entries] of Object.entries(row.epochs)) {
      const epoch = parseInt(epochStr, 10);
      if (isNaN(epoch)) continue;

      const validScores = (entries as Array<{ score?: number | null }>)
        .map((e) => e.score)
        .filter((s): s is number => typeof s === "number");

      if (validScores.length === 0) continue;

      const mean = validScores.reduce((a, b) => a + b, 0) / validScores.length;

      if (!epochMap.has(epoch)) {
        epochMap.set(epoch, new Map());
      }
      epochMap.get(epoch)!.set(rowId, mean);
    }
  }
  return epochMap;
}

/** Find the best epoch (highest overall average score). */
function findBestEpoch(epochScores: Map<number, Map<string, number>>): number {
  let bestEpoch = 0;
  let bestAvg = -Infinity;

  for (const [epoch, scores] of epochScores) {
    if (scores.size === 0) continue;
    const values = Array.from(scores.values());
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestEpoch = epoch;
    }
  }
  return bestEpoch;
}

/** Compute per-topic comparison stats. */
export function computeTopicComparisons(
  baselineScores: Map<string, number>,
  epochScores: Map<number, Map<string, number>>,
  recordTopicMap: Map<string, string>,
): readonly TopicComparison[] {
  if (epochScores.size === 0) return [];

  const bestEpoch = findBestEpoch(epochScores);
  const bestEpochScores = epochScores.get(bestEpoch) ?? new Map<string, number>();

  const topicBaseline = new Map<string, number[]>();
  const topicBest = new Map<string, number[]>();

  const allRecordIds = new Set([
    ...baselineScores.keys(),
    ...bestEpochScores.keys(),
  ]);

  for (const recordId of allRecordIds) {
    const topic = recordTopicMap.get(recordId) ?? "Uncategorized";

    const baseScore = baselineScores.get(recordId);
    if (baseScore !== undefined) {
      if (!topicBaseline.has(topic)) topicBaseline.set(topic, []);
      topicBaseline.get(topic)!.push(baseScore);
    }

    const bestScore = bestEpochScores.get(recordId);
    if (bestScore !== undefined) {
      if (!topicBest.has(topic)) topicBest.set(topic, []);
      topicBest.get(topic)!.push(bestScore);
    }
  }

  const allTopics = new Set([...topicBaseline.keys(), ...topicBest.keys()]);
  const comparisons: TopicComparison[] = [];

  for (const topic of allTopics) {
    const baseScores = topicBaseline.get(topic) ?? [];
    const bestScores = topicBest.get(topic) ?? [];

    const baselineMean = baseScores.length > 0
      ? baseScores.reduce((a, b) => a + b, 0) / baseScores.length
      : 0;
    const bestEpochMean = bestScores.length > 0
      ? bestScores.reduce((a, b) => a + b, 0) / bestScores.length
      : 0;

    const delta = bestEpochMean - baselineMean;
    const improvementPct = baselineMean > 0
      ? (delta / baselineMean) * 100
      : bestEpochMean > 0 ? 100 : 0;

    comparisons.push({
      topic,
      baselineMean,
      baselineCount: baseScores.length,
      bestEpochMean,
      bestEpoch: bestEpoch + 1, // 1-indexed for display
      delta,
      improvementPct,
    });
  }

  return comparisons.sort((a, b) => b.delta - a.delta);
}

// ============================================================================
// Epoch progression (for trend line chart)
// ============================================================================

export interface EpochProgressPoint {
  readonly epoch: number;
  readonly label: string;
  readonly avg: number;
}

/**
 * Compute per-epoch overall average scores for the trend line chart.
 * Returns one point per epoch, plus a "Baseline" point at the start.
 */
export function computeEpochProgression(
  baselineScores: Map<string, number>,
  epochScores: Map<number, Map<string, number>>,
): readonly EpochProgressPoint[] {
  // Baseline average
  const baseValues = Array.from(baselineScores.values());
  const baseAvg = baseValues.length > 0
    ? baseValues.reduce((a, b) => a + b, 0) / baseValues.length
    : 0;

  const points: EpochProgressPoint[] = [
    { epoch: 0, label: "Baseline", avg: baseAvg },
  ];

  const sortedEpochs = Array.from(epochScores.keys()).sort((a, b) => a - b);
  for (const epoch of sortedEpochs) {
    const scores = epochScores.get(epoch);
    if (!scores || scores.size === 0) continue;
    const values = Array.from(scores.values());
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    points.push({ epoch: epoch + 1, label: `Epoch ${epoch + 1}`, avg });
  }

  return points;
}

/** Sort comparisons by a given field and direction. */
export function sortComparisons(
  comparisons: readonly TopicComparison[],
  field: SortField,
  dir: SortDir,
): readonly TopicComparison[] {
  return [...comparisons].sort((a, b) => {
    const aVal = field === "topic" ? a.topic.toLowerCase() : a[field];
    const bVal = field === "topic" ? b.topic.toLowerCase() : b[field];
    if (aVal < bVal) return dir === "asc" ? -1 : 1;
    if (aVal > bVal) return dir === "asc" ? 1 : -1;
    return 0;
  });
}
