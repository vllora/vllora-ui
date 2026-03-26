# /// script
# dependencies = []
# ///
"""Convert NeMo Data Designer output rows into vLLora training.jsonl format.

Reads NeMo dataset rows (JSONL or JSON API response), validates required fields,
optionally filters by judge scores, and writes training.jsonl + metadata sidecar.

Usage:
  uv run scripts/convert_nemo_rows.py \
    --input finetune-project/nemo-job-dataset-page-1.json \
    --output finetune-project/training.jsonl

  uv run scripts/convert_nemo_rows.py \
    --input finetune-project/nemo-job-dataset-page-1.json \
    --output finetune-project/training.jsonl \
    --min-accuracy 0.8 --include-ground-truth

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


# Fields that belong in metadata, not training messages
METADATA_FIELDS = {
    "reference_answer",
    "supporting_passage",
    "citation",
    "source_file",
    "judge_accuracy",
    "judge_completeness",
    "judge_groundedness",
    "judge_reason",
}

TRAINING_FIELDS = {"id", "system_prompt", "user_message"}


def load_nemo_rows(source: Path | None) -> list[dict]:
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


def validate_nemo_row(row: dict, index: int) -> list[str]:
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

    return errors


def filter_by_judge_scores(
    rows: list[dict],
    min_accuracy: float | None,
    min_completeness: float | None,
) -> tuple[list[dict], int]:
    """Filter rows by judge score thresholds. Returns (kept, dropped_count)."""
    if min_accuracy is None and min_completeness is None:
        return rows, 0

    kept = []
    for row in rows:
        if min_accuracy is not None:
            score = row.get("judge_accuracy")
            if isinstance(score, (int, float)) and score < min_accuracy:
                continue
        if min_completeness is not None:
            score = row.get("judge_completeness")
            if isinstance(score, (int, float)) and score < min_completeness:
                continue
        kept.append(row)

    return kept, len(rows) - len(kept)


def convert_row(
    row: dict,
    index: int,
    include_ground_truth: bool = False,
    system_prompt_override: str | None = None,
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

    if include_ground_truth:
        ra = row.get("reference_answer")
        if ra and isinstance(ra, str) and ra.strip():
            record["ground_truth"] = ra.strip()

    return record


def extract_metadata(row: dict, index: int) -> dict:
    """Extract non-training fields into a metadata record."""
    meta: dict = {"id": row.get("id", f"nemo-{index + 1:04d}")}
    for field in METADATA_FIELDS:
        val = row.get(field)
        if val is not None:
            meta[field] = val

    for key, val in row.items():
        if key in TRAINING_FIELDS or key in meta or val is None:
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
    parser.add_argument(
        "--min-accuracy", type=float, default=None,
        help="Drop rows with judge_accuracy below this threshold",
    )
    parser.add_argument(
        "--min-completeness", type=float, default=None,
        help="Drop rows with judge_completeness below this threshold",
    )
    parser.add_argument(
        "--include-ground-truth", action="store_true",
        help="Copy reference_answer into training record's ground_truth field",
    )
    parser.add_argument(
        "--system-prompt-override", type=str, default=None,
        help="Override all system prompts with this text",
    )
    args = parser.parse_args()

    # Load rows
    rows = load_nemo_rows(args.input)
    if not rows:
        print("Error: No input rows found", file=sys.stderr)
        sys.exit(2)

    print(f"Loaded {len(rows)} NeMo rows")

    # Filter by judge scores
    rows, dropped = filter_by_judge_scores(
        rows, args.min_accuracy, args.min_completeness
    )
    if dropped:
        print(f"Filtered: {dropped} rows dropped by judge score thresholds")

    if not rows:
        print("Error: All rows filtered out — lower thresholds or check judge scores", file=sys.stderr)
        sys.exit(2)

    # Validate and convert
    all_errors: list[str] = []
    records: list[dict] = []
    metadata_rows: list[dict] = []

    for i, row in enumerate(rows):
        errors = validate_nemo_row(row, i + 1)
        if errors:
            all_errors.extend(errors)
            continue

        records.append(convert_row(
            row, i,
            include_ground_truth=args.include_ground_truth,
            system_prompt_override=args.system_prompt_override,
        ))
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

    # Summary
    print(f"\n{'='*50}")
    print(f"Conversion complete")
    print(f"{'='*50}")
    print(f"Input rows:    {len(rows)}")
    if dropped:
        print(f"Filtered out:  {dropped}")
    print(f"Valid records: {len(records)}")
    print(f"Output:        {args.output}")

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
