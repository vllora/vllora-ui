# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Pre-eval data quality gate for the vLLora finetune pipeline.

Validates training data quality BEFORE spending on evaluation or training.
Catches issues that waste expensive GPU hours: vague ground truths,
prompt-answer misalignment, near-duplicate prompts, topic imbalance,
and low semantic diversity.

Gates are ordered by cost (cheapest first):
  Gate 1: Structural        (free)  — dedup, length, format, topic balance, ground truth
  Gate 2: Diversity          (free)  — trigram-based semantic diversity & redundancy
  Gate 3: Ground Truth       ($$)   — LLM scores each ground truth for specificity
  Gate 4: Alignment          ($$)   — LLM checks if ground truth answers the prompt
  Gate 5: Completion Length  (free)  — estimates if max_output_tokens is large enough

Usage:
  python3 data_quality_gate.py training.jsonl
  python3 data_quality_gate.py training.jsonl --topics topics.json --parts all-parts-index.json
  python3 data_quality_gate.py training.jsonl --gate structural          # run one gate only
  python3 data_quality_gate.py training.jsonl --gate structural,diversity # run specific gates
  python3 data_quality_gate.py training.jsonl --llm-gates                # include LLM gates (3 & 4)
  python3 data_quality_gate.py training.jsonl --sample 30                # LLM-score 30 records (default)
  python3 data_quality_gate.py training.jsonl --json                     # machine-readable output
  python3 data_quality_gate.py training.jsonl --save report.json         # save full report

Research basis:
  - "Hard Examples Are All You Need" (arXiv:2508.14094): difficulty distribution matters
  - "No Prompt Left Behind" (arXiv:2509.21880): zero-variance prompt detection
  - "Synthetic Eggs in Many Baskets" (arXiv:2511.01490): diversity prevents collapse
  - "What Matters in LLM-generated Data" (arXiv:2506.19262): diversity > quality > complexity
  - DeepSeek-R1 (arXiv:2501.12948): rejection sampling + LLM-as-judge for data curation
  - OpenAI RFT Guide: "invest in data quality before adding more compute"
  - DOTS+RR (arXiv:2506.05316): difficulty-targeted selection reduces training time 23-62%

Exit codes:
  0 — PASS (all gates passed)
  1 — FAIL (structural gate failed — must fix before proceeding)
  2 — WARN (soft issues found — review before proceeding)
"""

import argparse
import json
import math
import os
import statistics
import sys
from collections import Counter
from pathlib import Path

import requests

# ─────────────────────────────────────────────────────────────────────
# Thresholds — research-informed heuristics
# See reference/data-quality-gate.md for per-threshold citations.
# ─────────────────────────────────────────────────────────────────────

THRESHOLDS = {
    # Gate 1: Structural
    "min_records": 50,                  # GRPO needs enough prompts (OpenAI RFT)
    "min_user_prompt_chars": 20,        # Trivially short prompts yield no signal
    "max_user_prompt_chars": 8000,      # Excessively long prompts waste tokens
    "min_ground_truth_chars": 30,       # Ground truth must be substantive
    "min_ground_truth_frac": 0.70,      # >= 70% of records should have ground_truth
    "max_topic_dominance": 0.40,        # No single topic > 40% of records
    "min_topics": 3,                    # At least 3 leaf topics for diversity
    "min_records_per_topic": 5,         # Each topic needs enough examples
    # Gate 2: Diversity
    "max_near_dup_frac": 0.10,          # < 10% near-duplicate prompts
    "near_dup_threshold": 0.85,         # trigram Jaccard threshold for duplication
    "min_avg_pairwise_distance": 0.40,  # mean (1 - similarity) across prompt pairs
    # Gate 3: Ground Truth Quality (LLM-scored)
    "min_gt_quality_mean": 0.60,        # average GT quality score (0-1)
    "max_gt_low_quality_frac": 0.20,    # < 20% of GTs scoring below 0.4
    # Gate 4: Prompt-GT Alignment (LLM-scored)
    "min_alignment_mean": 0.60,         # average alignment score (0-1)
    "max_misaligned_frac": 0.15,        # < 15% of records with score < 0.4
    # Gate 5: Completion Length
    # Multiplier: model outputs are typically 1.5-3x longer than ground truth.
    # DAPO (arXiv:2503.14476) uses overlong soft-punishment zone at 16K-20K tokens
    # (~20% absolute zone, not a percentage-based buffer).
    # "Tricks or Traps" (arXiv:2508.08221, general RL survey including GRPO):
    # truncation causes "defective EOS token modeling" and introduces training noise.
    "gt_token_multiplier": 2.0,         # GT chars → estimated model tokens (chars/4 * multiplier)
    "truncation_warn_ratio": 0.05,      # WARN if estimated P95 exceeds max_output_tokens (even 5% is risky)
    "truncation_fail_ratio": 0.30,      # FAIL if >30% — high risk of widespread clipping
}

DEFAULT_GATEWAY_URL = "http://localhost:9090"


# ─────────────────────────────────────────────────────────────────────
# Data Loading
# ─────────────────────────────────────────────────────────────────────

def load_records(path: Path) -> list[dict]:
    """Load records from a JSONL file."""
    records = []
    for line in path.read_text().strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        records.append(json.loads(line))
    return records


def extract_user_prompt(record: dict) -> str:
    """Extract the last user message from a record."""
    for msg in reversed(record.get("messages", [])):
        if msg.get("role") == "user":
            return msg.get("content", "")
    return ""


def extract_system_prompt(record: dict) -> str:
    """Extract the system message from a record."""
    for msg in record.get("messages", []):
        if msg.get("role") == "system":
            return msg.get("content", "")
    return ""


def extract_ground_truth(record: dict) -> str:
    """Extract ground_truth from a record."""
    return record.get("ground_truth", "")


# ─────────────────────────────────────────────────────────────────────
# Gate 1: Structural Checks (free — no API calls)
# ─────────────────────────────────────────────────────────────────────

def gate_structural(records: list[dict], topics_data: list | None) -> dict:
    """Run structural validation checks on training data.

    Checks: record count, prompt length, ground truth presence/length,
    topic balance, duplicate IDs, empty content.
    """
    issues: list[dict] = []
    n = len(records)

    # 1. Record count
    if n < THRESHOLDS["min_records"]:
        issues.append({
            "severity": "hard",
            "check": "record_count",
            "message": f"Only {n} records — minimum {THRESHOLDS['min_records']} for GRPO",
            "value": n,
            "threshold": THRESHOLDS["min_records"],
        })

    # 2. Duplicate IDs
    ids = [r.get("id", "") for r in records if r.get("id")]
    dup_ids = [rid for rid, count in Counter(ids).items() if count > 1]
    if dup_ids:
        issues.append({
            "severity": "hard",
            "check": "duplicate_ids",
            "message": f"{len(dup_ids)} duplicate ID(s): {dup_ids[:5]}",
            "value": len(dup_ids),
            "records": dup_ids[:10],
        })

    # 3. Prompt length checks
    short_prompts = []
    long_prompts = []
    empty_prompts = []
    for i, r in enumerate(records):
        prompt = extract_user_prompt(r)
        rid = r.get("id", f"record-{i}")
        if not prompt.strip():
            empty_prompts.append(rid)
        elif len(prompt.strip()) < THRESHOLDS["min_user_prompt_chars"]:
            short_prompts.append(rid)
        elif len(prompt.strip()) > THRESHOLDS["max_user_prompt_chars"]:
            long_prompts.append(rid)

    if empty_prompts:
        issues.append({
            "severity": "hard",
            "check": "empty_prompts",
            "message": f"{len(empty_prompts)} record(s) with empty user prompts",
            "value": len(empty_prompts),
            "records": empty_prompts[:10],
        })
    if short_prompts:
        issues.append({
            "severity": "soft",
            "check": "short_prompts",
            "message": f"{len(short_prompts)} record(s) with prompts < {THRESHOLDS['min_user_prompt_chars']} chars",
            "value": len(short_prompts),
            "records": short_prompts[:10],
        })

    # 4. Ground truth presence and quality
    gt_records = [r for r in records if extract_ground_truth(r).strip()]
    gt_frac = len(gt_records) / n if n > 0 else 0
    if gt_frac < THRESHOLDS["min_ground_truth_frac"]:
        issues.append({
            "severity": "soft",
            "check": "ground_truth_coverage",
            "message": f"Only {gt_frac:.0%} of records have ground_truth (recommend >= {THRESHOLDS['min_ground_truth_frac']:.0%})",
            "value": round(gt_frac, 3),
            "threshold": THRESHOLDS["min_ground_truth_frac"],
        })

    short_gts = []
    for i, r in enumerate(records):
        gt = extract_ground_truth(r).strip()
        rid = r.get("id", f"record-{i}")
        if gt and len(gt) < THRESHOLDS["min_ground_truth_chars"]:
            short_gts.append(rid)
    if short_gts:
        issues.append({
            "severity": "soft",
            "check": "short_ground_truths",
            "message": f"{len(short_gts)} record(s) with ground_truth < {THRESHOLDS['min_ground_truth_chars']} chars",
            "value": len(short_gts),
            "records": short_gts[:10],
        })

    # 5. Topic balance
    topic_counts = Counter(r.get("topic", "unknown") for r in records)
    num_topics = len(topic_counts)

    if num_topics < THRESHOLDS["min_topics"] and n >= THRESHOLDS["min_records"]:
        issues.append({
            "severity": "soft",
            "check": "topic_count",
            "message": f"Only {num_topics} topic(s) — recommend >= {THRESHOLDS['min_topics']} for diversity",
            "value": num_topics,
            "threshold": THRESHOLDS["min_topics"],
        })

    if topic_counts and n > 0:
        max_topic, max_count = topic_counts.most_common(1)[0]
        dominance = max_count / n
        if dominance > THRESHOLDS["max_topic_dominance"]:
            issues.append({
                "severity": "soft",
                "check": "topic_dominance",
                "message": f"Topic '{max_topic}' has {dominance:.0%} of records (max {THRESHOLDS['max_topic_dominance']:.0%})",
                "value": round(dominance, 3),
                "threshold": THRESHOLDS["max_topic_dominance"],
                "topic": max_topic,
            })

    # Thin topics
    thin_topics = {t: c for t, c in topic_counts.items() if c < THRESHOLDS["min_records_per_topic"]}
    if thin_topics:
        issues.append({
            "severity": "soft",
            "check": "thin_topics",
            "message": f"{len(thin_topics)} topic(s) with < {THRESHOLDS['min_records_per_topic']} records",
            "value": len(thin_topics),
            "topics": dict(thin_topics),
        })

    # 6. Missing system prompts
    no_system = sum(1 for r in records if not extract_system_prompt(r).strip())
    if no_system > 0:
        issues.append({
            "severity": "soft",
            "check": "missing_system_prompts",
            "message": f"{no_system} record(s) missing system prompt",
            "value": no_system,
        })

    # Cross-reference topics if topics.json provided
    if topics_data is not None:
        valid_topic_ids = {t.get("id") for t in topics_data if isinstance(t, dict)}
        orphan_topics = set(topic_counts.keys()) - valid_topic_ids - {"unknown"}
        if orphan_topics:
            issues.append({
                "severity": "soft",
                "check": "orphan_topics",
                "message": f"{len(orphan_topics)} topic(s) in records not found in topics.json",
                "value": len(orphan_topics),
                "topics": list(orphan_topics)[:10],
            })

    hard_fails = [i for i in issues if i["severity"] == "hard"]
    soft_warns = [i for i in issues if i["severity"] == "soft"]

    return {
        "gate": "structural",
        "passed": len(hard_fails) == 0,
        "verdict": "FAIL" if hard_fails else ("WARN" if soft_warns else "PASS"),
        "stats": {
            "record_count": n,
            "ground_truth_coverage": round(gt_frac, 3),
            "topic_count": num_topics,
            "topic_distribution": dict(topic_counts.most_common()),
        },
        "issues": issues,
    }


# ─────────────────────────────────────────────────────────────────────
# Gate 2: Diversity Analysis (cheap — trigram-based, no API calls)
#
# Research: "Synthetic Eggs in Many Baskets" (arXiv:2511.01490) shows
# synthetic data diversity significantly affects distribution collapse.
# "What Matters" (arXiv:2506.19262): diversity > quality > complexity.
# ─────────────────────────────────────────────────────────────────────

def _trigrams(text: str) -> set[str]:
    """Extract character trigrams."""
    text = text.lower().strip()
    if len(text) < 3:
        return {text} if text else set()
    return {text[i:i + 3] for i in range(len(text) - 2)}


def _trigram_similarity(a: str, b: str) -> float:
    """Trigram Jaccard similarity."""
    ta, tb = _trigrams(a), _trigrams(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def gate_diversity(records: list[dict]) -> dict:
    """Analyze semantic diversity via trigram similarity.

    Checks: near-duplicate fraction, average pairwise distance,
    per-topic diversity, prompt type distribution.
    """
    issues: list[dict] = []
    prompts = [(r.get("id", f"r-{i}"), extract_user_prompt(r)) for i, r in enumerate(records)]
    prompts = [(rid, p) for rid, p in prompts if p.strip()]
    n = len(prompts)

    if n < 10:
        return {
            "gate": "diversity",
            "passed": True,
            "verdict": "SKIP",
            "reason": f"Too few records ({n}) for diversity analysis",
            "issues": [],
        }

    # Near-duplicate detection (same approach as deduplicate_records.py)
    threshold = THRESHOLDS["near_dup_threshold"]
    duplicates: list[dict] = []
    kept_indices: list[int] = []

    for i in range(n):
        is_dup = False
        for j in kept_indices:
            sim = _trigram_similarity(prompts[i][1], prompts[j][1])
            if sim >= threshold:
                duplicates.append({
                    "record": prompts[i][0],
                    "similar_to": prompts[j][0],
                    "similarity": round(sim, 3),
                })
                is_dup = True
                break
        if not is_dup:
            kept_indices.append(i)

    dup_frac = len(duplicates) / n
    if dup_frac > THRESHOLDS["max_near_dup_frac"]:
        issues.append({
            "severity": "soft",
            "check": "near_duplicates",
            "message": f"{len(duplicates)} near-duplicate prompts ({dup_frac:.0%}) — threshold {THRESHOLDS['max_near_dup_frac']:.0%}",
            "value": round(dup_frac, 3),
            "threshold": THRESHOLDS["max_near_dup_frac"],
            "duplicates": duplicates[:10],
        })

    # Pairwise diversity (sample-based for large datasets)
    # Sample up to 200 pairs for efficiency
    import random
    random.seed(42)
    sample_size = min(n, 100)
    sample_idx = random.sample(range(n), sample_size) if n > sample_size else list(range(n))

    distances = []
    for i_idx in range(len(sample_idx)):
        for j_idx in range(i_idx + 1, len(sample_idx)):
            sim = _trigram_similarity(prompts[sample_idx[i_idx]][1], prompts[sample_idx[j_idx]][1])
            distances.append(1.0 - sim)

    avg_distance = statistics.mean(distances) if distances else 0
    if avg_distance < THRESHOLDS["min_avg_pairwise_distance"]:
        issues.append({
            "severity": "soft",
            "check": "low_diversity",
            "message": f"Low prompt diversity (avg pairwise distance {avg_distance:.3f}, need >= {THRESHOLDS['min_avg_pairwise_distance']})",
            "value": round(avg_distance, 3),
            "threshold": THRESHOLDS["min_avg_pairwise_distance"],
        })

    # Per-topic diversity
    topic_prompts: dict[str, list[str]] = {}
    for r in records:
        topic = r.get("topic", "unknown")
        p = extract_user_prompt(r)
        if p.strip():
            topic_prompts.setdefault(topic, []).append(p)

    low_diversity_topics = []
    for topic, tps in topic_prompts.items():
        if len(tps) < 5:
            continue
        sample = tps[:20]  # cap for perf
        topic_dists = []
        for i in range(len(sample)):
            for j in range(i + 1, len(sample)):
                topic_dists.append(1.0 - _trigram_similarity(sample[i], sample[j]))
        if topic_dists:
            topic_avg = statistics.mean(topic_dists)
            if topic_avg < 0.35:
                low_diversity_topics.append({"topic": topic, "avg_distance": round(topic_avg, 3), "count": len(tps)})

    if low_diversity_topics:
        issues.append({
            "severity": "soft",
            "check": "low_topic_diversity",
            "message": f"{len(low_diversity_topics)} topic(s) with low internal diversity — prompts are too similar",
            "value": len(low_diversity_topics),
            "topics": low_diversity_topics,
        })

    # Prompt type distribution (if available in records)
    prompt_types = Counter(r.get("prompt_type", "unknown") for r in records)
    has_types = any(r.get("prompt_type") for r in records)

    return {
        "gate": "diversity",
        "passed": len(issues) == 0,
        "verdict": "WARN" if issues else "PASS",
        "stats": {
            "unique_prompts": len(kept_indices),
            "near_duplicates": len(duplicates),
            "near_duplicate_frac": round(dup_frac, 3),
            "avg_pairwise_distance": round(avg_distance, 3),
            "low_diversity_topics": len(low_diversity_topics),
            "prompt_type_distribution": dict(prompt_types) if has_types else None,
        },
        "issues": issues,
    }


# ─────────────────────────────────────────────────────────────────────
# Gate 3: Ground Truth Quality (LLM-scored)
#
# Research: OpenAI RFT Guide: "invest in data quality before adding
# more compute — have a domain expert relabel the noisy slice."
# DeepSeek-R1 (arXiv:2501.12948): rejection sampling + LLM-as-judge.
# ─────────────────────────────────────────────────────────────────────

def _call_llm(gateway_url: str, prompt: str, system: str = "", max_tokens: int = 300) -> str:
    """Call LLM via gateway for scoring."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        resp = requests.post(
            f"{gateway_url}/v1/chat/completions",
            json={
                "model": "gpt-4.1-mini",
                "messages": messages,
                "temperature": 0.0,
                "max_tokens": max_tokens,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"ERROR: {e}"


def gate_ground_truth_quality(
    records: list[dict], gateway_url: str, sample_size: int = 30,
) -> dict:
    """Score ground truth quality via LLM-as-judge.

    Evaluates: specificity (cites concrete rules/facts vs vague statements),
    completeness (covers the question), and actionability (useful for grading).
    """
    import random
    random.seed(42)

    gt_records = [r for r in records if extract_ground_truth(r).strip()]
    if not gt_records:
        return {
            "gate": "ground_truth_quality",
            "passed": True,
            "verdict": "SKIP",
            "reason": "No ground_truth fields found in records",
            "issues": [],
        }

    sample = random.sample(gt_records, min(sample_size, len(gt_records)))

    system = (
        "You are a training data quality auditor. Score the ground truth reference "
        "answer for a fine-tuning record. Your job is to assess whether this ground "
        "truth is specific enough to serve as a reliable grading reference.\n\n"
        "Score 0.0-1.0 on these criteria:\n"
        "- Specificity (0.4 weight): Does it cite concrete rules, facts, numbers, "
        "or regulations? Or is it vague/general?\n"
        "- Completeness (0.3 weight): Does it cover the key aspects the question asks about?\n"
        "- Actionability (0.3 weight): Could a grader use this to reliably distinguish "
        "good from bad model responses?\n\n"
        "Respond with ONLY a JSON object: {\"score\": 0.X, \"reason\": \"brief explanation\"}\n"
        "Do NOT include any other text."
    )

    scored: list[dict] = []
    low_quality: list[dict] = []

    for r in sample:
        rid = r.get("id", "unknown")
        topic = r.get("topic", "unknown")
        prompt = extract_user_prompt(r)
        gt = extract_ground_truth(r)

        user_msg = (
            f"Topic: {topic}\n"
            f"User prompt: {prompt[:500]}\n"
            f"Ground truth: {gt[:800]}\n\n"
            f"Score this ground truth."
        )

        raw = _call_llm(gateway_url, user_msg, system)
        try:
            # Parse JSON from response (handle markdown wrapping)
            text = raw.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            result = json.loads(text)
            score = float(result.get("score", 0))
            reason = result.get("reason", "")
        except (json.JSONDecodeError, ValueError, TypeError):
            score = 0.5
            reason = f"Parse error: {raw[:200]}"

        entry = {"record_id": rid, "topic": topic, "score": round(score, 2), "reason": reason}
        scored.append(entry)
        if score < 0.4:
            low_quality.append(entry)

    scores = [s["score"] for s in scored]
    mean_score = statistics.mean(scores) if scores else 0
    low_frac = len(low_quality) / len(scored) if scored else 0

    issues: list[dict] = []
    if mean_score < THRESHOLDS["min_gt_quality_mean"]:
        issues.append({
            "severity": "soft",
            "check": "gt_quality_mean",
            "message": f"Ground truth quality mean {mean_score:.2f} < {THRESHOLDS['min_gt_quality_mean']} — many GTs are vague or incomplete",
            "value": round(mean_score, 3),
            "threshold": THRESHOLDS["min_gt_quality_mean"],
        })
    if low_frac > THRESHOLDS["max_gt_low_quality_frac"]:
        issues.append({
            "severity": "soft",
            "check": "gt_low_quality_frac",
            "message": f"{low_frac:.0%} of sampled GTs scored < 0.4 (threshold {THRESHOLDS['max_gt_low_quality_frac']:.0%})",
            "value": round(low_frac, 3),
            "threshold": THRESHOLDS["max_gt_low_quality_frac"],
            "low_quality_records": [lq["record_id"] for lq in low_quality],
        })

    return {
        "gate": "ground_truth_quality",
        "passed": len(issues) == 0,
        "verdict": "WARN" if issues else "PASS",
        "stats": {
            "sampled": len(scored),
            "mean_score": round(mean_score, 3),
            "median_score": round(statistics.median(scores), 3) if scores else 0,
            "low_quality_count": len(low_quality),
            "low_quality_frac": round(low_frac, 3),
        },
        "scored_records": scored,
        "issues": issues,
    }


# ─────────────────────────────────────────────────────────────────────
# Gate 4: Prompt-Ground Truth Alignment (LLM-scored)
#
# Research: OpenAI RFT: "Check whether qualified human experts agree
# on the answers. If experts do not converge, the task is too ambiguous."
# ─────────────────────────────────────────────────────────────────────

def gate_alignment(
    records: list[dict], gateway_url: str, sample_size: int = 30,
) -> dict:
    """Check if ground truths actually answer the prompts.

    Detects: multi-part questions with partial answers, mismatched scope
    (question about X, answer about Y), opinion questions with factual
    answers, and missing aspects.
    """
    import random
    random.seed(43)  # different seed from GT quality gate

    gt_records = [r for r in records if extract_ground_truth(r).strip()]
    if not gt_records:
        return {
            "gate": "alignment",
            "passed": True,
            "verdict": "SKIP",
            "reason": "No ground_truth fields found in records",
            "issues": [],
        }

    sample = random.sample(gt_records, min(sample_size, len(gt_records)))

    system = (
        "You are a training data alignment auditor. Check whether the ground truth "
        "reference answer actually answers the user's question completely.\n\n"
        "Score 0.0-1.0:\n"
        "- 1.0: Ground truth fully addresses every aspect of the question\n"
        "- 0.7: Mostly aligned — covers the main question, minor gaps\n"
        "- 0.4: Partially aligned — addresses some aspects, misses key parts\n"
        "- 0.1: Misaligned — answers a different question or misses the point\n\n"
        "Focus on: Does the GT answer ALL parts of the question? Is the scope correct? "
        "Are there aspects the question asks about that the GT doesn't cover?\n\n"
        "Respond with ONLY a JSON object: {\"score\": 0.X, \"reason\": \"brief explanation\", "
        "\"missing_aspects\": [\"aspect1\", ...]}\n"
        "Do NOT include any other text."
    )

    scored: list[dict] = []
    misaligned: list[dict] = []

    for r in sample:
        rid = r.get("id", "unknown")
        topic = r.get("topic", "unknown")
        prompt = extract_user_prompt(r)
        gt = extract_ground_truth(r)

        user_msg = (
            f"User prompt: {prompt[:600]}\n\n"
            f"Ground truth answer: {gt[:800]}\n\n"
            f"Score the alignment between prompt and ground truth."
        )

        raw = _call_llm(gateway_url, user_msg, system)
        try:
            text = raw.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            result = json.loads(text)
            score = float(result.get("score", 0))
            reason = result.get("reason", "")
            missing = result.get("missing_aspects", [])
        except (json.JSONDecodeError, ValueError, TypeError):
            score = 0.5
            reason = f"Parse error: {raw[:200]}"
            missing = []

        entry = {
            "record_id": rid, "topic": topic,
            "score": round(score, 2), "reason": reason,
            "missing_aspects": missing,
        }
        scored.append(entry)
        if score < 0.4:
            misaligned.append(entry)

    scores = [s["score"] for s in scored]
    mean_score = statistics.mean(scores) if scores else 0
    misaligned_frac = len(misaligned) / len(scored) if scored else 0

    issues: list[dict] = []
    if mean_score < THRESHOLDS["min_alignment_mean"]:
        issues.append({
            "severity": "soft",
            "check": "alignment_mean",
            "message": f"Prompt-GT alignment mean {mean_score:.2f} < {THRESHOLDS['min_alignment_mean']} — many GTs don't fully answer the prompt",
            "value": round(mean_score, 3),
            "threshold": THRESHOLDS["min_alignment_mean"],
        })
    if misaligned_frac > THRESHOLDS["max_misaligned_frac"]:
        issues.append({
            "severity": "soft",
            "check": "misaligned_frac",
            "message": f"{misaligned_frac:.0%} of sampled records have misaligned GT (threshold {THRESHOLDS['max_misaligned_frac']:.0%})",
            "value": round(misaligned_frac, 3),
            "threshold": THRESHOLDS["max_misaligned_frac"],
            "misaligned_records": [m["record_id"] for m in misaligned],
        })

    return {
        "gate": "alignment",
        "passed": len(issues) == 0,
        "verdict": "WARN" if issues else "PASS",
        "stats": {
            "sampled": len(scored),
            "mean_score": round(mean_score, 3),
            "median_score": round(statistics.median(scores), 3) if scores else 0,
            "misaligned_count": len(misaligned),
            "misaligned_frac": round(misaligned_frac, 3),
        },
        "scored_records": scored,
        "issues": issues,
    }


# ─────────────────────────────────────────────────────────────────────
# Gate 5: Completion Length Estimation (free — no API calls)
#
# Research:
#   - DAPO (arXiv:2503.14476, GRPO variant): uses overlong soft-punishment
#     zone at 16K-20K tokens (~20% absolute zone). Overlong filtering masks
#     truncated completions from loss.
#   - "Tricks or Traps" (arXiv:2508.08221, general RL survey incl. GRPO):
#     truncation "prematurely terminates multi-step reasoning, causing
#     well-structured reasoning to be falsely labeled as negative samples."
#   - TRL mask_truncated_completions: zeros out truncated completions,
#     but when ALL are truncated → entire batch zeroed → NaN KL.
#     (Unsloth explicitly warns against this.)
# ─────────────────────────────────────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    """Rough token count estimate: ~4 chars per token for English.

    This is a fast heuristic — actual tokenizer counts vary by model,
    but for estimation purposes 4 chars/token is standard.
    """
    return max(1, len(text.strip()) // 4)


def gate_completion_length(
    records: list[dict], max_output_tokens: int,
) -> dict:
    """Estimate whether max_output_tokens is sufficient for training.

    Uses TWO signals to estimate required completion length:

    1. Ground truth length (lower bound) — the minimum content the model
       needs to produce. Model outputs are typically 1.5-3x longer than
       GT due to chain-of-thought, hedging, and formatting.

    2. System prompt complexity (task complexity signal) — long, detailed
       system prompts that instruct multi-step analysis (e.g., "audit
       12 rules simultaneously") require much longer outputs than simple
       Q&A prompts. We use system prompt length as a proxy for task
       complexity, which scales the GT multiplier.

    Combined estimate: GT_tokens * multiplier, where multiplier is
    adjusted upward for complex tasks (long system prompts).
    """
    issues: list[dict] = []

    gt_records = [r for r in records if extract_ground_truth(r).strip()]
    if not gt_records:
        return {
            "gate": "completion_length",
            "passed": True,
            "verdict": "SKIP",
            "reason": "No ground_truth fields — cannot estimate required length",
            "issues": [],
        }

    # Estimate token lengths from ground truths
    gt_token_lengths = [_estimate_tokens(extract_ground_truth(r)) for r in gt_records]

    # Estimate system prompt complexity
    sys_token_lengths = [_estimate_tokens(extract_system_prompt(r)) for r in gt_records]
    avg_sys_tokens = statistics.mean(sys_token_lengths) if sys_token_lengths else 0

    # Adaptive multiplier based on task complexity:
    # - Short system prompts (<100 tokens): simple Q&A → 2x GT
    # - Medium system prompts (100-250 tokens): structured task → 3x GT
    # - Long system prompts (>250 tokens): multi-step analysis → 5x GT
    #
    # Rationale: A multi-rule compliance system prompt is ~314 tokens
    # and instructs "comprehensive multi-rule audit" → model produces
    # 510+ token outputs from ~100 token GTs (5x multiplier). A simple
    # "answer the question" prompt would produce ~1.5-2x GT length.
    base_multiplier = THRESHOLDS["gt_token_multiplier"]
    if avg_sys_tokens > 250:
        multiplier = max(base_multiplier, 5.0)
    elif avg_sys_tokens > 100:
        multiplier = max(base_multiplier, 3.0)
    else:
        multiplier = base_multiplier

    # Estimated model output lengths (GT tokens * adaptive multiplier)
    estimated_lengths = [int(t * multiplier) for t in gt_token_lengths]

    # How many would be truncated?
    would_truncate = sum(1 for el in estimated_lengths if el > max_output_tokens)
    truncation_frac = would_truncate / len(estimated_lengths)

    # Stats
    gt_p50 = sorted(gt_token_lengths)[len(gt_token_lengths) // 2]
    gt_p95 = sorted(gt_token_lengths)[min(len(gt_token_lengths) - 1, int(len(gt_token_lengths) * 0.95))]
    est_p50 = int(gt_p50 * multiplier)
    est_p95 = int(gt_p95 * multiplier)
    recommended_min = int(gt_p95 * multiplier * 1.3)  # 30% headroom above P95 estimate (empirical heuristic)

    # Direct P95 check: if estimated P95 exceeds the limit, FAIL the gate.
    # Rationale: Insufficient max_output_tokens has caused 9-13 hours of wasted GPU
    # time due to 100% completion truncation from insufficient max_output_tokens.
    # A soft warning is not enough — the agent ignores it. This must block training.
    # DAPO (arXiv:2503.14476) uses overlong soft-punishment (absolute zone at
    # 16K-20K tokens). We apply the same principle at smaller scale with 30%
    # headroom above P95 — our heuristic, not a direct DAPO parameter.
    if est_p95 > max_output_tokens:
        issues.append({
            "severity": "hard",
            "check": "completion_p95_exceeds_limit",
            "message": (
                f"Estimated model P95={est_p95} tokens exceeds max_output_tokens={max_output_tokens}. "
                f"At least 5% of completions will be truncated — with GRPO's K=8 completions per prompt, "
                f"truncation corrupts the reward signal and wastes compute. "
                f"Set max_output_tokens >= {recommended_min}. "
                f"[Headroom heuristic inspired by DAPO arXiv:2503.14476 overlong handling]"
            ),
            "value": est_p95,
            "max_output_tokens": max_output_tokens,
            "recommended_min": recommended_min,
        })

    # Check thresholds
    if truncation_frac >= THRESHOLDS["truncation_fail_ratio"]:
        issues.append({
            "severity": "hard",
            "check": "completion_truncation_critical",
            "message": (
                f"max_output_tokens={max_output_tokens} is too low — "
                f"estimated {truncation_frac:.0%} of completions will be truncated. "
                f"GT P95={gt_p95} tokens, estimated model P95={est_p95} tokens. "
                f"100% truncation means ALL K=8 completions are cut off → grader scores incomplete "
                f"answers → zero useful gradient. Recommend >= {recommended_min} tokens. "
                f"[DAPO arXiv:2503.14476 uses overlong soft-punishment at 16K-20K; "
                f"'Tricks or Traps' arXiv:2508.08221 (general RL incl. GRPO): truncation causes defective EOS modeling]"
            ),
            "value": round(truncation_frac, 3),
            "threshold": THRESHOLDS["truncation_fail_ratio"],
            "max_output_tokens": max_output_tokens,
            "recommended_min": recommended_min,
        })
    elif truncation_frac >= THRESHOLDS["truncation_warn_ratio"]:
        issues.append({
            "severity": "soft",
            "check": "completion_truncation_risk",
            "message": (
                f"max_output_tokens={max_output_tokens} may be too low — "
                f"estimated {truncation_frac:.0%} of completions risk truncation. "
                f"GT P95={gt_p95} tokens, estimated model P95={est_p95} tokens. "
                f"Recommend >= {recommended_min} tokens to avoid clipping. "
                f"[Heuristic inspired by DAPO arXiv:2503.14476 overlong handling]"
            ),
            "value": round(truncation_frac, 3),
            "threshold": THRESHOLDS["truncation_warn_ratio"],
            "max_output_tokens": max_output_tokens,
            "recommended_min": recommended_min,
        })

    return {
        "gate": "completion_length",
        "passed": len([i for i in issues if i["severity"] == "hard"]) == 0,
        "verdict": "FAIL" if any(i["severity"] == "hard" for i in issues) else (
            "WARN" if issues else "PASS"
        ),
        "stats": {
            "max_output_tokens": max_output_tokens,
            "gt_token_p50": gt_p50,
            "gt_token_p95": gt_p95,
            "avg_system_prompt_tokens": round(avg_sys_tokens),
            "multiplier_used": multiplier,
            "multiplier_reason": (
                "complex task (system prompt > 250 tokens)" if avg_sys_tokens > 250
                else "structured task (system prompt > 100 tokens)" if avg_sys_tokens > 100
                else "simple task (short system prompt)"
            ),
            "estimated_model_p50": est_p50,
            "estimated_model_p95": est_p95,
            "recommended_min_tokens": recommended_min,
            "estimated_truncation_frac": round(truncation_frac, 3),
            "records_with_gt": len(gt_records),
        },
        "issues": issues,
    }


# ─────────────────────────────────────────────────────────────────────
# Source Accuracy Gate
# ─────────────────────────────────────────────────────────────────────


def gate_source_accuracy(
    records: list[dict],
    knowledge_dir: str,
    sample_size: int = 50,
) -> dict:
    """Verify ground truth numeric claims exist in linked source parts.

    Samples records, extracts numeric values from ground truths, and checks
    whether those values appear in the source material. Catches cascading
    errors from bad extraction (e.g., MCLG cited as MCL, shifted columns).

    This is a fast, offline check — no LLM calls needed.
    """
    import re

    kdir = Path(knowledge_dir)
    if not kdir.exists():
        return {
            "gate": "source_accuracy",
            "passed": True,
            "verdict": "SKIP",
            "stats": {"reason": "knowledge_dir not found"},
            "issues": [],
        }

    # Load all knowledge parts content, keyed by part ID
    part_contents: dict[str, str] = {}
    for kp_file in kdir.glob("*/knowledge_parts.json"):
        try:
            data = json.loads(kp_file.read_text())
            parts_list = data if isinstance(data, list) else data.get("parts", [])
            for p in parts_list:
                pid = p.get("id", "")
                if pid:
                    part_contents[pid] = p.get("content", "")
        except (json.JSONDecodeError, KeyError):
            pass

    if not part_contents:
        return {
            "gate": "source_accuracy",
            "passed": True,
            "verdict": "SKIP",
            "stats": {"reason": "no knowledge parts loaded"},
            "issues": [],
        }

    # Sample records that have ground_truth and source_parts
    candidates = [
        r for r in records
        if r.get("ground_truth") and r.get("source_parts")
    ]
    import random
    random.seed(42)
    sampled = random.sample(candidates, min(sample_size, len(candidates))) if candidates else []

    if not sampled:
        return {
            "gate": "source_accuracy",
            "passed": True,
            "verdict": "SKIP",
            "stats": {"reason": "no records with ground_truth + source_parts"},
            "issues": [],
        }

    # For each sampled record, extract numeric values from GT and check source
    total_checked = 0
    total_values = 0
    unverified_count = 0
    unverified_samples: list[dict] = []

    # Regex for numeric values with optional units
    num_pattern = re.compile(
        r'(?:^|[\s:=])(\d+(?:\.\d+)?)\s*'
        r'(?:mg/L|ug/L|µg/L|ppm|ppb|µg/m3|ug/m3|pCi/L|mg/kg|%|'
        r'mg/L|µg/m³|CFR|mcl|mclg)?',
        re.IGNORECASE,
    )

    for rec in sampled:
        gt = rec.get("ground_truth", "")
        source_part_ids = rec.get("source_parts", [])

        # Extract numeric values from GT (skip very common ones like 0, 1)
        gt_numbers = set()
        for match in num_pattern.finditer(gt):
            val = match.group(1)
            if val not in ("0", "1", "0.0", "1.0", "100"):
                gt_numbers.add(val)

        if not gt_numbers:
            continue

        total_checked += 1
        total_values += len(gt_numbers)

        # Gather source content for this record's linked parts
        source_text = ""
        for pid in source_part_ids:
            source_text += part_contents.get(pid, "") + "\n"

        # Check if each GT number appears in the source
        missing_values = []
        for val in gt_numbers:
            if val not in source_text:
                missing_values.append(val)

        if missing_values:
            unverified_count += 1
            if len(unverified_samples) < 10:
                user_msg = ""
                for m in rec.get("messages", []):
                    if m.get("role") == "user":
                        user_msg = m.get("content", "")[:80]
                unverified_samples.append({
                    "topic": rec.get("topic", "?"),
                    "prompt": user_msg,
                    "gt": gt[:120],
                    "missing_values": missing_values[:5],
                    "source_parts": len(source_part_ids),
                })

    # Compute accuracy rate
    if total_checked == 0:
        accuracy_rate = 1.0
    else:
        accuracy_rate = 1.0 - (unverified_count / total_checked)

    issues: list[dict] = []
    passed = True

    if accuracy_rate < 0.70:
        passed = False
        issues.append({
            "check": "source_accuracy",
            "severity": "hard",
            "message": (
                f"FAIL: {unverified_count}/{total_checked} sampled records ({1-accuracy_rate:.0%}) "
                f"have ground truth values NOT found in linked source parts. "
                f"Likely cause: extraction quality issues (shifted table columns, merged content). "
                f"Fix extraction first, then regenerate records."
            ),
        })
    elif accuracy_rate < 0.85:
        issues.append({
            "check": "source_accuracy",
            "severity": "soft",
            "message": (
                f"WARN: {unverified_count}/{total_checked} sampled records ({1-accuracy_rate:.0%}) "
                f"have ground truth values not confirmed in source. "
                f"Some may be LLM-computed (e.g., exceedance amounts) — verify manually."
            ),
        })

    return {
        "gate": "source_accuracy",
        "passed": passed,
        "verdict": "FAIL" if not passed else ("WARN" if issues else "PASS"),
        "stats": {
            "sampled": len(sampled),
            "checked": total_checked,
            "total_values": total_values,
            "unverified": unverified_count,
            "accuracy_rate": round(accuracy_rate, 4),
        },
        "issues": issues,
        "samples": unverified_samples,
    }


# ─────────────────────────────────────────────────────────────────────
# Orchestrator
# ─────────────────────────────────────────────────────────────────────

def run_gates(
    records: list[dict],
    topics_data: list | None,
    gates: list[str],
    gateway_url: str,
    sample_size: int,
    max_output_tokens: int = 512,
    knowledge_dir: str | None = None,
) -> dict:
    """Run selected quality gates and produce a combined verdict."""
    results: list[dict] = []

    if "structural" in gates:
        results.append(gate_structural(records, topics_data))

    if "diversity" in gates:
        results.append(gate_diversity(records))

    if "completion_length" in gates:
        results.append(gate_completion_length(records, max_output_tokens))

    if "source_accuracy" in gates and knowledge_dir:
        results.append(gate_source_accuracy(records, knowledge_dir, sample_size))

    if "ground_truth_quality" in gates:
        results.append(gate_ground_truth_quality(records, gateway_url, sample_size))

    if "alignment" in gates:
        results.append(gate_alignment(records, gateway_url, sample_size))

    # Combine verdicts: FAIL if any gate FAIL, WARN if any WARN, else PASS
    all_issues = []
    for r in results:
        all_issues.extend(r.get("issues", []))

    hard_fails = [i for i in all_issues if i.get("severity") == "hard"]
    soft_warns = [i for i in all_issues if i.get("severity") == "soft"]

    if hard_fails:
        verdict = "FAIL"
    elif soft_warns:
        verdict = "WARN"
    else:
        verdict = "PASS"

    return {
        "verdict": verdict,
        "gates_run": [r["gate"] for r in results],
        "gates": {r["gate"]: r for r in results},
        "summary": {
            "total_issues": len(all_issues),
            "hard_fails": len(hard_fails),
            "soft_warnings": len(soft_warns),
        },
        "fix_priorities": _prioritize_fixes(all_issues),
    }


def _prioritize_fixes(issues: list[dict]) -> list[dict]:
    """Rank issues by fix priority (hard first, then by impact)."""
    # Hard failures first, then by severity and type
    priority_order = {
        "source_accuracy": 0,                  # Highest — wrong facts in GT = wrong model
        "completion_truncation_critical": 1,  # Guarantees wasted training
        "record_count": 2,
        "duplicate_ids": 3,
        "empty_prompts": 4,
        "completion_truncation_risk": 5,
        "gt_quality_mean": 6,
        "misaligned_frac": 7,
        "gt_low_quality_frac": 8,
        "alignment_mean": 9,
        "near_duplicates": 10,
        "low_diversity": 11,
        "ground_truth_coverage": 12,
        "topic_dominance": 13,
        "short_ground_truths": 14,
        "thin_topics": 15,
        "short_prompts": 16,
        "low_topic_diversity": 17,
    }

    sorted_issues = sorted(
        issues,
        key=lambda i: (
            0 if i["severity"] == "hard" else 1,
            priority_order.get(i["check"], 99),
        ),
    )

    priorities = []
    for i, issue in enumerate(sorted_issues[:10]):
        priorities.append({
            "priority": i + 1,
            "severity": issue["severity"],
            "check": issue["check"],
            "action": issue["message"],
        })
    return priorities


# ─────────────────────────────────────────────────────────────────────
# Display
# ─────────────────────────────────────────────────────────────────────

def print_report(report: dict) -> None:
    """Print a human-readable report."""
    verdict = report["verdict"]
    icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌"}.get(verdict, "?")

    print(f"\n{'=' * 60}")
    print(f"DATA QUALITY GATE — {icon} {verdict}")
    print(f"{'=' * 60}")

    for gate_name, gate in report["gates"].items():
        g_icon = {"PASS": "✅", "WARN": "⚠️", "FAIL": "❌", "SKIP": "⏭️"}.get(gate["verdict"], "?")
        print(f"\n{g_icon} Gate: {gate_name} — {gate['verdict']}")

        if "stats" in gate:
            for k, v in gate["stats"].items():
                if v is not None:
                    if isinstance(v, dict):
                        print(f"  {k}:")
                        for sk, sv in list(v.items())[:10]:
                            print(f"    {sk}: {sv}")
                    else:
                        print(f"  {k}: {v}")

        for issue in gate.get("issues", []):
            sev = "🔴" if issue["severity"] == "hard" else "🟡"
            print(f"  {sev} {issue['message']}")
            if "records" in issue:
                print(f"     Records: {issue['records'][:5]}")

        # Show source_accuracy samples
        if gate_name == "source_accuracy" and gate.get("samples"):
            print(f"  Sample unverified records:")
            for s in gate["samples"][:5]:
                print(f"    [{s['topic']}] {s['prompt']}")
                print(f"      GT: {s['gt']}")
                print(f"      Missing values: {s['missing_values']}")

    if report["fix_priorities"]:
        print(f"\n{'─' * 60}")
        print("FIX PRIORITIES (address in order):")
        for p in report["fix_priorities"]:
            sev = "🔴" if p["severity"] == "hard" else "🟡"
            print(f"  {p['priority']}. {sev} [{p['check']}] {p['action']}")

    print(f"\n{'─' * 60}")
    print(f"Gates run: {', '.join(report['gates_run'])}")
    print(f"Issues: {report['summary']['hard_fails']} hard, {report['summary']['soft_warnings']} soft")
    print(f"Verdict: {icon} {verdict}")

    if verdict == "PASS":
        print("\nData quality sufficient — proceed to evaluation (Step 7).")
    elif verdict == "WARN":
        print("\nSoft issues found — review fix priorities. You may proceed, but fixing these first will reduce iteration cost.")
    else:
        print("\nHard failures found — fix before proceeding to evaluation.")


# ─────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pre-eval data quality gate for vLLora finetune pipeline",
    )
    parser.add_argument("input", help="Path to training.jsonl")
    parser.add_argument("--topics", help="Path to topics.json for cross-referencing")
    parser.add_argument("--parts", help="Path to all-parts-index.json (for source_accuracy gate)")
    parser.add_argument("--knowledge-dir", help="Path to knowledge/ directory (for source_accuracy gate)")
    parser.add_argument(
        "--gate", default=None,
        help="Comma-separated gates to run (structural, diversity, completion_length, source_accuracy, ground_truth_quality, alignment). Default: structural,diversity,completion_length",
    )
    parser.add_argument(
        "--llm-gates", action="store_true",
        help="Include LLM-scored gates (ground_truth_quality, alignment). Requires gateway.",
    )
    parser.add_argument(
        "--all-gates", action="store_true",
        help="Run all gates including LLM-scored ones.",
    )
    parser.add_argument(
        "--sample", type=int, default=30,
        help="Number of records to sample for LLM gates (default: 30)",
    )
    parser.add_argument(
        "--gateway-url", default=DEFAULT_GATEWAY_URL,
        help=f"Gateway URL for LLM calls (default: {DEFAULT_GATEWAY_URL})",
    )
    parser.add_argument(
        "--max-output-tokens", type=int, default=512,
        help="Planned max_output_tokens for training (default: 512). "
             "Used by completion_length gate to estimate truncation risk.",
    )
    parser.add_argument("--json", action="store_true", help="Output JSON only")
    parser.add_argument("--save", help="Save full report to file")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    records = load_records(input_path)
    if not records:
        print("Error: No records found in input file", file=sys.stderr)
        sys.exit(1)

    # Load topics if provided
    topics_data = None
    if args.topics:
        tp = Path(args.topics)
        if tp.exists():
            data = json.loads(tp.read_text())
            topics_data = data if isinstance(data, list) else data.get("topics", [])

    # Determine which gates to run
    if args.gate:
        gates = [g.strip() for g in args.gate.split(",")]
    elif args.all_gates:
        gates = ["structural", "diversity", "completion_length", "source_accuracy", "ground_truth_quality", "alignment"]
    elif args.llm_gates:
        gates = ["structural", "diversity", "completion_length", "source_accuracy", "ground_truth_quality", "alignment"]
    else:
        # Default: cheap gates only (all free, no LLM)
        default_gates = ["structural", "diversity", "completion_length"]
        if args.knowledge_dir:
            default_gates.append("source_accuracy")
        gates = default_gates

    if not args.json:
        print(f"Running data quality gate on {len(records)} records...")
        print(f"Gates: {', '.join(gates)}")
        if any(g in gates for g in ["ground_truth_quality", "alignment"]):
            print(f"LLM sample size: {args.sample}")

    report = run_gates(
        records, topics_data, gates, args.gateway_url, args.sample,
        args.max_output_tokens, knowledge_dir=args.knowledge_dir,
    )

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)

    if args.save:
        save_path = Path(args.save)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_text(json.dumps(report, indent=2))
        if not args.json:
            print(f"\nFull report saved to {save_path}")

    # Exit code
    if report["verdict"] == "FAIL":
        sys.exit(1)
    elif report["verdict"] == "WARN":
        sys.exit(2)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
