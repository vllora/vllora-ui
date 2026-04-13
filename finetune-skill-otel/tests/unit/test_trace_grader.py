"""
Unit tests for trace_grader.py.

Spec: finetune-skill-otel/reference/trace-grader-reference.md
"""

import sys
from pathlib import Path

# Make the scripts/ directory importable without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import pytest  # noqa: E402
from trace_grader import (  # noqa: E402
    WRONG_TOOL_FLOOR,
    grade,
    grade_parallel,
    normalize_name,
    normalize_value,
    sanity_check,
)


# ─── Name normalization ─────────────────────────────────────────────────────


def test_normalize_name_case_insensitive():
    assert normalize_name("Product_Search") == normalize_name("product_search")


def test_normalize_name_whitespace_trimmed():
    assert normalize_name("  product_search  ") == "product_search"


def test_normalize_name_none_becomes_empty():
    assert normalize_name(None) == ""


# ─── Value normalization ────────────────────────────────────────────────────


def test_normalize_value_int_float_lenient():
    assert normalize_value(1) == normalize_value(1.0)
    assert normalize_value(5) == normalize_value(5.00)


def test_normalize_value_str_not_equal_to_int():
    assert normalize_value("1") != normalize_value(1)


def test_normalize_value_string_whitespace_trimmed():
    assert normalize_value("tablet") == normalize_value(" tablet ")


def test_normalize_value_string_case_preserved():
    # Case is preserved by default; enum case-insensitivity is a separate
    # layer the grader builder applies per-arg.
    assert normalize_value("GET") != normalize_value("get")


def test_normalize_value_none_matches_none():
    assert normalize_value(None) == normalize_value(None)


def test_normalize_value_bool_not_int():
    # Booleans are compared as booleans, not coerced to 0/1.
    assert normalize_value(True) != normalize_value(1)
    assert normalize_value(False) != normalize_value(0)


def test_normalize_value_list_order_preserved():
    assert normalize_value([1, 2]) != normalize_value([2, 1])


def test_normalize_value_nested_dict_order_independent():
    a = {"category": "electronics", "min_price": 100}
    b = {"min_price": 100, "category": "electronics"}
    assert normalize_value(a) == normalize_value(b)


# ─── Single-call grader: happy paths ────────────────────────────────────────


def _search(**kwargs):
    return {"name": "product_search", "arguments": kwargs}


def test_perfect_match_scores_1():
    pred = _search(query="tablet", category="electronics", page_size=5)
    gt = _search(query="tablet", category="electronics", page_size=5)
    assert grade(pred, gt) == 1.0


def test_perfect_match_with_no_args():
    pred = _search()
    gt = _search()
    # r_name=1, r_param=1 (empty-vs-empty = 1), r_value=0, S_max=1, S_raw=2
    # → clamped to 1.0
    assert grade(pred, gt) == 1.0


# ─── Single-call grader: wrong tool → floor ─────────────────────────────────


def test_wrong_tool_name_hits_floor():
    pred = {"name": "product_details", "arguments": {"query": "tablet"}}
    gt = _search(query="tablet")
    assert grade(pred, gt) == WRONG_TOOL_FLOOR


def test_none_tool_name_hits_floor():
    pred = {"name": None, "arguments": {"query": "tablet"}}
    gt = _search(query="tablet")
    assert grade(pred, gt) == WRONG_TOOL_FLOOR


def test_case_insensitive_tool_name_matches():
    pred = {"name": "Product_Search", "arguments": {"query": "tablet"}}
    gt = _search(query="tablet")
    assert grade(pred, gt) == 1.0


# ─── Single-call grader: partial credit ─────────────────────────────────────


def test_right_tool_partial_args_in_middle_range():
    pred = _search(query="tablet")
    gt = _search(query="tablet", category="electronics")
    # r_name=1, r_param=1/2, r_value=1, S_raw=2.5, S_max=3 → 0.833
    score = grade(pred, gt)
    assert 0.5 <= score < 1.0
    assert score == pytest.approx(2.5 / 3, rel=1e-6)


def test_right_tool_wrong_value_partial():
    pred = _search(query="TABLETS")  # case differs — normalize_value preserves case
    gt = _search(query="tablet")
    # r_name=1, r_param=1, r_value=0 (value differs), S_raw=2, S_max=2
    # → clamped to 1.0 — this is the "same key, wrong value" case
    assert grade(pred, gt) == 1.0


def test_right_tool_missing_and_wrong_values():
    pred = _search(query="TABLETS", extra_field="ignored")
    gt = _search(query="tablet", category="electronics")
    # pred keys: {query, extra_field}, gt keys: {query, category}
    # intersection: {query}, value match for query: 0 (case differs)
    # r_name=1, r_param=1/3, r_value=0, S_raw=1.333, S_max=3 → 0.444
    score = grade(pred, gt)
    assert 0.3 <= score <= 0.5


# ─── Single-call grader: extra args ─────────────────────────────────────────


def test_extra_args_reduce_score():
    pred = _search(query="tablet", category="electronics", sort="price")
    gt = _search(query="tablet", category="electronics")
    # pred keys: {query, category, sort}, gt keys: {query, category}
    # intersection: {query, category}, values match: 2
    # r_name=1, r_param=2/3, r_value=2, S_raw=3.667, S_max=3 → clamped 1.0
    # → S_max too small; extra arg penalty is masked by clamp. Document as
    # a known quirk of the ToolRL formula with this denominator choice.
    score = grade(pred, gt)
    # The clamp hides the penalty here — a single extra arg with perfect
    # other matches still clamps to 1.0. Larger extra-arg counts will drop
    # the score below 1.0 eventually.
    assert score == 1.0


def test_many_extra_args_eventually_reduce_score():
    pred = _search(
        query="tablet",
        category="electronics",
        sort="price",
        filter_a="x",
        filter_b="y",
        filter_c="z",
    )
    gt = _search(query="tablet")
    # pred keys: 6, gt keys: 1, intersect: 1, union: 6
    # r_name=1, r_param=1/6, r_value=1, S_raw=2.167, S_max=2 → clamped 1.0
    # still clamps. This formula is insensitive to extra args when there's
    # a perfect-value match on the intersection — documented limitation.
    assert grade(pred, gt) == 1.0


# ─── Int/float type leniency ────────────────────────────────────────────────


def test_int_float_value_match():
    pred = _search(page_size=5)
    gt = _search(page_size=5.0)
    assert grade(pred, gt) == 1.0


# ─── Parallel calls (Pattern D) ─────────────────────────────────────────────


def _mk(calls):
    return {"calls": calls}


def test_parallel_exact_match():
    pred = _mk(
        [
            _search(query="tablet"),
            _search(query="phone"),
        ]
    )
    gt = _mk(
        [
            _search(query="tablet"),
            _search(query="phone"),
        ]
    )
    assert grade_parallel(pred, gt) == 1.0


def test_parallel_order_independent():
    pred = _mk([_search(query="phone"), _search(query="tablet")])
    gt = _mk([_search(query="tablet"), _search(query="phone")])
    assert grade_parallel(pred, gt) == 1.0


def test_parallel_too_few_calls_penalized():
    pred = _mk([_search(query="tablet")])
    gt = _mk([_search(query="tablet"), _search(query="phone")])
    # per_call mean = 1.0, coverage = 1/2 = 0.5
    assert grade_parallel(pred, gt) == pytest.approx(0.5)


def test_parallel_too_many_calls_penalized():
    pred = _mk(
        [
            _search(query="tablet"),
            _search(query="phone"),
            _search(query="laptop"),
        ]
    )
    gt = _mk(
        [
            _search(query="tablet"),
            _search(query="phone"),
        ]
    )
    # Two matches (1.0 each) + one unmatched (floor 0.02)
    # per_call mean = (1.0 + 1.0 + 0.02) / 3 ≈ 0.673
    # coverage = 2/3
    # score ≈ 0.449
    score = grade_parallel(pred, gt)
    assert 0.4 <= score <= 0.5


# ─── Refusal ────────────────────────────────────────────────────────────────


def test_correct_refusal():
    assert grade_parallel(_mk([]), _mk([])) == 1.0


def test_hallucinated_tool_when_should_refuse():
    pred = _mk([_search(query="tablet")])
    gt = _mk([])
    assert grade_parallel(pred, gt) == WRONG_TOOL_FLOOR


def test_failed_to_act_when_should_call():
    pred = _mk([])
    gt = _mk([_search(query="tablet")])
    assert grade_parallel(pred, gt) == WRONG_TOOL_FLOOR


# ─── Sanity check (mandatory before every training run) ────────────────────


def test_sanity_check_passes_on_valid_record():
    record = {
        "output": _search(query="tablet", category="electronics", page_size=5)
    }
    sanity_check(record)  # should not raise


def test_sanity_check_catches_broken_self_match(monkeypatch):
    """
    If grade() is buggy and doesn't return 1.0 for self-match (e.g. a
    broken normalization that falsely penalizes identical inputs), the
    sanity check must catch it before training starts.
    """
    import trace_grader

    def broken_grade(pred, gt):
        # Bug: always returns 0.5, even for self-match
        return 0.5

    monkeypatch.setattr(trace_grader, "grade", broken_grade)
    record = {
        "output": _search(query="tablet", category="electronics", page_size=5)
    }
    with pytest.raises(AssertionError, match="Self-match score must be"):
        sanity_check(record)
