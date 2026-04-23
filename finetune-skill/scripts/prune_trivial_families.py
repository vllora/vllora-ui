#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""prune_trivial_families.py — Drop paraphrase-family records where the base
model already scores ≥ pass_threshold on EVERY variant.

Why: DAPO (arXiv:2503.14476) filters all-correct groups dynamically. "Hard
Examples Are All You Need" (arXiv:2508.14094) shows Base-Right examples
produce ~17pp weaker training signal than Base-Wrong (0.70 vs 0.84 on GSM8K
Qwen3-4B). A paraphrase family where every scored variant is ≥ 0.95 is
guaranteed to produce zero-variance K rollouts at training time — they will
be filtered out anyway. Prune them at dataset-construction time to save:
  - Rollout compute (K=8 inference calls per variant, repeated epochs)
  - Gradient steps wasted on zero-advantage groups

Family identification: records sharing the `trace-<hash>` prefix are variants
of the same underlying trajectory (with different `-dp-N` decision points
and/or `-pN` paraphrase suffixes). A "paraphrase family" is the full set of
records sharing that hash.

This is DATA-SIDE only. The grader/reward is untouched. After running, re-run
`finetune.py upload-records --force` to sync the pruned dataset.

Defaults chosen to be conservative:
  - pass_threshold = 0.95 (matches SKILL.md "perfect" zone)
  - keep_representative = True (keep one variant per pruned family so the
    trajectory is not lost if the model capability changes mid-iteration)

Usage:
    uv run scripts/prune_trivial_families.py \\
        --records finetune-project/training.jsonl \\
        --eval-file test-runs/eval-001.json \\
        [--pass-threshold 0.95] \\
        [--no-representative] \\
        [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


# Trajectory families share the `trace-<hash>` prefix. We do NOT split by
# `-dp-N` because different DPs from the same trajectory are semantically
# related enough that if the model aces all DPs of a trace, the trace is
# trivial regardless of decision point. Tune this if we later find false
# positives (e.g. same trace has 1 trivial DP and 1 hard DP — currently we'd
# treat the whole family as trivial).
FAMILY_ID_RE = re.compile(r"^(trace-[0-9a-f]+)")


def family_key(record_id: str | None) -> str:
    m = FAMILY_ID_RE.match(record_id or "")
    return m.group(1) if m else (record_id or "")


def load_scores(eval_path: Path) -> dict[str, float]:
    """record_id → best score (max across epochs/runs if multiple)."""
    scores: dict[str, float] = {}
    data = json.loads(eval_path.read_text())
    for row in data.get("results") or []:
        rid = (row.get("row") or {}).get("id")
        if not rid:
            continue
        best = None
        for ep in (row.get("epochs") or {}).values():
            for run in ep or []:
                s = run.get("score")
                if isinstance(s, (int, float)):
                    best = s if best is None else max(best, s)
        if best is not None:
            scores[rid] = best
    return scores


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--records", required=True, type=Path, help="training.jsonl")
    ap.add_argument("--eval-file", required=True, type=Path, help="eval results JSON")
    ap.add_argument("--pass-threshold", type=float, default=0.95,
                    help="Score a variant must meet to count as 'perfect' (default 0.95)")
    ap.add_argument("--no-representative", action="store_true",
                    help="Drop the entire family rather than keeping one representative")
    ap.add_argument("--min-family-size", type=int, default=2,
                    help="Only prune families with at least this many scored variants (default 2)")
    ap.add_argument("--min-coverage", type=float, default=0.5,
                    help="Minimum fraction of family members that must be scored to consider "
                         "the family for pruning (default 0.5). Guards against pruning a family "
                         "because a small sample of scored variants was perfect while unscored "
                         "variants may not be. Set to 1.0 to require full coverage.")
    ap.add_argument("--dry-run", action="store_true", help="Report only, don't modify files")
    args = ap.parse_args()

    for p in (args.records, args.eval_file):
        if not p.exists():
            raise SystemExit(f"file not found: {p}")

    scores = load_scores(args.eval_file)
    print(f"Loaded {len(scores)} scored records from {args.eval_file.name}")

    # Group records by family, preserving order for representative selection
    records = [json.loads(line) for line in args.records.read_text().splitlines() if line.strip()]
    family_members: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        family_members[family_key(r.get("id"))].append(r)

    print(f"Loaded {len(records)} records across {len(family_members)} families")

    prunable_families: list[tuple[str, list[dict], list[float]]] = []
    coverage_skipped = 0
    for fkey, members in family_members.items():
        scored = [(m, scores[m["id"]]) for m in members if m.get("id") in scores]
        if len(scored) < args.min_family_size:
            continue
        coverage = len(scored) / len(members)
        if coverage < args.min_coverage:
            coverage_skipped += 1
            continue
        if all(s >= args.pass_threshold for _, s in scored):
            prunable_families.append((fkey, members, [s for _, s in scored]))

    if coverage_skipped:
        print(f"Skipped {coverage_skipped} candidate families with coverage < {args.min_coverage} "
              f"(not enough scored variants to judge; re-run after fuller eval)")

    if not prunable_families:
        print("No prunable families found — nothing to do.")
        return

    to_drop_ids: set[str] = set()
    for fkey, members, fam_scores in prunable_families:
        if args.no_representative:
            for m in members:
                to_drop_ids.add(m["id"])
        else:
            # Keep the first member (any deterministic choice); drop the rest.
            keep = members[0]
            for m in members[1:]:
                to_drop_ids.add(m["id"])
            # A family of size 1 shouldn't enter this loop (min_family_size≥2
            # filter above), but double-check we keep at least one representative.
            assert keep["id"] not in to_drop_ids

    print(f"\n=== Summary ===")
    print(f"Prunable families (all scored variants ≥ {args.pass_threshold}): {len(prunable_families)}")
    print(f"Records to drop: {len(to_drop_ids)}")
    if not args.no_representative:
        print(f"(Keeping one representative per family — use --no-representative to drop entire family)")

    print(f"\nTop 5 largest pruned families:")
    for fkey, members, fam_scores in sorted(prunable_families, key=lambda x: -len(x[1]))[:5]:
        print(f"  {fkey}: size={len(members)} scored_mean={sum(fam_scores)/len(fam_scores):.3f}")

    if args.dry_run:
        print("\n(dry-run — no files modified)")
        return

    kept_records = [r for r in records if r.get("id") not in to_drop_ids]
    args.records.write_text("\n".join(json.dumps(r) for r in kept_records) + "\n")
    print(f"\n✓ {args.records.name}: {len(records)} → {len(kept_records)} records "
          f"(-{len(records) - len(kept_records)})")


if __name__ == "__main__":
    main()
