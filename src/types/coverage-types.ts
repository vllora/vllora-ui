/**
 * Coverage Analysis Types
 *
 * Types for analyzing topic distribution, coverage completeness,
 * and difficulty alignment in datasets.
 *
 * Design principles (research-backed):
 * - Uniform distribution is NOT the goal (arXiv:2508.14094)
 * - Hard topics should get more records (40-50%) because GRPO learning signal is strongest there
 * - Coverage completeness (all topics have ≥15 records) matters more than balance
 */

// Difficulty tier for a topic based on base model eval scores
export type DifficultyTier = 'hard' | 'medium' | 'easy' | 'unknown';

// Distribution of a single topic
export interface TopicDistribution {
  count: number;
  percentage: number;
  targetPercentage: number;
  gap: number;                  // Difference from target (can be negative)
  status: 'under' | 'ok' | 'over';
  difficultyTier?: DifficultyTier; // Based on base model eval scores
  evalScore?: number;            // Average base model eval score (0-1)
}

// Target distribution (user-defined or auto-calculated)
export interface TargetDistribution {
  [topic: string]: number;      // Target percentage (0-100)
}

// Coverage rating levels (renamed from BalanceRating)
export type CoverageRating = 'ready' | 'almost_ready' | 'needs_work' | 'not_ready';

// Keep old name as alias for backward compatibility
export type BalanceRating = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

// Complete coverage report
export interface CoverageReport {
  timestamp: string;
  totalRecords: number;
  validRecords: number;
  distribution: Record<string, TopicDistribution>;
  /** @deprecated Use coverageCompleteness + difficultyAlignment instead */
  balanceScore?: number;         // 0-1 (kept for backward compatibility)
  /** @deprecated Use coverageRating instead */
  balanceRating?: BalanceRating; // kept for backward compatibility
  coverageCompleteness?: number; // 0-1: fraction of leaf topics with ≥15 records
  difficultyAlignment?: number;  // 0-1: how close distribution matches difficulty weights
  coverageRating?: CoverageRating;
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
  difficultyTier?: DifficultyTier;
}

// Generation targets based on gap analysis
export interface GenerationTargets {
  recommendations: GapRecommendation[];
  totalToGenerate: number;
  estimatedBalanceAfter: number;
}

// Difficulty weights for target distribution (arXiv:2508.14094, arXiv:2509.21880)
// Hard topics get the most records because GRPO learning signal is strongest there.
export const DIFFICULTY_WEIGHTS: Record<DifficultyTier, number> = {
  hard: 0.45,
  medium: 0.35,
  easy: 0.20,
  unknown: 0.35, // treat unknown as medium
};

// Minimum records per leaf topic before zero-variance collapse (arXiv:2509.21880)
export const MIN_RECORDS_PER_TOPIC = 15;

// Classify difficulty tier from eval score
export function classifyDifficulty(evalScore: number): DifficultyTier {
  if (evalScore <= 0.3) return 'hard';
  if (evalScore <= 0.7) return 'medium';
  return 'easy';
}

// Helper to get coverage rating from completeness score
export function getCoverageRating(score: number): CoverageRating {
  if (score >= 0.8) return 'ready';
  if (score >= 0.6) return 'almost_ready';
  if (score >= 0.4) return 'needs_work';
  return 'not_ready';
}

// Helper to get balance rating from score (backward compatibility)
export function getBalanceRating(score: number): BalanceRating {
  if (score >= 0.8) return 'excellent';
  if (score >= 0.6) return 'good';
  if (score >= 0.4) return 'fair';
  if (score >= 0.2) return 'poor';
  return 'critical';
}

// Human-readable coverage descriptions
export const COVERAGE_RATING_DESCRIPTIONS: Record<CoverageRating, string> = {
  ready: 'Good coverage across topics, ready for training',
  almost_ready: 'Minor gaps, generate more records for under-covered topics',
  needs_work: 'Significant gaps in coverage or difficulty alignment',
  not_ready: 'Major rework needed — review topic design',
};

// Human-readable balance descriptions (backward compatibility)
export const BALANCE_RATING_DESCRIPTIONS: Record<BalanceRating, string> = {
  excellent: 'Topics are well-covered',
  good: 'Minor gaps, acceptable',
  fair: 'Noticeable gaps, consider generating more',
  poor: 'Significant gaps, needs attention',
  critical: 'Severe gaps, will hurt training',
};

// Coverage rating colors for UI
export const COVERAGE_RATING_COLORS: Record<CoverageRating, { text: string; bg: string }> = {
  ready: { text: 'text-green-600', bg: 'bg-green-500/10' },
  almost_ready: { text: 'text-green-500', bg: 'bg-green-500/10' },
  needs_work: { text: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  not_ready: { text: 'text-red-500', bg: 'bg-red-500/10' },
};

// Balance rating colors for UI (backward compatibility)
export const BALANCE_RATING_COLORS: Record<BalanceRating, { text: string; bg: string }> = {
  excellent: { text: 'text-green-600', bg: 'bg-green-500/10' },
  good: { text: 'text-green-500', bg: 'bg-green-500/10' },
  fair: { text: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  poor: { text: 'text-orange-500', bg: 'bg-orange-500/10' },
  critical: { text: 'text-red-500', bg: 'bg-red-500/10' },
};
