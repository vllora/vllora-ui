# /// script
# dependencies = []
# ///
"""Validate a training JSONL file before upload.

Usage:
  uv run scripts/validate_dataset.py training.jsonl
  uv run scripts/validate_dataset.py training.jsonl --topics topics.json --parts knowledge/all-parts-index.json
  uv run scripts/validate_dataset.py training.jsonl --nemo

Checks: valid JSON per line, required fields (messages, id), message structure
(role + content), system + user messages present, no assistant messages (RFT),
duplicate IDs, minimum record count, and optionally cross-references topic and
source_parts IDs against topics.json and all-parts-index.json.

With --nemo: also checks for accidentally included NeMo metadata fields
(reference_answer, retrieved_chunks, chunk_text, judge_* etc.) that should
live in nemo-metadata.jsonl, not in training records.

Exit codes:
  0 - all records valid
  1 - validation errors found
"""

import json
import sys
from collections import Counter
from pathlib import Path


_NEMO_METADATA_FIELDS = {
    "reference_answer",
    "retrieved_chunks",
    "retrieved_chunks_part_ids",
    "retrieved_chunks_matches_json",
    "question_chunks_part_ids",
    "question_chunks_matches_json",
    "chunk_text",
    "source_file",
    "topic_path",
    "judge_accuracy",
    "judge_completeness",
    "judge_groundedness",
    "judge_specificity",
    "judge_quality",
    "judge_reason",
    "score_relevancy",
}


def check_nemo_metadata(line_num: int, record: dict) -> list[str]:
    """Warn if NeMo metadata fields leaked into training records."""
    warnings: list[str] = []

    # Check for NeMo metadata at the record top level
    for field in _NEMO_METADATA_FIELDS:
        val = record.get(field)
        if val is None:
            continue
        if isinstance(val, (str, int, float, dict)) and val:
            warnings.append(
                f"Line {line_num}: NeMo metadata field '{field}' found at record level "
                f"— use convert_nemo_rows.py to separate metadata from training data"
            )

    # Check for NeMo field names accidentally embedded inside message content
    messages = record.get("messages", [])
    for i, msg in enumerate(messages):
        if not isinstance(msg, dict):
            continue
        content = msg.get("content", "")
        if not isinstance(content, str):
            continue
        for field in _NEMO_METADATA_FIELDS:
            if f'"{field}"' in content or f"'{field}'" in content:
                warnings.append(
                    f"Line {line_num}, message {i}: Content contains NeMo metadata pattern '{field}' "
                    f"— this should be in the metadata sidecar, not in training messages"
                )

    return warnings


def validate_record(line_num: int, line: str) -> list[str]:
    errors: list[str] = []

    try:
        record = json.loads(line)
    except json.JSONDecodeError as e:
        return [f"Line {line_num}: Invalid JSON — {e}"]

    if not isinstance(record, dict):
        return [f"Line {line_num}: Record must be a JSON object, got {type(record).__name__}"]

    if "messages" not in record:
        errors.append(f"Line {line_num}: Missing required field 'messages'")
    elif not isinstance(record["messages"], list):
        errors.append(f"Line {line_num}: 'messages' must be an array")
    else:
        messages = record["messages"]
        roles = [m.get("role") for m in messages if isinstance(m, dict)]

        # Tool-calling (multi-turn decision-point) vs RFT (single-turn prompt):
        # - RFT: [system, user] — no assistant messages, last role = user
        # - Tool-calling: [system, user, assistant(tool_calls), tool, assistant, ...]
        #   Assistant messages with content:null are valid (tool_calls-only turns).
        is_tool_calling = bool(record.get("tools")) or "tool" in roles

        for i, msg in enumerate(messages):
            if not isinstance(msg, dict):
                errors.append(f"Line {line_num}, message {i}: Must be an object")
                continue
            if "role" not in msg:
                errors.append(f"Line {line_num}, message {i}: Missing 'role'")
            role = msg.get("role")
            content = msg.get("content")
            has_tool_calls = bool(msg.get("tool_calls"))
            # In tool-calling mode two cases legitimately omit `content`:
            #   - assistant turn carrying only tool_calls
            #   - tool turn with empty response (e.g. acknowledgement-only success)
            assistant_tool_call_turn = is_tool_calling and role == "assistant" and has_tool_calls
            tool_response_turn = is_tool_calling and role == "tool"
            missing_ok = assistant_tool_call_turn or tool_response_turn
            if "content" not in msg:
                if missing_ok:
                    continue
                errors.append(f"Line {line_num}, message {i}: Missing 'content'")
                continue
            if content is None:
                if missing_ok:
                    continue
                errors.append(f"Line {line_num}, message {i}: Empty content")
                continue
            if isinstance(content, str) and not content.strip():
                errors.append(f"Line {line_num}, message {i}: Empty content")

        if "system" not in roles:
            errors.append(f"Line {line_num}: No system message found")
        if "user" not in roles:
            errors.append(f"Line {line_num}: No user message found")
        if not is_tool_calling and "assistant" in roles:
            # Only flag assistant messages in single-turn RFT records.
            errors.append(f"Line {line_num}: Contains assistant message (RFT uses prompts only, remove assistant messages)")

        # Check user message is not trivially short
        user_messages = [m for m in messages if isinstance(m, dict) and m.get("role") == "user"]
        for um in user_messages:
            content = um.get("content", "")
            if isinstance(content, str) and content and len(content.strip()) < 10:
                errors.append(f"Line {line_num}: User message too short ({len(content.strip())} chars) — likely not a useful prompt")

    if "id" not in record:
        errors.append(f"Line {line_num}: Missing recommended field 'id'")

    # Validate ground_truth type and emptiness only.
    # Short GT length is NOT an error — classification tasks have short GTs
    # by design (e.g., "fish" = 4 chars). Length checks are handled by
    # data_quality_gate.py which has task-aware thresholds.
    gt = record.get("ground_truth")
    if gt is not None:
        if isinstance(gt, str):
            if len(gt.strip()) == 0:
                errors.append(f"Line {line_num}: 'ground_truth' is empty")
        elif isinstance(gt, dict):
            # Tool-calling GT shape: {"name": "...", "arguments": {...}}
            if not gt.get("name"):
                errors.append(f"Line {line_num}: 'ground_truth' dict missing 'name'")
            if "arguments" not in gt:
                errors.append(f"Line {line_num}: 'ground_truth' dict missing 'arguments'")
        else:
            errors.append(
                f"Line {line_num}: 'ground_truth' must be a string (RFT) "
                f"or {{name, arguments}} dict (tool-calling), got {type(gt).__name__}"
            )

    return errors


def load_valid_topics(topics_path: Path) -> tuple[set[str], set[str]]:
    """Load topic IDs from topics.json. Returns (all_ids, leaf_ids).

    Handles both flat list and nested `children` hierarchies. Leaves are any
    topic that isn't referenced as a parent_id and has no `children`. Both
    `id` and `reference_id` are collected so records that reference either
    form still validate cleanly.
    """
    data = json.loads(topics_path.read_text())
    topics = data if isinstance(data, list) else data.get("topics", [])

    # Flatten nested `children` into one list with inferred parent_id
    flat: list[dict] = []
    def _walk(nodes: list, parent_id: str | None) -> None:
        for n in nodes:
            if not isinstance(n, dict):
                continue
            entry = {k: v for k, v in n.items() if k != "children"}
            if parent_id and not entry.get("parent_id"):
                entry["parent_id"] = parent_id
            flat.append(entry)
            _walk(n.get("children") or [], entry.get("id"))
    _walk(topics, None)

    all_ids: set[str] = set()
    parent_ids: set[str] = set()
    id_to_has_children: dict[str, bool] = {}
    for t in flat:
        tid = t.get("id") or t.get("reference_id")
        if not tid:
            continue
        all_ids.add(tid)
        # Also accept reference_id as alias (records may use either)
        ref = t.get("reference_id")
        if ref:
            all_ids.add(ref)
        if t.get("parent_id"):
            parent_ids.add(t["parent_id"])
    # Derive leaves — a topic is a leaf if nothing names it as parent_id
    leaf_ids: set[str] = set()
    for t in flat:
        tid = t.get("id") or t.get("reference_id")
        if not tid:
            continue
        is_leaf = tid not in parent_ids
        # Also check that the reference_id isn't a parent (happens when
        # parent_id references the reference_id form)
        ref = t.get("reference_id")
        if ref and ref in parent_ids:
            is_leaf = False
        if is_leaf:
            leaf_ids.add(tid)
            if ref:
                leaf_ids.add(ref)
    return all_ids, leaf_ids


def load_valid_parts(parts_path: Path) -> set[str]:
    """Load part IDs from all-parts-index.json."""
    data = json.loads(parts_path.read_text())
    if isinstance(data, dict) and "parts" in data:
        parts = data["parts"]
    elif isinstance(data, list):
        parts = data
    else:
        return set()
    return {p["id"] for p in parts if isinstance(p, dict) and "id" in p}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: validate_dataset.py <file.jsonl> [--topics topics.json] [--parts all-parts-index.json] [--nemo]", file=sys.stderr)
        sys.exit(1)

    # Simple arg parsing (positional + optional flags)
    file_path = Path(sys.argv[1])
    topics_path = None
    parts_path = None
    nemo_mode = False
    repair_from: Path | None = None   # decision-points.jsonl for auto-restore
    min_per_leaf = 1                   # enforce at least 1 record per leaf topic
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--topics" and i + 1 < len(sys.argv):
            topics_path = Path(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--parts" and i + 1 < len(sys.argv):
            parts_path = Path(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--nemo":
            nemo_mode = True
            i += 1
        elif sys.argv[i] == "--repair-from" and i + 1 < len(sys.argv):
            repair_from = Path(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--min-per-leaf" and i + 1 < len(sys.argv):
            min_per_leaf = int(sys.argv[i + 1])
            i += 2
        else:
            i += 1

    if not file_path.exists():
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    # Load cross-reference data if provided
    valid_topics: set[str] | None = None
    leaf_topics: set[str] | None = None
    valid_parts: set[str] | None = None

    if topics_path:
        if not topics_path.exists():
            print(f"Warning: Topics file not found: {topics_path} — skipping topic validation", file=sys.stderr)
        else:
            valid_topics, leaf_topics = load_valid_topics(topics_path)
            print(f"Cross-referencing against {len(valid_topics)} topics ({len(leaf_topics)} leaf) from {topics_path.name}")

    if parts_path:
        if not parts_path.exists():
            print(f"Warning: Parts file not found: {parts_path} — skipping parts validation", file=sys.stderr)
        else:
            valid_parts = load_valid_parts(parts_path)
            print(f"Cross-referencing against {len(valid_parts)} parts from {parts_path.name}")

    all_errors: list[str] = []
    warnings: list[str] = []
    record_count = 0
    gt_count = 0
    topic_counts: Counter[str] = Counter()
    ids_seen: set[str] = set()
    duplicate_ids: list[str] = []

    with file_path.open() as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            record_count += 1
            errors = validate_record(line_num, line)
            all_errors.extend(errors)

            try:
                record = json.loads(line)

                if nemo_mode:
                    warnings.extend(check_nemo_metadata(line_num, record))
                record_id = record.get("id", "")
                if record_id:
                    if record_id in ids_seen:
                        duplicate_ids.append(record_id)
                    ids_seen.add(record_id)

                topic = record.get("topic", "")
                if topic:
                    topic_counts[topic] += 1
                    if valid_topics is not None and topic not in valid_topics:
                        warnings.append(f"Line {line_num}: Topic '{topic}' not found in topics.json")
                    elif leaf_topics is not None and topic not in leaf_topics:
                        warnings.append(f"Line {line_num}: Topic '{topic}' is a parent topic, not a leaf — records should reference leaf topics only")

                if record.get("ground_truth"):
                    gt_count += 1

                source_parts = record.get("source_parts", [])
                if valid_parts is not None:
                    for sp in source_parts:
                        if sp not in valid_parts:
                            warnings.append(f"Line {line_num}: source_parts ref '{sp}' not found in parts index")

            except (json.JSONDecodeError, AttributeError):
                pass

    # Print results
    print(f"\n{'='*50}")
    print(f"Validation Results: {file_path.name}")
    print(f"{'='*50}")
    print(f"Total records: {record_count}")
    print(f"Unique IDs:    {len(ids_seen)}")
    if gt_count:
        print(f"With ground_truth: {gt_count}/{record_count}")

    if topic_counts:
        print(f"Topics found:  {len(topic_counts)}")
        for topic, count in topic_counts.most_common():
            marker = ""
            if valid_topics is not None and topic not in valid_topics:
                marker = " (UNKNOWN)"
            print(f"  {topic}: {count}{marker}")

    if duplicate_ids:
        print(f"\n⚠️  Duplicate IDs: {len(duplicate_ids)}")
        for dup in duplicate_ids[:5]:
            print(f"  - {dup}")

    if record_count < 50:
        print(f"\n⚠️  Only {record_count} records. Minimum 50 for meaningful training, recommend 100-200+.")
    elif record_count < 100:
        print(f"\n⚠️  Only {record_count} records. Recommend 100-200+ for effective training.")

    if warnings:
        print(f"\n⚠️  {len(warnings)} cross-reference warning(s):")
        for w in warnings[:20]:
            print(f"  {w}")
        if len(warnings) > 20:
            print(f"  ... and {len(warnings) - 20} more")

    # Empty-leaf detection. Agent-side dedup sometimes reduces rare tools
    # (e.g. `think`) to 0 records, leaving the leaf unseen by training.
    # Flag every leaf with fewer than --min-per-leaf records.
    empty_leaves: list[str] = []
    under_leaves: list[tuple[str, int]] = []
    if leaf_topics is not None:
        for leaf_id in leaf_topics:
            cnt = topic_counts.get(leaf_id, 0)
            if cnt == 0:
                empty_leaves.append(leaf_id)
            elif cnt < min_per_leaf:
                under_leaves.append((leaf_id, cnt))

    if empty_leaves or under_leaves:
        print(
            f"\n⚠️  Leaf coverage: {len(empty_leaves)} empty, "
            f"{len(under_leaves)} under min={min_per_leaf}"
        )
        for lid in empty_leaves[:20]:
            print(f"  EMPTY  {lid}")
        for lid, cnt in under_leaves[:20]:
            print(f"  UNDER  {lid}: {cnt}/{min_per_leaf}")

        # Auto-repair from decision-points.jsonl if requested
        if repair_from and repair_from.exists():
            print(f"\n→ Repairing from {repair_from.name} (min per leaf={min_per_leaf})")
            dp_by_topic: dict[str, list[dict]] = {}
            with repair_from.open() as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        dp = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    topic = dp.get("topic", "")
                    if topic:
                        dp_by_topic.setdefault(topic, []).append(dp)

            restored = 0
            with file_path.open("a") as out:
                for lid in empty_leaves + [x[0] for x in under_leaves]:
                    need = min_per_leaf - topic_counts.get(lid, 0)
                    pool = dp_by_topic.get(lid) or []
                    for dp in pool[:need]:
                        # Avoid re-appending records already in the file
                        if dp.get("id") and dp["id"] in ids_seen:
                            continue
                        out.write(json.dumps(dp, ensure_ascii=False) + "\n")
                        ids_seen.add(dp.get("id", ""))
                        restored += 1
                        topic_counts[lid] = topic_counts.get(lid, 0) + 1
            print(f"  Restored {restored} record(s) from decision-points for empty/under leaves")
        elif empty_leaves:
            # No repair source — surface as warning, not a hard error, to
            # avoid blocking runs where a leaf is genuinely rare. Agent is
            # expected to acknowledge or re-upload.
            warnings.append(
                f"{len(empty_leaves)} leaf topic(s) have 0 records: "
                f"{', '.join(empty_leaves[:5])}. "
                f"Re-run with --repair-from <decision-points.jsonl> to auto-restore."
            )

    from pipeline_journal import find_project_dir, log_milestone
    proj = find_project_dir(file_path)

    if all_errors:
        print(f"\n❌ {len(all_errors)} error(s) found:")
        for err in all_errors[:20]:
            print(f"  {err}")
        if len(all_errors) > 20:
            print(f"  ... and {len(all_errors) - 20} more")
        if proj:
            log_milestone(proj, "step_5_5_validate", "validate_dataset", "fail",
                           f"Validation FAILED: {len(all_errors)} errors in {record_count} records",
                           {"total": record_count, "errors": len(all_errors)})
        sys.exit(1)
    else:
        print(f"\n✅ All records valid!")
        if proj:
            log_milestone(proj, "step_5_5_validate", "validate_dataset", "completed",
                           f"Validation PASSED: {record_count} records, {len(topic_counts)} topics, all valid",
                           {"total": record_count, "topics": len(topic_counts), "topic_counts": dict(topic_counts)})


if __name__ == "__main__":
    main()
