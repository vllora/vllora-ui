# /// script
# requires-python = ">=3.10"
# ///
"""
finetune-otel.py — orchestrator for the trace finetune pipeline.

Chains the 8 local stages of the OTel trace pipeline into a single
CLI, parallel to `finetune-skill/scripts/finetune.py` for the PDF
pipeline. Stage 7 runs on the cloud, Stage 9 is deferred — this
script stops at producing the cloud-handoff bundle.

Subcommands (each maps to a single stage or a convenience bundle):

    distill      Stage 3: extract training records from a semconv
                 trace file. Input: OTel-semconv spans JSON (already
                 converted from OpenInference via openinference_to_semconv.py).
                 Output: training.jsonl + per_record_tools.json

    topics       Stage 2: build the topic hierarchy from records.
                 Output: topics.json

    grader       Stage 4: build the declarative grader config.
                 Output: grader.json

    prompt       Stage 5: extract + rewrite the system prompt.
                 Uses an identity rewrite by default — inject a real
                 LLM rewrite via the Python API for production use.
                 Output: system_prompt.txt

    probe        Stage 6: run the 4-gate pre-training probe. Requires
                 a rollout_scores.json file (list of K-score lists
                 parallel to records). Output: probe.json

    hparams      Stage 7: build the training config delta. Optionally
                 reads a probe report for conditional escalations.
                 Output: training_config.json

    handoff      Convenience: bundle grader + prompt + config + records
                 + topics into the Stage 7 cloud handoff payload.
                 Output: handoff.json (+ copies of artifacts)

    analyze      Stage 8: per-tool analysis of eval results.
                 Output: eval_report.json

    all          Run distill → topics → grader → prompt → hparams in
                 one go. Probe and analyze are separate because they
                 require inputs (rollouts, eval results) that aren't
                 available until the base model has been run against
                 the records.

Usage:
    python3 finetune-otel.py distill spans.json --out-dir workdir/
    python3 finetune-otel.py all spans.json --out-dir workdir/
    python3 finetune-otel.py probe workdir/training.jsonl rollouts.json \\
        --output workdir/probe.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Reuse the per-stage implementations directly — no re-implementation.
from analyze_eval_trace import analyze
from otel_distill import extract_records, extract_tool_schema_from_spans
from system_prompt_rewriter import _identity_rewrite, build_system_prompt
from trace_grader_builder import build_grader_config
from trace_hparams import build_training_config
from trace_probe_gates import run_probe
from trace_topics import build_both


# ─── IO helpers ────────────────────────────────────────────────────────────


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def _load_jsonl(path: Path) -> list[dict]:
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def _write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False))


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


# ─── Stage 3: distill ──────────────────────────────────────────────────────


def cmd_distill(args: argparse.Namespace) -> int:
    """Extract training records from a semconv spans file.

    The spans file is expected to already be in OTel-semconv shape
    (a list of spans with gen_ai.* attributes). Convert from
    OpenInference upstream via `openinference_to_semconv.py`.
    """
    spans = _load_json(args.spans)
    if not isinstance(spans, list):
        print("error: spans file must be a JSON array", file=sys.stderr)
        return 2

    records = extract_records(spans)
    tool_schema = extract_tool_schema_from_spans(spans)

    out_dir = args.out_dir
    _write_jsonl(out_dir / "training.jsonl", records)
    _write_json(out_dir / "per_record_tools.json", tool_schema)

    print(
        f"distilled {len(records)} records, {len(tool_schema)} tools → {out_dir}/"
    )
    return 0


# ─── Stage 2: topics ───────────────────────────────────────────────────────


def cmd_topics(args: argparse.Namespace) -> int:
    records = _load_jsonl(args.records)
    tool_schema = _load_json(args.tool_schema)
    hierarchy, per_record = build_both(tool_schema, records)
    _write_json(args.output, {"hierarchy": hierarchy, "per_record_tools": per_record})
    leaf_count = len(hierarchy.get("leaves", []))
    print(f"wrote topics → {args.output} ({leaf_count} tools)")
    return 0


# ─── Stage 4: grader ───────────────────────────────────────────────────────


def cmd_grader(args: argparse.Namespace) -> int:
    tool_schema = _load_json(args.tool_schema)
    config = build_grader_config(tool_schema)
    _write_json(args.output, config)
    print(
        f"wrote grader → {args.output} "
        f"(tools={len(config['tool_schema'])}, "
        f"case-insensitive params={len(config['case_insensitive_params'])})"
    )
    return 0


# ─── Stage 5: prompt ───────────────────────────────────────────────────────


def cmd_prompt(args: argparse.Namespace) -> int:
    records = _load_jsonl(args.records)
    tool_schema = _load_json(args.tool_schema)
    prompt = build_system_prompt(
        records, tool_schema, _identity_rewrite, fallback=args.fallback
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(prompt)
    print(f"wrote system prompt → {args.output} ({len(prompt)} chars)")
    return 0


# ─── Stage 6: probe ────────────────────────────────────────────────────────


def cmd_probe(args: argparse.Namespace) -> int:
    records = _load_jsonl(args.records)
    rollout_scores = _load_json(args.rollout_scores)
    report = run_probe(records, rollout_scores)
    _write_json(args.output, report)
    print(report["message"])
    print(f"probe report → {args.output}")
    return 0 if report["decision"] == "GO" else 3


# ─── Stage 7: hparams ──────────────────────────────────────────────────────


def cmd_hparams(args: argparse.Namespace) -> int:
    records = _load_jsonl(args.records)
    high_zero_variance = False
    if args.probe_report and args.probe_report.exists():
        report = _load_json(args.probe_report)
        fractions = report.get("bucket_fractions", {})
        zero_variance_frac = (
            fractions.get("trivial_correct_frac", 0)
            + fractions.get("trivial_wrong_frac", 0)
        )
        high_zero_variance = zero_variance_frac > 0.5

    config = build_training_config(
        records,
        high_zero_variance=high_zero_variance,
        length_blowup_observed=args.length_blowup,
    )
    _write_json(args.output, config)
    print(
        f"wrote training config → {args.output} "
        f"(num_generations={config['num_generations']}, "
        f"max_output_tokens={config['max_output_tokens']})"
    )
    return 0


# ─── Convenience: handoff ──────────────────────────────────────────────────


def cmd_handoff(args: argparse.Namespace) -> int:
    """Bundle grader + prompt + config + records metadata into the
    Stage 7 cloud handoff payload.

    The payload does not embed the training records directly — those
    are uploaded separately (they can be large). The handoff just
    records the record file path and count so the cloud ingest knows
    which file to fetch.
    """
    records = _load_jsonl(args.records)
    grader = _load_json(args.grader)
    training_config = _load_json(args.training_config)
    system_prompt = args.system_prompt.read_text()

    payload = {
        "version": "v1",
        "pipeline": "otel-trace",
        "training_records": {
            "path": str(args.records),
            "count": len(records),
        },
        "system_prompt": system_prompt,
        "grader": grader,
        "training_config": training_config,
    }
    _write_json(args.output, payload)
    print(f"wrote handoff bundle → {args.output} ({len(records)} records)")
    return 0


# ─── Stage 8: analyze ──────────────────────────────────────────────────────


def cmd_analyze(args: argparse.Namespace) -> int:
    results = _load_json(args.results)
    if not isinstance(results, list):
        print("error: results file must be a JSON array", file=sys.stderr)
        return 2
    report = analyze(results, weak_tool_threshold=args.weak_tool_threshold)
    _write_json(args.output, report)
    weak = report["tier_2"]["weak_tools"]
    print(
        f"wrote eval report → {args.output} "
        f"(accuracy={report['tier_1']['tool_name_accuracy']:.1%}, "
        f"mean={report['tier_1']['overall_grader_mean']:.3f}, "
        f"weak_tools={len(weak)})"
    )
    return 0


# ─── Convenience: all ──────────────────────────────────────────────────────


def cmd_all(args: argparse.Namespace) -> int:
    """Run distill → topics → grader → prompt → hparams in sequence.

    Probe and analyze are intentionally excluded — they require
    rollout scores and eval results that aren't available until the
    base model has been run against the records.
    """
    spans = _load_json(args.spans)
    out_dir = args.out_dir

    records = extract_records(spans)
    tool_schema = extract_tool_schema_from_spans(spans)
    _write_jsonl(out_dir / "training.jsonl", records)
    _write_json(out_dir / "per_record_tools.json", tool_schema)
    print(f"[1/5] distilled {len(records)} records")

    hierarchy, per_record = build_both(tool_schema, records)
    _write_json(
        out_dir / "topics.json",
        {"hierarchy": hierarchy, "per_record_tools": per_record},
    )
    print(f"[2/5] built topics ({len(hierarchy.get('leaves', []))} tools)")

    grader = build_grader_config(tool_schema)
    _write_json(out_dir / "grader.json", grader)
    print(f"[3/5] built grader config")

    try:
        prompt = build_system_prompt(
            records, tool_schema, _identity_rewrite, fallback=args.fallback
        )
    except ValueError as exc:
        print(f"[4/5] prompt skipped: {exc}", file=sys.stderr)
        prompt = ""
    if prompt:
        (out_dir / "system_prompt.txt").write_text(prompt)
        print(f"[4/5] wrote system prompt ({len(prompt)} chars)")

    training_config = build_training_config(records)
    _write_json(out_dir / "training_config.json", training_config)
    print(f"[5/5] wrote training config")

    print(f"\nall stages complete → {out_dir}/")
    print("next: run base-model rollouts against training.jsonl,")
    print("      then `finetune-otel.py probe training.jsonl rollouts.json`")
    return 0


# ─── CLI wiring ────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Orchestrator for the OTel trace finetune pipeline"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_distill = sub.add_parser("distill", help="Stage 3: extract training records")
    p_distill.add_argument("spans", type=Path, help="Semconv spans JSON")
    p_distill.add_argument("--out-dir", type=Path, required=True)
    p_distill.set_defaults(func=cmd_distill)

    p_topics = sub.add_parser("topics", help="Stage 2: build topic hierarchy")
    p_topics.add_argument("records", type=Path)
    p_topics.add_argument("--tool-schema", type=Path, required=True)
    p_topics.add_argument("--output", type=Path, required=True)
    p_topics.set_defaults(func=cmd_topics)

    p_grader = sub.add_parser("grader", help="Stage 4: build grader config")
    p_grader.add_argument("tool_schema", type=Path)
    p_grader.add_argument("--output", type=Path, required=True)
    p_grader.set_defaults(func=cmd_grader)

    p_prompt = sub.add_parser("prompt", help="Stage 5: extract + rewrite prompt")
    p_prompt.add_argument("records", type=Path)
    p_prompt.add_argument("--tool-schema", type=Path, required=True)
    p_prompt.add_argument("--output", type=Path, required=True)
    p_prompt.add_argument("--fallback", type=str, default=None)
    p_prompt.set_defaults(func=cmd_prompt)

    p_probe = sub.add_parser("probe", help="Stage 6: pre-training probe")
    p_probe.add_argument("records", type=Path)
    p_probe.add_argument("rollout_scores", type=Path)
    p_probe.add_argument("--output", type=Path, required=True)
    p_probe.set_defaults(func=cmd_probe)

    p_hp = sub.add_parser("hparams", help="Stage 7: training config delta")
    p_hp.add_argument("records", type=Path)
    p_hp.add_argument("--probe-report", type=Path, default=None)
    p_hp.add_argument("--length-blowup", action="store_true")
    p_hp.add_argument("--output", type=Path, required=True)
    p_hp.set_defaults(func=cmd_hparams)

    p_ho = sub.add_parser("handoff", help="Bundle cloud handoff payload")
    p_ho.add_argument("records", type=Path)
    p_ho.add_argument("--grader", type=Path, required=True)
    p_ho.add_argument("--training-config", type=Path, required=True)
    p_ho.add_argument("--system-prompt", type=Path, required=True)
    p_ho.add_argument("--output", type=Path, required=True)
    p_ho.set_defaults(func=cmd_handoff)

    p_an = sub.add_parser("analyze", help="Stage 8: per-tool eval analysis")
    p_an.add_argument("results", type=Path)
    p_an.add_argument("--output", type=Path, required=True)
    p_an.add_argument("--weak-tool-threshold", type=float, default=0.50)
    p_an.set_defaults(func=cmd_analyze)

    p_all = sub.add_parser("all", help="Run distill → topics → grader → prompt → hparams")
    p_all.add_argument("spans", type=Path)
    p_all.add_argument("--out-dir", type=Path, required=True)
    p_all.add_argument("--fallback", type=str, default=None)
    p_all.set_defaults(func=cmd_all)

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
