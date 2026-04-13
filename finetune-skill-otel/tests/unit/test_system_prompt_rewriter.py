"""
Unit tests for system_prompt_rewriter.py — Stage 5.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import pytest  # noqa: E402
from system_prompt_rewriter import (  # noqa: E402
    build_system_prompt,
    extract_system_prompt,
    most_common_system_prompt,
    rewrite_system_prompt,
)


# ─── Fixture builders ──────────────────────────────────────────────────────


def _record(system=None, user="hi"):
    messages = []
    if system is not None:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user})
    return {"messages": messages}


def _stub_rewrite(original, tool_schema):
    """Deterministic stub: tags the prompt with the tool count."""
    return f"REWRITTEN({len(tool_schema)}): {original}"


# ─── extract_system_prompt ─────────────────────────────────────────────────


def test_extract_returns_system_content():
    assert extract_system_prompt(_record("You are Bob.")) == "You are Bob."


def test_extract_returns_none_when_missing():
    assert extract_system_prompt(_record()) is None


def test_extract_ignores_empty_content():
    assert extract_system_prompt(_record("   ")) is None


def test_extract_ignores_non_string_content():
    rec = {"messages": [{"role": "system", "content": {"blocks": []}}]}
    assert extract_system_prompt(rec) is None


def test_extract_empty_messages():
    assert extract_system_prompt({"messages": []}) is None


# ─── most_common_system_prompt ─────────────────────────────────────────────


def test_most_common_single_prompt():
    records = [_record("P1")] * 3
    assert most_common_system_prompt(records) == "P1"


def test_most_common_picks_majority():
    records = [_record("P1"), _record("P1"), _record("P2")]
    assert most_common_system_prompt(records) == "P1"


def test_most_common_tie_takes_first():
    records = [_record("P1"), _record("P2")]
    assert most_common_system_prompt(records) == "P1"


def test_most_common_skips_missing():
    records = [_record(), _record("P1"), _record()]
    assert most_common_system_prompt(records) == "P1"


def test_most_common_all_missing_returns_none():
    records = [_record(), _record()]
    assert most_common_system_prompt(records) is None


def test_most_common_empty_input():
    assert most_common_system_prompt([]) is None


# ─── rewrite_system_prompt ─────────────────────────────────────────────────


def test_rewrite_invokes_fn_with_args():
    captured = {}

    def capture(original, tool_schema):
        captured["original"] = original
        captured["tool_schema"] = tool_schema
        return "new"

    schema = [{"name": "t1"}]
    rewrite_system_prompt("old", schema, capture)
    assert captured == {"original": "old", "tool_schema": schema}


def test_rewrite_strips_whitespace():
    assert rewrite_system_prompt("old", [], lambda o, s: "  new  \n") == "new"


def test_rewrite_rejects_empty_original():
    with pytest.raises(ValueError, match="non-empty"):
        rewrite_system_prompt("   ", [], lambda o, s: "new")


def test_rewrite_rejects_non_string_return():
    with pytest.raises(ValueError, match="must return a string"):
        rewrite_system_prompt("old", [], lambda o, s: 42)


def test_rewrite_rejects_empty_return():
    with pytest.raises(ValueError, match="empty string"):
        rewrite_system_prompt("old", [], lambda o, s: "   ")


# ─── build_system_prompt ───────────────────────────────────────────────────


def test_build_extracts_and_rewrites():
    records = [_record("You are a shopping assistant.")] * 3
    schema = [{"name": "search"}, {"name": "buy"}]
    result = build_system_prompt(records, schema, _stub_rewrite)
    assert result == "REWRITTEN(2): You are a shopping assistant."


def test_build_uses_fallback_when_no_system_message():
    records = [_record(), _record()]
    result = build_system_prompt(
        records, [{"name": "t"}], _stub_rewrite, fallback="You are helpful."
    )
    assert result == "REWRITTEN(1): You are helpful."


def test_build_raises_without_fallback():
    with pytest.raises(ValueError, match="no system prompt"):
        build_system_prompt([_record()], [], _stub_rewrite)


def test_build_prefers_extraction_over_fallback():
    records = [_record("Extracted.")]
    result = build_system_prompt(
        records, [], _stub_rewrite, fallback="Fallback."
    )
    assert "Extracted" in result
    assert "Fallback" not in result
