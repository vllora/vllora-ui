#!/usr/bin/env python3
# /// script
# dependencies = ["requests>=2.31"]
# ///
"""grader_discriminate.py — test whether a grader discriminates correct vs corrupted tool calls.

Takes a sample of training records with known-good `ground_truth`, generates four
classes of systematic corruption (wrong_name / missing_required_arg /
arg_value_mutation / arg_key_rename), scores originals and corruptions against
the given grader via the gateway `/evaluator/dry-run` endpoint, and asserts:

  - mean(original) - mean(corrupted) >= MIN_SCORE_GAP per corruption class
  - P(orig > corrupt) >= MIN_PAIRWISE_WINRATE per corruption class

Exit code 1 if any class violates either threshold. Writes a JSON report with
per-class stats and the 5 least-discriminated examples per class.

This is the cheapest approximation of IRC (Iterative Reward Calibration): rather
than iterating against trace outcomes mid-training, we catch the most common
grader-design bugs (name-check stub-returning 1.0, naive String() compares that
miss arg-order swaps, dropped-required-field silent-passes) before upload.

Usage:
    uv run scripts/grader_discriminate.py \\
        --workflow-id <wf> \\
        --records training.jsonl \\
        --grader quality-checker/grader.js \\
        --output-report quality-checker/discrimination-report.json
"""

from __future__ import annotations

import argparse
import copy
import json
import random
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

DEFAULT_BASE_URL = "http://localhost:9090"
DEFAULT_SAMPLE_SIZE = 30
DEFAULT_MIN_SCORE_GAP = 0.30
DEFAULT_MIN_PAIRWISE_WINRATE = 0.80
CORRUPTION_CLASSES = (
    "wrong_name",
    "missing_required_arg",
    "arg_value_mutation",
    "arg_key_rename",
)


# ─── Corruption generators ───────────────────────────────────────────────────


def _tool_schema_for(tool_name: str, tools: list[dict]) -> dict | None:
    """Return the `function` block for `tool_name` from the row's tools list."""
    for t in tools:
        fn = t.get("function") if isinstance(t, dict) else None
        if fn and fn.get("name") == tool_name:
            return fn
    return None


def _required_args(schema: dict | None) -> list[str]:
    if not schema:
        return []
    params = schema.get("parameters") or {}
    return list(params.get("required") or [])


def corrupt_wrong_name(gt: dict, tools: list[dict]) -> dict | None:
    """Swap gt.name for a random DIFFERENT tool in the row's tools list."""
    others = [
        (t.get("function") or {}).get("name")
        for t in tools
        if (t.get("function") or {}).get("name")
        and (t.get("function") or {}).get("name") != gt.get("name")
    ]
    if not others:
        return None
    new_name = random.choice(others)
    return {"name": new_name, "arguments": copy.deepcopy(gt.get("arguments") or {})}


def corrupt_missing_required_arg(gt: dict, tools: list[dict]) -> dict | None:
    schema = _tool_schema_for(gt.get("name", ""), tools)
    required = _required_args(schema)
    present_required = [k for k in required if k in (gt.get("arguments") or {})]
    if not present_required:
        return None
    to_drop = random.choice(present_required)
    new_args = {k: v for k, v in (gt.get("arguments") or {}).items() if k != to_drop}
    return {"name": gt["name"], "arguments": new_args}


def _mutate_value(v: Any) -> Any:
    """Return a value of the same rough type but meaningfully different."""
    if isinstance(v, bool):
        return not v
    if isinstance(v, (int, float)):
        return -v if v != 0 else 1
    if isinstance(v, str):
        return v + " XXX_CORRUPT"
    if isinstance(v, list):
        return []
    if isinstance(v, dict):
        return {}
    if v is None:
        return "INVALID_CORRUPT"
    return f"{v}_CORRUPT"


def corrupt_arg_value_mutation(gt: dict, tools: list[dict]) -> dict | None:
    schema = _tool_schema_for(gt.get("name", ""), tools)
    required = _required_args(schema)
    args = gt.get("arguments") or {}
    present_required = [k for k in required if k in args]
    if not present_required:
        return None
    to_mutate = random.choice(present_required)
    new_args = copy.deepcopy(args)
    new_args[to_mutate] = _mutate_value(new_args[to_mutate])
    return {"name": gt["name"], "arguments": new_args}


def _rename_key(key: str) -> str:
    """Return a plausibly-wrong rename of `key`."""
    if "_" in key:
        parts = key.split("_")
        return parts[0] + "".join(p.capitalize() for p in parts[1:])  # snake→camel
    if key.endswith("Id"):
        return key[:-2]
    return key + "_alt"


def corrupt_arg_key_rename(gt: dict, tools: list[dict]) -> dict | None:
    schema = _tool_schema_for(gt.get("name", ""), tools)
    required = _required_args(schema)
    args = gt.get("arguments") or {}
    present_required = [k for k in required if k in args]
    if not present_required:
        return None
    to_rename = random.choice(present_required)
    renamed = _rename_key(to_rename)
    if renamed == to_rename:
        return None
    new_args = {}
    for k, v in args.items():
        new_args[renamed if k == to_rename else k] = copy.deepcopy(v)
    return {"name": gt["name"], "arguments": new_args}


CORRUPTION_FNS = {
    "wrong_name": corrupt_wrong_name,
    "missing_required_arg": corrupt_missing_required_arg,
    "arg_value_mutation": corrupt_arg_value_mutation,
    "arg_key_rename": corrupt_arg_key_rename,
}


# ─── Scoring ─────────────────────────────────────────────────────────────────


def build_row_with_response(
    record: dict, simulated_tool_call: dict | None
) -> dict:
    """Build a row that the grader will score. Injects the simulated call as
    `response` (the grader's parseToolCall accepts a stringified {name, arguments}).
    Ground truth stays as the record's real GT — that's the point of the test.
    """
    row = {
        "messages": record.get("messages") or [],
        "tools": record.get("tools") or [],
        "ground_truth": record.get("ground_truth"),
    }
    if simulated_tool_call is not None:
        row["response"] = json.dumps(simulated_tool_call)
    return row


def score_row(
    workflow_id: str, script_content: str, row: dict, base_url: str
) -> float | None:
    """POST to the dry-run endpoint. Returns the numeric score or None on error."""
    try:
        resp = requests.post(
            f"{base_url}/finetune/workflows/{workflow_id}/evaluator/dry-run",
            json={"script": script_content, "row": row},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"  ⚠ scoring error: {e}", file=sys.stderr)
        return None
    score = data.get("score")
    return float(score) if isinstance(score, (int, float)) else None


# ─── Report + verdict ────────────────────────────────────────────────────────


@dataclass
class ClassStats:
    klass: str
    n_scored: int = 0
    orig_scores: list[float] = field(default_factory=list)
    corrupt_scores: list[float] = field(default_factory=list)
    worst_examples: list[dict] = field(default_factory=list)

    @property
    def mean_gap(self) -> float:
        if not self.orig_scores or not self.corrupt_scores:
            return 0.0
        return statistics.mean(self.orig_scores) - statistics.mean(self.corrupt_scores)

    @property
    def pairwise_winrate(self) -> float:
        if not self.orig_scores:
            return 0.0
        wins = sum(
            1
            for o, c in zip(self.orig_scores, self.corrupt_scores)
            if o > c
        )
        return wins / len(self.orig_scores)

    def passes(self, min_gap: float, min_winrate: float) -> bool:
        return self.mean_gap >= min_gap and self.pairwise_winrate >= min_winrate


def select_records(records: list[dict], sample_size: int, rng: random.Random) -> list[dict]:
    """Select records that are scoreable for most corruption classes."""
    eligible = [
        r
        for r in records
        if isinstance(r.get("ground_truth"), dict)
        and r["ground_truth"].get("name")
        and isinstance(r.get("tools"), list)
        and len(r["tools"]) >= 2
    ]
    if not eligible:
        raise SystemExit("No eligible records (need gt.name and ≥2 tools).")
    return rng.sample(eligible, min(sample_size, len(eligible)))


def run_discrimination(
    records: list[dict],
    workflow_id: str,
    script_content: str,
    base_url: str,
    min_gap: float,
    min_winrate: float,
) -> dict[str, ClassStats]:
    stats = {k: ClassStats(klass=k) for k in CORRUPTION_CLASSES}

    for i, record in enumerate(records):
        gt = record["ground_truth"]
        tools = record["tools"]

        print(f"[{i + 1}/{len(records)}] {record.get('id', '?')[:40]} — {gt.get('name')}")

        orig_row = build_row_with_response(record, gt)
        orig_score = score_row(workflow_id, script_content, orig_row, base_url)
        if orig_score is None:
            continue

        for klass in CORRUPTION_CLASSES:
            corrupted = CORRUPTION_FNS[klass](gt, tools)
            if corrupted is None:
                continue
            corr_row = build_row_with_response(record, corrupted)
            corr_score = score_row(workflow_id, script_content, corr_row, base_url)
            if corr_score is None:
                continue
            st = stats[klass]
            st.orig_scores.append(orig_score)
            st.corrupt_scores.append(corr_score)
            st.n_scored += 1
            # Track worst-ranked (corrupt_score close to or above orig)
            st.worst_examples.append(
                {
                    "record_id": record.get("id"),
                    "tool": gt.get("name"),
                    "orig_score": orig_score,
                    "corrupt_score": corr_score,
                    "gap": orig_score - corr_score,
                    "corruption": corrupted,
                }
            )

    # Keep only the 5 smallest-gap examples per class (= least-discriminated)
    for st in stats.values():
        st.worst_examples.sort(key=lambda e: e["gap"])
        st.worst_examples = st.worst_examples[:5]

    return stats


def print_summary(stats: dict[str, ClassStats], min_gap: float, min_winrate: float) -> bool:
    print()
    print("=== Grader discrimination summary ===")
    print(f"  Thresholds: score-gap ≥ {min_gap}, pairwise-winrate ≥ {min_winrate}")
    all_pass = True
    for klass in CORRUPTION_CLASSES:
        st = stats[klass]
        if st.n_scored == 0:
            print(f"  {klass:28s}  SKIPPED (no eligible records)")
            continue
        passed = st.passes(min_gap, min_winrate)
        mark = "✓" if passed else "✗ FAIL"
        print(
            f"  {klass:28s}  n={st.n_scored:3d}  "
            f"mean_gap={st.mean_gap:+.3f}  pairwise={st.pairwise_winrate:.2%}  {mark}"
        )
        if not passed:
            all_pass = False
            print(f"     least-discriminated examples:")
            for ex in st.worst_examples[:3]:
                print(
                    f"       {ex['record_id'][:30] if ex['record_id'] else '?':30s} "
                    f"orig={ex['orig_score']:.3f} corrupt={ex['corrupt_score']:.3f} "
                    f"gap={ex['gap']:+.3f}"
                )
    return all_pass


def write_report(
    stats: dict[str, ClassStats],
    output_path: Path,
    min_gap: float,
    min_winrate: float,
    all_pass: bool,
) -> None:
    report = {
        "thresholds": {
            "min_score_gap": min_gap,
            "min_pairwise_winrate": min_winrate,
        },
        "all_pass": all_pass,
        "classes": {
            klass: {
                "n_scored": st.n_scored,
                "mean_orig": statistics.mean(st.orig_scores) if st.orig_scores else None,
                "mean_corrupt": statistics.mean(st.corrupt_scores) if st.corrupt_scores else None,
                "mean_gap": st.mean_gap,
                "pairwise_winrate": st.pairwise_winrate,
                "passes": st.passes(min_gap, min_winrate),
                "worst_examples": st.worst_examples,
            }
            for klass, st in stats.items()
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"  report written → {output_path}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--workflow-id", required=True)
    ap.add_argument("--records", required=True, type=Path, help="training.jsonl path")
    ap.add_argument("--grader", required=True, type=Path, help="grader.js path")
    ap.add_argument("--sample-size", type=int, default=DEFAULT_SAMPLE_SIZE)
    ap.add_argument("--min-score-gap", type=float, default=DEFAULT_MIN_SCORE_GAP)
    ap.add_argument("--min-pairwise-winrate", type=float, default=DEFAULT_MIN_PAIRWISE_WINRATE)
    ap.add_argument(
        "--output-report",
        type=Path,
        default=Path("finetune-project/quality-checker/discrimination-report.json"),
    )
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if not args.records.exists():
        raise SystemExit(f"Records file not found: {args.records}")
    if not args.grader.exists():
        raise SystemExit(f"Grader file not found: {args.grader}")

    rng = random.Random(args.seed)
    with args.records.open() as f:
        records = [json.loads(line) for line in f if line.strip()]
    print(f"Loaded {len(records)} records; sampling {args.sample_size}")

    sample = select_records(records, args.sample_size, rng)
    script_content = args.grader.read_text()

    stats = run_discrimination(
        records=sample,
        workflow_id=args.workflow_id,
        script_content=script_content,
        base_url=args.base_url,
        min_gap=args.min_score_gap,
        min_winrate=args.min_pairwise_winrate,
    )
    all_pass = print_summary(stats, args.min_score_gap, args.min_pairwise_winrate)
    write_report(stats, args.output_report, args.min_score_gap, args.min_pairwise_winrate, all_pass)

    if not all_pass:
        print()
        print("⚠ Grader discrimination FAILED. Review the report and fix the grader before upload.")
        sys.exit(1)
    print()
    print("✓ Grader discriminates all corruption classes.")


if __name__ == "__main__":
    main()
