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
 * | kl                     | informational | —             | NaN/Inf only   | DAPO (β=0 default)  |
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

    // =========================================================================
    // Loss, KL, and grad_norm scale context:
    //
    // Our backend (Unsloth + TRL GRPOTrainer) may report these on different scales
    // depending on loss_type and whether unsloth_train() is used:
    //   - TRL DAPO default: loss 0.0-0.002, KL 0.0004-5.0, grad_norm 0.33-1.66
    //   - Non-DAPO or accumulation bug: values can be 1000x+ higher
    // Ref: open-r1#239 (actual TRL GRPO logs), Unsloth gradient accumulation blog,
    //       TRL#2995 (normalization), AMD Unsloth tutorial (actual training output)
    //
    // We flag: NaN/Inf, loss stuck at 0, and provide context for interpretation.
    // Reward metrics (reward, reward_std, frac_reward_zero_std) are confirmed on
    // standard TRL scale (0-1) and use absolute thresholds.
    // =========================================================================

    // Loss: GRPO loss starts at 0.0 (expected — ratio=1.0, zero-mean advantages).
    // With DAPO loss_type, healthy range is 0.0001-0.002 after hundreds of steps.
    // Ref: open-r1#239 — "loss starts at 0, rises to 0.0001-0.0019"
    // Ref: Unsloth — "loss=0 + grad_norm=NaN = missing LoRA adapters or GA>1 bug"
    if (loss != null) {
      if (!isFinite(loss) || isNaN(loss)) {
        insights.push({ level: "critical", text: "Loss is NaN/Inf — catastrophic numerical failure. Check for zero-length completions or degenerate batches. (Unsloth: verify LoRA adapters applied, try gradient_accumulation_steps=1)" });
      } else if (loss === 0 && gradNorm != null && (!isFinite(gradNorm) || isNaN(gradNorm))) {
        // Unsloth-specific: loss=0 + grad_norm=NaN = known bug
        // Ref: Unsloth issues #3006, #2824
        insights.push({ level: "critical", text: "Loss is 0 with NaN gradients — known Unsloth issue. Verify LoRA adapters are applied (FastLanguageModel.get_peft_model) and try gradient_accumulation_steps=1." });
      }
    }

    // KL: With β=0 (TRL/DAPO default), KL is purely informational — not a training constraint.
    // TRL doesn't even log KL when β=0. If reported, values are informational only.
    // Healthy TRL range: 0.0004 → 0.01-0.04, spike to ~5.0.
    // Ref: DAPO (arXiv:2503.14476) — removes KL entirely (β=0)
    // Ref: open-r1#239 — KL 0.0004 initially, gradual rise, can spike to 5.33
    if (kl != null) {
      if (!isFinite(kl) || isNaN(kl)) {
        insights.push({ level: "critical", text: "KL divergence is NaN — numerical failure. If using Unsloth with mask_truncated_completions=true, this can happen when all completions are truncated." });
      }
      // KL absolute value depends on β setting and backend aggregation.
      // With β=0: informational only, no threshold needed.
    }

    // Grad norm: TRL reports pre-clipping L2 norm (default max_grad_norm=1.0).
    // Healthy TRL range: 0.33-1.66. NaN = catastrophic (Unsloth: zero-length completions).
    // Ref: AMD Unsloth tutorial — grad_norm in 0.3-1.7 range
    // Ref: Unsloth docs — "NaN often from zero-length truncated completions"
    if (gradNorm != null) {
      if (!isFinite(gradNorm) || isNaN(gradNorm)) {
        insights.push({ level: "critical", text: "Gradient norm is NaN — catastrophic numerical failure. Often caused by zero-length completions, missing LoRA adapters, or gradient_accumulation_steps > 1 bug in Unsloth." });
      }
    }

    // Clip ratio: 0-1 range (fraction of clipped tokens), scale-independent.
    // Ref: DAPO (arXiv:2503.14476) — ε_low=0.2, ε_high=0.28; TRL: trust region clipping
    // clip_ratio=0 is normal when num_iterations=1 (generation policy = current policy)
    const clipRegion = num(latest["clip_ratio/region_mean"]);
    if (clipRegion != null) {
      if (clipRegion > 0.5) insights.push({ level: "warn", text: `Clip ratio is ${(clipRegion * 100).toFixed(0)}% — policy updates are heavily constrained by the trust region. This limits learning speed.` });
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
 *
 * GRPO-aware: There is NO universal score target. What matters is:
 * 1. The TREND (is the score improving across epochs?)
 * 2. Whether the grader differentiates quality (score spread > 0)
 *
 * Absolute scores are task/grader-dependent. DeepSeek-R1-Zero went from 15.6% to 71%
 * on AIME — a huge success well below 0.8. (arXiv:2501.12948)
 *
 * Eval K=1 scores are a lower bound on training K=G performance. A 6.5% pass@1
 * ≈ 41% pass@8. (arXiv:2508.14094)
 */
export function getScoreTrendInsights(epochData: readonly EpochSummary[]): readonly MetricInsight[] {
  if (epochData.length === 0) return [];
  const insights: MetricInsight[] = [];
  const latest = epochData[epochData.length - 1];
  const score = latest.avgScore;
  const stdDev = latest.stdDev;
  const isEarlyTraining = epochData.length <= 2;

  // Score level — focus on extreme cases, not arbitrary thresholds
  if (score >= 0.95) {
    // Near-perfect scores may indicate a lenient grader — GRPO needs differentiation
    // Ref: DAPO (arXiv:2503.14476) — if all K completions score high, advantage ≈ 0
    insights.push({ level: "warn", text: `Avg score is ${score.toFixed(2)} — very high. Verify the grader is differentiating quality; if all completions score similarly, GRPO gets no gradient signal.` });
  } else if (score < 0.05) {
    // Near-zero means grader or data is broken — no training signal possible
    insights.push({ level: "critical", text: `Avg score is ${score.toFixed(2)} — near zero. The grader may be too strict or misaligned with the task. Check grader criteria and sample outputs.` });
  } else if (isEarlyTraining) {
    // Early in training — score is just a starting point, trend matters more
    insights.push({ level: "ok", text: `Avg score is ${score.toFixed(2)} at eval ${epochData.length}. Score will evolve as training progresses — watch the trend across epochs.` });
  } else {
    insights.push({ level: "ok", text: `Avg score is ${score.toFixed(2)} at eval ${epochData.length}.` });
  }

  // Improvement trend (need ≥2 epochs) — this is the most important signal in GRPO
  if (epochData.length >= 2) {
    const first = epochData[0];
    const delta = score - first.avgScore;
    if (delta > 0.05) {
      insights.push({ level: "ok", text: `Score improved by +${delta.toFixed(3)} across ${epochData.length} evals — model is learning. GRPO is working.` });
    } else if (delta > -0.02) {
      insights.push({ level: "warn", text: `Score change is flat (${delta >= 0 ? "+" : ""}${delta.toFixed(3)}) across ${epochData.length} evals — model may have plateaued. Consider adjusting learning rate or increasing data diversity.` });
    } else {
      // Ref: "Tricks or Traps" (arXiv:2508.08221) — reward hacking failure mode
      insights.push({ level: "critical", text: `Score dropped by ${Math.abs(delta).toFixed(3)} — model is regressing. Possible causes: reward hacking, overfitting, or learning rate too high.` });
    }
  }

  // Score spread — in GRPO, some spread is GOOD (means the grader differentiates)
  // Zero spread is bad (no gradient signal). Very high spread may indicate inconsistency.
  if (stdDev < 0.05 && score > 0.05 && score < 0.95) {
    // Ref: "No Prompt Left Behind" (arXiv:2509.21880) — zero-variance = no gradient
    insights.push({ level: "warn", text: `Very low score spread (σ=${stdDev.toFixed(3)}) — grader may not differentiate between completions. GRPO needs score variance to learn.` });
  } else if (stdDev > 0.3) {
    insights.push({ level: "warn", text: `High score spread (σ=${stdDev.toFixed(3)}) — performance varies widely across records. Some topics may need more data or grader refinement.` });
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
