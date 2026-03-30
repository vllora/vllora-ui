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


def cmd_status(args: argparse.Namespace) -> None:
    """Show full workflow status: gateway API data + local checkpoint + jobs.

    Single command to understand where a workflow stands — what's been
    uploaded, what jobs have run, and what the next step should be.
    Uses only the gateway REST API (no direct DB access).
    """
    wf_id = args.workflow_id
    project_dir = Path(args.project_dir)
    base_url = args.base_url

    print(f"=== Workflow Status: {wf_id[:12]}... ===\n")

    # ── Gateway data (via API) ──
    print("── Gateway Data ──")
    try:
        wf = _api("GET", f"{base_url}/finetune/workflows/{wf_id}")
    except SystemExit:
        print("  Workflow not found or gateway unreachable!")
        sys.exit(1)

    print(f"  Name: {wf.get('name', '?')}")
    obj = wf.get("objective", "")
    print(f"  Objective: {obj[:120]}{'...' if len(obj) > 120 else ''}")

    records_count = wf.get("records_count", wf.get("record_count", 0))
    has_grader = "YES" if wf.get("eval_script") else "NO"

    # Fetch topics and knowledge sources via API
    topics_count = "?"
    sources_count = "?"
    parts_count = "?"
    try:
        topics_resp = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/topics")
        topics_list = topics_resp if isinstance(topics_resp, list) else topics_resp.get("topics", [])
        topics_count = len(topics_list)
    except SystemExit:
        pass
    try:
        sources_resp = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/knowledge")
        sources_list = sources_resp if isinstance(sources_resp, list) else sources_resp.get("sources", [])
        sources_count = len(sources_list)
        parts_count = sum(s.get("part_count", s.get("parts_count", 0)) for s in sources_list)
    except SystemExit:
        pass

    print(f"  Records: {records_count}")
    print(f"  Topics: {topics_count}")
    print(f"  Sources: {sources_count} ({parts_count} parts)")
    print(f"  Grader: {has_grader}")

    # ── Finetune jobs (from gateway API) ──
    print("\n── Finetune Jobs ──")
    job_list = []
    try:
        jobs = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/jobs")
        job_list = jobs if isinstance(jobs, list) else jobs.get("jobs", [])
        if not job_list:
            print("  No finetune jobs")
        for j in job_list:
            model = j.get("base_model", "?")
            status = j.get("status", "?")
            jid = j.get("id", "?")[:12]
            print(f"  {jid}...  {status}  ({model})")
    except SystemExit:
        print("  Could not fetch jobs from gateway")

    # ── Local checkpoint ──
    print("\n── Local Checkpoint ──")
    checkpoint_file = project_dir / ".checkpoint.json"
    cp_steps: dict = {}
    if checkpoint_file.exists():
        cp = json.loads(checkpoint_file.read_text())
        cp_steps = cp.get("steps", {})
        for step_name, step_data in cp_steps.items():
            status = step_data.get("status", "?")
            completed = step_data.get("completed_at", "")[:19]
            print(f"  {step_name}: {status} ({completed})")
    else:
        print("  No checkpoint file found")

    def step_done(name: str) -> bool:
        return cp_steps.get(name, {}).get("status") == "completed"

    # ── Readiness gate (check latest eval if exists) ──
    eval_dir = project_dir / "evaluations"
    latest_eval_file = None
    if eval_dir.exists():
        eval_files = sorted(eval_dir.glob("eval-*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
        for ef in eval_files:
            try:
                ed = json.loads(ef.read_text())
                if ed.get("results") and len(ed["results"]) > 0:
                    latest_eval_file = ef
                    break
            except (json.JSONDecodeError, KeyError):
                pass

    readiness_passed = step_done("readiness-pass")

    if latest_eval_file and not readiness_passed:
        print("\n── Readiness Gate ──")
        # Quick inline check (same logic as readiness-check command)
        try:
            ed = json.loads(latest_eval_file.read_text())
            scores = []
            for r in ed.get("results", []):
                epochs = r.get("epochs", {})
                if isinstance(epochs, dict):
                    for _ek, cands in epochs.items():
                        if isinstance(cands, list):
                            for c in cands:
                                if isinstance(c, dict) and c.get("score") is not None:
                                    scores.append(float(c["score"]))
            if scores:
                import statistics
                n = len(scores)
                avg_s = sum(scores) / n
                std_s = statistics.stdev(scores) if n > 1 else 0
                dead_w = sum(1 for s in scores if s < 0.1) / n
                pass_r = sum(1 for s in scores if s >= 0.7) / n
                print(f"  Latest eval: {latest_eval_file.name} ({n} scores)")
                print(f"  avg={avg_s:.3f}, std={std_s:.3f}, dead_weight={dead_w:.1%}, pass_rate={pass_r:.1%}")
                high_frac = sum(1 for s in scores if s > 0.9) / n
                binary_frac = sum(1 for s in scores if s <= 0.01 or s >= 0.99) / n
                # Score concentration: most common value (rounded to 0.01)
                from collections import Counter
                rounded = [round(s, 2) for s in scores]
                mode_ct = Counter(rounded).most_common(1)[0][1]
                mode_val = Counter(rounded).most_common(1)[0][0]
                mode_frac = mode_ct / n
                grader_ok = (std_s > 0.10 and mode_frac < 0.50)
                signal_ok = avg_s > 0.05  # Only 0% is fatal (OpenAI RFT)
                if grader_ok and signal_ok:
                    print(f"  Verdict: PASS — grader quality OK, ready for training")
                elif not signal_ok:
                    print(f"  Verdict: FAIL — avg near zero, no training signal at all")
                elif mode_frac >= 0.50:
                    print(f"  Verdict: FAIL — {mode_frac:.0%} of scores are {mode_val}, grader too coarse")
                else:
                    print(f"  Verdict: FAIL — fix grader before training (std/binary/leniency)")
        except Exception:
            print(f"  Could not analyze {latest_eval_file.name}")

    # ── Recommended next step ──
    print("\n── Recommended Next Step ──")

    if not step_done("create-workflow"):
        print("  → Start from Step 1: Create workflow")
    elif not step_done("extract"):
        print("  → Resume from Step 2: Extract documents")
    elif not step_done("topics"):
        print("  → Resume from Step 3: Build topics")
    elif not step_done("generate-data"):
        print("  → Resume from Step 4: Generate records")
    elif not step_done("grader"):
        print("  → Resume from Step 5: Write grader")
    elif not step_done("validate"):
        print("  → Resume from Step 5.5: Validate")
    elif records_count == 0 or records_count == "?":
        print("  → Data was generated but may not be uploaded. Run verify.")
    else:
        active_training = [j for j in job_list if j.get("status") in ("running", "pending", "queued")]
        cancelled_jobs = [j for j in job_list if j.get("status") == "cancelled"]
        done_training = [j for j in job_list if j.get("status") in ("completed", "succeeded")]

        if active_training:
            print(f"  → Training running — poll it (Step 7e)")
        elif done_training:
            print(f"  → Analyze training results (Step 8b) and iterate if needed (Step 9)")
        elif readiness_passed:
            print(f"  → Readiness gate passed. Start training (Step 7d)")
        else:
            print(f"  → Run eval (Step 7b) then readiness gate (Step 7c) before training")


def _extract_eval_data(results: list[dict]) -> dict:
    """Extract structured data from eval results for readiness analysis.

    Returns dict with:
      - scores: flat list of all scores
      - per_prompt: list of {scores, lengths, topic} per prompt
      - has_lengths: whether completion lengths were available
      - has_topics: whether topic labels were available
    """
    all_scores: list[float] = []
    per_prompt: list[dict] = []

    for r in results:
        prompt_scores: list[float] = []
        prompt_lengths: list[int] = []
        topic = None

        # Extract topic from row metadata
        row = r.get("row", {})
        if isinstance(row, dict):
            topic = row.get("topic")

        epochs = r.get("epochs", {})
        if isinstance(epochs, dict):
            for _epoch_key, candidates in epochs.items():
                if not isinstance(candidates, list):
                    continue
                for c in candidates:
                    if not isinstance(c, dict) or c.get("score") is None:
                        continue
                    score = float(c["score"])
                    prompt_scores.append(score)
                    all_scores.append(score)
                    # Try to get completion length from candidate
                    completion = c.get("completion", c.get("response", c.get("output", "")))
                    if completion and isinstance(completion, str):
                        prompt_lengths.append(len(completion))
        elif r.get("score") is not None:
            score = float(r["score"])
            prompt_scores.append(score)
            all_scores.append(score)

        if prompt_scores:
            entry: dict = {"scores": prompt_scores, "topic": topic}
            if prompt_lengths:
                entry["lengths"] = prompt_lengths
            per_prompt.append(entry)

    has_lengths = any("lengths" in p for p in per_prompt)
    has_topics = any(p.get("topic") for p in per_prompt)

    return {
        "scores": all_scores,
        "per_prompt": per_prompt,
        "has_lengths": has_lengths,
        "has_topics": has_topics,
    }


def cmd_readiness_check(args: argparse.Namespace) -> None:
    """Check if eval results pass the pre-training readiness gate.

    Computes readiness criteria from eval results. Training should only
    start after ALL hard criteria pass. Returns structured JSON with
    per-criterion details, verdict, and fix suggestions.

    Hard checks (gate training):
      1. sample_count    — minimum dataset size
      2. score_std       — grader differentiation
      3. high_score_frac — grader not too lenient
      4. binary_frac     — grader uses full range
      5. dead_weight_frac — no wasted compute
      6. avg_score       — data not too hard
      7. pass_rate       — minimum viable quality

    Soft checks (warnings, don't gate):
      8. prompt_learnability — per-prompt variance for GRPO signal
      9. score_length_corr  — reward hacking risk (Dr. GRPO)
     10. topic_balance      — no single topic dominates

    Exit codes: 0 = PASS, 1 = FAIL, 2 = WARN
    """
    eval_file = Path(args.file)
    if not eval_file.exists():
        print(f"Error: Eval file not found: {eval_file}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(eval_file.read_text())
    results = data.get("results", [])
    if not results:
        print(json.dumps({"verdict": "FAIL", "error": "No results in eval file", "checks": {}}))
        sys.exit(1)

    eval_data = _extract_eval_data(results)
    scores = eval_data["scores"]
    per_prompt = eval_data["per_prompt"]

    if not scores:
        print(json.dumps({"verdict": "FAIL", "error": "No scores found in eval results", "checks": {}}))
        sys.exit(1)

    # Parse thresholds — research-backed defaults, see iteration-strategy.md §5b
    # Hard gates focus on GRADER QUALITY (is the grader working?) not model performance.
    # GRPO can learn from low base model scores (DeepSeek R1-Zero: 15.6% → 71%, arXiv:2501.12948).
    # Only 0% success is truly fatal (OpenAI RFT Guide).
    defaults = {
        "min_sample_count": 50,         # GRPO needs enough prompts for stable batches
        "min_score_std": 0.10,          # Grader must differentiate — zero-variance → zero gradient (DAPO §2.2). Threshold is a heuristic.
        "max_high_score_frac": 0.50,    # Grader leniency check. Heuristic — OpenAI recommends smooth scores.
        "max_binary_frac": 0.60,        # Binary works (DeepSeek-R1, DAPO) but less sample-efficient. Raised from 0.40 per research review.
        "min_avg_score": 0.05,          # Just needs nonzero signal (OpenAI: "0% success rate means cannot bootstrap")
        "max_mode_frac": 0.50,          # Score concentration — if >50% are one value, grader too coarse for GRPO (DAPO arXiv:2503.14476)
        "max_dead_weight_frac": 0.50,   # Real GRPO has 30-99% zero-var prompts ("No Prompt Left Behind" ICLR 2026)
        "min_pass_rate": 0.20,          # Nice to have — hard examples are most valuable (arXiv:2508.14094)
        "pass_threshold": 0.70,         # Score threshold for "passing" a record
        "min_prompt_learnability": 0.30, # DAPO dynamic sampling (arXiv:2503.14476)
        "max_score_length_corr": 0.30,  # Reward hacking risk (Dr. GRPO arXiv:2503.20783)
        "max_topic_dominance": 0.40,    # No single topic should dominate training
    }
    thresholds = defaults.copy()
    if args.thresholds:
        try:
            thresholds.update(json.loads(args.thresholds))
        except json.JSONDecodeError:
            print(f"Warning: Could not parse --thresholds, using defaults", file=sys.stderr)

    import statistics

    n = len(scores)
    num_prompts = len(per_prompt)
    avg = sum(scores) / n
    std = statistics.stdev(scores) if n > 1 else 0.0
    high_frac = sum(1 for s in scores if s > 0.9) / n
    binary_frac = sum(1 for s in scores if s <= 0.01 or s >= 0.99) / n
    dead_weight_frac = sum(1 for s in scores if s < 0.1) / n
    pass_rate = sum(1 for s in scores if s >= thresholds["pass_threshold"]) / n

    # Score concentration: fraction of scores at the most common value (rounded to 0.01)
    # GRPO computes advantage = (reward - mean) / std within each K-group.
    # If most scores are the same value, std→0 within groups → zero gradient.
    # DAPO (arXiv:2503.14476) filters zero-variance groups for exactly this reason.
    from collections import Counter
    rounded_scores = [round(s, 2) for s in scores]
    mode_count = Counter(rounded_scores).most_common(1)[0][1] if n > 0 else 0
    mode_value = Counter(rounded_scores).most_common(1)[0][0] if n > 0 else 0
    mode_frac = mode_count / n if n > 0 else 0

    # ── Hard checks: grader quality + training viability ──
    # These gate training. Focus on "is the grader working?" not "is the base model good?"
    # GRPO can learn from low base model scores — DeepSeek R1-Zero started at 15.6% (arXiv:2501.12948).
    checks: dict[str, dict] = {
        "sample_count": {
            "value": num_prompts,
            "threshold": f">= {int(thresholds['min_sample_count'])}",
            "pass": num_prompts >= thresholds["min_sample_count"],
            "fix": f"Too few samples ({num_prompts}) — GRPO needs >= {int(thresholds['min_sample_count'])} prompts for stable advantage estimates.",
            "hard": True,
        },
        "score_std": {
            "value": round(std, 4),
            "threshold": f"> {thresholds['min_score_std']}",
            "pass": std > thresholds["min_score_std"],
            "fix": "Grader not differentiating — zero-variance groups produce zero gradient (GRPO advantage = (r-mean)/std). Add more criteria or partial credit bands (0.2, 0.4, 0.6, 0.8). [DAPO §2.2; threshold is a heuristic]",
            "hard": True,
        },
        "avg_score": {
            "value": round(avg, 4),
            "threshold": f"> {thresholds['min_avg_score']}",
            "pass": avg > thresholds["min_avg_score"],
            "fix": "Average score near zero — the base model produces no useful responses at all. GRPO needs at least some nonzero rewards. [OpenAI RFT: '0% success rate means RFT cannot bootstrap']",
            "hard": True,
        },
        # Soft checks demoted from hard — research shows binary rewards work
        # (DeepSeek-R1 arXiv:2501.12948, DAPO arXiv:2503.14476 both use 100% binary rewards).
        "high_score_frac": {
            "value": round(high_frac, 4),
            "threshold": f"< {thresholds['max_high_score_frac']}",
            "pass": high_frac < thresholds["max_high_score_frac"],
            "fix": "Grader may be too lenient — if most completions score near-identical, within-group variance is small → weak gradients. Tighten grader criteria. [Heuristic; OpenAI recommends 'smooth scores, not pass/fail stamps']",
            "hard": False,
        },
        "binary_frac": {
            "value": round(binary_frac, 4),
            "threshold": f"< {thresholds['max_binary_frac']}",
            "pass": binary_frac < thresholds["max_binary_frac"],
            "fix": "Many binary (0/1) scores — continuous scoring is more sample-efficient. Note: binary rewards DO work (DeepSeek-R1, DAPO both used 100% binary successfully). [arXiv:2501.12948, arXiv:2503.14476]",
            "hard": False,
        },
        "score_concentration": {
            "value": round(mode_frac, 4),
            "threshold": f"< {thresholds['max_mode_frac']}",
            "pass": mode_frac < thresholds["max_mode_frac"],
            "fix": f"{mode_frac:.0%} of scores are exactly {mode_value} — within-group variance will be small → weak gradients. Add more granular criteria. [DAPO arXiv:2503.14476 filters uniform groups; threshold is a heuristic]",
            "hard": False,
        },
    }

    # ── Soft checks: quality signals (warnings, don't gate training) ──
    # Low base model scores are EXPECTED and even desirable — "Hard Examples Are All You Need"
    # (arXiv:2508.14094) shows hard prompts yield 30-40% gains vs 3-15% for easy prompts on GSM8K.
    checks["dead_weight_frac"] = {
        "value": round(dead_weight_frac, 4),
        "threshold": f"< {thresholds['max_dead_weight_frac']}",
        "pass": dead_weight_frac < thresholds["max_dead_weight_frac"],
        "fix": "Many dead-weight records (score<0.1) waste compute. DAPO handles this via dynamic sampling, but consider removing the worst offenders.",
        "hard": False,
    }
    checks["pass_rate"] = {
        "value": round(pass_rate, 4),
        "threshold": f"> {thresholds['min_pass_rate']}",
        "pass": pass_rate > thresholds["min_pass_rate"],
        "fix": f"Low pass rate — but hard prompts are most valuable for GRPO. With K=8, pass@8 >> pass@1. [arXiv:2508.14094]",
        "hard": False,
    }

    # ── Soft checks (warnings — don't gate training) ──

    # Per-prompt learnability: fraction of prompts with score variance > 0
    # DAPO insight: prompts where all K completions score identically = zero gradient
    prompts_with_variance = sum(
        1 for p in per_prompt
        if len(p["scores"]) > 1 and statistics.stdev(p["scores"]) > 0.01
    )
    multi_score_prompts = sum(1 for p in per_prompt if len(p["scores"]) > 1)
    if multi_score_prompts > 0:
        learnability = prompts_with_variance / multi_score_prompts
        checks["prompt_learnability"] = {
            "value": round(learnability, 4),
            "threshold": f"> {thresholds['min_prompt_learnability']}",
            "pass": learnability > thresholds["min_prompt_learnability"],
            "fix": f"Only {prompts_with_variance}/{multi_score_prompts} prompts have score variance — {multi_score_prompts - prompts_with_variance} prompts produce identical scores across completions (zero GRPO gradient). Remove or rewrite zero-variance prompts.",
            "hard": False,
            "detail": f"{prompts_with_variance}/{multi_score_prompts} prompts have variance",
        }

    # Score-length correlation: per Dr. GRPO, high correlation means grader
    # rewards/punishes length rather than quality → reward hacking risk
    if eval_data["has_lengths"]:
        all_scored_lengths: list[tuple[float, int]] = []
        for p in per_prompt:
            if "lengths" not in p:
                continue
            for s_val, l_val in zip(p["scores"], p["lengths"]):
                all_scored_lengths.append((s_val, l_val))

        if len(all_scored_lengths) >= 10:
            s_vals = [x[0] for x in all_scored_lengths]
            l_vals = [x[1] for x in all_scored_lengths]
            # Pearson correlation
            s_mean = sum(s_vals) / len(s_vals)
            l_mean = sum(l_vals) / len(l_vals)
            cov = sum((s - s_mean) * (l - l_mean) for s, l in zip(s_vals, l_vals))
            s_var = sum((s - s_mean) ** 2 for s in s_vals)
            l_var = sum((l - l_mean) ** 2 for l in l_vals)
            denom = (s_var * l_var) ** 0.5
            corr = cov / denom if denom > 0 else 0.0

            checks["score_length_corr"] = {
                "value": round(abs(corr), 4),
                "threshold": f"< {thresholds['max_score_length_corr']}",
                "pass": abs(corr) < thresholds["max_score_length_corr"],
                "fix": f"Score-length correlation is {corr:+.3f} — grader may be {'rewarding' if corr > 0 else 'punishing'} longer responses rather than judging quality. Rewrite grader to evaluate content independently of length.",
                "hard": False,
                "detail": f"r={corr:+.4f} across {len(all_scored_lengths)} scored completions",
            }

    # Topic balance: no single topic should dominate the dataset
    if eval_data["has_topics"]:
        topic_counts: dict[str, int] = {}
        for p in per_prompt:
            t = p.get("topic")
            if t:
                topic_counts[t] = topic_counts.get(t, 0) + 1
        topics_with_labels = sum(topic_counts.values())
        if topics_with_labels > 0 and len(topic_counts) > 1:
            max_topic = max(topic_counts, key=lambda k: topic_counts[k])
            max_topic_frac = topic_counts[max_topic] / topics_with_labels
            checks["topic_balance"] = {
                "value": round(max_topic_frac, 4),
                "threshold": f"< {thresholds['max_topic_dominance']}",
                "pass": max_topic_frac < thresholds["max_topic_dominance"],
                "fix": f"Topic '{max_topic}' dominates at {max_topic_frac:.0%} of data — training will over-optimize for it. Add more data for under-represented topics or reduce '{max_topic}' records.",
                "hard": False,
                "detail": f"largest: '{max_topic}' ({topic_counts[max_topic]}/{topics_with_labels}), {len(topic_counts)} topics total",
            }

    # ── Compute verdict ──
    hard_failed = [k for k, v in checks.items() if v.get("hard") and not v["pass"]]
    soft_failed = [k for k, v in checks.items() if not v.get("hard") and not v["pass"]]
    all_failed = hard_failed + soft_failed

    # WARN if only 1 hard check fails marginally, or only soft checks fail
    marginal_hard = len(hard_failed) == 1 and all(
        (checks[k]["value"] > thresholds.get(f"min_{k}", 0) * 0.8 if "min_" in checks[k]["threshold"] else True)
        for k in hard_failed
    )

    if not hard_failed and not soft_failed:
        verdict = "PASS"
    elif not hard_failed and soft_failed:
        verdict = "WARN"
    elif marginal_hard and not soft_failed:
        verdict = "WARN"
    else:
        verdict = "FAIL"

    result = {
        "verdict": verdict,
        "total_scores": n,
        "total_prompts": num_prompts,
        "checks": checks,
        "failed_checks": all_failed,
        "hard_failed": hard_failed,
        "soft_failed": soft_failed,
        "summary": {
            "avg": round(avg, 4),
            "std": round(std, 4),
            "min": round(min(scores), 4),
            "max": round(max(scores), 4),
            "pass_rate": round(pass_rate, 4),
            "dead_weight_count": sum(1 for s in scores if s < 0.1),
        },
    }

    # Not all soft warnings are safe to train through.
    # score_concentration > 70% means the grader is broken (most K=8 groups score
    # identically → zero gradient). Fix grader before wasting GPU hours.
    concentration_val = checks.get("score_concentration", {}).get("value", 0)
    concentration_blocks_training = (
        "score_concentration" in soft_failed and concentration_val > 0.70
    )

    if hard_failed:
        fixes = [checks[k]["fix"] for k in hard_failed]
        result["recommendation"] = "Fix before training: " + "; ".join(fixes)
    elif concentration_blocks_training:
        result["recommendation"] = (
            f"FIX GRADER BEFORE TRAINING: {concentration_val:.0%} of scores are the same value. "
            f"At K=8, most prompt groups will have all completions scoring identically → zero gradient → "
            f"wasted compute. Run `diagnose-grader --file <this-eval-file> --workflow-id <wf-id>` "
            f"to see WHY scores cluster and get specific fix suggestions, then edit grader.js and re-eval."
        )
    elif soft_failed:
        fixes = [checks[k]["fix"] for k in soft_failed]
        result["recommendation"] = "Can proceed to training, but consider: " + "; ".join(fixes)
    else:
        result["recommendation"] = "All checks passed. Ready for training."

    print(json.dumps(result, indent=2))

    if verdict == "FAIL":
        sys.exit(1)
    elif verdict == "WARN":
        sys.exit(2)
    else:
        sys.exit(0)


def cmd_diagnose_grader(args: argparse.Namespace) -> None:
    """Diagnose grader issues from eval results.

    Analyzes score distribution, groups records by score bucket, and shows
    sample reason fields per bucket so the agent can understand WHY scores
    cluster and WHAT to fix in the grader. Also fetches the current grader
    source code from the gateway.

    This is the bridge between "readiness-check says fix grader" and
    "agent knows how to fix the grader."
    """
    eval_file = Path(args.file)
    if not eval_file.exists():
        print(f"Error: Eval file not found: {eval_file}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(eval_file.read_text())
    results = data.get("results", [])
    if not results:
        print("Error: No results in eval file", file=sys.stderr)
        sys.exit(1)

    # ── Score bucket analysis with reason patterns ──
    from collections import defaultdict
    buckets: dict[float, list[dict]] = defaultdict(list)
    for r in results:
        topic = r.get("row", {}).get("topic", "unknown")
        for _epoch_key, candidates in r.get("epochs", {}).items():
            if not isinstance(candidates, list):
                continue
            for c in candidates:
                score = c.get("score")
                if score is None:
                    continue
                buckets[round(float(score), 1)].append({
                    "score": float(score),
                    "reason": (c.get("reason") or "")[:300],
                    "topic": topic,
                    "row_index": r.get("row_index"),
                })

    total = sum(len(v) for v in buckets.values())

    output: dict = {"total_scores": total, "buckets": {}, "diagnosis": [], "grader_source": None}

    # Build bucket summary with sample reasons
    for score_val in sorted(buckets.keys()):
        items = buckets[score_val]
        pct = len(items) / total * 100
        sample_reasons = [it["reason"] for it in items[:3]]
        output["buckets"][str(score_val)] = {
            "count": len(items),
            "percent": round(pct, 1),
            "sample_reasons": sample_reasons,
        }

    # ── Auto-diagnosis based on distribution patterns ──
    max_bucket_score = max(buckets.keys(), key=lambda k: len(buckets[k]))
    max_bucket_pct = len(buckets[max_bucket_score]) / total * 100

    if max_bucket_pct > 50:
        dominant_reasons = [it["reason"] for it in buckets[max_bucket_score][:5]]
        # Check if reasons mention "no figures", "did not provide", "non-responsive"
        refusal_keywords = ["did not provide", "does not provide", "no specific", "non-responsive",
                           "no figures", "no actual", "no metrics", "not provide any",
                           "fails to", "failed to", "unable to", "need the", "without the",
                           "cannot extract", "can't extract", "require", "need access"]
        refusal_count = sum(
            1 for reason in dominant_reasons
            if any(kw in reason.lower() for kw in refusal_keywords)
        )

        if refusal_count >= 2:
            output["diagnosis"].append({
                "issue": f"{max_bucket_pct:.0f}% of scores are {max_bucket_score} — model refuses to answer most prompts",
                "likely_cause": (
                    "The model says it can't provide specific figures — this usually means the prompts "
                    "ask for document extraction but DON'T include the source document text in the messages. "
                    "The model has no material to extract from, so it correctly declines. "
                    "The grader then gives partial credit for 'not hallucinating' even though the model "
                    "produced nothing useful."
                ),
                "fix": [
                    "**CHECK DATA FIRST**: Do your training records include source document text in the "
                    "messages? Run: curl localhost:9090/finetune/workflows/$WORKFLOW_ID/records | head "
                    "— if system+user messages are under 2000 chars, source text is missing.",
                    "**If source text missing (most likely)**: Regenerate records with "
                    "`generate_records.py --embed-source-context` which embeds per-question source "
                    "excerpts into the user message as a natural 'here is the document, answer this' "
                    "pattern. System prompt (topic hierarchy) stays unchanged.",
                    "**Also fix grader**: Add early-exit for non-responses (score 0 instead of partial credit). "
                    "Remove score snapping (Math.round * 10 / 10). Weight accuracy/completeness higher "
                    "than hallucination-avoidance.",
                ],
                "root_cause": "DATA — prompts likely missing source document context",
            })
        else:
            output["diagnosis"].append({
                "issue": f"{max_bucket_pct:.0f}% of scores are {max_bucket_score} — grader gives the same score to most responses",
                "likely_cause": (
                    "Grader criteria don't differentiate between different quality levels. "
                    "Multiple failure modes produce the same score."
                ),
                "fix": [
                    "Add early-exit: if no substantive content extracted → return {score: 0, reason: 'No content extracted'}",
                    "Remove score snapping (Math.round * 10 / 10) — let continuous scores through for GRPO gradient",
                    "Separate 'model refused' (score 0) from 'model tried but got wrong' (score 0.2-0.4)",
                    "Weight accuracy/completeness higher than hallucination-avoidance for extraction tasks",
                ],
            })

    # ── Check if prompts are missing source document context ──
    if args.workflow_id:
        try:
            resp = requests.get(
                f"{args.base_url}/finetune/workflows/{args.workflow_id}/records",
                timeout=15,
            )
            if resp.status_code == 200:
                records_data = resp.json()
                recs = records_data.get("records", records_data) if isinstance(records_data, dict) else records_data
                if isinstance(recs, list) and recs:
                    msg_lengths = []
                    for rec in recs[:50]:  # sample first 50
                        rd = rec.get("data", {})
                        if isinstance(rd, str):
                            rd = json.loads(rd)
                        msgs = rd.get("input", {}).get("messages", rd.get("messages", []))
                        total = sum(len(m.get("content", "")) for m in msgs)
                        msg_lengths.append(total)
                    avg_len = sum(msg_lengths) / len(msg_lengths) if msg_lengths else 0
                    long_context = sum(1 for l in msg_lengths if l > 2000)
                    # Check if this task likely REQUIRES source document context.
                    # Look for extraction-related keywords in system prompts.
                    extraction_keywords = ["extract", "filing", "document", "report",
                                          "10-k", "10k", "sec ", "cite", "section",
                                          "page", "source", "reference"]
                    sample_sys = []
                    for rec in recs[:10]:
                        rd2 = rec.get("data", {})
                        if isinstance(rd2, str):
                            rd2 = json.loads(rd2)
                        msgs2 = rd2.get("input", {}).get("messages", rd2.get("messages", []))
                        for m2 in msgs2:
                            if m2.get("role") == "system":
                                sample_sys.append(m2.get("content", "").lower())
                    is_extraction_task = any(
                        any(kw in sys_text for kw in extraction_keywords)
                        for sys_text in sample_sys
                    )

                    output["record_context_check"] = {
                        "avg_message_length": round(avg_len),
                        "records_with_source_text": long_context,
                        "records_sampled": len(msg_lengths),
                        "has_source_context": long_context > len(msg_lengths) * 0.3,
                        "is_extraction_task": is_extraction_task,
                    }
                    if long_context == 0 and is_extraction_task:
                        output["diagnosis"].insert(0, {
                            "issue": "EXTRACTION TASK BUT RECORDS MISSING SOURCE DOCUMENT TEXT",
                            "likely_cause": (
                                f"All {len(msg_lengths)} sampled records have messages under 2000 chars "
                                f"(avg {avg_len:.0f} chars). The system prompt references document extraction "
                                f"(filings, citations, pages) but records don't include the actual document content. "
                                f"The model has nothing to extract from."
                            ),
                            "fix": [
                                "Regenerate records with `generate_records.py --embed-source-context` which embeds "
                                "per-question source excerpts (from ground_truth) into the user message as a natural "
                                "'here is the document section, now answer this' pattern. System prompt (topic "
                                "hierarchy) stays unchanged.",
                                "Example: python3 $SKILL_DIR/scripts/generate_records.py --topics topics.json "
                                "--relations relations.json --knowledge-dir knowledge --system-prompt '...' "
                                "--output training.jsonl --embed-source-context",
                                "After regenerating: re-upload with `finetune.py upload-records --force`, then re-eval.",
                            ],
                            "root_cause": "DATA — this is the primary issue, fix this first",
                            "priority": "HIGH",
                        })
                    elif long_context == 0 and not is_extraction_task:
                        output["record_context_check"]["note"] = (
                            "Records don't include long source text, but the task doesn't appear to require "
                            "document extraction. This is normal for knowledge/reasoning/style tasks."
                        )
        except Exception:
            pass  # Gateway not available

    if len(buckets.get(0.0, [])) > 0:
        zero_reasons = [it["reason"] for it in buckets[0.0][:3]]
        output["diagnosis"].append({
            "issue": f"{len(buckets[0.0])} records scored 0.0 (dead weight)",
            "sample_reasons": zero_reasons,
            "fix": "Check if these are grader bugs (harsh early-exit) or genuinely empty responses. "
                   "If grader bug → fix the early-exit condition. If model failure → remove these records.",
        })

    # ── Fetch current grader source from gateway ──
    if args.workflow_id:
        try:
            resp = requests.get(
                f"{args.base_url}/finetune/workflows/{args.workflow_id}/evaluator/versions",
                timeout=10,
            )
            if resp.status_code == 200:
                versions = resp.json()
                if isinstance(versions, list) and versions:
                    latest = versions[-1]
                    config = latest.get("config", {})
                    script = config.get("script") or config.get("config", {}).get("script", "")
                    if script:
                        output["grader_source"] = script
                        # Find scoring formula lines
                        scoring_lines = []
                        for i, line in enumerate(script.split("\n")):
                            stripped = line.strip()
                            if any(kw in stripped.lower() for kw in [
                                "return {", "return{", "score =", "score=",
                                "weighted", "finalscore", "basescore",
                                "math.round", "math.min", "math.max",
                            ]):
                                scoring_lines.append(f"L{i}: {line.rstrip()[:120]}")
                        if scoring_lines:
                            output["scoring_formula_lines"] = scoring_lines
        except Exception:
            pass  # Gateway not available — agent can still use local grader.js

    # ── Print human-readable diagnosis ──
    print("=== Grader Diagnosis ===")
    print(f"Total scores: {total}")
    print()
    print("Score distribution:")
    for score_val in sorted(buckets.keys()):
        items = buckets[score_val]
        pct = len(items) / total * 100
        bar = "█" * max(1, int(pct / 2))
        print(f"  {score_val:.1f}: {len(items):4d} ({pct:5.1f}%) {bar}")
    print()

    if output["diagnosis"]:
        print("Diagnosis:")
        for d in output["diagnosis"]:
            print(f"  ISSUE: {d['issue']}")
            if "likely_cause" in d:
                print(f"  CAUSE: {d['likely_cause']}")
            if isinstance(d.get("fix"), list):
                print("  FIX:")
                for f in d["fix"]:
                    print(f"    → {f}")
            elif "fix" in d:
                print(f"  FIX: {d['fix']}")
            if "sample_reasons" in d:
                print("  Sample reasons:")
                for r in d["sample_reasons"]:
                    print(f"    → {r[:150]}...")
            print()

    if output.get("scoring_formula_lines"):
        print("Grader scoring formula (key lines):")
        for line in output["scoring_formula_lines"]:
            print(f"  {line}")
        print()

    print("Sample reasons per score bucket:")
    for score_val in sorted(buckets.keys()):
        items = buckets[score_val]
        print(f"\n  Score {score_val} ({len(items)} records):")
        for reason in [it["reason"] for it in items[:2]]:
            print(f"    → {reason[:150]}...")

    # Also output as JSON on stderr for programmatic use
    print(json.dumps(output), file=sys.stderr)


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

        if status in ("completed", "failed", "error", "cancelled"):
            metadata["completed_at"] = result.get("completed_at")
            eval_file.write_text(json.dumps(metadata, indent=2))
            print(f"Done: {status}. Saved to {eval_file}")
            if status == "cancelled":
                print("Eval was cancelled. Partial results (if any) have been saved.", file=sys.stderr)
                sys.exit(2)
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

    output_model = args.output_model or "finetune-v1"
    display_name = args.display_name or f"Fine-tune {output_model}"

    payload = {
        "job_type": "provider_finetune",
        "dataset": args.workflow_id,
        "base_model": args.base_model,
        "output_model": output_model,
        "display_name": display_name,
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
            "epochs": 8,  # RFT/GRPO needs more epochs than SFT — model generates fresh responses each epoch (no memorization risk). Ref: Interconnects.ai analysis of OpenAI RFT
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
            if status == "cancelled":
                print("Job was cancelled. Partial metrics (if any) have been saved.", file=sys.stderr)
                sys.exit(2)
            return

        time.sleep(poll_interval)
        elapsed += poll_interval

    print(f"Timeout after {max_wait}s. Training still {status}.", file=sys.stderr)
    metadata["status"] = f"timeout ({status})"
    job_file.write_text(json.dumps(metadata, indent=2))
    sys.exit(1)


def cmd_sync_jobs(args: argparse.Namespace) -> None:
    """Sync training + eval jobs from gateway to local tracking files.

    Fetches all jobs for the workflow from the gateway API and creates/updates
    local tracking files. This allows the agent to pick up jobs created by
    the UI or other agents.

    Creates:
      - training-jobs/train-NNN.json for each finetune job
      - evaluations/eval-NNN.json for each eval job
    Skips jobs that already have a local file with matching job_id.
    """
    wf_id = args.workflow_id
    output_dir = Path(args.output_dir)

    # ── Sync finetune jobs ──
    training_dir = output_dir / "training-jobs"
    training_dir.mkdir(parents=True, exist_ok=True)

    jobs = _api("GET", f"{args.base_url}/finetune/workflows/{wf_id}/jobs")
    job_list = jobs if isinstance(jobs, list) else jobs.get("jobs", [])

    # Index existing local files by job_id
    existing_job_ids = set()
    for f in training_dir.glob("train-*.json"):
        try:
            data = json.loads(f.read_text())
            existing_job_ids.add(data.get("job_id"))
        except (json.JSONDecodeError, KeyError):
            pass

    # Find next train-NNN number
    existing_nums = []
    for f in training_dir.glob("train-*.json"):
        try:
            num = int(f.stem.split("-")[1])
            existing_nums.append(num)
        except (ValueError, IndexError):
            pass
    next_num = max(existing_nums, default=0) + 1

    synced_training = 0
    skipped_training = 0
    for job in job_list:
        job_id = job.get("id", "")
        if job_id in existing_job_ids:
            # Update status in existing file
            for f in training_dir.glob("train-*.json"):
                try:
                    data = json.loads(f.read_text())
                    if data.get("job_id") == job_id:
                        data["status"] = job.get("status", data.get("status"))
                        if job.get("fine_tuned_model"):
                            data["fine_tuned_model"] = job["fine_tuned_model"]
                        if job.get("error_message"):
                            data["error_message"] = job["error_message"]
                        if job.get("completed_at"):
                            data["completed_at"] = job["completed_at"]
                        f.write_text(json.dumps(data, indent=2))
                        break
                except (json.JSONDecodeError, KeyError):
                    pass
            skipped_training += 1
            continue

        # New job — create local tracking file
        local_data = {
            "job_id": job_id,
            "provider_job_id": job.get("provider_job_id", job_id),
            "workflow_id": wf_id,
            "base_model": job.get("base_model", ""),
            "output_model": job.get("fine_tuned_model", ""),
            "training_config": job.get("training_config", {}),
            "status": job.get("status", "unknown"),
            "created_at": job.get("created_at", ""),
            "source": "synced_from_gateway",
        }
        out_file = training_dir / f"train-{next_num:03d}.json"
        out_file.write_text(json.dumps(local_data, indent=2))
        next_num += 1
        synced_training += 1
        print(f"  Synced training job: {job_id[:8]}... → {out_file.name} (status={local_data['status']})")

    # ── Sync eval jobs ──
    eval_dir = output_dir / "evaluations"
    eval_dir.mkdir(parents=True, exist_ok=True)

    existing_eval_ids = set()
    for f in eval_dir.glob("eval-*.json"):
        try:
            data = json.loads(f.read_text())
            existing_eval_ids.add(data.get("evaluation_run_id"))
        except (json.JSONDecodeError, KeyError):
            pass

    existing_eval_nums = []
    for f in eval_dir.glob("eval-*.json"):
        try:
            num = int(f.stem.split("-")[1])
            existing_eval_nums.append(num)
        except (ValueError, IndexError):
            pass
    next_eval_num = max(existing_eval_nums, default=0) + 1

    # Fetch eval runs from gateway (use the evaluations list endpoint)
    synced_eval = 0
    try:
        eval_resp = _api("GET", f"{args.base_url}/finetune/workflows/{wf_id}/evaluations")
        eval_list = eval_resp if isinstance(eval_resp, list) else eval_resp.get("evaluations", [])
        for ev in eval_list:
            eval_id = ev.get("evaluation_run_id", ev.get("id", ""))
            if eval_id in existing_eval_ids:
                continue
            local_eval = {
                "evaluation_run_id": eval_id,
                "workflow_id": wf_id,
                "status": ev.get("status", "unknown"),
                "model": ev.get("model", ""),
                "total_rows": ev.get("total_rows", 0),
                "completed_rows": ev.get("completed_rows", 0),
                "source": "synced_from_gateway",
            }
            out_file = eval_dir / f"eval-{next_eval_num:03d}.json"
            out_file.write_text(json.dumps(local_eval, indent=2))
            next_eval_num += 1
            synced_eval += 1
            print(f"  Synced eval job: {eval_id[:8]}... → {out_file.name} (status={local_eval['status']})")
    except SystemExit:
        print("  Warning: Could not fetch eval jobs from gateway", file=sys.stderr)

    # Summary
    total = synced_training + synced_eval
    print(f"\nSync complete: {synced_training} new training jobs, {synced_eval} new eval jobs "
          f"({skipped_training} training jobs already tracked)")
    if total == 0:
        print("All jobs already tracked locally — nothing to sync.")


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


def _compact_cell(value, max_chars: int = 160) -> str:
    """Render cell-safe text for table output."""
    if value is None:
        return ""
    text = str(value).replace("\n", "\\n").replace("\r", "")
    if len(text) > max_chars:
        return text[: max_chars - 3] + "..."
    return text


def cmd_print_row_outputs(args: argparse.Namespace) -> None:
    """Print per-epoch rollout output + score + reason for one row."""
    result = _api(
        "GET",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/finetune-evaluations",
        params={
            "finetune_job_id": args.finetune_job_id,
            "row_index": args.row_index,
        },
    )

    raw_results = result.get("results", [])
    if not raw_results:
        print(
            f"No results found for row_index={args.row_index} in finetune_job_id={args.finetune_job_id}.",
            file=sys.stderr,
        )
        sys.exit(1)

    row = raw_results[0]
    epochs = row.get("epochs", {})
    if not epochs:
        print(
            f"No epoch entries found for row_index={args.row_index}.",
            file=sys.stderr,
        )
        sys.exit(1)

    def _epoch_sort_key(k: str):
        try:
            return (0, float(k))
        except (TypeError, ValueError):
            return (1, str(k))

    print("epoch | rollout_output | score | reason")
    for epoch_key in sorted(epochs.keys(), key=_epoch_sort_key):
        epoch_items = epochs.get(epoch_key) or []
        if not isinstance(epoch_items, list):
            epoch_items = [epoch_items]
        if not epoch_items:
            print(f"{epoch_key} |  |  | ")
            continue

        for item in epoch_items:
            rollout_output = item.get("rollout_output")
            if rollout_output is None:
                rollout_output = item.get("rollout_content")
            score = item.get("score", "")
            reason = item.get("reason", "")
            print(
                f"{_compact_cell(epoch_key, 32)} | "
                f"{_compact_cell(rollout_output, args.max_chars)} | "
                f"{_compact_cell(score, 32)} | "
                f"{_compact_cell(reason, args.max_chars)}"
            )


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

    # status
    p = subparsers.add_parser("status", help="Show full workflow status: gateway data + checkpoint + jobs + next step")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--project-dir", default="finetune-project", help="Project directory (default: finetune-project/)")

    # readiness-check
    p = subparsers.add_parser("readiness-check", help="Check if eval results pass pre-training readiness gate")
    p.add_argument("--file", required=True, help="Path to eval result JSON (from poll-eval)")
    p.add_argument("--thresholds", default=None, help="JSON string with custom thresholds (optional)")

    # diagnose-grader
    p = subparsers.add_parser("diagnose-grader", help="Diagnose grader issues from eval results — shows score buckets, reason patterns, and grader source")
    p.add_argument("--file", required=True, help="Path to eval result JSON (from poll-eval)")
    p.add_argument("--workflow-id", default=None, help="Workflow ID (to fetch grader source from gateway)")

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
    p.add_argument("--display-name", default=None, help="Human-readable training job name")
    p.add_argument("--config", default=None, help="Training config JSON string")
    p.add_argument("--inference-params", default=None, help="Inference parameters JSON string")
    p.add_argument("--output-dir", default="training-jobs", help="Local directory for job metadata (default: training-jobs/)")

    # poll-training
    p = subparsers.add_parser("poll-training", help="Poll training job until complete, save status and metrics")
    p.add_argument("--workflow-id", required=False, default=None, help="Workflow ID (read from job file if omitted)")
    p.add_argument("--file", required=True, help="Path to train-NNN.json (from create-training)")
    p.add_argument("--poll-interval", type=int, default=60, help="Poll interval in seconds (default: 60)")
    p.add_argument("--max-wait", type=int, default=14400, help="Max wait in seconds (default: 14400)")

    # sync-jobs
    p = subparsers.add_parser("sync-jobs", help="Sync training + eval jobs from gateway to local tracking files")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--output-dir", default="finetune-project", help="Project directory (default: finetune-project/)")

    # delete-knowledge
    p = subparsers.add_parser("delete-knowledge", help="Delete knowledge source(s) from a workflow")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--source-id", default=None, help="Specific knowledge source ID to delete")
    p.add_argument("--all", action="store_true", help="Delete all knowledge sources")

    # print-row-outputs
    p = subparsers.add_parser(
        "print-row-outputs",
        help="Print epoch table for one row: rollout output, score, reason",
    )
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--finetune-job-id", required=True, help="Finetune job ID")
    p.add_argument("--row-index", required=True, type=int, help="Row index in eval results")
    p.add_argument(
        "--max-chars",
        type=int,
        default=160,
        help="Max characters per text cell before truncation (default: 160)",
    )

    args = parser.parse_args()

    commands = {
        "create-workflow": cmd_create_workflow,
        "upload-knowledge": cmd_upload_knowledge,
        "upload-topics": cmd_upload_topics,
        "upload-relations": cmd_upload_relations,
        "upload-records": cmd_upload_records,
        "upload-grader": cmd_upload_grader,
        "verify": cmd_verify,
        "status": cmd_status,
        "readiness-check": cmd_readiness_check,
        "diagnose-grader": cmd_diagnose_grader,
        "create-eval": cmd_create_eval,
        "poll-eval": cmd_poll_eval,
        "create-training": cmd_create_training,
        "poll-training": cmd_poll_training,
        "sync-jobs": cmd_sync_jobs,
        "delete-knowledge": cmd_delete_knowledge,
        "print-row-outputs": cmd_print_row_outputs,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
