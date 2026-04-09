"""
Unit tests for trace_probe_gates.py — Stage 6 pre-training probe.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import pytest  # noqa: E402
from trace_probe_gates import (  # noqa: E402
    DEFAULT_CONFIG,
    bucket_all_records,
    bucket_record,
    compute_bucket_fractions,
    compute_per_tool_trivial,
    compute_refusal_frac,
    evaluate_gates,
    run_probe,
)


# ─── Fixture builders ───────────────────────────────────────────────────────


def _record(tool_name: str | None, args: dict | None = None):
    """Build a minimal record. Pass tool_name=None for a refusal record."""
    if tool_name is None:
        return {
            "messages": [
                {"role": "user", "content": "Do the thing"},
                {"role": "assistant", "content": "I can't help with that."},
            ],
            "tools": [],
        }
    return {
        "messages": [
            {"role": "user", "content": "Do the thing"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "c0",
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(args or {}),
                        },
                    }
                ],
            },
        ],
        "tools": [],
    }


# ─── bucket_record ─────────────────────────────────────────────────────────


def test_bucket_trivial_correct_all_high_scores():
    # All 8 rollouts score well above the pass threshold
    scores = [1.0] * 8
    assert bucket_record(scores) == "trivial_correct"


def test_bucket_trivial_correct_mixed_high():
    # All pass the threshold but at varying scores — still trivial_correct
    scores = [0.6, 0.7, 0.8, 0.9, 1.0, 0.55, 0.75, 0.85]
    assert bucket_record(scores) == "trivial_correct"


def test_bucket_trivial_wrong_all_at_floor():
    # All 8 rollouts at the wrong-tool floor
    scores = [0.02] * 8
    assert bucket_record(scores) == "trivial_wrong"


def test_bucket_trivial_wrong_tolerance():
    # Floor comparison has a small numeric tolerance
    scores = [0.02, 0.0200001, 0.019999999, 0.02, 0.02, 0.02, 0.02, 0.02]
    assert bucket_record(scores) == "trivial_wrong"


def test_bucket_learnable_mixed_pass_fail():
    # Some pass, some fail
    scores = [1.0, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0]
    assert bucket_record(scores) == "learnable"


def test_bucket_learnable_one_out_of_eight():
    scores = [0.02] * 7 + [0.9]
    assert bucket_record(scores) == "learnable"


def test_bucket_impossible_all_fail_with_variance():
    # All fail but with varied low scores — model tried different things
    scores = [0.02, 0.2, 0.02, 0.3, 0.15, 0.02, 0.25, 0.1]
    assert bucket_record(scores) == "impossible"


def test_bucket_empty_scores_is_impossible():
    assert bucket_record([]) == "impossible"


def test_bucket_custom_pass_threshold():
    scores = [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55]
    # With default threshold (0.5): all pass → trivial_correct
    assert bucket_record(scores) == "trivial_correct"
    # With custom threshold (0.6): all fail, none at floor → impossible
    assert bucket_record(scores, pass_threshold=0.6) == "impossible"


# ─── compute_bucket_fractions ──────────────────────────────────────────────


def test_compute_bucket_fractions_empty():
    result = compute_bucket_fractions([])
    assert all(v == 0.0 for v in result.values())


def test_compute_bucket_fractions_counts_correctly():
    bucketed = [
        ({}, "trivial_correct"),
        ({}, "trivial_correct"),
        ({}, "learnable"),
        ({}, "trivial_wrong"),
    ]
    result = compute_bucket_fractions(bucketed)
    assert result["trivial_correct_frac"] == 0.5
    assert result["learnable_frac"] == 0.25
    assert result["trivial_wrong_frac"] == 0.25
    assert result["impossible_frac"] == 0.0


# ─── compute_per_tool_trivial ──────────────────────────────────────────────


def test_compute_per_tool_trivial_single_tool():
    bucketed = [
        (_record("search"), "trivial_correct"),
        (_record("search"), "trivial_correct"),
        (_record("search"), "learnable"),
        (_record("search"), "learnable"),
    ]
    result = compute_per_tool_trivial(bucketed)
    assert result == {"search": 0.5}


def test_compute_per_tool_trivial_multi_tool():
    """Different tools have different trivial fractions."""
    bucketed = [
        # search: 2/2 trivial
        (_record("search"), "trivial_correct"),
        (_record("search"), "trivial_wrong"),
        # compare: 0/2 trivial
        (_record("compare"), "learnable"),
        (_record("compare"), "learnable"),
    ]
    result = compute_per_tool_trivial(bucketed)
    assert result["search"] == 1.0
    assert result["compare"] == 0.0


def test_compute_per_tool_trivial_excludes_refusals():
    """Refusal records (no tool name) are excluded from per-tool counts."""
    bucketed = [
        (_record("search"), "trivial_correct"),
        (_record(None), "learnable"),  # refusal — excluded
        (_record(None), "trivial_wrong"),  # refusal — excluded
    ]
    result = compute_per_tool_trivial(bucketed)
    assert result == {"search": 1.0}


# ─── compute_refusal_frac ──────────────────────────────────────────────────


def test_refusal_frac_empty_records():
    assert compute_refusal_frac([]) == 0.0


def test_refusal_frac_all_with_tools():
    records = [_record("search"), _record("compare")]
    assert compute_refusal_frac(records) == 0.0


def test_refusal_frac_mixed():
    records = [
        _record("search"),
        _record(None),
        _record(None),
        _record("compare"),
    ]
    assert compute_refusal_frac(records) == 0.5


# ─── evaluate_gates ────────────────────────────────────────────────────────


def test_gate_1_learnable_passes_at_threshold():
    # 3 of 10 learnable = 30% ≥ 25% threshold → pass
    bucketed = [
        *([(_record("search"), "learnable")] * 3),
        *([(_record("search"), "trivial_correct")] * 7),
    ]
    records = [r for r, _ in bucketed]
    gates = evaluate_gates(bucketed, records)
    assert gates["gate_1_learnable"]["passed"] is True
    assert gates["gate_1_learnable"]["value"] == 0.3


def test_gate_1_learnable_fails_below_threshold():
    # 1 of 10 learnable = 10% < 25% threshold → fail
    bucketed = [
        (_record("search"), "learnable"),
        *([(_record("search"), "trivial_correct")] * 9),
    ]
    records = [r for r, _ in bucketed]
    gates = evaluate_gates(bucketed, records)
    assert gates["gate_1_learnable"]["passed"] is False


def test_gate_2_trivial_wrong_fails_above_threshold():
    # 2 of 10 trivial_wrong = 20% > 10% threshold → fail
    bucketed = [
        *([(_record("search"), "trivial_wrong")] * 2),
        *([(_record("search"), "learnable")] * 8),
    ]
    records = [r for r, _ in bucketed]
    gates = evaluate_gates(bucketed, records)
    assert gates["gate_2_trivial_wrong"]["passed"] is False


def test_gate_2_trivial_wrong_passes_at_threshold():
    # 1 of 10 trivial_wrong = 10% ≤ 10% threshold → pass
    bucketed = [
        (_record("search"), "trivial_wrong"),
        *([(_record("search"), "learnable")] * 9),
    ]
    records = [r for r, _ in bucketed]
    gates = evaluate_gates(bucketed, records)
    assert gates["gate_2_trivial_wrong"]["passed"] is True


def test_gate_3_per_tool_trivial_fails_on_dominant_tool():
    """One tool has 100% trivial records → fails the gate."""
    bucketed = [
        # search: 5/5 trivial → 100% > 70% threshold
        *([(_record("search"), "trivial_correct")] * 5),
        # compare: 0/5 trivial
        *([(_record("compare"), "learnable")] * 5),
    ]
    records = [r for r, _ in bucketed]
    gates = evaluate_gates(bucketed, records)
    assert gates["gate_3_per_tool_trivial"]["passed"] is False
    offenders = gates["gate_3_per_tool_trivial"]["offending_tools"]
    assert len(offenders) == 1
    assert offenders[0][0] == "search"


def test_gate_3_per_tool_trivial_passes_when_all_mixed():
    bucketed = [
        *([(_record("search"), "learnable")] * 5),
        *([(_record("compare"), "learnable")] * 5),
    ]
    records = [r for r, _ in bucketed]
    gates = evaluate_gates(bucketed, records)
    assert gates["gate_3_per_tool_trivial"]["passed"] is True
    assert gates["gate_3_per_tool_trivial"]["offending_tools"] == []


def test_gate_4_refusal_not_applicable_by_default():
    """By default, the refusal gate is not required."""
    records = [_record("search")] * 10
    bucketed = [(r, "learnable") for r in records]
    gates = evaluate_gates(bucketed, records)
    assert gates["gate_4_refusal"]["applicable"] is False
    assert gates["gate_4_refusal"]["passed"] is True  # passes by default


def test_gate_4_refusal_fails_when_required_and_too_few():
    """When refusal is required, <10% refusals fails the gate."""
    records = [_record("search")] * 10  # 0% refusals
    bucketed = [(r, "learnable") for r in records]
    gates = evaluate_gates(
        bucketed, records, config={"require_refusal_gate": True}
    )
    assert gates["gate_4_refusal"]["applicable"] is True
    assert gates["gate_4_refusal"]["passed"] is False


def test_gate_4_refusal_passes_when_required_and_enough():
    """When refusal is required, ≥10% refusals passes the gate."""
    records = [
        *([_record("search")] * 8),
        *([_record(None)] * 2),  # 20% refusals
    ]
    bucketed = [(r, "learnable") for r in records]
    gates = evaluate_gates(
        bucketed, records, config={"require_refusal_gate": True}
    )
    assert gates["gate_4_refusal"]["passed"] is True


# ─── run_probe (top-level) ─────────────────────────────────────────────────


def test_run_probe_go_decision():
    """A healthy dataset with good mix of learnable records → GO."""
    # 5 learnable, 2 trivial_correct, 1 trivial_wrong, 2 impossible
    # learnable = 5/10 = 50% ≥ 25% ✓
    # trivial_wrong = 1/10 = 10% ≤ 10% ✓
    records = [_record("search")] * 10
    rollout_scores = [
        # 5 learnable (mixed scores)
        [1.0, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0],
        [1.0, 0.5, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0],  # some at 0.5 (not passing)
        [0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1],
        [1.0, 1.0, 0.02, 0.02, 1.0, 1.0, 0.02, 0.02],
        [1.0] * 4 + [0.02] * 4,
        # 2 trivial_correct
        [1.0] * 8,
        [0.9] * 8,
        # 1 trivial_wrong
        [0.02] * 8,
        # 2 impossible (varied low)
        [0.1, 0.2, 0.3, 0.15, 0.25, 0.1, 0.2, 0.15],
        [0.05, 0.1, 0.15, 0.2, 0.1, 0.05, 0.15, 0.1],
    ]
    # BUT we need per-tool trivial < 70% — 3/10 is 30% ✓
    report = run_probe(records, rollout_scores)
    assert report["decision"] == "GO", f"Expected GO but got {report['message']}"
    assert report["failing_gates"] == []
    assert report["bucket_counts"]["learnable"] == 5
    assert report["bucket_counts"]["trivial_correct"] == 2
    assert report["bucket_counts"]["trivial_wrong"] == 1
    assert report["bucket_counts"]["impossible"] == 2


def test_run_probe_no_go_too_few_learnable():
    """Insufficient learnable fraction → NO_GO."""
    records = [_record("search")] * 10
    # Mostly trivial_correct, only 1 learnable
    rollout_scores = [
        [1.0, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0],  # learnable
        *([[1.0] * 8] * 9),  # all trivial_correct
    ]
    report = run_probe(records, rollout_scores)
    # learnable_frac = 1/10 = 10% < 25% → fails gate 1
    # per-tool trivial = 9/10 = 90% > 70% → fails gate 3
    # Both gates should fail
    assert report["decision"] == "NO_GO"
    assert "gate_1_learnable" in report["failing_gates"]
    assert "gate_3_per_tool_trivial" in report["failing_gates"]


def test_run_probe_no_go_too_many_trivial_wrong():
    """Too many records stuck at wrong-tool floor → NO_GO."""
    records = [_record("search")] * 10
    rollout_scores = [
        *([[0.02] * 8] * 3),  # 30% trivial_wrong
        *([[1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02]] * 7),  # 70% learnable
    ]
    report = run_probe(records, rollout_scores)
    assert report["decision"] == "NO_GO"
    assert "gate_2_trivial_wrong" in report["failing_gates"]


def test_run_probe_message_describes_failures():
    records = [_record("search")] * 10
    rollout_scores = [[1.0] * 8] * 10  # all trivial_correct
    report = run_probe(records, rollout_scores)
    assert report["decision"] == "NO_GO"
    assert "learnable_frac" in report["message"]
    assert "0.0%" in report["message"] or "10%" in report["message"] or "25%" in report["message"]


def test_run_probe_length_mismatch_raises():
    records = [_record("search")] * 3
    rollout_scores = [[1.0] * 8] * 2  # only 2 score lists for 3 records
    with pytest.raises(ValueError, match="must have the same length"):
        run_probe(records, rollout_scores)


def test_run_probe_with_custom_config():
    """Config overrides threshold — record set that passes with default fails with stricter."""
    records = [_record("search")] * 10
    rollout_scores = [
        # 3 learnable
        *([[1.0, 0.02] * 4] * 3),
        # 7 trivial_correct
        *([[1.0] * 8] * 7),
    ]
    # Default: gate_1 threshold 0.25, trivial learnable 3/10 = 30% → pass
    # but per-tool trivial = 7/10 = 70% → at threshold, still passes
    report_default = run_probe(records, rollout_scores)
    # With stricter learnable threshold
    report_strict = run_probe(
        records, rollout_scores, config={"learnable_frac_min": 0.5}
    )
    assert report_strict["decision"] == "NO_GO"
    assert "gate_1_learnable" in report_strict["failing_gates"]
