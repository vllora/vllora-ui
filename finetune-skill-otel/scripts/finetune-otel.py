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
from otel_distill import (
    extract_records,
    extract_tool_schema_per_trace,
    extract_union_tool_schema,
    group_by_trace_id,
)
from system_prompt_rewriter import _identity_rewrite, build_system_prompt
from trace_grader_builder import build_grader_config
from trace_hparams import build_training_config
from trace_probe_gates import run_probe
from trace_topics import build_both, build_record_topic_index, flatten_hierarchy_leaves


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

    Each record gets the tool schema from its own trace (multi-agent
    safe). The union of all per-trace schemas is written as the
    overall tool schema for downstream stages (topics, grader).
    """
    spans = _load_json(args.spans)
    if not isinstance(spans, list):
        print("error: spans file must be a JSON array", file=sys.stderr)
        return 2

    records = extract_records(spans)
    by_trace = group_by_trace_id(spans)
    per_trace_schemas = extract_tool_schema_per_trace(by_trace)
    union_schema = extract_union_tool_schema(per_trace_schemas)

    out_dir = args.out_dir
    _write_jsonl(out_dir / "training.jsonl", records)
    _write_json(out_dir / "per_record_tools.json", union_schema)

    print(
        f"distilled {len(records)} records, "
        f"{len(union_schema)} tools (union of {len(per_trace_schemas)} traces) "
        f"→ {out_dir}/"
    )
    return 0


# ─── Stage 2: topics ───────────────────────────────────────────────────────


def cmd_topics(args: argparse.Namespace) -> int:
    records = _load_jsonl(args.records)
    tool_schema = _load_json(args.tool_schema)
    hierarchy, per_record = build_both(tool_schema, records)
    _write_json(args.output, {"hierarchy": hierarchy, "per_record_tools": per_record})
    agent_count = len(hierarchy.get("children", []))
    leaf_count = sum(
        len(a.get("children", []))
        for a in hierarchy.get("children", [])
    )
    print(f"wrote topics → {args.output} ({agent_count} agents, {leaf_count} patterns)")
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


# ─── Eval + Training (reuses existing cloud API, same as PDF skill) ────────


def cmd_eval(args: argparse.Namespace) -> int:
    """Create an evaluation run on the cloud.

    Same endpoint and flow as the PDF skill's `finetune.py create-eval`.
    The cloud evaluates the records using the grader and returns scores.
    """
    import time

    payload = {
        "workflow_id": args.workflow_id,
        "rollout_model_params": {
            "model": args.model,
            "temperature": 1.0,
        },
    }

    print(f"Creating eval run (model={args.model})...")
    try:
        result = _gateway_post(args.gateway, "/finetune/evaluations", payload)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    eval_id = result.get("evaluation_run_id", result.get("id", "unknown"))
    print(f"Eval created: {eval_id}")

    # Journal entry for eval creation
    _journal_log(Path("."), "eval", "create_eval", "in_progress",
                 f"Eval {eval_id[:8]} started (model={args.model})",
                 details={"eval_id": eval_id, "model": args.model},
                 workflow_id=args.workflow_id)

    # Save metadata to evaluations/ directory (matches PDF skill convention)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "evaluation_run_id": eval_id,
        "workflow_id": args.workflow_id,
        "model": args.model,
        "status": "running",
    }
    _write_json(out_dir / f"eval-{eval_id[:8]}.json", meta)

    # Poll if requested
    if args.poll:
        print(f"Polling every {args.poll_interval}s...")
        elapsed = 0
        while elapsed < args.max_wait:
            try:
                import urllib.request
                with urllib.request.urlopen(
                    f"{args.gateway}/finetune/evaluations/{eval_id}"
                ) as resp:
                    poll = json.loads(resp.read())
            except Exception:
                print(f"  [{elapsed}s] API error — retrying...")
                time.sleep(args.poll_interval)
                elapsed += args.poll_interval
                continue

            status = poll.get("status", "unknown")
            completed = poll.get("completed_rows", "?")
            total = poll.get("total_rows", "?")
            print(f"  [{elapsed}s] {status} ({completed}/{total} rows)")

            if status in ("completed", "failed", "cancelled"):
                print(f"\nEval {status}.")
                _write_json(
                    out_dir / f"eval-{eval_id[:8]}.json",
                    {**meta, "status": status, "results": poll.get("results")},
                )
                _journal_log(Path("."), "eval", "eval_complete", status,
                             f"Eval {eval_id[:8]} {status} ({completed}/{total} rows)",
                             details={"eval_id": eval_id, "completed": completed, "total": total},
                             workflow_id=args.workflow_id)
                return 0 if status == "completed" else 1

            time.sleep(args.poll_interval)
            elapsed += args.poll_interval

        print(f"Timed out after {args.max_wait}s. Eval still running: {eval_id}")

    return 0


def cmd_train(args: argparse.Namespace) -> int:
    """Create a training job on the cloud.

    Same endpoint as the PDF skill's `finetune.py create-training`.
    Uses GRPO with model-size-aware defaults from trace_hparams.py.
    """
    # Load the training config produced by Stage 7
    training_config = {}
    if args.config_file and args.config_file.exists():
        training_config = _load_json(args.config_file)

    base_model = args.base_model or "Qwen3.5-4B"
    output_model = args.output_model or "trace-finetune-v1"

    payload = {
        "job_type": "provider_finetune",
        "dataset": args.workflow_id,
        "base_model": base_model,
        "output_model": output_model,
        "display_name": args.display_name or f"Trace finetune {output_model}",
        # Training config comes from trace_hparams.py (Stage 7) which
        # includes all PDF defaults + trace deltas. Read everything from
        # the config file so lora_rank, scale_rewards, etc. are not
        # hardcoded here.
        "training_config": {
            "lora_rank": training_config.get("lora_rank", 16),
            "gradient_accumulation_steps": training_config.get("gradient_accumulation_steps", 5),
            "epochs": training_config.get("epochs", 5),
            "batch_size": training_config.get("batch_size", 5),
            "loss_type": training_config.get("loss_type", "dr_grpo"),
            "learning_rate": training_config.get("learning_rate", 1e-6),
            "beta": training_config.get("beta", 0),
            "temperature": training_config.get("temperature", 1.0),
            "num_generations": training_config.get("num_generations", 8),
            "max_output_tokens": training_config.get("max_output_tokens", 512),
            "mask_truncated_completions": training_config.get("mask_truncated_completions", True),
            "importance_sampling_level": training_config.get("importance_sampling_level", "sequence"),
            "scale_rewards": training_config.get("scale_rewards", "none"),
            "epsilon": training_config.get("epsilon", 3e-4),
            "epsilon_high": training_config.get("epsilon_high", 4e-4),
        },
    }

    # Merge user overrides
    if args.config_overrides:
        try:
            overrides = json.loads(args.config_overrides)
            payload["training_config"].update(overrides)
        except Exception as exc:
            print(f"warning: ignoring --config-overrides: {exc}", file=sys.stderr)

    print(f"Creating training job (base={base_model}, model={output_model})...")
    try:
        result = _gateway_post(
            args.gateway,
            f"/finetune/workflows/{args.workflow_id}/jobs",
            payload,
        )
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    job_id = result.get("id", result.get("provider_job_id", "unknown"))
    print(f"Training job created: {job_id}")
    print(f"  base_model:   {base_model}")
    print(f"  output_model: {output_model}")
    print(f"  loss_type:    {payload['training_config']['loss_type']}")
    print(f"  lr:           {payload['training_config']['learning_rate']}")
    print(f"  beta:         {payload['training_config']['beta']}")
    print(f"  temperature:  {payload['training_config']['temperature']}")
    print(f"  K:            {payload['training_config']['num_generations']}")
    print(f"\nMonitor in UI: http://localhost:5173/finetune/{args.workflow_id}")

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    _write_json(out_dir / f"training-{job_id[:8]}.json", {
        "job_id": job_id,
        "workflow_id": args.workflow_id,
        "base_model": base_model,
        "output_model": output_model,
        "config": payload["training_config"],
        "status": "created",
    })
    _journal_log(Path("."), "training", "create_training_job", "in_progress",
                 f"Training job {job_id[:8]} created (model={base_model}, lr={payload['training_config']['learning_rate']})",
                 details={"job_id": job_id, "base_model": base_model, "output_model": output_model},
                 workflow_id=args.workflow_id)

    return 0


# ─── Gateway helpers ───────────────────────────────────────────────────────


def _gateway_post(gateway: str, path: str, payload: dict) -> dict:
    """POST JSON to the gateway and return the parsed response."""
    import urllib.request
    import urllib.error

    url = f"{gateway}{path}"
    body = json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as exc:
        raise RuntimeError(f"gateway request failed: {url} → {exc}") from exc


def _gateway_multipart_method(
    gateway: str, path: str, fields: dict[str, str],
    method: str = "POST",
) -> dict:
    """POST multipart/form-data to the gateway (for knowledge source creation)."""
    import urllib.request
    import urllib.error

    boundary = "----vllora-otel-boundary"
    body_parts: list[bytes] = []
    for key, value in fields.items():
        body_parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{value}\r\n".encode()
        )
    body_parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(body_parts)

    url = f"{gateway}{path}"
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as exc:
        raise RuntimeError(f"gateway request failed: {url} → {exc}") from exc


# ─── Upload to gateway ─────────────────────────────────────────────────────


def cmd_upload(args: argparse.Namespace) -> int:
    """Upload semconv spans to the gateway as a trace bundle."""
    spans = _load_json(args.spans)
    if not isinstance(spans, list):
        print("error: spans must be a JSON array", file=sys.stderr)
        return 2

    payload = {"name": args.name, "semconv_spans": spans}

    try:
        result = _gateway_post(
            args.gateway,
            f"/finetune/workflows/{args.workflow_id}/trace-bundles",
            payload,
        )
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    bundle_id = result.get("id", "?")
    print(
        f"uploaded trace bundle → {bundle_id}\n"
        f"  spans: {result.get('span_count')}, "
        f"tools: {result.get('tool_names', [])}, "
        f"models: {result.get('model_names', [])}"
    )
    return 0


# ─── Publish to gateway (create workflow + upload + register) ──────────────


def publish_to_gateway(
    gateway: str,
    spans: list,
    name: str,
    objective: str | None = None,
    artifacts_dir: Path | None = None,
) -> dict:
    """Create workflow + upload trace bundle + register knowledge source +
    upload records, topics, and grader if `artifacts_dir` is provided.

    Returns a dict with `workflow_id`, `bundle_id`, `knowledge_source_id`,
    plus `records_uploaded` and `topics_uploaded` counts.
    Raises RuntimeError on gateway failures (caller should catch + degrade).
    """
    total_steps = 6 if artifacts_dir else 3

    # Step 1: create workflow
    print(f"[publish 1/{total_steps}] Creating workflow...")
    wf = _gateway_post(gateway, "/finetune/workflows", {
        "name": name,
        "objective": objective or f"OTel trace finetune: {name}",
    })
    workflow_id = wf["id"]
    print(f"  workflow: {workflow_id} ({wf['name']})")

    # Step 2: upload trace bundle
    print(f"[publish 2/{total_steps}] Uploading trace bundle...")
    bundle = _gateway_post(
        gateway,
        f"/finetune/workflows/{workflow_id}/trace-bundles",
        {"name": name, "semconv_spans": spans},
    )
    bundle_id = bundle["id"]
    print(
        f"  bundle: {bundle_id} "
        f"({bundle.get('span_count', '?')} spans, "
        f"tools={bundle.get('tool_names', [])}, "
        f"models={bundle.get('model_names', [])})"
    )

    # Step 3: register knowledge source
    print(f"[publish 3/{total_steps}] Registering knowledge source...")
    ks_id = None
    try:
        ks = _gateway_multipart_method(
            gateway,
            f"/finetune/workflows/{workflow_id}/knowledge",
            {
                "name": name,
                "kind": "otel-trace",
                "trace_bundle_id": bundle_id,
            },
        )
        ks_id = ks.get("id", "?")
        print(f"  knowledge source: {ks_id}")
    except RuntimeError as exc:
        print(f"  ⚠ knowledge source registration failed: {exc}")

    records_uploaded = 0
    topics_uploaded = 0

    if artifacts_dir:
        # Step 4: upload two-level topic hierarchy.
        # Level 0 (roots): agent identity from normalized system prompt.
        # Level 1 (leaves): tool-call pattern within each agent.
        # Records are assigned to leaves via build_record_topic_index.
        topic_fullpath_to_id: dict[str, str] = {}
        topics_file = artifacts_dir / "topics.json"
        if topics_file.exists():
            print(f"[publish 4/{total_steps}] Uploading topics...")
            topics_data = _load_json(topics_file)
            hierarchy = topics_data.get("hierarchy", {})
            agents = hierarchy.get("children", [])

            if agents:
                # Upload root topics (agents)
                root_payload = [
                    {"name": agent.get("name", "Agent"), "parent_id": None}
                    for agent in agents
                ]
                _gateway_post(
                    gateway,
                    f"/finetune/workflows/{workflow_id}/topics",
                    {"topics": root_payload},
                )

                # Fetch back root IDs
                import urllib.request as _urlreq2
                root_name_to_id: dict[str, str] = {}
                try:
                    with _urlreq2.urlopen(
                        f"{gateway}/finetune/workflows/{workflow_id}/topics"
                    ) as resp:
                        for t in json.loads(resp.read()).get("topics", []):
                            root_name_to_id[t["name"]] = t["id"]
                except Exception:
                    pass

                # Upload leaf topics (patterns) under their parent root
                leaf_payload = []
                for agent in agents:
                    parent_id = root_name_to_id.get(agent.get("name", ""))
                    for child in agent.get("children", []):
                        leaf_payload.append({
                            "name": child.get("name", "?"),
                            "parent_id": parent_id,
                        })
                if leaf_payload:
                    _gateway_post(
                        gateway,
                        f"/finetune/workflows/{workflow_id}/topics",
                        {"topics": leaf_payload},
                    )

                # Fetch all topics again to get leaf IDs
                try:
                    with _urlreq2.urlopen(
                        f"{gateway}/finetune/workflows/{workflow_id}/topics"
                    ) as resp:
                        all_topics = json.loads(resp.read()).get("topics", [])
                    # Build parent_id → parent_name lookup
                    id_to_name: dict[str, str] = {}
                    for t in all_topics:
                        id_to_name[t["id"]] = t["name"]
                    # Build full_path → id for leaves (topics with a parent)
                    for t in all_topics:
                        pid = t.get("parent_id")
                        if pid and pid in id_to_name:
                            full_path = f"{id_to_name[pid]} / {t['name']}"
                            topic_fullpath_to_id[full_path] = t["id"]
                except Exception:
                    pass

                topics_uploaded = len(root_payload) + len(leaf_payload)
                print(
                    f"  uploaded {len(root_payload)} roots + "
                    f"{len(leaf_payload)} leaves = {topics_uploaded} topics"
                )
                print(f"  mapped {len(topic_fullpath_to_id)} leaf full_path→id")
        else:
            print(f"[publish 4/{total_steps}] skipped (no topics.json)")

        # Step 5: upload training records (with topic assignment)
        records_file = artifacts_dir / "training.jsonl"
        if records_file.exists():
            print(f"[publish 5/{total_steps}] Uploading training records...")
            raw_records = _load_jsonl(records_file)
            if raw_records:
                import uuid as _uuid

                # Build record → topic mapping using the same logic
                # that built the hierarchy (prompt hash + tool pattern)
                record_topic_map = build_record_topic_index(raw_records)

                gateway_records = []
                assigned = 0
                for i, rec in enumerate(raw_records):
                    full_path = record_topic_map.get(i)
                    topic_id = (
                        topic_fullpath_to_id.get(full_path)
                        if full_path
                        else None
                    )
                    if topic_id:
                        assigned += 1
                    gateway_records.append({
                        "id": _uuid.uuid4().hex[:12],
                        "data": rec,
                        "topic_id": topic_id,
                    })

                # Adaptive batch size: estimate payload size and keep under 40MB
                # (gateway limit is 50MB, leave headroom for JSON overhead).
                MAX_BATCH_BYTES = 40 * 1024 * 1024
                sample = json.dumps(gateway_records[:10], ensure_ascii=False)
                avg_record_bytes = len(sample.encode()) / min(10, len(gateway_records))
                batch_size = max(10, int(MAX_BATCH_BYTES / avg_record_bytes))
                batch_size = min(batch_size, 500)  # cap at 500
                print(f"  batch size: {batch_size} (avg record ~{avg_record_bytes/1024:.0f} KB)")

                for i in range(0, len(gateway_records), batch_size):
                    batch = gateway_records[i : i + batch_size]
                    _gateway_post(
                        gateway,
                        f"/finetune/workflows/{workflow_id}/records",
                        {"records": batch},
                    )
                    records_uploaded += len(batch)
                print(
                    f"  uploaded {records_uploaded} records "
                    f"({assigned} assigned to topics)"
                )
        else:
            print(f"[publish 4/{total_steps}] skipped (no training.jsonl)")

        # Step 6: upload grader
        grader_file = artifacts_dir / "grader.json"
        if grader_file.exists():
            print(f"[publish 6/{total_steps}] Uploading grader...")
            grader_config = _load_json(grader_file)
            # The gateway expects the grader as a JS file via multipart.
            # Read the real JS grader implementation and embed the config
            # at the top so the cloud evaluator has everything it needs.
            grader_js_path = Path(__file__).parent / "trace_grader.js"
            if not grader_js_path.exists():
                raise RuntimeError(f"trace_grader.js not found at {grader_js_path}")
            grader_js_template = grader_js_path.read_text()
            # Inject the concrete GRADER_CONFIG before the grader code.
            # The JS file references `typeof GRADER_CONFIG !== "undefined"`
            # and falls back to an empty object — by declaring it first, the
            # real config takes precedence.
            grader_js = (
                "// Auto-generated: GRADER_CONFIG embedded by finetune-otel.py publish\n"
                "// Type: programmatic_tool_call, Version: "
                f"{grader_config.get('formula_version', 'v1')}\n"
                f"const GRADER_CONFIG = {json.dumps(grader_config, indent=2)};\n\n"
                + grader_js_template
            )
            _gateway_multipart_method(
                gateway,
                f"/finetune/workflows/{workflow_id}/evaluator",
                {"file": grader_js},
                method="PATCH",
            )
            print(f"  uploaded grader (formula_version={grader_config.get('formula_version')})")
        else:
            print(f"[publish 6/{total_steps}] skipped (no grader.json)")

    print(
        f"\n✅ Published to gateway\n"
        f"  workflow:    {workflow_id}\n"
        f"  bundle:      {bundle_id}\n"
        f"  knowledge:   {ks_id or 'manual linking needed'}\n"
        f"  records:     {records_uploaded}\n"
        f"  topics:      {topics_uploaded}\n"
        f"  gateway:     {gateway}\n"
        f"\n"
        f"Open the UI at http://localhost:5173/finetune/{workflow_id}\n"
    )
    return {
        "workflow_id": workflow_id,
        "bundle_id": bundle_id,
        "knowledge_source_id": ks_id,
        "records_uploaded": records_uploaded,
        "topics_uploaded": topics_uploaded,
    }


def cmd_publish(args: argparse.Namespace) -> int:
    """Standalone publish: create workflow + upload + register."""
    spans = _load_json(args.spans)
    if not isinstance(spans, list):
        print("error: spans must be a JSON array", file=sys.stderr)
        return 2
    try:
        publish_to_gateway(args.gateway, spans, args.name, args.objective)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


# ─── Pipeline journal + execution log ──────────────────────────────────────


def _journal_log(
    out_dir: Path,
    step: str,
    action: str,
    status: str,
    summary: str,
    details: dict | None = None,
    *,
    workflow_id: str | None = None,
) -> None:
    """Append an entry to pipeline-journal.json and execution-log.md.

    Mirrors the PDF skill's dual-write pattern so the UI Pipeline Journal
    tab can display OTel pipeline runs identically.
    """
    from datetime import datetime, timezone

    ts = datetime.now(timezone.utc).isoformat()

    # ── pipeline-journal.json ──
    journal_path = out_dir / "pipeline-journal.json"
    if journal_path.exists():
        journal = json.loads(journal_path.read_text())
    else:
        journal = {
            "version": "1.0",
            "workflow_id": workflow_id or "",
            "objective": "OTel trace finetune",
            "entries": [],
        }
    entry_id = len(journal["entries"]) + 1
    entry = {
        "id": entry_id,
        "timestamp": ts,
        "step": step,
        "action": action,
        "status": status,
        "summary": summary,
        "auto_logged": True,
    }
    if details:
        entry["details"] = details
    if workflow_id and not journal.get("workflow_id"):
        journal["workflow_id"] = workflow_id
    journal["entries"].append(entry)
    _write_json(journal_path, journal)

    # ── execution-log.md ──
    log_path = out_dir / "execution-log.md"
    short_ts = ts[:19].replace("T", " ")
    lines = [f"## {step} — {short_ts}"]
    lines.append(f"- **Action**: {action}")
    lines.append(f"- **Status**: {status}")
    lines.append(f"- **Summary**: {summary}")
    if details:
        for k, v in details.items():
            lines.append(f"- **{k}**: {v}")
    lines.append("")
    with open(log_path, "a") as f:
        f.write("\n".join(lines) + "\n")


# ─── Convenience: all ──────────────────────────────────────────────────────


def cmd_all(args: argparse.Namespace) -> int:
    """Run distill → topics → grader → prompt → hparams → publish.

    Probe and analyze are intentionally excluded — they require
    rollout scores and eval results that aren't available until the
    base model has been run against the records.

    Publishes to the gateway after local stages complete
    (creates workflow, uploads trace bundle, registers knowledge source).
    """
    spans = _load_json(args.spans)
    out_dir = args.out_dir

    out_dir.mkdir(parents=True, exist_ok=True)

    # Per-trace tool schema extraction (multi-agent safe).
    # Each record gets the tools from its own trace. The union of all
    # per-trace schemas is used for topics, grader, and hparams.
    jlog = lambda step, action, status, summary, **kw: _journal_log(
        out_dir, step, action, status, summary, **kw,
    )

    records = extract_records(spans)
    by_trace = group_by_trace_id(spans)
    per_trace_schemas = extract_tool_schema_per_trace(by_trace)
    tool_schema = extract_union_tool_schema(per_trace_schemas)
    print(
        f"[1/6] distilled {len(records)} records, "
        f"{len(tool_schema)} tools (union of {len(per_trace_schemas)} traces)"
    )
    jlog("stage_1_distill", "extract_records", "completed",
         f"Extracted {len(records)} records from {len(per_trace_schemas)} traces, {len(tool_schema)} unique tools",
         details={"records": len(records), "traces": len(per_trace_schemas), "tools": len(tool_schema)})

    # Extract + rewrite system prompt BEFORE writing records,
    # then normalize all records to use the ONE canonical prompt.
    # OpenAI best practice: "Make sure all of your training examples
    # are in the same format expected for inference." Varying system
    # prompts across training records breaks anchoring.
    try:
        prompt = build_system_prompt(
            records, tool_schema, _identity_rewrite, fallback=args.fallback
        )
    except ValueError as exc:
        print(f"[2/6] prompt skipped: {exc}", file=sys.stderr)
        prompt = ""
    if prompt:
        (out_dir / "system_prompt.txt").write_text(prompt)

        # Normalize: replace every record's system prompt with the canonical one.
        # Records that have no system message at all get one injected at the front.
        normalized = 0
        for rec in records:
            msgs = rec.get("messages") or []
            has_system = any(m.get("role") == "system" for m in msgs)
            if has_system:
                for m in msgs:
                    if m.get("role") == "system":
                        m["content"] = prompt
                        normalized += 1
                        break
            else:
                rec["messages"] = [{"role": "system", "content": prompt}] + msgs
                normalized += 1
        print(f"[2/6] wrote system prompt ({len(prompt)} chars, normalized {normalized} records)")
        print(
            "  ⚠ Using identity rewrite (pass-through). For production,\n"
            "    inject a real LLM rewrite_fn to strip dynamic context\n"
            "    (dates, user IDs, capability claims) from the prompt."
        )
        jlog("stage_2_prompt", "rewrite_system_prompt", "completed",
             f"System prompt: {len(prompt)} chars, normalized {normalized} records",
             details={"prompt_chars": len(prompt), "normalized": normalized})
    else:
        print(f"[2/6] no system prompt extracted")
        jlog("stage_2_prompt", "rewrite_system_prompt", "skipped", "No system prompt found in traces")

    # NOW write records (with normalized prompts)
    _write_jsonl(out_dir / "training.jsonl", records)
    _write_json(out_dir / "per_record_tools.json", tool_schema)

    hierarchy, per_record = build_both(tool_schema, records)
    _write_json(
        out_dir / "topics.json",
        {"hierarchy": hierarchy, "per_record_tools": per_record},
    )
    agent_count = len(hierarchy.get("children", []))
    leaf_count = sum(
        len(a.get("children", []))
        for a in hierarchy.get("children", [])
    )
    print(f"[3/6] built topics ({agent_count} agents, {leaf_count} patterns)")
    jlog("stage_3_topics", "build_topic_hierarchy", "completed",
         f"{agent_count} agents, {leaf_count} tool patterns",
         details={"agents": agent_count, "patterns": leaf_count})

    grader = build_grader_config(tool_schema)
    _write_json(out_dir / "grader.json", grader)
    print(f"[4/6] built grader config")
    jlog("stage_4_grader", "build_grader_config", "completed",
         f"Jaccard grader with {len(tool_schema)} tool schemas")

    training_config = build_training_config(records)
    _write_json(out_dir / "training_config.json", training_config)
    print(f"[5/6] wrote training config (temp={training_config['temperature']}, K={training_config['num_generations']})")
    jlog("stage_5_hparams", "build_training_config", "completed",
         f"temp={training_config['temperature']}, K={training_config['num_generations']}, max_output_tokens={training_config.get('max_output_tokens', '?')}",
         details=training_config)

    # Publish to gateway (create workflow + upload bundle + register source)
    # Large bundles (>10MB JSON) cause broken-pipe errors on the gateway.
    # Auto-subsample to MAX_UPLOAD_TRACES to stay within limits.
    MAX_UPLOAD_TRACES = 500
    print(f"[6/6] publishing to gateway ({args.gateway})...")
    name = args.name or Path(args.spans).stem

    # Subsample if the full bundle is too large
    upload_spans = spans
    by_trace: dict[str, list] = {}
    for s in spans:
        by_trace.setdefault(s.get("trace_id", ""), []).append(s)
    if len(by_trace) > MAX_UPLOAD_TRACES:
        subset_traces = dict(list(by_trace.items())[:MAX_UPLOAD_TRACES])
        upload_spans = [s for tspans in subset_traces.values() for s in tspans]
        print(
            f"  subsampled {len(by_trace)} traces → {MAX_UPLOAD_TRACES} "
            f"({len(upload_spans)} spans) for gateway upload"
        )

    try:
        result = publish_to_gateway(
            args.gateway, upload_spans, name, artifacts_dir=out_dir,
        )
        _write_json(out_dir / "config.json", result)
        workflow_id = result.get("workflow_id", "")
        jlog("stage_6_publish", "publish_to_gateway", "completed",
             f"Published to gateway: workflow {workflow_id}",
             details=result, workflow_id=workflow_id)
    except RuntimeError as exc:
        print(f"[6/6] ⚠ gateway publish failed: {exc}")
        print("  local artifacts are fine — publish manually later with:")
        print(f"  finetune-otel.py publish {args.spans} --name '{name}'")
        jlog("stage_6_publish", "publish_to_gateway", "failed",
             f"Gateway publish failed: {exc}")

    print(f"\nall stages complete → {out_dir}/")
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

    p_up = sub.add_parser("upload", help="Upload semconv spans to gateway as trace bundle")
    p_up.add_argument("spans", type=Path, help="Semconv spans JSON")
    p_up.add_argument("--workflow-id", type=str, required=True)
    p_up.add_argument("--name", type=str, required=True, help="Bundle display name")
    p_up.add_argument(
        "--gateway", type=str, default="http://localhost:9090",
        help="Gateway URL (default: http://localhost:9090)",
    )
    p_up.set_defaults(func=cmd_upload)

    p_pub = sub.add_parser(
        "publish",
        help="Create workflow + upload bundle + register source (all-in-one gateway integration)",
    )
    p_pub.add_argument("spans", type=Path, help="Semconv spans JSON")
    p_pub.add_argument("--name", type=str, required=True, help="Workflow + bundle name")
    p_pub.add_argument("--objective", type=str, default=None, help="Workflow objective")
    p_pub.add_argument(
        "--gateway", type=str, default="http://localhost:9090",
        help="Gateway URL (default: http://localhost:9090)",
    )
    p_pub.set_defaults(func=cmd_publish)

    p_all = sub.add_parser(
        "all",
        help="Run distill → topics → grader → prompt → hparams → publish to gateway",
    )
    p_all.add_argument("spans", type=Path)
    p_all.add_argument("--out-dir", type=Path, required=True)
    p_all.add_argument("--fallback", type=str, default=None)
    p_all.add_argument(
        "--name", type=str, default=None,
        help="Workflow name for gateway publish (default: spans filename stem)",
    )
    p_all.add_argument(
        "--gateway", type=str, default="http://localhost:9090",
        help="Gateway URL (default: http://localhost:9090)",
    )
    p_all.set_defaults(func=cmd_all)

    # ── Eval ──
    p_eval = sub.add_parser("eval", help="Create an evaluation run on the cloud")
    p_eval.add_argument("--workflow-id", type=str, required=True)
    p_eval.add_argument("--model", type=str, default="Qwen3.5-4B", help="Rollout model (base model for eval)")
    p_eval.add_argument("--poll", action="store_true", help="Poll until complete")
    p_eval.add_argument("--poll-interval", type=int, default=30)
    p_eval.add_argument("--max-wait", type=int, default=1800)
    p_eval.add_argument("--output-dir", type=Path, default="evaluations",
                        help="Directory for eval metadata (default: evaluations/)")
    p_eval.add_argument(
        "--gateway", type=str, default="http://localhost:9090",
    )
    p_eval.set_defaults(func=cmd_eval)

    # ── Train ──
    p_train = sub.add_parser("train", help="Create a GRPO training job on the cloud")
    p_train.add_argument("--workflow-id", type=str, required=True)
    p_train.add_argument("--base-model", type=str, default=None, help="Base model (default: Qwen3.5-4B)")
    p_train.add_argument("--output-model", type=str, default=None, help="Output model name")
    p_train.add_argument("--display-name", type=str, default=None)
    p_train.add_argument("--config-file", type=Path, default=None, help="training_config.json from Stage 7")
    p_train.add_argument("--config-overrides", type=str, default=None, help="JSON overrides for training config")
    p_train.add_argument("--output-dir", type=Path, default="training-jobs",
                        help="Directory for training job metadata (default: training-jobs/)")
    p_train.add_argument(
        "--gateway", type=str, default="http://localhost:9090",
    )
    p_train.set_defaults(func=cmd_train)

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
