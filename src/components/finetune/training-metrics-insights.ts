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
 * - Dr. GRPO (Liu et al., 2025): length bias from 1/|o_i| normalization (§3.1)
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
 * | reward_std             | 0.05-0.3      | <0.05         | <0.01          | empirical, TRL      |
 * | frac_reward_zero_std   | <0.2          | >0.5+flat_rwd | >0.8+flat_rwd  | arXiv:2509.21880    |
 * | loss (GRPO)            | TREND-BASED   | spike >5x min | NaN/0+NaN_grad | see note below      |
 * | kl                     | TREND-BASED   | grew >10x     | NaN/Inf        | DAPO (β=0 default)  |
 * | grad_norm              | TREND-BASED   | spike >10x avg| NaN            | see note below      |
 * | clip_ratio/region_mean | 0.1-0.3       | >0.5, <0.01   | —              | DAPO                |
 * | clipped_ratio          | <0.1          | 0.1-0.5       | >0.5           | DAPO, TRL           |
 * | length↑ + reward flat  | —             | length +30%   | length +100%   | Dr. GRPO            |
 * | score (eval)           | ≥0.8 (target) | 0.6-0.8       | <0.6           | our guide           |
 *
 * NOTE on loss/KL/grad_norm: Absolute scale varies by backend (TRL reports per-token
 * mean ~0.001; Unsloth/custom may report sum-over-batch ~1e8). We use TREND detection
 * (is it spiking relative to its own history?) instead of absolute thresholds.
 * Only NaN/Inf is an absolute check. Reward/reward_std/frac_zero_std/clipped_ratio
 * are [0,1] scale-independent and use absolute thresholds.
 */

// =============================================================================
// Types
// =============================================================================

export interface MetricInsight {
  readonly level: "ok" | "warn" | "critical";
  readonly text: string;
}

type MetricTab = "reward" | "loss" | "kl" | "lr" | "gradNorm" | "clipRatio" | "completions" | "tokens" | "batchSize" | "avgCompletion";

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/**
 * Compute mean of a number array. Returns null if empty.
 */
function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Detect length-reward divergence (Dr. GRPO length bias).
 *
 * Compares first half vs second half of training:
 * - If mean_length increased >30% AND reward is flat/declining → warning
 * - If mean_length increased >100% AND reward is flat/declining → critical
 *
 * Ref: Dr. GRPO (arXiv:2503.20783, §3.1): GRPO's 1/|o_i| normalization causes
 * "incorrect responses to grow progressively longer."
 * Ref: MO-GRPO (arXiv:2509.22047): "vacuous elongation can inflate the gradient norm"
 *
 * Requires ≥10 steps to produce meaningful results.
 */
function detectLengthRewardDivergence(history: readonly Record<string, unknown>[]): MetricInsight | null {
  if (history.length < 10) return null;

  const midpoint = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, midpoint);
  const secondHalf = history.slice(midpoint);

  const firstLengths = firstHalf.map((m) => num(m["completions/mean_length"])).filter((v): v is number => v != null);
  const secondLengths = secondHalf.map((m) => num(m["completions/mean_length"])).filter((v): v is number => v != null);
  const firstRewards = firstHalf.map((m) => num(m.reward)).filter((v): v is number => v != null);
  const secondRewards = secondHalf.map((m) => num(m.reward)).filter((v): v is number => v != null);

  const meanLenFirst = mean(firstLengths);
  const meanLenSecond = mean(secondLengths);
  const meanRewardFirst = mean(firstRewards);
  const meanRewardSecond = mean(secondRewards);

  if (meanLenFirst == null || meanLenSecond == null || meanRewardFirst == null || meanRewardSecond == null) return null;
  if (meanLenFirst < 1) return null; // avoid division by zero

  const lengthGrowth = (meanLenSecond - meanLenFirst) / meanLenFirst;
  const rewardDelta = meanRewardSecond - meanRewardFirst;
  const isRewardFlat = rewardDelta < 0.02;

  if (lengthGrowth > 1.0 && isRewardFlat) {
    return {
      level: "critical",
      text: `Response length doubled (+${(lengthGrowth * 100).toFixed(0)}%) while reward is ${rewardDelta < 0 ? "declining" : "flat"} — likely Dr. GRPO length bias. The model is padding responses without improving quality. Add a length penalty to your grader.`,
    };
  }

  if (lengthGrowth > 0.3 && isRewardFlat) {
    return {
      level: "warn",
      text: `Response length grew +${(lengthGrowth * 100).toFixed(0)}% while reward is ${rewardDelta < 0 ? "declining" : "flat"} — possible length exploitation (Dr. GRPO §3.1). Monitor whether outputs are getting verbose without improving quality.`,
    };
  }

  return null;
}

// =============================================================================
// Training Metrics Insights (Loss, Reward, Completions, Throughput tabs)
// =============================================================================

/**
 * Generate insights for the active metrics tab.
 *
 * @param latest  - The most recent metrics snapshot (used for absolute threshold checks)
 * @param tab     - Which tab is active
 * @param history - Full metrics history (used for cross-metric trend checks like length-reward divergence).
 *                  Optional for backwards compatibility — trend checks are skipped when omitted.
 */
export function getMetricsInsights(
  latest: Record<string, unknown> | null,
  tab: MetricTab,
  history?: readonly Record<string, unknown>[],
  maxOutputTokens?: number | null,
): readonly MetricInsight[] {
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
    // Ref: Empirical heuristic for [0,1] grader scale; TRL docs: "little diversity for that prompt"
    if (rewardStd != null && rewardStd < 0.01) {
      insights.push({ level: "critical", text: "Reward std is near zero — all completions score identically. GRPO learns by comparing better vs worse completions within each group. Without variance, there is no learning signal. Increase G or adjust grader sensitivity." });
    } else if (rewardStd != null && rewardStd < 0.05) {
      insights.push({ level: "warn", text: `Reward std is low (${rewardStd.toFixed(3)}) — limited diversity between completions. Healthy range for [0,1] graders is 0.05-0.3.` });
    }
    // frac_reward_zero_std: warn >0.5 + flat reward, critical >0.8 + flat reward
    // Ref: "No Prompt Left Behind" (arXiv:2509.21880) — 30-99% zero-std is normal in GRPO
    // These thresholds only meaningful when reward is also stagnant
    if (fracZero != null) {
      if (fracZero > 0.8) insights.push({ level: "critical", text: `${(fracZero * 100).toFixed(0)}% of prompts have zero reward variance — training gets no useful gradient from most examples. Increase G (completions per prompt) or adjust grader.` });
      else if (fracZero > 0.5) insights.push({ level: "warn", text: `${(fracZero * 100).toFixed(0)}% of prompts have zero reward variance — common in GRPO with G=8 (30-99% is normal per "No Prompt Left Behind", ICLR 2026). Only a concern if reward is also stagnant.` });
    }
  }

  if (tab === "loss") {
    const loss = num(latest.loss);
    const gradNorm = num(latest.grad_norm);

    if (loss != null) {
      if (!isFinite(loss) || isNaN(loss)) {
        insights.push({ level: "critical", text: "Loss is NaN/Inf — catastrophic numerical failure. Check for zero-length completions or degenerate batches. (Unsloth: verify LoRA adapters applied, try gradient_accumulation_steps=1)" });
      } else if (loss === 0 && gradNorm != null && (!isFinite(gradNorm) || isNaN(gradNorm))) {
        insights.push({ level: "critical", text: "Loss is 0 with NaN gradients — known Unsloth issue. Verify LoRA adapters are applied (FastLanguageModel.get_peft_model) and try gradient_accumulation_steps=1." });
      }
      // Trend: if loss increased >5x from its minimum, training may be destabilizing
      if (history && history.length >= 10) {
        const allLosses = history.map((m) => num(m.loss)).filter((v): v is number => v != null && v > 0);
        if (allLosses.length >= 10) {
          const minLoss = Math.min(...allLosses.slice(Math.floor(allLosses.length * 0.3)));
          const recentLoss = allLosses[allLosses.length - 1];
          if (minLoss > 0 && recentLoss > minLoss * 5) {
            insights.push({ level: "warn", text: `Loss spiked ${(recentLoss / minLoss).toFixed(0)}x above its minimum — possible instability. If persistent, reduce learning rate.` });
          }
        }
      }
    }
  }

  if (tab === "kl") {
    const kl = num(latest.kl);

    if (kl != null) {
      if (!isFinite(kl) || isNaN(kl)) {
        insights.push({ level: "critical", text: "KL divergence is NaN — numerical failure. If using Unsloth with mask_truncated_completions=true, this can happen when all completions are truncated." });
      }
      if (history && history.length >= 10) {
        const earlyKLs = history.slice(0, 5).map((m) => num(m.kl)).filter((v): v is number => v != null && v > 0);
        const recentKLs = history.slice(-5).map((m) => num(m.kl)).filter((v): v is number => v != null && v > 0);
        const earlyMedian = earlyKLs.length > 0 ? earlyKLs.sort((a, b) => a - b)[Math.floor(earlyKLs.length / 2)] : null;
        const recentMedian = recentKLs.length > 0 ? recentKLs.sort((a, b) => a - b)[Math.floor(recentKLs.length / 2)] : null;
        if (earlyMedian != null && recentMedian != null && earlyMedian > 0) {
          const klGrowth = recentMedian / earlyMedian;
          if (klGrowth > 10) {
            insights.push({ level: "warn", text: `KL grew ${klGrowth.toFixed(0)}x from early training — model is diverging from the base distribution. With β=0 this doesn't penalize loss, but may produce degenerate outputs.` });
          } else if (klGrowth < 0.1) {
            insights.push({ level: "ok", text: `KL decreased ${(1/klGrowth).toFixed(0)}x — model is converging back toward base distribution.` });
          }
        }
      }
    }
  }

  if (tab === "gradNorm") {
    const gradNorm = num(latest.grad_norm);

    if (gradNorm != null) {
      if (!isFinite(gradNorm) || isNaN(gradNorm)) {
        insights.push({ level: "critical", text: "Gradient norm is NaN — catastrophic numerical failure. Often caused by zero-length completions, missing LoRA adapters, or gradient_accumulation_steps > 1 bug in Unsloth." });
      }
      if (history && history.length >= 10) {
        const recentGrads = history.slice(-10).map((m) => num(m.grad_norm)).filter((v): v is number => v != null && v > 0);
        if (recentGrads.length >= 5 && gradNorm > 0) {
          const avgGrad = recentGrads.reduce((s, v) => s + v, 0) / recentGrads.length;
          if (avgGrad > 0 && gradNorm > avgGrad * 10) {
            insights.push({ level: "warn", text: `Gradient norm spike (${gradNorm.toExponential(1)}) — ${(gradNorm / avgGrad).toFixed(0)}x above recent average. May cause training instability.` });
          }
        }
      }
    }
  }

  if (tab === "clipRatio") {
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
      // Compute recommended max_output_tokens from natural completion length
      const recommended = termLen != null && termLen > 0
        ? Math.ceil(termLen * 1.5)
        : maxOutputTokens != null ? maxOutputTokens * 2 : null;
      const currentStr = maxOutputTokens != null ? ` (currently ${maxOutputTokens})` : "";
      const fixStr = recommended != null
        ? ` Increase max_output_tokens to at least ${recommended}${currentStr}.`
        : " Increase max_output_tokens.";

      if (clipped >= 0.95) insights.push({ level: "critical", text: `${(clipped * 100).toFixed(0)}% of responses are truncated — the model never finishes naturally. Training is producing no useful signal.${fixStr}` });
      else if (clipped > 0.5) insights.push({ level: "critical", text: `${(clipped * 100).toFixed(0)}% of responses are truncated — majority of training signal is noise.${fixStr}` });
      else if (clipped > 0.1) insights.push({ level: "warn", text: `${(clipped * 100).toFixed(0)}% truncated — some responses hit the token limit.${fixStr}` });
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

    // Length-reward divergence: Dr. GRPO length bias detection.
    // Requires metrics history (≥10 steps). Compares first half vs second half.
    // Ref: Dr. GRPO (arXiv:2503.20783, §3.1), MO-GRPO (arXiv:2509.22047)
    if (history && history.length >= 10) {
      const lengthRewardInsight = detectLengthRewardDivergence(history);
      if (lengthRewardInsight) insights.push(lengthRewardInsight);
    }
  }

  if (tab === "tokens") {
    const tokens = num(latest.num_tokens);
    if (tokens != null && tokens < 1000) {
      insights.push({ level: "warn", text: "Very low token throughput — batches may be small or completions very short." });
    }
  }

  if (tab === "batchSize") {
    const batchSize = num(latest.row_indices_count);
    if (batchSize != null && batchSize < 4) {
      insights.push({ level: "warn", text: `Batch size is only ${batchSize} — very few records per step. May cause noisy gradients.` });
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
  /** Rollout model used for this eval (e.g., "gpt-4o-mini", "Qwen3.5-4B").
   *  When present, trend comparison only compares evals from the same model. */
  readonly model?: string;
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

  // Improvement trend (need ≥2 epochs) — this is the most important signal in GRPO.
  // IMPORTANT: Only compare evals from the same model. Comparing GPT-4o-mini eval
  // (grader validation) with Qwen-4B eval (base model baseline) is meaningless.
  if (epochData.length >= 2) {
    const latestModel = latest.model;

    // Find the first eval from the SAME model for comparison
    const sameModelEvals = latestModel
      ? epochData.filter((e) => e.model === latestModel)
      : epochData;

    if (sameModelEvals.length >= 2) {
      const first = sameModelEvals[0];
      const delta = score - first.avgScore;
      const evalCount = sameModelEvals.length;
      const modelLabel = latestModel ? ` (${latestModel})` : "";

      if (delta > 0.05) {
        insights.push({ level: "ok", text: `Score improved by +${delta.toFixed(3)} across ${evalCount} evals${modelLabel} — model is learning. GRPO is working.` });
      } else if (delta > -0.02) {
        insights.push({ level: "warn", text: `Score change is flat (${delta >= 0 ? "+" : ""}${delta.toFixed(3)}) across ${evalCount} evals${modelLabel} — model may have plateaued. Consider adjusting learning rate or increasing data diversity.` });
      } else {
        // Score regression — possible reward hacking, overfitting, or LR too high
        insights.push({ level: "critical", text: `Score dropped by ${Math.abs(delta).toFixed(3)}${modelLabel} — model is regressing. Possible causes: reward hacking, overfitting, or learning rate too high.` });
      }
    } else if (sameModelEvals.length === 1 && latestModel) {
      // First eval for this model — no comparison possible yet
      insights.push({ level: "ok", text: `First eval for ${latestModel} — baseline score is ${score.toFixed(2)}. Compare with subsequent evals on the same model to measure improvement.` });
    } else {
      // No model info — fall back to comparing first vs last
      const first = epochData[0];
      const delta = score - first.avgScore;
      if (delta > 0.05) {
        insights.push({ level: "ok", text: `Score improved by +${delta.toFixed(3)} across ${epochData.length} evals.` });
      } else if (delta > -0.02) {
        insights.push({ level: "warn", text: `Score change is flat (${delta >= 0 ? "+" : ""}${delta.toFixed(3)}) across ${epochData.length} evals.` });
      } else {
        insights.push({ level: "critical", text: `Score dropped by ${Math.abs(delta).toFixed(3)} — model may be regressing.` });
      }
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
