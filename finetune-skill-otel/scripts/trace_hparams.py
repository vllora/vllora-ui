# /// script
# requires-python = ">=3.10"
# ///
"""
trace_hparams.py — Stage 7: build the trace-specific training config
override payload for the cloud handoff.

Most of the PDF pipeline's GRPO hyperparameters carry over unchanged.
This script applies three verified trace-routing deltas on top of the
PDF defaults, plus two conditional escalations based on the Stage 6
probe report:

Verified deltas (always applied to trace workflows):
  - temperature:            0.9 → 1.0     (ToolRL, arXiv:2504.13958)
  - max_output_tokens:      GT P95 × 1.5 → GT P95 × 1.3   (Bespoke Labs)
  - num_generations:        8             (same as PDF default)
  - learning_rate:          1e-6          (same)
  - loss_type:              dr_grpo       (same)
  - beta:                   0             (same, conditional escalation below)
  - epsilon, epsilon_high:  (3e-4, 4e-4)  (same)

Conditional escalations:
  - num_generations → 4 if `high_zero_variance=True` in the input
    (frac_reward_zero_std > 50% observed at probe step 50) — ToolRL/IRC
    both use K=4
  - beta → 0.001 and reference-model-refresh → every 100 steps if
    `length_blowup_observed=True` — Bespoke Labs finding

Other fields carry over from the PDF defaults and should be filled in
by the cloud handoff client using the PDF pipeline's defaults source.
This script only produces the *delta* subset (plus a copy of the
unchanged parameters for clarity).

GT token length estimation uses a rough `len(json_string) / 4`
heuristic — conservative enough for a cap, avoids a tiktoken dependency.
Callers who need exact token counts should override `max_output_tokens`
directly via `overrides`.

Usage:
    python3 trace_hparams.py training.jsonl --output training_config.json

    # With a probe report to trigger conditional escalations:
    python3 trace_hparams.py training.jsonl \\
        --probe-report probe.json \\
        --output training_config.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


# ─── PDF pipeline defaults (same as finetune-skill/) ───────────────────────

PDF_DEFAULTS: dict[str, Any] = {
    "learning_rate": 1e-6,
    "loss_type": "dr_grpo",
    "beta": 0,
    "num_generations": 8,
    "temperature": 0.9,
    "epsilon": 3e-4,
    "epsilon_high": 4e-4,
    "mask_truncated_completions": True,
    "importance_sampling_level": "sequence",
    # The PDF pipeline auto-tunes max_output_tokens to GT_P95 × 1.5.
    # We override the multiplier below.
}

# ─── Trace-specific delta (always applied) ─────────────────────────────────

TRACE_DELTAS: dict[str, Any] = {
    "temperature": 1.0,  # ToolRL: broader exploration on smaller output space
    # max_output_tokens computed per-workflow from GT P95 × 1.3
}

TRACE_MAX_OUTPUT_TOKENS_MULTIPLIER = 1.3
TRACE_MAX_OUTPUT_TOKENS_FLOOR = 128  # don't go below this regardless of P95
TRACE_MAX_OUTPUT_TOKENS_CEILING = 2048  # defense against pathologically long GT


# ─── Token length estimation ───────────────────────────────────────────────


def _record_output_token_estimate(record: dict) -> int:
    """Rough token estimate for the assistant's tool_call output.

    Serializes the last assistant message's tool_calls as JSON and
    divides length by 4 (approximate chars-per-token for JSON text).
    Returns 0 for refusal records (no tool_calls).
    """
    messages = record.get("messages") or []
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return 0
        try:
            serialized = json.dumps(tool_calls, ensure_ascii=False)
        except (TypeError, ValueError):
            return 0
        return max(1, len(serialized) // 4)
    return 0


def compute_gt_token_lengths(records: list[dict]) -> list[int]:
    """Return the list of token-length estimates across all records.

    Refusal records (output token count = 0) are excluded to avoid
    dragging the P95 down.
    """
    lengths = [_record_output_token_estimate(r) for r in records]
    return [n for n in lengths if n > 0]


def _percentile(values: list[int], pct: float) -> int:
    """Nearest-rank percentile (0 ≤ pct ≤ 1). Returns 0 for empty input."""
    if not values:
        return 0
    sorted_vals = sorted(values)
    idx = max(0, min(len(sorted_vals) - 1, int(round(pct * (len(sorted_vals) - 1)))))
    return sorted_vals[idx]


def compute_max_output_tokens(
    records: list[dict],
    multiplier: float = TRACE_MAX_OUTPUT_TOKENS_MULTIPLIER,
    floor: int = TRACE_MAX_OUTPUT_TOKENS_FLOOR,
    ceiling: int = TRACE_MAX_OUTPUT_TOKENS_CEILING,
) -> int:
    """Compute `max_output_tokens` from GT P95 × multiplier, clamped.

    Tool-routing outputs are short JSON tool calls — the default PDF
    multiplier of 1.5 is too loose and invites length blowup. Bespoke
    Labs' finding motivates the tighter 1.3 multiplier here.
    """
    lengths = compute_gt_token_lengths(records)
    if not lengths:
        return floor  # no usable records — use a safe default
    p95 = _percentile(lengths, 0.95)
    return max(floor, min(ceiling, int(p95 * multiplier)))


# ─── Config builder ─────────────────────────────────────────────────────────


def build_training_config(
    records: list[dict],
    *,
    high_zero_variance: bool = False,
    length_blowup_observed: bool = False,
    overrides: dict | None = None,
) -> dict[str, Any]:
    """Build the trace-specific training config for the cloud handoff.

    Args:
        records: extracted training records (for GT P95 computation)
        high_zero_variance: if True, drop `num_generations` from 8 to 4
            (ToolRL/IRC precedent when frac_reward_zero_std > 50%)
        length_blowup_observed: if True, enable `beta=0.001` and
            `ref_model_refresh_steps=100` (Bespoke Labs escalation)
        overrides: caller-supplied overrides merged last (takes
            precedence over computed values)

    Returns the config dict ready to be embedded in the Stage 7 handoff
    payload under the `training_config` key.
    """
    config = {**PDF_DEFAULTS, **TRACE_DELTAS}

    config["max_output_tokens"] = compute_max_output_tokens(records)

    # Conditional escalations
    if high_zero_variance:
        config["num_generations"] = 4
        config["_trace_override_reason_num_generations"] = (
            "frac_reward_zero_std > 50% at probe — ToolRL/IRC use K=4"
        )
    if length_blowup_observed:
        config["beta"] = 0.001
        config["ref_model_refresh_steps"] = 100
        config["_trace_override_reason_beta"] = (
            "length blowup observed — Bespoke Labs β=0.001 + ref refresh"
        )

    if overrides:
        config.update(overrides)

    return config


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
        description="Build the trace-specific training config for the cloud handoff"
    )
    parser.add_argument(
        "records", type=Path, help="Training records JSONL (from otel_distill.py)"
    )
    parser.add_argument(
        "--probe-report",
        type=Path,
        required=False,
        help="Optional probe report (from trace_probe_gates.py) for conditional escalations",
    )
    parser.add_argument(
        "--length-blowup",
        action="store_true",
        help="Force enable β=0.001 + ref refresh (use if prior training run showed length blowup)",
    )
    parser.add_argument("--output", type=Path, required=True, help="Output training_config.json")
    args = parser.parse_args()

    if not args.records.exists():
        print(f"error: records not found: {args.records}", file=sys.stderr)
        return 2

    records = load_jsonl(args.records)

    high_zero_variance = False
    if args.probe_report and args.probe_report.exists():
        report = json.loads(args.probe_report.read_text())
        # Trigger K=4 if the probe would have failed on zero-variance —
        # i.e. if the sum of trivial_correct + trivial_wrong fractions
        # exceeds 50%. This is the v1 proxy for "too much dead weight
        # at K=8, drop to K=4".
        fractions = report.get("bucket_fractions", {})
        zero_variance_frac = (
            fractions.get("trivial_correct_frac", 0)
            + fractions.get("trivial_wrong_frac", 0)
        )
        if zero_variance_frac > 0.5:
            high_zero_variance = True

    config = build_training_config(
        records,
        high_zero_variance=high_zero_variance,
        length_blowup_observed=args.length_blowup,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(config, indent=2, ensure_ascii=False))

    print(
        f"wrote training config → {args.output} "
        f"(num_generations={config['num_generations']}, "
        f"temperature={config['temperature']}, "
        f"max_output_tokens={config['max_output_tokens']}, "
        f"beta={config['beta']})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
