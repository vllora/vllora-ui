/**
 * Training Metrics Insights
 *
 * Actionable insights for GRPO training metrics, score trends, and score distributions.
 * All thresholds are paper-backed — see references below.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOURCES & REFERENCES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Papers:
 * - DeepSeekMath (Shao et al., 2024): LR=1e-6, β=0.04, G=64
 *   https://arxiv.org/abs/2402.03300
 * - DAPO (Yu et al., 2025): ε_low=0.2, ε_high=0.28, β=0, overlong filter
 *   https://arxiv.org/abs/2503.14476
 * - Dr. GRPO (Liu et al., 2025): G=8, frac_reward_zero_std impact, std/length bias
 *   https://arxiv.org/abs/2503.20783
 * - GTPO (Zhang et al., 2025): entropy monitoring, gradient control
 *   https://arxiv.org/abs/2508.03772
 *
 * Implementation Docs:
 * - TRL GRPOTrainer: β=0 default, metric definitions, logged metrics
 *   https://huggingface.co/docs/trl/main/en/grpo_trainer
 * - Unsloth GRPO: NaN grad_norm from truncation, chat template bugs
 *   https://docs.unsloth.ai/basics/reward-model-and-rlhf-grpo-support
 *
 * Analysis:
 * - GRPO Illustrated (Wolfe, 2025): clipping mechanics, advantage normalization
 *   https://cameronrwolfe.substack.com/p/grpo
 * - Reward Hacking in GRPO (Mukherjee, 2025): detection, mitigation
 *   https://ishanjmukherjee.github.io/reward-hacking-grpo
 *
 * Internal:
 * - finetune-skill/reference/training-metrics-guide.md — consolidated thresholds
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THRESHOLD SUMMARY (paper-backed)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Metric                 | Healthy       | Warning       | Critical       | Source              |
 * |------------------------|---------------|---------------|----------------|---------------------|
 * | reward (0-1 grader)    | 0.7-1.0       | 0.4-0.7       | <0.4           | our guide           |
 * | reward_std             | 0.05-0.3      | <0.05         | <0.01          | Dr. GRPO, TRL       |
 * | frac_reward_zero_std   | <0.2          | >0.5          | >0.8           | Dr. GRPO, our guide |
 * | loss (GRPO)            | 0.01-0.1      | <0.001, >1.0  | stuck 0, NaN   | DeepSeekMath, TRL   |
 * | kl                     | <1.0          | 1.0-5.0       | >5.0 (>10 bad) | DeepSeekMath        |
 * | grad_norm              | 0.5-2.0       | >100 (spikes) | NaN            | DeepSeekMath        |
 * | clip_ratio/region_mean | 0.1-0.3       | >0.5, <0.01   | —              | DAPO                |
 * | clipped_ratio          | <0.1          | 0.1-0.5       | >0.5           | DAPO, TRL           |
 * | score (eval)           | ≥0.8 (target) | 0.6-0.8       | <0.6           | our guide           |
 */

// =============================================================================
// Types
// =============================================================================

export interface MetricInsight {
  readonly level: "ok" | "warn" | "critical";
  readonly text: string;
}

type MetricTab = "reward" | "stability" | "completions" | "throughput";

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

// =============================================================================
// Training Metrics Insights (Loss, Reward, Completions, Throughput tabs)
// =============================================================================

export function getMetricsInsights(latest: Record<string, unknown> | null, tab: MetricTab): readonly MetricInsight[] {
  if (!latest) return [];
  const insights: MetricInsight[] = [];

  if (tab === "reward") {
    const reward = num(latest.reward);
    const rewardStd = num(latest.reward_std);
    const fracZero = num(latest.frac_reward_zero_std);

    // Reward: absolute value depends on grader scale. Thresholds below assume [0,1] grader.
    // Ref: DeepSeekMath §3.2 — "steady upward trend"; our guide: "rapid explosion = reward hacking"
    if (reward != null) {
      if (reward >= 0.9) insights.push({ level: "ok", text: "Reward is high — model generates strong responses." });
      else if (reward >= 0.7) insights.push({ level: "ok", text: "Reward is moderate — learning is productive." });
      else if (reward >= 0.4) insights.push({ level: "warn", text: "Reward is low — model is still learning. Check if the grader provides enough gradient (avoid binary 0/1 scores)." });
      else insights.push({ level: "critical", text: "Reward is very low — the model may not be learning. Verify the grader works correctly and data quality." });
    }
    // reward_std: GRPO needs within-group diversity. Healthy 0.05-0.3 for [0,1] graders.
    // Ref: Dr. GRPO (arXiv:2503.20783) — std normalization bias; TRL docs: "little diversity for that prompt"
    if (rewardStd != null && rewardStd < 0.01) {
      insights.push({ level: "critical", text: "Reward std is near zero — all completions score identically. GRPO learns by comparing better vs worse completions within each group. Without variance, there is no learning signal. Increase G or adjust grader sensitivity." });
    } else if (rewardStd != null && rewardStd < 0.05) {
      insights.push({ level: "warn", text: `Reward std is low (${rewardStd.toFixed(3)}) — limited diversity between completions. Healthy range for [0,1] graders is 0.05-0.3.` });
    }
    // frac_reward_zero_std: Healthy <0.2, warn >0.5, critical >0.8
    // Ref: Dr. GRPO (arXiv:2503.20783) G=8; TRL: "fraction of samples with reward std of zero"
    // Ref: our guide — "Above 0.5 → half the batch provides no gradient. Above 0.8 → training is stalled."
    if (fracZero != null) {
      if (fracZero > 0.8) insights.push({ level: "critical", text: `${(fracZero * 100).toFixed(0)}% of prompts have zero reward variance — training gets no useful gradient from most examples. Increase G (completions per prompt) or adjust grader.` });
      else if (fracZero > 0.5) insights.push({ level: "warn", text: `${(fracZero * 100).toFixed(0)}% of prompts have zero reward variance — over half the batch provides no learning signal.` });
    }
  }

  if (tab === "stability") {
    const loss = num(latest.loss);
    const kl = num(latest.kl);
    const gradNorm = num(latest.grad_norm);

    // Loss: GRPO loss ≠ SFT loss. Starts near 0, rises slightly as policy diverges.
    // Ref: DeepSeekMath — clipped surrogate objective; our guide — "0.01-0.1 healthy"
    if (loss != null) {
      if (loss < 0.001) insights.push({ level: "warn", text: "Loss is near zero — likely zero advantages (all completions scored identically). GRPO cannot learn without reward variance. Check grader sensitivity." });
      else if (loss < 0.1) insights.push({ level: "ok", text: "Loss is in the healthy range (0.01-0.1) — model is making controlled policy updates." });
      else if (loss < 1.0) insights.push({ level: "ok", text: "Loss is moderate — training is actively updating the policy. GRPO loss rises slightly as the policy diverges from generation distribution." });
      else insights.push({ level: "warn", text: "Loss is high — training may be unstable. Consider reducing learning rate." });
    }
    // KL: Healthy <1.0, warning 1.0-5.0, critical >5.0, severe >10.0
    // Ref: DeepSeekMath (β=0.04); DAPO/Dr.GRPO use β=0 (no KL penalty); TRL defaults β=0
    // Ref: our guide — ">5.0 significant drift, >10.0 likely reward hacking or collapse"
    if (kl != null) {
      if (kl > 10) insights.push({ level: "critical", text: `KL divergence is ${kl.toFixed(1)} — the model has diverged significantly from the base model. Risk of reward hacking or mode collapse. Increase KL penalty (beta), reduce learning rate, or inspect outputs for degenerate patterns.` });
      else if (kl > 5) insights.push({ level: "warn", text: `KL divergence is ${kl.toFixed(1)} — significant policy drift from the base model. Monitor output quality closely. Consider increasing beta.` });
      else if (kl > 1) insights.push({ level: "ok", text: `KL divergence is ${kl.toFixed(1)} — moderate policy drift, within acceptable range for active learning.` });
      else insights.push({ level: "ok", text: "KL divergence is low — model stays close to the base model." });
    }
    // Grad norm: Healthy 0.5-2.0 with default clipping of 1.0.
    // Ref: DeepSeekMath; Unsloth — "NaN often from zero-length truncated completions"
    if (gradNorm != null) {
      if (!isFinite(gradNorm) || isNaN(gradNorm)) insights.push({ level: "critical", text: "Gradient norm is NaN — catastrophic numerical failure. Often caused by zero-length completions or all-truncated batches." });
      else if (gradNorm > 100) insights.push({ level: "warn", text: `Gradient norm is ${gradNorm.toFixed(0)} — gradient spike detected. May cause training instability.` });
    }
    // Clip ratio: Healthy 0.1-0.3, high >0.5, near 0 = barely changing
    // Ref: DAPO (arXiv:2503.14476) — ε_low=0.2, ε_high=0.28; TRL: trust region clipping
    const clipRegion = num(latest["clip_ratio/region_mean"]);
    if (clipRegion != null) {
      if (clipRegion > 0.5) insights.push({ level: "warn", text: `Clip ratio is ${(clipRegion * 100).toFixed(0)}% — policy updates are being heavily constrained. Reduce learning rate or increase epsilon.` });
      else if (clipRegion < 0.01) insights.push({ level: "warn", text: "Clip ratio is near zero — policy is barely changing. Learning rate may be too low." });
    }
  }

  if (tab === "completions") {
    const clipped = num(latest["completions/clipped_ratio"]);
    const meanLen = num(latest["completions/mean_length"]);
    const maxLen = num(latest["completions/max_length"]);
    const minLen = num(latest["completions/min_length"]);
    const termLen = num(latest["completions/mean_terminated_length"]);

    // clipped_ratio: Healthy <0.1, warning 0.1-0.5, critical >0.5
    // Ref: DAPO — overlong filtering; TRL: "ratio of truncated completions"
    // Ref: our guide — ">0.5 majority incomplete, at 1.0 training is broken"
    if (clipped != null) {
      if (clipped >= 0.95) insights.push({ level: "critical", text: `${(clipped * 100).toFixed(0)}% of responses are truncated — the model never finishes naturally. Rewards are computed on incomplete outputs, making training noisy. Increase max_output_tokens.` });
      else if (clipped > 0.5) insights.push({ level: "critical", text: `${(clipped * 100).toFixed(0)}% of responses are truncated — majority of completions are incomplete. Training signal is degraded. Increase max_output_tokens.` });
      else if (clipped > 0.1) insights.push({ level: "warn", text: `${(clipped * 100).toFixed(0)}% truncated — some responses hit the token limit. Monitor whether this affects score quality.` });
      else insights.push({ level: "ok", text: "Most responses complete naturally without truncation." });
    }
    // Uniform truncation: min = max = max_output_tokens
    // Ref: our guide — "100% Completion Clipping" failure mode
    if (minLen != null && maxLen != null && minLen === maxLen) {
      insights.push({ level: "critical", text: `All responses are exactly ${maxLen} tokens — uniform truncation. The model cannot learn when to stop. Increase max_output_tokens.` });
    }
    // Terminated length: 0 = no natural endings
    // Ref: TRL — "completions that terminate with EOS"
    if (termLen != null && termLen < 1) {
      insights.push({ level: "critical", text: "No responses end naturally (terminated length is 0). Every completion is being forcibly truncated." });
    } else if (termLen != null && meanLen != null && termLen < meanLen * 0.5) {
      insights.push({ level: "warn", text: "Natural responses are much shorter than truncated ones — two distinct populations of completions." });
    }
    const maxTerm = num(latest["completions/max_terminated_length"]);
    const minTerm = num(latest["completions/min_terminated_length"]);
    if (maxTerm != null && maxLen != null && maxTerm > maxLen * 0.9) {
      insights.push({ level: "warn", text: `Longest natural response is ${maxTerm} tokens — very close to the limit. Consider increasing max_output_tokens.` });
    }
    if (minTerm != null && minTerm < 10 && minTerm > 0) {
      insights.push({ level: "warn", text: `Shortest natural response is only ${minTerm} tokens — some prompts may be getting trivially short answers.` });
    }
  }

  if (tab === "throughput") {
    const tokens = num(latest.num_tokens);
    const batchSize = num(latest.row_indices_count);

    // Ref: TRL — "total number of tokens processed"; our guide — "drops indicate skipped batches"
    if (tokens != null && tokens < 1000) {
      insights.push({ level: "warn", text: "Very low token throughput — batches may be small or completions very short." });
    }
    // Ref: our guide — "should match configured batch size, if low → prompts may be filtered"
    if (batchSize != null && batchSize < 4) {
      insights.push({ level: "warn", text: `Batch size is only ${batchSize} — very few records per step. May cause noisy gradients.` });
    }
    if (insights.length === 0) {
      insights.push({ level: "ok", text: "Throughput metrics are within normal range." });
    }
  }

  return insights;
}

// =============================================================================
// Score Trend Insights (Evaluation scores over epochs)
// =============================================================================

interface EpochSummary {
  readonly avgScore: number;
  readonly stdDev: number;
}

/**
 * Insights for the Score Trend chart (eval scores over epochs).
 * Score zones: target ≥0.8, acceptable 0.6-0.8, critical <0.6.
 * Ref: our guide — "Pass rate < 80%? → Iterate on grader criteria or data quality"
 */
export function getScoreTrendInsights(epochData: readonly EpochSummary[]): readonly MetricInsight[] {
  if (epochData.length === 0) return [];
  const insights: MetricInsight[] = [];
  const latest = epochData[epochData.length - 1];
  const score = latest.avgScore;
  const stdDev = latest.stdDev;

  // Score level assessment — zones match TrainingMetricsChart reference areas
  if (score >= 0.9) {
    insights.push({ level: "ok", text: `Avg score is ${score.toFixed(2)} — excellent. Model is performing very well.` });
  } else if (score >= 0.8) {
    insights.push({ level: "ok", text: `Avg score is ${score.toFixed(2)} — in the target zone (≥0.8). Model quality is good.` });
  } else if (score >= 0.6) {
    insights.push({ level: "warn", text: `Avg score is ${score.toFixed(2)} — acceptable but below target (0.8). More training epochs or grader tuning may help.` });
  } else {
    insights.push({ level: "critical", text: `Avg score is ${score.toFixed(2)} — below acceptable threshold (0.6). Check grader, data quality, or training hyperparameters.` });
  }

  // Improvement trend (need ≥2 epochs)
  if (epochData.length >= 2) {
    const first = epochData[0];
    const delta = score - first.avgScore;
    if (delta > 0.05) {
      insights.push({ level: "ok", text: `Score improved by +${delta.toFixed(3)} across ${epochData.length} evaluations — training is learning effectively.` });
    } else if (delta > -0.02) {
      insights.push({ level: "warn", text: `Score change is flat (${delta >= 0 ? "+" : ""}${delta.toFixed(3)}) — model may have plateaued. Consider adjusting learning rate or adding more diverse data.` });
    } else {
      // Ref: our guide — "Reward Hacking" failure mode: "Reward increases while output quality degrades"
      insights.push({ level: "critical", text: `Score dropped by ${delta.toFixed(3)} — model is getting worse. This may indicate overfitting, reward hacking, or a grader issue.` });
    }
  }

  // Score spread — high σ means inconsistent performance across records
  if (stdDev > 0.3) {
    insights.push({ level: "warn", text: `High score spread (σ=${stdDev.toFixed(3)}) — model performs very inconsistently across records. Some topics may need more training data.` });
  } else if (stdDev > 0.2) {
    insights.push({ level: "warn", text: `Moderate score spread (σ=${stdDev.toFixed(3)}) — some records score much lower than others.` });
  }

  return insights;
}

// =============================================================================
// Score Distribution Insights (per-record histogram)
// =============================================================================

/**
 * Insights for the Score Distribution chart (per-record score histogram).
 * Analyzes failure rate, perfect score concentration, bimodal patterns.
 */
export function getScoreDistributionInsights(scores: readonly number[], mean: number | undefined): readonly MetricInsight[] {
  if (scores.length === 0) return [];
  const insights: MetricInsight[] = [];
  const n = scores.length;

  // Failure rate (scores below 0.6 = "critical" zone)
  const failCount = scores.filter((s) => s < 0.6).length;
  const failRate = failCount / n;
  if (failRate > 0.3) {
    insights.push({ level: "critical", text: `${(failRate * 100).toFixed(0)}% of records score below 0.6 — a large portion of the dataset is underperforming. Review low-scoring topics.` });
  } else if (failRate > 0.1) {
    insights.push({ level: "warn", text: `${(failRate * 100).toFixed(0)}% of records score below 0.6 — some records need attention.` });
  } else if (failRate === 0) {
    insights.push({ level: "ok", text: "All records score above 0.6 — no critical failures." });
  }

  // Perfect score concentration — may indicate lenient grader
  const perfectCount = scores.filter((s) => s >= 0.95).length;
  const perfectRate = perfectCount / n;
  if (perfectRate > 0.8) {
    insights.push({ level: "warn", text: `${(perfectRate * 100).toFixed(0)}% of records score ≥0.95 — grader may be too lenient. Consider raising the bar to push quality higher.` });
  } else if (perfectRate > 0.5) {
    insights.push({ level: "ok", text: `${(perfectRate * 100).toFixed(0)}% of records score ≥0.95 — strong performance on most of the dataset.` });
  }

  // Bimodal distribution check — suggests topic-specific failures
  const lowCount = scores.filter((s) => s < 0.4).length;
  const highCount = scores.filter((s) => s > 0.7).length;
  const midCount = n - lowCount - highCount;
  if (lowCount > n * 0.15 && highCount > n * 0.5 && midCount < n * 0.15) {
    insights.push({ level: "warn", text: "Score distribution appears bimodal — model performs well on some records but fails on others. Check if specific topics or question types are struggling." });
  }

  // Mean summary
  if (mean != null) {
    if (mean >= 0.8) {
      insights.push({ level: "ok", text: `Mean score is ${mean.toFixed(2)} — dataset is performing well overall.` });
    } else if (mean >= 0.6) {
      insights.push({ level: "warn", text: `Mean score is ${mean.toFixed(2)} — room for improvement. Focus on the lowest-scoring records.` });
    }
  }

  return insights;
}
