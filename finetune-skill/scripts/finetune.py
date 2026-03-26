# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Gateway API wrapper for the vLLora finetune skill pipeline.

Provides subcommands for every gateway operation the skill needs.
Replaces inline curl commands with a single, testable script.

Usage:
  uv run scripts/finetune.py create-workflow --name "My Project" --objective "Train a model to..."
  uv run scripts/finetune.py upload-knowledge --workflow-id WF_ID --file doc.pdf --parts-file knowledge_parts.json
  uv run scripts/finetune.py upload-topics --workflow-id WF_ID --file topics.json
  uv run scripts/finetune.py upload-relations --workflow-id WF_ID --file relations.json
  uv run scripts/finetune.py upload-records --workflow-id WF_ID --file training.jsonl
  uv run scripts/finetune.py upload-grader --workflow-id WF_ID --file grader.js
  uv run scripts/finetune.py verify --workflow-id WF_ID

Exit codes:
  0 - success
  1 - error (details on stderr)
"""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:9090"
DEFAULT_DB_PATH = Path.home() / ".vllora" / "vllora.db"


def _api(method: str, url: str, **kwargs) -> dict:
    """Make an API call, handle errors, return JSON response."""
    try:
        resp = requests.request(method, url, **kwargs)
        resp.raise_for_status()
        if resp.content:
            return resp.json()
        return {}
    except requests.HTTPError as e:
        print(f"Error: {method} {url} → {e.response.status_code}", file=sys.stderr)
        print(f"  Response: {e.response.text[:500]}", file=sys.stderr)
        sys.exit(1)
    except requests.ConnectionError:
        base = url.split("/finetune")[0]
        print(f"Error: Cannot connect to {base}. Is the gateway running?", file=sys.stderr)
        sys.exit(1)


def cmd_create_workflow(args: argparse.Namespace) -> None:
    """Create a new workflow and print its ID."""
    payload = {"name": args.name, "objective": args.objective}

    result = _api("POST", f"{args.base_url}/finetune/workflows", json=payload)
    workflow_id = result.get("id", "unknown")

    print(f"Workflow created successfully.")
    print(f"  ID: {workflow_id}")
    print(f"  Name: {args.name}")

    # Print just the ID to stdout for easy capture: WORKFLOW_ID=$(uv run ... | tail -1)
    print(workflow_id)


def _delete_existing_knowledge_by_name(
    base_url: str, workflow_id: str, source_name: str,
) -> int:
    """Delete existing knowledge sources matching a name. Returns count deleted."""
    existing = _api("GET", f"{base_url}/finetune/workflows/{workflow_id}/knowledge")
    sources = existing if isinstance(existing, list) else existing.get("sources", [])

    deleted = 0
    for src in sources:
        if src.get("name") != source_name:
            continue
        ks_id = src.get("id")
        if not ks_id:
            continue
        _api("DELETE", f"{base_url}/finetune/workflows/{workflow_id}/knowledge/{ks_id}")
        print(f"  Deleted existing source: {ks_id} ({source_name})")
        deleted += 1
    return deleted


def _upload_knowledge_parts(
    base_url: str, workflow_id: str, ks_id: str, parts_file_path: str,
) -> None:
    """Parse and upload knowledge source parts from a JSON file."""
    parts_path = Path(parts_file_path)
    if not parts_path.exists():
        print(f"Error: Parts file not found: {parts_path}", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(parts_path.read_text())
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in parts file: {e}", file=sys.stderr)
        sys.exit(1)

    raw_parts = _extract_parts_array(data)
    if not raw_parts:
        print("Warning: Parts file contains 0 parts — nothing to upload.", file=sys.stderr)
        return

    # Transform: move 'id' to 'reference_id', remove 'source_id'
    parts = [_transform_part(p) for p in raw_parts]

    result = _api(
        "POST",
        f"{base_url}/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts",
        json=parts,
    )
    added = result.get("added", len(parts))
    print(f"  Parts uploaded: {added}")


def _extract_parts_array(data) -> list:
    """Extract parts array from various JSON formats."""
    if isinstance(data, dict) and "parts" in data:
        return data["parts"]
    if isinstance(data, list):
        return data
    print(
        "Error: Parts file must contain a JSON array or an object with a 'parts' key.",
        file=sys.stderr,
    )
    keys = list(data.keys()) if isinstance(data, dict) else "N/A"
    print(f"  Got: {type(data).__name__} with keys: {keys}", file=sys.stderr)
    sys.exit(1)


def _transform_part(p: dict) -> dict:
    """Transform a part: move 'id' to 'reference_id', remove 'source_id'."""
    part = {**p}
    if "id" in part:
        part["reference_id"] = part.pop("id")
    part.pop("source_id", None)
    return part


def cmd_upload_knowledge(args: argparse.Namespace) -> None:
    """Upload a knowledge source (document + extracted parts) to a workflow.

    Expected parts file format (knowledge_parts.json):
      {"source": {...}, "parts": [{"id": "doc-1-ch3", "type": "text", "title": "...", "content": "..."}]}
    Or a bare array of part objects.

    Transforms: 'id' → 'reference_id', removes 'source_id' before upload.
    When --force is set, deletes existing sources with the same name before uploading.
    """
    doc_path = Path(args.file)
    if not doc_path.exists():
        print(f"Error: Document not found: {doc_path}", file=sys.stderr)
        sys.exit(1)

    source_name = args.name or doc_path.name

    # When --force, delete existing sources with same name first to avoid duplicates
    if args.force:
        deleted = _delete_existing_knowledge_by_name(
            args.base_url, args.workflow_id, source_name,
        )
        if deleted:
            print(f"  Force mode: removed {deleted} existing source(s)")

    # Upload the document as a knowledge source (always POST after cleanup)
    files = {"file": (doc_path.name, doc_path.open("rb"), "application/pdf")}
    form_data = {
        "name": source_name,
        "description": args.description or f"Source document: {doc_path.name}",
    }
    if args.metadata:
        form_data["metadata"] = args.metadata

    result = _api(
        "POST",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/knowledge",
        files=files,
        data=form_data,
    )
    ks_id = result.get("knowledge_source", {}).get("id", "unknown")
    print(f"Knowledge source uploaded: {ks_id}")

    # Upload parts if provided
    if args.parts_file:
        _upload_knowledge_parts(args.base_url, args.workflow_id, ks_id, args.parts_file)

    print(f"  Knowledge source ID: {ks_id}")


def cmd_upload_topics(args: argparse.Namespace) -> None:
    """Upload topic hierarchy to a workflow."""
    topics_path = Path(args.file)
    if not topics_path.exists():
        print(f"Error: Topics file not found: {topics_path}", file=sys.stderr)
        sys.exit(1)

    topics = json.loads(topics_path.read_text())
    if isinstance(topics, list):
        raw_topics = topics
    elif isinstance(topics, dict) and "topics" in topics:
        raw_topics = topics["topics"]
    else:
        raw_topics = [topics]

    # If --force, delete existing topics first
    if getattr(args, "force", False):
        existing = _api("GET", f"{args.base_url}/finetune/workflows/{args.workflow_id}/topics")
        existing_topics = existing if isinstance(existing, list) else existing.get("topics", [])
        if existing_topics:
            ids = [t["id"] for t in existing_topics if t.get("id")]
            if ids:
                _api("DELETE", f"{args.base_url}/finetune/workflows/{args.workflow_id}/topics",
                     json={"identifiers": ids})
                print(f"  Deleted {len(ids)} existing topics")

    # Transform: move user's human-readable 'id' → 'reference_id' and assign
    # fresh UUIDs as the real 'id'. User-supplied IDs like "protein-science"
    # are globally unique in the DB (PRIMARY KEY), causing collisions when
    # multiple workflows use the same topic names. By generating UUIDs and
    # keeping human-readable names as reference_id (workflow-scoped), we avoid
    # collisions while keeping identifiers for relations/records lookups.
    import uuid as _uuid

    # Build old_id → new_uuid map so we can remap parent_id references
    id_remap: dict[str, str] = {}
    for t in raw_topics:
        old_id = t.get("id")
        if old_id and not _looks_like_uuid(old_id):
            id_remap[old_id] = str(_uuid.uuid4())

    transformed = []
    for t in raw_topics:
        topic = {**t}
        old_id = topic.get("id")
        if old_id and old_id in id_remap:
            topic["id"] = id_remap[old_id]
            if "reference_id" not in topic:
                topic["reference_id"] = old_id
        # Remap parent_id to use the new UUID
        old_parent = topic.get("parent_id")
        if old_parent and old_parent in id_remap:
            topic["parent_id"] = id_remap[old_parent]
        transformed.append(topic)

    # Upload in topological order: roots first, then children, then grandchildren.
    # The gateway requires parent topics to exist before their children (FK constraint).
    uploaded_ids: set[str] = set()
    remaining = list(transformed)
    total_created = 0

    # Safety limit to prevent infinite loops on circular references
    max_rounds = 10
    for round_num in range(max_rounds):
        batch = [
            t for t in remaining
            if not t.get("parent_id") or t["parent_id"] in uploaded_ids
        ]
        if not batch:
            break

        result = _api(
            "POST",
            f"{args.base_url}/finetune/workflows/{args.workflow_id}/topics",
            json={"topics": batch},
        )
        created = result.get("created", len(batch))
        total_created += created
        uploaded_ids.update(t["id"] for t in batch if t.get("id"))
        remaining = [t for t in remaining if t not in batch]
        print(f"  Round {round_num + 1}: uploaded {created} topics")

        if not remaining:
            break

    if remaining:
        print(f"Warning: {len(remaining)} topics could not be uploaded (orphan parent_id?)", file=sys.stderr)
        for t in remaining:
            print(f"  - {t.get('reference_id', t.get('id'))}: parent_id={t.get('parent_id')}", file=sys.stderr)

    print(f"Topics uploaded: {total_created}")


def _looks_like_uuid(s: str) -> bool:
    """Check if a string looks like a UUID (8-4-4-4-12 hex pattern)."""
    import re
    return bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', s, re.I))


def _resolve_identifiers_to_uuids(
    workflow_id: str, relations: list[dict], db_path: Path,
) -> list[dict]:
    """Resolve reference_id-based identifiers to UUIDs scoped to this workflow.

    The gateway's create_relations endpoint looks up parts globally (not scoped to
    the workflow). If the same reference_id exists in parts from old/deleted workflows,
    the lookup can match the wrong part and fail validation. Resolving to UUIDs here
    avoids the ambiguity.
    """
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()

    # Build topic ref→uuid map for this workflow
    topic_rows = c.execute(
        "SELECT id, reference_id FROM workflow_topics WHERE workflow_id = ?",
        (workflow_id,),
    ).fetchall()
    topic_map: dict[str, str] = {}
    for row_id, ref_id in topic_rows:
        topic_map[row_id] = row_id
        if ref_id:
            topic_map[ref_id] = row_id

    # Build part ref→uuid map scoped to this workflow's active knowledge sources
    part_rows = c.execute(
        "SELECT ksp.id, ksp.reference_id FROM knowledge_source_parts ksp "
        "JOIN knowledge_sources ks ON ksp.source_id = ks.id "
        "WHERE ks.workflow_id = ? AND ks.deleted_at IS NULL",
        (workflow_id,),
    ).fetchall()
    part_map: dict[str, str] = {}
    for row_id, ref_id in part_rows:
        part_map[row_id] = row_id
        if ref_id:
            part_map[ref_id] = row_id

    conn.close()

    resolved = []
    skipped = 0
    for rel in relations:
        topic_id = topic_map.get(rel["topic_identifier"])
        part_id = part_map.get(rel["part_identifier"])
        if not topic_id:
            skipped += 1
            print(f"  Warning: topic '{rel['topic_identifier']}' not found — skipping relation", file=sys.stderr)
            continue
        if not part_id:
            skipped += 1
            print(f"  Warning: part '{rel['part_identifier']}' not found — skipping relation", file=sys.stderr)
            continue
        resolved.append({**rel, "topic_identifier": topic_id, "part_identifier": part_id})

    if skipped:
        print(f"  {skipped} relations skipped (missing topics/parts)", file=sys.stderr)

    return resolved


def cmd_upload_relations(args: argparse.Namespace) -> None:
    """Upload topic-source relations to a workflow.

    Resolves reference_ids to UUIDs locally before uploading to avoid ambiguity
    when the same reference_id exists in parts from multiple workflows.
    """
    relations_path = Path(args.file)
    if not relations_path.exists():
        print(f"Error: Relations file not found: {relations_path}", file=sys.stderr)
        sys.exit(1)

    relations = json.loads(relations_path.read_text())
    if isinstance(relations, list):
        rel_list = relations
    elif isinstance(relations, dict) and "relations" in relations:
        rel_list = relations["relations"]
    else:
        rel_list = [relations]

    # Resolve reference_ids to UUIDs scoped to this workflow
    db_path = Path(args.db) if hasattr(args, "db") and args.db else DEFAULT_DB_PATH
    resolved = _resolve_identifiers_to_uuids(args.workflow_id, rel_list, db_path)

    if not resolved:
        print("Error: No valid relations after resolving identifiers", file=sys.stderr)
        sys.exit(1)

    payload = {"relations": resolved}
    result = _api(
        "POST",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/topics/relations",
        json=payload,
    )
    created = result.get("created", len(resolved))
    print(f"Relations uploaded: {created}")


def cmd_upload_records(args: argparse.Namespace) -> None:
    """Upload training records from a JSONL file to a workflow.

    Transforms from skill format (top-level messages) to gateway format
    (nested data.input.messages). Resolves topic reference_ids to UUIDs.
    Uploads in batches.
    """
    records_path = Path(args.file)
    if not records_path.exists():
        print(f"Error: Records file not found: {records_path}", file=sys.stderr)
        sys.exit(1)

    # If --force, delete existing records first
    if getattr(args, "force", False):
        _api("DELETE", f"{args.base_url}/finetune/workflows/{args.workflow_id}/records")
        print("  Deleted all existing records")

    # Build topic reference_id → UUID map (same pattern as upload-relations)
    db_path = Path(args.db) if hasattr(args, "db") and args.db else DEFAULT_DB_PATH
    topic_map: dict[str, str] = {}
    try:
        conn = sqlite3.connect(str(db_path))
        rows = conn.execute(
            "SELECT id, reference_id FROM workflow_topics WHERE workflow_id = ?",
            (args.workflow_id,),
        ).fetchall()
        for row_id, ref_id in rows:
            topic_map[row_id] = row_id
            if ref_id:
                topic_map[ref_id] = row_id
        conn.close()
    except Exception as e:
        print(f"Warning: Could not load topic map from DB: {e}", file=sys.stderr)
        print("  Topics in records will be passed as-is (may fail if not UUIDs)", file=sys.stderr)

    records = []
    parse_errors = 0
    topic_misses = 0
    for line_num, line in enumerate(records_path.read_text().strip().splitlines(), 1):
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            parse_errors += 1
            print(f"Warning: Skipping invalid JSON on line {line_num}", file=sys.stderr)
            continue

        data_obj = {"input": {"messages": r["messages"]}, "output": {}}
        if r.get("ground_truth"):
            data_obj["ground_truth"] = r["ground_truth"]
        record = {
            "id": r["id"],
            "data": data_obj,
            "is_generated": True,
        }
        if r.get("topic"):
            resolved = topic_map.get(r["topic"])
            if resolved:
                record["topic"] = resolved
            else:
                record["topic"] = r["topic"]
                topic_misses += 1
        if r.get("source_parts"):
            record["metadata"] = json.dumps({"source_parts": r["source_parts"]})
        records.append(record)

    if topic_misses:
        print(f"Warning: {topic_misses} records have unresolved topic IDs", file=sys.stderr)

    if parse_errors:
        print(f"Warning: {parse_errors} lines skipped due to JSON errors", file=sys.stderr)

    if not records:
        print("Error: No valid records found in file", file=sys.stderr)
        sys.exit(1)

    # Upload in batches to avoid huge payloads
    batch_size = args.batch_size
    total_uploaded = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        result = _api(
            "POST",
            f"{args.base_url}/finetune/workflows/{args.workflow_id}/records",
            json={"records": batch},
        )
        added = result.get("added", len(batch))
        total_uploaded += added
        if len(records) > batch_size:
            print(f"  Batch {i // batch_size + 1}: {added} records")

    print(f"Records uploaded: {total_uploaded}")


def cmd_upload_grader(args: argparse.Namespace) -> None:
    """Upload a grader/evaluator script to a workflow.

    The gateway expects multipart form data with the script in a 'file' field.
    It validates the script, wraps it as a JS evaluator config, and stores it
    in the workflow's eval_script column.
    """
    grader_path = Path(args.file)
    if not grader_path.exists():
        print(f"Error: Grader file not found: {grader_path}", file=sys.stderr)
        sys.exit(1)

    files = {"file": (grader_path.name, grader_path.open("rb"), "application/javascript")}

    _api(
        "PATCH",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/evaluator",
        files=files,
    )
    print(f"Grader uploaded: {grader_path.name}")


def cmd_verify(args: argparse.Namespace) -> None:
    """Verify all data landed in the gateway database."""
    db_path = Path(args.db) if args.db else DEFAULT_DB_PATH
    if not db_path.exists():
        print(f"Error: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    wf_id = args.workflow_id
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()

    checks = {
        "Records": ("SELECT COUNT(*) FROM workflow_records WHERE workflow_id = ?", (wf_id,)),
        "Topics": ("SELECT COUNT(*) FROM workflow_topics WHERE workflow_id = ?", (wf_id,)),
        "Sources": ("SELECT COUNT(*) FROM knowledge_sources WHERE workflow_id = ?", (wf_id,)),
        "Parts": (
            "SELECT COUNT(*) FROM knowledge_source_parts WHERE source_id IN "
            "(SELECT id FROM knowledge_sources WHERE workflow_id = ?)",
            (wf_id,),
        ),
        "Relations": ("SELECT COUNT(*) FROM workflow_topic_sources WHERE workflow_id = ?", (wf_id,)),
    }

    print(f"Workflow: {wf_id}")
    all_ok = True
    for label, (query, params) in checks.items():
        try:
            count = c.execute(query, params).fetchone()[0]
        except sqlite3.OperationalError:
            count = "ERROR"
        status = "OK" if isinstance(count, int) and count > 0 else "MISSING"
        if status == "MISSING":
            all_ok = False
        print(f"  {label}: {count} [{status}]")

    # Check evaluator (column is 'eval_script' in the workflows table)
    try:
        has_eval = c.execute(
            "SELECT CASE WHEN eval_script IS NOT NULL THEN 'YES' ELSE 'NO' END FROM workflows WHERE id = ?",
            (wf_id,),
        ).fetchone()[0]
    except sqlite3.OperationalError:
        has_eval = "ERROR"
    if has_eval != "YES":
        all_ok = False
    print(f"  Evaluator: {has_eval}")

    conn.close()

    if all_ok:
        print("\nAll checks passed. Ready for evaluation.")
    else:
        print("\nSome checks failed. Re-run the upload for missing items.", file=sys.stderr)
        sys.exit(1)


def cmd_create_eval(args: argparse.Namespace) -> None:
    """Create an evaluation job and save metadata locally.

    Calls POST /finetune/evaluations to start an eval run, then saves
    job metadata to the local evaluations/ directory for tracking.
    """
    from datetime import datetime, timezone

    model = args.model or "gpt-4o-mini"
    payload = {
        "dataset_id": args.workflow_id,
        "rollout_model_params": {
            "model": model,
            "temperature": 0.7,
        },
    }

    result = _api(
        "POST",
        f"{args.base_url}/finetune/evaluations",
        json=payload,
    )

    eval_id = result.get("evaluation_run_id", result.get("id", "unknown"))
    print(f"Evaluation created: {eval_id}")

    # Save locally
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Find next version number
    existing = sorted(out_dir.glob("eval-*.json"))
    version = len(existing) + 1
    out_file = out_dir / f"eval-{version:03d}.json"

    metadata = {
        "evaluation_run_id": eval_id,
        "workflow_id": args.workflow_id,
        "status": "running",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "results": None,
    }
    out_file.write_text(json.dumps(metadata, indent=2))
    print(f"Saved: {out_file}")


def _update_eval_metadata(metadata: dict, result: dict) -> dict:
    """Update eval metadata dict from an API poll response. Returns new dict."""
    return {
        **metadata,
        "status": result.get("status", metadata.get("status")),
        "completed_rows": result.get("completed_rows"),
        "total_rows": result.get("total_rows"),
        "results": result.get("results"),
        "summary": result.get("summary"),
    }


def cmd_poll_eval(args: argparse.Namespace) -> None:
    """Poll an evaluation job until complete and save results locally.

    Reads the eval metadata from the local file, polls the gateway,
    updates the file with progress on every poll, and stops on completion.
    """
    import time

    eval_file = Path(args.file)
    if not eval_file.exists():
        print(f"Error: Eval file not found: {eval_file}", file=sys.stderr)
        sys.exit(1)

    metadata = json.loads(eval_file.read_text())
    eval_id = metadata["evaluation_run_id"]
    poll_interval = args.poll_interval
    max_wait = args.max_wait

    print(f"Polling eval {eval_id} every {poll_interval}s (max {max_wait}s)...")
    elapsed = 0
    status = "unknown"
    while elapsed < max_wait:
        try:
            result = _api("GET", f"{args.base_url}/finetune/evaluations/{eval_id}")
        except SystemExit:
            print(f"  [{elapsed}s] API error — retrying...", file=sys.stderr)
            time.sleep(poll_interval)
            elapsed += poll_interval
            continue

        status = result.get("status", "unknown")
        completed = result.get("completed_rows", "?")
        total = result.get("total_rows", "?")
        print(f"  [{elapsed}s] {status} ({completed}/{total} rows)", flush=True)

        # Update local JSON on every poll for progress tracking
        metadata = _update_eval_metadata(metadata, result)
        eval_file.write_text(json.dumps(metadata, indent=2))

        if status in ("completed", "failed", "error"):
            metadata["completed_at"] = result.get("completed_at")
            eval_file.write_text(json.dumps(metadata, indent=2))
            print(f"Done: {status}. Saved to {eval_file}")
            if status != "completed":
                sys.exit(1)
            return

        time.sleep(poll_interval)
        elapsed += poll_interval

    print(f"Timeout after {max_wait}s. Eval still {status}.", file=sys.stderr)
    metadata["status"] = f"timeout ({status})"
    eval_file.write_text(json.dumps(metadata, indent=2))
    sys.exit(1)


def cmd_create_training(args: argparse.Namespace) -> None:
    """Create a training job and save metadata locally.

    Calls POST /finetune/workflows/{id}/jobs, then lists jobs to get the
    internal ID (the POST returns provider_job_id, not the internal ID).
    Saves job metadata to the local training-jobs/ directory.
    """
    from datetime import datetime, timezone

    payload = {
        "job_type": "provider_finetune",
        "dataset": args.workflow_id,
        "base_model": args.base_model,
        "output_model": args.output_model or f"finetune-v1",
    }

    if args.config:
        try:
            payload["training_config"] = json.loads(args.config)
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON for --config", file=sys.stderr)
            sys.exit(1)
    else:
        payload["training_config"] = {
            "learning_rate": 0.000001,  # 1e-6: universal GRPO consensus (DeepSeekMath, DAPO, Dr. GRPO, TRL default)
            "lora_rank": 8,
            "gradient_accumulation_steps": 5,
            "epochs": 2,
            "batch_size": 5,
        }

    if args.inference_params:
        try:
            payload["inference_parameters"] = json.loads(args.inference_params)
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON for --inference-params", file=sys.stderr)
            sys.exit(1)
    else:
        payload["inference_parameters"] = {
            "max_output_tokens": 512,
            "temperature": 1.0,
            "top_p": 1.0,
            "response_candidates_count": 8,  # GRPO minimum: all published work uses G>=8 (DeepSeekMath G=64, DAPO G=16, TRL default G=8)
        }

    result = _api(
        "POST",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/jobs",
        json=payload,
    )

    provider_job_id = result.get("job_id", result.get("id", "unknown"))
    print(f"Training job created (provider_job_id: {provider_job_id})")

    # List jobs to find the internal ID (POST returns provider_job_id, not internal ID)
    jobs = _api(
        "GET",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/jobs",
    )
    job_list = jobs if isinstance(jobs, list) else jobs.get("jobs", [])
    internal_id = provider_job_id
    for j in job_list:
        if j.get("provider_job_id") == provider_job_id:
            internal_id = j["id"]
            break

    print(f"Internal job ID: {internal_id}")

    # Save locally
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    existing = sorted(out_dir.glob("train-*.json"))
    version = len(existing) + 1
    out_file = out_dir / f"train-{version:03d}.json"

    metadata = {
        "job_id": internal_id,
        "provider_job_id": provider_job_id,
        "workflow_id": args.workflow_id,
        "base_model": args.base_model,
        "output_model": payload.get("output_model"),
        "training_config": payload["training_config"],
        "inference_parameters": payload["inference_parameters"],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    out_file.write_text(json.dumps(metadata, indent=2))
    print(f"Saved: {out_file}")


def _poll_training_once(base_url: str, wf_id: str, job_id: str) -> dict:
    """Fetch training job status from the jobs list (single-job endpoint is broken)."""
    jobs = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/jobs")
    job_list = jobs if isinstance(jobs, list) else jobs.get("jobs", [])
    for job in job_list:
        if job.get("id") == job_id:
            return job
    raise SystemExit(f"Error: Job {job_id} not found in workflow {wf_id}")


def _save_training_side_files(
    base_url: str, wf_id: str, job_id: str, output_dir: Path,
) -> None:
    """Fetch and save metrics + epoch evals to side files."""
    metrics_file = output_dir / f"{job_id}-metrics.json"
    try:
        metrics = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/metrics")
        metrics_file.write_text(json.dumps(metrics, indent=2))
    except SystemExit:
        print(f"  Warning: Could not fetch metrics", file=sys.stderr)

    evals_file = output_dir / f"{job_id}-epoch-evals.json"
    try:
        evals = _api(
            "GET",
            f"{base_url}/finetune/workflows/{wf_id}/finetune-evaluations",
            params={"finetune_job_id": job_id},
        )
        evals_file.write_text(json.dumps(evals, indent=2))
    except SystemExit:
        print(f"  Warning: Could not fetch epoch evals", file=sys.stderr)


def cmd_poll_training(args: argparse.Namespace) -> None:
    """Poll a training job until complete, saving status and metrics locally."""
    import time

    job_file = Path(args.file)
    if not job_file.exists():
        print(f"Error: Job file not found: {job_file}", file=sys.stderr)
        sys.exit(1)

    metadata = json.loads(job_file.read_text())
    job_id = metadata["job_id"]
    wf_id = args.workflow_id or metadata.get("workflow_id")
    if not wf_id:
        print("Error: --workflow-id not provided and not found in job file", file=sys.stderr)
        sys.exit(1)
    poll_interval = args.poll_interval
    max_wait = args.max_wait
    output_dir = job_file.parent

    print(f"Polling training job {job_id} every {poll_interval}s (max {max_wait}s)...")
    elapsed = 0
    status = "unknown"
    while elapsed < max_wait:
        try:
            result = _poll_training_once(args.base_url, wf_id, job_id)
        except SystemExit:
            print(f"  [{elapsed}s] API error — retrying...", file=sys.stderr)
            time.sleep(poll_interval)
            elapsed += poll_interval
            continue

        status = result.get("status", "unknown")
        print(f"  [{elapsed}s] {status}", flush=True)

        metadata["status"] = status
        job_file.write_text(json.dumps(metadata, indent=2))

        _save_training_side_files(args.base_url, wf_id, job_id, output_dir)

        if status in ("succeeded", "completed", "failed", "cancelled"):
            metadata["completed_at"] = result.get("completed_at")
            metadata["fine_tuned_model"] = result.get("fine_tuned_model")
            metadata["error_message"] = result.get("error_message")
            job_file.write_text(json.dumps(metadata, indent=2))
            print(f"Done: {status}. Saved to {job_file}")
            if status == "failed":
                sys.exit(1)
            return

        time.sleep(poll_interval)
        elapsed += poll_interval

    print(f"Timeout after {max_wait}s. Training still {status}.", file=sys.stderr)
    metadata["status"] = f"timeout ({status})"
    job_file.write_text(json.dumps(metadata, indent=2))
    sys.exit(1)


def cmd_delete_knowledge(args: argparse.Namespace) -> None:
    """Delete knowledge sources from a workflow.

    With --source-id: delete a specific source.
    With --all: delete all sources for the workflow.
    """
    wf_url = f"{args.base_url}/finetune/workflows/{args.workflow_id}/knowledge"

    if args.source_id:
        _api("DELETE", f"{wf_url}/{args.source_id}")
        print(f"Deleted knowledge source: {args.source_id}")
        return

    if not args.all:
        print("Error: Specify --source-id or --all", file=sys.stderr)
        sys.exit(1)

    existing = _api("GET", wf_url)
    sources = existing if isinstance(existing, list) else existing.get("sources", [])

    if not sources:
        print("No knowledge sources to delete.")
        return

    deleted = 0
    for src in sources:
        ks_id = src.get("id")
        if not ks_id:
            continue
        _api("DELETE", f"{wf_url}/{ks_id}")
        print(f"  Deleted: {ks_id} ({src.get('name', 'unnamed')})")
        deleted += 1

    print(f"Deleted {deleted} knowledge source(s).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="vLLora gateway API wrapper for the finetune skill pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--base-url", default=DEFAULT_BASE_URL, help="Gateway base URL (default: %(default)s)"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create-workflow
    p = subparsers.add_parser("create-workflow", help="Create a new workflow")
    p.add_argument("--name", required=True, help="Workflow name")
    p.add_argument("--objective", required=True, help="Training objective")
    # Note: system_prompt is NOT stored on the workflow. It's composed at record
    # generation time (Step 4) via generate_records.py --system-prompt.

    # upload-knowledge
    p = subparsers.add_parser("upload-knowledge", help="Upload a knowledge source + parts")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to source document (PDF, etc.)")
    p.add_argument("--parts-file", help="Path to knowledge_parts.json")
    p.add_argument("--name", help="Knowledge source name (default: filename)")
    p.add_argument("--description", help="Knowledge source description")
    p.add_argument("--metadata", help="JSON metadata string")
    p.add_argument("--force", action="store_true", help="Delete existing source with same name before uploading")

    # upload-topics
    p = subparsers.add_parser("upload-topics", help="Upload topic hierarchy")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to topics.json")
    p.add_argument("--force", action="store_true", help="Delete all existing topics before uploading")

    # upload-relations
    p = subparsers.add_parser("upload-relations", help="Upload topic-source relations")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to relations.json")
    p.add_argument("--db", help=f"Database path for identifier resolution (default: {DEFAULT_DB_PATH})")

    # upload-records
    p = subparsers.add_parser("upload-records", help="Upload training records from JSONL")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to training.jsonl")
    p.add_argument("--batch-size", type=int, default=200, help="Records per API call (default: 200)")
    p.add_argument("--force", action="store_true", help="Delete all existing records before uploading")
    p.add_argument("--db", default=None, help="Path to vLLora SQLite database (default: ~/.vllora/vllora.db)")

    # upload-grader
    p = subparsers.add_parser("upload-grader", help="Upload grader/evaluator script")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to grader.js")

    # verify
    p = subparsers.add_parser("verify", help="Verify all data in gateway database")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--db", help=f"Database path (default: {DEFAULT_DB_PATH})")

    # create-eval
    p = subparsers.add_parser("create-eval", help="Create evaluation job and save metadata locally")
    p.add_argument("--workflow-id", required=True, help="Workflow ID (used as dataset_id)")
    p.add_argument("--model", default=None, help="Rollout model override")
    p.add_argument("--output-dir", default="evaluations", help="Local directory for eval metadata (default: evaluations/)")

    # poll-eval
    p = subparsers.add_parser("poll-eval", help="Poll eval job until complete, save results")
    p.add_argument("--file", required=True, help="Path to eval metadata JSON (from create-eval)")
    p.add_argument("--poll-interval", type=int, default=30, help="Poll interval in seconds (default: 30)")
    p.add_argument("--max-wait", type=int, default=3600, help="Max wait in seconds (default: 3600)")

    # create-training
    p = subparsers.add_parser("create-training", help="Create training job and save metadata locally")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--base-model", required=True, help="Base model (e.g., unsloth/Qwen3.5-4B)")
    p.add_argument("--output-model", default=None, help="Output model name")
    p.add_argument("--config", default=None, help="Training config JSON string")
    p.add_argument("--inference-params", default=None, help="Inference parameters JSON string")
    p.add_argument("--output-dir", default="training-jobs", help="Local directory for job metadata (default: training-jobs/)")

    # poll-training
    p = subparsers.add_parser("poll-training", help="Poll training job until complete, save status and metrics")
    p.add_argument("--workflow-id", required=False, default=None, help="Workflow ID (read from job file if omitted)")
    p.add_argument("--file", required=True, help="Path to train-NNN.json (from create-training)")
    p.add_argument("--poll-interval", type=int, default=60, help="Poll interval in seconds (default: 60)")
    p.add_argument("--max-wait", type=int, default=14400, help="Max wait in seconds (default: 14400)")

    # delete-knowledge
    p = subparsers.add_parser("delete-knowledge", help="Delete knowledge source(s) from a workflow")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--source-id", default=None, help="Specific knowledge source ID to delete")
    p.add_argument("--all", action="store_true", help="Delete all knowledge sources")

    args = parser.parse_args()

    commands = {
        "create-workflow": cmd_create_workflow,
        "upload-knowledge": cmd_upload_knowledge,
        "upload-topics": cmd_upload_topics,
        "upload-relations": cmd_upload_relations,
        "upload-records": cmd_upload_records,
        "upload-grader": cmd_upload_grader,
        "verify": cmd_verify,
        "create-eval": cmd_create_eval,
        "poll-eval": cmd_poll_eval,
        "create-training": cmd_create_training,
        "poll-training": cmd_poll_training,
        "delete-knowledge": cmd_delete_knowledge,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
