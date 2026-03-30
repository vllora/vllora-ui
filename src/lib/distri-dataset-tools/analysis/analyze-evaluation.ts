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
  EvalStats,
  DryRunDiagnosis,
  DryRunVerdict,
  QualityRating,
  ScoreDistribution,
  Percentiles,
  TopicEvalStats,
} from '@/types/dataset-types';
import { computeReadinessGate } from './compute-readiness-gate';
import { datasetService } from '@/services/service-registry';
import type { EvaluationResultResponse, FlatEvaluationResult } from '@/services/finetune-api';
import { flattenEvaluationResults } from '@/services/finetune-api';

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
  byTopic: Record<string, TopicEvalStats>
): DryRunDiagnosis {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const issues: DryRunDiagnosis['issues'] = [];

  let datasetQuality: QualityRating = 'good';
  let graderQuality: QualityRating = 'good';

  // Check mean — reframed for GRPO: low base model scores are expected.
  // Only near-zero is a real problem (OpenAI RFT: "only 0% success is fatal").
  // DeepSeek R1-Zero started at 15.6% and reached 71% via GRPO (arXiv:2501.12948).
  if (mean < 0.05) {
    issues.push({
      type: 'mean_low',
      severity: 'error',
      message: `Mean score near zero (${(mean * 100).toFixed(1)}%) — no training signal`,
      suggestion: 'The base model produces almost no useful responses. GRPO needs at least some nonzero rewards to learn from. Try a larger base model, or check if the grader is rejecting valid responses.',
    });
    warnings.push(`Mean (${mean.toFixed(2)}) near zero — GRPO has no positive signal to reinforce`);
    datasetQuality = 'problem';
    graderQuality = 'warning';
  } else if (mean < THRESHOLDS.mean.low) {
    issues.push({
      type: 'mean_low',
      severity: 'warning',
      message: `Low average score (${(mean * 100).toFixed(1)}%) — most samples score poorly`,
      suggestion: 'Low base model scores are expected before training. GRPO learns from comparing K=8 completions — hard examples yield the largest gains. Check that the grader differentiates quality correctly.',
    });
    warnings.push(`Mean (${mean.toFixed(2)}) below healthy range — expected for base model, verify grader quality`);
    datasetQuality = 'warning';
  } else if (mean > THRESHOLDS.mean.high) {
    issues.push({
      type: 'mean_high',
      severity: 'warning',
      message: `Mean score is high (${(mean * 100).toFixed(1)}%) — limited room for improvement`,
      suggestion: 'Most records already score well. RFT learns by comparing good and bad responses — when everything scores high, the training signal is weak. Consider making the evaluator more strict or adding harder examples.',
    });
    warnings.push(`Mean (${mean.toFixed(2)}) above healthy range — RFT may have limited improvement signal`);
    datasetQuality = 'warning';
  }

  // Check standard deviation
  if (std < THRESHOLDS.std.low) {
    issues.push({
      type: 'std_low',
      severity: 'warning',
      message: `Score variance too low (std: ${std.toFixed(3)})`,
      suggestion: 'The evaluator gives similar scores to most responses. RFT needs score differences between candidates to learn. Consider adding more evaluation criteria or using a more granular scoring rubric.',
    });
    warnings.push(`Std (${std.toFixed(3)}) too low — evaluator may not distinguish good from bad outputs`);
    graderQuality = 'warning';
  } else if (std > THRESHOLDS.std.high) {
    issues.push({
      type: 'std_high',
      severity: 'warning',
      message: `Score variance is high (std: ${std.toFixed(3)})`,
      suggestion: 'Scores appear to be mostly pass/fail (binary). A smoother scoring scale (e.g., 0.0 to 1.0 with partial credit) provides a better training signal for RFT.',
    });
    warnings.push(`Std (${std.toFixed(3)}) high — may indicate binary pass/fail scoring`);
  }

  // Check percentage above zero — only critical if literally near-zero
  if (percentAboveZero < THRESHOLDS.percentAboveZero.min) {
    issues.push({
      type: 'low_success',
      severity: 'error',
      message: `Only ${(percentAboveZero * 100).toFixed(1)}% of records scored above zero`,
      suggestion: 'Very few responses have any signal. Check if the grader is misconfigured (rejecting valid outputs), or try a larger base model.',
    });
    warnings.push(`Very few records score above zero (${(percentAboveZero * 100).toFixed(1)}%)`);
    datasetQuality = 'problem';
    recommendations.push('Verify the grader is not rejecting valid responses — review reasons for zero-scoring records');
  }

  // Check percentage perfect
  if (percentPerfect > THRESHOLDS.percentPerfect.max) {
    issues.push({
      type: 'too_easy',
      severity: 'warning',
      message: `${(percentPerfect * 100).toFixed(1)}% of records score perfectly (1.0)`,
      suggestion: 'When most responses already score perfectly, the training algorithm has no way to distinguish better from worse — the gradient signal is zero for these records. Consider making the evaluator more strict or adding harder examples.',
    });
    warnings.push(`Too many perfect scores (${(percentPerfect * 100).toFixed(1)}%) — limited training signal`);
    if (datasetQuality === 'good') datasetQuality = 'warning';
  }

  // Check per-topic breakdown — relative to dataset mean, not absolute thresholds.
  // Low topic scores are EXPECTED for base model evals (GRPO learns from hard examples).
  // "problem" means significantly below dataset average, not "bad" in absolute terms.
  const weakTopics: string[] = [];
  const topicMeans = Object.values(byTopic).map(s => s.mean);
  const datasetMean = topicMeans.length > 0 ? topicMeans.reduce((a, b) => a + b, 0) / topicMeans.length : 0;

  for (const [topic, stats] of Object.entries(byTopic)) {
    if (stats.mean < datasetMean * 0.6) {
      weakTopics.push(topic);
      stats.status = 'problem';
    } else if (stats.mean < datasetMean * 0.85) {
      stats.status = 'warning';
    }
    // else: stays 'good' (default from caller)
  }

  if (weakTopics.length > 0) {
    issues.push({
      type: 'topic_problem',
      severity: 'warning',
      message: `Topics scoring well below average: ${weakTopics.join(', ')}`,
      suggestion: 'Review grader reasons for these topics — verify the grader criteria are appropriate. Low scores are expected for base models, but check the grader is differentiating quality correctly.',
    });
    warnings.push(`Some topics score well below the dataset average: ${weakTopics.join(', ')}`);
    recommendations.push(`Review grader output for weak topics: ${weakTopics.join(', ')} — check if grader criteria need topic-specific adjustments`);
  }

  // Generate recommendations — focus on grader quality, not model performance
  if (mean < 0.05 && percentAboveZero < 0.1) {
    recommendations.push('Nearly zero success rate — verify the grader is not rejecting valid responses');
    recommendations.push('Try a larger base model if the task is genuinely beyond the current model\'s capability');
  } else if (mean < THRESHOLDS.mean.low) {
    recommendations.push('Low scores are expected for base models — verify the grader produces varied scores (check Score Spread in Readiness tab)');
    recommendations.push('Review lowest-scoring records: are the grader reasons correct? If not, adjust grader criteria');
  }

  if (mean > THRESHOLDS.mean.high) {
    recommendations.push('Most records already score well — the model has limited room to improve with RFT');
    recommendations.push('Consider making the evaluator more strict, or adding more challenging examples to the dataset');
  }

  if (std < THRESHOLDS.std.low) {
    recommendations.push('Add more evaluation criteria to help differentiate good responses from great ones');
    recommendations.push('Use a smoother scoring scale with partial credit instead of binary pass/fail');
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
export function analyzeEvalResults(
  evaluationResult: EvaluationResultResponse,
  samplePercentage: number,
  recordTopics?: Record<number, string> // row_index -> topic mapping
): EvalStats {
  const results: FlatEvaluationResult[] = flattenEvaluationResults(evaluationResult.results);

  // Only include results that have actual scores (filter out failed/pending)
  const scoredResults = results.filter((r) => r.score != null);
  const scores = scoredResults.map((r) => r.score!);

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
  const byTopic: Record<string, TopicEvalStats> = {};
  if (recordTopics) {
    const topicScores: Record<string, number[]> = {};

    // Use row_index to look up topics (row_index matches record position in upload order)
    for (const result of scoredResults) {
      const topic = recordTopics[result.row_index] || '__unknown__';
      if (!topicScores[topic]) topicScores[topic] = [];
      topicScores[topic].push(result.score!);
    }

    for (const [topic, topicScoreList] of Object.entries(topicScores)) {
      const topicMean = calculateMean(topicScoreList);
      const topicStd = calculateStd(topicScoreList, topicMean);
      byTopic[topic] = {
        mean: topicMean,
        std: topicStd,
        count: topicScoreList.length,
        status: 'good' as const,  // Default; diagnoseResults() will override based on relative comparison
      };
    }
  }

  // Run diagnosis
  const diagnosis = diagnoseResults(mean, std, percentAboveZero, percentPerfect, byTopic);

  // Compute pre-training readiness gate (mirrors finetune.py readiness-check)
  const readinessGate = computeReadinessGate(scoredResults, byTopic);

  // Extract sample results for manual review (only scored results)
  const sortedScoredResults = [...scoredResults].sort((a, b) => b.score! - a.score!);
  const highest = sortedScoredResults.slice(0, 5).map((r) => ({
    recordId: r.dataset_row_id,
    score: r.score!,
    reason: r.reason,
  }));
  const lowest = sortedScoredResults.slice(-5).reverse().map((r) => ({
    recordId: r.dataset_row_id,
    score: r.score!,
    reason: r.reason,
  }));

  // Find samples around mean
  const aroundMean = sortedScoredResults
    .filter((r) => Math.abs(r.score! - mean) < 0.1)
    .slice(0, 5)
    .map((r) => ({
      recordId: r.dataset_row_id,
      score: r.score!,
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
    readinessGate,
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
export async function calculateAndSaveEvalStats(
  workflowId: string,
  evaluationResult: EvaluationResultResponse,
  samplePercentage: number,
  recordTopics?: Record<number, string>
): Promise<EvalStats> {
  // Calculate stats
  const evalStats = analyzeEvalResults(evaluationResult, samplePercentage, recordTopics);

  // Save to dataset
  await datasetService.updateEvalStats(workflowId, evalStats);

  return evalStats;
}

/**
 * Get verdict description for display
 */
export function getVerdictDescription(verdict: DryRunVerdict): string {
  switch (verdict) {
    case 'GO':
      return 'Ready for training — dataset and evaluator quality are good.';
    case 'WARNING':
      return 'Proceed with caution — review the recommendations below before starting training.';
    case 'NO-GO':
      return 'Not ready for training — there are critical issues to address first.';
  }
}

/**
 * Get quality rating color class for UI
 */
export function getQualityRatingClass(rating: QualityRating): string {
  switch (rating) {
    case 'good':
      return 'text-[rgb(var(--theme-600))] dark:text-[rgb(var(--theme-400))]';
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
      return 'bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-600))] dark:text-[rgb(var(--theme-400))]';
    case 'WARNING':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    case 'NO-GO':
      return 'bg-red-500/15 text-red-600 dark:text-red-400';
  }
}
