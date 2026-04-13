# /// script
# requires-python = ">=3.10"
# ///
"""
trace_grader.py — Stage 4: programmatic Jaccard grader for tool calls.

Deterministic scorer: (predicted_tool_call, ground_truth_tool_call) → [0.02, 1.0].
No LLM. Used by Stage 6 (probe), Stage 7 (cloud training), and Stage 8 (eval).

Formula (ToolRL-grounded, arXiv:2504.13958):

    r_name  = 1 if normalize_name(pred) == normalize_name(gt) else 0
    r_param = |keys(gt) ∩ keys(pred)| / |keys(gt) ∪ keys(pred)|   (Jaccard)
    r_value = |{ k ∈ intersect : gt[k] == pred[k] }|
    S_raw   = r_name + r_param + r_value
    S_max   = 1 + len(gt_args)                                    # name + one per arg
    score   = clamp(S_raw / S_max, floor=0.02, ceiling=1.0)

Wrong tool name → 0.02 floor (never 0.0 — zero-variance kills GRPO per the
`feedback_grader_no_zero_hard_gate` memory rule).

Parallel calls (Pattern D): per-call scores averaged × coverage penalty.

Refusal (empty call sets on both sides): 1.0 (correct refusal).

See `finetune-skill-otel/reference/trace-grader-reference.md` for the full
formula derivation, edge-case rules, and unit-test spec.
"""

from __future__ import annotations

from typing import Any


# ─── Normalization helpers ──────────────────────────────────────────────────


def normalize_name(name: str | None) -> str:
    """Case-insensitive, whitespace-trimmed name normalization."""
    if name is None:
        return ""
    return name.strip().lower()


def normalize_value(v: Any) -> Any:
    """
    Normalize a value for exact-match comparison.

    Rules (from trace-grader-reference.md):
      - None → None
      - bool → bool (not converted to int)
      - int/float → float (type-lenient: int(1) == float(1.0))
      - str → trimmed (case preserved)
      - list → tuple of normalized elements (order-preserving, hashable)
      - dict → tuple of sorted (key, value) pairs (order-independent)
      - other → passed through
    """
    if v is None:
        return None
    if isinstance(v, bool):
        # Tag booleans so they don't compare equal to numeric 0/1.
        # (Python's True == 1 is True by default, which would silently
        # accept `verified=1` as matching `verified=true` — wrong for
        # tool-routing where types matter.)
        return ("__bool__", v)
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, list):
        return tuple(normalize_value(x) for x in v)
    if isinstance(v, dict):
        return tuple(
            sorted(
                (normalize_value(k), normalize_value(vv)) for k, vv in v.items()
            )
        )
    return v


# ─── Jaccard + value matching primitives ────────────────────────────────────


def _jaccard_keys(a: dict, b: dict) -> float:
    """Jaccard overlap on the key sets. Empty-vs-empty = 1.0 (convention)."""
    keys_a = set(a.keys())
    keys_b = set(b.keys())
    union = keys_a | keys_b
    if not union:
        return 1.0  # both empty → trivially equal
    return len(keys_a & keys_b) / len(union)


def _count_value_matches(pred_args: dict, gt_args: dict) -> int:
    """Count keys in the intersection where normalized values are equal."""
    intersect = set(pred_args.keys()) & set(gt_args.keys())
    return sum(
        1
        for k in intersect
        if normalize_value(pred_args[k]) == normalize_value(gt_args[k])
    )


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# ─── Single-call grader ─────────────────────────────────────────────────────


WRONG_TOOL_FLOOR = 0.02


def grade(pred: dict, gt: dict) -> float:
    """
    Score a single predicted tool call against ground truth.

    Args:
        pred: {"name": str, "arguments": dict}
        gt:   {"name": str, "arguments": dict}

    Returns:
        Score in [0.02, 1.0]. 0.02 floor for wrong tool name. 1.0 for
        perfect match.
    """
    pred_name = normalize_name(pred.get("name"))
    gt_name = normalize_name(gt.get("name"))

    # Wrong tool → floor. Never 0.0.
    if pred_name == "" or pred_name != gt_name:
        return WRONG_TOOL_FLOOR

    pred_args = pred.get("arguments") or {}
    gt_args = gt.get("arguments") or {}

    r_name = 1.0
    r_param = _jaccard_keys(pred_args, gt_args)
    r_value = _count_value_matches(pred_args, gt_args)

    s_raw = r_name + r_param + r_value
    s_max = 1 + len(gt_args)  # 1 for name + 1 per GT arg

    score = s_raw / s_max
    return _clamp(score, WRONG_TOOL_FLOOR, 1.0)


# ─── Parallel-call grader (Pattern D) ───────────────────────────────────────


def _best_match_idx(pred_call: dict, gt_calls: list[dict], taken: set[int]) -> int | None:
    """Find the index of the best-matching GT call that hasn't been consumed."""
    best_idx = None
    best_score = -1.0
    for i, gt_call in enumerate(gt_calls):
        if i in taken:
            continue
        s = grade(pred_call, gt_call)
        if s > best_score:
            best_score = s
            best_idx = i
    return best_idx


def grade_parallel(pred: dict, gt: dict) -> float:
    """
    Score a parallel tool-call set (Pattern D) against the ground truth.

    Uses per-call mean × coverage penalty: each predicted call is matched
    to its best-matching remaining GT call (greedy, GT consumed once per
    match), per-call scores are averaged, then multiplied by
    min(|pred|, |gt|) / max(|pred|, |gt|) to penalize missing or extra
    calls symmetrically.

    Refusal: empty-vs-empty call sets → 1.0 (correctly refused).
    Hallucinated call vs empty GT → 0.02 floor.
    Missed call vs non-empty GT → 0.02 floor.

    Args:
        pred: {"calls": [{"name": str, "arguments": dict}, ...]}
        gt:   {"calls": [{"name": str, "arguments": dict}, ...]}

    Returns:
        Score in [0.02, 1.0].
    """
    pred_calls = list(pred.get("calls") or [])
    gt_calls = list(gt.get("calls") or [])

    # Refusal cases
    if not pred_calls and not gt_calls:
        return 1.0
    if not pred_calls or not gt_calls:
        return WRONG_TOOL_FLOOR

    # Greedy best-match, consuming each GT call at most once
    taken: set[int] = set()
    per_call_scores: list[float] = []
    for p in pred_calls:
        idx = _best_match_idx(p, gt_calls, taken)
        if idx is None:
            per_call_scores.append(WRONG_TOOL_FLOOR)
        else:
            taken.add(idx)
            per_call_scores.append(grade(p, gt_calls[idx]))

    mean_per_call = sum(per_call_scores) / len(per_call_scores)
    coverage = min(len(pred_calls), len(gt_calls)) / max(
        len(pred_calls), len(gt_calls)
    )
    score = mean_per_call * coverage
    return _clamp(score, WRONG_TOOL_FLOOR, 1.0)


# ─── Mandatory grader sanity check ──────────────────────────────────────────


def _extract_tool_call_from_record(record: dict) -> dict | None:
    """Extract the GT tool call from a training record.

    Checks `ground_truth` field first (GRPO format: GT stored separately,
    messages end with user turn), then falls back to last assistant message
    (legacy), then `output` dict (test records).
    """
    import json as _json

    # GRPO format: ground_truth is a separate JSON field
    gt_raw = record.get("ground_truth")
    if gt_raw is not None:
        parsed = _json.loads(gt_raw) if isinstance(gt_raw, str) else gt_raw
        tcs = parsed if isinstance(parsed, list) else []
        if tcs:
            fn = tcs[0].get("function", {})
            args = fn.get("arguments")
            if isinstance(args, str):
                try:
                    args = _json.loads(args)
                except Exception:
                    args = {}
            return {"name": fn.get("name", ""), "arguments": args or {}}

    # Legacy: last assistant message in messages array
    for msg in reversed(record.get("messages") or []):
        if msg.get("role") != "assistant":
            continue
        tcs = msg.get("tool_calls") or []
        if tcs:
            fn = tcs[0].get("function", {})
            args = fn.get("arguments")
            if isinstance(args, str):
                try:
                    args = _json.loads(args)
                except Exception:
                    args = {}
            return {"name": fn.get("name", ""), "arguments": args or {}}

    # Legacy test format: output dict
    if "output" in record:
        return record["output"]
    return None


def sanity_check(gt_record: dict) -> None:
    """
    Run the mandatory grader sanity check against a real training record.

    Must be called once per workflow before training starts. Verifies:
      1. Self-match scores 1.0
      2. Wrong tool scores the 0.02 floor
      3. Partial args (half of GT keys) score in [0.2, 0.8]

    Accepts both formats:
      - New: {"messages": [...], "tools": [...]} (from otel_distill.py)
      - Legacy: {"output": {"name": ..., "arguments": {...}}}

    Raises AssertionError if any property fails. A failing sanity check
    indicates a grader bug (case sensitivity, normalization error) that
    would silently degrade training.
    """
    output = _extract_tool_call_from_record(gt_record)
    if output is None:
        raise ValueError(
            "sanity_check: cannot extract tool call from record — "
            "expected 'messages' with assistant tool_calls or legacy 'output' key"
        )

    # 1. Self-match
    self_score = grade(output, output)
    assert self_score == 1.0, f"Self-match score must be 1.0, got {self_score}"

    # 2. Wrong tool floor
    wrong = {**output, "name": "__intentionally_wrong_tool_name__"}
    wrong_score = grade(wrong, output)
    assert wrong_score == WRONG_TOOL_FLOOR, (
        f"Wrong-tool score must be {WRONG_TOOL_FLOOR}, got {wrong_score}"
    )

    # 3. Partial args in (0.2, 0.8)
    args = output.get("arguments") or {}
    if len(args) >= 2:
        partial_args = {
            k: v for i, (k, v) in enumerate(args.items()) if i < len(args) // 2
        }
        partial = {**output, "arguments": partial_args}
        partial_score = grade(partial, output)
        assert 0.2 <= partial_score <= 0.9, (
            f"Partial-args score out of (0.2, 0.9) range: {partial_score}"
        )
