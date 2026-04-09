# /// script
# requires-python = ">=3.10"
# ///
"""
trace_topics.py — Stage 2: build the topic hierarchy + per-record tools
array from a tool schema.

The trace pipeline's topic hierarchy is **read from the tool schema**,
not discovered by LLM clustering. Each tool defined in the schema is
one leaf topic. This is the whole of Stage 2.

Two distinct outputs (the concept doc's "topic hierarchy vs per-record
tools array" distinction):

1. **Topic hierarchy** — for the workflow UI. Union of all tool names,
   organized as a tree under the agent root. **Empty topics are kept**
   (tools defined but never called in the available trace records) so
   future traces can fill them in.

2. **Per-record `tools` array** — for every training record in the
   OpenAI fine-tuning JSONL. Stricter rules:
   - Same `tools` array on every training record (OpenAI consistency
     rule from their fine-tuning best practices)
   - Exclude tools never called in any trace record (no dead-weight
     tokens)
   - For conflicting descriptions of the same tool name, use the most
     recent (last occurrence in `tool_schema`)

These two concepts can disagree: the topic hierarchy might show 6
tools (including 2 never-called), while the per-record `tools` array
only contains the 4 that were actually called. That's correct — the
UI shows capability coverage, the trainer sees only what's
demonstrated.

Usage:
    python3 trace_topics.py tool_schema.json training.jsonl \\
        --topic-hierarchy-output hierarchy.json \\
        --per-record-tools-output tools.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _tool_name(tool: dict) -> str | None:
    """Extract the tool name from a tool schema entry.

    Handles both OpenAI-style (`{"type": "function", "function": {"name": ...}}`)
    and flat-style (`{"name": ...}`) tool definitions.
    """
    if not isinstance(tool, dict):
        return None
    if tool.get("type") == "function" and isinstance(tool.get("function"), dict):
        return tool["function"].get("name")
    return tool.get("name")


def _tool_description(tool: dict) -> str | None:
    """Extract the tool description from a tool schema entry."""
    if not isinstance(tool, dict):
        return None
    if tool.get("type") == "function" and isinstance(tool.get("function"), dict):
        return tool["function"].get("description")
    return tool.get("description")


# ─── Topic hierarchy (UI concept) ──────────────────────────────────────────


def build_topic_hierarchy(
    tool_schema: list[dict],
    agent_root_name: str = "Agent",
) -> dict:
    """Build the topic hierarchy (UI concept).

    Returns:
        {
          "name": "<agent_root_name>",
          "leaves": [
            {"name": "product_search", "description": "...", "record_count": 0},
            ...
          ]
        }

    Record counts start at 0 and are populated by `annotate_hierarchy_with_counts`.
    Empty topics (record_count == 0) are KEPT in the hierarchy — they
    represent capabilities the agent is supposed to have but that weren't
    exercised in the current trace bundle.

    Duplicate tool names in the schema are de-duplicated (last
    occurrence wins for the description).
    """
    seen: dict[str, dict] = {}
    order: list[str] = []
    for tool in tool_schema:
        name = _tool_name(tool)
        if not name:
            continue
        if name not in seen:
            order.append(name)
        seen[name] = {
            "name": name,
            "description": _tool_description(tool) or "",
            "record_count": 0,
        }
    leaves = [seen[n] for n in order]
    return {"name": agent_root_name, "leaves": leaves}


def count_records_per_tool(records: list[dict]) -> dict[str, int]:
    """Count how many training records call each tool.

    For each record, the tool is taken from the LAST assistant message's
    `tool_calls[*].function.name`. For Pattern D (parallel) records,
    every tool_call in the set increments its respective tool's count.

    Refusal records (no tool calls in the assistant message) don't
    contribute to any tool's count.
    """
    counts: dict[str, int] = {}
    for record in records:
        messages = record.get("messages") or []
        # Find the last assistant message (walking from the end)
        last_assistant = None
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                last_assistant = msg
                break
        if not last_assistant:
            continue
        for tc in last_assistant.get("tool_calls") or []:
            fn = tc.get("function") or {}
            name = fn.get("name")
            if name:
                counts[name] = counts.get(name, 0) + 1
    return counts


def annotate_hierarchy_with_counts(
    hierarchy: dict, record_counts: dict[str, int]
) -> dict:
    """Populate `record_count` on each leaf in the hierarchy (mutates in place)."""
    for leaf in hierarchy.get("leaves", []):
        leaf["record_count"] = record_counts.get(leaf["name"], 0)
    return hierarchy


# ─── Per-record tools array (training concept) ─────────────────────────────


def build_per_record_tools_array(
    tool_schema: list[dict],
    record_counts: dict[str, int],
) -> list[dict]:
    """Build the per-record `tools` array (training concept).

    Stricter than the hierarchy:
      - Include ONLY tools that were called at least once
      - Keep the original tool schema shape (OpenAI function format)
      - For conflicting descriptions on the same tool name, use the
        most recent (last occurrence in `tool_schema`)
      - Stable order: first-seen-first in the original schema, except
        duplicates are collapsed onto their first position
    """
    # De-duplicate by tool name, keeping the LAST occurrence's schema
    # but preserving the FIRST-seen order
    by_name: dict[str, dict] = {}
    order: list[str] = []
    for tool in tool_schema:
        name = _tool_name(tool)
        if not name:
            continue
        if name not in by_name:
            order.append(name)
        by_name[name] = tool

    return [by_name[name] for name in order if record_counts.get(name, 0) > 0]


# ─── Top-level ──────────────────────────────────────────────────────────────


def build_both(
    tool_schema: list[dict],
    records: list[dict],
    agent_root_name: str = "Agent",
) -> tuple[dict, list[dict]]:
    """Top-level convenience: build hierarchy + per-record tools array.

    Returns `(topic_hierarchy, per_record_tools)`.
      - `topic_hierarchy` includes ALL tools from the schema (empty ones kept)
      - `per_record_tools` includes ONLY tools actually called
    """
    record_counts = count_records_per_tool(records)
    hierarchy = build_topic_hierarchy(tool_schema, agent_root_name=agent_root_name)
    annotate_hierarchy_with_counts(hierarchy, record_counts)
    per_record = build_per_record_tools_array(tool_schema, record_counts)
    return hierarchy, per_record


def load_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file into a list of dicts."""
    records: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        records.append(json.loads(line))
    return records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build topic hierarchy + per-record tools array from a tool schema"
    )
    parser.add_argument("tool_schema", type=Path, help="Tool schema JSON file")
    parser.add_argument(
        "records", type=Path, help="Training records JSONL (from otel_distill.py)"
    )
    parser.add_argument(
        "--agent-name",
        default="Agent",
        help="Root topic name (default: 'Agent')",
    )
    parser.add_argument(
        "--topic-hierarchy-output",
        type=Path,
        required=True,
        help="Output JSON for the topic hierarchy (UI concept)",
    )
    parser.add_argument(
        "--per-record-tools-output",
        type=Path,
        required=True,
        help="Output JSON for the per-record tools array (training concept)",
    )
    args = parser.parse_args()

    if not args.tool_schema.exists():
        print(f"error: tool schema not found: {args.tool_schema}", file=sys.stderr)
        return 2
    if not args.records.exists():
        print(f"error: records not found: {args.records}", file=sys.stderr)
        return 2

    tool_schema = json.loads(args.tool_schema.read_text())
    if not isinstance(tool_schema, list):
        print("error: tool schema must be a JSON array", file=sys.stderr)
        return 2

    records = load_jsonl(args.records)
    hierarchy, per_record_tools = build_both(
        tool_schema, records, agent_root_name=args.agent_name
    )

    args.topic_hierarchy_output.parent.mkdir(parents=True, exist_ok=True)
    args.topic_hierarchy_output.write_text(
        json.dumps(hierarchy, indent=2, ensure_ascii=False)
    )
    args.per_record_tools_output.parent.mkdir(parents=True, exist_ok=True)
    args.per_record_tools_output.write_text(
        json.dumps(per_record_tools, indent=2, ensure_ascii=False)
    )

    total_leaves = len(hierarchy["leaves"])
    used_tools = len(per_record_tools)
    empty_tools = sum(1 for leaf in hierarchy["leaves"] if leaf["record_count"] == 0)
    print(
        f"topic hierarchy: {total_leaves} tools "
        f"({empty_tools} empty, {total_leaves - empty_tools} used) → "
        f"{args.topic_hierarchy_output}"
    )
    print(
        f"per-record tools: {used_tools} tools → {args.per_record_tools_output}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
