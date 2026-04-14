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
  uv run scripts/finetune.py list-models --workflow-id WF_ID --job-id JOB_ID
  uv run scripts/finetune.py cancel-training --workflow-id WF_ID --job-id JOB_ID
  uv run scripts/finetune.py cancel-eval --workflow-id WF_ID --eval-id EVAL_ID

Exit codes:
  0 - success
  1 - error (details on stderr)
  2 - job was cancelled (not an error, but a terminal state)
"""

import argparse
import json
import sys
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:9090"
_EPOCH_CANDIDATE_FIELDS = (
    "score",
    "reason",
    "status",
    "rollout_content",
    "rollout_output",
    "completion",
    "response",
    "output",
)


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


def _fetch_all_finetune_evals(base_url: str, wf_id: str, provider_job_id: str | None = None) -> dict:
    """Fetch ALL finetune evaluation rows by paginating through all pages.

    Backend defaults limit=20 when row_index is not specified.
    This helper pages with limit=100 until all rows are fetched.
    """
    url = f"{base_url}/finetune/workflows/{wf_id}/finetune-evaluations"
    params: dict[str, str] = {}
    if provider_job_id:
        params["finetune_job_id"] = provider_job_id

    all_results: list = []
    page_size = 100
    offset = 0

    while True:
        page_params = {**params, "limit": str(page_size), "offset": str(offset)}
        page = _api("GET", url, params=page_params)
        results = page.get("results", [])
        if not results:
            break
        all_results.extend(results)
        if len(results) < page_size:
            break
        offset += len(results)

    return {"results": all_results}


def _coerce_score(value: object) -> float | None:
    """Parse numeric scores from gateway payloads that may return strings."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def _epoch_sort_key(key: object) -> tuple[int, float | str]:
    """Sort epoch keys numerically when possible, then lexically."""
    try:
        return (0, float(key))
    except (TypeError, ValueError):
        return (1, str(key))


def _normalize_epoch_candidate_dict(item: dict) -> list[dict]:
    """Normalize one candidate dict or dict-of-lists payload."""
    field_values = {
        field: item[field]
        for field in _EPOCH_CANDIDATE_FIELDS
        if field in item
    }
    if not field_values:
        return []

    has_sequence = any(
        isinstance(value, (list, tuple))
        for value in field_values.values()
    )

    def _build_candidate(source: dict[str, object]) -> dict:
        candidate: dict = {}
        score = _coerce_score(source.get("score"))
        if score is not None:
            candidate["score"] = score
        for field, value in source.items():
            if field == "score" or value is None:
                continue
            candidate[field] = value
        return candidate

    if not has_sequence:
        candidate = _build_candidate(field_values)
        return [candidate] if candidate else []

    max_len = max(
        len(value)
        for value in field_values.values()
        if isinstance(value, (list, tuple))
    )
    candidates: list[dict] = []
    for idx in range(max_len):
        source = {}
        for field, value in field_values.items():
            if isinstance(value, (list, tuple)):
                source[field] = value[idx] if idx < len(value) else None
            else:
                source[field] = value
        candidate = _build_candidate(source)
        if candidate:
            candidates.append(candidate)
    return candidates


def _normalize_epoch_candidates(raw: object) -> list[dict]:
    """Flatten mixed gateway epoch payloads into candidate dicts."""
    candidates: list[dict] = []

    def _visit(value: object) -> None:
        if value is None:
            return
        if isinstance(value, dict):
            if any(field in value for field in _EPOCH_CANDIDATE_FIELDS):
                normalized = _normalize_epoch_candidate_dict(value)
                if normalized:
                    candidates.extend(normalized)
                    return
            for nested in value.values():
                _visit(nested)
            return
        if isinstance(value, (list, tuple)):
            for item in value:
                _visit(item)
            return

        score = _coerce_score(value)
        if score is not None:
            candidates.append({"score": score})
        elif isinstance(value, str):
            candidates.append({"rollout_output": value})

    _visit(raw)
    return candidates


def _iter_epoch_candidates(epochs: object, reverse: bool = False):
    """Yield normalized candidates for each epoch in sorted order."""
    if not isinstance(epochs, dict):
        return
    for epoch_key in sorted(epochs.keys(), key=_epoch_sort_key, reverse=reverse):
        for candidate in _normalize_epoch_candidates(epochs.get(epoch_key)):
            yield epoch_key, candidate


def _best_epoch_candidate(items: object) -> dict | None:
    """Return the highest-scoring candidate from one epoch payload."""
    best_candidate = None
    best_score = None
    for candidate in _normalize_epoch_candidates(items):
        score = candidate.get("score")
        if score is not None:
            if best_score is None or score > best_score:
                best_candidate = candidate
                best_score = score
    return best_candidate


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
    sources = existing if isinstance(existing, list) else existing.get("knowledge_sources", existing.get("sources", []))

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
    """Transform a part: move 'id' to 'reference_id', remove 'source_id',
    ensure top-level 'pages' are copied into extraction_metadata."""
    part = {**p}
    if "id" in part:
        part["reference_id"] = part.pop("id")
    part.pop("source_id", None)

    # Ensure pages are in extraction_metadata (UI reads from there)
    top_pages = part.get("pages")
    if top_pages and isinstance(top_pages, list) and len(top_pages) > 0:
        em = part.get("extraction_metadata") or {}
        if not isinstance(em, dict):
            em = {}
        existing = em.get("pages")
        if not existing or (isinstance(existing, list) and len(existing) == 0):
            em["pages"] = top_pages
            part["extraction_metadata"] = em

    return part


def cmd_upload_knowledge(args: argparse.Namespace) -> None:
    """Upload a knowledge source (document + extracted parts) to a workflow.

    Expected parts file format (knowledge_parts.json):
      {"source": {...}, "parts": [{"id": "doc-1-ch3", "type": "text", "title": "...", "content": "..."}]}
    Or a bare array of part objects.

    Transforms: 'id' → 'reference_id', removes 'source_id' before upload.
    Always checks for existing sources with the same name to prevent duplicates
    on retry. With --force, deletes and re-uploads. Without --force, skips if
    a source with parts already exists (safe resume after crash).
    """
    doc_path = Path(args.file)
    if not doc_path.exists():
        print(f"Error: Document not found: {doc_path}", file=sys.stderr)
        sys.exit(1)

    source_name = args.name or doc_path.name

    # Always check for existing sources with same name to prevent duplicates.
    # The gateway's knowledge source endpoint does plain INSERT (no upsert),
    # so retrying without this check creates duplicate sources.
    existing = _api("GET", f"{args.base_url}/finetune/workflows/{args.workflow_id}/knowledge")
    existing_sources = existing if isinstance(existing, list) else existing.get("knowledge_sources", existing.get("sources", []))
    matching = [s for s in existing_sources if s.get("name") == source_name]

    if matching and args.force:
        deleted = _delete_existing_knowledge_by_name(
            args.base_url, args.workflow_id, source_name,
        )
        if deleted:
            print(f"  Force mode: removed {deleted} existing source(s)")
    elif matching:
        # Check if existing source already has parts (completed upload)
        existing_src = matching[0]
        # Gateway returns parts as array "part", not a count field
        parts_array = existing_src.get("part", existing_src.get("parts", []))
        part_count = len(parts_array) if isinstance(parts_array, list) else existing_src.get("part_count", 0)
        if part_count > 0:
            print(f"  Source '{source_name}' already exists with {part_count} parts — skipping (use --force to replace)")
            print(f"  Knowledge source ID: {existing_src.get('id', 'unknown')}")
            return
        # Source exists but has no parts (crash during previous upload) — delete and re-upload
        _delete_existing_knowledge_by_name(
            args.base_url, args.workflow_id, source_name,
        )
        print(f"  Removed incomplete source '{source_name}' (0 parts) — re-uploading")

    # Upload the document as a knowledge source (always POST after cleanup)
    form_data = {
        "name": source_name,
        "description": args.description or f"Source document: {doc_path.name}",
    }
    if args.metadata:
        form_data["metadata"] = args.metadata

    with doc_path.open("rb") as fh:
        files = {"file": (doc_path.name, fh, "application/pdf")}
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

    # Auto-flatten: if topics use nested "children" structure, flatten to
    # a list with parent_id fields. The gateway requires flat topics.
    def _has_children(t_list: list) -> bool:
        return any(isinstance(t.get("children"), list) for t in t_list)

    if _has_children(raw_topics):
        flat: list[dict] = []

        def _flatten(node: dict, parent_id: str | None = None) -> None:
            entry = {k: v for k, v in node.items() if k != "children"}
            if parent_id:
                entry["parent_id"] = parent_id
            flat.append(entry)
            for child in node.get("children") or []:
                _flatten(child, parent_id=entry.get("id"))

        for t in raw_topics:
            _flatten(t)
        print(f"  Auto-flattened nested hierarchy: {len(raw_topics)} root(s) → {len(flat)} topics")
        raw_topics = flat

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

    # Sanitize topic names and IDs: replace "/" with "-" to prevent
    # UI path routing issues (the UI splits on "/" for navigation).
    sanitized_count = 0
    for t in raw_topics:
        for field in ("name", "id", "reference_id"):
            val = t.get(field)
            if val and "/" in val:
                t[field] = val.replace("/", "-")
                sanitized_count += 1
    if sanitized_count:
        print(f"  Sanitized {sanitized_count} topic field(s): replaced '/' with '-'", file=sys.stderr)
        # Save sanitized topics back to file so local copy is consistent
        if isinstance(topics, list):
            topics_path.write_text(json.dumps(raw_topics, indent=2))
        elif isinstance(topics, dict) and "topics" in topics:
            topics["topics"] = raw_topics
            topics_path.write_text(json.dumps(topics, indent=2))

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
    workflow_id: str, relations: list[dict], base_url: str,
) -> list[dict]:
    """Resolve reference_id-based identifiers to UUIDs scoped to this workflow.

    The gateway's create_relations endpoint looks up parts globally (not scoped to
    the workflow). If the same reference_id exists in parts from old/deleted workflows,
    the lookup can match the wrong part and fail validation. Resolving to UUIDs here
    avoids the ambiguity.
    """
    # Build topic ref→uuid map via REST API (matches by id, reference_id, or name)
    topics_resp = _api("GET", f"{base_url}/finetune/workflows/{workflow_id}/topics")
    topics_list = topics_resp if isinstance(topics_resp, list) else topics_resp.get("topics", [])
    topic_map: dict[str, str] = {}
    for t in topics_list:
        row_id = t["id"]
        topic_map[row_id] = row_id
        ref_id = t.get("reference_id")
        if ref_id:
            topic_map[ref_id] = row_id
        name = t.get("name")
        if name:
            topic_map[name] = row_id

    # Build part ref→uuid map via REST API (scoped to this workflow's knowledge sources)
    sources_resp = _api("GET", f"{base_url}/finetune/workflows/{workflow_id}/knowledge")
    sources_list = sources_resp if isinstance(sources_resp, list) else sources_resp.get("knowledge_sources", sources_resp.get("sources", []))
    part_map: dict[str, str] = {}
    for src in sources_list:
        for p in src.get("part", src.get("parts", [])):
            row_id = p["id"]
            part_map[row_id] = row_id
            ref_id = p.get("reference_id")
            if ref_id:
                part_map[ref_id] = row_id

    resolved = []
    skipped = 0
    for rel in relations:
        # Accept both key naming conventions: topic_identifier/part_identifier
        # and topic_id/part_id (agents may generate either format)
        topic_key = rel.get("topic_identifier") or rel.get("topic_id")
        part_key = rel.get("part_identifier") or rel.get("part_id")
        if not topic_key:
            skipped += 1
            print(f"  Warning: relation missing topic_identifier/topic_id — skipping", file=sys.stderr)
            continue
        if not part_key:
            skipped += 1
            print(f"  Warning: relation missing part_identifier/part_id — skipping", file=sys.stderr)
            continue
        topic_id = topic_map.get(topic_key)
        part_id = part_map.get(part_key)
        if not topic_id:
            skipped += 1
            print(f"  Warning: topic '{topic_key}' not found — skipping relation", file=sys.stderr)
            continue
        if not part_id:
            skipped += 1
            print(f"  Warning: part '{part_key}' not found — skipping relation", file=sys.stderr)
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
    resolved = _resolve_identifiers_to_uuids(args.workflow_id, rel_list, args.base_url)

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

    # Build topic reference_id → UUID map via REST API (matches by id, reference_id, or name)
    topic_map: dict[str, str] = {}
    try:
        topics_resp = _api("GET", f"{args.base_url}/finetune/workflows/{args.workflow_id}/topics")
        topics_list = topics_resp if isinstance(topics_resp, list) else topics_resp.get("topics", [])
        for t in topics_list:
            row_id = t["id"]
            topic_map[row_id] = row_id
            ref_id = t.get("reference_id")
            if ref_id:
                topic_map[ref_id] = row_id
            name = t.get("name")
            if name:
                topic_map[name] = row_id
    except Exception as e:
        print(f"Warning: Could not load topic map from API: {e}", file=sys.stderr)
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
        # Build metadata: source_parts + prompt_type (for trace-informed curriculum)
        meta: dict = {}
        if r.get("source_parts"):
            meta["source_parts"] = r["source_parts"]
        if r.get("prompt_type"):
            meta["prompt_type"] = r["prompt_type"]
        if meta:
            record["metadata"] = json.dumps(meta)
        records.append(record)

    if topic_misses:
        print(f"Error: {topic_misses} records have topic IDs not found in gateway topics.", file=sys.stderr)
        print("  This means records reference topics that were never uploaded (or were deleted).", file=sys.stderr)
        print("  Fix: upload topics first (finetune.py upload-topics), then retry upload-records.", file=sys.stderr)
        print("  Or check training.jsonl — records may have ad-hoc topic IDs not in topics.json.", file=sys.stderr)
        sys.exit(1)

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

    # Auto-journal: include topic breakdown so the UI sees which topics are uploading
    topic_counts: dict[str, int] = {}
    for rec in records:
        t = rec.get("topic", "unknown")
        topic_counts[t] = topic_counts.get(t, 0) + 1
    topic_summary = ", ".join(f"{t}={c}" for t, c in sorted(topic_counts.items())[:5])
    if len(topic_counts) > 5:
        topic_summary += f" (+{len(topic_counts) - 5} more)"

    _auto_journal(
        project_dir=records_path.resolve().parent,
        step="step_4_generation",
        action="upload_records",
        status="completed",
        summary=f"Uploaded {total_uploaded} records. Topics: {topic_summary}",
        results={"uploaded": total_uploaded, "topics": dict(topic_counts)},
        workflow_id=args.workflow_id,
    )


def cmd_filter_records(args: argparse.Namespace) -> None:
    """Filter out bad records from local JSONL and gateway based on eval results.

    Reads eval results, identifies records to remove (by score threshold, reason
    pattern, or topic), removes them from the local JSONL file, and optionally
    syncs the deletions to the gateway. Prints a summary of what was removed
    so the agent can regenerate replacements with --append.
    """
    eval_file = Path(args.file)
    if not eval_file.exists():
        print(f"Error: Eval file not found: {eval_file}", file=sys.stderr)
        sys.exit(1)

    eval_data = json.loads(eval_file.read_text())
    results = eval_data.get("results", [])
    if not results:
        print("Error: No results in eval file", file=sys.stderr)
        sys.exit(1)

    # Build set of record IDs to remove
    remove_ids: set[str] = set()
    remove_reasons: dict[str, str] = {}
    max_score = args.max_score
    min_score = getattr(args, "min_score", None)
    reason_pattern = args.reason_pattern

    for r in results:
        row = r.get("row", {})
        record_id = row.get("id", row.get("record_id", ""))
        if not record_id:
            continue

        for _epoch_key, candidates in r.get("epochs", {}).items():
            for c in _normalize_epoch_candidates(candidates):
                score = c.get("score")
                reason = c.get("reason", "")
                if score is None:
                    continue

                should_remove = False

                # Filter by score threshold (remove low-scoring records)
                if max_score is not None and float(score) <= max_score:
                    should_remove = True

                # Filter by min-score threshold (remove trivially easy records)
                # Used for signal density optimization: remove records the model
                # already aces so GRPO gradient concentrates on learnable ones.
                # Ref: arXiv:2504.09696 (GRPO-LEAD filters >75% accuracy)
                if min_score is not None and float(score) >= min_score:
                    should_remove = True

                # Filter by reason pattern
                if reason_pattern and reason_pattern.lower() in reason.lower():
                    should_remove = True

                if should_remove:
                    remove_ids.add(record_id)
                    remove_reasons[record_id] = f"score={score}, reason={reason[:80]}"

    # Filter by topic if specified
    if args.topic:
        for r in results:
            row = r.get("row", {})
            record_id = row.get("id", row.get("record_id", ""))
            topic = row.get("topic", "")
            if topic == args.topic:
                remove_ids.add(record_id)
                remove_reasons[record_id] = f"topic={topic}"

    if not remove_ids:
        print("No records matched the filter criteria.")
        return

    print(f"Records to remove: {len(remove_ids)}")

    # Remove from local JSONL
    jsonl_path = Path(args.training_file) if args.training_file else None
    local_removed = 0
    if jsonl_path and jsonl_path.exists():
        lines = jsonl_path.read_text().strip().splitlines()
        kept = []
        removed_topics: dict[str, int] = {}
        for line in lines:
            try:
                rec = json.loads(line)
                rid = rec.get("id", "")
                if rid in remove_ids:
                    local_removed += 1
                    topic = rec.get("topic", "unknown")
                    removed_topics[topic] = removed_topics.get(topic, 0) + 1
                else:
                    kept.append(line)
            except json.JSONDecodeError:
                kept.append(line)
        jsonl_path.write_text("\n".join(kept) + "\n" if kept else "")
        print(f"Local JSONL: {len(lines)} → {len(kept)} ({local_removed} removed)")
        if removed_topics:
            print("  Removed by topic:")
            for topic, count in sorted(removed_topics.items(), key=lambda x: -x[1]):
                print(f"    {topic}: {count}")

    # Remove from gateway
    if args.sync_gateway and args.workflow_id:
        gw_removed = 0
        for rid in remove_ids:
            try:
                _api(
                    "DELETE",
                    f"{args.base_url}/finetune/workflows/{args.workflow_id}/records/{rid}",
                )
                gw_removed += 1
            except SystemExit:
                pass  # record may not exist on gateway
        print(f"Gateway: {gw_removed} records deleted")

    # Summary for regeneration
    if removed_topics:
        print(f"\nTo regenerate replacements, run generate_records.py --append with "
              f"--records-per-topic targeting these topics:")
        for topic, count in sorted(removed_topics.items(), key=lambda x: -x[1]):
            print(f"  {topic}: needs {count} replacement(s)")

    # Show sample reasons
    if args.verbose:
        print("\nSample removed records:")
        for rid, reason in list(remove_reasons.items())[:10]:
            print(f"  {rid}: {reason}")

    # Auto-journal: records filtered
    _auto_journal(
        project_dir=Path(args.training_file).resolve().parent if args.training_file else Path("finetune-project"),
        step="step_8_training",
        action="filter_records",
        status="completed",
        summary=f"Filtered {len(remove_ids)} records"
                + (f" (max_score<={args.max_score})" if args.max_score is not None else "")
                + (f" (min_score>={args.min_score})" if getattr(args, "min_score", None) is not None else "")
                + (f" (topic={args.topic})" if args.topic else "")
                + f". Local: {local_removed} removed.",
        results={
            "removed_count": len(remove_ids),
            "local_removed": local_removed,
            "removed_by_topic": removed_topics if jsonl_path else {},
        },
        workflow_id=getattr(args, "workflow_id", None),
    )


def cmd_log_iteration(args: argparse.Namespace) -> None:
    """Log an eval or training iteration with what changed and the results.

    Maintains iterations.json in the project dir — a structured changelog
    so the agent (and humans) can track what was tried, what improved,
    and what regressed across eval and training cycles.

    Call after every eval readiness check OR after training analysis.
    """
    from datetime import datetime, timezone

    project_dir = Path(args.project_dir)
    iterations_file = project_dir / "iterations.json"

    iterations: list[dict] = []
    if iterations_file.exists():
        iterations = json.loads(iterations_file.read_text())

    iteration_num = len(iterations) + 1

    # Auto-detect phase from provided file if --phase not given
    phase = args.phase
    if not phase:
        if args.eval_file:
            phase = "eval"
        elif args.training_file:
            phase = "training"
        else:
            print("Error: provide --phase, --eval-file, or --training-file", file=sys.stderr)
            sys.exit(1)

    entry: dict = {
        "iteration": iteration_num,
        "phase": phase,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "changes": args.changes,
        "change_type": args.change_type,
    }

    if phase == "eval":
        eval_file = Path(args.eval_file)
        if not eval_file.exists():
            print(f"Error: Eval file not found: {eval_file}", file=sys.stderr)
            sys.exit(1)
        eval_data = json.loads(eval_file.read_text())

        from collections import defaultdict
        scores: list[float] = []
        topic_scores: dict[str, list[float]] = defaultdict(list)
        for r in eval_data.get("results", []):
            topic = None
            row = r.get("row", {})
            if isinstance(row, dict):
                topic = row.get("topic")
            for _ek, candidates in r.get("epochs", {}).items():
                for c in _normalize_epoch_candidates(candidates):
                    s = c.get("score")
                    if s is not None:
                        score_val = float(s)
                        scores.append(score_val)
                        if topic:
                            topic_scores[topic].append(score_val)

        avg_score = sum(scores) / len(scores) if scores else 0
        zero_rate = sum(1 for s in scores if s < 0.01) / len(scores) if scores else 0
        perfect_rate = sum(1 for s in scores if s >= 0.99) / len(scores) if scores else 0
        score_std = (sum((s - avg_score) ** 2 for s in scores) / len(scores)) ** 0.5 if scores else 0

        entry["eval_file"] = str(eval_file)
        entry["eval_id"] = eval_data.get("evaluation_run_id", "")
        entry["metrics"] = {
            "total_scores": len(scores),
            "avg_score": round(avg_score, 4),
            "score_std": round(score_std, 4),
            "zero_rate": round(zero_rate, 4),
            "perfect_rate": round(perfect_rate, 4),
            "distinct_buckets": len({round(s, 2) for s in scores}),
        }

        # Per-topic metrics
        if topic_scores:
            per_topic: dict[str, dict] = {}
            for t, t_scores in sorted(topic_scores.items()):
                t_avg = sum(t_scores) / len(t_scores)
                t_zero = sum(1 for s in t_scores if s < 0.01) / len(t_scores)
                t_std = (sum((s - t_avg) ** 2 for s in t_scores) / len(t_scores)) ** 0.5
                per_topic[t] = {
                    "count": len(t_scores),
                    "avg_score": round(t_avg, 4),
                    "zero_rate": round(t_zero, 4),
                    "score_std": round(t_std, 4),
                }
            entry["per_topic"] = per_topic

        entry["verdict"] = args.verdict

    elif phase == "training":
        train_file = Path(args.training_file)
        if not train_file.exists():
            print(f"Error: Training file not found: {train_file}", file=sys.stderr)
            sys.exit(1)
        train_data = json.loads(train_file.read_text())

        entry["training_file"] = str(train_file)
        entry["job_id"] = train_data.get("job_id", "")
        entry["status"] = train_data.get("status", "")
        entry["model"] = train_data.get("base_model", "")
        entry["fine_tuned_model"] = train_data.get("fine_tuned_model", "")

        # Extract training config
        config = train_data.get("training_config", {})
        inference = train_data.get("inference_parameters", {})
        entry["config"] = {
            "epochs": config.get("epochs"),
            "learning_rate": config.get("learning_rate"),
            "lora_rank": config.get("lora_rank"),
            "batch_size": config.get("batch_size"),
            "max_output_tokens": inference.get("max_output_tokens"),
            "K": inference.get("response_candidates_count"),
        }

        # Extract training metrics from side files if available
        metrics_file = train_file.parent / f"{train_file.stem}-metrics.json"
        if metrics_file.exists():
            try:
                metrics_data = json.loads(metrics_file.read_text())
                steps = metrics_data if isinstance(metrics_data, list) else metrics_data.get("steps", [])
                if steps:
                    last = steps[-1]
                    entry["metrics"] = {
                        "final_reward": last.get("reward_mean") or last.get("reward"),
                        "final_kl": last.get("kl_mean") or last.get("kl"),
                        "final_clipping": last.get("clipped_ratio"),
                        "total_steps": len(steps),
                        "epochs_completed": last.get("epoch"),
                    }
                    # Also get first step for comparison
                    first = steps[0]
                    entry["metrics"]["initial_reward"] = first.get("reward_mean") or first.get("reward")
                    reward_delta = (entry["metrics"].get("final_reward") or 0) - (entry["metrics"].get("initial_reward") or 0)
                    entry["metrics"]["reward_delta"] = round(reward_delta, 4)
            except (json.JSONDecodeError, KeyError):
                pass

        if train_data.get("early_stop_reason"):
            entry["early_stop_reason"] = train_data["early_stop_reason"]

        entry["verdict"] = args.verdict

    # Compare with previous iteration of the same phase
    prev_same_phase = [it for it in iterations if it.get("phase") == phase]
    if prev_same_phase and entry.get("metrics"):
        prev = prev_same_phase[-1]
        prev_m = prev.get("metrics", {})
        curr_m = entry["metrics"]

        # Pick comparison keys based on phase
        if phase == "eval":
            compare_keys = {
                "avg_score": True,       # higher is better
                "zero_rate": False,      # lower is better
                "perfect_rate": False,   # lower is better (usually)
                "distinct_buckets": True,  # higher is better
            }
        else:
            compare_keys = {
                "final_reward": True,    # higher is better
                "final_kl": False,       # lower is better
                "reward_delta": True,    # higher is better
            }

        delta: dict = {}
        for key, higher_is_better in compare_keys.items():
            old_val = prev_m.get(key)
            new_val = curr_m.get(key)
            if old_val is not None and new_val is not None:
                diff = new_val - old_val
                improved = (diff > 0) if higher_is_better else (diff < 0)
                delta[key] = {
                    "old": old_val,
                    "new": new_val,
                    "diff": round(diff, 4),
                    "improved": improved,
                }
        entry["delta"] = delta

        prev_num = prev.get("iteration", "?")
        print(f"\n=== Iteration {iteration_num} ({phase}) vs {prev_num} ===")
        print(f"Changes: [{args.change_type}] {args.changes}")
        print()
        for key, d in delta.items():
            arrow = "↑" if d["diff"] > 0 else "↓" if d["diff"] < 0 else "="
            status = "✓" if d["improved"] else "✗" if not d["improved"] and d["diff"] != 0 else "="
            fmt = ".1%" if "rate" in key else ".4f"
            old_str = f"{d['old']:{fmt}}" if isinstance(d['old'], float) else str(d['old'])
            new_str = f"{d['new']:{fmt}}" if isinstance(d['new'], float) else str(d['new'])
            diff_str = f"{abs(d['diff']):{fmt}}" if isinstance(d['diff'], float) else str(abs(d['diff']))
            print(f"  {key:20s}: {old_str} → {new_str} ({arrow} {diff_str}) {status}")

        # Per-topic delta comparison (eval phase only)
        curr_pt = entry.get("per_topic", {})
        prev_pt = prev.get("per_topic", {})
        if curr_pt and prev_pt:
            all_topics = sorted(set(curr_pt) | set(prev_pt))
            stalled: list[str] = []
            print(f"\n  Per-topic changes:")
            for t in all_topics:
                c = curr_pt.get(t)
                p = prev_pt.get(t)
                if not c:
                    print(f"    {t:30s}: REMOVED")
                    continue
                if not p:
                    print(f"    {t:30s}: NEW avg={c['avg_score']:.3f} zero={c['zero_rate']:.0%} n={c['count']}")
                    continue
                avg_diff = c["avg_score"] - p["avg_score"]
                zero_diff = c["zero_rate"] - p["zero_rate"]
                avg_arrow = "↑" if avg_diff > 0.005 else "↓" if avg_diff < -0.005 else "="
                zero_arrow = "↑" if zero_diff > 0.005 else "↓" if zero_diff < -0.005 else "="
                print(f"    {t:30s}: avg {p['avg_score']:.3f}→{c['avg_score']:.3f} ({avg_arrow}{abs(avg_diff):.3f})  zero {p['zero_rate']:.0%}→{c['zero_rate']:.0%} ({zero_arrow}{abs(zero_diff):.0%})")
                # Flag stalled: no improvement AND no variance (dead weight).
                # Topics with low avg but some std are HARD_BUT_LEARNING — good for RFT.
                if avg_diff < 0.01 and c["zero_rate"] > 0.8 and c["score_std"] < 0.05:
                    stalled.append(t)
            if stalled:
                entry["stalled_topics"] = stalled
                print(f"\n  ⚠️  DEAD WEIGHT topics (no improvement, >80% zeros, no variance): {', '.join(stalled)}")

        print(f"\n  Verdict: {args.verdict}")
    else:
        print(f"\n=== Iteration {iteration_num} ({phase} baseline) ===")
        print(f"Changes: {args.changes}")
        if entry.get("metrics"):
            for k, v in entry["metrics"].items():
                if v is not None:
                    print(f"  {k}: {v}")
        if phase == "training" and entry.get("config"):
            print(f"  Config: {json.dumps(entry['config'])}")
        # Show per-topic baseline for first eval
        if phase == "eval" and entry.get("per_topic"):
            pt = entry["per_topic"]
            print(f"\n  Per-topic baseline ({len(pt)} topics):")
            for t in sorted(pt, key=lambda k: pt[k]["avg_score"]):
                m = pt[t]
                print(f"    {t:30s}: avg={m['avg_score']:.3f}  zero={m['zero_rate']:.0%}  std={m['score_std']:.3f}  n={m['count']}")
        print(f"  Verdict: {args.verdict}")

    iterations.append(entry)
    iterations_file.write_text(json.dumps(iterations, indent=2))
    print(f"\nSaved to {iterations_file}")


def _auto_journal(
    project_dir: str | Path,
    step: str,
    action: str,
    status: str,
    summary: str,
    reason: str | None = None,
    analysis: str | None = None,
    decision: str | None = None,
    job_id: str | None = None,
    job_type: str | None = None,
    model: str | None = None,
    results: dict | None = None,
    details: dict | None = None,
    triggered_by: int | None = None,
    workflow_id: str | None = None,
    base_url: str | None = None,
) -> int:
    """Auto-log a pipeline step to both execution-log.md and pipeline-journal.json.

    Called internally by pipeline commands (create-eval, poll-eval, readiness-check,
    create-training, poll-training, etc.) so the agent doesn't need to remember
    to call log-step manually. The agent can still call log-step to add analysis
    and decision context — auto-journal captures the facts, agent adds reasoning.

    Returns the journal entry ID.
    """
    from datetime import datetime, timezone

    project_dir = Path(project_dir)
    journal_file = project_dir / "pipeline-journal.json"
    log_file = project_dir / "execution-log.md"

    if not project_dir.exists():
        return 0

    # Load or create journal
    if journal_file.exists():
        try:
            journal = json.loads(journal_file.read_text())
        except (json.JSONDecodeError, OSError):
            journal = {"version": "1.0", "workflow_id": workflow_id or "", "entries": []}
    else:
        journal = {"version": "1.0", "workflow_id": workflow_id or "", "entries": []}

    # Set workflow_id if provided and not already set
    if workflow_id and not journal.get("workflow_id"):
        journal["workflow_id"] = workflow_id

    entries_list = journal["entries"]

    # Deduplication: skip if the last entry is byte-identical. Prevents
    # double-logging when pollers like poll-eval invoke _auto_journal twice
    # in a single call chain.
    if entries_list:
        _last = entries_list[-1]
        if (_last.get("step") == step and _last.get("action") == action
                and _last.get("status") == status and _last.get("summary") == summary):
            return _last.get("id", 0)

    timestamp = datetime.now(timezone.utc).isoformat()
    next_id = max((e["id"] for e in entries_list), default=0) + 1

    # Retry detection: count prior completed/fail entries for this (step, action).
    # If any exist and we're logging a new terminal status, annotate with
    # [retry N] so the user can see loop convergence without reading the
    # transcript. Mirrors the same logic in pipeline_journal.log_milestone.
    prior_terminal = [
        e for e in entries_list
        if e.get("step") == step and e.get("action") == action
        and e.get("status") in ("completed", "fail")
    ]
    if prior_terminal and status in ("completed", "fail"):
        attempt = len(prior_terminal) + 1
        if not summary.startswith("[retry "):
            summary = f"[retry {attempt}] {summary}"
        if details is None:
            details = {}
        details = {**details, "retry_attempt": attempt}

    # In-progress resolver: point any open in_progress entry for the same
    # (step, action) at this terminal entry so the journal closes the loop
    # without mutating history.
    if status in ("completed", "fail"):
        for e in entries_list:
            if (e.get("step") == step and e.get("action") == action
                    and e.get("status") == "in_progress"
                    and "resolved_by_id" not in e):
                e["resolved_by_id"] = next_id

    entry: dict = {
        "id": next_id,
        "timestamp": timestamp,
        "step": step,
        "action": action,
        "status": status,
        "summary": summary,
        "auto_logged": True,
    }
    if reason:
        entry["reason_created"] = reason
    if analysis:
        entry["analysis"] = analysis
    if decision:
        entry["decision"] = decision
    if job_id:
        entry["job_id"] = job_id
    if job_type:
        entry["job_type"] = job_type
    if model:
        entry["model"] = model
    if results:
        entry["results"] = results
    if details:
        entry["details"] = details
    if triggered_by:
        entry["triggered_by"] = triggered_by
        for e in journal["entries"]:
            if e["id"] == triggered_by:
                e["triggers_next"] = next_id
                break

    journal["entries"].append(entry)
    try:
        journal_file.write_text(json.dumps(journal, indent=2))
    except OSError:
        pass

    # Append to execution log
    status_label = "IN PROGRESS" if status == "in_progress" else status
    step_label = step.replace("_", " ").replace("step ", "Step ").title()
    log_entry = f"\n## {step_label} — {timestamp[:19].replace('T', ' ')}\n"
    log_entry += f"- **Status**: {status_label}\n"
    log_entry += f"- **Summary**: {summary}\n"
    if reason:
        log_entry += f"- **Reason**: {reason}\n"
    if analysis:
        log_entry += f"- **Analysis**: {analysis}\n"
    if decision:
        log_entry += f"- **Decision**: {decision}\n"
    if model:
        log_entry += f"- **Model**: {model}\n"
    if job_id:
        log_entry += f"- **Job ID**: {job_id}\n"
    if results:
        for k, v in results.items():
            log_entry += f"- **{k}**: {v}\n"

    try:
        with open(log_file, "a") as f:
            f.write(log_entry)
    except OSError:
        pass

    print(f"  [auto-journal #{next_id}] {action} ({status}): {summary}", file=sys.stderr)

    # Upload to gateway API (non-blocking — local file is the source of truth)
    # The gateway provides atomic read-modify-write so concurrent calls are safe.
    # This makes the journal visible in the UI and persisted in the database.
    workflow_id = journal.get("workflow_id") or ""
    if not workflow_id:
        # Try to read from config.json — check same directory as journal file
        for config_candidate in [
            project_dir / "config.json",
            project_dir.parent / "config.json",  # in case project_dir is a subdirectory
        ]:
            if config_candidate.exists():
                try:
                    workflow_id = json.loads(config_candidate.read_text()).get("workflow_id", "")
                    if workflow_id:
                        journal["workflow_id"] = workflow_id
                        # Persist the workflow_id so subsequent calls don't need to re-read
                        try:
                            journal_file.write_text(json.dumps(journal, indent=2))
                        except OSError:
                            pass
                        break
                except (json.JSONDecodeError, OSError):
                    pass

    if workflow_id:
        gw_url = base_url or DEFAULT_BASE_URL
        try:
            import requests
            # Full sync: PUT the entire local journal to gateway.
            # This ensures local and gateway are always identical.
            # The gateway expects pipeline_journal as a JSON string.
            requests.put(
                f"{gw_url}/finetune/workflows/{workflow_id}",
                json={"pipeline_journal": json.dumps(journal)},
                timeout=5,
            )
        except Exception:
            pass  # Non-fatal: local file already has the entry

    return next_id


def cmd_log_step(args: argparse.Namespace) -> None:
    """Log a pipeline step to both execution-log.md and pipeline-journal.json.

    Single command that writes to both files at once — the execution log
    (human-readable narrative) and the pipeline journal (structured JSON
    for the UI to show the reasoning chain behind each job).

    Called at two points per step:
    1. When a step STARTS: --status in_progress
    2. When a step COMPLETES: --status completed (with results)
    """
    from datetime import datetime, timezone

    project_dir = Path(args.project_dir)
    journal_file = project_dir / "pipeline-journal.json"
    log_file = project_dir / "execution-log.md"

    # ── Load or create journal ──
    if journal_file.exists():
        journal = json.loads(journal_file.read_text())
    else:
        journal = {
            "version": "1.0",
            "workflow_id": args.workflow_id or "",
            "objective": "",
            "entries": [],
        }

    timestamp = datetime.now(timezone.utc).isoformat()
    next_id = max((e["id"] for e in journal["entries"]), default=0) + 1

    # ── Build journal entry ──
    entry = {
        "id": next_id,
        "timestamp": timestamp,
        "step": args.step,
        "action": args.action,
        "status": args.status,
        "summary": args.summary,
    }

    if args.reason:
        entry["reason_created"] = args.reason
    if args.analysis:
        entry["analysis"] = args.analysis
    if args.decision:
        entry["decision"] = args.decision
    if args.job_id:
        entry["job_id"] = args.job_id
    if args.job_type:
        entry["job_type"] = args.job_type
    if args.model:
        entry["model"] = args.model
    if args.triggered_by:
        entry["triggered_by"] = args.triggered_by
        # Update the triggering entry's triggers_next
        for e in journal["entries"]:
            if e["id"] == args.triggered_by:
                e["triggers_next"] = next_id
                break
    if args.duration:
        entry["duration"] = args.duration
    if args.agent:
        entry["agent"] = args.agent

    # Parse optional JSON details and results
    if args.details:
        try:
            entry["details"] = json.loads(args.details)
        except json.JSONDecodeError:
            entry["details"] = {"raw": args.details}
    if args.results:
        try:
            entry["results"] = json.loads(args.results)
        except json.JSONDecodeError:
            entry["results"] = {"raw": args.results}

    journal["entries"].append(entry)
    journal_file.write_text(json.dumps(journal, indent=2))

    # ── Append to execution log ──
    status_label = "IN PROGRESS" if args.status == "in_progress" else "completed"
    step_label = args.step.replace("_", " ").replace("step ", "Step ").title()

    log_entry = f"\n## {step_label} — {timestamp[:19].replace('T', ' ')}\n"
    log_entry += f"- **Status**: {status_label}\n"
    if args.agent:
        log_entry += f"- **Agent**: {args.agent}\n"
    if args.duration:
        log_entry += f"- **Duration**: {args.duration}\n"
    log_entry += f"- **Summary**: {args.summary}\n"
    if args.reason:
        log_entry += f"- **Reason**: {args.reason}\n"
    if args.analysis:
        log_entry += f"- **Analysis**: {args.analysis}\n"
    if args.decision:
        log_entry += f"- **Decision**: {args.decision}\n"
    if args.model:
        log_entry += f"- **Model**: {args.model}\n"
    if args.job_id:
        log_entry += f"- **Job ID**: {args.job_id}\n"

    with open(log_file, "a") as f:
        f.write(log_entry)

    # Upload to gateway API (non-blocking — local file is source of truth)
    wf_id = getattr(args, "workflow_id", None) or journal.get("workflow_id") or ""
    if not wf_id:
        for config_candidate in [
            project_dir / "config.json",
            project_dir.parent / "config.json",
        ]:
            if config_candidate.exists():
                try:
                    wf_id = json.loads(config_candidate.read_text()).get("workflow_id", "")
                    if wf_id:
                        break
                except (json.JSONDecodeError, OSError):
                    pass

    if wf_id:
        gw_url = getattr(args, "base_url", None) or DEFAULT_BASE_URL
        try:
            import requests
            # Full sync: PUT the entire local journal to gateway
            requests.put(
                f"{gw_url}/finetune/workflows/{wf_id}",
                json={"pipeline_journal": json.dumps(journal)},
                timeout=5,
            )
        except Exception:
            pass  # Non-fatal: local file already has the entry

    print(f"Journal entry #{next_id}: {args.action} ({args.status})")
    print(f"  Summary: {args.summary}")
    if args.reason:
        print(f"  Reason: {args.reason}")
    if args.decision:
        print(f"  Decision: {args.decision}")
    print(f"Saved to {journal_file} + {log_file}")


def cmd_upload_grader(args: argparse.Namespace) -> None:
    """Upload a grader/evaluator script to a workflow.

    The gateway expects multipart form data with the script in a 'file' field.
    It validates the script, wraps it as a JS evaluator config, and stores it
    in the workflow's eval_script column.

    Automatically runs a basic dry-run validation before uploading to catch
    syntax errors and obvious scoring bugs. Use --skip-dry-run to bypass.
    """
    grader_path = Path(args.file)
    if not grader_path.exists():
        print(f"Error: Grader file not found: {grader_path}", file=sys.stderr)
        sys.exit(1)

    # Auto dry-run: basic syntax + scoring sanity check before upload
    if not getattr(args, "skip_dry_run", False):
        import subprocess
        script_dir = Path(__file__).parent
        dry_run_script = script_dir / "dry_run_grader.py"
        if dry_run_script.exists():
            print("Running pre-upload dry-run validation...", file=sys.stderr)
            # Test with a minimal hand-crafted row
            test_row = json.dumps({
                "messages": [
                    {"role": "system", "content": "Test system prompt"},
                    {"role": "user", "content": "Test question"},
                    {"role": "assistant", "content": "Test answer"},
                ],
                "ground_truth": "test",
            })
            result = subprocess.run(
                [sys.executable, str(dry_run_script),
                 "--workflow-id", args.workflow_id,
                 "--script", str(grader_path),
                 "--row", test_row],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                print(f"⚠ Dry-run FAILED — grader has errors:", file=sys.stderr)
                print(result.stderr or result.stdout, file=sys.stderr)
                print(f"Fix the grader before uploading. Use --skip-dry-run to bypass.", file=sys.stderr)
                sys.exit(1)
            else:
                print(f"  ✓ Dry-run passed", file=sys.stderr)

    with grader_path.open("rb") as fh:
        files = {"file": (grader_path.name, fh, "application/javascript")}
        _api(
            "PATCH",
            f"{args.base_url}/finetune/workflows/{args.workflow_id}/evaluator",
            files=files,
        )
    grader_size = grader_path.stat().st_size
    print(f"Grader uploaded: {grader_path.name} ({grader_size} bytes)")

    # Auto-journal: grader uploaded (timestamped at upload, not when agent logs)
    _auto_journal(
        project_dir=grader_path.resolve().parent,
        step="step_5_grader",
        action="upload_grader",
        status="completed",
        summary=f"Grader uploaded: {grader_path.name} ({grader_size} bytes). "
                f"Dry-run: {'passed' if not getattr(args, 'skip_dry_run', False) else 'skipped'}.",
        workflow_id=args.workflow_id,
    )


def cmd_verify(args: argparse.Namespace) -> None:
    """Verify all data landed in the gateway via REST API."""
    wf_id = args.workflow_id
    base_url = args.base_url

    print(f"Workflow: {wf_id}")
    all_ok = True
    verify_counts: dict[str, int] = {}

    # Fetch workflow metadata (includes record count and eval_script)
    try:
        wf = _api("GET", f"{base_url}/finetune/workflows/{wf_id}")
    except SystemExit:
        print("  Error: Workflow not found or gateway unreachable!", file=sys.stderr)
        sys.exit(1)

    records_count = wf.get("records_count", wf.get("record_count", 0))
    has_eval = "YES" if wf.get("eval_script") else "NO"

    # Fetch topics
    try:
        topics_resp = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/topics")
        topics_list = topics_resp if isinstance(topics_resp, list) else topics_resp.get("topics", [])
        topics_count = len(topics_list)
    except SystemExit:
        topics_count = 0

    # Fetch knowledge sources and parts
    try:
        sources_resp = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/knowledge")
        sources_list = sources_resp if isinstance(sources_resp, list) else sources_resp.get("knowledge_sources", sources_resp.get("sources", []))
        sources_count = len(sources_list)
        parts_count = sum(len(s.get("part", s.get("parts", []))) for s in sources_list)
    except SystemExit:
        sources_count = 0
        parts_count = 0

    # Fetch relations
    try:
        relations_resp = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/topics/relations")
        relations_list = relations_resp if isinstance(relations_resp, list) else relations_resp.get("relations", [])
        relations_count = len(relations_list)
    except SystemExit:
        relations_count = 0

    checks = {
        "Records": records_count,
        "Topics": topics_count,
        "Sources": sources_count,
        "Parts": parts_count,
        "Relations": relations_count,
    }
    for label, count in checks.items():
        status = "OK" if isinstance(count, int) and count > 0 else "MISSING"
        if status == "MISSING":
            all_ok = False
        print(f"  {label}: {count} [{status}]")
        verify_counts[label.lower()] = count if isinstance(count, int) else 0

    if has_eval != "YES":
        all_ok = False
    print(f"  Evaluator: {has_eval}")

    if all_ok:
        print("\nAll checks passed. Ready for evaluation.")
        if not getattr(args, "no_journal", False):
            _auto_journal(
                project_dir=Path("finetune-project"),
                step="step_6_verify",
                action="verify_gateway",
                status="completed",
                summary=f"Gateway verified: {', '.join(f'{k}={v}' for k, v in verify_counts.items())}, evaluator={has_eval}. All checks passed.",
                results=verify_counts,
                workflow_id=wf_id,
            )
    else:
        print("\nSome checks failed. Re-run the upload for missing items.", file=sys.stderr)
        if not getattr(args, "no_journal", False):
            _auto_journal(
                project_dir=Path("finetune-project"),
                step="step_6_verify",
                action="verify_gateway",
                status="fail",
                summary=f"Verify FAILED: {', '.join(f'{k}={v}' for k, v in verify_counts.items())}, evaluator={has_eval}.",
                results=verify_counts,
                workflow_id=wf_id,
            )
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
        sources_list = sources_resp if isinstance(sources_resp, list) else sources_resp.get("knowledge_sources", sources_resp.get("sources", []))
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
        jobs = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/jobs?include_metrics=true")
        job_list = jobs if isinstance(jobs, list) else jobs.get("jobs", [])
        if not job_list:
            print("  No finetune jobs")
        for j in job_list:
            model = j.get("base_model", "?")
            status = j.get("status", "?")
            jid = j.get("id", "?")[:12]
            eval_metrics = j.get("eval_metrics") or {}
            avg_score = eval_metrics.get("avg_score")
            latest_epoch = eval_metrics.get("latest_epoch_with_score")
            rows_with_eval = eval_metrics.get("distinct_rows_with_eval")
            by_epoch = eval_metrics.get("avg_score_by_epoch") or []
            metrics_suffix = ""
            if avg_score is not None:
                metrics_suffix += f" avg={avg_score:.3f}"
            if latest_epoch is not None:
                metrics_suffix += f" latest_epoch={latest_epoch}"
            if rows_with_eval is not None:
                metrics_suffix += f" rows={rows_with_eval}"
            if by_epoch:
                metrics_suffix += f" epochs={len(by_epoch)}"
            print(f"  {jid}...  {status}  ({model}){metrics_suffix}")
    except SystemExit:
        print("  Could not fetch jobs from gateway")

    # ── Eval jobs (from local tracking files) ──
    print("\n── Eval Jobs ──")
    eval_metrics_by_run = {}
    try:
        metrics_rows = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/evaluations/metrics")
        if isinstance(metrics_rows, list):
            for row in metrics_rows:
                run_id = row.get("evaluation_run_id")
                if run_id:
                    eval_metrics_by_run[str(run_id)] = row
    except SystemExit:
        eval_metrics_by_run = {}

    eval_dir = project_dir / "evaluations"
    eval_jobs_shown = []
    if eval_dir.exists():
        eval_files = sorted(eval_dir.glob("eval-*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
        if not eval_files:
            print("  No eval jobs")
        for ef in eval_files:
            try:
                ed = json.loads(ef.read_text())
                eid = ed.get("evaluation_run_id", "?")[:12]
                estatus = ed.get("status", "?")
                completed = ed.get("completed_rows", "?")
                total = ed.get("total_rows", "?")

                # For running evals, fetch live status + partial score from gateway
                if estatus == "running":
                    full_eid = ed.get("evaluation_run_id", "")
                    try:
                        live = _api("GET", f"{base_url}/finetune/evaluations/{full_eid}")
                        estatus = live.get("status", estatus)
                        completed = live.get("completed_rows", completed)
                        total = live.get("total_rows", total)

                        # Compute partial score
                        summary = live.get("summary", {})
                        avg_score = summary.get("average_score") if summary else None
                        # Compute zero rate from row-level results
                        live_avg, live_count, live_zero_rate, live_perfect_rate = _compute_eval_partial_score(live)
                        ed["_zero_rate"] = live_zero_rate  # store for later use in recommendations
                        if avg_score is not None:
                            score_str = f"  avg_score={avg_score:.3f}"
                            if live_zero_rate is not None:
                                score_str += f"  zeros={live_zero_rate:.0%}"
                            if avg_score < 0.05:
                                score_str += "  ⚠ BROKEN — scoring ~0, cancel this eval!"
                            elif live_zero_rate is not None and live_zero_rate > 0.10:
                                score_str += f"  ⚠ BROKEN — {live_zero_rate:.0%} zeros, cancel this eval!"
                        else:
                            score_str = ""
                    except SystemExit:
                        score_str = ""
                else:
                    score_str = ""
                    metric = eval_metrics_by_run.get(ed.get("evaluation_run_id", ""))
                    if metric:
                        avg = metric.get("average_score")
                        std = metric.get("score_stddev")
                        scored = metric.get("scored_count")
                        if avg is not None:
                            score_str += f"  avg_score={float(avg):.3f}"
                        if std is not None:
                            score_str += f"  std={float(std):.3f}"
                        if scored is not None:
                            score_str += f"  scored={int(scored)}"

                cancel_hint = ""
                if estatus == "running":
                    cancel_hint = f"  → cancel: finetune.py cancel-eval --workflow-id {wf_id} --eval-id {ed.get('evaluation_run_id', '?')} --file {ef}"
                print(f"  {eid}...  {estatus} ({completed}/{total} rows){score_str}")
                if cancel_hint:
                    print(f"    {cancel_hint}")
                eval_jobs_shown.append(ed)
            except (json.JSONDecodeError, KeyError):
                pass
    else:
        print("  No eval jobs")

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
                        for c in _normalize_epoch_candidates(cands):
                            if c.get("score") is not None:
                                scores.append(float(c["score"]))
            if scores:
                import statistics
                n = len(scores)
                avg_s = sum(scores) / n
                std_s = statistics.stdev(scores) if n > 1 else 0
                dead_w = sum(1 for s in scores if s < 0.1) / n
                pass_r = sum(1 for s in scores if s >= 0.7) / n
                zero_frac = sum(1 for s in scores if s < 0.01) / n
                print(f"  Latest eval: {latest_eval_file.name} ({n} scores)")
                print(f"  avg={avg_s:.3f}, std={std_s:.3f}, zeros={zero_frac:.0%}, dead_weight={dead_w:.1%}, pass_rate={pass_r:.1%}")
                high_frac = sum(1 for s in scores if s > 0.9) / n
                binary_frac = sum(1 for s in scores if s <= 0.01 or s >= 0.99) / n
                # Score concentration: most common value (rounded to 0.01)
                from collections import Counter
                rounded = [round(s, 2) for s in scores]
                mode_val, mode_ct = Counter(rounded).most_common(1)[0]
                mode_frac = mode_ct / n
                grader_ok = (std_s > 0.10 and mode_frac < 0.70)
                signal_ok = avg_s > 0.05  # Only 0% is fatal (OpenAI RFT)
                zeros_ok = zero_frac < 0.10  # >10% zeros = grader broken (xFinder ICLR 2025)
                perfect_frac_inline = sum(1 for s in scores if s >= 0.99) / n
                if grader_ok and signal_ok and zeros_ok:
                    if perfect_frac_inline > 0.50:
                        print(f"  Verdict: PASS (with warning) — {perfect_frac_inline:.0%} of scores are 1.0 (grader may be too lenient, run difficulty-probe to check)")
                    else:
                        print(f"  Verdict: PASS — grader quality OK, ready for training")
                elif not zeros_ok:
                    print(f"  Verdict: FAIL — {zero_frac:.0%} of scores are 0.0 (grader broken — use grader-mcq.js template with LLM extraction fallback)")
                elif not signal_ok:
                    print(f"  Verdict: FAIL — avg near zero, no training signal at all")
                elif mode_frac >= 0.70:
                    print(f"  Verdict: FAIL — {mode_frac:.0%} of scores are {mode_val}, grader too coarse")
                else:
                    print(f"  Verdict: FAIL — fix grader before training (std/binary/leniency)")
        except Exception:
            print(f"  Could not analyze {latest_eval_file.name}")

    # ── Check for running evals with broken graders (scoring ~0 or high zero-rate) ──
    broken_running_evals = []
    for ed in eval_jobs_shown:
        if ed.get("status") == "running":
            summary = ed.get("summary", {})
            avg = summary.get("average_score") if summary else None
            completed_rows = ed.get("completed_rows", 0)
            zero_rate = ed.get("_zero_rate")  # set during eval jobs display
            if completed_rows >= 20:
                if avg is not None and avg < 0.05:
                    broken_running_evals.append(ed)
                elif zero_rate is not None and zero_rate > 0.10:
                    broken_running_evals.append(ed)

    # ── Recommended next step ──
    print("\n── Recommended Next Step ──")

    # Priority: cancel running evals that are scoring 0 (broken grader)
    if broken_running_evals:
        for ed in broken_running_evals:
            eid = ed.get("evaluation_run_id", "?")
            avg = (ed.get("summary") or {}).get("average_score", 0)
            zr = ed.get("_zero_rate")
            if zr is not None and zr > 0.30:
                print(f"  ⚠ CANCEL eval {eid[:12]}... — {zr:.0%} of scores are 0.0 (grader is broken)")
            else:
                print(f"  ⚠ CANCEL eval {eid[:12]}... — scoring {avg:.3f} (grader is broken)")
            print(f"    Run: finetune.py cancel-eval --workflow-id {wf_id} --eval-id {eid}")

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
    elif not step_done("data-quality-gate"):
        print("  → Resume from Step 5.5b: Run data quality gate")
    elif records_count == 0 or records_count == "?":
        print("  → Data was generated but may not be uploaded. Run verify.")
    else:
        active_training = [j for j in job_list if j.get("status") in ("running", "pending", "queued")]
        cancelled_jobs = [j for j in job_list if j.get("status") == "cancelled"]
        done_training = [j for j in job_list if j.get("status") in ("completed", "succeeded")]

        # Check if latest eval has high zero-rate (grader broken)
        latest_eval_zero_rate = None
        if latest_eval_file:
            try:
                ed = json.loads(latest_eval_file.read_text())
                _avg, _count, zr, _pr = _compute_eval_partial_score(
                    {"results": ed.get("results", [])}
                )
                latest_eval_zero_rate = zr
            except Exception:
                pass

        grader_broken = (latest_eval_zero_rate is not None and latest_eval_zero_rate > 0.10)

        if active_training and grader_broken:
            print(f"  ⚠ Training is running BUT the latest eval has {latest_eval_zero_rate:.0%} zero scores — grader is broken!")
            print(f"    Cancel the training job, fix the grader (use grader-mcq.js template), re-eval, then retrain.")
            for j in active_training:
                jid = j.get("id", "?")
                print(f"    Run: finetune.py cancel-training --workflow-id {wf_id} --job-id {jid}")
        elif active_training:
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
      - response_token_lengths: list of estimated token counts for eval
        model responses (from row.messages[role=assistant] or candidate
        rollout_content). Used to predict training truncation risk.
    """
    all_scores: list[float] = []
    per_prompt: list[dict] = []
    response_token_lengths: list[int] = []

    for r in results:
        prompt_scores: list[float] = []
        prompt_lengths: list[int] = []
        topic = None

        # Extract topic from row metadata
        row = r.get("row", {})
        if isinstance(row, dict):
            topic = row.get("topic")

            # Extract eval model response length from row messages.
            # The eval generates a response stored as the assistant message.
            # This is the eval model's output (e.g., gpt-4o-mini), which is
            # typically more concise than what a smaller training model would
            # produce — making it a lower bound for training token needs.
            for msg in row.get("messages", []):
                if msg.get("role") == "assistant":
                    content = msg.get("content", "")
                    if content:
                        response_token_lengths.append(max(1, len(content.strip()) // 4))
                    break

        epochs = r.get("epochs", {})
        if isinstance(epochs, dict):
            for _epoch_key, candidates in epochs.items():
                for c in _normalize_epoch_candidates(candidates):
                    if c.get("score") is None:
                        continue
                    score = float(c["score"])
                    prompt_scores.append(score)
                    all_scores.append(score)
                    # Try to get completion length from candidate
                    completion = c.get("completion", c.get("response", c.get("output", "")))
                    if completion and isinstance(completion, str):
                        prompt_lengths.append(len(completion))
                    # Also try rollout_content (finetune-evaluations endpoint)
                    rollout = c.get("rollout_content", c.get("rollout_output", ""))
                    if rollout and isinstance(rollout, str) and not completion:
                        prompt_lengths.append(len(rollout))
                        response_token_lengths.append(max(1, len(rollout.strip()) // 4))
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
        "response_token_lengths": response_token_lengths,
    }


def cmd_list_models(args: argparse.Namespace) -> None:
    """List rollout model aliases for a finetune job."""
    result = _api(
        "GET",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/jobs/{args.job_id}/models",
    )

    checkpoints = result.get("checkpoints", []) if isinstance(result, dict) else []
    latest_checkpoint = result.get("latest_checkpoint_model") if isinstance(result, dict) else None
    finetuned_model = result.get("finetuned_model") if isinstance(result, dict) else None

    print("Available rollout models:")
    if checkpoints:
        print("  Checkpoints:")
        for model in checkpoints:
            print(f"    - {model}")
    else:
        print("  Checkpoints: none found")

    if latest_checkpoint:
        print(f"  Latest checkpoint alias: {latest_checkpoint}")
    if finetuned_model:
        print(f"  Finetuned model: {finetuned_model}")

    print(json.dumps(result, indent=2))


def cmd_readiness_check(args: argparse.Namespace) -> None:
    """Check if eval results pass the pre-training readiness gate.

    Computes readiness criteria from eval results. Training should only
    start after ALL hard criteria pass. Returns structured JSON with
    per-criterion details, verdict, and fix suggestions.

    Hard checks (gate training — "is the grader working?"):
      1. sample_count       — minimum dataset size (>= 50)
      2. score_std          — grader differentiation (> 0.10)
      3. avg_score          — nonzero signal (> 0.05)
      4. zero_score_frac    — grader not broken (< 30% zeros)
      + score_concentration — dynamic: hard if > 70%, soft if 50-70%

    Soft checks (warnings, don't gate):
      4. high_score_frac    — grader not too lenient
      5. binary_frac        — grader uses full range
      6. dead_weight_frac   — no wasted compute
      7. pass_rate          — minimum viable quality
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
    # Research-validated thresholds (2026-03-31 review). See research-readiness-gate-thresholds-2026-03-31.md.
    defaults = {
        "min_sample_count": 50,         # WELL-FOUNDED: OpenAI RFT uses same floor. DeepSeek/DAPO use 5K+ but 50 is "don't crash" minimum.
        "min_score_std": 0.10,          # HEURISTIC: correct direction (zero-variance → zero gradient per DAPO §2.2). Exact value (0.05-0.10) is arbitrary.
        "max_high_score_frac": 0.50,    # HEURISTIC: grader leniency. Overlaps with perfect_score_frac — kept for backward compat.
        # binary_frac check REMOVED — DeepSeek-R1, DAPO, and all major GRPO successes use 100% binary rewards.
        # Warning against binary contradicts the entire literature. OpenAI RFT recommends binary graders. (2026-03-31 research review)
        "min_avg_score": 0.05,          # WELL-FOUNDED: OpenAI "0% = can't bootstrap". Math: 5% success → 34% non-degenerate groups at K=8.
        "max_mode_frac": 0.70,          # RESEARCH-CORRECTED (was 0.50): at 0.70, P(all K=8 same) = 5.8% — almost all groups have variance. Hard fail at 0.85.
        "max_zero_score_frac": 0.10,    # HEURISTIC: Imperfect Verifiers (arXiv:2510.00915) shows up to ~20% FN tolerable. 10% is conservative but defensible for catching parsing bugs.
        "max_perfect_score_frac": 0.50, # WELL-FOUNDED as soft: eval K=1 (gpt-4o-mini) ≠ training K=8 (Qwen-4B). High eval scores don't predict training zero-variance.
        "max_dead_weight_frac": 0.75,   # RESEARCH-CORRECTED (was 0.50): "No Prompt Left Behind" (ICLR 2026): 30-99% zero-var is normal. Eval dead-weight ≠ training dead-weight.
        "min_pass_rate": 0.05,          # RESEARCH-CORRECTED (was 0.20): DeepSeek-R1 started at 15.6%. "Hard Examples" (arXiv:2508.14094): hard prompts yield 47% gains.
        "pass_threshold": 0.70,         # Score threshold for "passing" a record
        "min_prompt_learnability": 0.30, # HEURISTIC: DAPO dynamic sampling concept. Questionable at K=1 eval — single sample gives noisy learnability.
        "max_score_length_corr": 0.30,  # WELL-FOUNDED concept: Dr. GRPO (arXiv:2503.20783) validates length bias is real and structural. Exact threshold is heuristic.
        "max_topic_dominance": 0.40,    # HEURISTIC: general ML practice, not GRPO-specific. Fine as soft warning.
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
    perfect_frac = sum(1 for s in scores if s >= 0.99) / n
    binary_frac = sum(1 for s in scores if s <= 0.01 or s >= 0.99) / n
    zero_score_frac = sum(1 for s in scores if s < 0.01) / n
    dead_weight_frac = sum(1 for s in scores if s < 0.1) / n
    pass_rate = sum(1 for s in scores if s >= thresholds["pass_threshold"]) / n

    # Score concentration: fraction of scores at the most common value (rounded to 0.01)
    # GRPO computes advantage = (reward - mean) / std within each K-group.
    # If most scores are the same value, std→0 within groups → zero gradient.
    # DAPO (arXiv:2503.14476) filters zero-variance groups for exactly this reason.
    from collections import Counter
    rounded_scores = [round(s, 2) for s in scores]
    score_counter = Counter(rounded_scores)
    if n > 0:
        mode_value, mode_count = score_counter.most_common(1)[0]
    else:
        mode_value, mode_count = 0, 0
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
        "zero_score_frac": {
            "value": round(zero_score_frac, 4),
            "threshold": f"< {thresholds['max_zero_score_frac']}",
            "pass": zero_score_frac < thresholds["max_zero_score_frac"],
            "fix": f"{zero_score_frac:.0%} of scores are exactly 0.0 — this usually means the grader can't parse the model's response format (not that answers are wrong). "
                   f"Run diagnose-grader to check the zero-score reasons. Fix the grader to use LLM extraction fallback (see grader-mcq.js template). "
                   f"[xFinder ICLR 2025 (arXiv:2405.11874): regex extraction is only 74% accurate on diverse LLM outputs]",
            "hard": True,
        },
        "perfect_score_frac": {
            "value": round(perfect_frac, 4),
            "threshold": f"< {thresholds['max_perfect_score_frac']}",
            "pass": perfect_frac < thresholds["max_perfect_score_frac"],
            "fix": f"{perfect_frac:.0%} of eval scores are at the maximum (≥0.99) — grader may be too lenient. "
                   f"Note: eval uses a strong model (gpt-4o-mini) at K=1, while training uses a weaker base model at K=8, "
                   f"so training scores will be lower and more varied. However, high eval scores suggest the grader "
                   f"doesn't discriminate quality within correct answers. "
                   f"Consider: add more criteria (distractor analysis, citation accuracy, reasoning depth) "
                   f"so that 'correct answer' gets 0.5-0.7 and only 'correct + excellent reasoning' gets 0.9-1.0. "
                   f"Run difficulty-probe for a more precise K=8 prediction before deciding. "
                   f"[DAPO arXiv:2503.14476: zero-variance groups produce zero gradient]",
            # Soft check — eval K=1 with a strong model doesn't directly predict training K=8 variance.
            # The difficulty_probe and score_concentration checks are better signals for this.
            # score_concentration (hard at >70%) already catches the worst cases.
            "hard": False,
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
        # binary_frac check REMOVED (2026-03-31 research review):
        # DeepSeek-R1, DAPO, and all major GRPO successes use 100% binary rewards.
        # Warning against binary contradicts the literature. OpenAI RFT recommends binary graders.
        "score_concentration": {
            "value": round(mode_frac, 4),
            "threshold": f"< {thresholds['max_mode_frac']}",
            "pass": mode_frac < thresholds["max_mode_frac"],
            "fix": f"{mode_frac:.0%} of scores are exactly {mode_value} — within-group variance will be small → weak gradients. "
                   f"Redesign grader with multi-point rubric (0-7 scale). "
                   f"[DAPO arXiv:2503.14476 filters uniform groups; RGR-GRPO arXiv:2511.12344: rubric >> binary]",
            # Hard fail at >85%: at K=8, P(all same) = 0.85^8 = 27% — significant fraction of degenerate groups.
            # Soft warn at 70-85%: some signal loss but training still works (0.70^8 = 5.8% degenerate).
            # Research-corrected 2026-03-31: previous hard threshold of 0.70 was too tight.
            "hard": mode_frac > 0.85,
        },
    }

    # ── Soft checks: quality signals (warnings, don't gate training) ──
    # Low base model scores are EXPECTED and even desirable — "Hard Examples Are All You Need"
    # (arXiv:2508.14094) shows hard prompts yield 30-40% gains vs 3-15% for easy prompts on GSM8K.
    checks["dead_weight_frac"] = {
        "value": round(dead_weight_frac, 4),
        "threshold": f"< {thresholds['max_dead_weight_frac']}",
        "pass": dead_weight_frac < thresholds["max_dead_weight_frac"],
        "fix": "Many eval-time dead-weight records (score<0.1). Note: eval dead-weight ≠ training dead-weight — "
               "hard prompts may become learnable as model improves. 30-99% zero-var per batch is normal during GRPO. "
               "[\"No Prompt Left Behind\" ICLR 2026, arXiv:2509.21880]",
        "hard": False,
    }
    checks["pass_rate"] = {
        "value": round(pass_rate, 4),
        "threshold": f"> {thresholds['min_pass_rate']}",
        "pass": pass_rate > thresholds["min_pass_rate"],
        "fix": "Very low pass rate — but hard prompts are the most valuable for GRPO (47% gains vs 3-15% for easy). "
               "DeepSeek-R1 started at 15.6%. With K=8, pass@8 >> pass@1. "
               "[arXiv:2508.14094; arXiv:2501.12948]",
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

    # ── Truncation risk: predict if max_output_tokens is too low for training ──
    # The eval model (e.g., gpt-4o-mini) is typically more concise than the
    # base training model (e.g., Qwen3.5-4B doing GRPO exploration). Eval
    # response lengths are therefore a LOWER BOUND for training token needs.
    # We apply a 1.5x multiplier to account for the base model being less
    # concise and GRPO encouraging longer chain-of-thought exploration.
    response_lengths = eval_data.get("response_token_lengths", [])
    max_output_tokens = getattr(args, "max_output_tokens", 512)

    # ── Proactive length-drift check ──
    # Compares (a) GT P95 from training.jsonl, (b) eval response P95, and
    # (c) user's stated objective_target_tokens. Catches grader-rewards-verbosity
    # and spec-mismatch BEFORE training. Reactive clipping detection in
    # poll-training only fires after training has burned compute; this gate
    # catches the same problems pre-train.
    #
    # Two failure patterns flagged:
    #   - Grader drift early warning: eval_p95 > gt_p95 × 2 → grader is already
    #     rewarding verbosity at K=1 eval. Training (K=8 GRPO exploration) will
    #     amplify this and trigger completion clipping later. Fix grader now.
    #   - Spec mismatch: gt_p95 > objective_target × 2 → training data violates
    #     the user's stated output length. Training would produce a model that
    #     ignores the spec. Regenerate GT, do not train.
    training_file_path = getattr(args, "training_file", None)
    objective_target = getattr(args, "objective_target_tokens", None)
    if training_file_path:
        try:
            tf = Path(training_file_path)
            if tf.exists():
                gt_token_lens: list[int] = []
                with tf.open() as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            rec = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        gt = rec.get("ground_truth", "")
                        if gt and gt.strip():
                            gt_token_lens.append(max(1, len(gt.strip()) // 4))

                if gt_token_lens:
                    sorted_gt = sorted(gt_token_lens)
                    gt_p95_tok = sorted_gt[min(len(sorted_gt) - 1, int(len(sorted_gt) * 0.95))]

                    # Check 1: spec mismatch (only if objective target provided)
                    if objective_target and gt_p95_tok > objective_target * 2.0:
                        checks["spec_mismatch"] = {
                            "value": gt_p95_tok,
                            "threshold": f"<= {int(objective_target * 2.0)} (objective_target × 2)",
                            "pass": False,
                            "fix": (
                                f"Training data violates user spec: GT P95={gt_p95_tok} tok, "
                                f"objective target={objective_target} tok ({gt_p95_tok/objective_target:.1f}× over). "
                                f"Training will produce a model that ignores the user's stated output length. "
                                f"FIX: Regenerate ground truth to target ~{objective_target} tokens, OR update "
                                f"the objective. Do NOT train until resolved. "
                                f"Ref: training-metrics-guide.md §100% Completion Clipping (Diagnosis C)."
                            ),
                            "hard": True,
                            "detail": f"gt_p95={gt_p95_tok}, objective_target={objective_target}",
                        }

                    # Check 2: grader drift early warning.
                    #
                    # Two sub-signals (either fires the check):
                    #   (a) drift_ratio = eval_p95 / gt_p95 > 1.5 — model is
                    #       already verbose at K=1 greedy eval. Empirical
                    #       observation: K=1 → K=8 amplification is ~3-4× for
                    #       length drift, so 1.5× at K=1 → ~5× during training.
                    #   (b) eval_p95 > objective_target × 1.0 — eval responses
                    #       already exceed the user's stated output length even
                    #       at greedy decoding. GRPO will only make this worse.
                    #
                    # Both signals indicate the grader is not penalizing length
                    # and the model has no incentive to be concise. Fix the
                    # grader BEFORE training, not after clipping wastes compute.
                    if response_lengths and len(response_lengths) >= 10:
                        eval_sorted = sorted(response_lengths)
                        eval_p95_tok = eval_sorted[min(len(eval_sorted) - 1, int(len(eval_sorted) * 0.95))]
                        drift_ratio = eval_p95_tok / max(gt_p95_tok, 1)

                        drift_signal = drift_ratio > 1.5
                        overshoot_signal = (
                            objective_target is not None
                            and eval_p95_tok > objective_target
                        )

                        if drift_signal or overshoot_signal:
                            reasons = []
                            if drift_signal:
                                reasons.append(
                                    f"eval P95 ({eval_p95_tok} tok) is {drift_ratio:.1f}× the GT P95 "
                                    f"({gt_p95_tok} tok) — drift threshold 1.5×"
                                )
                            if overshoot_signal:
                                reasons.append(
                                    f"eval P95 ({eval_p95_tok} tok) already exceeds the user's "
                                    f"objective target ({objective_target} tok) at K=1 greedy decoding"
                                )

                            checks["length_drift_risk"] = {
                                "value": round(drift_ratio, 2),
                                "threshold": "drift_ratio <= 1.5 AND eval_p95 <= objective_target",
                                "pass": False,
                                "fix": (
                                    f"Grader is rewarding verbosity. Signals: {'; '.join(reasons)}. "
                                    f"At K=1 greedy eval the model is already drifting; K=8 GRPO exploration "
                                    f"will amplify this 3-4× and trigger completion clipping during training. "
                                    f"FIX: Add a DRPO-safe conciseness penalty to the grader BEFORE training "
                                    f"(see grader-writing.md §DRPO Anti-Pattern — copy-pasteable code template). "
                                    f"Do NOT raise max_output_tokens. Re-eval after grader fix to confirm "
                                    f"drift_ratio <= 1.5 AND eval_p95 <= objective_target. "
                                    f"Ref: training-metrics-guide.md §100% Completion Clipping (Diagnosis B)."
                                ),
                                "hard": True,
                                "detail": (
                                    f"eval_p95={eval_p95_tok}, gt_p95={gt_p95_tok}, "
                                    f"drift_ratio={drift_ratio:.2f}, "
                                    f"objective_target={objective_target}"
                                ),
                            }
        except (OSError, ValueError) as e:
            print(f"Warning: length-drift check skipped ({e})", file=sys.stderr)

    if response_lengths and len(response_lengths) >= 10:
        sorted_lengths = sorted(response_lengths)
        eval_p50 = sorted_lengths[len(sorted_lengths) // 2]
        eval_p95 = sorted_lengths[min(len(sorted_lengths) - 1, int(len(sorted_lengths) * 0.95))]
        eval_max = sorted_lengths[-1]

        # 1.5x multiplier: base models are less concise than gpt-4o-mini.
        # This is a conservative empirical estimate — actual ratio varies
        # by task and model, but 1.5x avoids false negatives while not
        # over-alarming on short-response tasks.
        predicted_training_p95 = int(eval_p95 * 1.5)
        recommended_min = int(predicted_training_p95 * 1.3)  # 30% headroom

        truncation_risk = predicted_training_p95 > max_output_tokens
        checks["truncation_risk"] = {
            "value": predicted_training_p95,
            "threshold": f"< {max_output_tokens} (planned max_output_tokens)",
            "pass": not truncation_risk,
            "fix": (
                f"Eval model responses: P50={eval_p50}, P95={eval_p95}, max={eval_max} tokens. "
                f"Training model (weaker, less concise) predicted P95 ≈ {predicted_training_p95} tokens "
                f"(eval P95 × 1.5). With max_output_tokens={max_output_tokens}, completions will be "
                f"truncated → grader scores garbage → zero useful gradient. "
                f"Set max_output_tokens >= {recommended_min}."
            ),
            "hard": truncation_risk,
            "detail": (
                f"eval_p50={eval_p50}, eval_p95={eval_p95}, eval_max={eval_max}, "
                f"predicted_training_p95={predicted_training_p95}, "
                f"max_output_tokens={max_output_tokens}, "
                f"recommended_min={recommended_min}"
            ),
        }

    # ── Compute verdict ──
    hard_failed = [k for k, v in checks.items() if v.get("hard") and not v["pass"]]
    soft_failed = [k for k, v in checks.items() if not v.get("hard") and not v["pass"]]
    all_failed = hard_failed + soft_failed

    # WARN if only 1 hard check fails marginally (within 80% of threshold).
    # Map each hard check to its threshold key for numeric comparison.
    _threshold_keys = {
        "sample_count": ("min", "min_sample_count"),
        "score_std": ("min", "min_score_std"),
        "avg_score": ("min", "min_avg_score"),
        "score_concentration": ("max", "max_mode_frac"),
    }

    def _is_marginal(check_name: str) -> bool:
        mapping = _threshold_keys.get(check_name)
        if not mapping:
            return False
        direction, key = mapping
        value = checks[check_name]["value"]
        threshold_val = thresholds.get(key, 0)
        if direction == "min":
            # Value must be within 80% of the min threshold (e.g., 0.08 vs 0.10)
            return value > threshold_val * 0.8
        else:
            # Value must be within 125% of the max threshold (e.g., 0.55 vs 0.50)
            return value < threshold_val * 1.25

    marginal_hard = len(hard_failed) == 1 and all(
        _is_marginal(k) for k in hard_failed
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

    # ── Build topic lookup for per-topic analysis ──
    # Eval results from the cloud don't include the "topic" field in row data.
    # Build a mapping from record ID → topic using:
    #   1. training.jsonl (if found near the eval file)
    #   2. Record ID prefix as fallback (e.g., "hidden-fish-001-2293" → "hidden-fish")
    topic_lookup: dict[str, str] = {}
    training_file = eval_file.parent.parent / "training.jsonl"
    if training_file.exists():
        try:
            with open(training_file) as tf:
                for line in tf:
                    line = line.strip()
                    if line:
                        rec = json.loads(line)
                        rec_id = rec.get("id", "")
                        rec_topic = rec.get("topic", "")
                        if rec_id and rec_topic:
                            topic_lookup[rec_id] = rec_topic
            if topic_lookup:
                print(f"  (Loaded {len(topic_lookup)} record→topic mappings from training.jsonl)", file=sys.stderr)
        except (json.JSONDecodeError, OSError):
            pass

    def _get_topic(row: dict) -> str:
        """Get topic from row data, lookup table, or record ID prefix."""
        topic = row.get("topic")
        if topic:
            return topic
        rid = row.get("id", "")
        if rid in topic_lookup:
            return topic_lookup[rid]
        # Fallback: extract topic from ID prefix (e.g., "hidden-fish-001-2293" → "hidden-fish")
        # Pattern: topic-name-NNN-NNNN where last two parts are numeric
        parts = rid.rsplit("-", 2)
        if len(parts) >= 3 and parts[-1].isdigit() and parts[-2].isdigit():
            return parts[0]
        return "unknown"

    # Extract per-record scores — handle both flat (score field) and
    # nested (epochs dict) formats from the eval results.
    # Built first (before printing) so signal density can be computed for summary.
    scored_records: list[tuple[int, dict, float, str]] = []
    for i, r in enumerate(results):
        row = r.get("row", {})
        rid = row.get("id", f"row-{i}")
        topic = _get_topic(row)

        # Try flat score field first
        score = _coerce_score(r.get("score"))
        reason = r.get("reason", "")

        # Fall back to epochs structure (finetune eval format)
        if score is None and "epochs" in r:
            epochs = r.get("epochs", {})
            # Get the latest epoch's scores
            for ek in sorted(epochs.keys(), key=_epoch_sort_key, reverse=True):
                best = _best_epoch_candidate(epochs.get(ek))
                if best:
                    score = best.get("score")
                    reason = best.get("reason", "")
                    break

        if score is not None:
            scored_records.append((i, row, score, reason))

    bottom_records = sorted(scored_records, key=lambda x: x[2])
    top_records = sorted(scored_records, key=lambda x: x[2], reverse=True)

    # ── SUMMARY (printed first — must not be truncated by output buffer) ──
    # Compute display metrics from scored_records
    _all_scores = [s for _, _, s, _ in scored_records]
    _avg = sum(_all_scores) / max(len(_all_scores), 1)
    _std = (sum((s - _avg) ** 2 for s in _all_scores) / max(len(_all_scores), 1)) ** 0.5
    zero_frac = sum(1 for s in _all_scores if s < 0.01) / max(len(_all_scores), 1)
    perfect_frac = sum(1 for s in _all_scores if s >= 0.99) / max(len(_all_scores), 1)
    _trivial_frac = sum(1 for s in _all_scores if s > 0.90) / max(len(_all_scores), 1)
    _learnable_frac = sum(1 for s in _all_scores if 0.20 <= s <= 0.65) / max(len(_all_scores), 1)
    # Dead band = wrong-tier floor. Modern graders use 0.05 as nonzero floor
    # (not 0.0) to avoid frac_reward_zero_std collapse, so strict < 0.05 misses
    # all dead records. Use <= 0.10 to capture the wrong-tier top.
    _dead_frac = sum(1 for s in _all_scores if s <= 0.10) / max(len(_all_scores), 1)

    print(f"\n── READINESS SUMMARY (read this first) ──", file=sys.stderr)
    print(f"  Verdict: {verdict} | avg={_avg:.3f} | std={_std:.3f} | zeros={zero_frac:.0%} | perfect={perfect_frac:.0%}", file=sys.stderr)
    print(f"  Signal: trivial={_trivial_frac:.0%} | learnable={_learnable_frac:.0%} | dead={_dead_frac:.0%}", file=sys.stderr)
    if hard_failed:
        print(f"  ✗ HARD FAIL: {', '.join(hard_failed)} — fix before training", file=sys.stderr)
    if avg < 0.05:
        print(f"  ✗ CAPABILITY FAIL: model has no latent capability. Try larger model or SFT warmup.", file=sys.stderr)
    elif avg > 0.75:
        print(f"  ⚠ HEADROOM FAIL: avg > 0.75. Eval a smaller model.", file=sys.stderr)
    elif _trivial_frac > 0.40 and _learnable_frac < 0.35:
        print(f"  ⚠ SIGNAL DENSITY LOW: {_trivial_frac:.0%} trivial, {_learnable_frac:.0%} learnable.", file=sys.stderr)
        print(f"    → Check grader → generate harder records → eval smaller model (in priority order)", file=sys.stderr)
    elif _dead_frac > 0.20:
        # Dead-band dominance: many records score near 0 at K=1. At K=16 these
        # become zero-variance groups (all rollouts wrong) → zero gradient →
        # wasted GPU time. Strongest remediation: rerun generation with tighter
        # difficulty targeting, OR harden the dead records against the base
        # model's current capability range.
        # Reference: arXiv:2504.03380 (gradient vanishes at p=0)
        print(f"  ⚠ DEAD BAND DOMINANT: {_dead_frac:.0%} of records score ≤ 0.10 at K=1.", file=sys.stderr)
        print(f"    At K=16 most of these will become zero-variance groups (all rollouts wrong) →", file=sys.stderr)
        print(f"    no gradient → wasted training. Before training:", file=sys.stderr)
        print(f"      1. Run: finetune.py harden-records --eval-file <eval> --training-file <jsonl> --min-score 0.10", file=sys.stderr)
        print(f"         (rewrites dead records with hints that bring them into the learnable band)", file=sys.stderr)
        print(f"      2. If >30% remain dead after hardening, the task exceeds base model capability —", file=sys.stderr)
        print(f"         use a larger base model or add a SFT warmup stage.", file=sys.stderr)
    else:
        print(f"  ✓ Proceed to training.", file=sys.stderr)

    # ── Per-Record Inspection (detail) ──
    print(f"\n── Per-Record Inspection (detail) ──", file=sys.stderr)
    print("  Bottom 5 (lowest scores — check for grader bugs):", file=sys.stderr)
    for idx, row, score, reason in bottom_records[:5]:
        topic = _get_topic(row)
        rid = row.get("id", f"row-{idx}")
        print(f"    [{rid}] topic={topic} score={score:.2f} reason: {reason[:120]}", file=sys.stderr)

    print("  Top 5 (highest scores — check for grader exploits):", file=sys.stderr)
    for idx, row, score, reason in top_records[:5]:
        topic = _get_topic(row)
        rid = row.get("id", f"row-{idx}")
        print(f"    [{rid}] topic={topic} score={score:.2f} reason: {reason[:120]}", file=sys.stderr)

    # ── Per-topic analysis (auto — catches dead zones BEFORE training) ──
    # Groups scores by topic and flags topics where the model has no capability
    # (avg < 0.05) or very weak capability (avg < 0.15). These topics will
    # produce zero-variance groups in GRPO → zero gradient → no learning.
    # Catching this here prevents wasting GPU time training on impossible topics.
    # Research: arXiv:2504.03380 (gradient vanishes at p=0), arXiv:2602.14868.
    topic_scores: dict[str, list[float]] = {}
    for idx, row, score, reason in scored_records:
        topic = _get_topic(row)
        topic_scores.setdefault(topic, []).append(score)

    if topic_scores:
        print(f"\n── Per-Topic Analysis (auto) ──", file=sys.stderr)
        dead_topics = []
        weak_topics = []
        strong_topics = []
        for topic in sorted(topic_scores.keys()):
            scores_list = topic_scores[topic]
            t_avg = sum(scores_list) / len(scores_list)
            t_perfect = sum(1 for s in scores_list if s >= 0.99) / len(scores_list)
            if t_avg < 0.05:
                dead_topics.append((topic, t_avg, len(scores_list)))
                print(f"  ✗ {topic:35s} avg={t_avg:.3f} n={len(scores_list):3d}  DEAD ZONE — model has no capability", file=sys.stderr)
            elif t_avg < 0.15:
                weak_topics.append((topic, t_avg, len(scores_list)))
                print(f"  ⚠ {topic:35s} avg={t_avg:.3f} n={len(scores_list):3d}  WEAK — marginal capability", file=sys.stderr)
            elif t_avg > 0.85:
                strong_topics.append((topic, t_avg, len(scores_list)))
                print(f"  ● {topic:35s} avg={t_avg:.3f} n={len(scores_list):3d}  TRIVIAL — already solved", file=sys.stderr)
            else:
                print(f"  ✓ {topic:35s} avg={t_avg:.3f} n={len(scores_list):3d}  perfect={t_perfect:.0%}", file=sys.stderr)

        if dead_topics:
            print(f"\n  ⚠ {len(dead_topics)} DEAD ZONE topic(s) detected:", file=sys.stderr)
            print(f"  GRPO CANNOT fix these — model lacks latent capability on these topics.", file=sys.stderr)
            print(f"  Options:", file=sys.stderr)
            print(f"    1. Add domain facts to the system prompt (converts knowledge→lookup task)", file=sys.stderr)
            print(f"    2. Run targeted SFT on dead-zone records before GRPO (if pipeline supports SFT)", file=sys.stderr)
            print(f"    3. Use a larger model that has the required knowledge", file=sys.stderr)
            print(f"    4. Remove dead topics from training (they waste compute with zero gradient)", file=sys.stderr)
        if weak_topics:
            print(f"\n  ⚠ {len(weak_topics)} WEAK topic(s): training may work but expect slow convergence.", file=sys.stderr)

    # ── Source-part coverage audit (auto — agent doesn't need to remember) ──
    # Check if any source_parts are only covered by high-scoring records.
    # Reuse scored_records from per-record inspection above.
    part_scores: dict[str, list[float]] = {}
    for idx, row, score, reason in scored_records:
        # source_parts may be in the row data or input
        source_parts = row.get("source_parts", [])
        if isinstance(row.get("input"), dict):
            source_parts = source_parts or row["input"].get("source_parts", [])
        for sp in source_parts:
            part_scores.setdefault(sp, []).append(score)

    if part_scores:
        easy_only = [
            (sp, len(sc), sum(sc) / len(sc))
            for sp, sc in part_scores.items()
            if all(s > 0.9 for s in sc)
        ]
        print(f"\n── Source-Part Coverage Audit (auto) ──", file=sys.stderr)
        print(f"  Total source parts referenced: {len(part_scores)}", file=sys.stderr)
        print(f"  Parts with ONLY easy records (all scores >0.9): {len(easy_only)}", file=sys.stderr)
        if easy_only:
            print(f"  ⚠ COVERAGE GAP — these parts may not be learned by GRPO:", file=sys.stderr)
            for sp, n, avg_s in sorted(easy_only)[:10]:
                print(f"    {sp}: {n} records, avg={avg_s:.2f}", file=sys.stderr)
            print(f"  Action: generate harder records for these parts (see SKILL.md Step 7d coverage audit)", file=sys.stderr)
        else:
            print(f"  ✓ All source parts have at least one hard record — no coverage gaps.", file=sys.stderr)

    # ── Headroom + Signal Density check (auto) ──
    # Two dimensions matter for GRPO:
    #   1. Headroom (avg score): is the model improvable? (arXiv:2504.03380)
    #   2. Signal density (learnable fraction): how many records produce gradient?
    #
    # A bimodal distribution (e.g., 49% trivial at 0.96 + 51% hard at 0.20)
    # can have avg=0.58 (looks optimal) but only 51% of records produce gradient.
    # The avg alone is misleading — we need to check the distribution shape.
    #
    # Trivial fraction: records scoring > 0.90 (K=8 will likely all-pass → zero variance)
    # Reuse signal density values computed in the summary section above
    trivial_frac = _trivial_frac
    learnable_frac = _learnable_frac
    dead_frac = _dead_frac

    print(f"\n── Headroom + Signal Density Check (detail) ──", file=sys.stderr)
    print(f"  Avg score: {avg:.3f} | Trivial (>0.90): {trivial_frac:.0%} | Learnable (0.20-0.65): {learnable_frac:.0%} | Dead (<0.05): {dead_frac:.0%}", file=sys.stderr)

    # Determine recommendation based on BOTH avg and distribution
    recommend_smaller_model = False

    if avg < 0.05:
        print(f"  ✗ CAPABILITY GATE FAIL: avg={avg:.3f} (<0.05)", file=sys.stderr)
        print(f"  Model has no latent capability on this task — GRPO cannot create", file=sys.stderr)
        print(f"  ability from scratch (arXiv:2504.03380: gradient vanishes at p=0).", file=sys.stderr)
        print(f"  DO NOT proceed to training with this model.", file=sys.stderr)
        print(f"  → Try a larger model or instruction-tuned variant.", file=sys.stderr)
        print(f"  → If no model scores >0.05: task may need SFT warmup first", file=sys.stderr)
        print(f"    (DeepSeek arXiv:2501.12948: SFT cold-start before GRPO).", file=sys.stderr)
    elif avg > 0.80:
        print(f"  ⚠ HEADROOM GATE FAIL: avg={avg:.3f} (>0.80)", file=sys.stderr)
        print(f"  GRPO will produce near-zero improvement (arXiv:2508.14094: 3.7% learnable steps).", file=sys.stderr)
        print(f"  DO NOT proceed to training with this model.", file=sys.stderr)
        recommend_smaller_model = True
    elif avg > 0.75:
        print(f"  ⚠ HEADROOM WARNING: avg={avg:.3f} (0.75-0.80 range)", file=sys.stderr)
        print(f"  GRPO efficiency reduced.", file=sys.stderr)
        recommend_smaller_model = True
    elif trivial_frac > 0.40 and learnable_frac < 0.35:
        # Bimodal distribution: avg looks OK but too many trivial records.
        # arXiv:2508.14094: easy prompts produce only 3.7% learnable steps.
        # arXiv:2504.03380: 0.30-0.70 optimal range is per-prompt, not avg.
        print(f"  ⚠ SIGNAL DENSITY WARNING: avg={avg:.3f} looks optimal but {trivial_frac:.0%} of", file=sys.stderr)
        print(f"  records are trivial (>0.90) — only {learnable_frac:.0%} are in the learnable zone (0.20-0.65).", file=sys.stderr)
        print(f"  Bimodal distribution: half trivial + half hard ≠ uniformly optimal.", file=sys.stderr)
        recommend_smaller_model = True
    elif 0.30 <= avg <= 0.70:
        print(f"  ✓ Headroom OPTIMAL: avg={avg:.3f} (0.30-0.70 sweet spot).", file=sys.stderr)
        print(f"  Maximum GRPO gradient signal (arXiv:2504.03380). Proceed to training.", file=sys.stderr)
    elif avg < 0.15:
        print(f"  ✓ Headroom OK: avg={avg:.3f} (<0.75). Trainable but weak.", file=sys.stderr)
        print(f"  Model can learn but expect slow convergence. Check per-prompt histogram —", file=sys.stderr)
        print(f"  if many prompts score 0.0, only a few are driving learning.", file=sys.stderr)
    else:
        print(f"  ✓ Headroom OK: avg={avg:.3f} (<0.75). Proceed to training.", file=sys.stderr)

    if recommend_smaller_model:
        print(f"  Actions (in priority order):", file=sys.stderr)
        print(f"  → 1. scale_rewards=False is already set — trivial gradients are naturally", file=sys.stderr)
        print(f"    down-weighted (Dr. GRPO arXiv:2503.20783). This is necessary but not sufficient.", file=sys.stderr)
        print(f"  → 2. Check grader leniency: run test-grader to verify wrong answers", file=sys.stderr)
        print(f"    score < 0.40. If they don't, the grader is too lenient — fix it first.", file=sys.stderr)
        print(f"    (arXiv:2510.00915: LLM judges have 35-66% false positive rates)", file=sys.stderr)
        print(f"  → 3. Generate harder variants of trivial records:", file=sys.stderr)
        print(f"    finetune.py harden-records --eval-file <eval> --training-file training.jsonl", file=sys.stderr)
        print(f"    Adds harder variants alongside originals (originals kept as anchors).", file=sys.stderr)
        print(f"    Then re-upload + re-eval to verify trivial% decreased.", file=sys.stderr)
        print(f"    (arXiv:2505.17063: +29.2% from generate-eval-rewrite approach).", file=sys.stderr)
        print(f"  → 4. Eval a smaller model (e.g., Qwen3.5-0.8B) — fewer trivials,", file=sys.stderr)
        print(f"    but risk: smaller model may lack domain knowledge. Check scores >0.05.", file=sys.stderr)
        print(f"  → 5. Last resort: filter trivials (filter-records --min-score 0.75)", file=sys.stderr)
        print(f"    — removes records the model already aces. Only if options 2-4 don't help.", file=sys.stderr)

    # ── Mandatory next steps prompt ──
    print(f"\n── NEXT STEPS (mandatory) ──", file=sys.stderr)
    if avg < 0.05:
        print(f"  1. Log this eval: log-step --action capability_fail ...", file=sys.stderr)
        print(f"  2. Try a larger/instruction-tuned model, or SFT warmup first", file=sys.stderr)
        print(f"  3. Do NOT proceed to GRPO training with this model", file=sys.stderr)
    elif verdict == "FAIL":
        print(f"  1. Fix the failed checks listed above", file=sys.stderr)
        print(f"  2. Re-run eval", file=sys.stderr)
        print(f"  3. Re-run readiness-check", file=sys.stderr)
    elif recommend_smaller_model:
        print(f"  1. Log this eval: log-step --action signal_density_warning ...", file=sys.stderr)
        print(f"  2. Follow the priority actions above (check grader → generate harder → eval smaller)", file=sys.stderr)
        print(f"  3. If generating harder records: generate_records.py --append for weak topics", file=sys.stderr)
        print(f"  4. If switching model: create-eval --model Qwen3.5-0.8B → compare learnable_frac", file=sys.stderr)
    else:
        print(f"  1. Log this eval: log-step + log-iteration", file=sys.stderr)
        print(f"  2. Run difficulty-probe on this eval", file=sys.stderr)
        print(f"  3. Proceed to create-training", file=sys.stderr)

    print(json.dumps(result, indent=2))

    # Auto-journal: readiness gate result
    failed_names = ", ".join(hard_failed) if hard_failed else "none"
    warned_names = ", ".join(soft_failed) if soft_failed else "none"
    # Build per-topic summary for journal
    per_topic_journal: dict[str, dict] = {}
    for topic_name, scores_list in topic_scores.items():
        t_avg = sum(scores_list) / len(scores_list) if scores_list else 0
        per_topic_journal[topic_name] = {
            "avg": round(t_avg, 3),
            "count": len(scores_list),
            "zone": "dead" if t_avg < 0.05 else ("weak" if t_avg < 0.15 else ("trivial" if t_avg > 0.85 else "learnable")),
        }

    _auto_journal(
        project_dir=eval_file.parent.parent,
        step="step_7c_readiness",
        action="readiness_gate",
        status=verdict.lower(),
        summary=f"Readiness gate: {verdict}. avg={avg:.3f}, std={std:.3f}, zeros={zero_frac:.0%}, perfect={perfect_frac:.0%}. "
                f"Signal: trivial={_trivial_frac:.0%}, learnable={_learnable_frac:.0%}, dead={_dead_frac:.0%}. "
                f"Hard failed: {failed_names}. Soft warned: {warned_names}.",
        results={
            "verdict": verdict,
            "avg": round(avg, 4),
            "std": round(std, 4),
            "zero_frac": round(zero_frac, 4),
            "perfect_frac": round(perfect_frac, 4),
            "trivial_frac": round(_trivial_frac, 3),
            "learnable_frac": round(_learnable_frac, 3),
            "dead_frac": round(_dead_frac, 3),
            "hard_failed": hard_failed,
            "soft_failed": soft_failed,
            "per_topic": per_topic_journal,
            "recommendation": result.get("recommendation", ""),
        },
    )

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
            for c in _normalize_epoch_candidates(candidates):
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

    # ── Per-topic summary ──
    topic_agg: dict[str, list[float]] = defaultdict(list)
    for _sv, items in buckets.items():
        for it in items:
            t = it.get("topic", "unknown")
            topic_agg[t].append(it["score"])

    if len(topic_agg) > 1 or (len(topic_agg) == 1 and "unknown" not in topic_agg):
        per_topic_summary: list[dict] = []
        for t in sorted(topic_agg):
            t_scores = topic_agg[t]
            t_avg = sum(t_scores) / len(t_scores)
            t_zero = sum(1 for s in t_scores if s < 0.01) / len(t_scores)
            t_std = (sum((s - t_avg) ** 2 for s in t_scores) / len(t_scores)) ** 0.5
            # Classification based on score variance, not just avg.
            # GRPO learns from variance — a hard topic with spread is
            # valuable. Only flag topics with no useful gradient signal.
            classification = "OK"
            if t_zero > 0.8 and t_std < 0.05:
                # Nearly all zeros AND no variance — truly dead weight,
                # model can't produce anything scoreable for this topic
                classification = "DEAD_WEIGHT"
            elif t_std > 0.3 and t_avg < 0.4:
                # High variance + low avg — topic is too broad, records
                # don't agree on what "good" looks like
                classification = "AMBIGUOUS"
            elif t_avg < 0.15 and t_std >= 0.05:
                # Low avg but some variance — hard topic where model
                # sometimes gets partial credit. This is GOOD for RFT.
                classification = "HARD_BUT_LEARNING"
            elif t_avg < 0.15 and t_zero > 0.5 and t_std < 0.08:
                # Low avg, many zeros, almost no variance — model is
                # stuck and not producing useful gradient
                classification = "WEAK"
            per_topic_summary.append({
                "topic": t,
                "count": len(t_scores),
                "avg_score": round(t_avg, 4),
                "zero_rate": round(t_zero, 4),
                "score_std": round(t_std, 4),
                "classification": classification,
            })
        # Sort worst first
        per_topic_summary.sort(key=lambda x: x["avg_score"])
        output["per_topic"] = per_topic_summary

        # HARD_BUT_LEARNING is good for RFT — don't flag it as a problem
        problem_topics = [p for p in per_topic_summary
                          if p["classification"] not in ("OK", "HARD_BUT_LEARNING")]
        if problem_topics:
            output["diagnosis"].append({
                "issue": f"{len(problem_topics)} topic(s) flagged for poor performance",
                "topics": [
                    {"topic": p["topic"], "classification": p["classification"],
                     "avg_score": p["avg_score"], "zero_rate": p["zero_rate"],
                     "score_std": p["score_std"]}
                    for p in problem_topics
                ],
                "fix": [
                    "DEAD_WEIGHT: >80% zeros AND no variance (std<0.05) — model produces zero useful gradient. Remove or simplify the topic. (SKILL.md Step 9c)",
                    "AMBIGUOUS: high variance + low avg — topic is too broad. Split into narrower subtopics. (SKILL.md Step 9c)",
                    "WEAK: low avg, many zeros, no variance — model is stuck. Check records first; if records are fine, consider removing or simplifying the topic.",
                ],
            })
        # Note topics that are hard but learning — these are valuable
        learning_topics = [p for p in per_topic_summary
                           if p["classification"] == "HARD_BUT_LEARNING"]
        if learning_topics:
            output["diagnosis"].append({
                "issue": f"{len(learning_topics)} topic(s) are hard but producing gradient signal — keep them",
                "topics": [
                    {"topic": p["topic"], "avg_score": p["avg_score"],
                     "score_std": p["score_std"]}
                    for p in learning_topics
                ],
                "fix": ["No action needed — hard topics with score variance are the strongest training signal for GRPO."],
            })

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
                    "The model says it can't provide specific figures. This is a GRADER-PROMPT MISMATCH: "
                    "the grader expects behavior (exact citations, page references) that the model can't "
                    "produce from the prompt format. The model correctly declines instead of hallucinating, "
                    "but the grader gives partial credit for 'not hallucinating' instead of scoring 0."
                ),
                "fix": [
                    "**FIX THE GRADER** to match what the prompts can produce. Remove criteria the model "
                    "can't satisfy from the current prompt format (e.g., page/section citations).",
                    "Add early-exit for non-responses: if model doesn't extract any content → score 0.",
                    "Remove score snapping (Math.round * 10 / 10) — let continuous scores through.",
                    "If the model CAN answer from parametric knowledge, keep accuracy checks but "
                    "remove citation requirements.",
                ],
                "root_cause": "GRADER-PROMPT MISMATCH — grader too strict for prompt format",
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
                            "issue": "GRADER-PROMPT MISMATCH: grader expects document extraction but prompts are short questions",
                            "likely_cause": (
                                f"All {len(msg_lengths)} sampled records have short messages (avg {avg_len:.0f} chars). "
                                f"The system prompt references document extraction (filings, citations, pages) "
                                f"but the grader criteria require information (exact citations, page references) "
                                f"that the model can't produce from the prompt format alone."
                            ),
                            "fix": [
                                "ADJUST THE GRADER to match what the prompts can produce. Remove criteria "
                                "the model can't satisfy (e.g., page/section citations if no document is "
                                "provided in the prompt). Score based on what the model CAN do.",
                                "If the model can answer from parametric knowledge (e.g., public company "
                                "financials), keep accuracy checks but remove citation requirements.",
                                "If the task genuinely requires document-in-context analysis, that's a "
                                "different prompt architecture — consult the team before restructuring.",
                            ],
                            "root_cause": "GRADER-PROMPT MISMATCH — grader too strict for the prompt format",
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
        zero_items = buckets[0.0]
        zero_reasons = [it["reason"] for it in zero_items[:3]]

        # Classify zero reasons to distinguish grader fix vs record fix
        refusal_kw = ["refused", "not applicable", "please provide", "i cannot",
                      "i need more", "i'm unable", "cannot determine without"]
        parse_kw = ["cannot extract", "could not extract", "can't extract",
                    "empty", "too short", "no response"]
        wrong_kw = ["wrong", "incorrect", "model said"]

        refusal_count = sum(1 for it in zero_items if any(k in it["reason"].lower() for k in refusal_kw))
        parse_count = sum(1 for it in zero_items if any(k in it["reason"].lower() for k in parse_kw))
        wrong_count = sum(1 for it in zero_items if any(k in it["reason"].lower() for k in wrong_kw))

        fix_parts: list[str] = []
        fix_target = "grader"  # default

        if parse_count > len(zero_items) * 0.3:
            fix_parts.append(
                f"FIX GRADER: {parse_count} parsing failures — grader can't extract answers from "
                f"model responses. Add LLM extraction fallback or broaden regex patterns."
            )

        if refusal_count > len(zero_items) * 0.2:
            fix_parts.append(
                f"FIX RECORDS: {refusal_count} refusals — model refuses to answer these prompts. "
                f"Likely cause: prompts are too vague or open-ended for a structured-output task. "
                f"Regenerate with --ground-truth-format to force scenario-based prompts, or "
                f"remove/replace vague prompts (\"Explain...\", \"Describe...\", \"Compare...\")."
            )
            fix_target = "records" if refusal_count > parse_count else "grader"

        if wrong_count > len(zero_items) * 0.3:
            fix_parts.append(
                f"FIX GRADER (partial credit): {wrong_count} wrong answers scoring flat 0.0 — "
                f"add partial credit (0.01-0.1) for wrong answers that show domain knowledge. "
                f"Flat 0.0 kills GRPO gradient signal."
            )

        if not fix_parts:
            fix_parts.append(
                "Check if these are grader bugs (harsh early-exit) or genuinely empty responses. "
                "If grader bug → fix the early-exit condition. If model failure → remove these records."
            )

        output["diagnosis"].append({
            "issue": f"{len(zero_items)} records scored 0.0 (dead weight)",
            "sample_reasons": zero_reasons,
            "zero_breakdown": {
                "parsing_failures": parse_count,
                "refusals": refusal_count,
                "wrong_answers": wrong_count,
                "other": len(zero_items) - parse_count - refusal_count - wrong_count,
            },
            "fix_target": fix_target,
            "fix": fix_parts,
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

    # ── Response pattern analysis ──
    # Parse model outputs from reason fields to detect systematic patterns.
    # The reason field often contains "Model: [x, y, z]" or "Model said 'none'" etc.
    import re
    model_outputs: list[str] = []
    for score_val, items in buckets.items():
        for it in items:
            reason = it.get("reason", "")
            # Extract model output from reason — look for "Model: [...]" or "Model said '...'"
            m = re.search(r"Model:\s*\[([^\]]*)\]", reason)
            if m:
                model_outputs.append(m.group(1).strip())
            else:
                m2 = re.search(r"Model said '([^']*)'", reason)
                if m2:
                    model_outputs.append(m2.group(1).strip())

    if model_outputs:
        from collections import Counter
        output_counts = Counter(model_outputs)
        most_common = output_counts.most_common(3)
        total_outputs = len(model_outputs)

        # Check for dominant response pattern (>20% of all outputs identical)
        if most_common and most_common[0][1] > total_outputs * 0.2:
            dominant_output = most_common[0][0]
            dominant_pct = most_common[0][1] / total_outputs * 100
            output["diagnosis"].append({
                "issue": f"Response pattern: {dominant_pct:.0f}% of model outputs are '{dominant_output[:80]}' — model has a dominant response strategy",
                "likely_cause": (
                    "The model defaults to a single answer pattern for most prompts. "
                    "This reduces GRPO learning signal (all completions similar → zero-variance groups)."
                ),
                "fix": [
                    f"If '{dominant_output[:50]}' is a valid answer for some prompts but wrong for others, "
                    "the grader may need a harder penalty for incorrect use of this pattern.",
                    "Check if the model is over-predicting (listing too many items to maximize recall) "
                    "or under-predicting (saying 'none' to avoid penalties).",
                ],
            })

        # Check for over-prediction: many outputs have high item counts
        # (e.g., model listing all 9 allergens when GT has 1-2)
        high_item_outputs = [o for o in model_outputs if o.count(",") >= 4]
        if high_item_outputs and len(high_item_outputs) > total_outputs * 0.2:
            output["diagnosis"].append({
                "issue": f"Over-prediction: {len(high_item_outputs)}/{total_outputs} ({len(high_item_outputs)*100//total_outputs}%) model responses list 5+ items — model may be listing everything to maximize recall",
                "likely_cause": (
                    "Model learned that listing more items increases recall (and F1). "
                    "This is a grader exploit — F1 rewards recall even with low precision."
                ),
                "fix": [
                    "Add explicit false-positive penalty to grader (not just F1).",
                    "Example: if FP > TP, cap score at 0.2 regardless of F1.",
                    "Or: score = F1 * (1 - FP_rate) to penalize precision loss.",
                ],
            })

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

    if output.get("per_topic"):
        print("Per-topic breakdown (worst first):")
        for pt in output["per_topic"]:
            cls = pt["classification"]
            if cls == "OK":
                flag = ""
            elif cls == "HARD_BUT_LEARNING":
                flag = " ✓ hard but learning (good for RFT)"
            else:
                flag = f" ← {cls}"
            print(f"  {pt['topic']:30s}  avg={pt['avg_score']:.3f}  zero={pt['zero_rate']:.0%}  std={pt['score_std']:.3f}  n={pt['count']}{flag}")
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
        "workflow_id": args.workflow_id,
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

    # Auto-journal: eval created
    _auto_journal(
        project_dir=out_dir.parent,
        step="step_7_eval",
        action="create_eval",
        status="in_progress",
        summary=f"Eval created on {model} ({eval_id[:12]}...)",
        job_id=eval_id,
        job_type="eval",
        model=model,
        workflow_id=args.workflow_id,
    )


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


def _compute_eval_partial_score(result: dict) -> tuple:
    """Extract average score, zero-rate, and perfect-rate from partial eval results.

    Returns (average_score, num_scored_rows, zero_rate, perfect_rate).
    zero_rate is the fraction of scores < 0.01.
    perfect_rate is the fraction of scores >= 0.99.
    """
    rows = result.get("results", [])
    if not rows:
        # Fall back to summary if no row-level data
        summary = result.get("summary")
        if summary and summary.get("average_score") is not None:
            completed = result.get("completed_rows", 0)
            return summary["average_score"], completed, None, None
        return None, 0, None, None

    scores = []
    for row in rows:
        epochs = row.get("epochs", {})
        for _epoch_key, item in _iter_epoch_candidates(epochs):
            score = item.get("score")
            if score is not None:
                scores.append(score)

    if not scores:
        return None, 0, None, None
    avg = sum(scores) / len(scores)
    zero_count = sum(1 for s in scores if s < 0.01)
    zero_rate = zero_count / len(scores)
    perfect_count = sum(1 for s in scores if s >= 0.99)
    perfect_rate = perfect_count / len(scores)
    return avg, len(scores), zero_rate, perfect_rate


def _diagnose_and_decide(
    partial_results: list[dict],
    workflow_id: str | None,
    base_url: str,
) -> bool:
    """Diagnose partial eval results to decide: cancel or continue?

    Classifies zero-score reasons into parsing failures (grader bug) vs
    wrong answers (expected base model behavior). Returns True if the grader
    is actually broken and the eval should be cancelled.

    Returns:
        True  = grader is broken → cancel eval
        False = zeros are legitimate wrong answers → keep polling
    """
    from collections import defaultdict

    buckets: dict[float, list[str]] = defaultdict(list)
    for r in partial_results:
        for _epoch_key, candidates in r.get("epochs", {}).items():
            for c in _normalize_epoch_candidates(candidates):
                score = c.get("score")
                if score is not None:
                    buckets[round(float(score), 1)].append(
                        (c.get("reason") or "")[:200]
                    )

    total = sum(len(v) for v in buckets.values())
    if total == 0:
        print("    No scored rows to diagnose.", file=sys.stderr)
        return True  # can't tell, cancel to be safe

    print(f"\n    ── Diagnosis ({total} scored rows) ──", file=sys.stderr)

    # Show score distribution
    for score_val in sorted(buckets.keys()):
        reasons = buckets[score_val]
        pct = len(reasons) / total * 100
        print(f"    Score {score_val}: {len(reasons)} ({pct:.0f}%)", file=sys.stderr)
        for reason in reasons[:2]:
            if reason:
                print(f"      → {reason[:120]}", file=sys.stderr)

    # Classify zero-score reasons
    zero_reasons = buckets.get(0.0, [])
    if not zero_reasons:
        return True  # zeros from avg-score check, not zero-rate — cancel

    parse_fail_kw = [
        "cannot extract", "could not extract", "can't extract",
        "empty", "too short", "no response",
    ]
    wrong_answer_kw = [
        "wrong eligibility", "wrong answer", "incorrect",
        "wrong", "model said",
    ]
    refusal_kw = [
        "refused", "i cannot", "i'm unable", "i need more",
    ]

    parse_fail = sum(
        1 for r in zero_reasons
        if any(kw in r.lower() for kw in parse_fail_kw)
    )
    wrong_answer = sum(
        1 for r in zero_reasons
        if any(kw in r.lower() for kw in wrong_answer_kw)
    )
    refusal = sum(
        1 for r in zero_reasons
        if any(kw in r.lower() for kw in refusal_kw)
    )

    print(f"\n    ── Zero-score breakdown ({len(zero_reasons)} zeros) ──", file=sys.stderr)
    if parse_fail:
        print(f"    • {parse_fail} parsing failures (grader can't extract answer)", file=sys.stderr)
    if wrong_answer:
        print(f"    • {wrong_answer} wrong answers (model got it wrong — expected for base model)", file=sys.stderr)
    if refusal:
        print(f"    • {refusal} refusals (model refused to answer)", file=sys.stderr)
    other = len(zero_reasons) - parse_fail - wrong_answer - refusal
    if other > 0:
        print(f"    • {other} other/unclear", file=sys.stderr)

    # Decision: is the grader broken or are zeros legitimate?
    if parse_fail > wrong_answer and parse_fail > len(zero_reasons) * 0.5:
        print(
            f"\n    ✎ GRADER BUG: Can't parse model responses. "
            f"Fix regex patterns or add LLM extraction fallback in grader.js.",
            file=sys.stderr,
        )
        return True  # cancel — grader needs fixing

    if wrong_answer >= parse_fail:
        non_zero_scores = total - len(zero_reasons)
        print(
            f"\n    ✓ GRADER OK: Zeros are mostly wrong answers ({wrong_answer}/{len(zero_reasons)}). "
            f"{non_zero_scores} rows scored > 0 — grader differentiates correctly.",
            file=sys.stderr,
        )
        # Check: do we have score variance among the non-zero scores?
        # If yes, the grader is working — zeros are just hard prompts.
        non_zero_buckets = {k: v for k, v in buckets.items() if k > 0.0}
        if len(non_zero_buckets) >= 2:
            print(
                f"    Score variance confirmed: {len(non_zero_buckets)} distinct non-zero buckets.",
                file=sys.stderr,
            )
            return False  # keep polling — grader is fine
        else:
            print(
                f"    ⚠ Only {len(non_zero_buckets)} non-zero bucket — grader may still lack granularity.",
                file=sys.stderr,
            )
            return True  # cancel — grader might be too coarse

    if refusal > len(zero_reasons) * 0.5:
        print(
            f"\n    ✎ MODEL ISSUE: Model refuses to answer. "
            f"Check if system prompts are too restrictive or missing source context.",
            file=sys.stderr,
        )
        return True  # cancel — data/prompt issue

    # Unclear — cancel to be safe
    return True


def cmd_poll_eval(args: argparse.Namespace) -> None:
    """Poll an evaluation job until complete and save results locally.

    Reads the eval metadata from the local file, polls the gateway,
    updates the file with progress on every poll, and stops on completion.

    With --early-cancel (default), auto-cancels if average score is
    below threshold after enough rows complete — catches broken graders
    that score 0.0 on everything before wasting the full eval run.
    """
    import time

    eval_file = Path(args.file)
    if not eval_file.exists():
        print(f"Error: Eval file not found: {eval_file}", file=sys.stderr)
        sys.exit(1)

    metadata = json.loads(eval_file.read_text())
    eval_id = metadata["evaluation_run_id"]
    wf_id = metadata.get("workflow_id", getattr(args, "workflow_id", None))
    poll_interval = args.poll_interval
    max_wait = args.max_wait
    early_cancel = not args.no_early_cancel
    early_cancel_threshold = args.early_cancel_threshold
    early_cancel_min_rows = args.early_cancel_min_rows
    early_cancel_zero_rate = args.early_cancel_zero_rate

    if early_cancel:
        print(
            f"Polling eval {eval_id} every {poll_interval}s (max {max_wait}s) "
            f"[early-cancel: score < {early_cancel_threshold} after {early_cancel_min_rows} rows]..."
        )
    else:
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

        # Show partial score in progress line
        avg_score, scored_rows, zero_rate, perfect_rate = _compute_eval_partial_score(result)
        score_str = f", avg={avg_score:.3f}" if avg_score is not None else ""
        if zero_rate is not None:
            score_str += f", zeros={zero_rate:.0%}"
        if perfect_rate is not None and perfect_rate > 0.3:
            score_str += f", perfect={perfect_rate:.0%}"
        print(f"  [{elapsed}s] {status} ({completed}/{total} rows{score_str})", flush=True)

        # Update local JSON on every poll for progress tracking
        metadata = _update_eval_metadata(metadata, result)
        eval_file.write_text(json.dumps(metadata, indent=2))

        # Early cancel: detect broken grader before wasting the full run
        # Two signals: (1) avg score near zero, (2) high zero-score rate
        if early_cancel and status == "running" and scored_rows >= early_cancel_min_rows:
            cancel_reason = None

            if avg_score is not None and avg_score < early_cancel_threshold:
                cancel_reason = (
                    f"avg score {avg_score:.4f} across {scored_rows} rows "
                    f"(threshold: {early_cancel_threshold})"
                )

            if zero_rate is not None and zero_rate > early_cancel_zero_rate:
                cancel_reason = (
                    f"{zero_rate:.0%} of scores are 0.0 across {scored_rows} rows "
                    f"(threshold: {early_cancel_zero_rate:.0%}) — grader cannot parse "
                    f"model responses or data has issues"
                )

            if perfect_rate is not None and perfect_rate > 0.50 and cancel_reason is None:
                # Warn but don't cancel — eval K=1 with strong model doesn't predict training K=8 variance
                print(
                    f"  ⚠ WARNING: {perfect_rate:.0%} of scores are 1.0 — grader may be too lenient. "
                    f"Run difficulty-probe after eval completes to check K=8 prediction.",
                    file=sys.stderr,
                )

            if cancel_reason:
                print(
                    f"\n  ⚠ High zero/low score detected: {cancel_reason}",
                    file=sys.stderr,
                )
                print(
                    f"    Diagnosing before deciding to cancel...",
                    file=sys.stderr,
                )

                # Diagnose FIRST — decide whether to cancel based on root cause
                partial_results = metadata.get("results", [])
                is_grader_broken = True  # default: cancel unless diagnosis says otherwise
                if partial_results:
                    try:
                        is_grader_broken = _diagnose_and_decide(
                            partial_results, wf_id, args.base_url,
                        )
                    except Exception as diag_err:
                        print(
                            f"    (diagnosis failed: {diag_err} — cancelling to be safe)",
                            file=sys.stderr,
                        )

                if is_grader_broken:
                    # Grader is actually broken — cancel and require fix
                    metadata["status"] = "cancelled"
                    metadata["early_cancel_reason"] = f"Broken grader: {cancel_reason}"
                    eval_file.write_text(json.dumps(metadata, indent=2))
                    print(
                        f"\n    ⚠ Eval cancelled. FIX the grader issue above, "
                        f"then create a new eval.",
                        file=sys.stderr,
                    )
                    sys.exit(2)
                else:
                    # Zeros are from wrong answers, not grader bugs — keep polling
                    print(
                        f"\n    → Continuing eval (zeros are legitimate wrong answers, "
                        f"not grader bugs).",
                        file=sys.stderr,
                    )
                    early_cancel = False  # disable further checks for this eval

        if status in ("completed", "failed", "error", "cancelled"):
            metadata["completed_at"] = result.get("completed_at")
            eval_file.write_text(json.dumps(metadata, indent=2))
            print(f"Done: {status}. Saved to {eval_file}")

            # Auto-journal: eval completed with results
            eval_results = {}
            if avg_score is not None:
                eval_results["avg_score"] = round(avg_score, 4)
            if zero_rate is not None:
                eval_results["zero_rate"] = round(zero_rate, 4)
            if perfect_rate is not None:
                eval_results["perfect_rate"] = round(perfect_rate, 4)
            eval_results["total_rows"] = total
            _auto_journal(
                project_dir=eval_file.parent.parent,
                step="step_7_eval",
                action="eval_completed",
                status=status,
                summary=f"Eval {status}: {metadata.get('model', '?')} avg={avg_score:.3f}, perfect={perfect_rate:.0%}, zeros={zero_rate:.0%} ({total} rows)" if avg_score is not None else f"Eval {status}",
                job_id=eval_id,
                job_type="eval",
                model=metadata.get("model"),
                results=eval_results,
            )

            if status == "completed":
                print(
                    f"\n⚠️  MANDATORY: Log this eval iteration before proceeding:\n"
                    f"   uv run ${{CLAUDE_SKILL_DIR}}/scripts/finetune.py log-iteration \\\n"
                    f"     --project-dir finetune-project \\\n"
                    f"     --eval-file {eval_file} \\\n"
                    f"     --changes \"describe what changed\" \\\n"
                    f"     --change-type baseline|grader|records --verdict PENDING"
                )
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


def cmd_estimate_training(args: argparse.Namespace) -> None:
    """Estimate training cost and duration for one or more model configurations.

    Calls POST /finetune/workflows/{id}/jobs/estimate to get projected
    duration and USD cost. Useful for:
    1. Comparing cost across models during model selection (Step 7b)
    2. Cost-gating before committing to training
    3. Logging estimated vs actual cost in the pipeline journal
    """
    # Load user constraints from config.json if available
    config_file = Path("finetune-project/config.json")
    max_cost = args.max_cost
    max_duration = args.max_duration
    if config_file.exists() and (max_cost is None or max_duration is None):
        try:
            project_config = json.loads(config_file.read_text())
            constraints = project_config.get("constraints", {})
            if max_cost is None:
                max_cost = constraints.get("max_cost_usd")
            if max_duration is None:
                max_duration = constraints.get("max_duration_minutes")
        except (json.JSONDecodeError, OSError):
            pass

    configs = []
    models = [m.strip() for m in args.models.split(",")]
    for model in models:
        config: dict = {"job_type": "provider_finetune", "base_model": model}
        if args.epochs:
            config["training_config"] = {"epochs": args.epochs}
        if args.max_output_tokens:
            config.setdefault("inference_parameters", {})["max_output_tokens"] = args.max_output_tokens
        if args.k:
            config.setdefault("inference_parameters", {})["response_candidates_count"] = args.k
        configs.append(config)

    try:
        estimates = _api(
            "POST",
            f"{args.base_url}/finetune/workflows/{args.workflow_id}/jobs/estimate",
            json=configs,
        )
    except SystemExit:
        print("Error: Could not fetch estimates from gateway.", file=sys.stderr)
        sys.exit(1)

    if not isinstance(estimates, list):
        estimates = [estimates]

    # Print constraints if set
    if max_cost or max_duration:
        print(f"\n── User Constraints ──")
        if max_cost:
            print(f"  Max cost: ${max_cost:.2f}")
        if max_duration:
            print(f"  Max duration: {max_duration} min")

    print(f"\n── Training Cost Estimates ──")
    print(f"{'Model':20s} {'Records':>8s} {'Duration':>12s} {'Cost':>10s} {'Status':>12s}")
    print(f"{'─' * 20} {'─' * 8} {'─' * 12} {'─' * 10} {'─' * 12}")

    estimate_data = []
    viable_models = []
    for est_group in estimates:
        for est in est_group.get("estimations", [est_group]):
            model = est.get("base_model", "?")
            rows = est.get("total_rows", "?")
            dur_s = est.get("estimated_duration_seconds", 0)
            cost = est.get("estimated_cost_usd", 0)
            dur_min = dur_s / 60 if dur_s else 0
            dur_str = f"{int(dur_min)}m {dur_s % 60}s" if dur_s else "?"

            # Check constraints
            over_cost = max_cost is not None and cost > max_cost
            over_time = max_duration is not None and dur_min > max_duration
            if over_cost and over_time:
                status = "✗ OVER BOTH"
            elif over_cost:
                status = "✗ OVER COST"
            elif over_time:
                status = "✗ OVER TIME"
            else:
                status = "✓ OK"
                viable_models.append(model)

            print(f"{model:20s} {str(rows):>8s} {dur_str:>12s} ${cost:>8.2f} {status:>12s}")
            estimate_data.append({
                "model": model,
                "total_rows": rows,
                "estimated_duration_seconds": dur_s,
                "estimated_cost_usd": cost,
                "within_constraints": not over_cost and not over_time,
            })

    if len(estimate_data) > 1:
        viable = [e for e in estimate_data if e["within_constraints"]]
        if viable:
            cheapest = min(viable, key=lambda x: x["estimated_cost_usd"])
            fastest = min(viable, key=lambda x: x["estimated_duration_seconds"])
            print(f"\n  Viable models: {', '.join(viable_models)}")
            print(f"  Cheapest viable: {cheapest['model']} (${cheapest['estimated_cost_usd']:.2f})")
            print(f"  Fastest viable:  {fastest['model']} ({fastest['estimated_duration_seconds'] // 60}m)")
        elif max_cost or max_duration:
            print(f"\n  ⚠ NO models fit within constraints. Consider:")
            print(f"    → Reduce epochs or records to lower cost/time")
            print(f"    → Increase budget/time constraints")

    # Auto-journal
    constraint_str = ""
    if max_cost:
        constraint_str += f" max_cost=${max_cost:.2f}"
    if max_duration:
        constraint_str += f" max_duration={max_duration}min"

    estimate_summary = "Training estimates: " + ", ".join(
        f"{e['model']}=${e['estimated_cost_usd']:.2f}/{e['estimated_duration_seconds'] // 60}m"
        + ("" if e["within_constraints"] else " ✗")
        for e in estimate_data
    ) + (f". Constraints:{constraint_str}" if constraint_str else "")
    _auto_journal(
        project_dir=Path("finetune-project"),
        step="step_7b_estimate",
        action="estimate_training",
        status="completed",
        summary=estimate_summary,
        results={
            "estimates": estimate_data,
            "constraints": {"max_cost_usd": max_cost, "max_duration_minutes": max_duration},
            "viable_models": viable_models,
        },
    )

    # Output JSON for programmatic use
    print(json.dumps(estimate_data, indent=2))


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

    # Start with research-informed defaults, then merge user overrides.
    # This ensures lr, lora_rank, epochs, batch_size are always present
    # even when user only passes partial config (e.g., just max_output_tokens).
    #
    # Key defaults changed based on GRPO research:
    # Model-size-aware defaults. Research shows different optimal configs for
    # small (0.8B-2B) vs large (4B+) models:
    #
    # LR: 7B+ models use 1e-6 (DeepSeekMath arXiv:2402.03300, DAPO arXiv:2503.14476).
    #     0.8B-2B models need faster updates — 5e-6 empirically works better.
    #     Small models have shallower gradient landscapes, supporting higher LR.
    #
    # Beta (KL penalty): DAPO removes KL entirely (beta=0) for faster learning.
    #     Small-model DAPO study (alexlavaee.me): KL "hurts" 0.5B model performance.
    #     For short runs (3-5 epochs) on small models, beta=0 allows the model to
    #     move far enough from the base distribution to learn.
    #     4B+ may benefit from beta=0.01 on longer runs to prevent forgetting.
    #
    # scale_rewards: "Why GRPO Needs Normalization" (arXiv:2601.23135) shows group
    #     normalization improves convergence by amplifying within-group differences.
    #     Dr. GRPO (arXiv:2503.20783) removes it to avoid difficulty bias, but this
    #     matters more for 7B+ models on diverse tasks. For small models with strict
    #     graders producing low variance, group norm amplifies weak signal.
    #     4B+ with diverse tasks: "none" avoids difficulty bias.
    payload["training_config"] = {
        "lora_rank": 8,
        "gradient_accumulation_steps": 5,
        "epochs": 5,  # Default; overridden below by adaptive logic
        "batch_size": 5,
        "loss_type": "dr_grpo",  # Dr. GRPO (arXiv:2503.20783): removes length bias. Confirmed good for small models too.
        "mask_truncated_completions": False,  # Unsloth: "we recommend to disable it" — prevents kl=nan crash (Unsloth #3006)
        "importance_sampling_level": "sequence",  # Unsloth: "GSPO shows sequence-level often gives more stable training"
        # Model-size-dependent defaults (set below after model detection):
        "learning_rate": 0.000005,  # 5e-6 default, adjusted below
        "beta": 0,                  # No KL default, adjusted below
        "scale_rewards": "group",   # Group norm default, adjusted below. Gateway expects string enum.
    }
    if args.config:
        try:
            user_config = json.loads(args.config)
            payload["training_config"].update(user_config)
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON for --config", file=sys.stderr)
            sys.exit(1)

    # Adaptive defaults based on dataset size and model choice.
    # Fetches the workflow once to get record_count, then adjusts epochs and
    # warns about model sizing.
    # Ref: Empirical testing showed 9B OOM after 46 min with 225 records,
    #       wasted time before falling back to 4B. Pre-flight check would have avoided this.
    record_count = 0
    try:
        wf = _api("GET", f"{args.base_url}/finetune/workflows/{args.workflow_id}")
        record_count = wf.get("records_count", wf.get("record_count", 0))
        if not isinstance(record_count, int):
            record_count = 0
    except SystemExit:
        pass  # Workflow fetch failed; skip adaptive logic

    # Model size pre-flight check.
    # Only 3 base models supported: Qwen3.5-0.8B, Qwen3.5-2B, Qwen3.5-4B.
    # 4B with >800 records (K=8) may need K=4 to avoid OOM.
    # 0.8B/2B: works with any practical dataset size.
    base_model = payload.get("base_model", "")
    model_lower = base_model.lower()
    k_count = 8  # default response_candidates_count
    if args.inference_params:
        try:
            k_count = json.loads(args.inference_params).get("response_candidates_count", 8)
        except (json.JSONDecodeError, AttributeError):
            pass

    # Model-size-dependent training config adjustments (unless user overrode via --config)
    user_set_lr = args.config and "learning_rate" in (args.config or "")
    user_set_beta = args.config and "beta" in (args.config or "")
    user_set_scale = args.config and "scale_rewards" in (args.config or "")

    if "4b" in model_lower:
        # 4B: conservative settings — closer to 7B research defaults
        if not user_set_lr:
            payload["training_config"]["learning_rate"] = 0.000002  # 2e-6: moderate for 4B
        if not user_set_beta:
            payload["training_config"]["beta"] = 0.01  # KL penalty for larger model (arXiv:2509.07430)
        if not user_set_scale:
            payload["training_config"]["scale_rewards"] = "none"  # Avoid difficulty bias (Dr. GRPO)
        print(f"  Config: 4B profile (lr=2e-6, beta=0.01, scale=none)")
    elif "2b" in model_lower:
        # 2B: middle ground
        if not user_set_lr:
            payload["training_config"]["learning_rate"] = 0.000003  # 3e-6
        if not user_set_beta:
            payload["training_config"]["beta"] = 0  # No KL for medium model
        if not user_set_scale:
            payload["training_config"]["scale_rewards"] = "group"  # Amplify signal
        print(f"  Config: 2B profile (lr=3e-6, beta=0, scale=group)")
    else:
        # 0.8B (default): aggressive settings — small model needs fast updates
        # Empirically validated: 0.8B food-allergen run with lr=5e-6, beta=0, scale=group
        # achieved 0.646→0.864 over 5 epochs. Same task with lr=1e-6, beta=0.01, scale=none
        # was flat (0.348→0.345).
        if not user_set_lr:
            payload["training_config"]["learning_rate"] = 0.000005  # 5e-6
        if not user_set_beta:
            payload["training_config"]["beta"] = 0
        if not user_set_scale:
            payload["training_config"]["scale_rewards"] = "group"
        print(f"  Config: 0.8B profile (lr=5e-6, beta=0, scale=group)")

    if record_count > 0 and "4b" in model_lower and record_count > 800:
        print(f"  ⚠ WARNING: {base_model} with {record_count} records (K={k_count}) may risk OOM.", file=sys.stderr)
        print(f"    Consider reducing to K=4 or using Qwen3.5-2B.", file=sys.stderr)

    # Adaptive epochs (unless user explicitly set epochs in --config)
    # Reduced maximums to prevent forgetting spiral (arXiv:2509.07430).
    # arXiv:2505.22257: "training beyond ~80% of one epoch yields negligible reward gains."
    # arXiv:2506.02355: "training becomes unstable around 4 epochs."
    # Small datasets still need more passes but capped at 8 (was 15).
    user_set_epochs = args.config and "epochs" in (args.config or "")
    if not user_set_epochs and record_count > 0:
        # Model-size-aware epoch selection. Small models (0.8B/2B) with K=16
        # need more epochs to explore — each epoch generates fresh K=16 rollouts.
        # The old successful 0.8B run used 5 epochs with 384 records.
        is_small_model = "0.8b" in model_lower or "2b" in model_lower
        if record_count < 50:
            payload["training_config"]["epochs"] = 8
        elif record_count < 200:
            payload["training_config"]["epochs"] = 5
        elif record_count < 500:
            payload["training_config"]["epochs"] = 5 if is_small_model else 3
        else:
            payload["training_config"]["epochs"] = 3 if is_small_model else 3
        print(f"Adaptive epochs: {payload['training_config']['epochs']} (based on {record_count} records, {'small' if is_small_model else 'large'} model)")

    # K (response_candidates_count) is model-size-dependent.
    # Small models (0.8B-2B) with strict graders produce low within-group variance
    # at K=8 — frac_reward_zero_std reaches 80%. K=16 gives more diversity.
    # Evidence: 0.8B food-allergen with K=8 had frac_reward_zero_std=0.80, flat training.
    # Same task with K=16 achieved 0.646→0.864. The old successful run used K=16.
    # 4B models with higher baseline capability produce enough variance at K=8.
    k_default = 16 if ("0.8b" in model_lower or "2b" in model_lower) else 8

    # Build defaults first, then merge user overrides. This ensures K and other
    # model-size-aware defaults aren't lost when user passes partial --inference-params
    # (e.g., just max_output_tokens).
    payload["inference_parameters"] = {
        "max_output_tokens": 512,
        "temperature": 1.0,
        "top_p": 1.0,
        "response_candidates_count": k_default,
    }
    if args.inference_params:
        try:
            user_inf = json.loads(args.inference_params)
            payload["inference_parameters"].update(user_inf)
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON for --inference-params", file=sys.stderr)
            sys.exit(1)
    print(f"  Config: K={payload['inference_parameters'].get('response_candidates_count', k_default)} (response_candidates_count)")

    # Auto-adjust max_output_tokens based on dataset content.
    # Mirrors the completion_length gate logic from data_quality_gate.py.
    # Fetches records from gateway, estimates required token length from
    # ground truth + system prompt complexity, and adjusts max_output_tokens
    # both UP (prevent truncation) and DOWN (prevent padding/NaN).
    #
    # Why BOTH directions matter:
    # - Too low: 100% completion truncation → grader scores garbage → wasted
    #   GPU time (9-13h incidents). This was the original motivation.
    # - Too high: For short-output tasks (classification, extraction), the base
    #   model fills the token budget with padding. With mask_truncated_completions
    #   =True (cloud default), all completions get truncated → completion_mask
    #   becomes all-zeros → kl=nan crash at early steps (Unsloth #3006, #3260).
    #   Even without the crash, excess budget encourages length exploitation.
    #
    # Different tasks need different limits (classification ~64-128, MCQ ~1500,
    # code gen ~2000+). A fixed default cannot work for all scenarios.
    # Headroom: 30% above P95 estimate (heuristic inspired by DAPO's overlong
    # soft-punishment zone, arXiv:2503.14476 — not a direct DAPO parameter).
    current_max_tokens = payload["inference_parameters"].get("max_output_tokens", 512)
    try:
        records = _api(
            "GET",
            f"{args.base_url}/finetune/workflows/{args.workflow_id}/records",
        )
        if isinstance(records, list) and len(records) > 0:
            recommended = _estimate_recommended_max_tokens(records)
            if recommended != current_max_tokens:
                direction = "↑" if recommended > current_max_tokens else "↓"
                reason = (
                    "too low — risk of completion truncation"
                    if recommended > current_max_tokens
                    else "too high for short-output task — risk of kl=nan from "
                         "all-truncated batches (mask_truncated_completions=True)"
                )
                print(
                    f"  Auto-adjusting max_output_tokens: {current_max_tokens} → "
                    f"{recommended} {direction} ({reason}). "
                    f"Based on dataset content analysis — ground truth length × "
                    f"task complexity, with 30% headroom above P95. "
                    f"Override with --inference-params if needed.",
                    file=sys.stderr,
                )
                payload["inference_parameters"]["max_output_tokens"] = recommended
    except (SystemExit, Exception) as e:
        # Non-fatal: if record fetch fails, proceed with current value.
        # The data_quality_gate should have already caught this pre-training.
        print(f"  Note: Could not auto-adjust max_output_tokens (record fetch failed). "
              f"Using {current_max_tokens}.", file=sys.stderr)

    # Pre-flight: check cost/time constraints from config.json
    config_file = Path("finetune-project/config.json")
    if config_file.exists():
        try:
            project_config = json.loads(config_file.read_text())
            constraints = project_config.get("constraints", {})
            c_max_cost = constraints.get("max_cost_usd")
            c_max_dur = constraints.get("max_duration_minutes")
            if c_max_cost or c_max_dur:
                try:
                    est = _api(
                        "POST",
                        f"{args.base_url}/finetune/workflows/{args.workflow_id}/jobs/estimate",
                        json=[{"base_model": payload["base_model"],
                               "training_config": payload.get("training_config"),
                               "inference_parameters": payload.get("inference_parameters")}],
                    )
                    if isinstance(est, list) and est:
                        e = est[0].get("estimations", [est[0]])[0]
                        est_cost = e.get("estimated_cost_usd", 0)
                        est_dur = e.get("estimated_duration_seconds", 0) / 60
                        print(f"  Pre-flight estimate: ${est_cost:.2f}, {est_dur:.0f}min", file=sys.stderr)
                        if c_max_cost and est_cost > c_max_cost:
                            print(f"  ⚠ OVER BUDGET: estimated ${est_cost:.2f} > constraint ${c_max_cost:.2f}", file=sys.stderr)
                            print(f"  → Use a smaller model, reduce epochs, or increase budget in config.json", file=sys.stderr)
                        if c_max_dur and est_dur > c_max_dur:
                            print(f"  ⚠ OVER TIME: estimated {est_dur:.0f}min > constraint {c_max_dur:.0f}min", file=sys.stderr)
                            print(f"  → Use a smaller model, reduce epochs, or increase time limit in config.json", file=sys.stderr)
                except (SystemExit, Exception):
                    pass  # Non-fatal: estimate failure shouldn't block training
        except (json.JSONDecodeError, OSError):
            pass

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

    # Auto-journal: training created
    config = payload.get("training_config", {})
    inference = payload.get("inference_parameters", {})
    _auto_journal(
        project_dir=out_dir.parent,
        step="step_7e_training",
        action="create_training",
        status="in_progress",
        summary=f"Training created: {args.base_model}, epochs={config.get('epochs')}, lr={config.get('learning_rate')}, K={inference.get('response_candidates_count', 8)}, max_tokens={inference.get('max_output_tokens')}",
        job_id=internal_id,
        job_type="training",
        model=args.base_model,
        results={"config": config, "inference": inference},
        workflow_id=args.workflow_id,
    )


def _estimate_recommended_max_tokens(records: list[dict]) -> int:
    """Estimate the recommended max_output_tokens from dataset content.

    Mirrors the completion_length gate logic from data_quality_gate.py:
    1. Extracts ground truth token lengths (4 chars/token heuristic)
    2. Applies adaptive multiplier based on system prompt complexity
    3. Returns P95 estimate × 1.3 (30% headroom — empirical heuristic
       inspired by DAPO's overlong soft-punishment approach, not a
       direct DAPO parameter)

    Returns the recommended minimum, or 512 if estimation is not possible
    (e.g., no ground truth fields in the dataset).
    """
    import statistics as _stats

    gt_lengths: list[int] = []
    sys_lengths: list[int] = []

    for record in records:
        # Extract ground truth
        gt = record.get("ground_truth", "")
        if gt and gt.strip():
            gt_lengths.append(max(1, len(gt.strip()) // 4))

        # Extract system prompt length
        for msg in record.get("messages", []):
            if msg.get("role") == "system":
                sys_lengths.append(max(1, len(msg.get("content", "").strip()) // 4))
                break

    if not gt_lengths:
        return 512  # No ground truth — can't estimate, keep default

    # Adaptive multiplier based on task complexity (system prompt length).
    # Short prompts (<100 tokens): simple Q&A → 2x GT
    # Medium prompts (100-250 tokens): structured task → 3x GT
    # Long prompts (>250 tokens): multi-step analysis → 5x GT
    avg_sys_tokens = _stats.mean(sys_lengths) if sys_lengths else 0
    if avg_sys_tokens > 250:
        multiplier = 5.0
    elif avg_sys_tokens > 100:
        multiplier = 3.0
    else:
        multiplier = 2.0

    # P95 of ground truth lengths
    sorted_gt = sorted(gt_lengths)
    p95_idx = min(len(sorted_gt) - 1, int(len(sorted_gt) * 0.95))
    gt_p95 = sorted_gt[p95_idx]

    # Recommended: P95 estimate with 30% headroom.
    # Heuristic inspired by DAPO's overlong soft-punishment zone
    # (arXiv:2503.14476 uses a ~20% absolute zone at 16K-20K tokens,
    # not a percentage-based buffer — we adapt the principle for
    # smaller-scale tasks).
    recommended = int(gt_p95 * multiplier * 1.3)

    # Clamp to reasonable range: minimum 64, maximum 4096.
    # Floor of 64 (not higher): short-output tasks like classification or
    # allergen detection have GT of 1-10 tokens. Setting max_output_tokens
    # too high (e.g., 512 for a 5-token task) gives GRPO room to pad —
    # the base model fills the token budget, all completions get truncated
    # at the limit, and mask_truncated_completions=True zeros out the
    # completion mask → kl=nan crash (Unsloth issues #3006, #3260).
    # 64 tokens is generous for any classification/extraction task while
    # preventing the 500-token padding problem.
    # Ceiling of 4096: beyond this is very expensive with K=8 completions.
    return max(64, min(4096, recommended))


class _JobNotFoundError(Exception):
    """Raised when a job ID is not found in the workflow's job list."""


def _poll_training_once(base_url: str, wf_id: str, job_id: str) -> dict:
    """Fetch training job status from the jobs list (single-job endpoint is broken)."""
    jobs = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/jobs?include_metrics=true")
    job_list = jobs if isinstance(jobs, list) else jobs.get("jobs", [])
    for job in job_list:
        if job.get("id") == job_id:
            return job
    raise _JobNotFoundError(f"Job {job_id} not found in workflow {wf_id}")


def _save_training_side_files(
    base_url: str, wf_id: str, job_id: str, output_dir: Path,
    provider_job_id: str | None = None,
) -> None:
    """Fetch and save metrics + epoch evals to side files.

    The metrics endpoint uses internal job_id, but the finetune-evaluations
    endpoint requires provider_job_id (the cloud-side ID). Using the internal
    ID returns empty results silently.
    """
    metrics_file = output_dir / f"{job_id}-metrics.json"
    try:
        metrics = _api("GET", f"{base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/metrics")
        metrics_file.write_text(json.dumps(metrics, indent=2))
    except SystemExit:
        print(f"  Warning: Could not fetch metrics", file=sys.stderr)

    evals_file = output_dir / f"{job_id}-epoch-evals.json"
    try:
        evals = _fetch_all_finetune_evals(base_url, wf_id, provider_job_id)
        evals_file.write_text(json.dumps(evals, indent=2))
    except SystemExit:
        print(f"  Warning: Could not fetch epoch evals", file=sys.stderr)


def _compute_ema(values: list[float], alpha: float = 0.3) -> list[float]:
    """Compute exponential moving average over a series.

    Alpha=0.3 balances responsiveness to recent changes vs. noise smoothing.
    Higher alpha = more responsive, lower = smoother.
    """
    if not values:
        return []
    ema = [values[0]]
    for v in values[1:]:
        ema.append(alpha * v + (1 - alpha) * ema[-1])
    return ema


def _ema_slope(ema_values: list[float], window: int) -> float:
    """Compute average slope of the last `window` EMA points.

    Uses simple linear regression (least squares) over the window for
    robustness against single-point noise.
    """
    tail = ema_values[-window:]
    n = len(tail)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(tail) / n
    numerator = sum((i - x_mean) * (y - y_mean) for i, y in enumerate(tail))
    denominator = sum((i - x_mean) ** 2 for i in range(n))
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _check_length_exploitation(
    base_url: str, wf_id: str, job_id: str,
) -> dict | None:
    """Detect length exploitation: response length growing while reward is flat.

    Ref: Dr. GRPO (arXiv:2503.20783) — GRPO's 1/|o_i| normalization causes
    incorrect responses to grow longer. Reward may appear stable while the
    model is actively degenerating.

    Only triggers when length grows >30% AND reward is flat or declining.
    If reward is improving alongside length, the model is learning to give
    better, more complete answers — that's healthy, not exploitation.

    Returns dict with length trend info if exploitation detected, None otherwise.
    """
    try:
        metrics = _api(
            "GET",
            f"{base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/metrics",
        )
    except SystemExit:
        return None

    steps = metrics.get("steps", metrics.get("data", []))
    if not isinstance(steps, list) or len(steps) < 6:
        return None

    # Extract mean_length and reward per step
    lengths: list[float] = []
    rewards: list[float] = []
    for step in steps:
        length = step.get("completions/mean_length") or step.get("completion_length")
        if length is not None and isinstance(length, (int, float)):
            lengths.append(float(length))

        reward = step.get("reward/mean") or step.get("reward_mean")
        if reward is not None and isinstance(reward, (int, float)):
            rewards.append(float(reward))

    if len(lengths) < 6:
        return None

    # Compare first third vs last third for length
    third = len(lengths) // 3
    early_avg = sum(lengths[:third]) / third
    late_avg = sum(lengths[-third:]) / third

    if early_avg <= 0:
        return None

    growth_ratio = (late_avg - early_avg) / early_avg

    # No significant length growth — no exploitation
    if growth_ratio <= 0.30:
        return None

    # Length grew >30%. Now check if reward is also improving.
    # If reward is clearly improving, this is healthy learning, not exploitation.
    if len(rewards) >= 6:
        reward_ema = _compute_ema(rewards, alpha=0.3)
        reward_slope = _ema_slope(reward_ema, window=min(len(reward_ema), 5))
        # Positive reward slope above threshold means model is learning
        if reward_slope > 0.005:
            return None

    return {
        "length_exploitation": True,
        "early_avg_length": round(early_avg, 1),
        "late_avg_length": round(late_avg, 1),
        "growth_pct": round(growth_ratio * 100, 1),
    }


def _check_completion_clipping(
    base_url: str, wf_id: str, job_id: str,
) -> dict | None:
    """Detect fatal completion clipping: max_output_tokens too low for the task.

    When completions/clipped_ratio is consistently high, the grader scores
    truncated (incomplete) responses, producing noise instead of gradient signal.
    Training is wasting GPU time and should be cancelled.

    Ref: training-metrics-guide.md §Completion Metrics:
    - clipped_ratio > 0.5 = critical (majority truncated)
    - clipped_ratio = 1.0 = all truncated, zero useful signal
    - mean_terminated_length = 0 = no completion ever finishes naturally

    Thresholds:
    - FATAL (auto-cancel): clipped_ratio >= 0.50 sustained over 3+ steps
      (majority of completions truncated → grader scores garbage)
    - CATASTROPHIC (auto-cancel immediately): clipped_ratio >= 0.90 on first step
      (nearly all truncated — max_output_tokens is wildly insufficient)

    Returns dict with clipping info if detected, None otherwise.
    """
    CLIPPED_FATAL = 0.50
    CLIPPED_CATASTROPHIC = 0.90
    SUSTAINED_STEPS = 3

    try:
        raw = _api(
            "GET",
            f"{base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/metrics",
        )
    except SystemExit:
        return None

    # Unwrap the wrapped metrics response
    points = raw.get("metrics", [])
    if not isinstance(points, list):
        return None

    steps = [
        p["metrics"] for p in points
        if isinstance(p, dict) and "metrics" in p and isinstance(p["metrics"], dict)
    ]
    if not steps:
        return None

    # Extract clipping data from each step
    clipping_data: list[dict] = []
    for s in steps:
        clipped_ratio = s.get("completions/clipped_ratio")
        if not isinstance(clipped_ratio, (int, float)):
            continue
        max_len = s.get("completions/max_length")
        mean_len = s.get("completions/mean_length")
        mean_term = s.get("completions/mean_terminated_length")
        global_step = s.get("global_step", 0)
        clipping_data.append({
            "step": global_step,
            "clipped_ratio": float(clipped_ratio),
            "max_length": float(max_len) if isinstance(max_len, (int, float)) else None,
            "mean_length": float(mean_len) if isinstance(mean_len, (int, float)) else None,
            "mean_terminated_length": float(mean_term) if isinstance(mean_term, (int, float)) else None,
        })

    if not clipping_data:
        return None

    latest = clipping_data[-1]

    # CATASTROPHIC: first step shows >=90% clipping — immediately fatal
    if len(clipping_data) >= 1 and clipping_data[0]["clipped_ratio"] >= CLIPPED_CATASTROPHIC:
        # Estimate required max_output_tokens from terminated lengths
        recommended = _estimate_recommended_from_clipping(clipping_data)
        return {
            "clipping_detected": True,
            "severity": "catastrophic",
            "latest_clipped_ratio": latest["clipped_ratio"],
            "sustained_steps": len(clipping_data),
            "max_length": latest.get("max_length"),
            "mean_terminated_length": latest.get("mean_terminated_length"),
            "recommended_max_output_tokens": recommended,
            "ratios": [d["clipped_ratio"] for d in clipping_data],
        }

    # FATAL: sustained high clipping over SUSTAINED_STEPS
    if len(clipping_data) >= SUSTAINED_STEPS:
        recent = clipping_data[-SUSTAINED_STEPS:]
        all_above_fatal = all(d["clipped_ratio"] >= CLIPPED_FATAL for d in recent)
        if all_above_fatal:
            recommended = _estimate_recommended_from_clipping(clipping_data)
            return {
                "clipping_detected": True,
                "severity": "sustained",
                "latest_clipped_ratio": latest["clipped_ratio"],
                "sustained_steps": SUSTAINED_STEPS,
                "max_length": latest.get("max_length"),
                "mean_terminated_length": latest.get("mean_terminated_length"),
                "recommended_max_output_tokens": recommended,
                "ratios": [d["clipped_ratio"] for d in clipping_data],
            }

    return None


def _estimate_recommended_from_clipping(clipping_data: list[dict]) -> int | None:
    """Estimate a better max_output_tokens from terminated completion lengths.

    Uses the max terminated length across all steps + 50% headroom.
    If no completions terminated naturally (all truncated), returns None —
    the caller should suggest 2x the current max_output_tokens.
    """
    terminated_lengths = [
        d["mean_terminated_length"]
        for d in clipping_data
        if d.get("mean_terminated_length") and d["mean_terminated_length"] > 0
    ]
    if not terminated_lengths:
        # All completions truncated — suggest 2x current max
        max_lengths = [d["max_length"] for d in clipping_data if d.get("max_length")]
        if max_lengths:
            return int(max(max_lengths) * 2)
        return None

    # Use max terminated length + 50% headroom
    max_natural = max(terminated_lengths)
    return int(max_natural * 1.5)


def _check_score_plateau(
    base_url: str, wf_id: str, job_id: str,
    patience: int = 5, slope_threshold: float = 0.005,
    min_warmup_epochs: int = 2,
    provider_job_id: str | None = None,
) -> dict | None:
    """Check if training scores have plateaued across epoch evals.

    Returns a dict with plateau/degradation info if detected, None otherwise.

    Note: The finetune-evaluations endpoint requires provider_job_id (cloud ID),
    not the internal job_id. Using the wrong ID returns empty results, silently
    disabling early stopping.

    Improved early stopping based on GRPO research:
    - Uses EMA (alpha=0.3) for noise robustness (standard signal processing
      heuristic — appropriate for epoch-level data with 5-30 points)
    - Linear regression slope over the patience window detects true trends
    - Requires min_warmup_epochs before checking. GRPO has a slow-start phase
      (arXiv:2507.18014 identifies 3 phases: slow start → rapid improvement
      → plateau). Patience/warmup are now adaptive to total_epochs (see
      cmd_poll_training) — our heuristic, not from the paper.
    - slope_threshold=0.005/epoch — conservative to avoid aborting late-stage
      hard-prompt learning (arXiv:2508.14094: hard examples yield 47% gains
      — verified GRPO-specific)
    - Distinguishes "converged well" (high score) vs "stuck" (low score) —
      GRPO has absorbing states at p=0 (arXiv:2503.06639 — verified
      GRPO-specific)
    - Length exploitation detected separately (Dr. GRPO, arXiv:2503.20783 —
      verified GRPO-specific: 1/|o_i| normalization causes length bias)

    Ref: Empirical testing showed plateau at epoch 3 with
    225 records — score went 0.51→0.60 then +0.003 across 3 evals.
    Continued training for 7+ more hours with no improvement.
    """
    try:
        evals = _fetch_all_finetune_evals(base_url, wf_id, provider_job_id)
    except SystemExit:
        return None

    results = evals.get("results", [])
    if not results:
        return None

    # Compute per-epoch average scores
    # Each result has "epochs" dict: {"1": [{"score": 0.5}, ...], "2": [...], ...}
    epoch_scores: dict[str, list[float]] = {}
    for row in results:
        epochs = row.get("epochs", {})
        for epoch_key, item in _iter_epoch_candidates(epochs):
            score = item.get("score")
            if score is not None:
                epoch_scores.setdefault(epoch_key, []).append(score)

    # Warm-up guard: don't check until we have enough epochs.
    # GRPO's slow-start phase (arXiv:2507.18014) means early epochs may
    # show little improvement before rapid gains begin.
    if len(epoch_scores) < max(patience, min_warmup_epochs + 1):
        return None

    # Sort epochs numerically and compute averages
    sorted_epochs = sorted(epoch_scores.keys(), key=_epoch_sort_key)
    epoch_avgs = [
        (k, sum(epoch_scores[k]) / len(epoch_scores[k]))
        for k in sorted_epochs
    ]

    raw_scores = [avg for _, avg in epoch_avgs]

    # EMA smoothing (alpha=0.3) — robust to noisy per-epoch eval variance.
    # Raw first-vs-last comparison misses oscillation and V-shaped recovery.
    ema_scores = _compute_ema(raw_scores, alpha=0.3)

    # Slope of EMA over the patience window via linear regression.
    # Positive slope = still improving, negative = degrading, near-zero = plateau.
    slope = _ema_slope(ema_scores, window=patience)

    best_epoch, best_score = max(epoch_avgs, key=lambda x: x[1])
    last_score = epoch_avgs[-1][1]

    result_base = {
        "num_evals": len(epoch_avgs),
        "patience": patience,
        "ema_slope": round(slope, 6),
        "slope_threshold": slope_threshold,
        "best_epoch": best_epoch,
        "best_score": round(best_score, 4),
        "last_score": round(last_score, 4),
        "all_avgs": [(k, round(v, 4)) for k, v in epoch_avgs],
        "ema_values": [round(v, 4) for v in ema_scores],
    }

    # --- Signal 1: Score plateau (EMA slope near zero) ---
    if abs(slope) < slope_threshold:
        # Distinguish "converged well" vs "stuck at bad minimum".
        # GRPO has absorbing states at p=0 (arXiv:2503.06639) — a plateau
        # at low scores likely means the grader/data needs fixing, not that
        # training should just stop.
        if best_score >= 0.5:
            quality = "converged"
            action = "Deploy best checkpoint"
        elif best_score >= 0.3:
            quality = "mediocre"
            action = "Consider improving grader/data quality before retraining"
        else:
            quality = "stuck"
            action = "Investigate grader alignment and data quality — low plateau suggests fundamental issues"

        return {
            **result_base,
            "signal": "plateau",
            "quality": quality,
            "action": action,
            "plateaued": True,
        }

    # --- Signal 2: Score degradation (negative EMA slope) ---
    # Reward declining over the patience window indicates overfitting,
    # reward hacking, or policy collapse.
    if slope < -slope_threshold:
        return {
            **result_base,
            "signal": "degradation",
            "quality": "degrading",
            "action": "Stop training — scores declining. Deploy best checkpoint",
            "plateaued": True,  # Backward compat: treated as stop signal
        }

    return None


def cmd_poll_training(args: argparse.Namespace) -> None:
    """Poll a training job until complete, saving status and metrics locally."""
    import time

    job_file = Path(args.file)
    if not job_file.exists():
        print(f"Error: Job file not found: {job_file}", file=sys.stderr)
        sys.exit(1)

    metadata = json.loads(job_file.read_text())
    job_id = metadata["job_id"]
    provider_job_id = metadata.get("provider_job_id")
    wf_id = args.workflow_id or metadata.get("workflow_id")
    if not wf_id:
        print("Error: --workflow-id not provided and not found in job file", file=sys.stderr)
        sys.exit(1)
    max_wait = args.max_wait
    output_dir = job_file.parent

    # Adaptive polling: poll frequently early on, back off over time.
    # Training jobs run 10min-2h+, so aggressive early polling catches fast
    # failures while backing off saves API calls during long runs.
    def _adaptive_interval(elapsed_s: float) -> int:
        """Return poll interval based on elapsed time. Never exceeds 600s (10min)."""
        if elapsed_s < 600:       # First 10 min: poll every 30s
            return 30
        elif elapsed_s < 3600:    # 10-60 min: poll every 2 min
            return 120
        else:                     # 60+ min: poll every 10 min (cap)
            return 600

    early_stop = not args.no_early_stop

    # Adaptive early stopping: patience and warmup scale with total epochs.
    # Fixed patience=5 was too conservative for short runs (3-5 epochs) —
    # a short training run completed only 1.6 epochs, and early stopping
    # never fired because it needed 6+ epochs of data.
    # arXiv:2507.18014 observes a 3-phase GRPO training pattern (slow start
    # → rapid improvement → plateau), with slow-start at 0-10% of training.
    # The patience/warmup formulas below are our own heuristic (not from the
    # paper) designed to ensure early stopping can fire on short runs while
    # still respecting the slow-start phase.
    total_epochs = metadata.get("training_config", {}).get("epochs", 8)
    adaptive_patience = max(3, min(5, total_epochs // 3))
    adaptive_warmup = max(1, total_epochs // 5)

    print(f"Polling training job {job_id} with adaptive intervals (max {max_wait}s)...")
    if early_stop:
        print(
            f"  Early stopping enabled (completion clipping, EMA-based plateau, "
            f"patience={adaptive_patience} epochs, min {adaptive_warmup} epoch warm-up, "
            f"length exploitation check) [adaptive for {total_epochs}-epoch run]"
        )
    start_time = time.time()
    status = "unknown"
    not_found_count = 0  # Track consecutive "job not found" responses
    last_plateau_check = 0.0  # Only check plateau every 5 min to avoid API spam
    while True:
        elapsed = time.time() - start_time
        if elapsed >= max_wait:
            break

        try:
            result = _poll_training_once(args.base_url, wf_id, job_id)
            not_found_count = 0  # Reset on success
        except _JobNotFoundError:
            not_found_count += 1
            if not_found_count >= 3:
                print(f"Error: Job {job_id} not found after {not_found_count} consecutive checks. Wrong job ID?", file=sys.stderr)
                sys.exit(1)
            interval = _adaptive_interval(elapsed)
            print(f"  [{int(elapsed)}s] Job not in list (attempt {not_found_count}/3) — retrying in {interval}s...", file=sys.stderr)
            time.sleep(interval)
            continue
        except SystemExit:
            interval = _adaptive_interval(elapsed)
            print(f"  [{int(elapsed)}s] API error — retrying in {interval}s...", file=sys.stderr)
            time.sleep(interval)
            continue

        status = result.get("status", "unknown")
        print(f"  [{int(elapsed)}s] {status}", flush=True)

        metadata["status"] = status
        job_file.write_text(json.dumps(metadata, indent=2))

        _save_training_side_files(args.base_url, wf_id, job_id, output_dir, provider_job_id)

        if status in ("succeeded", "completed", "failed", "cancelled"):
            metadata["completed_at"] = result.get("completed_at")
            metadata["fine_tuned_model"] = result.get("fine_tuned_model")
            metadata["error_message"] = result.get("error_message")
            job_file.write_text(json.dumps(metadata, indent=2))
            print(f"Done: {status}. Saved to {job_file}")

            # ── Fetch epoch progression before journaling ──
            epoch_progression: list[dict] = []
            if status in ("succeeded", "completed"):
                try:
                    final_evals = _fetch_all_finetune_evals(args.base_url, wf_id, provider_job_id)
                    ep_results = final_evals.get("results", [])
                    if ep_results:
                        ep_scores: dict[str, list[float]] = {}
                        for r in ep_results:
                            for ek, item in _iter_epoch_candidates(r.get("epochs", {})):
                                s = item.get("score")
                                if s is not None:
                                    ep_scores.setdefault(ek, []).append(s)
                        if ep_scores:
                            print(f"\n── Final Progression Table ──", file=sys.stderr)
                            for ek in sorted(ep_scores.keys(), key=_epoch_sort_key):
                                sc = ep_scores[ek]
                                avg_s = sum(sc) / len(sc)
                                perf = sum(1 for s in sc if s >= 0.99) / len(sc)
                                print(f"  Epoch {ek}: avg={avg_s:.3f}, perfect={perf:.0%} ({len(sc)} scores)", file=sys.stderr)
                                epoch_progression.append({
                                    "epoch": ek,
                                    "avg": round(avg_s, 4),
                                    "perfect_rate": round(perf, 3),
                                    "scores_count": len(sc),
                                })
                            best_ep = max(ep_scores.items(), key=lambda x: sum(x[1]) / len(x[1]))
                            best_avg = sum(best_ep[1]) / len(best_ep[1])
                            print(f"  Best: epoch {best_ep[0]} (avg={best_avg:.3f})", file=sys.stderr)
                except (SystemExit, Exception):
                    pass

            # Auto-journal: training completed (with epoch progression)
            train_summary = f"Training {status}: {metadata.get('base_model', '?')}"
            if epoch_progression:
                first = epoch_progression[0]
                last = epoch_progression[-1]
                best = max(epoch_progression, key=lambda x: x["avg"])
                train_summary += f". Progression: epoch {first['epoch']} avg={first['avg']:.3f} → epoch {last['epoch']} avg={last['avg']:.3f}. Best: epoch {best['epoch']} avg={best['avg']:.3f}."
            if metadata.get("early_stop_reason"):
                train_summary += f" Early-stopped: {metadata['early_stop_reason'][:80]}"
            if metadata.get("error_message"):
                train_summary += f" Error: {metadata['error_message'][:80]}"
            _auto_journal(
                project_dir=job_file.parent.parent,
                step="step_7e_training",
                action="training_completed",
                status=status,
                summary=train_summary,
                job_id=job_id,
                job_type="training",
                model=metadata.get("base_model"),
                results={
                    "fine_tuned_model": metadata.get("fine_tuned_model"),
                    "early_stop_reason": metadata.get("early_stop_reason"),
                    "error_message": metadata.get("error_message"),
                    "config": metadata.get("config", metadata.get("training_config", {})),
                    "epoch_progression": epoch_progression,
                    "best_epoch": max(epoch_progression, key=lambda x: x["avg"])["epoch"] if epoch_progression else None,
                },
            )

            if status in ("succeeded", "completed"):
                trained_eval_model = (
                    f"finetuned/{provider_job_id}"
                    if provider_job_id
                    else "finetuned/<provider_job_id>"
                )
                provider_job_note = (
                    ""
                    if provider_job_id
                    else (
                        "\n"
                        "      WARNING: provider_job_id was not found in the local training metadata. "
                        "Run sync-jobs or fetch the training job status, then replace <provider_job_id> before eval."
                    )
                )
                print(
                    f"\n⚠️  MANDATORY NEXT STEPS (do ALL of these in order):\n"
                    f"   1. Update execution-log.md with final progression table:\n"
                    f"      uv run ${{CLAUDE_SKILL_DIR}}/scripts/finetune.py log-step --project-dir finetune-project \\\n"
                    f"        --step step_7e_training --action training_completed --status completed \\\n"
                    f"        --summary \"Training completed: [final avg] vs [baseline avg]\" \\\n"
                    f"        --duration \"[total time]\" --agent training-monitor\n"
                    f"   2. Log training iteration:\n"
                    f"      uv run ${{CLAUDE_SKILL_DIR}}/scripts/finetune.py log-iteration \\\n"
                    f"        --project-dir finetune-project --phase training \\\n"
                    f"        --training-file {job_file} \\\n"
                    f"        --changes \"describe config + results\" --change-type baseline --verdict PASS\n"
                    f"   3. Run post-training eval:\n"
                    f"      uv run ${{CLAUDE_SKILL_DIR}}/scripts/finetune.py create-eval \\\n"
                    f"        --workflow-id $WORKFLOW_ID --model \"{trained_eval_model}\" --output-dir finetune-project/evaluations\n"
                    f"      NOTE: eval requires finetuned/<provider_job_id>; do not use raw fine_tuned_model or raw provider_job_id.{provider_job_note}\n"
                    f"   4. Compare trained vs base model per-record and decide:\n"
                    f"      DEPLOY (trained model meets requirements) / ITERATE (fix grader/data) / ESCALATE (report to user)\n"
                    f"      Log decision: log-step --action iteration_decision --summary \"[DEPLOY/ITERATE/ESCALATE]: [reason]\""
                )
            if status == "failed":
                sys.exit(1)
            if status == "cancelled":
                print("Job was cancelled. Partial metrics (if any) have been saved.", file=sys.stderr)
                sys.exit(2)
            return

        # Early stopping: completion clipping check on EVERY poll.
        # Clipping is detectable on the first metrics checkpoint (30s in) and
        # wastes 100% of GPU time if not caught. Medical-QA incident: 12h wasted
        # with 100% clipping at max_output_tokens=512.
        if early_stop and status == "running":
            clipping_info = _check_completion_clipping(args.base_url, wf_id, job_id)
            if clipping_info:
                severity = clipping_info["severity"]
                ratio = clipping_info["latest_clipped_ratio"]
                max_len = clipping_info.get("max_length")
                recommended = clipping_info.get("recommended_max_output_tokens")

                print(f"\n  ⚠ COMPLETION CLIPPING DETECTED ({severity.upper()})", file=sys.stderr)
                print(f"    {ratio:.0%} of completions truncated at max_output_tokens={int(max_len) if max_len else '?'}", file=sys.stderr)
                print(f"    Clipping history: {' → '.join(f'{r:.0%}' for r in clipping_info['ratios'])}", file=sys.stderr)

                term_len = clipping_info.get("mean_terminated_length")
                if term_len and term_len > 0:
                    print(f"    Natural completion length: ~{int(term_len)} tokens", file=sys.stderr)
                else:
                    print(f"    No completions terminate naturally — model can't finish in the token budget", file=sys.stderr)

                # ⚠ DO NOT recommend a token cap directly here. Three different
                # root causes (config too tight / grader drift / spec mismatch)
                # need three different fixes. Force the agent through the
                # diagnose-clipping CLI before any retry. See
                # training-metrics-guide.md §100% Completion Clipping.
                print(f"", file=sys.stderr)
                print(f"    ⚠ DO NOT reflex-raise max_output_tokens.", file=sys.stderr)
                print(f"    Clipping has 3 causes (config / grader drift / spec mismatch).", file=sys.stderr)
                print(f"    Raising the cap without diagnosis guarantees length collapse (GR3 arXiv:2603.10535).", file=sys.stderr)
                print(f"", file=sys.stderr)
                print(f"    → Run diagnosis BEFORE recreating training:", file=sys.stderr)
                print(f"        finetune.py diagnose-clipping \\", file=sys.stderr)
                print(f"          --job-file <this job file> \\", file=sys.stderr)
                print(f"          --training-file finetune-project/training.jsonl \\", file=sys.stderr)
                print(f"          --objective-target-tokens <user spec>", file=sys.stderr)
                print(f"", file=sys.stderr)
                print(f"    Then apply the diagnosis-recommended fix:", file=sys.stderr)
                print(f"      A. Config too tight  → raise max_output_tokens", file=sys.stderr)
                print(f"      B. Grader drift      → add DRPO-safe conciseness penalty to grader", file=sys.stderr)
                print(f"      C. Spec mismatch     → regenerate GT or update objective", file=sys.stderr)
                print(f"", file=sys.stderr)
                print(f"    Ref: SKILL.md §7f 'When training is auto-cancelled'", file=sys.stderr)
                print(f"         training-metrics-guide.md §100% Completion Clipping", file=sys.stderr)
                print(f"    → Auto-cancelling to save compute. Use --no-early-stop to override.", file=sys.stderr)

                try:
                    _api("POST", f"{args.base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/cancel")
                    metadata["status"] = "cancelled"
                    metadata["early_stop_reason"] = (
                        f"Completion clipping ({severity}): {ratio:.0%} of completions truncated "
                        f"at max_output_tokens={int(max_len) if max_len else '?'}. "
                        f"DO NOT reflex-raise max_output_tokens. Run `finetune.py diagnose-clipping` "
                        f"to identify root cause (config / grader drift / spec mismatch), then apply "
                        f"the diagnosis-recommended fix. "
                        f"Ref: SKILL.md §7f, training-metrics-guide.md §100% Completion Clipping"
                    )
                    metadata["clipping_info"] = {
                        "severity": severity,
                        "latest_clipped_ratio": ratio,
                        "max_length": max_len,
                        "mean_terminated_length": term_len,
                        "ratios": clipping_info.get("ratios", []),
                        "recommended_action": "run diagnose-clipping before retry",
                    }
                    job_file.write_text(json.dumps(metadata, indent=2))
                    print(f"  Training cancelled (completion clipping).")
                except SystemExit:
                    print(f"  Warning: Cancel request failed — training continues", file=sys.stderr)

                sys.exit(2)

        # Early stopping: multi-signal check every 5 min.
        # Ref: Empirical testing showed 7+ hours wasted on plateaued training.
        #
        # Signals checked (based on GRPO/RFT research):
        # 1. Score plateau via EMA slope (arXiv:2507.18014 — 3-phase training)
        # 2. Score degradation (negative EMA slope — overfitting/collapse)
        # 3. Length exploitation (Dr. GRPO, arXiv:2503.20783 — reward flat + length growing)
        if early_stop and status == "running" and (elapsed - last_plateau_check) > 300:
            last_plateau_check = elapsed

            # ── Auto progression table (every 5 min) ──
            # Fetches epoch evals and prints a progression summary so the
            # agent (and execution log) can track learning trajectory.
            try:
                epoch_evals = _fetch_all_finetune_evals(args.base_url, wf_id, provider_job_id)
                ep_results = epoch_evals.get("results", [])
                if ep_results:
                    ep_scores: dict[str, list[float]] = {}
                    for r in ep_results:
                        for ek, item in _iter_epoch_candidates(r.get("epochs", {})):
                            s = item.get("score")
                            if s is not None:
                                ep_scores.setdefault(ek, []).append(s)
                    if ep_scores:
                        print(f"\n  ── Progression Table (auto, {int(elapsed)}s) ──", file=sys.stderr)
                        for ek in sorted(ep_scores.keys(), key=_epoch_sort_key):
                            sc = ep_scores[ek]
                            avg_s = sum(sc) / len(sc)
                            perf = sum(1 for s in sc if s >= 0.99) / len(sc)
                            print(f"    Epoch {ek}: avg={avg_s:.3f}, perfect={perf:.0%} ({len(sc)} scores)", file=sys.stderr)
            except (SystemExit, Exception):
                pass  # Non-fatal — progression table is informational

            # Signal 1 & 2: Score plateau or degradation
            plateau = _check_score_plateau(
                args.base_url, wf_id, job_id,
                patience=adaptive_patience,
                min_warmup_epochs=adaptive_warmup,
                provider_job_id=provider_job_id,
            )
            if plateau:
                signal = plateau.get("signal", "plateau")
                quality = plateau.get("quality", "unknown")
                action = plateau.get("action", "")

                if signal == "degradation":
                    print(f"\n  ⚠ SCORE DEGRADATION DETECTED", file=sys.stderr)
                else:
                    print(f"\n  ⚠ SCORE PLATEAU DETECTED ({quality})", file=sys.stderr)

                print(f"    EMA slope: {plateau['ema_slope']:+.6f}/epoch (threshold: ±{plateau['slope_threshold']})", file=sys.stderr)
                print(f"    Scores: {' → '.join(f'{s:.3f}' for _, s in plateau['all_avgs'])}", file=sys.stderr)
                print(f"    EMA:    {' → '.join(f'{v:.3f}' for v in plateau['ema_values'])}", file=sys.stderr)
                print(f"    Best: epoch {plateau['best_epoch']} ({plateau['best_score']:.3f})", file=sys.stderr)
                print(f"    Assessment: {action}", file=sys.stderr)
                print(f"    → Auto-cancelling to save compute. Use --no-early-stop to override.", file=sys.stderr)

                # Cancel the job
                try:
                    _api("POST", f"{args.base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/cancel")
                    metadata["status"] = "cancelled"
                    metadata["early_stop_reason"] = (
                        f"{signal.title()}: EMA slope {plateau['ema_slope']:+.6f}/epoch "
                        f"across {plateau['patience']} evals (quality: {quality}). "
                        f"Best epoch: {plateau['best_epoch']} "
                        f"(score {plateau['best_score']:.3f}). {action}"
                    )
                    job_file.write_text(json.dumps(metadata, indent=2))
                    print(f"  Training cancelled (early stop). Best checkpoint: epoch {plateau['best_epoch']}")
                except SystemExit:
                    print(f"  Warning: Cancel request failed — training continues", file=sys.stderr)

                sys.exit(2)

            # Signal 3: Length exploitation (checked independently of score plateau)
            # Dr. GRPO (arXiv:2503.20783): GRPO's 1/|o_i| normalization can cause
            # responses to grow longer while reward stays flat — active degeneration
            # disguised as stability.
            length_info = _check_length_exploitation(args.base_url, wf_id, job_id)
            if length_info:
                print(f"\n  ⚠ LENGTH EXPLOITATION DETECTED", file=sys.stderr)
                print(f"    Avg length: {length_info['early_avg_length']:.0f} → {length_info['late_avg_length']:.0f} tokens (+{length_info['growth_pct']:.0f}%)", file=sys.stderr)
                print(f"    Ref: Dr. GRPO (arXiv:2503.20783) — length growth >30% with flat reward indicates degeneration", file=sys.stderr)
                print(f"    → Auto-cancelling. Use --no-early-stop to override.", file=sys.stderr)

                try:
                    _api("POST", f"{args.base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/cancel")
                    metadata["status"] = "cancelled"
                    metadata["early_stop_reason"] = (
                        f"Length exploitation: avg length grew "
                        f"{length_info['early_avg_length']:.0f} → {length_info['late_avg_length']:.0f} "
                        f"tokens (+{length_info['growth_pct']:.0f}%). "
                        f"Ref: Dr. GRPO (arXiv:2503.20783)"
                    )
                    job_file.write_text(json.dumps(metadata, indent=2))
                    print(f"  Training cancelled (length exploitation).")
                except SystemExit:
                    print(f"  Warning: Cancel request failed — training continues", file=sys.stderr)

                sys.exit(2)

        interval = _adaptive_interval(elapsed)
        time.sleep(interval)

    print(f"Timeout after {max_wait}s. Training still {status}.", file=sys.stderr)
    metadata["status"] = f"timeout ({status})"
    job_file.write_text(json.dumps(metadata, indent=2))
    sys.exit(1)


def cmd_search_knowledge(args: argparse.Namespace) -> None:
    """Semantic search over knowledge source parts for a workflow.

    Embeds the query phrase and returns top-k parts ranked by cosine similarity.
    Useful for verifying embeddings are ready and testing search quality.
    """
    resp = _api(
        "POST",
        f"{args.base_url}/finetune/workflows/{args.workflow_id}/knowledge/search",
        json={"phrase": args.phrase, "top_k": args.top_k},
    )
    matches = resp.get("matches", [])
    print(f"Found {len(matches)} matches:")
    for i, m in enumerate(matches):
        part = m.get("part", {})
        score = m.get("score", 0)
        title = part.get("title", "untitled")
        content_preview = part.get("content", "")[:120].replace("\n", " ")
        print(f"  [{i + 1}] score={score:.4f}  id={part.get('id', '')}  title={title}")
        print(f"       {content_preview}...")


def cmd_diagnose_clipping(args: argparse.Namespace) -> None:
    """Diagnose the root cause of completion clipping after auto-cancel.

    Three diagnoses are possible — only ONE is fixed by raising max_output_tokens.
    Raising the cap without diagnosing first guarantees length collapse
    (GR3 arXiv:2603.10535) and may train a model that violates the user's
    output-length spec.

      A. Config too tight   — gt_p95 > max_output_tokens (cap below natural length)
                              → Raise max_output_tokens to gt_p95 × 1.5

      B. Grader drift       — gt_p95 <= cap, but model mean_length >> gt_p95
                              → Add DRPO-safe conciseness penalty to grader,
                                re-eval, recreate training with SAME cap

      C. Spec mismatch      — gt_p95 >> objective_target_tokens
                              → Regenerate GT or update objective. Do NOT train.

    Reads the job file (for max_output_tokens + clipping metadata written by
    poll-training) and the training.jsonl (for ground-truth P95). The objective
    target token count must be passed by the agent.
    """
    job_file = Path(args.job_file)
    if not job_file.exists():
        print(f"ERROR: job file not found: {job_file}", file=sys.stderr)
        sys.exit(1)

    metadata = json.loads(job_file.read_text())
    clipping_info = metadata.get("clipping_info") or {}
    if not clipping_info:
        print(f"ERROR: no clipping_info in job file. Job was not cancelled for clipping.", file=sys.stderr)
        print(f"  early_stop_reason: {metadata.get('early_stop_reason', 'N/A')}", file=sys.stderr)
        sys.exit(1)

    max_output_tokens = (
        metadata.get("config", {}).get("max_output_tokens")
        or metadata.get("inference_params", {}).get("max_output_tokens")
        or clipping_info.get("max_length")
    )
    if not max_output_tokens:
        print(f"ERROR: cannot determine max_output_tokens from job file.", file=sys.stderr)
        sys.exit(1)
    max_output_tokens = int(max_output_tokens)

    mean_term_len = clipping_info.get("mean_terminated_length")
    clipped_ratio = clipping_info.get("latest_clipped_ratio", 0.0)
    severity = clipping_info.get("severity", "unknown")

    # Compute GT P95 from training.jsonl using the same heuristic as
    # _estimate_recommended_max_tokens (4 chars/token).
    training_file = Path(args.training_file)
    if not training_file.exists():
        print(f"ERROR: training file not found: {training_file}", file=sys.stderr)
        sys.exit(1)

    gt_lengths: list[int] = []
    with training_file.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            gt = rec.get("ground_truth", "")
            if gt and gt.strip():
                gt_lengths.append(max(1, len(gt.strip()) // 4))

    if not gt_lengths:
        print(f"ERROR: no ground_truth fields found in {training_file}", file=sys.stderr)
        print(f"  Cannot diagnose without GT P95. Add ground_truth to records.", file=sys.stderr)
        sys.exit(1)

    sorted_gt = sorted(gt_lengths)
    gt_p95 = sorted_gt[min(len(sorted_gt) - 1, int(len(sorted_gt) * 0.95))]
    gt_max = sorted_gt[-1]
    gt_median = sorted_gt[len(sorted_gt) // 2]

    objective_target = args.objective_target_tokens

    # ── Diagnosis logic ──
    # Order matters: spec mismatch is checked first because if the GT itself
    # violates the user's spec, neither raising the cap nor fixing the grader
    # is correct — the data is wrong.
    diagnosis = None
    fix = None
    recommended_max_tokens = None

    if objective_target and gt_p95 > objective_target * 2.0:
        # Diagnosis C: GT P95 is more than 2× the user's stated target.
        # The training data violates the spec. Raising the cap would train a
        # model that ignores the user's output-length requirement.
        diagnosis = "C_spec_mismatch"
        fix = (
            f"Spec mismatch: GT P95 ({gt_p95} tok) is {gt_p95/objective_target:.1f}× the objective "
            f"target ({objective_target} tok). The training data violates the user's spec.\n"
            f"  → Either regenerate ground truth to match {objective_target} tokens, OR update the "
            f"objective to reflect actual GT length. Do NOT recreate training until resolved."
        )
    elif gt_p95 > max_output_tokens:
        # Diagnosis A: cap is genuinely below natural answer length.
        diagnosis = "A_config_too_tight"
        recommended_max_tokens = int(gt_p95 * 1.5)
        fix = (
            f"Config too tight: GT P95 ({gt_p95} tok) > max_output_tokens ({max_output_tokens} tok).\n"
            f"  → Raise max_output_tokens to {recommended_max_tokens} (gt_p95 × 1.5) and recreate training.\n"
            f"  → Use --inference-params max_output_tokens={recommended_max_tokens} on create-training."
        )
    else:
        # Diagnosis B: cap is sufficient for the GT, but the model is generating
        # longer than the GT. The grader is rewarding verbosity.
        ratio_str = f"{(mean_term_len/gt_p95):.1f}× GT P95" if mean_term_len else "unknown"
        diagnosis = "B_grader_drift"
        fix = (
            f"Grader drift: GT P95 ({gt_p95} tok) <= max_output_tokens ({max_output_tokens} tok), "
            f"but model is verbose (natural length: {ratio_str}).\n"
            f"  → The grader is rewarding verbosity. Do NOT raise max_output_tokens.\n"
            f"  → Edit grader: add a DRPO-safe conciseness penalty (multiplicative, applied only "
            f"to wrong/partial answers). See grader-writing.md §DRPO Anti-Pattern.\n"
            f"  → Re-eval the model with the updated grader, then recreate training with the "
            f"SAME max_output_tokens ({max_output_tokens})."
        )

    result = {
        "diagnosis": diagnosis,
        "severity": severity,
        "clipped_ratio": clipped_ratio,
        "max_output_tokens": max_output_tokens,
        "mean_terminated_length": mean_term_len,
        "gt_token_stats": {
            "p95": gt_p95,
            "max": gt_max,
            "median": gt_median,
            "n_records": len(gt_lengths),
        },
        "objective_target_tokens": objective_target,
        "recommended_max_output_tokens": recommended_max_tokens,
        "fix": fix,
    }

    if args.json:
        print(json.dumps(result, indent=2))
        return

    # Human-readable output
    print(f"")
    print(f"═══════════════════════════════════════════════════════════")
    print(f"  Completion Clipping Diagnosis")
    print(f"═══════════════════════════════════════════════════════════")
    print(f"")
    print(f"  Severity:              {severity}")
    print(f"  Clipped ratio:         {clipped_ratio:.0%}")
    print(f"  max_output_tokens:     {max_output_tokens}")
    print(f"  Mean terminated len:   {mean_term_len if mean_term_len else 'N/A (nothing terminated)'}")
    print(f"")
    print(f"  GT token stats (4 chars/tok heuristic):")
    print(f"    P95:    {gt_p95}")
    print(f"    Max:    {gt_max}")
    print(f"    Median: {gt_median}")
    print(f"    Count:  {len(gt_lengths)}")
    if objective_target:
        print(f"  Objective target:      {objective_target} tokens")
    else:
        print(f"  Objective target:      (not provided — pass --objective-target-tokens for spec-mismatch check)")
    print(f"")
    print(f"  ═══ DIAGNOSIS: {diagnosis} ═══")
    print(f"")
    for line in fix.splitlines():
        print(f"  {line}")
    print(f"")
    print(f"  Ref: training-metrics-guide.md §100% Completion Clipping")
    print(f"       SKILL.md §7f 'When training is auto-cancelled'")
    print(f"")


def cmd_cancel_training(args: argparse.Namespace) -> None:
    """Cancel a running training job.

    Calls POST /finetune/workflows/{workflow_id}/jobs/{job_id}/cancel
    and updates the local job tracking file if one exists.
    """
    wf_id = args.workflow_id
    job_id = args.job_id

    print(f"Cancelling training job {job_id} in workflow {wf_id}...")
    _api(
        "POST",
        f"{args.base_url}/finetune/workflows/{wf_id}/jobs/{job_id}/cancel",
    )
    print(f"Cancel request sent for job {job_id}.")

    # Update local tracking file if provided
    if args.file:
        job_file = Path(args.file)
        if job_file.exists():
            metadata = json.loads(job_file.read_text())
            metadata["status"] = "cancelled"
            job_file.write_text(json.dumps(metadata, indent=2))
            print(f"Updated local file: {job_file}")

    _auto_journal(
        project_dir=Path("finetune-project"),
        step="step_7e_training",
        action="cancel_training",
        status="cancelled",
        summary=f"Training cancelled: job {job_id}",
        job_id=job_id,
        job_type="training",
        workflow_id=wf_id,
    )


def cmd_cancel_eval(args: argparse.Namespace) -> None:
    """Cancel a running evaluation.

    Calls POST /finetune/workflows/{workflow_id}/jobs/{eval_id}/cancel
    and updates the local eval tracking file if one exists.
    """
    wf_id = args.workflow_id
    eval_id = args.eval_id

    print(f"Cancelling eval {eval_id} in workflow {wf_id}...")

    try:
        _api(
            "POST",
            f"{args.base_url}/finetune/workflows/{wf_id}/jobs/{eval_id}/cancel",
        )
        print(f"Cancel request sent for eval {eval_id}.")
    except SystemExit:
        print(
            "  Warning: Could not cancel eval via gateway. Updating local file only.",
            file=sys.stderr,
        )

    if args.file:
        eval_file = Path(args.file)
        if eval_file.exists():
            metadata = json.loads(eval_file.read_text())
            metadata["status"] = "cancelled"
            eval_file.write_text(json.dumps(metadata, indent=2))
            print(f"Updated local file: {eval_file}")

    _auto_journal(
        project_dir=Path("finetune-project"),
        step="step_7_eval",
        action="cancel_eval",
        status="cancelled",
        summary=f"Eval cancelled: {eval_id}",
        job_id=eval_id,
        job_type="eval",
        workflow_id=wf_id,
    )


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

    jobs = _api(
        "GET",
        f"{args.base_url}/finetune/workflows/{wf_id}/jobs?include_metrics=true",
    )
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
        eval_list = eval_resp if isinstance(eval_resp, list) else eval_resp.get("jobs", [])
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
    sources = existing if isinstance(existing, list) else existing.get("knowledge_sources", existing.get("sources", []))

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


def cmd_update_part_relevance(args: argparse.Namespace) -> None:
    """Update knowledge source parts with relevance labels from all-parts-index.json.

    Reads the parts index, collects parts with `relevant` field set (true/false),
    groups by source document, and PATCHes extraction_metadata on the gateway.
    """
    index_path = Path(args.parts_index)
    if not index_path.exists():
        print(f"Error: Parts index not found: {index_path}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(index_path.read_text())
    parts = data.get("parts", data) if isinstance(data, dict) else data

    # Group parts by source_doc, only those with relevant field set.
    # Accept both `source_doc` (canonical) and `source_document` (alias).
    by_source: dict = {}
    for part in parts:
        rel = part.get("relevant")
        if rel is None:
            continue
        source_doc = part.get("source_doc") or part.get("source_document") or "unknown"
        by_source.setdefault(source_doc, []).append(part)

    if not by_source:
        print("No parts with relevance labels found. Nothing to update.")
        return

    # Resolve source IDs from gateway
    wf_url = f"{args.base_url}/finetune/workflows/{args.workflow_id}/knowledge"
    sources_resp = _api("GET", wf_url)
    sources_list = sources_resp.get("knowledge_sources", [])

    total_updated = 0
    def _normalize_source_name(name: object) -> str:
        """Normalize source name for matching: lowercase, strip extension, strip path."""
        import re
        if not name or not isinstance(name, str):
            return ""
        name = name.strip().lower()
        name = name.rsplit("/", 1)[-1]  # strip path
        name = re.sub(r"\.(pdf|docx?|txt|md|html?)$", "", name)  # strip extension
        return name

    for source_doc, labeled_parts in by_source.items():
        # Find the gateway source by name match (fuzzy: case-insensitive, extension-stripped)
        ks_id = None
        normalized_doc = _normalize_source_name(source_doc)
        for src in sources_list:
            src_name = _normalize_source_name(src.get("name", ""))
            src_ref = _normalize_source_name(src.get("reference_id", ""))
            if normalized_doc == src_name or normalized_doc == src_ref:
                ks_id = src["id"]
                break

        # Fallback: if only 1 source exists on the gateway, use it.
        # This handles the case where the agent's index file has "unknown" or
        # mismatched source_doc but there's only one possible target.
        if not ks_id and len(sources_list) == 1:
            ks_id = sources_list[0]["id"]
            print(f"  Note: No exact match for '{source_doc}', using only available source '{sources_list[0].get('name','?')}'")

        if not ks_id:
            print(f"  Warning: No gateway source found for '{source_doc}', skipping {len(labeled_parts)} parts")
            print(f"    Available sources: {[s.get('name','?') for s in sources_list]}")
            continue

        # Build batch update payload, preserving existing extraction_metadata from gateway
        gateway_parts = {
            p.get("reference_id", p["id"]): p
            for p in _api("GET", f"{wf_url}/{ks_id}/parts").get("parts", [])
        }

        updates = []
        for part in labeled_parts:
            # Start with existing gateway metadata (preserves bboxes, etc.)
            gw_part = gateway_parts.get(part["id"], {})
            existing_meta = dict(gw_part.get("extraction_metadata") or {})
            if "pages" in part:
                existing_meta["pages"] = part["pages"]
            existing_meta["relevant"] = part["relevant"]

            updates.append({
                "part_identifier": part["id"],
                "extraction_metadata": existing_meta,
            })

        result = _api("PATCH", f"{wf_url}/{ks_id}/parts", json=updates)
        updated = result.get("updated", 0)
        total_updated += updated
        relevant_count = sum(1 for p in labeled_parts if p.get("relevant"))
        print(f"  {source_doc}: {updated} parts updated ({relevant_count} relevant, {len(labeled_parts) - relevant_count} irrelevant)")

    print(f"\nTotal: {total_updated} parts updated with relevance labels.")


def _compact_cell(value, max_chars: int = 160) -> str:
    """Render cell-safe text for table output."""
    if value is None:
        return ""
    text = str(value).replace("\n", "\\n").replace("\r", "")
    if len(text) > max_chars:
        return text[: max_chars - 3] + "..."
    return text


def cmd_difficulty_probe(args: argparse.Namespace) -> None:
    """Run difficulty distribution probe on eval results.

    Analyzes K=1 eval scores to predict K=8 zero-variance rates,
    classify prompts by difficulty, and assess grader granularity.
    Tells you whether GRPO training will produce learning signal.

    Research: DOTS+RR (arXiv:2506.05316), Hard Examples (arXiv:2508.14094),
    No Prompt Left Behind (arXiv:2509.21880), RGR-GRPO (arXiv:2511.12344).

    Exit codes: 0 = PASS, 1 = FAIL, 2 = WARN
    """
    import subprocess

    script_dir = Path(__file__).parent
    script = script_dir / "probe_difficulty.py"
    if not script.exists():
        print(f"Error: probe_difficulty.py not found at {script}", file=sys.stderr)
        sys.exit(1)

    # Always save JSON report to temp file for reliable journaling,
    # regardless of whether agent passed --json or not
    import tempfile
    journal_json = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
    journal_json.close()

    cmd = [sys.executable, str(script), args.file, "--save", journal_json.name]
    if args.k:
        cmd.extend(["--k", str(args.k)])
    if args.output_json:
        cmd.append("--json")
    if args.save:
        cmd.extend(["--save", args.save])
    if args.compact:
        cmd.append("--compact")

    result = subprocess.run(cmd, capture_output=True, text=True)

    # Print the output (so agent sees it)
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    # Auto-journal: read structured data from saved JSON
    verdict = "pass" if result.returncode == 0 else "warn" if result.returncode == 2 else "fail"
    probe_results = {}
    try:
        probe_data = json.loads(Path(journal_json.name).read_text())
        dd = probe_data.get("difficulty_distribution", {})
        ss = probe_data.get("signal_strength", {})
        probe_results = {
            "learnable_frac": dd.get("learnable", {}).get("frac"),
            "trivial_frac": dd.get("trivial", {}).get("frac"),
            "dead_frac": dd.get("dead", {}).get("frac"),
            "hard_frac": dd.get("hard", {}).get("frac"),
            "easy_frac": dd.get("easy", {}).get("frac"),
            "effective_frac": ss.get("effective_frac"),
            "predicted_zero_var": ss.get("avg_predicted_zero_var"),
        }
    except (json.JSONDecodeError, TypeError, FileNotFoundError):
        pass
    finally:
        Path(journal_json.name).unlink(missing_ok=True)

    def _fmt_pct(v: object) -> str:
        return f"{v:.0%}" if isinstance(v, (int, float)) else "?"

    _auto_journal(
        project_dir=Path(args.file).parent.parent,
        step="step_7c_difficulty",
        action="difficulty_probe",
        status=verdict,
        summary=f"Difficulty probe: {verdict.upper()}. " + (
            f"learnable={_fmt_pct(probe_results.get('learnable_frac'))}, "
            f"trivial={_fmt_pct(probe_results.get('trivial_frac'))}, "
            f"dead={_fmt_pct(probe_results.get('dead_frac'))}, "
            f"effective={_fmt_pct(probe_results.get('effective_frac'))}, "
            f"predicted_zero_var={_fmt_pct(probe_results.get('predicted_zero_var'))}"
            if probe_results else "See output for details."
        ),
        results=probe_results if probe_results else None,
    )

    sys.exit(result.returncode)


def cmd_data_quality_gate(args: argparse.Namespace) -> None:
    """Run pre-eval data quality gate on training data.

    Validates data quality BEFORE spending on evaluation or training.
    Delegates to data_quality_gate.py for the actual checks.

    Gates (ordered by cost):
      1. structural           (free)  — dedup, length, format, topic balance
      2. diversity            (free)  — trigram-based diversity & redundancy
      3. completion_length    (free)  — estimates if max_output_tokens is sufficient
      4. ground_truth_quality ($$)    — LLM scores GT specificity
      5. alignment            ($$)    — LLM checks prompt-GT alignment

    Exit codes: 0 = PASS, 1 = FAIL, 2 = WARN
    """
    import subprocess

    script_dir = Path(__file__).parent
    script = script_dir / "data_quality_gate.py"
    if not script.exists():
        print(f"Error: data_quality_gate.py not found at {script}", file=sys.stderr)
        sys.exit(1)

    # Always save JSON report to temp file for reliable journaling
    import tempfile
    journal_json = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
    journal_json.close()

    cmd = [sys.executable, str(script), args.file, "--save", journal_json.name]

    if args.topics:
        cmd.extend(["--topics", args.topics])
    if args.parts:
        cmd.extend(["--parts", args.parts])
    if args.gate:
        cmd.extend(["--gate", args.gate])
    if args.llm_gates:
        cmd.append("--llm-gates")
    if args.all_gates:
        cmd.append("--all-gates")
    if args.sample:
        cmd.extend(["--sample", str(args.sample)])
    if args.gateway_url:
        cmd.extend(["--gateway-url", args.gateway_url])
    if args.max_output_tokens:
        cmd.extend(["--max-output-tokens", str(args.max_output_tokens)])
    if args.output_json:
        cmd.append("--json")
    if args.save:
        cmd.extend(["--save", args.save])

    result = subprocess.run(cmd, capture_output=True, text=True)

    # Print output (so agent sees it)
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    # Auto-journal: data quality gate result
    verdict = "pass" if result.returncode == 0 else "warn" if result.returncode == 2 else "fail"
    gate_results: dict = {}
    try:
        report = json.loads(Path(journal_json.name).read_text())
        gates = report.get("gates", {})
        gate_summaries = []
        for gate_name, gate_data in gates.items():
            g_verdict = gate_data.get("verdict", "?")
            n_issues = len(gate_data.get("issues", []))
            gate_summaries.append(f"{gate_name}:{g_verdict}")
            if n_issues > 0:
                gate_summaries[-1] += f"({n_issues} issues)"

        # Extract key stats for journal
        structural = gates.get("structural", {}).get("stats", {})
        diversity = gates.get("diversity", {}).get("stats", {})
        gate_results = {
            "verdict": report.get("verdict", verdict.upper()),
            "gates": {g: gates[g].get("verdict") for g in gates},
            "record_count": structural.get("record_count"),
            "topic_count": structural.get("topic_count"),
            "near_duplicates": diversity.get("near_duplicate_frac"),
            "avg_pairwise_distance": diversity.get("avg_pairwise_distance"),
            "unique_gt_values": diversity.get("unique_gt_values"),
            "gt_uniqueness_ratio": diversity.get("gt_uniqueness_ratio"),
            "dominant_labels": diversity.get("dominant_labels"),
        }
        # Collect all issue messages for summary
        all_issues = []
        for gate_data in gates.values():
            for issue in gate_data.get("issues", []):
                all_issues.append(issue.get("check", "unknown"))
    except (json.JSONDecodeError, TypeError, FileNotFoundError):
        gate_summaries = []
        all_issues = []
    finally:
        Path(journal_json.name).unlink(missing_ok=True)

    summary_parts = [f"Data quality gate: {verdict.upper()}."]
    if gate_summaries:
        summary_parts.append(" ".join(gate_summaries) + ".")
    if all_issues:
        summary_parts.append(f"Issues: {', '.join(all_issues[:5])}")

    _auto_journal(
        project_dir=Path(args.file).resolve().parent,
        step="step_5_5_validate",
        action="data_quality_gate",
        status=verdict,
        summary=" ".join(summary_parts),
        results=gate_results if gate_results else None,
    )

    sys.exit(result.returncode)


def cmd_test_grader(args: argparse.Namespace) -> None:
    """Adversarial grader test — feeds deliberately wrong answers to detect leniency.

    LLM-as-judge graders have 35-66% false positive rates under adversarial
    conditions (arXiv:2510.00915). This test catches leniency BEFORE spending
    45+ min on evaluation. If wrong answers score > 0.40, the grader is too
    lenient for GRPO — fix it before proceeding.

    How it works:
    1. Reads sample records from training.jsonl
    2. For each: generates a deliberately wrong answer via LLM
    3. Scores the wrong answer through the grader (dry_run_grader.py)
    4. Reports: any wrong answer scoring > 0.40 = grader leniency detected

    Usage:
      finetune.py test-grader --workflow-id WF --training-file training.jsonl --samples 10
    """
    import requests

    training_file = Path(args.training_file)
    if not training_file.exists():
        print(f"Error: Training file not found: {training_file}", file=sys.stderr)
        sys.exit(1)

    # Load sample records
    records = []
    with open(training_file) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    if not records:
        print("Error: No records in training file", file=sys.stderr)
        sys.exit(1)

    # Sample evenly across records
    import random
    random.seed(42)
    sample_size = min(args.samples, len(records))
    sample = random.sample(records, sample_size)

    print(f"── Adversarial Grader Test ──")
    print(f"Testing {sample_size} records with deliberately wrong answers...")
    print(f"Threshold: wrong answers must score < 0.40 (grader is strict enough)")
    print()

    gateway_url = args.base_url
    lenient_count = 0
    tested = 0
    results_list = []

    for record in sample:
        messages = record.get("messages", [])
        gt = record.get("ground_truth", "")
        rid = record.get("id", "?")

        system_msg = ""
        user_msg = ""
        for m in messages:
            if m.get("role") == "system":
                system_msg = m.get("content", "")
            elif m.get("role") == "user":
                user_msg = m.get("content", "")

        if not user_msg or not gt:
            continue

        # Generate a wrong answer via LLM
        try:
            wrong_resp = requests.post(
                f"{gateway_url}/v1/chat/completions",
                json={
                    "model": "gpt-4.1-mini",
                    "messages": [
                        {"role": "system", "content": "Generate a WRONG answer that looks plausible but is incorrect."},
                        {"role": "user", "content": (
                            f"Task: {system_msg[:200]}\n"
                            f"Question: {user_msg[:200]}\n"
                            f"Correct answer: {gt}\n\n"
                            f"Generate a WRONG answer that:\n"
                            f"1. Has the same format as the correct answer\n"
                            f"2. Sounds plausible\n"
                            f"3. Is factually INCORRECT (different from '{gt}')\n"
                            f"Return ONLY the wrong answer, nothing else."
                        )},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 200,
                },
                timeout=30,
            )
            wrong_resp.raise_for_status()
            wrong_answer = wrong_resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            print(f"  Skip {rid}: could not generate wrong answer ({e})", file=sys.stderr)
            continue

        # Score the wrong answer through the grader
        test_row = {
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": wrong_answer},
            ],
            "ground_truth": gt,
        }

        try:
            score_resp = requests.post(
                f"{gateway_url}/finetune/workflows/{args.workflow_id}/evaluate",
                json={"row": test_row},
                timeout=30,
            )
            score_resp.raise_for_status()
            score_data = score_resp.json()
            score = score_data.get("score", score_data.get("result", {}).get("score", 0))
            reason = score_data.get("reason", score_data.get("result", {}).get("reason", ""))
        except Exception:
            # Fallback: use dry_run_grader.py
            try:
                import subprocess
                script_dir = Path(__file__).parent
                grader_script = script_dir / "dry_run_grader.py"
                cmd_result = subprocess.run(
                    [sys.executable, str(grader_script),
                     "--workflow-id", args.workflow_id,
                     "--script", args.grader_file or "finetune-project/grader.js",
                     "--row", json.dumps(test_row)],
                    capture_output=True, text=True, timeout=30,
                )
                # Parse score from output
                for out_line in cmd_result.stdout.split("\n"):
                    if "score" in out_line.lower():
                        import re
                        m = re.search(r'"score":\s*([\d.]+)', out_line)
                        if m:
                            score = float(m.group(1))
                            reason = out_line[:100]
                            break
                else:
                    continue
            except Exception:
                continue

        tested += 1
        is_lenient = score > 0.40
        if is_lenient:
            lenient_count += 1

        flag = "✗ LENIENT" if is_lenient else "✓ strict"
        print(f"  {flag} [{rid}] wrong=\"{wrong_answer[:50]}\" score={score:.2f} (GT=\"{gt}\")")
        results_list.append({
            "record_id": rid,
            "wrong_answer": wrong_answer[:100],
            "ground_truth": gt,
            "score": score,
            "is_lenient": is_lenient,
        })

    # ─── Deterministic adversarial tests (DO NOT rely on LLM-generated wrong answers) ───
    # These test specific grader bugs we've seen before:
    # 1. Garbage response for GT=none → should score LOW (not treated as "correct none")
    # 2. Garbage response for GT=real → should score LOW (not treated as correct)
    # 3. Response that copies the input → should score LOW
    deterministic_tests = []

    # Find a record with GT=none and one with GT=real
    none_record = next((r for r in records if (r.get("ground_truth", "") or "").strip().lower() in ("none", "")), None)
    real_record = next((r for r in records if (r.get("ground_truth", "") or "").strip().lower() not in ("none", "")), None)

    if none_record:
        none_user = next((m["content"] for m in none_record.get("messages", []) if m.get("role") == "user"), "")
        none_system = next((m["content"] for m in none_record.get("messages", []) if m.get("role") == "system"), "")
        deterministic_tests.append({
            "name": "garbage_for_gt_none",
            "description": "Garbage response when GT=none (catches 'no labels = none' bug)",
            "system": none_system, "user": none_user, "gt": "none",
            "wrong": "sugarmix, rice, misc, unknown stuff, blah blah",
        })
        deterministic_tests.append({
            "name": "input_echo_for_gt_none",
            "description": "Response echoes input (should not be treated as 'none')",
            "system": none_system, "user": none_user, "gt": "none",
            "wrong": none_user[:100],
        })

    if real_record:
        real_user = next((m["content"] for m in real_record.get("messages", []) if m.get("role") == "user"), "")
        real_system = next((m["content"] for m in real_record.get("messages", []) if m.get("role") == "system"), "")
        real_gt = real_record.get("ground_truth", "")
        deterministic_tests.append({
            "name": "garbage_for_gt_real",
            "description": "Garbage response when GT has labels",
            "system": real_system, "user": real_user, "gt": real_gt,
            "wrong": "random words, unknown stuff, garbage",
        })
        deterministic_tests.append({
            "name": "empty_for_gt_real",
            "description": "Empty response when GT has labels",
            "system": real_system, "user": real_user, "gt": real_gt,
            "wrong": "",
        })

    # Run deterministic tests
    print(f"\n── Deterministic Adversarial Tests ──")
    det_failed = []
    for test in deterministic_tests:
        test_row = {
            "messages": [
                {"role": "system", "content": test["system"]},
                {"role": "user", "content": test["user"]},
                {"role": "assistant", "content": test["wrong"]},
            ],
            "ground_truth": test["gt"],
        }
        try:
            score_resp = requests.post(
                f"{gateway_url}/finetune/workflows/{args.workflow_id}/evaluate",
                json={"row": test_row},
                timeout=30,
            )
            score_resp.raise_for_status()
            score_data = score_resp.json()
            score = score_data.get("score", score_data.get("result", {}).get("score", 0))
            reason = score_data.get("reason", score_data.get("result", {}).get("reason", ""))
        except Exception:
            # Fallback: use dry_run_grader.py (the /evaluate endpoint is cloud-only
            # and may not exist on local gateway)
            try:
                import subprocess
                script_dir = Path(__file__).parent
                grader_script = script_dir / "dry_run_grader.py"
                cmd_result = subprocess.run(
                    [sys.executable, str(grader_script),
                     "--workflow-id", args.workflow_id,
                     "--script", getattr(args, "grader_file", None) or "finetune-project/grader.js",
                     "--row", json.dumps(test_row)],
                    capture_output=True, text=True, timeout=30,
                )
                if cmd_result.returncode == 0:
                    for out_line in cmd_result.stdout.strip().splitlines():
                        if "score" in out_line.lower():
                            import re as _re
                            m = _re.search(r"score[=:]\s*([\d.]+)", out_line)
                            if m:
                                score = float(m.group(1))
                                reason = out_line
                                break
                    else:
                        score = 0.0
                        reason = cmd_result.stdout[:200]
                else:
                    print(f"  ✗ SKIP [{test['name']}]: dry_run_grader fallback failed", file=sys.stderr)
                    continue
            except Exception as e2:
                print(f"  ✗ SKIP [{test['name']}]: {e2}", file=sys.stderr)
                continue

        is_lenient = score > 0.40
        flag = "✗ LENIENT" if is_lenient else "✓ strict"
        print(f"  {flag} [{test['name']}] score={score:.2f} — {test['description']}")
        print(f"           wrong=\"{test['wrong'][:60]}\" gt=\"{test['gt']}\"")
        print(f"           grader: {reason[:120]}")
        if is_lenient:
            lenient_count += 1
            det_failed.append(test["name"])
        tested += 1

    # FAIL LOUDLY if nothing was tested
    if tested == 0:
        print(f"\n✗ TEST-GRADER FAILED: 0 records tested. This is a hard failure — not a pass.", file=sys.stderr)
        print(f"  Check gateway /evaluate endpoint, grader upload, and training records.", file=sys.stderr)
        _auto_journal(
            project_dir=training_file.resolve().parent,
            step="step_5_grader",
            action="adversarial_grader_test",
            status="fail",
            summary="Adversarial grader test FAILED: 0 records could be tested. Check gateway/evaluate endpoint and grader.",
            workflow_id=args.workflow_id,
        )
        sys.exit(1)

    # Summary
    print(f"\n── Results ──")
    print(f"  Tested: {tested}, Lenient: {lenient_count}, Strict: {tested - lenient_count}")

    if lenient_count > 0:
        pct = lenient_count / tested * 100
        print(f"  ⚠ GRADER LENIENCY DETECTED: {pct:.0f}% of wrong answers scored > 0.40")
        print(f"  Fix the grader BEFORE running eval. Wrong answers must score < 0.40.")
        print(f"  Research: arXiv:2510.00915 — LLM judges have 35-66% FP rates by default.")
        if det_failed:
            print(f"  Failed deterministic tests: {', '.join(det_failed)}")
        verdict = "fail"
    else:
        print(f"  ✓ Grader is strict — all wrong answers scored < 0.40")
        print(f"  High trivial% (if observed at eval) is a data difficulty issue, not grader leniency.")
        verdict = "pass"

    # Auto-journal
    _auto_journal(
        project_dir=training_file.resolve().parent,
        step="step_5_grader",
        action="adversarial_grader_test",
        status=verdict,
        summary=f"Adversarial grader test: {tested} tested, {lenient_count} lenient (>{0.40}). "
                + ("FIX GRADER before eval." if lenient_count > 0 else "Grader is strict."),
        results={
            "tested": tested,
            "lenient_count": lenient_count,
            "lenient_pct": round(lenient_count / max(tested, 1), 3),
            "threshold": 0.40,
            "details": results_list[:10],
        },
        workflow_id=args.workflow_id,
    )

    sys.exit(1 if lenient_count > 0 else 0)


def cmd_harden_records(args: argparse.Namespace) -> None:
    """Rewrite trivial training records to be harder using LLM.

    After base model eval, some records score too high (>0.85) — the model
    already aces them, so they produce zero GRPO gradient. This command
    rewrites the user message to require deeper reasoning while keeping
    the same ground truth answer.

    The hardening is domain-agnostic: the LLM reads the record, grader
    reason, and score, then figures out what makes it easy and rewrites
    it to be harder. Works for any task (allergen detection, contract
    analysis, chess tactics, medical coding, etc.).

    Research: arXiv:2505.17063 (Synthetic Data RL: generate-eval-rewrite
    yields +29.2% improvement). arXiv:2603.24202 (iterative teacher-student
    with pass-rate-conditional difficulty adjustment).

    Usage:
      finetune.py harden-records --eval-file eval-001.json \\
        --training-file training.jsonl --min-score 0.85

    Flow: eval → identify trivials → LLM rewrite → validate GT → output
    """
    import requests

    eval_file = Path(args.eval_file)
    training_file = Path(args.training_file)

    if not eval_file.exists():
        print(f"Error: Eval file not found: {eval_file}", file=sys.stderr)
        sys.exit(1)
    if not training_file.exists():
        print(f"Error: Training file not found: {training_file}", file=sys.stderr)
        sys.exit(1)

    # Load eval results
    eval_data = json.loads(eval_file.read_text())
    results = eval_data.get("results", [])

    # Build record_id → (score, reason) from eval
    trivial_records: dict[str, dict] = {}
    for r in results:
        row = r.get("row", {})
        rid = row.get("id", "")
        if not rid:
            continue

        # Get score from epochs or output
        score = None
        reason = ""
        epochs = r.get("epochs", {})
        for ek in sorted(epochs.keys(), key=_epoch_sort_key, reverse=True):
            best = _best_epoch_candidate(epochs.get(ek))
            if best:
                score = best.get("score")
                reason = best.get("reason", "")
                break
        if score is None:
            out = r.get("output", {})
            score = _coerce_score(out.get("score"))
            reason = out.get("reason", "")

        if score is not None and score >= args.min_score:
            trivial_records[rid] = {"score": score, "reason": reason}

    if not trivial_records:
        print(f"No trivial records found (score >= {args.min_score}). Nothing to harden.")
        sys.exit(0)

    # Load training records
    records = []
    with open(training_file) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    total = len(records)
    trivial_count = sum(1 for r in records if r.get("id", "") in trivial_records)
    print(f"Records: {total} total, {trivial_count} trivial (score >= {args.min_score})")
    print(f"Generating {trivial_count} harder variants (originals kept)...")

    # Generate harder variants — ADD new records, don't replace originals.
    # The originals stay in the dataset as anchors (arXiv:2603.24202: keeping
    # some easy content prevents overfitting to hard tasks). The new harder
    # variants dilute the trivial percentage and add learnable signal.
    new_records: list[dict] = []
    failed = 0
    skipped = 0
    gateway_url = args.base_url

    for i, record in enumerate(records):
        rid = record.get("id", "")
        if rid not in trivial_records:
            continue

        info = trivial_records[rid]
        messages = record.get("messages", [])
        gt = record.get("ground_truth", "")

        # Extract system + user messages
        system_msg = ""
        user_msg = ""
        for m in messages:
            if m.get("role") == "system":
                system_msg = m.get("content", "")
            elif m.get("role") == "user":
                user_msg = m.get("content", "")

        if not user_msg or not gt:
            skipped += 1
            continue

        # LLM rewrite prompt — domain-agnostic
        harden_prompt = (
            f"You are creating a harder variant of a training record for an AI model.\n\n"
            f"The model scored {info['score']:.2f} on this record — too easy (trivial).\n"
            f"Grader analysis: {info['reason'][:200]}\n\n"
            f"TASK CONTEXT (system prompt):\n{system_msg[:300]}\n\n"
            f"CURRENT USER MESSAGE:\n{user_msg}\n\n"
            f"GROUND TRUTH ANSWER: {gt}\n\n"
            f"INSTRUCTIONS:\n"
            f"1. Create a NEW, harder user message that tests the same skill\n"
            f"2. The ground truth answer '{gt}' MUST still be correct for the new message\n"
            f"3. Remove any shortcuts or explicit cues that make the answer obvious\n"
            f"4. Require deeper reasoning, domain knowledge, or multi-step inference\n"
            f"5. Keep the same format and style as the original\n"
            f"6. Do NOT change the task — just make the same task harder\n\n"
            f"Return ONLY the new user message, nothing else."
        )

        try:
            resp = requests.post(
                f"{gateway_url}/v1/chat/completions",
                json={
                    "model": "gpt-4.1-mini",
                    "messages": [
                        {"role": "system", "content": "You create harder variants of training questions while keeping the correct answer unchanged."},
                        {"role": "user", "content": harden_prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 500,
                },
                timeout=30,
            )
            resp.raise_for_status()
            new_user_msg = resp.json()["choices"][0]["message"]["content"].strip()

            if not new_user_msg or len(new_user_msg) < 10:
                skipped += 1
                continue

            # GT validation: re-derive GT from hardened input to verify
            # the rewrite didn't break the ground truth. If derived GT
            # doesn't match original GT, discard this variant.
            gt_valid = True
            if gt and args.validate_gt:
                try:
                    gt_check_resp = requests.post(
                        f"{gateway_url}/v1/chat/completions",
                        json={
                            "model": "gpt-4.1-mini",
                            "messages": [
                                {"role": "system", "content": system_msg},
                                {"role": "user", "content": new_user_msg},
                            ],
                            "temperature": 0.0,
                            "max_tokens": 200,
                        },
                        timeout=30,
                    )
                    gt_check_resp.raise_for_status()
                    derived_gt = gt_check_resp.json()["choices"][0]["message"]["content"].strip().lower()
                    original_gt = gt.strip().lower()

                    # Normalize: sort comma-separated labels for comparison
                    derived_labels = sorted(set(l.strip() for l in derived_gt.split(",") if l.strip()))
                    original_labels = sorted(set(l.strip() for l in original_gt.split(",") if l.strip()))

                    if derived_labels != original_labels:
                        print(f"  ✗ GT mismatch for {rid}-hard: original={original_gt}, derived={derived_gt} — discarded", file=sys.stderr)
                        gt_valid = False
                        skipped += 1
                except Exception:
                    pass  # If validation fails, keep the record (conservative)

            if not gt_valid:
                continue

            # Build new record as a variant (don't modify original)
            new_record = {
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": new_user_msg},
                ],
                "id": f"{rid}-hard",
                "topic": record.get("topic", ""),
                "source_parts": record.get("source_parts", []),
                "ground_truth": gt,
                "hardened_from": rid,
                "original_score": info["score"],
            }
            new_records.append(new_record)

        except Exception as e:
            print(f"  Warning: Failed to harden {rid}: {e}", file=sys.stderr)
            failed += 1

        # Progress
        processed = len(new_records) + failed + skipped
        if processed % 20 == 0:
            print(f"  [{processed}/{trivial_count}] generated={len(new_records)}, failed={failed}, skipped={skipped}",
                  file=sys.stderr)

    # Append new records to output (originals + new harder variants)
    output_file = Path(args.output) if args.output else training_file
    all_records = records + new_records
    with open(output_file, "w") as f:
        for record in all_records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    new_total = len(all_records)
    new_trivial_pct = trivial_count / new_total * 100 if new_total > 0 else 0
    print(f"\nDone: {len(new_records)} harder variants added (originals kept)")
    print(f"Dataset: {total} → {new_total} records")
    print(f"Trivial%: {trivial_count / total * 100:.0f}% → ~{new_trivial_pct:.0f}% (before re-eval)")
    print(f"Failed={failed}, skipped={skipped}")
    print(f"Saved to {output_file}")
    print(f"\nNext steps:")
    print(f"  1. Re-upload records: finetune.py upload-records --workflow-id <wf> --file {output_file}")
    print(f"  2. Re-eval: finetune.py create-eval --workflow-id <wf> --model <base-model>")
    print(f"  3. Re-check readiness: finetune.py readiness-check --file <new-eval>")

    # Auto-journal
    _auto_journal(
        project_dir=training_file.resolve().parent,
        step="step_7c_harden",
        action="harden_records",
        status="completed",
        summary=f"Added {len(new_records)} harder variants of {trivial_count} trivial records "
                f"(score >= {args.min_score}). Dataset: {total} → {new_total}. "
                f"Failed={failed}, skipped={skipped}. Re-upload and re-eval needed.",
        results={
            "total_records_before": total,
            "total_records_after": new_total,
            "trivial_count": trivial_count,
            "hardened_added": len(new_records),
            "failed": failed,
            "skipped": skipped,
            "min_score": args.min_score,
        },
    )


def cmd_reconcile_topics(args: argparse.Namespace) -> None:
    """Reconcile record topic assignments with derived ground truth.

    Generic for any closed-vocab classification finetune. Detects records where
    the assigned topic conflicts with the GT label set, and (with --apply)
    reassigns them to a topic that matches.

    Stage 1 (generation) sets a record's topic from the prompt intent.
    Stage 2 (derive_ground_truth) re-extracts the actual labels from the input
    and may produce a GT that contradicts the generation-time topic. Without
    reconciliation, the topic field becomes stale: the grader scores correctly
    against the derived GT, but topic-stratified analysis (UI groups, per-topic
    hardening, difficulty stratification) operates on the wrong assignments.

    Heuristic mapping (no per-task config needed):
    - Topics matching a single label name (e.g., "milk_sources", "wheat") →
      expect GT to contain that label as primary
    - Topics with prefixes "no_", "none", "negative", "non_" → expect GT="none"
    - Topics with prefixes "multi_", "compound_", "complex_" → expect GT to
      have 2+ labels
    - Topics with prefix "tricky_" → mixed; only flagged, not reassigned

    Without --apply: prints mismatches.  With --apply: rewrites the file.
    """
    from collections import Counter as _C
    training_path = Path(args.training_file)
    if not training_path.exists():
        print(f"Error: training file not found: {training_path}", file=sys.stderr)
        sys.exit(1)
    records = [json.loads(l) for l in training_path.read_text().splitlines() if l.strip()]
    if not records:
        print("Error: training file is empty", file=sys.stderr)
        sys.exit(1)

    # Discover all topics and labels in use
    all_topics = sorted({r.get("topic", "") for r in records if r.get("topic")})
    label_universe: set[str] = set()
    for r in records:
        gt = (r.get("ground_truth") or "").lower().strip()
        if gt and gt != "none":
            for lbl in gt.split(","):
                lbl = lbl.strip()
                if lbl:
                    label_universe.add(lbl)

    print(f"Discovered: {len(all_topics)} topics, {len(label_universe)} labels")
    print(f"  Topics: {all_topics}")
    print(f"  Labels: {sorted(label_universe)}")

    # Build topic → category classification
    NONE_PREFIXES = ("no_", "none", "negative", "non_", "without_")
    MULTI_PREFIXES = ("multi_", "compound_", "complex_", "combo_", "mixed_")
    TRICKY_PREFIXES = ("tricky_", "edge_", "ambiguous_")

    def _stem(s: str) -> str:
        """Cheap stemming: lowercase, replace spaces/dashes with underscore, strip
        plural 's' so 'eggs' ↔ 'egg', 'peanut_sources' ↔ 'peanuts'."""
        s = s.lower().replace(" ", "_").replace("-", "_").rstrip("s")
        return s

    # Load topics.json if available — topics may declare their category explicitly
    # via a "category" field (e.g., "none", "single:milk", "multi").
    # This is the most reliable approach: the agent knows the intent at design time.
    topics_file = training_path.parent / "topics.json"
    declared_categories: dict[str, str] = {}
    if topics_file.exists():
        try:
            for t in json.loads(topics_file.read_text()):
                tid = t.get("id", "")
                cat = t.get("category", "")
                if tid and cat:
                    declared_categories[tid] = cat
        except (json.JSONDecodeError, KeyError):
            pass

    def topic_category(topic: str) -> str:
        """Classify topic intent: 'none', 'multi', 'tricky', 'single:<label>', or 'unknown'.

        Priority:
        1. Explicit category from topics.json (most reliable — set by the agent)
        2. Name-based heuristics for common keywords (no_, multi_, tricky_)
        3. Label matching: check if topic name contains a known label
        """
        # 1. Explicit declaration takes priority
        if topic in declared_categories:
            return declared_categories[topic]

        # 2. Name heuristics
        t = topic.lower().replace("-", "_")
        tokens = set(t.split("_"))
        none_keywords = {p.rstrip("_") for p in NONE_PREFIXES}
        multi_keywords = {p.rstrip("_") for p in MULTI_PREFIXES}
        tricky_keywords = {p.rstrip("_") for p in TRICKY_PREFIXES}
        if tokens & tricky_keywords:
            return "tricky"
        if tokens & none_keywords:
            return "none"
        if tokens & multi_keywords:
            return "multi"
        # 3. Single-label: stemmed topic contains stemmed label
        t_stem = _stem(t)
        for lbl in sorted(label_universe, key=len, reverse=True):
            lbl_stem = _stem(lbl)
            if lbl_stem and lbl_stem in t_stem:
                return f"single:{lbl}"
        return "unknown"

    topic_categories = {t: topic_category(t) for t in all_topics}
    print("\nTopic categories:")
    for t, c in topic_categories.items():
        print(f"  {t} → {c}")

    # For "none" reassignment we need a fallback target
    none_topics = [t for t, c in topic_categories.items() if c == "none"]
    multi_topics = [t for t, c in topic_categories.items() if c == "multi"]
    single_topic_for_label: dict[str, str] = {}
    for t, c in topic_categories.items():
        if c.startswith("single:"):
            single_topic_for_label.setdefault(c.split(":", 1)[1], t)

    mismatches = []
    reassignments = []
    for i, r in enumerate(records):
        topic = r.get("topic", "")
        gt = (r.get("ground_truth") or "").lower().strip()
        gt_labels = [l.strip() for l in gt.split(",") if l.strip() and l.strip() != "none"]
        cat = topic_categories.get(topic, "unknown")

        target = None
        reason = None
        if cat == "none":
            if gt_labels:
                # Topic says none but GT has labels — reassign
                if len(gt_labels) >= 2 and multi_topics:
                    target = multi_topics[0]
                elif len(gt_labels) == 1 and gt_labels[0] in single_topic_for_label:
                    target = single_topic_for_label[gt_labels[0]]
                reason = f"topic=none but GT={gt}"
        elif cat.startswith("single:"):
            expected = cat.split(":", 1)[1]
            if not gt_labels:
                # Topic says single-label but GT=none — reassign to none topic
                if none_topics:
                    target = none_topics[0]
                reason = f"topic={topic} (expects {expected}) but GT=none"
            elif expected not in gt_labels:
                # Topic single-label but GT doesn't contain it
                if len(gt_labels) >= 2 and multi_topics:
                    target = multi_topics[0]
                elif len(gt_labels) == 1 and gt_labels[0] in single_topic_for_label:
                    target = single_topic_for_label[gt_labels[0]]
                reason = f"topic={topic} (expects {expected}) but GT={gt}"
        elif cat == "multi":
            if len(gt_labels) < 2:
                # Multi topic but GT has 0 or 1 labels — reassign
                if not gt_labels and none_topics:
                    target = none_topics[0]
                elif len(gt_labels) == 1 and gt_labels[0] in single_topic_for_label:
                    target = single_topic_for_label[gt_labels[0]]
                reason = f"topic={topic} (expects multi) but GT has {len(gt_labels)} labels"
        # tricky: skip — could be either none or single-label

        if reason:
            mismatches.append((i, topic, gt, reason))
            if target and target != topic:
                reassignments.append((i, topic, target))

    print(f"\n{len(mismatches)} mismatches found:")
    for ex in mismatches[:15]:
        print(f"  row{ex[0]}: {ex[3]}")
    if len(mismatches) > 15:
        print(f"  ... and {len(mismatches) - 15} more")
    print(f"\n{len(reassignments)} can be auto-reassigned (others have no clear target)")

    if not args.apply:
        print("\n(dry-run — pass --apply to write changes)")
        sys.exit(0 if not mismatches else 2)

    # Apply reassignments
    for idx, _old, new in reassignments:
        records[idx]["topic"] = new

    # Optional trim: cap each topic at --max-per-topic. Drops the most recently
    # added records of each over-full topic, preserving older / "intent-matched"
    # ones first. Without trimming, reconcile can leave the multi/single
    # destination topics bloated while the source topics are starved.
    dropped = 0
    if args.max_per_topic and args.max_per_topic > 0:
        # Group indices by topic, preserve insertion order
        topic_indices: dict[str, list[int]] = {}
        for i, r in enumerate(records):
            topic_indices.setdefault(r.get("topic", ""), []).append(i)
        keep = set()
        for t, idxs in topic_indices.items():
            for i in idxs[: args.max_per_topic]:
                keep.add(i)
        before = len(records)
        records = [r for i, r in enumerate(records) if i in keep]
        dropped = before - len(records)
        if dropped:
            print(f"  Trimmed {dropped} records (cap = {args.max_per_topic} per topic)")

    with training_path.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\n✓ Wrote {len(reassignments)} reassignments + {dropped} trimmed → {training_path}")

    # Final per-topic count + min-records check
    final_counts = _C(r.get("topic", "") for r in records)
    min_required = args.min_per_topic
    print(f"\nFinal per-topic counts (min required: {min_required}):")
    under = []
    for t in sorted(final_counts):
        c = final_counts[t]
        flag = "  ❌" if c < min_required else "  ✓ "
        print(f"  {flag} {t}: {c}")
        if c < min_required:
            under.append((t, c, min_required - c))
    # Auto-journal the reconciliation so the user can see what happened.
    # Records: how many mismatches, how many reassigned, trim count, final
    # per-topic counts, and whether min-per-topic passed.
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from pipeline_journal import find_project_dir, log_milestone  # type: ignore
        proj = find_project_dir(training_path)
        if proj:
            topic_summary = ", ".join(f"{t}={c}" for t, c in sorted(final_counts.items()))
            under_summary = (
                f" BELOW MIN: {', '.join(f'{t}={c}/{min_required}' for t,c,_ in under)}"
                if under else ""
            )
            summary = (
                f"Reconcile: {len(mismatches)} mismatches, "
                f"{len(reassignments)} reassigned, {dropped} trimmed. "
                f"Final: {topic_summary}.{under_summary}"
            )
            log_milestone(
                proj,
                "step_4_generation",
                "reconcile_topics",
                "fail" if under else "completed",
                summary,
                {
                    "mismatches": len(mismatches),
                    "reassigned": len(reassignments),
                    "trimmed": dropped,
                    "min_per_topic": min_required,
                    "max_per_topic": args.max_per_topic,
                    "final_counts": dict(final_counts),
                    "topics_below_min": [
                        {"topic": t, "count": c, "gap": gap} for t, c, gap in under
                    ],
                },
            )
    except Exception as _e:
        pass  # journaling is best-effort

    if under:
        print(f"\n❌ {len(under)} topic(s) below minimum — regenerate the gap:")
        for t, c, gap in under:
            print(f"   generate_records.py --append --topic {t} --count {gap}")
        print("\nThen re-run: derive_ground_truth.py → reconcile-topics --apply")
        sys.exit(1)
    print("\n✓ All topics meet the minimum")
    print("  Note: re-upload records to gateway with `upload-records --replace`")


def cmd_grader_sanity_check(args: argparse.Namespace) -> None:
    """Run mandatory grader sanity checks on an eval result.

    Hard-fails (exit 1) if any check trips. Catches the bugs we keep finding
    by manual inspection: ordinal collapse, dump-all gaming, LLM inference.
    """
    eval_file = Path(args.eval_file)
    if not eval_file.exists():
        print(f"Error: eval file not found: {eval_file}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(eval_file.read_text())
    results = data.get("results", [])
    if not results:
        print("Error: eval file has no results", file=sys.stderr)
        sys.exit(1)

    # Collect all epoch indices present
    epoch_keys = set()
    for rec in results:
        for k in (rec.get("epochs", {}) or {}).keys():
            epoch_keys.add(str(k))
    epoch_list = sorted(epoch_keys, key=lambda x: int(x) if x.isdigit() else 0)
    if not epoch_list:
        print("Error: no epochs found in results", file=sys.stderr)
        sys.exit(1)

    print(f"=== Grader sanity check: {eval_file.name} ===")
    print(f"  rows: {len(results)}  epochs: {epoch_list}")

    # Default-mode collapse detection (per-eval, not per-epoch).
    # If the model emits its most common response > 2x more frequently than
    # the most common GT, the base model has a strong default-mode prior that
    # GRPO will struggle to escape. Reference: "Tricks or Traps" (arXiv:2508.08221)
    # Section 4.2 entropy collapse; remediation is data rebalancing + clip-higher.
    from collections import Counter as _Counter
    resp_counts = _Counter()
    gt_counts = _Counter()
    for rec in results:
        row = rec.get("row", {})
        gt_counts[(row.get("ground_truth") or "").strip().lower()] += 1
        for m in row.get("messages", []):
            if m.get("role") == "assistant":
                resp_counts[(m.get("content") or "").strip().lower()] += 1
                break
    if resp_counts and gt_counts:
        top_resp, top_resp_n = resp_counts.most_common(1)[0]
        top_gt, top_gt_n = gt_counts.most_common(1)[0]
        # Match the top response to the GT distribution for the same string
        gt_for_top_resp = gt_counts.get(top_resp, 0)
        if gt_for_top_resp > 0 and top_resp_n / gt_for_top_resp >= 2.0:
            ratio = top_resp_n / gt_for_top_resp
            print(f"\n⚠️  Default-mode collapse detected:")
            print(f"     Top response \"{top_resp[:60]}\" emitted {top_resp_n}x")
            print(f"     GT for this label appears {gt_for_top_resp}x → ratio {ratio:.1f}x")
            print(f"     Base model has a strong prior — GRPO will need data rebalancing")
            print(f"     Recommended: oversample non-\"{top_resp[:30]}\" records, consider clip-higher epsilon_high=0.28")

    any_failed = False
    for ek in epoch_list:
        n = 0
        llm_count = 0
        collapse_rows = []
        dump_high = []
        llm_high_mismatch = []
        score_sum = 0.0
        for i, rec in enumerate(results):
            ep_lst = (rec.get("epochs", {}) or {}).get(ek) or (rec.get("epochs", {}) or {}).get(int(ek)) if ek.isdigit() else None
            if not ep_lst:
                # try int key
                try:
                    ep_lst = (rec.get("epochs", {}) or {}).get(int(ek))
                except Exception:
                    ep_lst = None
            if not ep_lst:
                continue
            e = ep_lst[0]
            score = e.get("score")
            reason = e.get("reason", "") or ""
            if not isinstance(score, (int, float)):
                continue
            n += 1
            score_sum += score
            if "extraction: llm" in reason.lower():
                llm_count += 1
            if "TP=" in reason:
                try:
                    tp = int(reason.split("TP=")[1].split()[0])
                    if tp > 0 and score <= 0.10:
                        collapse_rows.append((i, tp, score, reason[:100]))
                except Exception:
                    pass
            # rollout content for this epoch (model output)
            resp = e.get("rollout_content") or ""
            if not resp:
                # fallback to row.messages assistant (only valid for epoch 0)
                row = rec.get("row", {})
                for m in row.get("messages", []):
                    if m.get("role") == "assistant":
                        resp = m.get("content", "") or ""
            n_labels = len([t for t in resp.split(",") if t.strip()])
            # Dump-all gaming: many labels emitted AND low precision. Parse
            # precision from the reason string to avoid false positives on
            # genuine high-recall cases where GT itself has many labels.
            try:
                prec_val = float(reason.split("P=")[1].split()[0]) if "P=" in reason else 1.0
            except Exception:
                prec_val = 1.0
            if n_labels >= 7 and score > 0.20 and prec_val < 0.50:
                dump_high.append((i, n_labels, score, resp[:80]))
            if "extraction: llm" in reason.lower() and score >= 0.85:
                row = rec.get("row", {})
                gt = (row.get("ground_truth") or "").lower()
                if gt and gt != "none":
                    gt_labels = [x.strip() for x in gt.split(",") if x.strip()]
                    missing = [g for g in gt_labels if g not in resp.lower()]
                    if missing:
                        llm_high_mismatch.append((i, score, gt, missing, resp[:80]))

        if n == 0:
            continue
        llm_rate = llm_count / n
        collapse_rate = len(collapse_rows) / n
        avg = score_sum / n

        print(f"\n--- Epoch {ek} ---")
        print(f"  scored: {n}  avg: {avg:.3f}")
        print(f"  LLM fallback: {llm_rate*100:.1f}%  (threshold: <10%)")
        print(f"  Partial+FP collapse: {len(collapse_rows)} ({collapse_rate*100:.1f}%)  (threshold: <1%)")
        print(f"  Dump-all gaming: {len(dump_high)}  (threshold: 0)")
        print(f"  LLM-inference high: {len(llm_high_mismatch)}  (threshold: 0)")

        failed = []
        if llm_rate > 0.10:
            failed.append(f"LLM fallback {llm_rate*100:.1f}% > 10%")
        if collapse_rate > 0.01:
            failed.append(f"{len(collapse_rows)} collapse rows (length penalty bypassing tpFloor?)")
            for ex in collapse_rows[:3]:
                print(f"    COLLAPSE row{ex[0]} tp={ex[1]} score={ex[2]:.2f} | {ex[3]}")
        if dump_high:
            failed.append(f"{len(dump_high)} dump-all rows scored >0.20")
            for ex in dump_high[:3]:
                print(f"    DUMP row{ex[0]} n_labels={ex[1]} score={ex[2]:.2f} | {ex[3]}")
        if llm_high_mismatch:
            failed.append(f"{len(llm_high_mismatch)} LLM-inferred high scores")
            for ex in llm_high_mismatch[:3]:
                print(f"    LLM_INFER row{ex[0]} score={ex[1]:.2f} gt={ex[2]} missing={ex[3]} | {ex[4]}")
        if failed:
            any_failed = True
            print(f"  ❌ epoch {ek} FAIL: " + "; ".join(failed))
        else:
            print(f"  ✅ epoch {ek} PASS")

    if any_failed:
        print("\n❌ FAIL — fix the grader before proceeding")
        sys.exit(1)
    print("\n✅ PASS — all epochs clean")


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

    print("epoch | rollout_output | score | reason")
    for epoch_key in sorted(epochs.keys(), key=_epoch_sort_key):
        epoch_items = _normalize_epoch_candidates(epochs.get(epoch_key))
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

    # upload-records
    p = subparsers.add_parser("upload-records", help="Upload training records from JSONL")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to training.jsonl")
    p.add_argument("--batch-size", type=int, default=200, help="Records per API call (default: 200)")
    p.add_argument("--force", action="store_true", help="Delete all existing records before uploading")

    # log-step — writes both execution-log.md and pipeline-journal.json
    p = subparsers.add_parser("log-step", help="Log a pipeline step to execution-log.md + pipeline-journal.json")
    p.add_argument("--project-dir", required=True, help="Path to finetune-project directory")
    p.add_argument("--workflow-id", default=None, help="Workflow ID (for journal init)")
    p.add_argument("--step", required=True, help="Step name (e.g., step_2_extraction, step_7_eval)")
    p.add_argument("--action", required=True, help="Action type (e.g., extract_documents, create_eval, fix_grader)")
    p.add_argument("--status", required=True, choices=["in_progress", "completed", "failed"],
                   help="Status: in_progress (step started), completed, failed")
    p.add_argument("--summary", required=True, help="One-line summary of what happened")
    p.add_argument("--reason", default=None, help="Why this step/job was created (the reasoning chain)")
    p.add_argument("--analysis", default=None, help="What was found after completion")
    p.add_argument("--decision", default=None, help="What to do next based on findings")
    p.add_argument("--job-id", default=None, help="Eval or training job ID (links to gateway)")
    p.add_argument("--job-type", default=None, choices=["eval", "training"],
                   help="Job type for UI display")
    p.add_argument("--model", default=None, help="Model used (e.g., gpt-4o-mini, Qwen3.5-4B)")
    p.add_argument("--triggered-by", type=int, default=None, help="Journal entry ID that caused this step")
    p.add_argument("--duration", default=None, help="Duration string (e.g., '2 min', '45 sec', '1.5 hours')")
    p.add_argument("--agent", default=None,
                   help="Which agent executed this step (e.g., orchestrator, knowledge-extractor, "
                        "relation-builder, training-monitor). For UI workflow diagram.")
    p.add_argument("--details", default=None, help="JSON string with step-specific details")
    p.add_argument("--results", default=None, help="JSON string with results/metrics")

    # log-iteration
    p = subparsers.add_parser("log-iteration", help="Log eval or training iteration to iterations.json")
    p.add_argument("--project-dir", required=True, help="Path to finetune-project directory")
    p.add_argument("--phase", default=None, choices=["eval", "training"],
                   help="Phase: eval or training. Auto-detected from --eval-file / --training-file if omitted.")
    p.add_argument("--eval-file", default=None, help="Path to eval JSON file (auto-sets phase=eval)")
    p.add_argument("--training-file", default=None, help="Path to training job JSON file (auto-sets phase=training)")
    p.add_argument("--changes", required=True, help="What was changed in this iteration (free text)")
    p.add_argument("--change-type", required=True, choices=["baseline", "grader", "records", "both", "hyperparams"],
                   help="What type of change: baseline (first), grader, records, both, hyperparams")
    p.add_argument("--verdict", required=True, choices=["PASS", "WARN", "FAIL", "PENDING"],
                   help="Verdict: PASS (proceed), WARN (some issues), FAIL (must fix)")

    # filter-records
    p = subparsers.add_parser("filter-records", help="Remove bad records from JSONL and gateway based on eval results")
    p.add_argument("--file", required=True, help="Path to eval JSON file (e.g., evaluations/eval-001.json)")
    p.add_argument("--training-file", default=None, help="Path to training.jsonl (removes matching records from local file)")
    p.add_argument("--max-score", type=float, default=None, help="Remove records with score <= this value (e.g., 0.0 to remove zeros)")
    p.add_argument("--min-score", type=float, default=None, help="Remove records with score >= this value (e.g., 0.75 to remove trivials for signal density)")
    p.add_argument("--reason-pattern", default=None, help="Remove records whose reason contains this text (case-insensitive)")
    p.add_argument("--topic", default=None, help="Remove all records from this topic")
    p.add_argument("--workflow-id", default=None, help="Workflow ID (required with --sync-gateway)")
    p.add_argument("--sync-gateway", action="store_true", help="Also delete removed records from the gateway API")
    p.add_argument("--verbose", action="store_true", help="Show sample removed records")

    # upload-grader
    p = subparsers.add_parser("upload-grader", help="Upload grader/evaluator script (auto dry-run before upload)")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--file", required=True, help="Path to grader.js")
    p.add_argument("--skip-dry-run", action="store_true", help="Skip pre-upload dry-run validation")

    # verify
    p = subparsers.add_parser("verify", help="Verify all data in gateway via REST API")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--no-journal", action="store_true", help="Skip auto-journal (use when calling verify as a diagnostic check, not as Step 6)")

    # status
    p = subparsers.add_parser("status", help="Show full workflow status: gateway data + checkpoint + jobs + next step")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--project-dir", default="finetune-project", help="Project directory (default: finetune-project/)")

    # list-models
    p = subparsers.add_parser("list-models", help="List checkpointed/finetuned model aliases for a training job")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--job-id", required=True, help="Training job ID")

    # readiness-check
    p = subparsers.add_parser("readiness-check", help="Check if eval results pass pre-training readiness gate")
    p.add_argument("--file", required=True, help="Path to eval result JSON (from poll-eval)")
    p.add_argument("--thresholds", default=None, help="JSON string with custom thresholds (optional)")
    p.add_argument("--max-output-tokens", type=int, default=512,
                   help="Planned max_output_tokens for training (default: 512). "
                        "Used to check if eval response lengths predict truncation risk.")
    p.add_argument("--training-file", default=None,
                   help="Path to training.jsonl. If provided, enables proactive length-drift checks "
                        "(spec_mismatch + length_drift_risk) that catch grader-rewards-verbosity and "
                        "spec-mismatch problems BEFORE training. Strongly recommended.")
    p.add_argument("--objective-target-tokens", type=int, default=None,
                   help="User's stated target output token count (e.g., 80 for '40-80 tokens'). "
                        "Required for spec-mismatch detection. Pair with --training-file.")

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
    p.add_argument("--no-early-cancel", action="store_true",
        help="Disable automatic early cancellation on broken grader detection")
    p.add_argument("--early-cancel-threshold", type=float, default=0.05,
        help="Score threshold below which to auto-cancel (default: 0.05)")
    p.add_argument("--early-cancel-min-rows", type=int, default=20,
        help="Minimum completed rows before checking early cancel (default: 20)")
    p.add_argument("--early-cancel-zero-rate", type=float, default=0.30,
        help="Cancel if more than this fraction of scores are 0.0 (default: 0.30 = 30%%). "
             "Base models routinely score 0 on 15-50%% of prompts (DeepSeek-R1, arXiv:2501.12948; "
             "'No Prompt Left Behind', arXiv:2509.21880). 10%% was too aggressive for first evals.")

    # estimate-training
    p = subparsers.add_parser("estimate-training", help="Estimate training cost and duration for model comparison")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--models", required=True,
                   help="Comma-separated model names to compare (e.g., 'Qwen3.5-4B,Qwen3.5-0.8B')")
    p.add_argument("--epochs", type=float, default=None, help="Epochs (optional, uses estimate default)")
    p.add_argument("--max-output-tokens", type=int, default=None, help="Max output tokens (optional)")
    p.add_argument("--k", type=int, default=None, help="Response candidates count (optional)")
    p.add_argument("--max-cost", type=float, default=None,
                   help="Max training cost in USD. Models exceeding this are marked as over-budget. "
                        "Also reads from config.json 'constraints.max_cost_usd' if not set.")
    p.add_argument("--max-duration", type=float, default=None,
                   help="Max training duration in minutes. Models exceeding this are marked as over-time. "
                        "Also reads from config.json 'constraints.max_duration_minutes' if not set.")

    # create-training
    p = subparsers.add_parser("create-training", help="Create training job and save metadata locally")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--base-model", required=True, help="Base model (e.g., Qwen3.5-4B)")
    p.add_argument("--output-model", default=None, help="Output model name")
    p.add_argument("--display-name", default=None, help="Human-readable training job name")
    p.add_argument("--config", default=None, help="Training config JSON string")
    p.add_argument("--inference-params", default=None, help="Inference parameters JSON string")
    p.add_argument("--output-dir", default="training-jobs", help="Local directory for job metadata (default: training-jobs/)")

    # poll-training
    p = subparsers.add_parser("poll-training", help="Poll training job until complete, save status and metrics")
    p.add_argument("--workflow-id", required=False, default=None, help="Workflow ID (read from job file if omitted)")
    p.add_argument("--file", required=True, help="Path to train-NNN.json (from create-training)")
    p.add_argument("--poll-interval", type=int, default=60, help="(Ignored — adaptive polling is used. Kept for backward compatibility)")
    p.add_argument("--max-wait", type=int, default=7200, help="Max wait in seconds (default: 7200 = 2h, matching SKILL.md recommendation)")
    p.add_argument("--no-early-stop", action="store_true", help="Disable automatic early stopping (EMA plateau, degradation, length exploitation)")

    # diagnose-clipping
    p = subparsers.add_parser(
        "diagnose-clipping",
        help="Diagnose root cause of completion clipping after auto-cancel (config / grader drift / spec mismatch)",
    )
    p.add_argument("--job-file", required=True, help="Path to train-NNN.json (cancelled for clipping)")
    p.add_argument("--training-file", required=True, help="Path to training.jsonl (for GT P95 token estimation)")
    p.add_argument(
        "--objective-target-tokens",
        type=int,
        default=None,
        help="User-specified target output token count (e.g. 80 for '40-80 tokens'). Required for spec-mismatch detection.",
    )
    p.add_argument("--json", action="store_true", help="Emit JSON instead of human-readable output")

    # cancel-training
    p = subparsers.add_parser("cancel-training", help="Cancel a running training job")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--job-id", required=True, help="Training job ID to cancel")
    p.add_argument("--file", default=None, help="Path to local train-NNN.json to update status (optional)")

    # cancel-eval
    p = subparsers.add_parser("cancel-eval", help="Cancel a running evaluation")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--eval-id", required=True, help="Eval job ID to cancel")
    p.add_argument("--file", default=None, help="Path to local eval-NNN.json to update status (optional)")

    # sync-jobs
    p = subparsers.add_parser("sync-jobs", help="Sync training + eval jobs from gateway to local tracking files")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--output-dir", default="finetune-project", help="Project directory (default: finetune-project/)")

    # search-knowledge
    p = subparsers.add_parser("search-knowledge", help="Semantic search over knowledge parts")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--phrase", required=True, help="Search query text")
    p.add_argument("--top-k", type=int, default=10, help="Max results (default: 10)")

    # delete-knowledge
    p = subparsers.add_parser("delete-knowledge", help="Delete knowledge source(s) from a workflow")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--source-id", default=None, help="Specific knowledge source ID to delete")
    p.add_argument("--all", action="store_true", help="Delete all knowledge sources")

    # update-part-relevance
    p = subparsers.add_parser("update-part-relevance", help="Update parts with relevance labels from all-parts-index.json")
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--parts-index", default="finetune-project/knowledge/all-parts-index.json",
                   help="Path to all-parts-index.json (default: finetune-project/knowledge/all-parts-index.json)")

    # difficulty-probe
    p = subparsers.add_parser(
        "difficulty-probe",
        help="Analyze eval results for difficulty distribution and training signal prediction",
    )
    p.add_argument("--file", required=True, help="Path to eval results JSON")
    p.add_argument("--k", type=int, default=8, help="Group size K for prediction (default: 8)")
    p.add_argument("--output-json", action="store_true", help="Output JSON only")
    p.add_argument("--save", help="Save full report to file")
    p.add_argument("--compact", action="store_true", help="Omit per-prompt details")

    # data-quality-gate
    p = subparsers.add_parser(
        "data-quality-gate",
        help="Run pre-eval data quality gate on training data",
    )
    p.add_argument("--file", required=True, help="Path to training.jsonl")
    p.add_argument("--topics", help="Path to topics.json for cross-referencing")
    p.add_argument("--parts", help="Path to all-parts-index.json")
    p.add_argument("--gate", help="Comma-separated gates: structural,diversity,completion_length,ground_truth_quality,alignment")
    p.add_argument("--llm-gates", action="store_true", help="Include LLM-scored gates")
    p.add_argument("--all-gates", action="store_true", help="Run all gates")
    p.add_argument("--sample", type=int, default=30, help="Records to sample for LLM gates")
    p.add_argument("--max-output-tokens", type=int, default=512, help="Planned max_output_tokens for training (for completion_length gate)")
    p.add_argument("--gateway-url", default=DEFAULT_BASE_URL, help="Gateway URL for LLM calls")
    p.add_argument("--output-json", action="store_true", help="Output JSON only")
    p.add_argument("--save", help="Save full report to file")

    # test-grader
    p = subparsers.add_parser(
        "test-grader",
        help="Adversarial grader test — feeds wrong answers to detect leniency before eval",
    )
    p.add_argument("--workflow-id", required=True, help="Workflow ID")
    p.add_argument("--training-file", required=True, help="Path to training.jsonl")
    p.add_argument("--grader-file", default=None, help="Path to grader.js (for fallback scoring)")
    p.add_argument("--samples", type=int, default=10, help="Number of records to test (default: 10)")

    # harden-records
    p = subparsers.add_parser(
        "harden-records",
        help="Generate harder variants of trivial records to improve GRPO signal density",
    )
    p.add_argument("--eval-file", required=True, help="Path to eval result JSON (identifies trivial records)")
    p.add_argument("--training-file", required=True, help="Path to training.jsonl")
    p.add_argument("--min-score", type=float, default=0.85,
                   help="Score threshold for 'trivial' records (default: 0.85)")
    p.add_argument("--output", default=None,
                   help="Output file (default: overwrite training file with originals + harder variants)")
    p.add_argument("--validate-gt", action="store_true", default=True,
                   help="Validate GT by re-deriving from hardened input. Discards variants where GT doesn't match (default: True)")
    p.add_argument("--no-validate-gt", dest="validate_gt", action="store_false",
                   help="Skip GT validation (faster but risks incorrect records)")

    # print-row-outputs
    p = subparsers.add_parser(
        "reconcile-topics",
        help="Detect and fix topic↔GT mismatches after GT derivation",
    )
    p.add_argument("--training-file", required=True, help="Path to training.jsonl")
    p.add_argument("--apply", action="store_true",
                   help="Actually rewrite the file (default: dry-run report only)")
    p.add_argument("--min-per-topic", type=int, default=25,
                   help="Hard-fail if any topic has fewer than N records after reconcile (default: 25)")
    p.add_argument("--max-per-topic", type=int, default=0,
                   help="Trim each topic to at most N records after reconcile (0 = no trim)")

    p = subparsers.add_parser(
        "grader-sanity-check",
        help="MANDATORY after every eval — hard-fail on collapse/gaming/inference bugs",
    )
    p.add_argument("--eval-file", required=True, help="Path to eval-NNN.json")

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
        "log-step": cmd_log_step,
        "log-iteration": cmd_log_iteration,
        "filter-records": cmd_filter_records,
        "upload-grader": cmd_upload_grader,
        "verify": cmd_verify,
        "status": cmd_status,
        "list-models": cmd_list_models,
        "readiness-check": cmd_readiness_check,
        "diagnose-grader": cmd_diagnose_grader,
        "create-eval": cmd_create_eval,
        "poll-eval": cmd_poll_eval,
        "estimate-training": cmd_estimate_training,
        "create-training": cmd_create_training,
        "poll-training": cmd_poll_training,
        "search-knowledge": cmd_search_knowledge,
        "diagnose-clipping": cmd_diagnose_clipping,
        "cancel-training": cmd_cancel_training,
        "cancel-eval": cmd_cancel_eval,
        "sync-jobs": cmd_sync_jobs,
        "delete-knowledge": cmd_delete_knowledge,
        "update-part-relevance": cmd_update_part_relevance,
        "difficulty-probe": cmd_difficulty_probe,
        "data-quality-gate": cmd_data_quality_gate,
        "test-grader": cmd_test_grader,
        "harden-records": cmd_harden_records,
        "print-row-outputs": cmd_print_row_outputs,
        "grader-sanity-check": cmd_grader_sanity_check,
        "reconcile-topics": cmd_reconcile_topics,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
