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
    "chunk_text",
    "source_file",
    "topic_path",
    "judge_accuracy",
    "judge_completeness",
    "judge_groundedness",
    "judge_quality",
    "judge_reason",
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

        for i, msg in enumerate(messages):
            if not isinstance(msg, dict):
                errors.append(f"Line {line_num}, message {i}: Must be an object")
                continue
            if "role" not in msg:
                errors.append(f"Line {line_num}, message {i}: Missing 'role'")
            if "content" not in msg:
                errors.append(f"Line {line_num}, message {i}: Missing 'content'")
            elif not msg["content"] or not msg["content"].strip():
                errors.append(f"Line {line_num}, message {i}: Empty content")

        if "system" not in roles:
            errors.append(f"Line {line_num}: No system message found")
        if "user" not in roles:
            errors.append(f"Line {line_num}: No user message found")
        if "assistant" in roles:
            errors.append(f"Line {line_num}: Contains assistant message (RFT uses prompts only, remove assistant messages)")

        # Check user message is not trivially short
        user_messages = [m for m in messages if isinstance(m, dict) and m.get("role") == "user"]
        for um in user_messages:
            content = um.get("content", "")
            if content and len(content.strip()) < 10:
                errors.append(f"Line {line_num}: User message too short ({len(content.strip())} chars) — likely not a useful prompt")

    if "id" not in record:
        errors.append(f"Line {line_num}: Missing recommended field 'id'")

    # Validate ground_truth type and emptiness only.
    # Short GT length is NOT an error — classification tasks have short GTs
    # by design (e.g., "fish" = 4 chars). Length checks are handled by
    # data_quality_gate.py which has task-aware thresholds.
    gt = record.get("ground_truth")
    if gt is not None:
        if not isinstance(gt, str):
            errors.append(f"Line {line_num}: 'ground_truth' must be a string")
        elif len(gt.strip()) == 0:
            errors.append(f"Line {line_num}: 'ground_truth' is empty")

    return errors


def load_valid_topics(topics_path: Path) -> tuple[set[str], set[str]]:
    """Load topic IDs from topics.json. Returns (all_ids, leaf_ids)."""
    data = json.loads(topics_path.read_text())
    topics = data if isinstance(data, list) else data.get("topics", [])
    all_ids = {t["id"] for t in topics if isinstance(t, dict) and "id" in t}
    parent_ids = {t.get("parent_id") for t in topics if isinstance(t, dict) and t.get("parent_id")}
    leaf_ids = all_ids - parent_ids
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
                           f"Validation FAILED: {len(all_errors)} errors in {len(records)} records",
                           {"total": len(records), "errors": len(all_errors)})
        sys.exit(1)
    else:
        print(f"\n✅ All records valid!")
        if proj:
            log_milestone(proj, "step_5_5_validate", "validate_dataset", "completed",
                           f"Validation PASSED: {len(records)} records, {len(topic_counts)} topics, all valid",
                           {"total": len(records), "topics": len(topic_counts), "topic_counts": dict(topic_counts)})


if __name__ == "__main__":
    main()
