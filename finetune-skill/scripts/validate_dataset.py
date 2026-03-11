# /// script
# dependencies = []
# ///
"""Validate a training JSONL file before upload.

Usage:
  uv run scripts/validate_dataset.py training.jsonl

Checks: valid JSON per line, required fields (messages, id), message structure
(role + content), system + user messages present, no assistant messages (RFT),
and prints summary stats.
"""

import json
import sys
from collections import Counter
from pathlib import Path


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

        if "system" not in roles:
            errors.append(f"Line {line_num}: No system message found")
        if "user" not in roles:
            errors.append(f"Line {line_num}: No user message found")
        if "assistant" in roles:
            errors.append(f"Line {line_num}: Contains assistant message (RFT uses prompts only, remove assistant messages)")

    if "id" not in record:
        errors.append(f"Line {line_num}: Missing recommended field 'id'")

    return errors


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: validate_dataset.py <file.jsonl>", file=sys.stderr)
        sys.exit(1)

    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    all_errors: list[str] = []
    record_count = 0
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
                record_id = record.get("id", "")
                if record_id:
                    if record_id in ids_seen:
                        duplicate_ids.append(record_id)
                    ids_seen.add(record_id)

                topic = record.get("topic", "")
                if topic:
                    topic_counts[topic] += 1
            except (json.JSONDecodeError, AttributeError):
                pass

    # Print results
    print(f"\n{'='*50}")
    print(f"Validation Results: {file_path.name}")
    print(f"{'='*50}")
    print(f"Total records: {record_count}")
    print(f"Unique IDs:    {len(ids_seen)}")

    if topic_counts:
        print(f"Topics found:  {len(topic_counts)}")
        for topic, count in topic_counts.most_common():
            print(f"  {topic}: {count}")

    if duplicate_ids:
        print(f"\n⚠️  Duplicate IDs: {len(duplicate_ids)}")
        for dup in duplicate_ids[:5]:
            print(f"  - {dup}")

    if record_count < 100:
        print(f"\n⚠️  Only {record_count} records. Recommend 100-200+ for effective training.")

    if all_errors:
        print(f"\n❌ {len(all_errors)} error(s) found:")
        for err in all_errors[:20]:
            print(f"  {err}")
        if len(all_errors) > 20:
            print(f"  ... and {len(all_errors) - 20} more")
        sys.exit(1)
    else:
        print(f"\n✅ All records valid!")


if __name__ == "__main__":
    main()
