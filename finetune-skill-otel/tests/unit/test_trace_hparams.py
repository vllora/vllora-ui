"""
Unit tests for trace_hparams.py — Stage 7 training config builder.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from trace_hparams import (  # noqa: E402
    PDF_DEFAULTS,
    TRACE_DELTAS,
    TRACE_MAX_OUTPUT_TOKENS_CEILING,
    TRACE_MAX_OUTPUT_TOKENS_FLOOR,
    _percentile,
    _record_output_token_estimate,
    build_training_config,
    compute_gt_token_lengths,
    compute_max_output_tokens,
)


# ─── Fixture builders ──────────────────────────────────────────────────────


def _record(tool_name="search", args=None):
    return {
        "messages": [
            {"role": "user", "content": "go"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "c0",
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(args or {"q": "hello"}),
                        },
                    }
                ],
            },
        ]
    }


def _refusal_record():
    return {
        "messages": [
            {"role": "user", "content": "do it"},
            {"role": "assistant", "content": "I can't."},
        ]
    }


# ─── _record_output_token_estimate ─────────────────────────────────────────


def test_token_estimate_refusal_is_zero():
    assert _record_output_token_estimate(_refusal_record()) == 0


def test_token_estimate_nonzero_for_tool_call():
    assert _record_output_token_estimate(_record()) > 0


def test_token_estimate_no_messages():
    assert _record_output_token_estimate({"messages": []}) == 0


def test_token_estimate_scales_with_payload():
    small = _record_output_token_estimate(_record(args={"q": "a"}))
    big = _record_output_token_estimate(_record(args={"q": "a" * 400}))
    assert big > small


# ─── compute_gt_token_lengths ──────────────────────────────────────────────


def test_gt_lengths_excludes_refusals():
    records = [_record(), _refusal_record(), _record()]
    lengths = compute_gt_token_lengths(records)
    assert len(lengths) == 2
    assert all(n > 0 for n in lengths)


def test_gt_lengths_empty():
    assert compute_gt_token_lengths([]) == []


# ─── _percentile ───────────────────────────────────────────────────────────


def test_percentile_empty_returns_zero():
    assert _percentile([], 0.95) == 0


def test_percentile_single_value():
    assert _percentile([42], 0.95) == 42


def test_percentile_p95_of_range():
    # nearest-rank: idx = round(0.95 * 99) = 94
    values = list(range(1, 101))
    assert _percentile(values, 0.95) == 95


def test_percentile_median():
    assert _percentile([1, 2, 3, 4, 5], 0.5) == 3


# ─── compute_max_output_tokens ─────────────────────────────────────────────


def test_max_tokens_empty_records_returns_floor():
    assert compute_max_output_tokens([]) == TRACE_MAX_OUTPUT_TOKENS_FLOOR


def test_max_tokens_all_refusals_returns_floor():
    assert compute_max_output_tokens([_refusal_record()] * 3) == TRACE_MAX_OUTPUT_TOKENS_FLOOR


def test_max_tokens_respects_floor():
    # Tiny records — p95 * 1.3 would be < floor
    records = [_record(args={"a": "b"})] * 10
    assert compute_max_output_tokens(records) == TRACE_MAX_OUTPUT_TOKENS_FLOOR


def test_max_tokens_respects_ceiling():
    # Pathologically huge record
    big = _record(args={"payload": "x" * 100000})
    assert compute_max_output_tokens([big] * 10) == TRACE_MAX_OUTPUT_TOKENS_CEILING


def test_max_tokens_uses_multiplier():
    records = [_record(args={"payload": "x" * 400})] * 10
    result = compute_max_output_tokens(records, multiplier=1.3, floor=1, ceiling=100000)
    # should be p95 * 1.3, well above floor
    assert result > 1


# ─── build_training_config ─────────────────────────────────────────────────


def test_build_config_applies_pdf_defaults():
    config = build_training_config([_record()])
    for key, value in PDF_DEFAULTS.items():
        assert config[key] == value or key == "temperature"  # temp overridden


def test_build_config_applies_trace_deltas():
    config = build_training_config([_record()])
    assert config["temperature"] == TRACE_DELTAS["temperature"] == 1.0


def test_build_config_includes_max_output_tokens():
    config = build_training_config([_record()])
    assert "max_output_tokens" in config
    assert config["max_output_tokens"] >= TRACE_MAX_OUTPUT_TOKENS_FLOOR


def test_build_config_default_num_generations_is_8():
    config = build_training_config([_record()])
    assert config["num_generations"] == 8


def test_build_config_high_zero_variance_drops_to_4():
    config = build_training_config([_record()], high_zero_variance=True)
    assert config["num_generations"] == 4
    assert "_trace_override_reason_num_generations" in config


def test_build_config_length_blowup_enables_beta():
    config = build_training_config([_record()], length_blowup_observed=True)
    assert config["beta"] == 0.001
    assert config["ref_model_refresh_steps"] == 100
    assert "_trace_override_reason_beta" in config


def test_build_config_length_blowup_off_keeps_beta_zero():
    config = build_training_config([_record()])
    assert config["beta"] == 0
    assert "ref_model_refresh_steps" not in config


def test_build_config_both_escalations():
    config = build_training_config(
        [_record()],
        high_zero_variance=True,
        length_blowup_observed=True,
    )
    assert config["num_generations"] == 4
    assert config["beta"] == 0.001


def test_build_config_overrides_take_precedence():
    config = build_training_config(
        [_record()],
        overrides={"temperature": 0.5, "learning_rate": 5e-7},
    )
    assert config["temperature"] == 0.5
    assert config["learning_rate"] == 5e-7


def test_build_config_overrides_beat_escalations():
    config = build_training_config(
        [_record()],
        high_zero_variance=True,
        overrides={"num_generations": 16},
    )
    assert config["num_generations"] == 16


def test_build_config_carries_loss_type_and_epsilons():
    config = build_training_config([_record()])
    assert config["loss_type"] == "dr_grpo"
    assert config["epsilon"] == 3e-4
    assert config["epsilon_high"] == 4e-4
