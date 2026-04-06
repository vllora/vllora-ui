# /// script
# requires-python = ">=3.10"
# dependencies = ["requests"]
# ///
"""
Stage 2 of two-stage generation: derive complete ground truths for records
that were generated per-topic (Stage 1) without GT or with topic-scoped GT.

Reads training.jsonl, sends each record's input to an LLM with a topic-agnostic
prompt, and writes back the complete GT. This prevents single-label suppression
(arXiv:2505.17510) where per-topic generation focuses on one label and drops others.

Usage:
  # Derive GTs for records without ground_truth
  python derive_ground_truth.py training.jsonl --gt-prompt "List ALL allergens..."

  # Re-derive GTs for ALL records (overwrite existing)
  python derive_ground_truth.py training.jsonl --gt-prompt "..." --overwrite

  # Only fix records where GT is incomplete (validate + fix mode)
  python derive_ground_truth.py training.jsonl --gt-prompt "..." --validate-only

  # Dry-run: show what would change without writing
  python derive_ground_truth.py training.jsonl --gt-prompt "..." --dry-run
"""

import argparse
import json
import sys
import time
from pathlib import Path

DEFAULT_BASE_URL = "http://localhost:9090"
DEFAULT_MODEL = "gpt-4.1-mini"


def derive_gt_for_record(
    record: dict,
    gt_prompt: str,
    base_url: str,
    model: str,
) -> str | None:
    """Call LLM to derive ground truth from record input (topic-agnostic).

    The GT prompt should instruct the LLM to identify ALL labels/entities
    in the input, without any topic context. Example:
    "List ALL allergens present in these ingredients. Use ONLY these names:
    milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame.
    If none: none. Output comma-separated, nothing else."
    """
    import requests

    messages = record.get("messages", [])
    if not messages:
        return None

    # Extract user message (the input to analyze)
    user_msg = None
    system_msg = None
    for m in messages:
        if m.get("role") == "user":
            user_msg = m.get("content", "")
        elif m.get("role") == "system":
            system_msg = m.get("content", "")

    if not user_msg:
        return None

    # Build the GT derivation prompt — topic-agnostic
    derivation_messages = [
        {"role": "system", "content": gt_prompt},
        {"role": "user", "content": user_msg},
    ]

    try:
        resp = requests.post(
            f"{base_url}/v1/chat/completions",
            json={
                "model": model,
                "messages": derivation_messages,
                "temperature": 0.0,
                "max_tokens": 200,
            },
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()
        gt = result["choices"][0]["message"]["content"].strip()
        return gt
    except Exception as e:
        print(f"  Warning: LLM call failed for {record.get('id', '?')}: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Derive complete ground truths for training records (Stage 2 of two-stage generation)"
    )
    parser.add_argument("file", help="Path to training.jsonl")
    parser.add_argument(
        "--gt-prompt", required=True,
        help="System prompt for GT derivation. Must be topic-agnostic — instruct LLM to find ALL labels. "
             "Example: 'List ALL allergens in these ingredients using ONLY: milk, eggs, fish, shellfish, "
             "tree nuts, peanuts, wheat, soybeans, sesame. If none: none. Comma-separated, nothing else.'"
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model for GT derivation (default: {DEFAULT_MODEL})")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Gateway URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--overwrite", action="store_true", help="Re-derive GT for ALL records (overwrite existing)")
    parser.add_argument("--validate-only", action="store_true",
                        help="Compare derived GT with existing GT, report mismatches but don't change records")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    parser.add_argument("--parallel", type=int, default=1, help="Number of parallel LLM calls (default: 1)")
    parser.add_argument("--normalize", action="store_true", default=True,
                        help="Normalize GT format: lowercase, comma-space-separated, sorted (default: True)")
    parser.add_argument("--no-normalize", dest="normalize", action="store_false",
                        help="Skip GT normalization")
    parser.add_argument("--output", default=None, help="Output file (default: overwrite input file)")
    args = parser.parse_args()

    input_path = Path(args.file)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Load records
    records = []
    with open(input_path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    print(f"Loaded {len(records)} records from {input_path}")

    # Determine which records need GT derivation
    if args.overwrite:
        to_process = records
        print(f"Mode: overwrite — re-deriving GT for ALL {len(records)} records")
    else:
        to_process = [r for r in records if not r.get("ground_truth")]
        existing = len(records) - len(to_process)
        print(f"Mode: fill — {len(to_process)} records without GT, {existing} already have GT")
        if not to_process and not args.validate_only:
            print("Nothing to do — all records have GT. Use --overwrite to re-derive, or --validate-only to check.")
            sys.exit(0)

    if args.validate_only:
        to_process = [r for r in records if r.get("ground_truth")]
        print(f"Mode: validate — checking {len(to_process)} records with existing GT")

    # Process records
    changed = 0
    mismatches = 0
    errors = 0
    start_time = time.time()

    for i, record in enumerate(to_process):
        rid = record.get("id", f"record-{i}")

        derived_gt = derive_gt_for_record(record, args.gt_prompt, args.base_url, args.model)

        if derived_gt is None:
            errors += 1
            continue

        existing_gt = record.get("ground_truth", "")

        # Normalize GT format if enabled (default: True)
        if args.normalize and derived_gt:
            derived_gt = _format_gt(derived_gt)

        if args.validate_only:
            # Compare derived vs existing
            if _normalize_gt(derived_gt) != _normalize_gt(existing_gt):
                mismatches += 1
                print(f"  MISMATCH [{rid}]: existing=\"{existing_gt}\" derived=\"{derived_gt}\"")
        else:
            if _normalize_gt(derived_gt) != _normalize_gt(existing_gt):
                if args.dry_run:
                    print(f"  WOULD CHANGE [{rid}]: \"{existing_gt}\" → \"{derived_gt}\"")
                else:
                    record["ground_truth"] = derived_gt
                changed += 1

        # Progress
        if (i + 1) % 20 == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed
            remaining = (len(to_process) - i - 1) / rate if rate > 0 else 0
            print(f"  [{i + 1}/{len(to_process)}] {rate:.1f} records/sec, ~{remaining:.0f}s remaining",
                  file=sys.stderr)

    elapsed = time.time() - start_time
    print(f"\nDone in {elapsed:.1f}s")

    if args.validate_only:
        print(f"Validated: {len(to_process)} records, {mismatches} mismatches, {errors} errors")
        if mismatches > 0:
            mismatch_rate = mismatches / len(to_process) * 100
            print(f"Mismatch rate: {mismatch_rate:.1f}%")
            if mismatch_rate > 10:
                print(f"⚠ HIGH MISMATCH RATE — {mismatch_rate:.0f}% of GTs are incomplete. "
                      f"Run without --validate-only to fix, or use --overwrite to re-derive all.",
                      file=sys.stderr)
                sys.exit(2)
        sys.exit(0)

    if args.dry_run:
        print(f"Dry run: {changed} records would change, {errors} errors")
        sys.exit(0)

    # Write output
    output_path = Path(args.output) if args.output else input_path
    with open(output_path, "w") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"Updated: {changed} records changed, {errors} errors")
    print(f"Saved to {output_path}")

    if changed > 0:
        change_rate = changed / len(to_process) * 100
        print(f"Change rate: {change_rate:.1f}% ({changed}/{len(to_process)})")

    # Auto-journal milestone
    from pipeline_journal import find_project_dir, log_milestone
    proj = find_project_dir(output_path)
    if proj:
        log_milestone(proj, "step_4_generation", "derive_ground_truth", "completed",
                       f"GT derived for {len(records)} records: {changed} changed, {errors} errors. "
                       f"Mode: {'overwrite' if args.overwrite else 'fill missing only'}.",
                       {"total": len(records), "processed": len(to_process), "changed": changed,
                        "errors": errors, "mode": "overwrite" if args.overwrite else "fill_missing"})


def _normalize_gt(gt: str) -> str:
    """Normalize GT for comparison: lowercase, sort labels, strip whitespace."""
    if not gt:
        return ""
    labels = [l.strip().lower() for l in gt.split(",")]
    return ", ".join(sorted(set(labels)))


def _format_gt(gt: str) -> str:
    """Format GT for consistency: lowercase, comma-space-separated, sorted, deduplicated."""
    if not gt:
        return ""
    gt_lower = gt.strip().lower()
    if gt_lower == "none" or gt_lower == "none.":
        return "none"
    labels = [l.strip().lower() for l in gt.split(",") if l.strip()]
    return ", ".join(sorted(set(labels)))


if __name__ == "__main__":
    main()
