/**
 * Parse Score Breakdown
 *
 * Utility to extract structured score breakdowns from evaluation reason strings.
 * Handles formats like: "[Acc:5, Pedagogy:4, Tone:5, Clarity:4] detailed reasoning..."
 */

export interface ScoreBreakdown {
  /** Individual criteria scores (normalized to 0-1 scale) */
  criteria: Record<string, number>;
  /** The detailed reasoning text after the breakdown */
  reasoning: string;
  /** Whether a breakdown was successfully parsed */
  hasBreakdown: boolean;
}

/**
 * Parse a reason string to extract score breakdown.
 *
 * Supports formats:
 * - "[Acc:5, Pedagogy:4, Tone:5, Clarity:4] reasoning text"
 * - "[Accuracy: 0.8, Pedagogy: 0.9] reasoning text"
 * - Just reasoning text (no breakdown)
 *
 * @param reason The evaluation reason string
 * @param maxScore The maximum score value (default 5 for 1-5 scale, use 1 for 0-1 scale)
 * @returns Parsed breakdown with criteria scores normalized to 0-1
 */
export function parseScoreBreakdown(
  reason: string | undefined | null,
  maxScore: number = 5
): ScoreBreakdown {
  if (!reason) {
    return { criteria: {}, reasoning: "", hasBreakdown: false };
  }

  // Match pattern: [Key:Value, Key:Value, ...] or [Key: Value, Key: Value, ...]
  const breakdownMatch = reason.match(/^\s*\[([^\]]+)\]\s*/);

  if (!breakdownMatch) {
    return { criteria: {}, reasoning: reason.trim(), hasBreakdown: false };
  }

  const breakdownStr = breakdownMatch[1];
  const reasoning = reason.slice(breakdownMatch[0].length).trim();
  const criteria: Record<string, number> = {};

  // Parse individual criteria: "Key:Value" or "Key: Value"
  const criteriaMatches = breakdownStr.matchAll(/(\w+)\s*:\s*([\d.]+)/g);

  for (const match of criteriaMatches) {
    const key = match[1];
    const value = parseFloat(match[2]);

    if (!isNaN(value)) {
      // Normalize to 0-1 scale
      const normalizedValue = maxScore > 1 ? value / maxScore : value;
      criteria[key] = Math.min(1, Math.max(0, normalizedValue));
    }
  }

  return {
    criteria,
    reasoning,
    hasBreakdown: Object.keys(criteria).length > 0,
  };
}

/**
 * Get all unique criteria names from multiple evaluation results
 */
export function getAllCriteriaNames(
  breakdowns: ScoreBreakdown[]
): string[] {
  const criteriaSet = new Set<string>();

  for (const breakdown of breakdowns) {
    for (const key of Object.keys(breakdown.criteria)) {
      criteriaSet.add(key);
    }
  }

  return Array.from(criteriaSet).sort();
}

/**
 * Calculate average scores per criteria across multiple breakdowns
 */
export function averageCriteriaScores(
  breakdowns: ScoreBreakdown[]
): Record<string, number> {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const breakdown of breakdowns) {
    for (const [key, value] of Object.entries(breakdown.criteria)) {
      sums[key] = (sums[key] || 0) + value;
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  const averages: Record<string, number> = {};
  for (const key of Object.keys(sums)) {
    averages[key] = sums[key] / counts[key];
  }

  return averages;
}

/**
 * Get color class based on score value (0-1 scale)
 */
export function getScoreColorClass(score: number): string {
  if (score >= 0.8) return "text-green-600 dark:text-green-400";
  if (score >= 0.6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

/**
 * Get background color class based on score value (0-1 scale)
 */
export function getScoreBgClass(score: number): string {
  if (score >= 0.8) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 0.6) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

/**
 * Format score as decimal string (0-1 scale)
 */
export function formatScore(score: number): string {
  return score.toFixed(2);
}
