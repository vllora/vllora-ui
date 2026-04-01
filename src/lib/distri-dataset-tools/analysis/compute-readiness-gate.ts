/**
 * Pre-Training Readiness Gate
 *
 * Computes 12 readiness criteria from eval results — mirrors the Python
 * `finetune.py readiness-check` command. 4 hard checks gate training,
 * 9 soft checks are warnings (score_concentration is dynamic: hard at >70%).
 *
 * Research basis for threshold choices:
 * - Zero-variance → zero gradient is fundamental to GRPO (DAPO §2.2, arXiv:2503.14476)
 * - Binary rewards work: DeepSeek-R1 (arXiv:2501.12948) and DAPO used 100% binary successfully
 * - Dr. GRPO (arXiv:2503.20783) identifies length bias, proposes removing std normalization
 * - OpenAI RFT: "0% success rate means cannot bootstrap"; recommends smooth scores
 * - "No Prompt Left Behind" (arXiv:2509.21880, ICLR 2026): 30-99% zero-var prompts is normal
 * - "Hard Examples Are All You Need" (arXiv:2508.14094): hard prompts yield 30-40% gains
 *
 * NOTE: Most specific threshold numbers (0.10, 0.50, etc.) are engineering heuristics,
 * not directly from papers. Papers provide the mechanisms; we chose thresholds empirically.
 */

import type { ReadinessCheck, ReadinessGate, ReadinessVerdict, TopicEvalStats } from '@/types/dataset-types';
import type { FlatEvaluationResult } from '@/services/finetune-api';

// =============================================================================
// Thresholds — research-backed, match finetune.py readiness-check defaults
//
// Hard gates focus on GRADER QUALITY, not base model performance.
// GRPO can learn from low base model scores:
//   - DeepSeek R1-Zero: 15.6% → 71% via GRPO alone (arXiv:2501.12948)
//   - OpenAI RFT: "0% success rate means RFT cannot bootstrap"
//   - "Hard Examples Are All You Need" (arXiv:2508.14094): hard prompts
//     yield 30-40% gains vs 3-15% for easy prompts on GSM8K
//   - "No Prompt Left Behind" (ICLR 2026): 30-99% zero-variance prompts
//     per batch is normal during GRPO training
// =============================================================================

// Research-validated thresholds (2026-03-31 review). See research-readiness-gate-thresholds-2026-03-31.md.
const THRESHOLDS = {
  minSampleCount: 50,           // WELL-FOUNDED: OpenAI RFT uses same floor. DeepSeek/DAPO use 5K+.
  minScoreStd: 0.10,           // HEURISTIC: correct direction (zero-variance → zero gradient per DAPO §2.2). Exact value arbitrary.
  maxHighScoreFrac: 0.50,      // HEURISTIC: grader leniency. Overlaps with perfectScoreFrac — kept for backward compat.
  // binary_frac check REMOVED — DeepSeek-R1, DAPO, all major GRPO successes use 100% binary rewards.
  minAvgScore: 0.05,           // WELL-FOUNDED: OpenAI "0% = can't bootstrap". Math: 5% success → 34% non-degenerate groups at K=8.
  maxModeFrac: 0.70,           // RESEARCH-CORRECTED (was 0.50): at 0.70, P(all K=8 same) = 5.8%. Hard fail at 0.85.
  maxZeroScoreFrac: 0.10,      // HEURISTIC: Imperfect Verifiers (arXiv:2510.00915) shows ~20% FN tolerable. 10% is conservative.
  maxPerfectScoreFrac: 0.50,   // WELL-FOUNDED as soft: eval K=1 (gpt-4o-mini) ≠ training K=8 (Qwen-4B).
  maxDeadWeightFrac: 0.75,     // RESEARCH-CORRECTED (was 0.50): "No Prompt Left Behind" (ICLR 2026): 30-99% zero-var is normal.
  minPassRate: 0.05,           // RESEARCH-CORRECTED (was 0.20): DeepSeek-R1 started at 15.6%. Hard examples yield 47% gains.
  passScoreThreshold: 0.70,    // Score threshold for "passing" a record
  minPromptLearnability: 0.30, // HEURISTIC: DAPO dynamic sampling concept. Questionable at K=1 eval.
  maxScoreLengthCorr: 0.30,    // WELL-FOUNDED concept: Dr. GRPO (arXiv:2503.20783) validates length bias is structural.
  maxTopicDominance: 0.40,     // HEURISTIC: general ML practice, not GRPO-specific.
} as const;

// =============================================================================
// Statistics Helpers
// =============================================================================

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: readonly number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;

  const xMean = mean(xs);
  const yMean = mean(ys);

  let cov = 0;
  let xVar = 0;
  let yVar = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    cov += dx * dy;
    xVar += dx * dx;
    yVar += dy * dy;
  }

  const denom = Math.sqrt(xVar * yVar);
  return denom > 0 ? cov / denom : 0;
}

// =============================================================================
// Hard Checks (gate training)
// =============================================================================

function computeHardChecks(scores: readonly number[], promptCount: number): ReadinessCheck[] {
  const n = scores.length;
  const avg = mean(scores);
  const std = stdDev(scores, avg);
  const zeroScoreFrac = n > 0 ? scores.filter(s => s < 0.01).length / n : 0;

  // Hard gates: grader quality + training viability (4 hard checks)
  // Focus on "is the grader working?" not "is the base model good?"
  // Binary rewards work: DeepSeek-R1 and DAPO used 100% binary successfully.
  return [
    {
      id: 'sample_count', label: 'Sample Count', kind: 'hard',
      value: promptCount, threshold: `>= ${THRESHOLDS.minSampleCount}`,
      passed: promptCount >= THRESHOLDS.minSampleCount,
      suggestion: `Too few prompts (${promptCount}) — GRPO needs >= ${THRESHOLDS.minSampleCount} for stable advantage estimates. [OpenAI RFT Guide: "at least 50 training examples"]`,
    },
    {
      id: 'score_std', label: 'Score Variance', kind: 'hard',
      value: round4(std), threshold: `> ${THRESHOLDS.minScoreStd}`,
      passed: std > THRESHOLDS.minScoreStd,
      suggestion: 'Grader not differentiating — zero-variance groups produce zero gradient (GRPO advantage = (r-mean)/std). Add more criteria or partial credit bands. [DAPO §2.2; threshold is a heuristic]',
    },
    {
      id: 'avg_score', label: 'Average Score', kind: 'hard',
      value: round4(avg), threshold: `> ${THRESHOLDS.minAvgScore}`,
      passed: avg > THRESHOLDS.minAvgScore,
      suggestion: 'Average score near zero — the base model produces no useful responses. GRPO needs at least some nonzero rewards. At 5% success, ~34% of K=8 groups have variance. [OpenAI RFT Guide; DeepSeek-R1 arXiv:2501.12948 started at 15.6%]',
    },
    {
      id: 'zero_score_frac', label: 'Zero-Score Fraction', kind: 'hard',
      value: round4(zeroScoreFrac), threshold: `< ${THRESHOLDS.maxZeroScoreFrac}`,
      passed: zeroScoreFrac < THRESHOLDS.maxZeroScoreFrac,
      suggestion: `${(zeroScoreFrac * 100).toFixed(0)}% of scores are exactly 0.0 — this usually means the grader can't parse the model's response format (not wrong answers). Fix the grader to use LLM extraction fallback. [xFinder ICLR 2025 arXiv:2405.11874: regex extraction only 74% accurate; Imperfect Verifiers arXiv:2510.00915: up to ~20% FN tolerable]`,
    },
  ];
}

function computeModeFraction(scores: readonly number[]): { modeFrac: number; modeValue: number } {
  if (scores.length === 0) return { modeFrac: 0, modeValue: 0 };
  const counts = new Map<number, number>();
  for (const s of scores) {
    const rounded = Math.round(s * 100) / 100;
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
  }
  let maxCount = 0;
  let maxValue = 0;
  for (const [value, count] of counts) {
    if (count > maxCount) { maxCount = count; maxValue = value; }
  }
  return { modeFrac: maxCount / scores.length, modeValue: maxValue };
}

function computeModelPerformanceChecks(scores: readonly number[]): ReadinessCheck[] {
  const n = scores.length;
  const deadWeightFrac = n > 0 ? scores.filter(s => s < 0.1).length / n : 0;
  const passRate = n > 0 ? scores.filter(s => s >= THRESHOLDS.passScoreThreshold).length / n : 0;

  // Soft checks: model performance signals
  // Low base model scores are EXPECTED — "Hard Examples Are All You Need" (arXiv:2508.14094)
  // shows hard prompts yield 47% gains vs 3-15% for easy prompts.
  return [
    {
      id: 'dead_weight_frac', label: 'Dead-Weight Fraction', kind: 'soft',
      value: round4(deadWeightFrac), threshold: `< ${THRESHOLDS.maxDeadWeightFrac}`,
      passed: deadWeightFrac < THRESHOLDS.maxDeadWeightFrac,
      suggestion: 'Many eval-time dead-weight records (score<0.1). Note: eval dead-weight ≠ training dead-weight — hard prompts may become learnable as model improves. 30-99% zero-var per batch is normal during GRPO. ["No Prompt Left Behind" ICLR 2026, arXiv:2509.21880]',
    },
    {
      id: 'pass_rate', label: 'Pass Rate', kind: 'soft',
      value: round4(passRate), threshold: `> ${THRESHOLDS.minPassRate}`,
      passed: passRate > THRESHOLDS.minPassRate,
      suggestion: 'Very low pass rate — but hard prompts are most valuable for GRPO (47% gains vs 3-15% for easy). DeepSeek-R1 started at 15.6%. With K=8, pass@8 >> pass@1. [arXiv:2508.14094; arXiv:2501.12948]',
    },
  ];
}

// =============================================================================
// Soft Checks (warnings)
// =============================================================================

function computeSoftChecks(
  scores: readonly number[],
  results: readonly FlatEvaluationResult[],
  byTopic: Record<string, TopicEvalStats>,
): ReadinessCheck[] {
  return [
    // Grader quality signals (demoted from hard — binary rewards work per DeepSeek-R1, DAPO)
    ...computeGraderQualitySoftChecks(scores),
    // Model performance signals (soft — low base model scores are expected)
    ...computeModelPerformanceChecks(scores),
    // Prompt learnability — per-prompt score variance (DAPO insight)
    computePromptLearnability(results),
    // Score-length correlation — reward hacking risk (Dr. GRPO)
    computeScoreLengthCorrelation(results),
    // Topic balance — no single topic should dominate
    computeTopicBalance(byTopic),
  ];
}

function computeGraderQualitySoftChecks(scores: readonly number[]): ReadinessCheck[] {
  const n = scores.length;
  const highFrac = n > 0 ? scores.filter(s => s > 0.9).length / n : 0;
  const perfectFrac = n > 0 ? scores.filter(s => s >= 0.99).length / n : 0;
  const { modeFrac, modeValue } = computeModeFraction(scores);

  return [
    {
      // Hard fail at >85%: at K=8, P(all same) = 0.85^8 = 27% — significant degenerate fraction.
      // Soft warn at 70-85%: 0.70^8 = 5.8% degenerate — training still works.
      // Research-corrected 2026-03-31: previous hard threshold of 0.70 was too tight.
      id: 'score_concentration', label: 'Score Diversity',
      kind: modeFrac > 0.85 ? 'hard' : 'soft',
      value: round4(modeFrac), threshold: `< ${THRESHOLDS.maxModeFrac}`,
      passed: modeFrac < THRESHOLDS.maxModeFrac,
      suggestion: `${(modeFrac * 100).toFixed(0)}% of scores are exactly ${modeValue.toFixed(2)} — within-group variance will be small → weak gradients. Redesign grader with multi-point rubric (0-7 scale). [DAPO arXiv:2503.14476; RGR-GRPO arXiv:2511.12344]`,
    },
    {
      // Soft: eval uses a stronger model (gpt-4o-mini) at K=1, training uses a weaker
      // base model at K=8 — so high eval scores don't necessarily mean training will
      // have zero variance. Run difficulty-probe for a precise K=8 prediction.
      id: 'perfect_score_frac', label: 'Perfect Score Fraction', kind: 'soft',
      value: round4(perfectFrac), threshold: `< ${THRESHOLDS.maxPerfectScoreFrac}`,
      passed: perfectFrac < THRESHOLDS.maxPerfectScoreFrac,
      suggestion: `${(perfectFrac * 100).toFixed(0)}% of eval scores are at the maximum (≥0.99) — grader may be too lenient. Eval uses a strong model at K=1; training uses a weaker model at K=8, so scores will be lower. Run difficulty-probe for a precise prediction. Consider adding more discriminating criteria. [DAPO arXiv:2503.14476]`,
    },
    {
      id: 'high_score_frac', label: 'High Score Fraction', kind: 'soft',
      value: round4(highFrac), threshold: `< ${THRESHOLDS.maxHighScoreFrac}`,
      passed: highFrac < THRESHOLDS.maxHighScoreFrac,
      suggestion: 'Grader may be too lenient — if most completions score near-identical, within-group variance is small → weak gradients. [Heuristic; OpenAI recommends "smooth scores"]',
    },
    // binary_frac check REMOVED (2026-03-31 research review):
    // DeepSeek-R1, DAPO, and all major GRPO successes use 100% binary rewards.
    // Warning against binary contradicts the literature.
  ];
}

function computePromptLearnability(results: readonly FlatEvaluationResult[]): ReadinessCheck {
  const byPrompt = new Map<number, number[]>();
  for (const r of results) {
    if (r.score == null) continue;
    const existing = byPrompt.get(r.row_index) ?? [];
    existing.push(r.score);
    byPrompt.set(r.row_index, existing);
  }

  const multiCandidatePrompts = [...byPrompt.values()].filter(scores => scores.length > 1);
  if (multiCandidatePrompts.length === 0) {
    return {
      id: 'prompt_learnability', label: 'Prompt Learnability', kind: 'soft',
      value: 1, threshold: `> ${THRESHOLDS.minPromptLearnability}`,
      passed: true, skipped: true,
      suggestion: 'Single-candidate evaluation — cannot measure per-prompt variance.',
    };
  }

  const withVariance = multiCandidatePrompts.filter(scores => {
    const avg = mean(scores);
    return stdDev(scores, avg) > 0.01;
  }).length;
  const learnability = withVariance / multiCandidatePrompts.length;

  return {
    id: 'prompt_learnability', label: 'Prompt Learnability', kind: 'soft',
    value: round4(learnability), threshold: `> ${THRESHOLDS.minPromptLearnability}`,
    passed: learnability > THRESHOLDS.minPromptLearnability,
    suggestion: `Only ${withVariance}/${multiCandidatePrompts.length} prompts have score variance — zero-variance prompts waste GRPO compute.`,
  };
}

function computeScoreLengthCorrelation(results: readonly FlatEvaluationResult[]): ReadinessCheck {
  const pairs = results
    .filter(r => r.score != null && r.rollout_content && r.rollout_content.length > 0)
    .map(r => ({ score: r.score!, length: r.rollout_content!.length }));

  if (pairs.length < 10) {
    return {
      id: 'score_length_corr', label: 'Score-Length Correlation', kind: 'soft',
      value: 0, threshold: `< ${THRESHOLDS.maxScoreLengthCorr}`,
      passed: true, skipped: true,
      suggestion: 'Not enough data to compute score-length correlation.',
    };
  }

  const corr = pearsonCorrelation(
    pairs.map(p => p.score),
    pairs.map(p => p.length),
  );
  const absCorr = Math.abs(corr);
  const direction = corr > 0 ? 'rewarding' : 'punishing';

  return {
    id: 'score_length_corr', label: 'Score-Length Correlation', kind: 'soft',
    value: round4(absCorr), threshold: `< ${THRESHOLDS.maxScoreLengthCorr}`,
    passed: absCorr < THRESHOLDS.maxScoreLengthCorr,
    suggestion: `Grader may be ${direction} longer responses (r=${corr.toFixed(3)}) — rewrite to judge content, not length.`,
  };
}

function computeTopicBalance(byTopic: Record<string, TopicEvalStats>): ReadinessCheck {
  const entries = Object.entries(byTopic);
  if (entries.length <= 1) {
    return {
      id: 'topic_balance', label: 'Topic Balance', kind: 'soft',
      value: entries.length === 1 ? 1 : 0, threshold: `< ${THRESHOLDS.maxTopicDominance}`,
      passed: true, skipped: true,
      suggestion: entries.length === 0 ? 'No topic labels available.' : 'Only one topic — balance check not applicable.',
    };
  }

  const totalCount = entries.reduce((s, [, t]) => s + t.count, 0);
  const [maxTopic, maxStats] = entries.reduce((a, b) => b[1].count > a[1].count ? b : a);
  const dominance = totalCount > 0 ? maxStats.count / totalCount : 0;

  return {
    id: 'topic_balance', label: 'Topic Balance', kind: 'soft',
    value: round4(dominance), threshold: `< ${THRESHOLDS.maxTopicDominance}`,
    passed: dominance < THRESHOLDS.maxTopicDominance,
    suggestion: `Topic "${maxTopic}" dominates at ${(dominance * 100).toFixed(0)}% — add data for under-represented topics.`,
  };
}

// =============================================================================
// Main
// =============================================================================

export function computeReadinessGate(
  scoredResults: readonly FlatEvaluationResult[],
  byTopic: Record<string, TopicEvalStats>,
): ReadinessGate {
  const scores = scoredResults.filter(r => r.score != null).map(r => r.score!);
  const promptCount = new Set(scoredResults.map(r => r.row_index)).size;

  const hardChecks = computeHardChecks(scores, promptCount);
  const softChecks = computeSoftChecks(scores, scoredResults, byTopic);
  const checks = [...hardChecks, ...softChecks];

  const hardPassed = hardChecks.filter(c => c.passed).length;
  const softPassed = softChecks.filter(c => c.passed).length;

  const hardFailed = hardChecks.filter(c => !c.passed && !c.skipped);
  const softFailed = softChecks.filter(c => !c.passed && !c.skipped);

  // Marginal hard failure: if exactly 1 hard check fails and it's within 80%
  // of the threshold, treat as WARN instead of FAIL (matches finetune.py logic).
  const isMarginalHardFailure = hardFailed.length === 1 && hardFailed.every(c => {
    // Check if the failed value is within 80% of the threshold
    const thresholdMatch = c.threshold.match(/[><=]+\s*([\d.]+)/);
    if (!thresholdMatch) return false;
    const thresholdVal = parseFloat(thresholdMatch[1]);
    if (c.threshold.startsWith('>')) {
      return c.value > thresholdVal * 0.8; // within 80% of minimum threshold
    }
    return false; // for < thresholds, no marginal logic
  });

  let verdict: ReadinessVerdict;
  if (hardFailed.length === 0 && softFailed.length === 0) {
    verdict = 'PASS';
  } else if (hardFailed.length === 0) {
    verdict = 'WARN';
  } else if (isMarginalHardFailure) {
    verdict = 'WARN';
  } else {
    verdict = 'FAIL';
  }

  return {
    verdict,
    checks,
    hardPassed,
    hardTotal: hardChecks.length,
    softPassed,
    softTotal: softChecks.length,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
