# /// script
# requires-python = ">=3.10"
# ///
"""
trace_analyze.py — Analyze OTel GenAI traces to inform the PDF finetune pipeline.

Reads an OTel semconv JSON file and produces 4 artifacts that feed into
the PDF-based finetune pipeline:

  1. trace_priority.json  — per-topic frequency + failure rate + priority score
  2. trace_topics.json    — topics discovered in traces, coverage gaps vs PDF topics
  3. trace_prompts.json   — production system prompt (simplified) + seed user queries
  4. trace_grader_hints.json — failure dimensions + prompt rules + calibration pairs

This script is part of the unified finetune skill's auto-detection flow.
When the user provides both PDFs and traces, the skill runs this script
automatically before record generation.

Usage:
    python3 trace_analyze.py spans.json \\
        --output-dir finetune-project/ \\
        [--pdf-topics topics.json]    # optional: compare against PDF topics
        [--max-seed-queries 500]      # cap seed queries per topic
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── Span helpers (adapted from otel_distill.py) ─────────────────────────────


def _attrs(span: dict) -> dict:
    return span.get("attributes") or {}


def is_llm_chat_span(span: dict) -> bool:
    return _attrs(span).get("gen_ai.operation.name") == "chat"


def is_execute_tool_span(span: dict) -> bool:
    return _attrs(span).get("gen_ai.operation.name") == "execute_tool"


def span_status_ok(span: dict) -> bool:
    status = span.get("status_code")
    return status in (None, "OK")


def group_by_trace_id(spans: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for span in spans:
        tid = span.get("trace_id") or "__unknown__"
        groups.setdefault(str(tid), []).append(span)
    return groups


# ─── Message extraction ──────────────────────────────────────────────────────


def _text_of_parts(parts: list[dict]) -> str:
    return "\n".join(
        str(p.get("content", "")) for p in parts if p.get("type") == "text"
    ).strip()


def extract_system_prompt(trace_spans: list[dict]) -> str:
    """Extract the system prompt from the first chat span's input messages."""
    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        input_msgs = _attrs(span).get("gen_ai.input.messages") or []
        for msg in input_msgs:
            if not isinstance(msg, dict):
                continue
            if msg.get("role") == "system":
                parts = msg.get("parts") or []
                text = _text_of_parts(parts) if parts else ""
                if not text:
                    text = msg.get("content") or ""
                if text:
                    return text
    return ""


def extract_user_queries(trace_spans: list[dict]) -> list[str]:
    """Extract all user messages from a trace's chat spans."""
    queries: list[str] = []
    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        input_msgs = _attrs(span).get("gen_ai.input.messages") or []
        for msg in input_msgs:
            if not isinstance(msg, dict):
                continue
            if msg.get("role") != "user":
                continue
            parts = msg.get("parts") or []
            text = _text_of_parts(parts) if parts else ""
            if not text:
                text = msg.get("content") or ""
            if text and len(text) > 5:
                queries.append(text)
    return queries


def extract_tool_calls_from_span(span: dict) -> list[str]:
    """Extract tool names from a chat span's output messages."""
    output_msgs = _attrs(span).get("gen_ai.output.messages") or []
    tool_names: list[str] = []
    for msg in output_msgs:
        if not isinstance(msg, dict):
            continue
        for part in msg.get("parts") or []:
            if isinstance(part, dict) and part.get("type") == "tool_call":
                name = part.get("name") or ""
                if name:
                    tool_names.append(name)
    return tool_names


# ─── Trace reward / success detection ────────────────────────────────────────


def get_trace_reward(trace_spans: list[dict]) -> float | None:
    """Extract reward signal from trace metadata (tau-bench format)."""
    for span in trace_spans:
        reward = _attrs(span).get("tau_bench.reward")
        if reward is not None:
            return float(reward)
    return None


def infer_trace_success(trace_spans: list[dict]) -> bool | None:
    """Infer success from span statuses if no explicit reward."""
    reward = get_trace_reward(trace_spans)
    if reward is not None:
        return reward >= 0.5

    # Fallback: check if any span has ERROR status
    has_error = any(
        span.get("status_code") == "ERROR" for span in trace_spans
    )
    return not has_error if trace_spans else None


# ─── Tool-based topic mapping ────────────────────────────────────────────────

# Maps tool names to topic categories. For the initial implementation,
# we use the tool name itself as the topic (deterministic, no embedding).
# Embedding-based mapping can be added later.


def tool_name_to_topic(tool_name: str) -> str:
    """Map a tool name to a topic string.

    Uses the tool name directly as the topic. Normalizes by replacing
    underscores with hyphens and lowercasing.
    """
    return tool_name.lower().replace("_", "-")


def trace_primary_topic(trace_spans: list[dict]) -> str | None:
    """Determine the primary topic of a trace by its most "consequential" tool.

    Skips lookup/auth tools (get_*, find_*, list_*) and picks the first
    action tool. Falls back to the most-called tool if no action tool found.
    """
    tool_counts: Counter = Counter()
    action_tools: list[str] = []

    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        tools = extract_tool_calls_from_span(span)
        for t in tools:
            tool_counts[t] += 1
            lower = t.lower()
            is_lookup = any(lower.startswith(p) for p in (
                "get_", "find_", "list_", "search_",
            ))
            is_utility = lower in ("think", "calculate")
            if not is_lookup and not is_utility:
                action_tools.append(t)

    if action_tools:
        # Pick the last action tool (most consequential in the workflow)
        return tool_name_to_topic(action_tools[-1])
    if tool_counts:
        return tool_name_to_topic(tool_counts.most_common(1)[0][0])
    return None


# ─── System prompt rule extraction ───────────────────────────────────────────


def extract_prompt_rules(system_prompt: str) -> list[dict]:
    """Extract explicit rules from a system prompt.

    Looks for sentences containing imperative language (must, should, only,
    never, always, cannot, etc.) — these are the constraints that should
    become grader criteria.
    """
    if not system_prompt:
        return []

    rule_indicators = [
        "must", "should", "only", "never", "always", "cannot", "can only",
        "has to", "have to", "required", "not allowed", "do not",
    ]

    rules: list[dict] = []
    # Split by sentence (rough — handles bullet points too)
    sentences = re.split(r'[.\n]', system_prompt)
    for sentence in sentences:
        sentence = sentence.strip().strip("-").strip()
        if len(sentence) < 10:
            continue
        lower = sentence.lower()
        for indicator in rule_indicators:
            if indicator in lower:
                rules.append({
                    "rule": sentence,
                    "source": "prompt_rule",
                    "indicator": indicator,
                })
                break

    return rules


def simplify_system_prompt(system_prompt: str) -> str:
    """Distill a production system prompt to minimal framing for a small model.

    Keeps: role declaration, output format, key constraints.
    Removes: detailed procedures (learned from training examples), examples,
    verbose explanations.

    Research: "vibe-tuning" (Distil Labs 2025) shows small models learn
    behavior from training examples, not long prompts.
    """
    if not system_prompt:
        return ""

    lines = system_prompt.split("\n")
    kept: list[str] = []

    # Keep the first paragraph (role declaration)
    in_first_para = True
    for line in lines:
        stripped = line.strip()
        if in_first_para:
            if not stripped:
                in_first_para = False
                kept.append("")
            else:
                kept.append(stripped)
            continue

        # Keep lines with key constraints (short imperative rules)
        lower = stripped.lower()
        is_constraint = any(
            kw in lower
            for kw in ("must", "should not", "only", "never", "always", "cannot")
        )
        if is_constraint and len(stripped) < 200:
            kept.append(stripped)

    result = "\n".join(kept).strip()
    # Cap at ~500 chars
    if len(result) > 500:
        result = result[:497] + "..."
    return result


# ─── Artifact 1: trace_priority.json ─────────────────────────────────────────


def build_trace_priority(
    traces: dict[str, list[dict]],
) -> dict[str, dict]:
    """Compute per-topic priority scores from traces.

    Priority = frequency × failure_rate.
    Higher = the topic appears often AND the model fails on it.
    """
    topic_trace_counts: Counter = Counter()
    topic_success: Counter = Counter()
    topic_failure: Counter = Counter()
    total_traces = len(traces)

    for trace_id, spans in traces.items():
        topic = trace_primary_topic(spans)
        if not topic:
            continue

        topic_trace_counts[topic] += 1
        success = infer_trace_success(spans)
        if success is True:
            topic_success[topic] += 1
        elif success is False:
            topic_failure[topic] += 1

    priority: dict[str, dict] = {}
    for topic in topic_trace_counts:
        count = topic_trace_counts[topic]
        successes = topic_success.get(topic, 0)
        failures = topic_failure.get(topic, 0)
        total = successes + failures
        frequency = count / total_traces if total_traces > 0 else 0
        failure_rate = failures / total if total > 0 else 0
        priority_score = frequency * failure_rate

        priority[topic] = {
            "frequency": round(frequency, 4),
            "trace_count": count,
            "success_count": successes,
            "failure_count": failures,
            "failure_rate": round(failure_rate, 4),
            "priority_score": round(priority_score, 4),
        }

    return priority


# ─── Artifact 2: trace_topics.json ───────────────────────────────────────────


def build_trace_topics(
    priority: dict[str, dict],
    pdf_topics: list[str] | None = None,
) -> dict:
    """Identify topics from traces and flag coverage gaps vs PDF topics."""
    discovered = sorted(priority.keys())

    coverage_gaps: list[dict] = []
    if pdf_topics is not None:
        pdf_set = {t.lower().replace("_", "-") for t in pdf_topics}
        for topic in discovered:
            if topic not in pdf_set:
                info = priority[topic]
                coverage_gaps.append({
                    "topic": topic,
                    "trace_count": info["trace_count"],
                    "frequency": info["frequency"],
                    "suggested_action": "Review: topic appears in traces but not in PDF knowledge source",
                })

    return {
        "discovered_topics": discovered,
        "topic_count": len(discovered),
        "coverage_gaps": coverage_gaps,
        "coverage_gap_count": len(coverage_gaps),
    }


# ─── Artifact 3: trace_prompts.json ──────────────────────────────────────────


def build_trace_prompts(
    traces: dict[str, list[dict]],
    priority: dict[str, dict],
    max_seed_queries: int = 500,
) -> dict:
    """Extract production system prompt and seed user queries from traces."""
    # Extract system prompt from the first trace
    system_prompt = ""
    for spans in traces.values():
        system_prompt = extract_system_prompt(spans)
        if system_prompt:
            break

    # Collect user queries grouped by topic
    topic_queries: dict[str, list[str]] = defaultdict(list)
    for trace_id, spans in traces.items():
        topic = trace_primary_topic(spans)
        if not topic:
            continue
        queries = extract_user_queries(spans)
        # Take only the first user message per trace (the initial request)
        if queries:
            topic_queries[topic].append(queries[0])

    # Deduplicate and cap per topic
    seed_queries: dict[str, list[str]] = {}
    total_seeds = 0
    for topic in sorted(topic_queries.keys()):
        unique = list(dict.fromkeys(topic_queries[topic]))  # preserve order, dedup
        per_topic_cap = max(10, max_seed_queries // max(len(topic_queries), 1))
        seed_queries[topic] = unique[:per_topic_cap]
        total_seeds += len(seed_queries[topic])

    return {
        "system_prompt": system_prompt,
        "simplified_prompt": simplify_system_prompt(system_prompt),
        "seed_queries": seed_queries,
        "total_seed_queries": total_seeds,
        "topics_with_seeds": len(seed_queries),
    }


# ─── Artifact 4: trace_grader_hints.json ─────────────────────────────────────


def _infer_failure_dimensions(
    traces: dict[str, list[dict]],
    priority: dict[str, dict],
) -> list[dict]:
    """Infer grader dimensions from failure patterns in traces.

    Analyzes failed traces to identify common failure modes:
    - Tool called without prior authentication
    - Wrong tool selected (action tool doesn't match task intent)
    - Missing tool parameters
    """
    dimensions: list[dict] = []
    total_traces = len(traces)
    failed_traces = [
        (tid, spans) for tid, spans in traces.items()
        if infer_trace_success(spans) is False
    ]
    if not failed_traces:
        return dimensions

    # Dimension: authentication before action
    # Check if failed traces skipped auth tools before calling action tools
    auth_skip_count = 0
    auth_tools = {"find-user-id-by-email", "find-user-id-by-name-zip"}
    for tid, spans in failed_traces:
        tools_in_order: list[str] = []
        for span in spans:
            if is_llm_chat_span(span):
                tools_in_order.extend(
                    tool_name_to_topic(t) for t in extract_tool_calls_from_span(span)
                )

        has_auth = any(t in auth_tools for t in tools_in_order)
        has_action = any(
            t not in auth_tools and not t.startswith("get-") and t not in ("think", "calculate")
            for t in tools_in_order
        )
        if has_action and not has_auth:
            auth_skip_count += 1

    if auth_skip_count > 0:
        dimensions.append({
            "name": "authentication_before_action",
            "description": "Model must authenticate user (find user ID) before any state-changing tool call",
            "failure_count": auth_skip_count,
            "failure_rate": round(auth_skip_count / len(failed_traces), 3),
            "source": "trace_failure",
        })

    # Dimension: per-topic failure rates (topics with >30% failure)
    for topic, info in sorted(priority.items(), key=lambda x: -x[1]["failure_rate"]):
        if info["failure_rate"] < 0.3:
            continue
        if info["trace_count"] < 3:
            continue
        dimensions.append({
            "name": f"topic_{topic}_accuracy",
            "description": f"Model accuracy on '{topic}' tasks ({info['failure_rate']:.0%} failure rate in traces)",
            "failure_count": info["failure_count"],
            "failure_rate": info["failure_rate"],
            "source": "trace_failure",
        })

    return dimensions


def _select_calibration_pairs(
    traces: dict[str, list[dict]],
    max_pairs: int = 30,
) -> list[dict]:
    """Select success/failure trace pairs for grader calibration.

    Prefers pairs from the same task_id (different trial outcomes).
    Falls back to random sampling if task_id metadata isn't available.
    """
    # Group by task_id if available (tau-bench format)
    by_task: dict[int, dict[str, list[str]]] = defaultdict(lambda: {"success": [], "failure": []})

    for trace_id, spans in traces.items():
        task_id = None
        for span in spans:
            task_id = _attrs(span).get("tau_bench.task_id")
            if task_id is not None:
                break

        success = infer_trace_success(spans)
        if task_id is not None:
            bucket = "success" if success else "failure"
            by_task[int(task_id)][bucket].append(trace_id)

    pairs: list[dict] = []

    # Paired: same task, different outcome
    for task_id, buckets in by_task.items():
        if buckets["success"] and buckets["failure"]:
            pairs.append({
                "task_id": task_id,
                "success_trace_id": buckets["success"][0],
                "failure_trace_id": buckets["failure"][0],
                "expected_score_range_success": [0.7, 1.0],
                "expected_score_range_failure": [0.0, 0.4],
            })
            if len(pairs) >= max_pairs:
                break

    # If no task_id metadata, sample individual traces
    if not pairs:
        successes = [
            tid for tid, spans in traces.items()
            if infer_trace_success(spans) is True
        ][:max_pairs]
        failures = [
            tid for tid, spans in traces.items()
            if infer_trace_success(spans) is False
        ][:max_pairs]
        for tid in successes:
            pairs.append({
                "trace_id": tid,
                "outcome": "success",
                "expected_score_range": [0.7, 1.0],
            })
        for tid in failures:
            pairs.append({
                "trace_id": tid,
                "outcome": "failure",
                "expected_score_range": [0.0, 0.4],
            })

    return pairs[:max_pairs]


def build_trace_grader_hints(
    traces: dict[str, list[dict]],
    priority: dict[str, dict],
    system_prompt: str,
) -> dict:
    """Build grader hints from trace failure patterns and prompt rules."""
    # Failure dimensions from traces
    failure_dimensions = _infer_failure_dimensions(traces, priority)

    # Rules from production system prompt
    prompt_rules = extract_prompt_rules(system_prompt)
    for rule in prompt_rules:
        failure_dimensions.append({
            "name": f"rule_{rule['indicator']}",
            "description": rule["rule"],
            "failure_count": 0,
            "failure_rate": 0.0,
            "source": "prompt_rule",
        })

    # Calibration pairs
    calibration_pairs = _select_calibration_pairs(traces)

    return {
        "dimensions": failure_dimensions,
        "dimension_count": len(failure_dimensions),
        "calibration_pairs": calibration_pairs,
        "calibration_pair_count": len(calibration_pairs),
        "prompt_rules_as_criteria": [r["rule"] for r in prompt_rules],
    }


# ─── Main ────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze OTel traces to inform the PDF finetune pipeline"
    )
    parser.add_argument(
        "traces",
        help="Path to OTel semconv JSON file (source_traces_semconv.json)",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory to write the 4 artifacts (e.g., finetune-project/)",
    )
    parser.add_argument(
        "--pdf-topics",
        default=None,
        help="Path to PDF-derived topics.json (for coverage gap detection)",
    )
    parser.add_argument(
        "--max-seed-queries",
        type=int,
        default=500,
        help="Max seed queries to extract per topic (default: 500)",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load spans
    print(f"Loading traces from {args.traces}...")
    with open(args.traces) as f:
        spans = json.load(f)
    print(f"  Loaded {len(spans)} spans")

    # Group by trace
    traces = group_by_trace_id(spans)
    print(f"  {len(traces)} traces")

    success_count = sum(1 for s in traces.values() if infer_trace_success(s) is True)
    failure_count = sum(1 for s in traces.values() if infer_trace_success(s) is False)
    print(f"  {success_count} successes, {failure_count} failures")

    # Artifact 1: trace_priority.json
    print("\nBuilding trace_priority.json...")
    priority = build_trace_priority(traces)
    priority_path = output_dir / "trace_priority.json"
    with open(priority_path, "w") as f:
        json.dump(priority, f, indent=2)
    print(f"  {len(priority)} topics, written to {priority_path}")

    # Artifact 2: trace_topics.json
    print("\nBuilding trace_topics.json...")
    pdf_topic_names: list[str] | None = None
    if args.pdf_topics:
        with open(args.pdf_topics) as f:
            pdf_data = json.load(f)
        # Extract leaf topic names from hierarchy
        pdf_topic_names = []
        for child in pdf_data.get("children", []):
            if "children" in child:
                for leaf in child["children"]:
                    pdf_topic_names.append(leaf.get("name", ""))
            else:
                pdf_topic_names.append(child.get("name", ""))
    trace_topics = build_trace_topics(priority, pdf_topic_names)
    topics_path = output_dir / "trace_topics.json"
    with open(topics_path, "w") as f:
        json.dump(trace_topics, f, indent=2)
    print(f"  {trace_topics['topic_count']} topics discovered, {trace_topics['coverage_gap_count']} coverage gaps")

    # Artifact 3: trace_prompts.json
    print("\nBuilding trace_prompts.json...")
    trace_prompts = build_trace_prompts(traces, priority, args.max_seed_queries)
    prompts_path = output_dir / "trace_prompts.json"
    with open(prompts_path, "w") as f:
        json.dump(trace_prompts, f, indent=2)
    prompt_preview = trace_prompts["simplified_prompt"][:80] + "..." if trace_prompts["simplified_prompt"] else "(none)"
    print(f"  System prompt: {prompt_preview}")
    print(f"  {trace_prompts['total_seed_queries']} seed queries across {trace_prompts['topics_with_seeds']} topics")

    # Artifact 4: trace_grader_hints.json
    print("\nBuilding trace_grader_hints.json...")
    grader_hints = build_trace_grader_hints(
        traces, priority, trace_prompts["system_prompt"]
    )
    hints_path = output_dir / "trace_grader_hints.json"
    with open(hints_path, "w") as f:
        json.dump(grader_hints, f, indent=2)
    print(f"  {grader_hints['dimension_count']} grader dimensions ({sum(1 for d in grader_hints['dimensions'] if d['source'] == 'trace_failure')} from traces, {sum(1 for d in grader_hints['dimensions'] if d['source'] == 'prompt_rule')} from prompt rules)")
    print(f"  {grader_hints['calibration_pair_count']} calibration pairs")

    # Summary
    print(f"\n{'='*60}")
    print(f"Trace analysis complete. Artifacts written to {output_dir}/")
    print(f"  trace_priority.json      — {len(priority)} topics with priority scores")
    print(f"  trace_topics.json        — {trace_topics['coverage_gap_count']} coverage gaps detected")
    print(f"  trace_prompts.json       — {trace_prompts['total_seed_queries']} seed queries")
    print(f"  trace_grader_hints.json  — {grader_hints['dimension_count']} grader dimensions")


if __name__ == "__main__":
    main()
