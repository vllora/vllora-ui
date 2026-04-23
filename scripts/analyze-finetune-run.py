#!/usr/bin/env python3
"""
Automated pass/fail analysis for a finetune agent run.

Reads meta.json + stream.jsonl from a run directory, checks pipeline step
completion, errors, and project artifacts. Writes verdict.json with per-step
pass/fail and an overall verdict.

Usage:
  analyze-finetune-run.py <run-dir> [--project-dir <dir>]

  # Analyze the latest run:
  analyze-finetune-run.py ~/test-samples/medical-qa/finetune-runs/run-20260401-114920

  # Auto-detect project dir from meta.json, or override:
  analyze-finetune-run.py <run-dir> --project-dir ~/test-samples/medical-qa

Output:
  <run-dir>/verdict.json — structured pass/fail with per-step details
  Prints summary to stdout.

Exit codes:
  0 = PASS (all critical steps succeeded)
  1 = FAIL (critical step failed or agent errored)
  2 = WARN (non-critical issues detected)
  3 = ERROR (analysis itself failed — missing files, etc.)
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


# ── Pipeline step detection patterns ─────────────────────────────────────────
# These patterns match assistant text or tool calls that indicate step progress.

STEP_PATTERNS = {
    "extraction": {
        "started": [
            r"knowledge.extractor",
            r"extract.*document",
            r"docling",
            r"upload.*knowledge",
        ],
        "completed": [
            r"knowledge_parts\.json",
            r"extraction.*complete",
            r"uploaded.*knowledge.*parts",
            r"all.parts.index\.json",
        ],
    },
    "topics": {
        "started": [
            r"topic.*hierarch",
            r"topics?\.json",
            r"create.*topic",
            r"define.*topic",
        ],
        "completed": [
            r"topics?\.json.*(?:created|saved|written)",
            r"topic.*hierarchy.*(?:complete|done|ready)",
            r"relation.builder",
        ],
    },
    "relations": {
        "started": [
            r"relation.builder",
            r"relations?\.json",
            r"match.*parts.*topics",
        ],
        "completed": [
            r"relations?\.json.*(?:created|saved|written)",
            r"relation.*(?:complete|done|built)",
        ],
    },
    "generation": {
        "started": [
            r"generat.*record",
            r"generat.*training.*data",
            r"training\.jsonl",
            r"generate_records",
        ],
        "completed": [
            r"training\.jsonl.*(?:created|saved|written)",
            r"generated?\s+\d+\s+records",
            r"generation.*(?:complete|done)",
            r"deduplic",
        ],
    },
    "grader": {
        "started": [
            r"grader\.js",
            r"write.*grader",
            r"grader.*function",
        ],
        "completed": [
            r"grader\.js.*(?:created|saved|written)",
            r"grader.*(?:complete|done|ready)",
        ],
    },
    "evaluation": {
        "started": [
            r"run_evaluation",
            r"start.*eval",
            r"evaluation.*job",
            r"dry.?run",
        ],
        "completed": [
            r"evaluation.*(?:complete|finished|done)",
            r"eval.*result",
            r"readiness.*gate",
            r"verdict.*(?:GO|PASS)",
        ],
    },
    "training": {
        "started": [
            r"start.*training",
            r"create.*training.*job",
            r"training.*job.*creat",
        ],
        "completed": [
            r"training.*(?:complete|finished|done|succeed)",
            r"training.*job.*(?:complete|succeed)",
            r"model.*(?:deployed|ready)",
        ],
    },
}

# Tool names that indicate specific pipeline activity
STEP_TOOLS = {
    "extraction": ["knowledge-extractor", "upload_knowledge_source"],
    "topics": ["save_topics", "create_topics"],
    "relations": ["relation-builder", "save_relations"],
    "generation": ["generate_records", "Bash"],  # Bash runs generate_records.py
    "grader": ["save_grader", "update_grader"],
    "evaluation": ["run_evaluation", "get_evaluation_status"],
    "training": ["create_training_job", "get_training_status"],
}


@dataclass
class StepVerdict:
    status: str = "not_started"  # not_started, started, completed, failed
    evidence: list = field(default_factory=list)


@dataclass
class RunVerdict:
    overall: str = "UNKNOWN"  # PASS, FAIL, WARN
    exit_code: int = -1
    turns: int = 0
    tool_calls: int = 0
    errors: int = 0
    error_messages: list = field(default_factory=list)
    steps: dict = field(default_factory=dict)
    artifacts: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)


def scan_jsonl(jsonl_path: str) -> tuple[dict[str, StepVerdict], list[str], int]:
    """Scan stream.jsonl for pipeline step markers and errors."""
    steps: dict[str, StepVerdict] = {
        name: StepVerdict() for name in STEP_PATTERNS
    }
    error_messages: list[str] = []
    error_count = 0

    if not os.path.isfile(jsonl_path):
        return steps, ["stream.jsonl not found"], 0

    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            entry_type = entry.get("type", "")

            # Check errors
            if entry_type == "error":
                error_count += 1
                msg = entry.get("error", {}).get("message", str(entry))
                error_messages.append(msg[:300])
                continue

            # Extract text from assistant messages
            if entry_type == "assistant":
                content = entry.get("message", {}).get("content", [])
                if isinstance(content, str):
                    content = [{"type": "text", "text": content}]
                if not isinstance(content, list):
                    continue

                for block in content:
                    if not isinstance(block, dict):
                        continue

                    if block.get("type") == "text":
                        text = block.get("text", "").lower()
                        _match_text(text, steps)

                    elif block.get("type") == "tool_use":
                        name = block.get("name", "")
                        inp = block.get("input", {})
                        _match_tool(name, inp, steps)

            # Check tool results for errors
            if entry_type == "user":
                content = entry.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            if block.get("is_error"):
                                text = _extract_text(block.get("content", ""))
                                error_messages.append(text[:300])
                                error_count += 1

    return steps, error_messages, error_count


def _match_text(text: str, steps: dict[str, StepVerdict]) -> None:
    """Match text against step patterns."""
    for step_name, patterns in STEP_PATTERNS.items():
        step = steps[step_name]
        for pattern in patterns["completed"]:
            if re.search(pattern, text, re.IGNORECASE):
                step.status = "completed"
                step.evidence.append(f"text match: {pattern}")
                return  # completed takes priority
        for pattern in patterns["started"]:
            if re.search(pattern, text, re.IGNORECASE):
                if step.status == "not_started":
                    step.status = "started"
                    step.evidence.append(f"text match: {pattern}")


def _match_tool(name: str, inp: dict, steps: dict[str, StepVerdict]) -> None:
    """Match tool calls against step indicators."""
    for step_name, tool_names in STEP_TOOLS.items():
        step = steps[step_name]
        for tool_pattern in tool_names:
            if tool_pattern.lower() in name.lower():
                # Special case: Bash running generate_records.py
                if name == "Bash" and step_name == "generation":
                    cmd = inp.get("command", "")
                    if "generate_records" not in cmd:
                        continue
                if step.status in ("not_started", "started"):
                    step.status = "started"
                    step.evidence.append(f"tool: {name}")

            # Agent tool spawning subagents
            if name == "Agent":
                desc = inp.get("description", "").lower()
                agent_type = inp.get("subagent_type", "").lower()
                combined = f"{desc} {agent_type}"
                if tool_pattern.lower() in combined:
                    if step.status in ("not_started", "started"):
                        step.status = "started"
                        step.evidence.append(f"subagent: {desc}")


def _extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    if isinstance(content, dict):
        return content.get("text", str(content))
    return str(content)


def check_artifacts(project_dir: str) -> dict[str, dict]:
    """Check existence and size of expected project artifacts."""
    artifacts = {}
    fp = os.path.join(project_dir, "finetune-project")

    expected = {
        "config.json": {"required": True},
        "topics.json": {"required": True},
        "relations.json": {"required": True},
        "training.jsonl": {"required": True},
        "grader.js": {"required": True},
        "knowledge/all-parts-index.json": {"required": False},
        "execution-log.md": {"required": False},
    }

    for name, meta in expected.items():
        path = os.path.join(fp, name)
        if os.path.isfile(path):
            size = os.path.getsize(path)
            # For JSONL, count lines
            lines = 0
            if name.endswith(".jsonl") and size > 0:
                with open(path) as f:
                    lines = sum(1 for _ in f)
            artifacts[name] = {
                "exists": True,
                "size_bytes": size,
                "lines": lines if lines else None,
                "required": meta["required"],
            }
        else:
            artifacts[name] = {
                "exists": False,
                "size_bytes": 0,
                "required": meta["required"],
            }

    # Check for evaluation files
    eval_dir = os.path.join(fp, "evaluations")
    if os.path.isdir(eval_dir):
        eval_files = [f for f in os.listdir(eval_dir) if f.endswith(".json")]
        artifacts["evaluations/"] = {
            "exists": True,
            "count": len(eval_files),
            "required": False,
        }

    # Check for training job files
    train_dir = os.path.join(fp, "training-jobs")
    if os.path.isdir(train_dir):
        train_files = [f for f in os.listdir(train_dir) if f.endswith(".json")]
        artifacts["training-jobs/"] = {
            "exists": True,
            "count": len(train_files),
            "required": False,
        }

    return artifacts


def compute_verdict(
    meta: dict,
    steps: dict[str, StepVerdict],
    errors: list[str],
    error_count: int,
    artifacts: dict,
) -> RunVerdict:
    """Compute overall verdict from all signals."""
    verdict = RunVerdict(
        exit_code=meta.get("exit_code", -1),
        turns=meta.get("turns", 0),
        tool_calls=meta.get("tool_calls", 0),
        errors=error_count,
        error_messages=errors[:10],  # cap at 10
        steps={name: asdict(step) for name, step in steps.items()},
        artifacts=artifacts,
    )

    # Critical failures
    if meta.get("exit_code", -1) != 0:
        verdict.warnings.append(f"Non-zero exit code: {meta.get('exit_code')}")

    if error_count > 5:
        verdict.warnings.append(f"High error count: {error_count}")

    # Check required artifacts
    missing_required = [
        name for name, info in artifacts.items()
        if info.get("required") and not info.get("exists")
    ]
    if missing_required:
        verdict.warnings.append(f"Missing required artifacts: {', '.join(missing_required)}")

    # Check training.jsonl has records
    training_info = artifacts.get("training.jsonl", {})
    if training_info.get("exists") and training_info.get("lines", 0) == 0:
        verdict.warnings.append("training.jsonl exists but is empty")
    elif training_info.get("exists") and (training_info.get("lines") or 0) < 20:
        verdict.warnings.append(f"training.jsonl has only {training_info.get('lines')} records (expect 50+)")

    # Determine overall verdict
    critical_steps = ["extraction", "topics", "generation", "grader"]
    critical_failed = [
        name for name in critical_steps
        if steps[name].status in ("not_started", "failed")
    ]
    critical_started_only = [
        name for name in critical_steps
        if steps[name].status == "started"
    ]

    if critical_failed:
        verdict.overall = "FAIL"
        verdict.warnings.append(f"Critical steps not reached: {', '.join(critical_failed)}")
    elif missing_required:
        verdict.overall = "FAIL"
    elif critical_started_only:
        verdict.overall = "WARN"
        verdict.warnings.append(f"Steps started but not confirmed complete: {', '.join(critical_started_only)}")
    elif meta.get("exit_code", -1) != 0:
        verdict.overall = "WARN"
    else:
        # Check if eval/training were attempted
        if steps["evaluation"].status == "completed":
            if steps["training"].status == "completed":
                verdict.overall = "PASS"
            else:
                verdict.overall = "WARN"
                verdict.warnings.append("Evaluation completed but training not confirmed")
        elif steps["evaluation"].status in ("started", "not_started"):
            verdict.overall = "WARN"
            verdict.warnings.append("Evaluation not completed (may be expected for partial runs)")
        else:
            verdict.overall = "PASS"

    return verdict


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze a finetune agent run")
    parser.add_argument("run_dir", help="Path to the run directory (contains meta.json, stream.jsonl)")
    parser.add_argument("--project-dir", help="Override project directory (default: from meta.json)")
    args = parser.parse_args()

    run_dir = args.run_dir.rstrip("/")

    # Load meta.json
    meta_path = os.path.join(run_dir, "meta.json")
    if not os.path.isfile(meta_path):
        print(f"Error: meta.json not found at {meta_path}", file=sys.stderr)
        sys.exit(3)

    with open(meta_path) as f:
        meta = json.load(f)

    # Resolve project dir
    project_dir = args.project_dir or meta.get("project_dir", "")
    if not project_dir or not os.path.isdir(project_dir):
        print(f"Warning: project dir not found: {project_dir}", file=sys.stderr)
        project_dir = ""

    # Scan JSONL
    jsonl_path = os.path.join(run_dir, "stream.jsonl")
    steps, error_messages, error_count = scan_jsonl(jsonl_path)

    # Check artifacts
    artifacts = check_artifacts(project_dir) if project_dir else {}

    # Compute verdict
    verdict = compute_verdict(meta, steps, error_messages, error_count, artifacts)

    # Write verdict.json
    verdict_path = os.path.join(run_dir, "verdict.json")
    verdict_dict = asdict(verdict)
    verdict_dict["run_id"] = meta.get("run_id", "unknown")
    verdict_dict["project"] = os.path.basename(project_dir) if project_dir else "unknown"

    with open(verdict_path, "w") as f:
        json.dump(verdict_dict, f, indent=2)

    # Print summary
    icon = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️", "UNKNOWN": "❓"}
    print(f"\n{icon.get(verdict.overall, '?')} {verdict.overall}: {meta.get('run_id', 'unknown')} ({os.path.basename(project_dir) if project_dir else '?'})")
    print(f"   Turns: {verdict.turns}, Tools: {verdict.tool_calls}, Errors: {verdict.errors}")
    print()

    # Step summary
    step_icons = {"completed": "✅", "started": "🔄", "not_started": "⬜", "failed": "❌"}
    for name in ["extraction", "topics", "relations", "generation", "grader", "evaluation", "training"]:
        step = steps[name]
        print(f"   {step_icons.get(step.status, '?')} {name}: {step.status}")

    if verdict.warnings:
        print()
        for w in verdict.warnings:
            print(f"   ⚠ {w}")

    print(f"\n   Verdict: {verdict_path}")

    # Exit code
    exit_map = {"PASS": 0, "FAIL": 1, "WARN": 2, "UNKNOWN": 3}
    sys.exit(exit_map.get(verdict.overall, 3))


if __name__ == "__main__":
    main()
