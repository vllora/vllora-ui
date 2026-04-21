# /// script
# requires-python = ">=3.10"
# ///
"""
Remove near-duplicate records from training.jsonl.

Uses character-level trigram similarity (no external deps) to detect
records with overlapping user prompts. Keeps the first occurrence,
removes duplicates.

Usage:
    python3 deduplicate_records.py training.jsonl
    python3 deduplicate_records.py training.jsonl --threshold 0.80 --output deduped.jsonl
    python3 deduplicate_records.py training.jsonl --dry-run  # preview only
"""

import argparse
import json
import sys
from pathlib import Path


def trigrams(text: str) -> set[str]:
    """Extract character trigrams from text."""
    text = text.lower().strip()
    if len(text) < 3:
        return {text}
    return {text[i:i + 3] for i in range(len(text) - 2)}


def similarity(a: str, b: str) -> float:
    """Trigram Jaccard similarity between two strings."""
    ta = trigrams(a)
    tb = trigrams(b)
    if not ta or not tb:
        return 0.0
    intersection = len(ta & tb)
    union = len(ta | tb)
    return intersection / union if union > 0 else 0.0


def extract_user_prompt(record: dict) -> str:
    """Build a dedup signature from ALL user turns, concatenated.

    Why not just the first user turn: for multi-turn tool-calling records
    produced by `paraphrase_rare_topics.py`, variants are identical except
    for the LAST user turn (Trajectory2Task rewrites only the final turn
    to preserve full prior context + ground-truth). A first-turn-only
    signature would collapse those legitimate variants into one and erase
    the paraphrase rebalancing.

    For single-turn records this reduces to the first (and only) user
    turn — backward-compatible with text-only datasets.
    """
    messages = record.get("messages", [])
    user_turns = [
        msg.get("content", "") for msg in messages if msg.get("role") == "user"
    ]
    # Concatenate with a sentinel so two turns "hi"+"there" don't collide
    # with one turn "hithere".
    return "\n\0\n".join(t for t in user_turns if t)


def deduplicate(
    records: list[dict],
    threshold: float,
) -> tuple[list[dict], list[tuple[int, int, float]]]:
    """Remove near-duplicate records. Returns (kept, duplicates_info)."""
    kept: list[dict] = []
    kept_prompts: list[str] = []
    duplicates: list[tuple[int, int, float]] = []  # (dup_idx, kept_idx, sim_score)

    for i, record in enumerate(records):
        prompt = extract_user_prompt(record)
        if not prompt:
            kept.append(record)
            kept_prompts.append("")
            continue

        is_dup = False
        for j, kp in enumerate(kept_prompts):
            if not kp:
                continue
            sim = similarity(prompt, kp)
            if sim >= threshold:
                duplicates.append((i, j, sim))
                is_dup = True
                break

        if not is_dup:
            kept.append(record)
            kept_prompts.append(prompt)

    return kept, duplicates


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove near-duplicate records")
    parser.add_argument("input", help="Path to training.jsonl")
    parser.add_argument("--output", "-o", help="Output path (default: overwrite input)")
    parser.add_argument("--threshold", type=float, default=0.85,
                        help="Similarity threshold for duplicate detection (default: 0.85)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview duplicates without modifying files")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Load records
    records: list[dict] = []
    for line in input_path.read_text().strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        records.append(json.loads(line))

    if not records:
        print("No records found")
        sys.exit(0)

    print(f"Loaded {len(records)} records (threshold: {args.threshold})")

    # Deduplicate
    kept, duplicates = deduplicate(records, args.threshold)

    if not duplicates:
        print(f"No duplicates found — all {len(records)} records are unique")
        from pipeline_journal import find_project_dir, log_milestone
        proj = find_project_dir(input_path)
        if proj:
            log_milestone(proj, "step_4_generation", "deduplicate", "completed",
                           f"Dedup: 0 duplicates found — all {len(records)} records unique (threshold={args.threshold})")
        sys.exit(0)

    # Report duplicates
    print(f"\nFound {len(duplicates)} duplicate(s):")
    for dup_idx, kept_idx, sim in duplicates[:20]:
        dup_prompt = extract_user_prompt(records[dup_idx])[:80]
        kept_prompt = extract_user_prompt(kept[kept_idx])[:80]
        dup_topic = records[dup_idx].get("topic", "?")
        kept_topic = kept[kept_idx].get("topic", "?")
        print(f"  #{dup_idx} ({dup_topic}) ≈ #{kept_idx} ({kept_topic}) sim={sim:.2f}")
        print(f"    dup:  {dup_prompt}")
        print(f"    kept: {kept_prompt}")
    if len(duplicates) > 20:
        print(f"  ... and {len(duplicates) - 20} more")

    # Topic breakdown
    topic_counts: dict[str, int] = {}
    for dup_idx, _, _ in duplicates:
        topic = records[dup_idx].get("topic", "unknown")
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
    print(f"\nDuplicates by topic:")
    for topic, count in sorted(topic_counts.items(), key=lambda x: -x[1]):
        print(f"  {topic}: {count}")

    print(f"\nResult: {len(records)} → {len(kept)} records ({len(duplicates)} removed)")

    if args.dry_run:
        print("\n(dry run — no files modified)")
        sys.exit(0)

    # Write output
    output_path = Path(args.output) if args.output else input_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as f:
        for record in kept:
            f.write(json.dumps(record) + "\n")

    print(f"Wrote {len(kept)} records to {output_path}")

    from pipeline_journal import find_project_dir, log_milestone
    proj = find_project_dir(output_path)
    if proj:
        log_milestone(proj, "step_4_generation", "deduplicate", "completed",
                       f"Dedup: {len(records)}→{len(kept)} records ({len(duplicates)} removed, threshold={args.threshold})",
                       {"before": len(records), "after": len(kept), "removed": len(duplicates),
                        "by_topic": topic_counts})


if __name__ == "__main__":
    main()
