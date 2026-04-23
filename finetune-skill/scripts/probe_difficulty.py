# /// script
# dependencies = []
# ///
"""Difficulty distribution probe for GRPO training signal prediction.

Analyzes eval results to predict whether GRPO training will produce
learning signal. Uses K=1 eval scores to estimate per-prompt difficulty
and predict K=8 zero-variance rates.

The core insight: GRPO learns by comparing K completions per prompt.
If all K completions score identically (zero variance), the gradient
is zero — that prompt teaches the model nothing. This probe estimates
how many prompts will produce zero signal during training.

Research basis:
  - DOTS+RR (arXiv:2506.05316): Gradient is maximized at p=0.5 success rate.
    Reduces training time 23-62% through difficulty-targeted selection.
  - "Hard Examples Are All You Need" (arXiv:2508.14094): Hard 10% gives 47% gains.
    Easy examples become zero-variance within a few training steps.
  - "No Prompt Left Behind" (arXiv:2509.21880, ICLR 2026): 30-99% of prompts
    per batch are zero-variance in standard GRPO. Normal but wasteful.
  - DAPO (arXiv:2503.14476): Dynamic sampling skips zero-variance groups.

Usage:
  python3 probe_difficulty.py evaluations/eval-001.json
  python3 probe_difficulty.py evaluations/eval-001.json --k 8 --json
  python3 probe_difficulty.py evaluations/eval-001.json --save difficulty-report.json

Exit codes:
  0 — PASS (>= 30% learnable prompts — training should produce signal)
  1 — FAIL (< 15% learnable — training will almost certainly be flat)
  2 — WARN (15-30% learnable — training may be slow, consider fixes)
"""

import argparse
import json
import math
import statistics
import sys
from collections import Counter
from pathlib import Path


# ─────────────────────────────────────────────────────────────────────
# Thresholds — research-informed
#
# DOTS+RR (arXiv:2506.05316) proves gradient magnitude is maximized
# at p=0.5 and falls to zero at p=0 and p=1. The "learnable" band
# (0.2-0.8) captures prompts where GRPO has meaningful gradient.
#
# "Hard Examples" (arXiv:2508.14094) shows easy prompts (p>0.8)
# maintain learnable variance for only 2-9% of training steps.
# ─────────────────────────────────────────────────────────────────────

THRESHOLDS = {
    # Difficulty buckets (based on K=1 success rate as proxy)
    "dead_low": 0.05,       # score < 0.05 → model cannot produce anything useful
    "hard_upper": 0.20,     # score < 0.20 → hard (some signal, but K=8 likely all-fail)
    "learnable_lower": 0.20,  # 0.20-0.80 → learnable (maximum gradient signal)
    "learnable_upper": 0.80,  # score > 0.80 → easy (K=8 likely all-pass)
    "easy_lower": 0.80,      # score > 0.80 → easy
    "trivial": 0.95,         # score > 0.95 → trivial (essentially solved)

    # Decision thresholds
    "min_learnable_frac": 0.30,       # PASS: >= 30% in learnable band
    "warn_learnable_frac": 0.15,      # WARN: 15-30%, FAIL: < 15%
    "max_dead_frac": 0.30,            # WARN if > 30% dead prompts
    "max_trivial_frac": 0.40,         # WARN if > 40% trivial (raised: K=1≠K=8, don't pre-filter)

    # Predicted zero-variance rate
    "max_predicted_zero_var": 0.70,   # WARN if > 70% predicted zero-var at K=8
    "critical_zero_var": 0.85,        # FAIL if > 85%

    # Grader granularity (score clustering)
    "max_score_concentration": 0.50,  # WARN if >50% at one value (2-decimal)
    "critical_score_concentration": 0.70,  # FAIL if >70% — grader broken
    "min_unique_scores": 5,           # WARN if fewer than 5 distinct score values
}


# ─────────────────────────────────────────────────────────────────────
# Data extraction (same format as finetune.py readiness-check)
# ─────────────────────────────────────────────────────────────────────

def load_eval_results(path: Path) -> dict:
    """Load and parse eval results file."""
    data = json.loads(path.read_text())
    results = data.get("results", [])
    if not results:
        return {"scores": [], "per_prompt": [], "metadata": data}

    all_scores: list[float] = []
    per_prompt: list[dict] = []

    for r in results:
        prompt_scores: list[float] = []
        row = r.get("row", {})
        topic = row.get("topic") if isinstance(row, dict) else None
        record_id = row.get("id", f"row-{r.get('row_index', '?')}") if isinstance(row, dict) else f"row-{r.get('row_index', '?')}"

        epochs = r.get("epochs", {})
        if isinstance(epochs, dict):
            for _epoch_key, candidates in epochs.items():
                if not isinstance(candidates, list):
                    continue
                for c in candidates:
                    if not isinstance(c, dict) or c.get("score") is None:
                        continue
                    score = float(c["score"])
                    prompt_scores.append(score)
                    all_scores.append(score)
        elif r.get("score") is not None:
            score = float(r["score"])
            prompt_scores.append(score)
            all_scores.append(score)

        if prompt_scores:
            per_prompt.append({
                "record_id": record_id,
                "scores": prompt_scores,
                "mean_score": statistics.mean(prompt_scores),
                "topic": topic,
            })

    return {
        "scores": all_scores,
        "per_prompt": per_prompt,
        "metadata": {
            "evaluation_run_id": data.get("evaluation_run_id"),
            "model": data.get("model"),
            "total_rows": data.get("total_rows"),
            "completed_rows": data.get("completed_rows"),
        },
    }


# ─────────────────────────────────────────────────────────────────────
# Difficulty classification
# ─────────────────────────────────────────────────────────────────────

def classify_difficulty(score: float) -> str:
    """Classify a prompt by K=1 score into difficulty bucket.

    Buckets based on DOTS+RR (arXiv:2506.05316) gradient analysis:
    - Gradient magnitude ∝ p(1-p) where p is success probability
    - Maximum at p=0.5, zero at p=0 and p=1
    """
    if score < THRESHOLDS["dead_low"]:
        return "dead"
    if score < THRESHOLDS["hard_upper"]:
        return "hard"
    if score <= THRESHOLDS["learnable_upper"]:
        return "learnable"
    if score <= THRESHOLDS["trivial"]:
        return "easy"
    return "trivial"


def predict_zero_variance_rate(score: float, k: int) -> float:
    """Predict probability that all K completions score identically.

    For K=1 score p (treating as success probability proxy):
    P(all K same) ≈ p^K + (1-p)^K

    This is an approximation — real variance depends on the grader's
    continuous scoring, not just binary success/fail. But it gives a
    useful lower bound on zero-variance rate.

    With continuous scoring, the actual zero-variance rate is HIGHER
    because scores can cluster even when not exactly 0 or 1.

    Reference: "No Prompt Left Behind" (arXiv:2509.21880) found
    30-99% zero-variance per batch empirically, consistent with
    this formula for typical K=8 and bimodal score distributions.
    """
    # Clamp to avoid numerical issues
    p = max(0.001, min(0.999, score))
    return p ** k + (1 - p) ** k


def expected_gradient_magnitude(score: float) -> float:
    """Estimate relative gradient magnitude from DOTS+RR.

    DOTS+RR (arXiv:2506.05316) proves gradient ∝ p(1-p).
    Maximum at p=0.5, zero at p=0 and p=1.
    """
    p = max(0.001, min(0.999, score))
    return p * (1 - p)


# ─────────────────────────────────────────────────────────────────────
# Grader granularity analysis
# ─────────────────────────────────────────────────────────────────────

def analyze_grader_granularity(scores: list[float]) -> dict:
    """Check if grader produces diverse or clustered scores.

    Research: RGR-GRPO (arXiv:2511.12344) showed rubric-based
    multi-point scoring dramatically outperforms binary verification
    because it provides dense, informative feedback.
    """
    if not scores:
        return {"verdict": "SKIP", "reason": "No scores"}

    n = len(scores)

    # Score concentration (rounded to 2 decimals)
    rounded = [round(s, 2) for s in scores]
    counts = Counter(rounded)
    mode_value, mode_count = counts.most_common(1)[0]
    concentration = mode_count / n

    # Unique score values
    unique_scores = len(counts)

    # Binary fraction (exact 0 or 1)
    binary_count = sum(1 for s in scores if s <= 0.01 or s >= 0.99)
    binary_frac = binary_count / n

    # Score spread — percentiles
    sorted_scores = sorted(scores)
    p10 = sorted_scores[max(0, int(n * 0.10))]
    p25 = sorted_scores[max(0, int(n * 0.25))]
    p50 = sorted_scores[max(0, int(n * 0.50))]
    p75 = sorted_scores[max(0, int(n * 0.75))]
    p90 = sorted_scores[min(n - 1, int(n * 0.90))]

    # Bucket distribution (for visual)
    buckets = {"0.0-0.2": 0, "0.2-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0}
    for s in scores:
        if s < 0.2:
            buckets["0.0-0.2"] += 1
        elif s < 0.4:
            buckets["0.2-0.4"] += 1
        elif s < 0.6:
            buckets["0.4-0.6"] += 1
        elif s < 0.8:
            buckets["0.6-0.8"] += 1
        else:
            buckets["0.8-1.0"] += 1

    issues: list[dict] = []

    if concentration > THRESHOLDS["critical_score_concentration"]:
        issues.append({
            "severity": "hard",
            "check": "score_concentration_critical",
            "message": f"{concentration:.0%} of scores are {mode_value} — grader is effectively constant. "
                       f"GRPO will get zero gradient on most prompts. Redesign grader with multi-point rubric. "
                       f"[RGR-GRPO arXiv:2511.12344]",
            "value": round(concentration, 3),
        })
    elif concentration > THRESHOLDS["max_score_concentration"]:
        issues.append({
            "severity": "soft",
            "check": "score_concentration",
            "message": f"{concentration:.0%} of scores cluster at {mode_value} — grader may lack granularity. "
                       f"Consider adding intermediate criteria. [DAPO arXiv:2503.14476]",
            "value": round(concentration, 3),
        })

    if unique_scores < THRESHOLDS["min_unique_scores"]:
        issues.append({
            "severity": "soft",
            "check": "low_score_diversity",
            "message": f"Only {unique_scores} distinct score values — grader produces coarse output. "
                       f"Continuous scoring (0.0-1.0) gives stronger GRPO signal. [OpenAI RFT Guide]",
            "value": unique_scores,
        })

    return {
        "concentration": round(concentration, 3),
        "mode_value": mode_value,
        "unique_scores": unique_scores,
        "binary_frac": round(binary_frac, 3),
        "percentiles": {"p10": round(p10, 3), "p25": round(p25, 3), "p50": round(p50, 3),
                        "p75": round(p75, 3), "p90": round(p90, 3)},
        "bucket_distribution": buckets,
        "issues": issues,
    }


# ─────────────────────────────────────────────────────────────────────
# Main analysis
# ─────────────────────────────────────────────────────────────────────

def analyze_difficulty(eval_data: dict, k: int = 8) -> dict:
    """Full difficulty distribution analysis.

    Takes eval results, classifies each prompt by difficulty,
    predicts K-group zero-variance rate, and produces a verdict.
    """
    per_prompt = eval_data["per_prompt"]
    all_scores = eval_data["scores"]

    if not per_prompt:
        return {"verdict": "FAIL", "error": "No prompt data found", "issues": []}

    n = len(per_prompt)

    # Classify each prompt
    difficulty_counts = Counter()
    zero_var_probs: list[float] = []
    gradient_magnitudes: list[float] = []
    per_prompt_analysis: list[dict] = []
    topic_difficulty: dict[str, list[str]] = {}

    for p in per_prompt:
        mean_score = p["mean_score"]
        difficulty = classify_difficulty(mean_score)
        zv_prob = predict_zero_variance_rate(mean_score, k)
        grad_mag = expected_gradient_magnitude(mean_score)

        difficulty_counts[difficulty] += 1
        zero_var_probs.append(zv_prob)
        gradient_magnitudes.append(grad_mag)

        entry = {
            "record_id": p["record_id"],
            "score": round(mean_score, 3),
            "difficulty": difficulty,
            "predicted_zero_var": round(zv_prob, 3),
            "gradient_magnitude": round(grad_mag, 4),
            "topic": p.get("topic"),
        }
        per_prompt_analysis.append(entry)

        topic = p.get("topic", "unknown")
        topic_difficulty.setdefault(topic, []).append(difficulty)

    # Aggregate stats
    learnable_count = difficulty_counts.get("learnable", 0)
    learnable_frac = learnable_count / n
    dead_frac = difficulty_counts.get("dead", 0) / n
    trivial_frac = difficulty_counts.get("trivial", 0) / n
    easy_frac = difficulty_counts.get("easy", 0) / n
    hard_frac = difficulty_counts.get("hard", 0) / n

    avg_zero_var = statistics.mean(zero_var_probs)
    avg_gradient = statistics.mean(gradient_magnitudes)
    total_gradient = sum(gradient_magnitudes)

    # Effective training samples: prompts where gradient > 0.05
    # (DOTS+RR threshold for "meaningful signal")
    effective_samples = sum(1 for g in gradient_magnitudes if g > 0.05)
    effective_frac = effective_samples / n

    # Per-topic breakdown
    topic_summary = {}
    for topic, diffs in topic_difficulty.items():
        tc = Counter(diffs)
        total = len(diffs)
        topic_learnable = tc.get("learnable", 0) / total if total > 0 else 0
        topic_summary[topic] = {
            "count": total,
            "learnable_frac": round(topic_learnable, 3),
            "distribution": dict(tc),
        }

    # Sort topics by learnable fraction (worst first)
    topic_summary = dict(sorted(topic_summary.items(), key=lambda x: x[1]["learnable_frac"]))

    # Grader granularity analysis
    grader_analysis = analyze_grader_granularity(all_scores)

    # Issues and verdict
    issues: list[dict] = []

    # Include grader issues
    issues.extend(grader_analysis.get("issues", []))

    if learnable_frac < THRESHOLDS["warn_learnable_frac"]:
        issues.append({
            "severity": "hard",
            "check": "learnable_fraction_critical",
            "message": f"Only {learnable_frac:.0%} of prompts are in the learnable range (0.2-0.8). "
                       f"GRPO gradient is near-zero outside this range. Training will almost certainly be flat. "
                       f"[DOTS+RR arXiv:2506.05316: gradient ∝ p(1-p), maximized at p=0.5]",
            "value": round(learnable_frac, 3),
            "threshold": THRESHOLDS["warn_learnable_frac"],
        })
    elif learnable_frac < THRESHOLDS["min_learnable_frac"]:
        issues.append({
            "severity": "soft",
            "check": "learnable_fraction_low",
            "message": f"{learnable_frac:.0%} of prompts are learnable — below ideal {THRESHOLDS['min_learnable_frac']:.0%}. "
                       f"Training may converge slowly. Consider: SFT warm-up for hard prompts, "
                       f"grader redesign for easy prompts, or increasing K. "
                       f"[Hard Examples arXiv:2508.14094]",
            "value": round(learnable_frac, 3),
            "threshold": THRESHOLDS["min_learnable_frac"],
        })

    if avg_zero_var > THRESHOLDS["critical_zero_var"]:
        issues.append({
            "severity": "hard",
            "check": "predicted_zero_var_critical",
            "message": f"Predicted {avg_zero_var:.0%} zero-variance prompts at K={k}. "
                       f"Most training steps will produce zero gradient. "
                       f"[No Prompt Left Behind arXiv:2509.21880: 30-99% is normal, but >85% is critical]",
            "value": round(avg_zero_var, 3),
        })
    elif avg_zero_var > THRESHOLDS["max_predicted_zero_var"]:
        issues.append({
            "severity": "soft",
            "check": "predicted_zero_var_high",
            "message": f"Predicted {avg_zero_var:.0%} zero-variance prompts at K={k}. "
                       f"Training will be slow but may still work. Consider increasing K to {k * 2}. "
                       f"[DAPO arXiv:2503.14476: dynamic sampling handles this at training time]",
            "value": round(avg_zero_var, 3),
        })

    if dead_frac > THRESHOLDS["max_dead_frac"]:
        issues.append({
            "severity": "soft",
            "check": "high_dead_fraction",
            "message": f"{dead_frac:.0%} of prompts are dead (score < {THRESHOLDS['dead_low']}). "
                       f"These waste compute. Remove or replace with prompts the base model can partially solve. "
                       f"Consider SFT warm-up to bootstrap model into learnable range. "
                       f"[DeepSeek-R1 arXiv:2501.12948: used SFT cold-start before GRPO]",
            "value": round(dead_frac, 3),
        })

    if trivial_frac > THRESHOLDS["max_trivial_frac"]:
        issues.append({
            "severity": "soft",
            "check": "high_trivial_fraction",
            "message": f"{trivial_frac:.0%} of prompts are trivial (K=1 score > {THRESHOLDS['trivial']}). "
                       f"These waste compute but do NOT harm training (zero-advantage = zero gradient). "
                       f"Do NOT pre-filter — add harder variants instead. "
                       f"Note: K=1 score=1.0 ≠ K=8 zero-variance (stochastic sampling may still produce gradient). "
                       f"[arXiv:2504.03380: one-sided filtering underperforms plain GRPO; "
                       f"arXiv:2509.21880: RL-ZVP extracts +8.6 pts from zero-variance prompts]",
            "value": round(trivial_frac, 3),
        })

    # Determine verdict
    hard_fails = [i for i in issues if i["severity"] == "hard"]
    soft_warns = [i for i in issues if i["severity"] == "soft"]

    if hard_fails:
        verdict = "FAIL"
    elif soft_warns:
        verdict = "WARN"
    else:
        verdict = "PASS"

    # Generate recommendations
    recommendations = _generate_recommendations(
        learnable_frac, dead_frac, trivial_frac, easy_frac, hard_frac,
        avg_zero_var, grader_analysis, k,
    )

    return {
        "verdict": verdict,
        "k": k,
        "prompt_count": n,
        "difficulty_distribution": {
            "dead": {"count": difficulty_counts.get("dead", 0), "frac": round(dead_frac, 3)},
            "hard": {"count": difficulty_counts.get("hard", 0), "frac": round(hard_frac, 3)},
            "learnable": {"count": learnable_count, "frac": round(learnable_frac, 3)},
            "easy": {"count": difficulty_counts.get("easy", 0), "frac": round(easy_frac, 3)},
            "trivial": {"count": difficulty_counts.get("trivial", 0), "frac": round(trivial_frac, 3)},
        },
        "signal_strength": {
            "avg_predicted_zero_var": round(avg_zero_var, 3),
            "avg_gradient_magnitude": round(avg_gradient, 4),
            "total_gradient": round(total_gradient, 2),
            "effective_samples": effective_samples,
            "effective_frac": round(effective_frac, 3),
        },
        "grader_granularity": grader_analysis,
        "per_topic": topic_summary,
        "issues": issues,
        "recommendations": recommendations,
        "per_prompt": per_prompt_analysis,
    }


def _generate_recommendations(
    learnable_frac: float, dead_frac: float, trivial_frac: float,
    easy_frac: float, hard_frac: float, avg_zero_var: float,
    grader: dict, k: int,
) -> list[dict]:
    """Generate prioritized fix recommendations."""
    recs: list[dict] = []
    priority = 0

    # Grader fixes (highest priority — affects all prompts)
    if grader.get("concentration", 0) > 0.50:
        priority += 1
        recs.append({
            "priority": priority,
            "action": "Redesign grader with multi-point rubric (0-7 scale with intermediate criteria)",
            "impact": "high",
            "cost": "medium",
            "reason": f"Grader concentrates {grader['concentration']:.0%} of scores at {grader.get('mode_value')}. "
                      f"This guarantees zero-variance K-groups for most prompts.",
            "research": "RGR-GRPO (arXiv:2511.12344): rubric grading >> binary verification",
        })

    if grader.get("binary_frac", 0) > 0.40:
        priority += 1
        recs.append({
            "priority": priority,
            "action": "Add partial credit to grader (0.0, 0.25, 0.50, 0.75, 1.0 levels)",
            "impact": "high",
            "cost": "low",
            "reason": f"{grader['binary_frac']:.0%} of scores are binary (0 or 1). "
                      f"Binary scoring increases P(zero-var) exponentially with K.",
            "research": "OpenAI RFT: 'produce a smooth score, not a pass/fail stamp'",
        })

    # Dead prompt fixes
    if dead_frac > 0.15:
        priority += 1
        recs.append({
            "priority": priority,
            "action": "Remove dead-weight prompts (score < 0.05) or add SFT warm-up",
            "impact": "medium",
            "cost": "low",
            "reason": f"{dead_frac:.0%} of prompts are dead — model cannot produce anything useful. "
                      f"These waste 100% of their compute.",
            "research": "DeepSeek-R1 (arXiv:2501.12948): SFT cold-start bootstraps into learnable range",
        })

    # Trivial prompt guidance
    # Research: do NOT pre-filter trivials (arXiv:2504.03380: one-sided filtering
    # underperforms plain GRPO). GRPO handles them via zero-advantage naturally.
    # Only flag if extreme (>40%) — suggest adding harder variants, not removing.
    if trivial_frac > 0.40:
        priority += 1
        recs.append({
            "priority": priority,
            "action": "Add harder variants to increase learnable fraction (do NOT remove trivials)",
            "impact": "medium",
            "cost": "medium",
            "reason": f"{trivial_frac:.0%} of prompts are trivial (K=1). GRPO handles these via "
                      f"zero-advantage (no gradient, no harm), but compute is wasted. "
                      f"K=1 score=1.0 ≠ K=8 zero-variance — stochastic sampling at K=8 may "
                      f"still produce useful gradient from some of these prompts.",
            "research": "arXiv:2504.03380: one-sided filtering underperforms plain GRPO. "
                        "arXiv:2509.21880 (ICLR 2026): RL-ZVP extracts +8.6 pts FROM zero-variance prompts. "
                        "arXiv:2508.14094: adding harder examples yields 10x more improvement per sample.",
        })

    # K size
    if avg_zero_var > 0.60 and k <= 8:
        priority += 1
        recs.append({
            "priority": priority,
            "action": f"Increase K from {k} to {k * 2} (response_candidates_count)",
            "impact": "medium",
            "cost": "high (2x compute per step)",
            "reason": f"Predicted {avg_zero_var:.0%} zero-variance at K={k}. "
                      f"Larger K reduces P(all-same) for borderline prompts.",
            "research": "DeepSeekMath used K=64; Dr. GRPO uses K=8 but with additional mechanisms",
        })

    if not recs:
        recs.append({
            "priority": 1,
            "action": "No issues found — proceed to training",
            "impact": "N/A",
            "cost": "N/A",
            "reason": f"{learnable_frac:.0%} learnable, {avg_zero_var:.0%} predicted zero-var. "
                      f"Signal density is sufficient for GRPO.",
            "research": "N/A",
        })

    return recs


# ─────────────────────────────────────────────────────────────────────
# Display
# ─────────────────────────────────────────────────────────────────────

def print_report(report: dict) -> None:
    """Print human-readable difficulty analysis report."""
    v = report["verdict"]
    icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌"}.get(v, "?")

    print(f"\n{'=' * 60}")
    print(f"DIFFICULTY PROBE — {icon} {v}")
    print(f"{'=' * 60}")

    dd = report["difficulty_distribution"]
    k = report["k"]
    n = report["prompt_count"]
    print(f"\nPrompts: {n} | Predicting for K={k}")
    print(f"\nDifficulty Distribution:")
    # Visual bar
    bar_width = 40
    for bucket in ["dead", "hard", "learnable", "easy", "trivial"]:
        info = dd[bucket]
        bar_len = max(0, int(info["frac"] * bar_width))
        bar = "█" * bar_len
        label = {"dead": "💀 Dead", "hard": "🔴 Hard", "learnable": "🟢 Learnable",
                 "easy": "🟡 Easy", "trivial": "⚪ Trivial"}.get(bucket, bucket)
        print(f"  {label:15s} {bar:40s} {info['count']:3d} ({info['frac']:.0%})")

    ss = report["signal_strength"]
    print(f"\nSignal Strength:")
    print(f"  Predicted zero-variance at K={k}: {ss['avg_predicted_zero_var']:.0%}")
    print(f"  Average gradient magnitude:       {ss['avg_gradient_magnitude']:.4f} (max=0.25 at p=0.5)")
    print(f"  Effective training samples:        {ss['effective_samples']}/{n} ({ss['effective_frac']:.0%})")

    # K=1 vs K=8 interpretation note
    trivial_frac_val = dd.get("trivial", {}).get("frac", 0)
    learnable_frac_val = dd.get("learnable", {}).get("frac", 0)
    print(f"\n  ⓘ  K=1 eval scores are conservative lower bounds. A prompt scoring 1.0 at")
    print(f"     K=1 (greedy) may score 0.6-0.8 at K=8 (stochastic sampling), still")
    print(f"     producing useful gradient. Trivial prompts waste compute but don't harm.")
    if trivial_frac_val > 0.40 and learnable_frac_val < 0.35:
        print(f"     ⚠ BUT: {trivial_frac_val:.0%} trivial + {learnable_frac_val:.0%} learnable = low signal density.")
        print(f"     Consider: (1) filter records with score >0.75 from training data")
        print(f"     (arXiv:2504.09696: GRPO-LEAD filters >75% accuracy), or")
        print(f"     (2) eval a smaller model for fewer trivials. See readiness-check output.")
    else:
        print(f"     Signal density acceptable — no filtering needed.")

    ga = report["grader_granularity"]
    print(f"\nGrader Granularity:")
    print(f"  Score concentration: {ga['concentration']:.0%} at {ga['mode_value']}")
    print(f"  Unique score values: {ga['unique_scores']}")
    print(f"  Binary (0/1) frac:  {ga['binary_frac']:.0%}")
    print(f"  Score distribution:  ", end="")
    for bucket_name, count in ga.get("bucket_distribution", {}).items():
        print(f"{bucket_name}:{count}", end="  ")
    print()

    # Per-topic (worst first)
    topics = report.get("per_topic", {})
    if topics:
        print(f"\nPer-Topic Learnability (worst first):")
        for topic, info in list(topics.items())[:10]:
            topic_name = str(topic or "unknown")
            learnable_pct = info["learnable_frac"]
            dist = info["distribution"]
            dist_str = " ".join(f"{dk}={dv}" for dk, dv in sorted(dist.items()))
            flag = "🔴" if learnable_pct < 0.20 else ("🟡" if learnable_pct < 0.40 else "🟢")
            print(f"  {flag} {topic_name[:35]:35s} learnable={learnable_pct:.0%}  [{dist_str}]")

    # Issues
    if report["issues"]:
        print(f"\n{'─' * 60}")
        print("ISSUES:")
        for issue in report["issues"]:
            sev = "🔴" if issue["severity"] == "hard" else "🟡"
            print(f"  {sev} [{issue['check']}] {issue['message']}")

    # Recommendations
    if report["recommendations"]:
        print(f"\n{'─' * 60}")
        print("RECOMMENDATIONS (by priority):")
        for rec in report["recommendations"]:
            print(f"  {rec['priority']}. [{rec['impact']} impact, {rec['cost']} cost] {rec['action']}")
            print(f"     Reason: {rec['reason']}")
            if rec.get("research") and rec["research"] != "N/A":
                print(f"     Research: {rec['research']}")

    print(f"\n{'─' * 60}")
    print(f"Verdict: {icon} {v}")
    if v == "PASS":
        print("Signal density sufficient — proceed to training (Step 7d).")
    elif v == "WARN":
        print("Signal may be weak — review recommendations before training.")
    else:
        print("Training will almost certainly be flat — fix issues before proceeding.")


# ─────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Difficulty distribution probe for GRPO training signal prediction",
    )
    parser.add_argument("input", help="Path to eval results JSON (e.g., evaluations/eval-001.json)")
    parser.add_argument("--k", type=int, default=8,
                        help="Group size K for zero-variance prediction (default: 8)")
    parser.add_argument("--json", action="store_true", help="Output JSON only")
    parser.add_argument("--save", help="Save full report to file")
    parser.add_argument("--compact", action="store_true",
                        help="Omit per-prompt details from output (smaller report)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    eval_data = load_eval_results(input_path)
    if not eval_data["scores"]:
        print("Error: No scores found in eval results", file=sys.stderr)
        sys.exit(1)

    report = analyze_difficulty(eval_data, k=args.k)

    if args.compact:
        report.pop("per_prompt", None)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)

    if args.save:
        save_path = Path(args.save)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_text(json.dumps(report, indent=2))
        if not args.json:
            print(f"\nFull report saved to {save_path}")

    # Exit code
    if report["verdict"] == "FAIL":
        sys.exit(1)
    elif report["verdict"] == "WARN":
        sys.exit(2)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
