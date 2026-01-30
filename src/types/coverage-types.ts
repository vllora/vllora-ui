/**
 * Coverage Analysis Types
 *
 * Types for analyzing topic distribution and balance in datasets.
 */

// Distribution of a single topic
export interface TopicDistribution {
  count: number;
  percentage: number;
  targetPercentage: number;
  gap: number;                  // Difference from target (can be negative)
  status: 'under' | 'ok' | 'over';
}

// Target distribution (user-defined or auto-calculated)
export interface TargetDistribution {
  [topic: string]: number;      // Target percentage (0-100)
}

// Balance rating levels
export type BalanceRating = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

// Complete coverage report
export interface CoverageReport {
  timestamp: string;
  totalRecords: number;
  validRecords: number;
  distribution: Record<string, TopicDistribution>;
  balanceScore: number;         // 0-1 where 1 is perfectly balanced
  balanceRating: BalanceRating;
  recommendations: string[];
  uncategorizedCount: number;
  uncategorizedPercentage: number;
}

// Gap recommendation for synthetic generation
export interface GapRecommendation {
  topic: string;
  currentCount: number;
  targetCount: number;
  gap: number;
  priority: 'high' | 'medium' | 'low';
}

// Generation targets based on gap analysis
export interface GenerationTargets {
  recommendations: GapRecommendation[];
  totalToGenerate: number;
  estimatedBalanceAfter: number;
}

// Helper to get balance rating from score
export function getBalanceRating(score: number): BalanceRating {
  if (score >= 0.8) return 'excellent';
  if (score >= 0.6) return 'good';
  if (score >= 0.4) return 'fair';
  if (score >= 0.2) return 'poor';
  return 'critical';
}

// Human-readable balance descriptions
export const BALANCE_RATING_DESCRIPTIONS: Record<BalanceRating, string> = {
  excellent: 'Topics are well-balanced',
  good: 'Minor imbalance, acceptable',
  fair: 'Noticeable gaps, consider generating more',
  poor: 'Significant imbalance, needs attention',
  critical: 'Severe imbalance, will hurt training',
};

// Balance rating colors for UI
export const BALANCE_RATING_COLORS: Record<BalanceRating, { text: string; bg: string }> = {
  excellent: { text: 'text-green-600', bg: 'bg-green-500/10' },
  good: { text: 'text-green-500', bg: 'bg-green-500/10' },
  fair: { text: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  poor: { text: 'text-orange-500', bg: 'bg-orange-500/10' },
  critical: { text: 'text-red-500', bg: 'bg-red-500/10' },
};
