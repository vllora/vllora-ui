#!/usr/bin/env python3
# /// script
# dependencies = ["requests>=2.31"]
# ///
"""reward_calibrate.py — IRC-style diagnostic: does each reward tier actually predict outcome?

Adapts the Iterative Reward Calibration (IRC) methodology from MT-GRPO
(arXiv:2604.02869, Apr 2026): for each reward tier, compute the point-biserial
correlation between tier presence in a record and the binary outcome (grader
pass/fail). Tiers with |ρ| below a threshold are uninformative — rewarding them
adds noise without signal. Tiers with negative ρ are anti-predictors — the
grader rewards the wrong thing.

Distinct from `grader-discriminate`:
- grader-discriminate tests synthetic corruption: does the grader distinguish
  correct vs mutated calls? (Does grader SCORING separate correct from wrong?)
- reward-calibrate tests empirical alignment: do record-level tier
  characteristics predict grader pass? (Does grader SCORING track task
  outcome, or does it reward properties that don't correlate with success?)

Input: an eval results file (from cloud) + the training.jsonl it evaluated.
Output: per-tier report with ρ, pass rate, mean score, verdict.

IRC from the paper (Algorithm 1):
  for each tier c:
    ρ_c = PointBiserial(1[c ∈ τ_i], o_i)
    if |ρ_c| < δ: r_c ← 0        (tier uninformative)
    else:         r_c ← α · ρ_c   (tier aligned with outcome, sign-corrected)

Our adaptation uses RECORD characteristics (topic, prompt_type, GT tool
category, history length, etc.) as tiers — surfaces grader bias toward
characteristics that don't correlate with outcome.

Usage:
    uv run scripts/reward_calibrate.py \\
        --eval-file test-runs/eval-001.json \\
        --records finetune-project/training.jsonl \\
        --output-report quality-checker/reward-calibration.json
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

# Thresholds from the paper's Algorithm 1 (Section 4.2, δ = 0.15 cited in
# Table 4 notes). A tier with |ρ| below this is considered uninformative.
DEFAULT_UNINFORMATIVE_THRESHOLD = 0.15
# Strong-predictor threshold: tiers above this are load-bearing. No IRC
# analog — ours, purely for reporting.
STRONG_PREDICTOR_THRESHOLD = 0.30
DEFAULT_PASS_THRESHOLD = 0.50  # binary outcome cutoff on continuous grader score


# ─── Tier labellers (record characteristic → tier label) ─────────────────────


def _tier_topic(record: dict) -> str | None:
    """Topic slug the record is classified under."""
    return record.get("topic")


def _tier_prompt_type(record: dict) -> str | None:
    """Origin of the record — trace_decision_point, paraphrase, synthetic, etc."""
    return record.get("prompt_type")


def _classify_tool_category(tool_name: str) -> str:
    """Classify a tool name as action / lookup / utility / unknown."""
    if not tool_name:
        return "unknown"
    low = tool_name.lower()
    if any(low.startswith(p) for p in ("get_", "find_", "list_", "search_")):
        return "lookup"
    if low in ("think", "calculate"):
        return "utility"
    if any(
        p in low
        for p in ("cancel_", "modify_", "return_", "exchange_", "book_", "transfer_", "update_")
    ):
        return "action"
    return "unknown"


def _tier_gt_category(record: dict) -> str | None:
    """Whether GT is a lookup / action / utility tool."""
    gt = record.get("ground_truth") or {}
    return _classify_tool_category(gt.get("name", ""))


def _tier_history_length(record: dict) -> str | None:
    """Bucketed history length: short(<8), medium(8-15), long(15+)."""
    n = len(record.get("messages") or [])
    if n < 8:
        return "short_history"
    if n < 16:
        return "medium_history"
    return "long_history"


def _tier_prior_tool_calls(record: dict) -> str | None:
    """Bucketed number of tool_calls in history: 0 / 1-2 / 3+."""
    count = 0
    for m in record.get("messages") or []:
        tcs = m.get("tool_calls")
        if isinstance(tcs, list):
            count += len(tcs)
    if count == 0:
        return "no_prior_tool_calls"
    if count <= 2:
        return "few_prior_tool_calls"
    return "many_prior_tool_calls"


TIER_FUNCTIONS = {
    "topic": _tier_topic,
    "prompt_type": _tier_prompt_type,
    "gt_category": _tier_gt_category,
    "history_length": _tier_history_length,
    "prior_tool_calls": _tier_prior_tool_calls,
}


# ─── Stats ───────────────────────────────────────────────────────────────────


def point_biserial(x: list[bool], y: list[float]) -> float:
    """Point-biserial correlation between binary x and continuous y.

    Equivalent to Pearson correlation with x as 0/1. Returns 0 if either
    group has 0 or 1 samples (undefined).
    """
    if len(x) != len(y) or len(x) < 2:
        return 0.0
    y_with = [yi for xi, yi in zip(x, y) if xi]
    y_without = [yi for xi, yi in zip(x, y) if not xi]
    if not y_with or not y_without:
        return 0.0
    if len(y) < 2:
        return 0.0
    mean_y = statistics.mean(y)
    stdev_y = statistics.stdev(y)
    if stdev_y == 0:
        return 0.0
    n1, n0 = len(y_with), len(y_without)
    n = n1 + n0
    return ((statistics.mean(y_with) - statistics.mean(y_without)) / stdev_y) * math.sqrt(
        n1 * n0 / (n * (n - 1))
    )


# ─── Analysis ────────────────────────────────────────────────────────────────


@dataclass
class TierStats:
    tier: str
    value: str
    n_total: int
    n_in_tier: int
    n_pass_in_tier: int
    n_pass_out_tier: int
    mean_score_in_tier: float
    mean_score_out_tier: float
    pass_rate_in_tier: float
    pass_rate_out_tier: float
    rho: float  # point-biserial between in-tier-presence and pass

    @property
    def verdict(self) -> str:
        # Degenerate: the tier covers every record in the sample — there's no
        # out-group to correlate against, so ρ is mathematically zero.
        # Reporting UNINFORMATIVE here would be misleading.
        if self.n_in_tier == self.n_total:
            return "DEGENERATE_UNIVERSAL"
        if self.n_in_tier < 5:
            return "INSUFFICIENT_DATA"
        if self.rho < -0.10:
            return "ANTI_PREDICTOR"  # tier presence negatively correlated with pass
        if abs(self.rho) < DEFAULT_UNINFORMATIVE_THRESHOLD:
            return "UNINFORMATIVE"  # tier presence does not predict pass
        if self.rho >= STRONG_PREDICTOR_THRESHOLD:
            return "STRONG_POSITIVE"
        return "WEAK_POSITIVE"


def load_eval_scores(eval_file: Path, pass_threshold: float) -> dict[str, tuple[float, bool]]:
    """Map record_id → (mean_epoch_score, is_pass) from an eval results file.

    The eval file format (from cloud via gateway) has `results[]` with each row
    containing the `row.id` from training.jsonl and `epochs[*][*].score`. We
    take the mean score across epochs × rollouts per row.
    """
    data = json.loads(eval_file.read_text())
    results = data.get("results") or []
    out: dict[str, tuple[float, bool]] = {}
    for r in results:
        row = r.get("row") or {}
        rid = row.get("id")
        if not rid:
            continue
        scores: list[float] = []
        for epoch_runs in (r.get("epochs") or {}).values():
            for run in epoch_runs or []:
                s = run.get("score")
                if isinstance(s, (int, float)):
                    scores.append(float(s))
        if not scores:
            continue
        mean_score = sum(scores) / len(scores)
        out[rid] = (mean_score, mean_score >= pass_threshold)
    return out


def analyze_tiers(
    records: list[dict], scores: dict[str, tuple[float, bool]]
) -> list[TierStats]:
    """For each (tier_name, tier_value), compute stats across matched records."""
    # Build list of (record, score, pass) joined by record id
    joined: list[tuple[dict, float, bool]] = []
    missing = 0
    for rec in records:
        rid = rec.get("id")
        if rid in scores:
            score, passed = scores[rid]
            joined.append((rec, score, passed))
        else:
            missing += 1
    if missing:
        print(f"  (note: {missing}/{len(records)} records had no eval score — skipped)")
    n_total = len(joined)
    if n_total < 10:
        raise SystemExit(
            f"Too few joined records ({n_total}) for reliable tier analysis. "
            f"Need at least 10."
        )

    stats: list[TierStats] = []
    for tier_name, tier_fn in TIER_FUNCTIONS.items():
        # Bucket records by tier value
        by_value: dict[str, list[tuple[dict, float, bool]]] = defaultdict(list)
        for rec, score, passed in joined:
            v = tier_fn(rec)
            if v is None:
                continue
            by_value[v].append((rec, score, passed))

        # Compute per-value statistics
        all_scores = [s for _, s, _ in joined]
        all_pass = [p for _, _, p in joined]
        for value, entries in sorted(by_value.items()):
            n_in = len(entries)
            in_mask = [True] * n_in + [False] * (n_total - n_in)
            scores_in = [s for _, s, _ in entries]
            pass_in = [p for _, _, p in entries]
            # out-of-tier = all - in-tier
            in_ids = {id(e) for e in entries}
            scores_out = [s for rec, s, _ in joined if id((rec, s, _)) not in in_ids]
            # Simpler: compute from complement
            scores_out = [s for rec, s, p in joined if (rec, s, p) not in entries]
            pass_out = [p for rec, s, p in joined if (rec, s, p) not in entries]

            # Point-biserial: x = is_in_tier (bool), y = score (float)
            x = [True] * n_in + [False] * (n_total - n_in)
            y = scores_in + scores_out
            rho = point_biserial(x, y)

            stats.append(TierStats(
                tier=tier_name,
                value=value,
                n_total=n_total,
                n_in_tier=n_in,
                n_pass_in_tier=sum(pass_in),
                n_pass_out_tier=sum(pass_out),
                mean_score_in_tier=statistics.mean(scores_in) if scores_in else 0.0,
                mean_score_out_tier=statistics.mean(scores_out) if scores_out else 0.0,
                pass_rate_in_tier=sum(pass_in) / n_in if n_in else 0.0,
                pass_rate_out_tier=sum(pass_out) / len(pass_out) if pass_out else 0.0,
                rho=rho,
            ))
    return stats


# ─── Reporting ───────────────────────────────────────────────────────────────


def print_report(stats: list[TierStats]) -> None:
    print()
    print("=== Reward calibration report ===")
    print(f"  Per-tier point-biserial correlation between tier presence and pass.")
    print(f"  Verdicts: |ρ| < {DEFAULT_UNINFORMATIVE_THRESHOLD} = UNINFORMATIVE, "
          f"ρ < -0.10 = ANTI_PREDICTOR, ρ ≥ {STRONG_PREDICTOR_THRESHOLD} = STRONG")
    print()
    by_tier: dict[str, list[TierStats]] = defaultdict(list)
    for s in stats:
        by_tier[s.tier].append(s)
    for tier_name, tier_stats in by_tier.items():
        print(f"── {tier_name} ──")
        for s in sorted(tier_stats, key=lambda x: -abs(x.rho)):
            mark = {
                "STRONG_POSITIVE": "✓ strong",
                "WEAK_POSITIVE": "• weak ",
                "UNINFORMATIVE": "○ noise",
                "ANTI_PREDICTOR": "✗ ANTI!",
                "INSUFFICIENT_DATA": "? small",
                "DEGENERATE_UNIVERSAL": "— all rows",
            }.get(s.verdict, "?")
            print(
                f"  {s.value:32s}  n={s.n_in_tier:4d}  "
                f"pass={s.pass_rate_in_tier:.2f} (vs {s.pass_rate_out_tier:.2f} out)  "
                f"mean={s.mean_score_in_tier:.2f} (vs {s.mean_score_out_tier:.2f})  "
                f"ρ={s.rho:+.3f}  {mark}"
            )
        print()

    # Highlight actionable findings (excluding degenerate cases)
    anti = [s for s in stats if s.verdict == "ANTI_PREDICTOR"]
    noisy = [
        s for s in stats
        if s.verdict == "UNINFORMATIVE" and s.n_in_tier >= 20
    ]
    if anti:
        print("⚠ ANTI-PREDICTOR tiers (grader rewards properties that correlate with FAILURE):")
        for s in anti:
            print(f"    {s.tier}={s.value!r}  ρ={s.rho:+.3f} — inspect; grader may be mis-rewarding")
        print()
    if noisy:
        print("○ UNINFORMATIVE tiers (tier membership doesn't predict outcome — weight contributes noise):")
        for s in noisy:
            print(f"    {s.tier}={s.value!r}  ρ={s.rho:+.3f}  n={s.n_in_tier}")
        print()


def write_report(stats: list[TierStats], output_path: Path) -> None:
    report = {
        "thresholds": {
            "uninformative": DEFAULT_UNINFORMATIVE_THRESHOLD,
            "strong": STRONG_PREDICTOR_THRESHOLD,
        },
        "tiers": [
            {
                "tier": s.tier,
                "value": s.value,
                "n_total": s.n_total,
                "n_in_tier": s.n_in_tier,
                "pass_rate_in_tier": s.pass_rate_in_tier,
                "pass_rate_out_tier": s.pass_rate_out_tier,
                "mean_score_in_tier": s.mean_score_in_tier,
                "mean_score_out_tier": s.mean_score_out_tier,
                "rho": s.rho,
                "verdict": s.verdict,
            }
            for s in stats
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2))
    print(f"  report written → {output_path}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--eval-file", required=True, type=Path)
    ap.add_argument("--records", required=True, type=Path, help="training.jsonl")
    ap.add_argument("--pass-threshold", type=float, default=DEFAULT_PASS_THRESHOLD)
    ap.add_argument(
        "--output-report",
        type=Path,
        default=Path("finetune-project/quality-checker/reward-calibration.json"),
    )
    args = ap.parse_args()

    if not args.eval_file.exists():
        raise SystemExit(f"Eval file not found: {args.eval_file}")
    if not args.records.exists():
        raise SystemExit(f"Records file not found: {args.records}")

    print(f"Loading eval scores from {args.eval_file}...")
    scores = load_eval_scores(args.eval_file, args.pass_threshold)
    print(f"  {len(scores)} scored records (pass threshold: {args.pass_threshold})")

    with args.records.open() as f:
        records = [json.loads(line) for line in f if line.strip()]
    print(f"Loaded {len(records)} training records")

    stats = analyze_tiers(records, scores)
    print_report(stats)
    write_report(stats, args.output_report)


if __name__ == "__main__":
    main()
