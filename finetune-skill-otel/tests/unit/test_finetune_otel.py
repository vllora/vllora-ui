"""
Integration tests for finetune-otel.py — orchestrator CLI.

The orchestrator is a thin wrapper that delegates to per-stage
implementations (already unit-tested elsewhere). These tests exercise
the subcommand wiring end-to-end via subprocess against small
in-memory fixtures.
"""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "finetune-otel.py"


def _run(args, cwd=None):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        cwd=cwd,
    )


def _record(tool="search", args_=None, score_payload=False):
    return {
        "messages": [
            {"role": "system", "content": "You are a helpful shopping assistant."},
            {"role": "user", "content": "find me a tablet"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "c1",
                        "type": "function",
                        "function": {
                            "name": tool,
                            "arguments": json.dumps(args_ or {"q": "tablet"}),
                        },
                    }
                ],
            },
        ],
    }


def _tool_schema():
    return [
        {
            "type": "function",
            "function": {
                "name": "search",
                "description": "Search products",
                "parameters": {
                    "type": "object",
                    "properties": {"q": {"type": "string"}},
                },
            },
        }
    ]


def _write_jsonl(path, records):
    with path.open("w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")


# ─── Per-subcommand smoke tests ────────────────────────────────────────────


def test_topics_subcommand(tmp_path):
    records_path = tmp_path / "training.jsonl"
    tools_path = tmp_path / "tools.json"
    out_path = tmp_path / "topics.json"
    _write_jsonl(records_path, [_record()])
    tools_path.write_text(json.dumps(_tool_schema()))

    result = _run(
        [
            "topics",
            str(records_path),
            "--tool-schema",
            str(tools_path),
            "--output",
            str(out_path),
        ]
    )
    assert result.returncode == 0, result.stderr
    topics = json.loads(out_path.read_text())
    # Two-level hierarchy: agents → patterns
    agents = topics["hierarchy"]["children"]
    assert len(agents) == 1, f"expected 1 agent root, got {len(agents)}"
    patterns = agents[0]["children"]
    assert len(patterns) == 1, f"expected 1 pattern leaf, got {patterns}"
    assert patterns[0]["name"] == "search"
    per_record = topics["per_record_tools"]
    assert len(per_record) == 1
    per_record_name = (
        per_record[0].get("function", {}).get("name") or per_record[0].get("name")
    )
    assert per_record_name == "search"


def test_grader_subcommand(tmp_path):
    tools_path = tmp_path / "tools.json"
    out_path = tmp_path / "grader.json"
    tools_path.write_text(json.dumps(_tool_schema()))

    result = _run(["grader", str(tools_path), "--output", str(out_path)])
    assert result.returncode == 0, result.stderr
    grader = json.loads(out_path.read_text())
    assert grader["type"] == "programmatic_tool_call"
    assert grader["formula_version"] == "v1"


def test_prompt_subcommand(tmp_path):
    records_path = tmp_path / "training.jsonl"
    tools_path = tmp_path / "tools.json"
    out_path = tmp_path / "prompt.txt"
    _write_jsonl(records_path, [_record()])
    tools_path.write_text(json.dumps(_tool_schema()))

    result = _run(
        [
            "prompt",
            str(records_path),
            "--tool-schema",
            str(tools_path),
            "--output",
            str(out_path),
        ]
    )
    assert result.returncode == 0, result.stderr
    prompt = out_path.read_text()
    assert "shopping assistant" in prompt
    assert "search" in prompt


def test_hparams_subcommand(tmp_path):
    records_path = tmp_path / "training.jsonl"
    out_path = tmp_path / "training_config.json"
    _write_jsonl(records_path, [_record()] * 3)

    result = _run(["hparams", str(records_path), "--output", str(out_path)])
    assert result.returncode == 0, result.stderr
    config = json.loads(out_path.read_text())
    assert config["temperature"] == 1.0
    assert config["num_generations"] == 8


def test_hparams_with_probe_report_triggers_escalation(tmp_path):
    records_path = tmp_path / "training.jsonl"
    probe_path = tmp_path / "probe.json"
    out_path = tmp_path / "training_config.json"
    _write_jsonl(records_path, [_record()] * 3)
    probe_path.write_text(
        json.dumps(
            {
                "decision": "NO_GO",
                "bucket_fractions": {
                    "trivial_correct_frac": 0.4,
                    "trivial_wrong_frac": 0.3,
                    "learnable_frac": 0.3,
                    "impossible_frac": 0.0,
                },
            }
        )
    )

    result = _run(
        [
            "hparams",
            str(records_path),
            "--probe-report",
            str(probe_path),
            "--output",
            str(out_path),
        ]
    )
    assert result.returncode == 0, result.stderr
    config = json.loads(out_path.read_text())
    # 0.4 + 0.3 = 0.7 > 0.5 → drop to K=4
    assert config["num_generations"] == 4


def test_probe_subcommand_go(tmp_path):
    records_path = tmp_path / "training.jsonl"
    rollouts_path = tmp_path / "rollouts.json"
    out_path = tmp_path / "probe.json"
    _write_jsonl(records_path, [_record()] * 10)
    # 5 learnable + 2 trivial_correct + 1 trivial_wrong + 2 impossible
    rollouts_path.write_text(
        json.dumps(
            [
                [1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02],
                [1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02],
                [1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02],
                [1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02],
                [1.0, 0.02, 1.0, 0.02, 1.0, 0.02, 1.0, 0.02],
                [1.0] * 8,
                [1.0] * 8,
                [0.02] * 8,
                [0.1, 0.2, 0.3, 0.15, 0.25, 0.1, 0.2, 0.15],
                [0.1, 0.2, 0.3, 0.15, 0.25, 0.1, 0.2, 0.15],
            ]
        )
    )

    result = _run(
        [
            "probe",
            str(records_path),
            str(rollouts_path),
            "--output",
            str(out_path),
        ]
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(out_path.read_text())
    assert report["decision"] == "GO"


def test_analyze_subcommand(tmp_path):
    results_path = tmp_path / "eval_results.json"
    out_path = tmp_path / "report.json"
    results_path.write_text(
        json.dumps(
            [
                {"gt_tool_name": "search", "pred_tool_name": "search", "score": 1.0},
                {"gt_tool_name": "search", "pred_tool_name": "buy", "score": 0.02},
                {"gt_tool_name": "buy", "pred_tool_name": "buy", "score": 0.8},
            ]
        )
    )

    result = _run(["analyze", str(results_path), "--output", str(out_path)])
    assert result.returncode == 0, result.stderr
    report = json.loads(out_path.read_text())
    assert report["total_records"] == 3
    assert "tool_name_accuracy" in report["tier_1"]


def test_handoff_subcommand_bundles_artifacts(tmp_path):
    records_path = tmp_path / "training.jsonl"
    grader_path = tmp_path / "grader.json"
    config_path = tmp_path / "training_config.json"
    prompt_path = tmp_path / "prompt.txt"
    out_path = tmp_path / "handoff.json"

    _write_jsonl(records_path, [_record()] * 2)
    grader_path.write_text(json.dumps({"type": "programmatic_tool_call"}))
    config_path.write_text(json.dumps({"temperature": 1.0, "num_generations": 8}))
    prompt_path.write_text("You are helpful.")

    result = _run(
        [
            "handoff",
            str(records_path),
            "--grader",
            str(grader_path),
            "--training-config",
            str(config_path),
            "--system-prompt",
            str(prompt_path),
            "--output",
            str(out_path),
        ]
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(out_path.read_text())
    assert payload["pipeline"] == "otel-trace"
    assert payload["training_records"]["count"] == 2
    assert payload["system_prompt"] == "You are helpful."
    assert payload["grader"]["type"] == "programmatic_tool_call"
    assert payload["training_config"]["temperature"] == 1.0


def test_cli_requires_subcommand(tmp_path):
    result = _run([])
    assert result.returncode != 0
