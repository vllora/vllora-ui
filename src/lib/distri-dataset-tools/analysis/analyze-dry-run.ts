/**
 * Dry Run Analysis Service
 *
 * Analyzes dry run evaluation results and produces comprehensive diagnostics.
 * Based on the Quality Assessment Framework from the documentation.
 *
 * Key metrics:
 * - Mean (healthy: 0.25-0.65)
 * - Std Dev (healthy: 0.10-0.25)
 * - %>0 (healthy: >10-20%)
 * - %=1.0 (healthy: <30-50%)
 * - Percentiles (p10, p25, p50, p75, p90)
 * - Per-topic breakdown
 */

import {
  DryRunStats,
  DryRunDiagnosis,
  DryRunVerdict,
  QualityRating,
  ScoreDistribution,
  Percentiles,
  TopicDryRunStats,
} from '@/types/dataset-types';
import { updateDatasetDryRunStats } from '@/services/datasets-db';
import type { EvaluationResultResponse } from '@/services/finetune-api';

// =============================================================================
// Configuration - Thresholds from documentation
// =============================================================================

const THRESHOLDS = {
  // Mean score thresholds
  mean: {
    low: 0.25,   // Below this is "too hard"
    high: 0.65,  // Above this is "too easy"
  },
  // Standard deviation thresholds
  std: {
    low: 0.10,   // Below this is "flat/no differentiation"
    high: 0.25,  // Above this might indicate bimodal
  },
  // Percentage above zero
  percentAboveZero: {
    min: 0.10,   // At least 10% should score > 0
  },
  // Percentage perfect scores
  percentPerfect: {
    max: 0.50,   // No more than 50% should be perfect
  },
  // Per-topic minimum mean
  topicMeanMin: 0.15,
};

// =============================================================================
// Statistical Calculations
// =============================================================================

/**
 * Calculate percentile value from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] * (upper - index) + sortedArr[upper] * (index - lower);
}

/**
 * Calculate all percentiles from scores
 */
function calculatePercentiles(scores: number[]): Percentiles {
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
  };
}

/**
 * Calculate score distribution buckets
 */
function calculateDistribution(scores: number[]): ScoreDistribution {
  const buckets: ScoreDistribution = {
    '0.0-0.2': 0,
    '0.2-0.4': 0,
    '0.4-0.6': 0,
    '0.6-0.8': 0,
    '0.8-1.0': 0,
  };

  if (scores.length === 0) return buckets;

  for (const score of scores) {
    if (score < 0.2) buckets['0.0-0.2']++;
    else if (score < 0.4) buckets['0.2-0.4']++;
    else if (score < 0.6) buckets['0.4-0.6']++;
    else if (score < 0.8) buckets['0.6-0.8']++;
    else buckets['0.8-1.0']++;
  }

  // Convert to percentages
  const total = scores.length;
  return {
    '0.0-0.2': buckets['0.0-0.2'] / total,
    '0.2-0.4': buckets['0.2-0.4'] / total,
    '0.4-0.6': buckets['0.4-0.6'] / total,
    '0.6-0.8': buckets['0.6-0.8'] / total,
    '0.8-1.0': buckets['0.8-1.0'] / total,
  };
}

/**
 * Calculate mean of scores
 */
function calculateMean(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Calculate standard deviation
 */
function calculateStd(scores: number[], mean: number): number {
  if (scores.length === 0) return 0;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  return Math.sqrt(variance);
}

// =============================================================================
// Diagnosis Logic
// =============================================================================

/**
 * Diagnose dry run results based on documentation thresholds
 */
function diagnoseResults(
  mean: number,
  std: number,
  percentAboveZero: number,
  percentPerfect: number,
  byTopic: Record<string, TopicDryRunStats>
): DryRunDiagnosis {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const issues: DryRunDiagnosis['issues'] = [];

  let datasetQuality: QualityRating = 'good';
  let graderQuality: QualityRating = 'good';

  // Check mean
  if (mean < THRESHOLDS.mean.low) {
    issues.push({
      type: 'mean_low',
      severity: 'error',
      message: `Mean score too low (${(mean * 100).toFixed(1)}%)`,
      suggestion: 'Dataset may be too hard, or grader may be too strict. Review sample outputs to determine which.',
    });
    warnings.push(`Mean (${mean.toFixed(2)}) below healthy range (${THRESHOLDS.mean.low}-${THRESHOLDS.mean.high})`);
    // Could be dataset or grader issue - need manual review
    datasetQuality = 'warning';
    graderQuality = 'warning';
  } else if (mean > THRESHOLDS.mean.high) {
    issues.push({
      type: 'mean_high',
      severity: 'warning',
      message: `Mean score too high (${(mean * 100).toFixed(1)}%)`,
      suggestion: 'Dataset may be too easy for RFT, or grader may be too lenient. RFT works best when there is room to improve.',
    });
    warnings.push(`Mean (${mean.toFixed(2)}) above healthy range - RFT may have limited improvement signal`);
    datasetQuality = 'warning';
  }

  // Check standard deviation
  if (std < THRESHOLDS.std.low) {
    issues.push({
      type: 'std_low',
      severity: 'warning',
      message: `Score variance too low (std: ${std.toFixed(3)})`,
      suggestion: 'Grader may not differentiate outputs well. Consider adding more dimensions to the grading rubric.',
    });
    warnings.push(`Std (${std.toFixed(3)}) too low - grader may not distinguish good from bad outputs`);
    graderQuality = 'warning';
  } else if (std > THRESHOLDS.std.high) {
    issues.push({
      type: 'std_high',
      severity: 'warning',
      message: `Score variance high (std: ${std.toFixed(3)})`,
      suggestion: 'Scores may be bimodal (pass/fail). Consider using gradient scoring instead of binary.',
    });
    warnings.push(`Std (${std.toFixed(3)}) high - may indicate binary scoring`);
  }

  // Check percentage above zero
  if (percentAboveZero < THRESHOLDS.percentAboveZero.min) {
    issues.push({
      type: 'low_success',
      severity: 'error',
      message: `Only ${(percentAboveZero * 100).toFixed(1)}% of samples scored above zero`,
      suggestion: 'Base model struggles with these tasks. Consider using SFT first to bootstrap capability.',
    });
    warnings.push(`Very few samples score above zero (${(percentAboveZero * 100).toFixed(1)}%)`);
    datasetQuality = 'problem';
    recommendations.push('Consider using SFT first to bootstrap base model capability');
  }

  // Check percentage perfect
  if (percentPerfect > THRESHOLDS.percentPerfect.max) {
    issues.push({
      type: 'too_easy',
      severity: 'warning',
      message: `${(percentPerfect * 100).toFixed(1)}% of samples score perfectly`,
      suggestion: 'Dataset may be too easy or grader too lenient. RFT needs room for improvement.',
    });
    warnings.push(`Too many perfect scores (${(percentPerfect * 100).toFixed(1)}%) - limited improvement signal`);
    if (datasetQuality === 'good') datasetQuality = 'warning';
  }

  // Check per-topic breakdown
  const problemTopics: string[] = [];
  for (const [topic, stats] of Object.entries(byTopic)) {
    if (stats.mean < THRESHOLDS.topicMeanMin) {
      problemTopics.push(topic);
      stats.status = 'problem';
    } else if (stats.mean < THRESHOLDS.mean.low) {
      stats.status = 'warning';
    }
  }

  if (problemTopics.length > 0) {
    issues.push({
      type: 'topic_problem',
      severity: 'warning',
      message: `Topics with very low scores: ${problemTopics.join(', ')}`,
      suggestion: 'These topics may need SFT first, or consider excluding them from RFT.',
    });
    warnings.push(`Some topics perform very poorly: ${problemTopics.join(', ')}`);
    recommendations.push(`Review topics: ${problemTopics.join(', ')} - may need SFT or exclusion`);
  }

  // Generate recommendations
  if (mean < THRESHOLDS.mean.low && percentAboveZero < 0.2) {
    recommendations.push('Review lowest-scoring samples to determine if issue is data or grader');
    recommendations.push('If grader issue: relax thresholds or add partial credit');
    recommendations.push('If data issue: use SFT to bootstrap capability first');
  }

  if (mean > THRESHOLDS.mean.high) {
    recommendations.push('Review highest-scoring samples for reward hacking');
    recommendations.push('Consider tightening grader criteria or adding harder examples');
  }

  if (std < THRESHOLDS.std.low) {
    recommendations.push('Add more grading dimensions to differentiate outputs');
    recommendations.push('Use partial credit instead of binary pass/fail');
  }

  // Determine verdict
  let verdict: DryRunVerdict = 'GO';

  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');

  if (hasErrors) {
    verdict = 'NO-GO';
  } else if (hasWarnings) {
    verdict = 'WARNING';
  }

  // Override to NO-GO if dataset quality is critically poor
  if (datasetQuality === 'problem') {
    verdict = 'NO-GO';
  }

  return {
    datasetQuality,
    graderQuality,
    verdict,
    warnings,
    recommendations,
    issues,
  };
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze evaluation results and produce comprehensive dry run stats
 */
export function analyzeDryRunResults(
  evaluationResult: EvaluationResultResponse,
  samplePercentage: number,
  recordTopics?: Record<string, string> // recordId -> topic mapping
): DryRunStats {
  const results = evaluationResult.results;
  const scores = results.map((r) => r.score ?? 0);

  // Calculate basic statistics
  const mean = calculateMean(scores);
  const std = calculateStd(scores, mean);
  const sorted = [...scores].sort((a, b) => a - b);
  const min = sorted.length > 0 ? sorted[0] : 0;
  const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
  const percentiles = calculatePercentiles(scores);

  // Calculate score fractions
  const percentAboveZero = scores.length > 0
    ? scores.filter((s) => s > 0).length / scores.length
    : 0;
  const percentPerfect = scores.length > 0
    ? scores.filter((s) => s >= 1.0).length / scores.length
    : 0;

  // Calculate distribution
  const distribution = calculateDistribution(scores);

  // Calculate per-topic breakdown
  const byTopic: Record<string, TopicDryRunStats> = {};
  if (recordTopics) {
    const topicScores: Record<string, number[]> = {};

    for (const result of results) {
      const topic = recordTopics[result.dataset_row_id] || '__unknown__';
      if (!topicScores[topic]) topicScores[topic] = [];
      topicScores[topic].push(result.score ?? 0);
    }

    for (const [topic, topicScoreList] of Object.entries(topicScores)) {
      const topicMean = calculateMean(topicScoreList);
      const topicStd = calculateStd(topicScoreList, topicMean);
      byTopic[topic] = {
        mean: topicMean,
        std: topicStd,
        count: topicScoreList.length,
        status: topicMean >= THRESHOLDS.mean.low ? 'good' : topicMean >= THRESHOLDS.topicMeanMin ? 'warning' : 'problem',
      };
    }
  }

  // Run diagnosis
  const diagnosis = diagnoseResults(mean, std, percentAboveZero, percentPerfect, byTopic);

  // Extract sample results for manual review
  const sortedResults = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const highest = sortedResults.slice(0, 5).map((r) => ({
    recordId: r.dataset_row_id,
    score: r.score ?? 0,
    reason: r.reason,
  }));
  const lowest = sortedResults.slice(-5).reverse().map((r) => ({
    recordId: r.dataset_row_id,
    score: r.score ?? 0,
    reason: r.reason,
  }));

  // Find samples around mean
  const aroundMean = sortedResults
    .filter((r) => Math.abs((r.score ?? 0) - mean) < 0.1)
    .slice(0, 5)
    .map((r) => ({
      recordId: r.dataset_row_id,
      score: r.score ?? 0,
      reason: r.reason,
    }));

  return {
    evaluationRunId: evaluationResult.evaluation_run_id,
    lastRunAt: Date.now(),
    samplesEvaluated: evaluationResult.completed_rows,
    samplePercentage,
    statistics: {
      mean,
      std,
      median: percentiles.p50,
      min,
      max,
      percentiles,
      percentAboveZero,
      percentPerfect,
    },
    distribution,
    byTopic,
    diagnosis,
    sampleResults: {
      highest,
      lowest,
      aroundMean,
    },
  };
}

// =============================================================================
// Shared Function for Tool and UI
// =============================================================================

/**
 * Calculate dry run stats and save to dataset
 *
 * This is the shared function used by both Lucy agent and UI.
 */
export async function calculateAndSaveDryRunStats(
  datasetId: string,
  evaluationResult: EvaluationResultResponse,
  samplePercentage: number,
  recordTopics?: Record<string, string>
): Promise<DryRunStats> {
  // Calculate stats
  const dryRunStats = analyzeDryRunResults(evaluationResult, samplePercentage, recordTopics);

  // Save to dataset
  await updateDatasetDryRunStats(datasetId, dryRunStats);

  return dryRunStats;
}

/**
 * Get verdict description for display
 */
export function getVerdictDescription(verdict: DryRunVerdict): string {
  switch (verdict) {
    case 'GO':
      return 'Ready for training. Dataset and grader quality are good.';
    case 'WARNING':
      return 'Proceed with caution. Review warnings before starting training.';
    case 'NO-GO':
      return 'Not ready for training. Address the issues before proceeding.';
  }
}

/**
 * Get quality rating color class for UI
 */
export function getQualityRatingClass(rating: QualityRating): string {
  switch (rating) {
    case 'good':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'warning':
      return 'text-amber-600 dark:text-amber-400';
    case 'problem':
      return 'text-red-600 dark:text-red-400';
    case 'unknown':
      return 'text-muted-foreground';
  }
}

/**
 * Get verdict color class for UI
 */
export function getVerdictClass(verdict: DryRunVerdict): string {
  switch (verdict) {
    case 'GO':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    case 'WARNING':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    case 'NO-GO':
      return 'bg-red-500/15 text-red-600 dark:text-red-400';
  }
}
