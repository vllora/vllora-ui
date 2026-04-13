"""
Level 2 integration test — chain the full trace pipeline against the
Phoenix fixture (`test-samples/otel-phoenix/source_traces_semconv.json`).

This exercises the orchestrator's `all` subcommand end-to-end and
verifies that every stage produces a well-formed artifact. Unit tests
cover each stage in isolation; this test catches wiring bugs between
them (schema mismatches, missing fields, path issues).

Skips if the fixture isn't present — the test-samples repo is an
optional sibling checkout.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "finetune-otel.py"
FIXTURE = Path(
    "/Users/anhthuduong/Documents/GitHub/test-samples/otel-phoenix/source_traces_semconv.json"
)


pytestmark = pytest.mark.skipif(
    not FIXTURE.exists(), reason=f"fixture not present: {FIXTURE}"
)


def _run(args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
    )


def test_all_subcommand_produces_every_artifact(tmp_path):
    out_dir = tmp_path / "workdir"
    result = _run(
        [
            "all",
            str(FIXTURE),
            "--out-dir",
            str(out_dir),
            "--fallback",
            "You are a helpful agent.",
        ]
    )
    assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"

    expected = [
        "training.jsonl",
        "per_record_tools.json",
        "topics.json",
        "grader.json",
        "training_config.json",
    ]
    for name in expected:
        path = out_dir / name
        assert path.exists(), f"missing artifact: {name}"
        assert path.stat().st_size > 0, f"empty artifact: {name}"


def test_distilled_records_are_wellformed(tmp_path):
    out_dir = tmp_path / "workdir"
    _run(["distill", str(FIXTURE), "--out-dir", str(out_dir)])

    records = [
        json.loads(line)
        for line in (out_dir / "training.jsonl").read_text().splitlines()
        if line.strip()
    ]
    assert len(records) > 0, "no records extracted from fixture"

    for rec in records:
        assert "messages" in rec
        msgs = rec["messages"]
        assert isinstance(msgs, list) and len(msgs) >= 2
        # Last message must be assistant (the decision point)
        assert msgs[-1]["role"] == "assistant"
        # Assistant either has content (refusal) or tool_calls
        last = msgs[-1]
        assert last.get("content") is not None or last.get("tool_calls")


def test_grader_config_matches_tool_schema(tmp_path):
    out_dir = tmp_path / "workdir"
    _run(
        [
            "all",
            str(FIXTURE),
            "--out-dir",
            str(out_dir),
            "--fallback",
            "x",
        ]
    )
    tools = json.loads((out_dir / "per_record_tools.json").read_text())
    grader = json.loads((out_dir / "grader.json").read_text())
    assert grader["type"] == "programmatic_tool_call"
    assert grader["formula_version"] == "v1"
    assert grader["tool_schema"] == tools


def test_training_config_has_trace_deltas(tmp_path):
    out_dir = tmp_path / "workdir"
    _run(
        [
            "all",
            str(FIXTURE),
            "--out-dir",
            str(out_dir),
            "--fallback",
            "x",
        ]
    )
    config = json.loads((out_dir / "training_config.json").read_text())
    assert config["temperature"] == 1.0  # trace delta
    assert config["loss_type"] == "dr_grpo"
    assert config["num_generations"] == 8
    assert config["max_output_tokens"] >= 128


def test_handoff_bundle_from_pipeline_artifacts(tmp_path):
    """Full pipeline → handoff bundle, chained."""
    out_dir = tmp_path / "workdir"
    _run(["all", str(FIXTURE), "--out-dir", str(out_dir), "--fallback", "x"])

    handoff_path = out_dir / "handoff.json"
    result = _run(
        [
            "handoff",
            str(out_dir / "training.jsonl"),
            "--grader",
            str(out_dir / "grader.json"),
            "--training-config",
            str(out_dir / "training_config.json"),
            "--system-prompt",
            str(out_dir / "system_prompt.txt"),
            "--output",
            str(handoff_path),
        ]
    )
    assert result.returncode == 0, result.stderr

    payload = json.loads(handoff_path.read_text())
    assert payload["pipeline"] == "otel-trace"
    assert payload["training_records"]["count"] > 0
    assert "grader" in payload
    assert "training_config" in payload
    assert payload["system_prompt"]
