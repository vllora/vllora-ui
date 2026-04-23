# /// script
# dependencies = []
# ///
"""Convert NeMo Data Designer output rows into vLLora training.jsonl format.

Reads NeMo dataset rows (JSONL or JSON API response), validates required fields,
optionally filters by judge scores, and writes training.jsonl + metadata sidecar.
When exact rag-retrieval metadata is present, it also preserves per-record
source_parts without a second search pass and can export relations.json.

Usage:
  uv run scripts/convert_nemo_rows.py \
    --input finetune-project/nemo-job-dataset-page-1.json \
    --output finetune-project/training.jsonl

  uv run scripts/convert_nemo_rows.py \
    --input finetune-project/nemo-job-dataset-page-1.json \
    --output finetune-project/training.jsonl \
    --min-answerable 1.0 --min-groundedness 0.5 --min-specificity 1.0 \
    --ground-truth-field reference_answer \
    --relations-output finetune-project/relations.json

  cat nemo-rows.jsonl | uv run scripts/convert_nemo_rows.py \
    --output finetune-project/training.jsonl

Exit codes:
  0 - success (all rows converted)
  1 - validation errors found (partial output written)
  2 - no input data
"""

import json
import sys
from pathlib import Path


# Training fields that go into messages[] — passthrough record fields are handled separately
TRAINING_FIELDS = {"id", "system_prompt", "user_message"}
RECORD_PASSTHROUGH_FIELDS = {"topic"}
DEFAULT_EXACT_SOURCE_FIELDS = (
    ("question_chunks_matches_json", "question_chunks_part_ids"),
    ("retrieved_chunks_matches_json", "retrieved_chunks_part_ids"),
)
DEFAULT_RELATION_FIELDS = ("retrieved_chunks_matches_json", "retrieved_chunks_part_ids")

# Any column name that starts with these prefixes is a score/judge field → metadata sidecar
_SCORE_PREFIXES = ("judge_", "score_")


def _is_metadata_field(name: str) -> bool:
    """Return True if this column should go to the metadata sidecar, not training records."""
    return name not in TRAINING_FIELDS | RECORD_PASSTHROUGH_FIELDS


def load_nemo_rows(source: "Path | None") -> list[dict]:
    """Load NeMo rows from a file or stdin.

    Supports two formats:
    - Raw JSONL (one JSON object per line)
    - NeMo dataset API response: {"dataset": [...], "total": N}
    """
    if source:
        text = source.read_text()
    else:
        text = sys.stdin.read()

    text = text.strip()
    if not text:
        return []

    # Try JSON first (API response wrapper)
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "dataset" in data:
            return data["dataset"]
        if isinstance(data, list):
            return data
        # Single object — wrap it
        if isinstance(data, dict):
            return [data]
    except json.JSONDecodeError:
        pass

    # Fall back to JSONL
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def validate_nemo_row(
    row: dict,
    index: int,
    ground_truth_field: str | None = None,
) -> list[str]:
    """Validate a single NeMo row has required fields for conversion."""
    errors: list[str] = []

    sp = row.get("system_prompt")
    if not sp or not isinstance(sp, str) or not sp.strip():
        errors.append(f"Row {index}: Missing or empty 'system_prompt'")

    um = row.get("user_message")
    if not um or not isinstance(um, str) or not um.strip():
        errors.append(f"Row {index}: Missing or empty 'user_message'")
    elif len(um.strip()) < 10:
        errors.append(f"Row {index}: 'user_message' too short ({len(um.strip())} chars)")

    topic = row.get("topic")
    if topic is not None and not isinstance(topic, str):
        errors.append(f"Row {index}: 'topic' must be a string when present")

    if ground_truth_field:
        ground_truth = row.get(ground_truth_field)
        if ground_truth is not None and not isinstance(ground_truth, str):
            errors.append(
                f"Row {index}: ground truth field '{ground_truth_field}' must be a string when present"
            )

    return errors


def filter_by_judge_scores(
    rows: list[dict],
    thresholds: dict[str, float],
) -> tuple[list[dict], int]:
    """Filter rows by judge/score column thresholds.

    thresholds: mapping of column_name → minimum value (inclusive).
    Returns (kept_rows, dropped_count).
    """
    if not thresholds:
        return rows, 0

    kept = []
    for row in rows:
        passed = True
        for col, min_val in thresholds.items():
            score = row.get(col)
            if isinstance(score, (int, float)) and score < min_val:
                passed = False
                break
        if passed:
            kept.append(row)

    return kept, len(rows) - len(kept)


def recover_source_parts(
    user_message: str,
    workflow_id: str,
    gateway_url: str,
    top_k: int = 5,
) -> list[str]:
    """Recover source_parts by re-querying the gateway with the user_message.

    Legacy fallback for older NeMo datasets that do not include exact
    retrieval metadata columns.
    """
    import requests

    try:
        resp = requests.post(
            f"{gateway_url}/finetune/workflows/{workflow_id}/knowledge/search",
            json={"phrase": user_message, "top_k": top_k},
            timeout=15,
        )
        resp.raise_for_status()
        matches = resp.json().get("matches", [])
        part_ids = []
        for m in matches:
            part = m.get("part", {})
            part_id = part.get("id", "")
            # Skip parts marked irrelevant
            ext_meta = part.get("extraction_metadata")
            if isinstance(ext_meta, dict) and ext_meta.get("relevant") is False:
                continue
            if part_id:
                part_ids.append(part_id)
        return part_ids
    except Exception:
        return []


def _load_jsonish(value):
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None
    return None


def _part_ids_from_matches(value) -> list[str] | None:
    parsed = _load_jsonish(value)
    if not isinstance(parsed, list):
        return None

    part_ids: list[str] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        if item.get("relevant") is False:
            continue
        part_id = item.get("part_id")
        if isinstance(part_id, str) and part_id and part_id not in part_ids:
            part_ids.append(part_id)
    return part_ids


def _part_ids_from_field(value) -> list[str]:
    parsed = _load_jsonish(value)
    if not isinstance(parsed, list):
        return []

    part_ids: list[str] = []
    for item in parsed:
        if isinstance(item, str) and item and item not in part_ids:
            part_ids.append(item)
    return part_ids


def extract_exact_source_parts(
    row: dict,
    field_pairs: tuple[tuple[str, str], ...] = DEFAULT_EXACT_SOURCE_FIELDS,
) -> list[str]:
    """Extract exact retrieved source part IDs from NeMo metadata columns.

    Prefers compact match metadata so we can filter parts explicitly marked
    irrelevant. Falls back to plain part ID arrays when only those exist.
    """
    for matches_field, part_ids_field in field_pairs:
        part_ids = _part_ids_from_matches(row.get(matches_field))
        if part_ids is not None:
            if part_ids:
                return part_ids
            continue

        part_ids = _part_ids_from_field(row.get(part_ids_field))
        if part_ids:
            return part_ids

    return []


def build_relations(
    rows: list[dict],
    matches_field: str = DEFAULT_RELATION_FIELDS[0],
    part_ids_field: str = DEFAULT_RELATION_FIELDS[1],
) -> list[dict]:
    """Build flat relations.json entries from exact NeMo retrieval metadata."""
    seen: set[tuple[str, str]] = set()
    relations: list[dict] = []

    for row in rows:
        topic = row.get("topic")
        if not isinstance(topic, str) or not topic.strip():
            continue

        part_ids = _part_ids_from_matches(row.get(matches_field))
        if part_ids is None:
            part_ids = _part_ids_from_field(row.get(part_ids_field))

        for part_id in part_ids:
            key = (topic, part_id)
            if key in seen:
                continue
            seen.add(key)
            relations.append(
                {
                    "topic_identifier": topic,
                    "part_identifier": part_id,
                }
            )

    relations.sort(key=lambda rel: (rel["topic_identifier"], rel["part_identifier"]))
    return relations


def convert_row(
    row: dict,
    index: int,
    ground_truth_field: str | None = None,
    system_prompt_override: str | None = None,
    source_parts: list[str] | None = None,
) -> dict:
    """Convert a single NeMo row to vLLora training.jsonl format."""
    system_prompt = system_prompt_override or row["system_prompt"]

    record: dict = {
        "messages": [
            {"role": "system", "content": system_prompt.strip()},
            {"role": "user", "content": row["user_message"].strip()},
        ],
        "id": row.get("id", f"nemo-{index + 1:04d}"),
    }

    topic = row.get("topic")
    if isinstance(topic, str) and topic.strip():
        record["topic"] = topic.strip()

    if source_parts:
        record["source_parts"] = source_parts

    if ground_truth_field:
        ground_truth = row.get(ground_truth_field)
        if isinstance(ground_truth, str) and ground_truth.strip():
            record["ground_truth"] = ground_truth.strip()

    return record


def extract_metadata(row: dict, index: int) -> dict:
    """Extract non-training fields into a metadata record.

    Any column that is not id/system_prompt/user_message goes to metadata.
    This works with any recipe column layout — no hardcoded field names.
    """
    meta: dict = {"id": row.get("id", f"nemo-{index + 1:04d}")}
    for key, val in row.items():
        if not _is_metadata_field(key) or val is None:
            continue
        meta[key] = val
    return meta


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Convert NeMo Data Designer rows to vLLora training.jsonl"
    )
    parser.add_argument(
        "--input", type=Path, default=None,
        help="Path to NeMo dataset file (JSONL or JSON). Omit to read stdin.",
    )
    parser.add_argument(
        "--output", type=Path, required=True,
        help="Path to write training.jsonl",
    )
    parser.add_argument(
        "--metadata", type=Path, default=None,
        help="Path to write nemo-metadata.jsonl sidecar (default: next to output)",
    )
    parser.add_argument(
        "--no-metadata", action="store_true",
        help="Skip metadata sidecar generation",
    )
    # RAGAS-aligned filter flags (match template recipe column names)
    parser.add_argument(
        "--min-answerable", type=float, default=None,
        help="Drop rows with judge_answerable below this threshold (AspectCritic; use 1.0)",
    )
    parser.add_argument(
        "--min-groundedness", type=float, default=None,
        help="Drop rows with judge_groundedness below this threshold (ResponseGroundedness; use 0.5)",
    )
    parser.add_argument(
        "--min-specificity", type=float, default=None,
        help="Drop rows with judge_specificity below this threshold (Tele-Specificity; use 1.0)",
    )
    parser.add_argument(
        "--min-relevancy", type=float, default=None,
        help="Drop rows with score_relevancy below this threshold (ResponseRelevancy; use 0.5)",
    )
    # Backward-compat aliases (map to RAGAS columns)
    parser.add_argument(
        "--min-accuracy", type=float, default=None,
        help="Alias for --min-answerable (backward compat)",
    )
    parser.add_argument(
        "--min-completeness", type=float, default=None,
        help="Alias for --min-groundedness (backward compat)",
    )
    parser.add_argument(
        "--include-ground-truth", action="store_true",
        help="Backward-compatible alias for --ground-truth-field reference_answer",
    )
    parser.add_argument(
        "--ground-truth-field", type=str, default=None,
        help="Copy this NeMo text column into the training record's ground_truth field",
    )
    parser.add_argument(
        "--system-prompt-override", type=str, default=None,
        help="Override all system prompts with this text",
    )
    parser.add_argument(
        "--workflow-id", type=str, default=None,
        help="Workflow ID — enables source_parts recovery via gateway search (recommended for traceability)",
    )
    parser.add_argument(
        "--gateway-url", type=str, default="http://localhost:9090",
        help="Gateway URL for source_parts recovery (default: http://localhost:9090)",
    )
    parser.add_argument(
        "--source-parts-top-k", type=int, default=5,
        help="Number of parts to recover per record via gateway search (default: 5)",
    )
    parser.add_argument(
        "--relations-output", type=Path, default=None,
        help=(
            "Optional path to write relations.json using exact NeMo retrieval metadata "
            "(topic -> retrieved part IDs from retrieved_chunks_* columns)."
        ),
    )
    args = parser.parse_args()

    # Build filter thresholds — RAGAS flags take precedence over aliases
    thresholds: dict[str, float] = {}
    answerable = args.min_answerable if args.min_answerable is not None else args.min_accuracy
    groundedness = args.min_groundedness if args.min_groundedness is not None else args.min_completeness
    if answerable is not None:
        thresholds["judge_answerable"] = answerable
    if groundedness is not None:
        thresholds["judge_groundedness"] = groundedness
    if args.min_specificity is not None:
        thresholds["judge_specificity"] = args.min_specificity
    if args.min_relevancy is not None:
        thresholds["score_relevancy"] = args.min_relevancy

    ground_truth_field = args.ground_truth_field
    if ground_truth_field is None and args.include_ground_truth:
        ground_truth_field = "reference_answer"

    # Load rows
    rows = load_nemo_rows(args.input)
    if not rows:
        print("Error: No input rows found", file=sys.stderr)
        sys.exit(2)

    print(f"Loaded {len(rows)} NeMo rows")

    # Filter by judge scores
    rows, dropped = filter_by_judge_scores(rows, thresholds)
    if dropped:
        print(f"Filtered: {dropped} rows dropped by judge score thresholds")

    if not rows:
        print("Error: All rows filtered out — lower thresholds or check judge scores", file=sys.stderr)
        sys.exit(2)

    # Recover source_parts via gateway search only when exact NeMo metadata is absent.
    recover_parts = args.workflow_id is not None
    if recover_parts:
        print(
            "Source traceability: prefer exact NeMo retrieval metadata, "
            f"fallback to gateway search (top_k={args.source_parts_top_k})"
        )

    # Validate and convert
    all_errors: list[str] = []
    records: list[dict] = []
    metadata_rows: list[dict] = []
    valid_rows: list[dict] = []
    exact_source_count = 0
    recovered_source_count = 0

    for i, row in enumerate(rows):
        errors = validate_nemo_row(row, i + 1, ground_truth_field=ground_truth_field)
        if errors:
            all_errors.extend(errors)
            continue

        source_parts = extract_exact_source_parts(row)
        if source_parts:
            exact_source_count += 1
        elif recover_parts:
            source_parts = recover_source_parts(
                user_message=row.get("user_message", ""),
                workflow_id=args.workflow_id,
                gateway_url=args.gateway_url,
                top_k=args.source_parts_top_k,
            )
            if source_parts:
                recovered_source_count += 1

        records.append(convert_row(
            row, i,
            ground_truth_field=ground_truth_field,
            system_prompt_override=args.system_prompt_override,
            source_parts=source_parts,
        ))
        valid_rows.append(row)
        metadata_rows.append(extract_metadata(row, i))

    # Write training.jsonl
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")

    # Write metadata sidecar
    if not args.no_metadata:
        meta_path = args.metadata or args.output.parent / "nemo-metadata.jsonl"
        with meta_path.open("w") as f:
            for meta in metadata_rows:
                f.write(json.dumps(meta) + "\n")
        print(f"Metadata: {len(metadata_rows)} rows → {meta_path}")

    if args.relations_output is not None:
        relations = build_relations(valid_rows)
        if not relations:
            print(
                "Error: --relations-output requested but no exact NeMo retrieval metadata "
                "was found in retrieved_chunks_part_ids/retrieved_chunks_matches_json",
                file=sys.stderr,
            )
            sys.exit(1)
        args.relations_output.parent.mkdir(parents=True, exist_ok=True)
        args.relations_output.write_text(json.dumps(relations, indent=2) + "\n")
        print(f"Relations:    {len(relations)} → {args.relations_output}")

    # Summary
    print(f"\n{'='*50}")
    print(f"Conversion complete")
    print(f"{'='*50}")
    print(f"Input rows:    {len(rows)}")
    if dropped:
        print(f"Filtered out:  {dropped}")
    print(f"Valid records: {len(records)}")
    print(f"Output:        {args.output}")
    if ground_truth_field:
        print(f"Ground truth:  {ground_truth_field} -> ground_truth")
    if exact_source_count:
        print(f"Exact source_parts: {exact_source_count}")
    if recovered_source_count:
        print(f"Recovered source_parts: {recovered_source_count}")

    if all_errors:
        print(f"\n{len(all_errors)} validation error(s):", file=sys.stderr)
        for err in all_errors[:20]:
            print(f"  {err}", file=sys.stderr)
        if len(all_errors) > 20:
            print(f"  ... and {len(all_errors) - 20} more", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"\nAll {len(records)} rows converted successfully!")


if __name__ == "__main__":
    main()
