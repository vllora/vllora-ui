# /// script
# requires-python = ">=3.10"
# ///
"""
trace_probe_gates.py — Stage 6: pre-training probe with 4 gates.

Runs a pre-training feasibility check on the extracted training records
and produces a go/no-go decision plus a diagnostic report. The probe
scores each record against K=8 rollouts from the untrained base model
(or mock rollouts for unit tests) and buckets the records by score
distribution.

Four gates, all of which must pass for training to proceed:

  1. learnable_frac ≥ 25%
     — enough records have mixed-score rollouts for GRPO to climb.
     Relaxed from the PDF pipeline's 30% because tool routing has a
     smaller discrete output space and more zero-variance groups are
     normal.

  2. trivial_wrong_frac ≤ 10%
     — no more than 10% of records are "base model locked on wrong tool".
     This is a NEW trace-specific gate that separates "model got it right"
     from "model got it wrong consistently" (both zero-variance, but
     opposite meanings).

  3. per_tool_trivial_frac ≤ 70% for every tool
     — no single tool should dominate the trivial bucket, to defend
     against default-mode collapse.

  4. refusal_frac ≥ 10% (only if refusal is in the schema)
     — if "no tool fits" is a valid answer, there must be enough
     refusal records for the student to learn refusal behavior.

The probe does NOT use vLLM directly — it takes pre-computed rollout
scores as input. This decouples the probe logic from the inference
runtime. In production, a thin wrapper runs K=8 rollouts against the
base model via vLLM, scores each with `trace_grader.grade()`, and
passes the scored lists to `run_probe()`.

Bucket definitions (for each record's K rollout scores):

  trivial_correct : all K rollouts pass (score > pass_threshold)
                    → no gradient signal, but not a failure
  trivial_wrong   : all K rollouts are at the wrong-tool floor
                    → base model locked on wrong tool, pre-existing bias
  learnable       : 1..K-1 rollouts pass → mixed scores, gradient signal
  impossible      : 0 rollouts pass, but NOT at the floor
                    → model tried different wrong things (variance),
                      but none worked

Usage:
    from trace_probe_gates import run_probe
    report = run_probe(records, rollout_scores, config)
    if report["decision"] == "GO":
        # proceed to handoff
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# ─── Config defaults ───────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "learnable_frac_min": 0.25,
    "trivial_wrong_frac_max": 0.10,
    "per_tool_trivial_max": 0.70,
    "refusal_frac_min": 0.10,
    "pass_threshold": 0.5,
    "wrong_tool_floor": 0.02,
    "require_refusal_gate": False,
}


# ─── Bucket classification ─────────────────────────────────────────────────


def bucket_record(
    scores: list[float],
    *,
    wrong_tool_floor: float = 0.02,
    pass_threshold: float = 0.5,
    floor_tolerance: float = 1e-6,
) -> str:
    """Classify a record into one of four buckets based on its K rollout scores.

    Args:
        scores: list of K rollout scores in [0, 1]
        wrong_tool_floor: the score the grader returns for wrong tool names
        pass_threshold: scores above this count as "passing"
        floor_tolerance: numeric tolerance when comparing to the floor

    Returns one of: "trivial_correct", "trivial_wrong", "learnable", "impossible".
    """
    if not scores:
        return "impossible"

    passes = sum(1 for s in scores if s > pass_threshold)
    k = len(scores)

    if passes == k:
        return "trivial_correct"
    if passes == 0:
        # All rollouts failed. Distinguish between:
        #   trivial_wrong — all at the floor (model stuck on wrong tool)
        #   impossible    — mixed low scores (model tried variants, none worked)
        all_at_floor = all(abs(s - wrong_tool_floor) <= floor_tolerance for s in scores)
        return "trivial_wrong" if all_at_floor else "impossible"
    return "learnable"


def bucket_all_records(
    records: list[dict],
    rollout_scores: list[list[float]],
    *,
    wrong_tool_floor: float = 0.02,
    pass_threshold: float = 0.5,
) -> list[tuple[dict, str]]:
    """Pair each record with its bucket label.

    Args:
        records: list of training records (OpenAI chat-completion format)
        rollout_scores: list of K-score lists, parallel to `records`

    Returns a list of (record, bucket_name) tuples. Raises if the lengths
    don't match.
    """
    if len(records) != len(rollout_scores):
        raise ValueError(
            f"records ({len(records)}) and rollout_scores "
            f"({len(rollout_scores)}) must have the same length"
        )
    return [
        (
            record,
            bucket_record(
                scores,
                wrong_tool_floor=wrong_tool_floor,
                pass_threshold=pass_threshold,
            ),
        )
        for record, scores in zip(records, rollout_scores)
    ]


# ─── Fraction computation ──────────────────────────────────────────────────


def compute_bucket_fractions(bucketed: list[tuple[dict, str]]) -> dict[str, float]:
    """Compute the fraction of records in each bucket."""
    if not bucketed:
        return {
            "trivial_correct_frac": 0.0,
            "trivial_wrong_frac": 0.0,
            "learnable_frac": 0.0,
            "impossible_frac": 0.0,
        }
    total = len(bucketed)
    counts: dict[str, int] = {}
    for _, bucket in bucketed:
        counts[bucket] = counts.get(bucket, 0) + 1
    return {
        "trivial_correct_frac": counts.get("trivial_correct", 0) / total,
        "trivial_wrong_frac": counts.get("trivial_wrong", 0) / total,
        "learnable_frac": counts.get("learnable", 0) / total,
        "impossible_frac": counts.get("impossible", 0) / total,
    }


def _record_tool_name(record: dict) -> str | None:
    """Extract the tool name from a record's last assistant message.

    Returns None if the record is a refusal (no tool calls) or malformed.
    For parallel calls (Pattern D), returns the first tool's name (the
    per-tool trivial gate considers all-parallel-from-same-tool as that
    tool's bucket).
    """
    messages = record.get("messages") or []
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return None
        fn = tool_calls[0].get("function") or {}
        return fn.get("name")
    return None


def compute_per_tool_trivial(
    bucketed: list[tuple[dict, str]],
) -> dict[str, float]:
    """For each tool name, compute the fraction of its records that are trivial.

    A record is "trivial" if it's in trivial_correct OR trivial_wrong
    (both are zero-variance from GRPO's perspective).

    Records without a tool name (refusal records) are excluded from the
    per-tool computation entirely.

    Returns a dict `{tool_name: trivial_frac}` with one entry per tool
    that has at least one record.
    """
    by_tool_total: dict[str, int] = {}
    by_tool_trivial: dict[str, int] = {}
    for record, bucket in bucketed:
        tool = _record_tool_name(record)
        if tool is None:
            continue
        by_tool_total[tool] = by_tool_total.get(tool, 0) + 1
        if bucket in ("trivial_correct", "trivial_wrong"):
            by_tool_trivial[tool] = by_tool_trivial.get(tool, 0) + 1
    return {
        tool: by_tool_trivial.get(tool, 0) / total
        for tool, total in by_tool_total.items()
    }


def compute_refusal_frac(records: list[dict]) -> float:
    """Fraction of records that are refusals (no tool calls in the last
    assistant message)."""
    if not records:
        return 0.0
    refusal_count = sum(
        1 for record in records if _record_tool_name(record) is None
    )
    return refusal_count / len(records)


# ─── Gate evaluation ───────────────────────────────────────────────────────


def evaluate_gates(
    bucketed: list[tuple[dict, str]],
    records: list[dict],
    config: dict | None = None,
) -> dict[str, Any]:
    """Evaluate all 4 gates and return a report.

    Returns:
        {
          "gate_1_learnable": {"passed": bool, "value": float, "threshold": 0.25},
          "gate_2_trivial_wrong": {"passed": bool, "value": float, "threshold": 0.10},
          "gate_3_per_tool_trivial": {
              "passed": bool,
              "per_tool": {tool: frac},
              "offending_tools": [(tool, frac), ...],
              "threshold": 0.70
          },
          "gate_4_refusal": {
              "passed": bool,
              "value": float,
              "threshold": 0.10,
              "applicable": bool
          }
        }
    """
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    fractions = compute_bucket_fractions(bucketed)
    per_tool_trivial = compute_per_tool_trivial(bucketed)
    refusal_frac = compute_refusal_frac(records)

    learnable_value = fractions["learnable_frac"]
    gate_1 = {
        "passed": learnable_value >= cfg["learnable_frac_min"],
        "value": learnable_value,
        "threshold": cfg["learnable_frac_min"],
    }

    trivial_wrong_value = fractions["trivial_wrong_frac"]
    gate_2 = {
        "passed": trivial_wrong_value <= cfg["trivial_wrong_frac_max"],
        "value": trivial_wrong_value,
        "threshold": cfg["trivial_wrong_frac_max"],
    }

    offending_tools = [
        (tool, frac)
        for tool, frac in per_tool_trivial.items()
        if frac > cfg["per_tool_trivial_max"]
    ]
    gate_3 = {
        "passed": len(offending_tools) == 0,
        "per_tool": per_tool_trivial,
        "offending_tools": offending_tools,
        "threshold": cfg["per_tool_trivial_max"],
    }

    gate_4_applicable = cfg["require_refusal_gate"]
    gate_4 = {
        "passed": (not gate_4_applicable)
        or refusal_frac >= cfg["refusal_frac_min"],
        "value": refusal_frac,
        "threshold": cfg["refusal_frac_min"],
        "applicable": gate_4_applicable,
    }

    return {
        "gate_1_learnable": gate_1,
        "gate_2_trivial_wrong": gate_2,
        "gate_3_per_tool_trivial": gate_3,
        "gate_4_refusal": gate_4,
    }


# ─── Top-level probe ──────────────────────────────────────────────────────


def run_probe(
    records: list[dict],
    rollout_scores: list[list[float]],
    config: dict | None = None,
) -> dict[str, Any]:
    """Run the full probe and return a go/no-go report.

    Args:
        records: training records (OpenAI chat-completion format)
        rollout_scores: per-record list of K rollout scores
        config: optional overrides for gate thresholds

    Returns:
        {
          "decision": "GO" | "NO_GO",
          "total_records": int,
          "bucket_counts": {bucket_name: int},
          "bucket_fractions": {bucket_frac_name: float},
          "gates": {gate_1_learnable: {...}, ...},
          "failing_gates": [gate_name, ...],  # empty if GO
          "message": str  # human-readable summary
        }
    """
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    bucketed = bucket_all_records(
        records,
        rollout_scores,
        wrong_tool_floor=cfg["wrong_tool_floor"],
        pass_threshold=cfg["pass_threshold"],
    )
    bucket_counts: dict[str, int] = {}
    for _, bucket in bucketed:
        bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1

    fractions = compute_bucket_fractions(bucketed)
    gates = evaluate_gates(bucketed, records, cfg)

    failing_gates = [name for name, gate in gates.items() if not gate["passed"]]
    decision = "GO" if not failing_gates else "NO_GO"

    if decision == "GO":
        message = (
            f"GO — all 4 gates passed on {len(records)} records. "
            f"Learnable fraction: {fractions['learnable_frac']:.1%}."
        )
    else:
        reasons = _describe_failures(gates, failing_gates)
        message = (
            f"NO_GO — {len(failing_gates)} of 4 gates failed: " + "; ".join(reasons)
        )

    return {
        "decision": decision,
        "total_records": len(records),
        "bucket_counts": bucket_counts,
        "bucket_fractions": fractions,
        "gates": gates,
        "failing_gates": failing_gates,
        "message": message,
    }


def _describe_failures(gates: dict[str, dict], failing: list[str]) -> list[str]:
    """Human-readable failure reasons for each failing gate."""
    reasons: list[str] = []
    for name in failing:
        gate = gates[name]
        if name == "gate_1_learnable":
            reasons.append(
                f"learnable_frac={gate['value']:.1%} < {gate['threshold']:.0%}"
            )
        elif name == "gate_2_trivial_wrong":
            reasons.append(
                f"trivial_wrong_frac={gate['value']:.1%} > {gate['threshold']:.0%}"
            )
        elif name == "gate_3_per_tool_trivial":
            top = gate["offending_tools"][0] if gate["offending_tools"] else ("?", 0)
            reasons.append(
                f"tool '{top[0]}' is {top[1]:.1%} trivial > {gate['threshold']:.0%}"
            )
        elif name == "gate_4_refusal":
            reasons.append(
                f"refusal_frac={gate['value']:.1%} < {gate['threshold']:.0%} "
                f"(refusal gate required)"
            )
    return reasons


# ─── CLI ───────────────────────────────────────────────────────────────────


def load_jsonl(path: Path) -> list[dict]:
    records: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        records.append(json.loads(line))
    return records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the Stage 6 pre-training probe on extracted training records"
    )
    parser.add_argument(
        "records", type=Path, help="Training records JSONL (from otel_distill.py)"
    )
    parser.add_argument(
        "rollout_scores",
        type=Path,
        help="Rollout scores JSON — a list of K-score lists parallel to records",
    )
    parser.add_argument(
        "--config", type=Path, required=False, help="Optional probe config JSON"
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="Output probe report JSON"
    )
    args = parser.parse_args()

    records = load_jsonl(args.records)
    rollout_scores = json.loads(args.rollout_scores.read_text())
    config = json.loads(args.config.read_text()) if args.config else None

    report = run_probe(records, rollout_scores, config)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    print(report["message"])
    print(f"report → {args.output}")
    return 0 if report["decision"] == "GO" else 3


if __name__ == "__main__":
    sys.exit(main())
