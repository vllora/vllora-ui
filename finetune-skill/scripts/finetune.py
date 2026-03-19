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
    if args.system_prompt:
        payload["system_prompt"] = args.system_prompt

    result = _api("POST", f"{args.base_url}/finetune/workflows", json=payload)
    workflow_id = result.get("id", "unknown")

    print(f"Workflow created successfully.")
    print(f"  ID: {workflow_id}")
    print(f"  Name: {args.name}")

    # Print just the ID to stdout for easy capture: WORKFLOW_ID=$(uv run ... | tail -1)
    print(workflow_id)


def cmd_upload_knowledge(args: argparse.Namespace) -> None:
    """Upload a knowledge source (document + extracted parts) to a workflow.

    Expected parts file format (knowledge_parts.json):
      {"source": {...}, "parts": [{"id": "doc-1-ch3", "type": "text", "title": "...", "content": "..."}]}
    Or a bare array of part objects.

    Transforms: 'id' → 'reference_id', removes 'source_id' before upload.
    Uses PUT (upsert) when --force is set — atomically replaces existing source with same name.
    Without --force, uses POST (create) — fails silently if name already exists.
    """
    doc_path = Path(args.file)
    if not doc_path.exists():
        print(f"Error: Document not found: {doc_path}", file=sys.stderr)
        sys.exit(1)

    source_name = args.name or doc_path.name

    # Choose HTTP method: PUT (upsert) for --force, POST (create) for normal
    method = "PUT" if args.force else "POST"

    # Step 1: Upload the document as a knowledge source
    files = {"file": (doc_path.name, doc_path.open("rb"), "application/pdf")}
    form_data = {
        "name": source_name,
        "description": args.description or f"Source document: {doc_path.name}",
    }
    if args.metadata:
        form_data["metadata"] = args.metadata

    result = _api(
        method,
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/knowledge",
        files=files,
        data=form_data,
    )
    ks_id = result.get("knowledge_source", {}).get("id", "unknown")
    replaced = result.get("replaced", False)
    replaced_id = result.get("replaced_id")
    if replaced:
        print(f"Knowledge source replaced: {ks_id} (was: {replaced_id})")
    else:
        print(f"Knowledge source uploaded: {ks_id}")

    # Step 2: Upload parts if provided
    if args.parts_file:
        parts_path = Path(args.parts_file)
        if not parts_path.exists():
            print(f"Error: Parts file not found: {parts_path}", file=sys.stderr)
            sys.exit(1)

        try:
            data = json.loads(parts_path.read_text())
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in parts file: {e}", file=sys.stderr)
            sys.exit(1)

        # Extract parts array from various formats
        if isinstance(data, dict) and "parts" in data:
            raw_parts = data["parts"]
        elif isinstance(data, list):
            raw_parts = data
        else:
            print(
                f"Error: Parts file must contain a JSON array or an object with a 'parts' key.",
                file=sys.stderr,
            )
            print(f"  Got: {type(data).__name__} with keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}", file=sys.stderr)
            sys.exit(1)

        if not raw_parts:
            print(f"Warning: Parts file contains 0 parts — nothing to upload.", file=sys.stderr)
        else:
            # Transform: move 'id' to 'reference_id', remove 'source_id'
            parts = []
            for p in raw_parts:
                part = {**p}
                if "id" in part:
                    part["reference_id"] = part.pop("id")
                part.pop("source_id", None)
                parts.append(part)

            result = _api(
                "POST",
                f"{args.base_url}/finetune/workflows/{args.workflow_id}/knowledge/{ks_id}/parts",
                json=parts,
            )
            added = result.get("added", len(parts))
            print(f"  Parts uploaded: {added}")

    print(f"  Knowledge source ID: {ks_id}")


def cmd_upload_topics(args: argparse.Namespace) -> None:
    """Upload topic hierarchy to a workflow."""
    topics_path = Path(args.file)
    if not topics_path.exists():
        print(f"Error: Topics file not found: {topics_path}", file=sys.stderr)
        sys.exit(1)

    topics = json.loads(topics_path.read_text())
    if isinstance(topics, list):
        payload = {"topics": topics}
    else:
        payload = topics if "topics" in topics else {"topics": [topics]}

    result = _api(
        "POST",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/topics",
        json=payload,
    )
    created = result.get("created", len(payload["topics"]))
    print(f"Topics uploaded: {created}")


def _looks_like_uuid(s: str) -> bool:
    """Check if a string looks like a UUID (8-4-4-4-12 hex pattern)."""
    import re
    return bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', s, re.I))


def cmd_upload_relations(args: argparse.Namespace) -> None:
    """Upload topic-source relations to a workflow.

    The gateway accepts both reference_ids (string IDs from topics.json/knowledge_parts.json)
    and UUIDs for topic_identifier and part_identifier. Reference_ids are preferred — the
    gateway resolves them automatically via 'id OR reference_id' queries.
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

    # Warn if UUIDs are used instead of reference_ids (not an error, just suboptimal)
    uuid_count = sum(
        1 for r in rel_list
        if _looks_like_uuid(r.get("part_identifier", "")) or _looks_like_uuid(r.get("topic_identifier", ""))
    )
    if uuid_count > 0:
        print(f"Note: {uuid_count}/{len(rel_list)} relations use UUID identifiers.", file=sys.stderr)
        print(f"  Tip: Use reference_ids from topics.json/knowledge_parts.json instead.", file=sys.stderr)
        print(f"  The gateway resolves reference_ids automatically — no UUID mapping needed.", file=sys.stderr)

    payload = {"relations": rel_list}
    result = _api(
        "POST",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/topics/relations",
        json=payload,
    )
    created = result.get("created", len(rel_list))
    print(f"Relations uploaded: {created}")


def cmd_upload_records(args: argparse.Namespace) -> None:
    """Upload training records from a JSONL file to a workflow.

    Transforms from skill format (top-level messages) to gateway format
    (nested data.input.messages). Uploads in batches.
    """
    records_path = Path(args.file)
    if not records_path.exists():
        print(f"Error: Records file not found: {records_path}", file=sys.stderr)
        sys.exit(1)

    records = []
    parse_errors = 0
    for line_num, line in enumerate(records_path.read_text().strip().splitlines(), 1):
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            parse_errors += 1
            print(f"Warning: Skipping invalid JSON on line {line_num}", file=sys.stderr)
            continue

        record = {
            "id": r["id"],
            "data": {"input": {"messages": r["messages"]}, "output": {}},
            "is_generated": True,
        }
        if r.get("topic"):
            record["topic"] = r["topic"]
        if r.get("source_parts"):
            record["metadata"] = json.dumps({"source_parts": r["source_parts"]})
        records.append(record)

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
    """Upload a grader/evaluator script to a workflow."""
    grader_path = Path(args.file)
    if not grader_path.exists():
        print(f"Error: Grader file not found: {grader_path}", file=sys.stderr)
        sys.exit(1)

    script_content = grader_path.read_text()
    payload = {
        "evaluator": {
            "type": "js",
            "config": {"script": script_content},
        }
    }

    _api(
        "PATCH",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/evaluator",
        json=payload,
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

    # Check evaluator
    try:
        has_eval = c.execute(
            "SELECT CASE WHEN evaluator IS NOT NULL THEN 'YES' ELSE 'NO' END FROM workflows WHERE id = ?",
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
    p.add_argument("--system-prompt", help="System prompt for training records")

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

    # upload-relations
    p = subparsers.add_parser("upload-relations", help="Upload topic-source relations")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to relations.json")

    # upload-records
    p = subparsers.add_parser("upload-records", help="Upload training records from JSONL")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to training.jsonl")
    p.add_argument("--batch-size", type=int, default=200, help="Records per API call (default: 200)")

    # upload-grader
    p = subparsers.add_parser("upload-grader", help="Upload grader/evaluator script")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to grader.js")

    # verify
    p = subparsers.add_parser("verify", help="Verify all data in gateway database")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--db", help=f"Database path (default: {DEFAULT_DB_PATH})")

    args = parser.parse_args()

    commands = {
        "create-workflow": cmd_create_workflow,
        "upload-knowledge": cmd_upload_knowledge,
        "upload-topics": cmd_upload_topics,
        "upload-relations": cmd_upload_relations,
        "upload-records": cmd_upload_records,
        "upload-grader": cmd_upload_grader,
        "verify": cmd_verify,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
