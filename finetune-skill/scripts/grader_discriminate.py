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

# Shape-conformance phase: score synthesized "canonical" responses that match
# the shape cloud actually delivers to the grader at eval time. Catches the
# class of bug where the grader's response-parse logic doesn't match the
# target model's output format. Example from the 2026-04-21 run: v1/v2
# graders passed corruption tests but scored every Qwen-native tool_call at
# FLOOR because they only checked `input.response`, not
# `input.messages[last].tool_calls` (which is how cloud's
# `create_eval_row_with_response` delivers Qwen's native emissions).
#
# The synthesized response mirrors a "perfect" model emission: appends an
# assistant message with empty content + populated tool_calls[] matching
# the record's ground_truth. If the grader scores this near-floor, it can't
# parse the cloud-delivery shape — same bug as v1/v2.
#
# This is cloud-free (deterministic, fast, no network) and catches the
# exact parse-format bug without needing an actual inference call. A real
# live test against cloud would require either VLLORA_GCP_FINETUNE_URL
# client access or a new gateway proxy endpoint — neither currently exists
# for custom-routed models like Qwen3.5-4B/base.
DEFAULT_SHAPE_SAMPLES = 5
# Threshold from empirical observation: a working grader scores a canonical
# (GT-matching) response at ≥ 0.95 (tool name matches, all args match).
# A broken grader hits FLOOR (0.02). 0.5 is well above floor and well below
# a working grader's natural output — flags parse bugs immediately.
DEFAULT_SHAPE_MIN_MEAN = 0.50


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
    shape_results: dict | None = None,
    shape_min_mean: float | None = None,
) -> None:
    report = {
        "thresholds": {
            "min_score_gap": min_gap,
            "min_pairwise_winrate": min_winrate,
            "shape_min_mean": shape_min_mean,
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
    if shape_results is not None:
        report["shape_conformance"] = {
            "mean": shape_results["mean"],
            "n": len(shape_results["scores"]),
            "passes": shape_min_mean is None or shape_results["mean"] >= shape_min_mean,
            "samples": shape_results["samples"],
        }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"  report written → {output_path}")


def _build_canonical_cloud_row(record: dict) -> dict:
    """Build an eval-style row matching how cloud delivers a 'perfect' response.

    Mirrors `create_eval_row_with_response` in cloud's evaluation_processor.rs:
    the model's output is appended as the last assistant message with native
    `tool_calls` populated and `content` empty. A grader that can't parse
    this shape (like v1/v2 did) will score FLOOR on it.

    The appended tool_call matches the record's ground_truth exactly — so a
    correctly-parsing grader should score ≥ 0.95 (near-perfect).
    """
    gt = record.get("ground_truth") or {}
    gt_name = gt.get("name") or ""
    gt_args = gt.get("arguments") or {}

    canonical_message = {
        "role": "assistant",
        "content": "",  # cloud usually delivers empty content on native tool_calls
        "tool_calls": [{
            "id": f"call_canonical_{gt_name}",
            "type": "function",
            "function": {
                "name": gt_name,
                # Cloud delivers arguments as a JSON string (OpenAI spec)
                "arguments": json.dumps(gt_args) if isinstance(gt_args, dict) else str(gt_args),
            },
        }],
    }

    row = {
        "messages": list(record.get("messages") or []) + [canonical_message],
        "tools": record.get("tools") or [],
        "ground_truth": record.get("ground_truth"),
    }
    return row


def run_shape_conformance(
    records: list[dict],
    workflow_id: str,
    script_content: str,
    base_url: str,
    n_samples: int,
    rng: random.Random,
) -> dict:
    """Phase 2: score canonical cloud-shape responses and verify non-floor.

    For each of N sampled records, appends a "perfect" assistant message
    (content="", tool_calls=[GT matching call]) to the record's messages
    array — mirroring how cloud delivers native tool_calls to the grader.
    Scores each via the dry-run endpoint.

    If the grader scores these near-floor, it's failing to parse the
    cloud-delivery shape — the exact v1/v2 bug class.

    Returns {mean, scores, samples}. Main() decides pass/fail vs threshold.
    """
    sample = rng.sample(records, min(n_samples, len(records)))
    results: list[dict] = []

    for i, record in enumerate(sample):
        gt_name = (record.get("ground_truth") or {}).get("name", "?")
        print(f"[shape {i + 1}/{len(sample)}] {record.get('id', '?')[:40]} — {gt_name}")
        row = _build_canonical_cloud_row(record)
        score = score_row(workflow_id, script_content, row, base_url)
        if score is None:
            continue
        results.append({
            "record_id": record.get("id"),
            "gt": gt_name,
            "score": score,
        })
        print(f"  score={score:.3f}  (GT={gt_name})")

    scores = [r["score"] for r in results]
    mean = sum(scores) / len(scores) if scores else 0.0
    return {"mean": mean, "scores": scores, "samples": results}


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
    ap.add_argument(
        "--shape-samples",
        type=int,
        default=DEFAULT_SHAPE_SAMPLES,
        help=(
            f"Number of canonical cloud-shape responses to grade (default: "
            f"{DEFAULT_SHAPE_SAMPLES}). Catches grader bugs that corruption "
            f"tests miss — specifically when the grader's response-parse "
            f"logic doesn't match cloud's delivery shape "
            f"(`input.messages[last].tool_calls` with empty content). "
            f"Set 0 to skip shape phase."
        ),
    )
    ap.add_argument(
        "--shape-min-mean",
        type=float,
        default=DEFAULT_SHAPE_MIN_MEAN,
        help=(
            f"Minimum mean score on canonical responses to pass (default: "
            f"{DEFAULT_SHAPE_MIN_MEAN}). A correctly-parsing grader scores "
            f"~0.95 on GT-matching responses; a broken grader hits FLOOR."
        ),
    )
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

    # ---- Phase 1: synthetic corruption discrimination ----
    stats = run_discrimination(
        records=sample,
        workflow_id=args.workflow_id,
        script_content=script_content,
        base_url=args.base_url,
        min_gap=args.min_score_gap,
        min_winrate=args.min_pairwise_winrate,
    )
    corruption_pass = print_summary(stats, args.min_score_gap, args.min_pairwise_winrate)

    # ---- Phase 2: shape-conformance against canonical cloud-shape responses ----
    shape_results: dict | None = None
    shape_pass = True
    if args.shape_samples > 0:
        print()
        print(f"=== Shape-conformance phase ({args.shape_samples} canonical cloud-shape responses) ===")
        shape_results = run_shape_conformance(
            records=records,
            workflow_id=args.workflow_id,
            script_content=script_content,
            base_url=args.base_url,
            n_samples=args.shape_samples,
            rng=random.Random(args.seed + 1),
        )
        mean = shape_results["mean"]
        n = len(shape_results["scores"])
        shape_pass = n > 0 and mean >= args.shape_min_mean
        mark = "✓" if shape_pass else "✗ FAIL"
        print(f"  shape mean: {mean:.3f} over {n} samples (threshold ≥ {args.shape_min_mean})  {mark}")
        if not shape_pass and shape_results["samples"]:
            print(f"  least-scored canonical examples (likely parse-format mismatch):")
            worst = sorted(shape_results["samples"], key=lambda s: s["score"])[:3]
            for ex in worst:
                print(f"    {ex['record_id'][:40]} score={ex['score']:.3f}  (GT={ex['gt']})")

    # ---- Write report + final verdict ----
    all_pass = corruption_pass and shape_pass
    write_report(
        stats, args.output_report, args.min_score_gap, args.min_pairwise_winrate, all_pass,
        shape_results=shape_results,
        shape_min_mean=args.shape_min_mean if args.shape_samples > 0 else None,
    )

    if not all_pass:
        print()
        if not corruption_pass:
            print("⚠ Corruption discrimination FAILED. Grader can't distinguish synthetic wrong answers from correct ones.")
        if not shape_pass:
            print(
                f"⚠ Shape-conformance FAILED. Grader scored mean "
                f"{shape_results['mean']:.3f} on canonical cloud-shape responses "
                f"(GT-matching calls delivered as native tool_calls on "
                f"`input.messages[last]`). This is the v1/v2 grader bug: grader "
                f"reads `input.response` but cloud delivers the tool_call "
                f"through the messages array. Fix the grader's response "
                f"parsing — see `reference/grader-writing.md` § Discrimination check."
            )
        sys.exit(1)
    print()
    print("✓ Grader passes both corruption discrimination and shape-conformance checks.")


if __name__ == "__main__":
    main()
