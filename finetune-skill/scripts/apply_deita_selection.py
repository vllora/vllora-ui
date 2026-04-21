# /// script
# dependencies = []
# ///
"""Select distilabel text candidates using DEITA-inspired scoring and filtering."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from distilabel_shared import (  # noqa: E402
    read_jsonl,
    stable_record_signature,
    trigram_similarity,
    write_json,
    write_jsonl,
)


def _extract_user_prompt(record: dict) -> str:
    for message in record.get("messages", []):
        if message.get("role") == "user":
            return str(message.get("content", ""))
    return ""


def compute_complexity_score(record: dict) -> float:
    prompt = _extract_user_prompt(record)
    if not prompt:
        return 0.0
    lowered = prompt.lower()
    tokens = max(1, len(prompt.split()))
    multi_clause_markers = sum(
        lowered.count(marker)
        for marker in (" if ", " when ", " compare ", " why ", " how ", " given ", " exception ")
    )
    punctuation_bonus = 0.1 if "?" in prompt else 0.0
    length_score = min(1.0, tokens / 35)
    structure_score = min(1.0, multi_clause_markers / 3)
    return round(min(1.0, 0.55 * length_score + 0.35 * structure_score + punctuation_bonus), 4)


def compute_quality_score(record: dict) -> float:
    prompt = _extract_user_prompt(record).strip()
    gt = str(record.get("ground_truth", "")).strip()
    source_parts = record.get("source_parts", [])
    metadata = record.get("metadata", {})
    distilabel_meta = metadata.get("distilabel", {}) if isinstance(metadata, dict) else {}

    score = 0.0
    if len(prompt) >= 20:
        score += 0.3
    if len(gt) >= 30:
        score += 0.3
    elif gt:
        score += 0.15
    if isinstance(source_parts, list) and source_parts:
        score += 0.2
    if distilabel_meta.get("method"):
        score += 0.1

    prompt_terms = {term for term in prompt.lower().split() if len(term) > 3}
    gt_terms = {term for term in gt.lower().split() if len(term) > 3}
    if prompt_terms and gt_terms:
        overlap = len(prompt_terms & gt_terms) / max(1, len(prompt_terms))
        score += min(0.1, overlap)

    return round(min(1.0, score), 4)


def rank_record(record: dict) -> float:
    complexity = compute_complexity_score(record)
    quality = compute_quality_score(record)
    metadata = record.setdefault("metadata", {})
    distilabel_meta = metadata.setdefault("distilabel", {})
    distilabel_meta["candidate_score"] = round((complexity + quality) / 2, 4)
    return distilabel_meta["candidate_score"]


def select_records(
    records: list[dict],
    topic_targets: dict[str, int],
    diversity_threshold: float = 0.82,
) -> tuple[list[dict], dict]:
    ranked_by_topic: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        topic = str(record.get("topic", ""))
        ranked_by_topic[topic].append(record)

    selected: list[dict] = []
    drop_reasons: Counter[str] = Counter()
    topic_stats: dict[str, dict] = {}

    for topic, topic_records in ranked_by_topic.items():
        budget = int(topic_targets.get(topic, 0))
        scored = []
        for record in topic_records:
            score = rank_record(record)
            scored.append((score, record))
        scored.sort(key=lambda item: item[0], reverse=True)

        selected_topic: list[dict] = []
        seen_signatures: set[tuple[str, str, str]] = set()
        for score, record in scored:
            if len(selected_topic) >= budget:
                drop_reasons["over_budget_after_diversity_filtering"] += 1
                continue
            if compute_quality_score(record) < 0.45:
                drop_reasons["low_quality"] += 1
                continue
            if compute_complexity_score(record) < 0.20:
                drop_reasons["low_complexity"] += 1
                continue

            signature = stable_record_signature(record)
            if signature in seen_signatures:
                drop_reasons["near_duplicate"] += 1
                continue

            prompt = _extract_user_prompt(record)
            too_close = False
            for existing in selected_topic:
                if trigram_similarity(prompt, _extract_user_prompt(existing)) >= diversity_threshold:
                    too_close = True
                    break
            if too_close:
                drop_reasons["near_duplicate"] += 1
                continue

            metadata = record.setdefault("metadata", {})
            distilabel_meta = metadata.setdefault("distilabel", {})
            distilabel_meta["selection_reason"] = "deita_selected"
            selected_topic.append(record)
            selected.append(record)
            seen_signatures.add(signature)

        topic_scores = [rank_record(record) for _, record in scored]
        topic_stats[topic] = {
            "budget": budget,
            "candidates": len(topic_records),
            "selected": len(selected_topic),
            "avg_candidate_score": round(statistics.mean(topic_scores), 4) if topic_scores else 0.0,
        }

    report = {
        "selected_count": len(selected),
        "drop_reasons": dict(drop_reasons),
        "topic_stats": topic_stats,
    }
    return selected, report


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply DEITA-inspired selection to distilabel text candidates")
    parser.add_argument("--project-dir", default="finetune-project", help="Path to finetune-project")
    parser.add_argument("--input", help="Candidate JSONL path")
    parser.add_argument("--output", help="Selected JSONL path")
    parser.add_argument("--report", help="Selection report path")
    parser.add_argument("--final-output", help="Optional final training.jsonl path")
    parser.add_argument("--diversity-threshold", type=float, default=0.82)
    args = parser.parse_args()

    project_dir = Path(args.project_dir)
    workspace = project_dir / "distilabel"
    input_path = Path(args.input) if args.input else workspace / "text-candidates.jsonl"
    output_path = Path(args.output) if args.output else workspace / "text-selected.jsonl"
    report_path = Path(args.report) if args.report else workspace / "text-selection-report.json"
    metadata_path = workspace / "pipeline-metadata.json"
    final_output_path = Path(args.final_output) if args.final_output else None

    records = read_jsonl(input_path)
    if not records:
        print(f"Error: no candidate records found at {input_path}", file=sys.stderr)
        sys.exit(1)

    topic_targets = {}
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text())
        topic_targets = metadata.get("topic_targets", {}) if isinstance(metadata, dict) else {}
    if not topic_targets:
        topics = Counter(str(record.get("topic", "")) for record in records)
        topic_targets = {topic: max(1, math.ceil(count / 2)) for topic, count in topics.items()}

    selected, report = select_records(
        records=records,
        topic_targets=topic_targets,
        diversity_threshold=args.diversity_threshold,
    )

    write_jsonl(output_path, selected)
    write_json(report_path, report)
    if final_output_path:
        write_jsonl(final_output_path, selected)
    print(f"Selected {len(selected)} rows → {output_path}")


if __name__ == "__main__":
    main()
