# /// script
# requires-python = ">=3.10"
# ///
"""
analyze_eval_trace.py — Stage 8: per-tool eval analysis.

Takes a list of eval results (one per record, each with GT tool call,
predicted tool call, and the Stage 4 grader score) and produces:

  **Tier 1 metrics** (always reported):
    - tool_name_accuracy  — fraction where pred name == GT name
    - argument_match_rate — fraction where score == 1.0 on the
                            right-tool subset
    - overall_grader_mean — mean score across all records
    - per_tool_mean       — {gt_tool: mean_score}
    - refusal_precision, refusal_recall — P/R on the "no tool call" set

  **Tier 2 diagnostics** (every iteration):
    - confusion_matrix    — {gt_tool: {pred_tool_or_REFUSAL: count}}
    - weak_tools          — tools whose per-tool mean is below the
                            threshold (default 0.50), tagged with a
                            diagnosis drawn from the confusion row:
                              * "confused_with:X"  — one dominant
                                wrong tool accounts for ≥ 50% of errors
                              * "scattered"        — many different
                                wrong tools, no dominant one
                              * "name_correct_args_wrong" — tool name
                                accuracy is high but scores are low
                                (argument schema ambiguity)

Input shape (one per record):

    {
      "gt_tool_name":   "search"  | None,   # None = refusal GT
      "gt_args":        {...},
      "pred_tool_name": "search"  | None,
      "pred_args":      {...},
      "score":          0.85,
    }

This is a post-processing script that reads from the vLLora eval
results API — the upstream caller is responsible for pairing records
with model outputs and running the grader. This script only computes
metrics from the paired+scored results.

Usage:
    python3 analyze_eval_trace.py eval_results.json --output report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REFUSAL_LABEL = "__REFUSAL__"

DEFAULT_WEAK_TOOL_THRESHOLD = 0.50
DEFAULT_NAME_ACCURACY_HIGH = 0.80  # for "name correct, args wrong" diagnosis
DEFAULT_DOMINANT_CONFUSION_FRAC = 0.50


# ─── Tier 1 metrics ────────────────────────────────────────────────────────


def _name_or_refusal(name: str | None) -> str:
    return name if name else REFUSAL_LABEL


def tool_name_accuracy(results: list[dict]) -> float:
    if not results:
        return 0.0
    matches = sum(
        1
        for r in results
        if _name_or_refusal(r.get("gt_tool_name"))
        == _name_or_refusal(r.get("pred_tool_name"))
    )
    return matches / len(results)


def argument_match_rate(results: list[dict]) -> float:
    """Fraction of records where score == 1.0, restricted to records
    whose predicted tool name matched the GT tool name (the "right-tool
    subset"). Returns 0.0 if no records are in the right-tool subset."""
    right_tool = [
        r
        for r in results
        if r.get("gt_tool_name")
        and r.get("gt_tool_name") == r.get("pred_tool_name")
    ]
    if not right_tool:
        return 0.0
    return sum(1 for r in right_tool if r.get("score", 0) >= 1.0) / len(right_tool)


def overall_grader_mean(results: list[dict]) -> float:
    if not results:
        return 0.0
    return sum(r.get("score", 0.0) for r in results) / len(results)


def per_tool_mean(results: list[dict]) -> dict[str, float]:
    """Mean grader score grouped by GT tool name. Refusal records
    (gt_tool_name is None) are grouped under the REFUSAL label."""
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for r in results:
        key = _name_or_refusal(r.get("gt_tool_name"))
        totals[key] = totals.get(key, 0.0) + r.get("score", 0.0)
        counts[key] = counts.get(key, 0) + 1
    return {key: totals[key] / counts[key] for key in totals}


def refusal_precision_recall(results: list[dict]) -> tuple[float, float]:
    """Precision and recall of the model's refusal behavior.

    Positive class = "no tool call". Returns (0.0, 0.0) if there are
    no refusal GT records and no refusal predictions (metric is
    undefined — caller should check via `refusal_applicable`)."""
    tp = fp = fn = 0
    for r in results:
        gt_refusal = r.get("gt_tool_name") is None
        pred_refusal = r.get("pred_tool_name") is None
        if gt_refusal and pred_refusal:
            tp += 1
        elif not gt_refusal and pred_refusal:
            fp += 1
        elif gt_refusal and not pred_refusal:
            fn += 1
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    return precision, recall


def refusal_applicable(results: list[dict]) -> bool:
    """True iff the eval set contains at least one refusal GT record."""
    return any(r.get("gt_tool_name") is None for r in results)


# ─── Tier 2 diagnostics ────────────────────────────────────────────────────


def confusion_matrix(results: list[dict]) -> dict[str, dict[str, int]]:
    """Build `{gt_tool: {pred_tool: count}}`.

    Both GT and prediction use REFUSAL_LABEL when the tool name is
    absent. Correct predictions land on the diagonal (gt == pred)."""
    matrix: dict[str, dict[str, int]] = {}
    for r in results:
        gt = _name_or_refusal(r.get("gt_tool_name"))
        pred = _name_or_refusal(r.get("pred_tool_name"))
        row = matrix.setdefault(gt, {})
        row[pred] = row.get(pred, 0) + 1
    return matrix


def _diagnose_weak_tool(
    tool: str,
    results: list[dict],
    matrix: dict[str, dict[str, int]],
    *,
    dominant_frac: float = DEFAULT_DOMINANT_CONFUSION_FRAC,
    name_accuracy_high: float = DEFAULT_NAME_ACCURACY_HIGH,
) -> str:
    """Pick a diagnosis for a weak tool from its confusion row."""
    tool_results = [r for r in results if r.get("gt_tool_name") == tool]
    if not tool_results:
        return "no_records"

    # If the tool name is predicted correctly most of the time but
    # the score is still low, the problem is argument-level.
    name_matches = sum(
        1 for r in tool_results if r.get("pred_tool_name") == tool
    )
    name_accuracy = name_matches / len(tool_results)
    if name_accuracy >= name_accuracy_high:
        return "name_correct_args_wrong"

    # Otherwise look at the confusion row — errors only, not the
    # diagonal.
    row = matrix.get(tool, {})
    errors = {pred: n for pred, n in row.items() if pred != tool}
    total_errors = sum(errors.values())
    if total_errors == 0:
        return "no_errors"

    top_wrong, top_count = max(errors.items(), key=lambda kv: kv[1])
    if top_count / total_errors >= dominant_frac:
        return f"confused_with:{top_wrong}"
    return "scattered"


def identify_weak_tools(
    results: list[dict],
    *,
    threshold: float = DEFAULT_WEAK_TOOL_THRESHOLD,
    dominant_frac: float = DEFAULT_DOMINANT_CONFUSION_FRAC,
    name_accuracy_high: float = DEFAULT_NAME_ACCURACY_HIGH,
) -> list[dict]:
    """Return the list of weak tools, each with a diagnosis.

    A tool is weak if its per-tool mean score is strictly below
    `threshold`. Refusal records are not considered a "tool" and
    are never in the output.
    """
    means = per_tool_mean(results)
    matrix = confusion_matrix(results)
    weak: list[dict] = []
    for tool, score in means.items():
        if tool == REFUSAL_LABEL:
            continue
        if score >= threshold:
            continue
        weak.append(
            {
                "tool": tool,
                "mean_score": score,
                "diagnosis": _diagnose_weak_tool(
                    tool,
                    results,
                    matrix,
                    dominant_frac=dominant_frac,
                    name_accuracy_high=name_accuracy_high,
                ),
            }
        )
    return sorted(weak, key=lambda d: d["mean_score"])


# ─── Top-level report ──────────────────────────────────────────────────────


def analyze(
    results: list[dict],
    *,
    weak_tool_threshold: float = DEFAULT_WEAK_TOOL_THRESHOLD,
) -> dict[str, Any]:
    """Compute the Tier 1 + Tier 2 report."""
    precision, recall = refusal_precision_recall(results)
    return {
        "total_records": len(results),
        "tier_1": {
            "tool_name_accuracy": tool_name_accuracy(results),
            "argument_match_rate": argument_match_rate(results),
            "overall_grader_mean": overall_grader_mean(results),
            "per_tool_mean": per_tool_mean(results),
            "refusal_precision": precision,
            "refusal_recall": recall,
            "refusal_applicable": refusal_applicable(results),
        },
        "tier_2": {
            "confusion_matrix": confusion_matrix(results),
            "weak_tools": identify_weak_tools(
                results, threshold=weak_tool_threshold
            ),
            "weak_tool_threshold": weak_tool_threshold,
        },
    }


# ─── CLI ───────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Stage 8 per-tool eval analysis"
    )
    parser.add_argument(
        "results",
        type=Path,
        help="Eval results JSON — list of {gt_tool_name, pred_tool_name, score, ...}",
    )
    parser.add_argument("--output", type=Path, required=True, help="Output report JSON")
    parser.add_argument(
        "--weak-tool-threshold",
        type=float,
        default=DEFAULT_WEAK_TOOL_THRESHOLD,
        help=f"Mean score below which a tool is weak (default: {DEFAULT_WEAK_TOOL_THRESHOLD})",
    )
    args = parser.parse_args()

    if not args.results.exists():
        print(f"error: results file not found: {args.results}", file=sys.stderr)
        return 2

    results = json.loads(args.results.read_text())
    if not isinstance(results, list):
        print("error: results must be a JSON array", file=sys.stderr)
        return 2

    report = analyze(results, weak_tool_threshold=args.weak_tool_threshold)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    weak = report["tier_2"]["weak_tools"]
    print(
        f"wrote eval report → {args.output} "
        f"(accuracy={report['tier_1']['tool_name_accuracy']:.1%}, "
        f"mean={report['tier_1']['overall_grader_mean']:.3f}, "
        f"weak_tools={len(weak)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
