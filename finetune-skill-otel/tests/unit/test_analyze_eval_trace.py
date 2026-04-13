"""
Unit tests for analyze_eval_trace.py — Stage 8.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from analyze_eval_trace import (  # noqa: E402
    REFUSAL_LABEL,
    analyze,
    argument_match_rate,
    confusion_matrix,
    identify_weak_tools,
    overall_grader_mean,
    per_tool_mean,
    refusal_applicable,
    refusal_precision_recall,
    tool_name_accuracy,
)


# ─── Fixture builders ──────────────────────────────────────────────────────


def _result(gt=None, pred=None, score=0.0, gt_args=None, pred_args=None):
    return {
        "gt_tool_name": gt,
        "pred_tool_name": pred,
        "gt_args": gt_args or {},
        "pred_args": pred_args or {},
        "score": score,
    }


# ─── tool_name_accuracy ────────────────────────────────────────────────────


def test_name_accuracy_all_correct():
    results = [_result("search", "search", 1.0) for _ in range(5)]
    assert tool_name_accuracy(results) == 1.0


def test_name_accuracy_half():
    results = [
        _result("search", "search", 1.0),
        _result("search", "buy", 0.02),
    ]
    assert tool_name_accuracy(results) == 0.5


def test_name_accuracy_refusal_match():
    results = [_result(None, None, 1.0), _result("x", "y", 0.02)]
    assert tool_name_accuracy(results) == 0.5


def test_name_accuracy_empty():
    assert tool_name_accuracy([]) == 0.0


# ─── argument_match_rate ───────────────────────────────────────────────────


def test_arg_match_only_counts_right_tool():
    results = [
        _result("search", "search", 1.0),  # right tool, perfect
        _result("search", "search", 0.5),  # right tool, partial
        _result("search", "buy", 0.02),    # wrong tool — excluded
    ]
    assert argument_match_rate(results) == 0.5


def test_arg_match_no_right_tool_subset():
    results = [_result("search", "buy", 0.02)]
    assert argument_match_rate(results) == 0.0


def test_arg_match_refusal_excluded():
    # Refusal records are never "right-tool" since gt_tool_name is None
    results = [_result(None, None, 1.0)]
    assert argument_match_rate(results) == 0.0


# ─── overall_grader_mean ───────────────────────────────────────────────────


def test_overall_mean():
    results = [_result("a", "a", 1.0), _result("a", "b", 0.0)]
    assert overall_grader_mean(results) == 0.5


def test_overall_mean_empty():
    assert overall_grader_mean([]) == 0.0


# ─── per_tool_mean ─────────────────────────────────────────────────────────


def test_per_tool_mean_groups_by_gt():
    results = [
        _result("search", "search", 1.0),
        _result("search", "buy", 0.02),
        _result("buy", "buy", 0.8),
    ]
    means = per_tool_mean(results)
    assert means["search"] == 0.51
    assert means["buy"] == 0.8


def test_per_tool_mean_refusal_bucket():
    results = [_result(None, None, 1.0), _result(None, "x", 0.0)]
    means = per_tool_mean(results)
    assert means[REFUSAL_LABEL] == 0.5


# ─── refusal P/R ───────────────────────────────────────────────────────────


def test_refusal_applicable():
    assert refusal_applicable([_result("a", "a", 1.0)]) is False
    assert refusal_applicable([_result(None, None, 1.0)]) is True


def test_refusal_precision_recall_perfect():
    results = [
        _result(None, None, 1.0),
        _result("search", "search", 1.0),
    ]
    p, r = refusal_precision_recall(results)
    assert p == 1.0 and r == 1.0


def test_refusal_precision_recall_false_positive():
    # Model refused when it shouldn't have
    results = [
        _result(None, None, 1.0),
        _result("search", None, 0.0),  # FP
    ]
    p, r = refusal_precision_recall(results)
    assert p == 0.5
    assert r == 1.0


def test_refusal_precision_recall_false_negative():
    # Model should have refused but called a tool
    results = [
        _result(None, "search", 0.0),  # FN
        _result(None, None, 1.0),      # TP
    ]
    p, r = refusal_precision_recall(results)
    assert p == 1.0
    assert r == 0.5


def test_refusal_no_refusals_returns_zero():
    results = [_result("a", "a", 1.0)]
    p, r = refusal_precision_recall(results)
    assert p == 0.0 and r == 0.0


# ─── confusion_matrix ──────────────────────────────────────────────────────


def test_confusion_matrix_basic():
    results = [
        _result("search", "search", 1.0),
        _result("search", "buy", 0.02),
        _result("buy", "buy", 1.0),
    ]
    matrix = confusion_matrix(results)
    assert matrix["search"]["search"] == 1
    assert matrix["search"]["buy"] == 1
    assert matrix["buy"]["buy"] == 1


def test_confusion_matrix_refusal_rows():
    results = [_result(None, "search", 0.0), _result(None, None, 1.0)]
    matrix = confusion_matrix(results)
    assert matrix[REFUSAL_LABEL]["search"] == 1
    assert matrix[REFUSAL_LABEL][REFUSAL_LABEL] == 1


# ─── identify_weak_tools ───────────────────────────────────────────────────


def test_weak_tool_confused_with_dominant():
    # 'search' is always mispredicted as 'buy' → confused_with:buy
    results = [_result("search", "buy", 0.02) for _ in range(5)]
    weak = identify_weak_tools(results)
    assert len(weak) == 1
    assert weak[0]["tool"] == "search"
    assert weak[0]["diagnosis"] == "confused_with:buy"


def test_weak_tool_scattered():
    # 'search' errors are split across 3 tools, none dominant
    results = [
        _result("search", "a", 0.02),
        _result("search", "b", 0.02),
        _result("search", "c", 0.02),
    ]
    weak = identify_weak_tools(results)
    assert weak[0]["diagnosis"] == "scattered"


def test_weak_tool_name_correct_args_wrong():
    # 'search' is always called correctly by name but args are wrong → low score
    results = [_result("search", "search", 0.3) for _ in range(5)]
    weak = identify_weak_tools(results)
    assert weak[0]["diagnosis"] == "name_correct_args_wrong"


def test_weak_tools_excluded_above_threshold():
    results = [_result("search", "search", 0.9) for _ in range(3)]
    assert identify_weak_tools(results) == []


def test_weak_tools_excludes_refusal():
    # Refusals are not a tool — never weak
    results = [_result(None, "x", 0.0) for _ in range(5)]
    weak = identify_weak_tools(results)
    assert all(w["tool"] != REFUSAL_LABEL for w in weak)


def test_weak_tools_sorted_by_score():
    results = [
        _result("a", "x", 0.1),
        _result("b", "y", 0.3),
    ]
    weak = identify_weak_tools(results)
    assert [w["tool"] for w in weak] == ["a", "b"]


# ─── analyze (top-level) ───────────────────────────────────────────────────


def test_analyze_has_all_sections():
    results = [_result("search", "search", 1.0)]
    report = analyze(results)
    assert report["total_records"] == 1
    assert "tool_name_accuracy" in report["tier_1"]
    assert "confusion_matrix" in report["tier_2"]
    assert "weak_tools" in report["tier_2"]


def test_analyze_threshold_override():
    results = [_result("search", "search", 0.6) for _ in range(3)]
    # Default 0.50 → not weak
    assert analyze(results)["tier_2"]["weak_tools"] == []
    # Stricter 0.70 → weak
    report = analyze(results, weak_tool_threshold=0.70)
    assert len(report["tier_2"]["weak_tools"]) == 1
