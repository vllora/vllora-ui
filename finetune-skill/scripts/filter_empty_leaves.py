#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""filter_empty_leaves.py — Remove leaf topics with no training records.

Background (2026-04-21): tau-bench airline data has 14 tools in trace spans,
but only 12 appear as GT tool_calls in decision-points, and one of those 12
(`update_reservation_baggages`) has only 1 DP — which gets removed by dedup,
leaving an empty leaf topic in the final training data.

The agent-designed topic hierarchy includes a leaf for every DP-tool, but
has no mechanism to drop leaves post-paraphrase when dedup wiped their
seed records. Upload-topics then sends the empty leaf to the gateway,
which surfaces in the UI as a leaf with zero records.

This script runs AFTER paraphrase + dedup, BEFORE upload-records /
upload-topics. It:
  1. Drops leaves from topics.json that have 0 records in training.jsonl
  2. Drops tools from tool-schemas.json that don't correspond to any
     surviving leaf (e.g. tau-bench airline's book_reservation and
     list_all_airports: schema-present but zero DPs)
  3. Filters each record's `tools` field to the surviving tool schema
     so the inference-time tool menu matches the training-time menu

Why filter the tools on records too: if a record carries a tool in its
`tools` field that the model was never trained to use, at eval/deployment
the model sees an unfamiliar tool in the menu. Dropping aligns
train-time and inference-time tool sets.

Usage:
    uv run scripts/filter_empty_leaves.py \\
        --records finetune-project/training.jsonl \\
        --topics finetune-project/topics.json \\
        --tool-schemas finetune-project/trace-analysis/tool-schemas.json
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def _topic_to_tool_name(topic_id: str) -> str:
    """Map a topic slug to the corresponding tool name.

    tau-bench convention: topic IDs use dashes (`update-reservation-baggages`),
    tool names use underscores (`update_reservation_baggages`). One-to-one
    except when the topic is a category/root with children.
    """
    return topic_id.replace("-", "_")


def count_records_per_topic(records_path: Path) -> Counter:
    """Count records per topic_id in training.jsonl."""
    c = Counter()
    with records_path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            topic = rec.get("topic")
            if topic:
                c[topic] += 1
    return c


def collect_leaves(node: dict, path: list[dict] | None = None) -> list[tuple[dict, list[dict]]]:
    """Return (leaf_node, ancestor_chain) for every leaf under `node`."""
    path = path or []
    kids = node.get("children") or []
    if not kids:
        return [(node, list(path))]
    out = []
    for child in kids:
        out.extend(collect_leaves(child, path + [node]))
    return out


def filter_topics(
    topics: list[dict] | dict, counts: Counter
) -> tuple[list[dict] | dict, list[str]]:
    """Return (filtered_topics, removed_leaf_ids).

    Removes leaves with zero matching records. If a parent loses all its
    children as a result, also removes the parent (cascades up).
    """
    removed: list[str] = []

    def filter_tree(node: dict) -> dict | None:
        kids = node.get("children") or []
        if not kids:
            # leaf node — keep only if it has records
            topic_id = node.get("id") or node.get("name", "")
            if counts.get(topic_id, 0) > 0:
                return node
            removed.append(topic_id)
            return None

        filtered_kids = []
        for child in kids:
            result = filter_tree(child)
            if result is not None:
                filtered_kids.append(result)

        if not filtered_kids:
            # all children got dropped → drop this parent too
            return None

        new_node = dict(node)
        new_node["children"] = filtered_kids
        return new_node

    if isinstance(topics, list):
        out: list[dict] = []
        for root in topics:
            result = filter_tree(root)
            if result is not None:
                out.append(result)
        return out, removed
    else:
        result = filter_tree(topics)
        return (result if result is not None else {}), removed


def filter_tool_schemas(
    tool_schemas: list[dict] | dict, surviving_topic_ids: set[str]
) -> tuple[list[dict], list[str]]:
    """Return (filtered_tools, removed_tool_names).

    Keeps only tools whose name matches a surviving leaf topic. Uses slug
    conversion (dash ↔ underscore) to map topics to tools.
    """
    tools_list = tool_schemas.get("tools", tool_schemas) if isinstance(tool_schemas, dict) else tool_schemas
    surviving_tool_names = {_topic_to_tool_name(tid) for tid in surviving_topic_ids}

    kept: list[dict] = []
    removed: list[str] = []
    for t in tools_list:
        fn = t.get("function") if isinstance(t, dict) else None
        name = (fn or {}).get("name", "")
        if name in surviving_tool_names:
            kept.append(t)
        else:
            removed.append(name)
    return kept, removed


def filter_record_tools(records_path: Path, surviving_tool_names: set[str]) -> int:
    """Rewrite records in place, filtering each record's `tools` list to
    only include surviving tools. Returns the number of records whose tools
    list was modified.
    """
    temp_path = records_path.with_suffix(".filtered.jsonl")
    modified = 0
    total = 0
    with records_path.open() as src, temp_path.open("w") as dst:
        for line in src:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            total += 1
            original_tools = rec.get("tools") or []
            if original_tools:
                filtered = [
                    t for t in original_tools
                    if ((t.get("function") or {}).get("name", "")) in surviving_tool_names
                ]
                if len(filtered) != len(original_tools):
                    modified += 1
                    rec["tools"] = filtered
            dst.write(json.dumps(rec) + "\n")
    temp_path.replace(records_path)
    return modified


def collect_leaf_ids(topics: list[dict] | dict) -> set[str]:
    """Return set of all leaf topic_ids."""
    out: set[str] = set()

    def walk(node: dict):
        kids = node.get("children") or []
        if not kids:
            tid = node.get("id") or node.get("name", "")
            if tid:
                out.add(tid)
        else:
            for k in kids:
                walk(k)

    if isinstance(topics, list):
        for r in topics:
            walk(r)
    else:
        walk(topics)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--records", required=True, type=Path, help="training.jsonl")
    ap.add_argument("--topics", required=True, type=Path, help="topics.json")
    ap.add_argument(
        "--tool-schemas",
        type=Path,
        default=None,
        help="trace-analysis/tool-schemas.json (optional — filtered if provided)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be removed without modifying files",
    )
    args = ap.parse_args()

    for p in [args.records, args.topics]:
        if not p.exists():
            raise SystemExit(f"Required file not found: {p}")
    if args.tool_schemas and not args.tool_schemas.exists():
        raise SystemExit(f"Tool schemas file not found: {args.tool_schemas}")

    # Load and analyze
    counts = count_records_per_topic(args.records)
    topics = json.loads(args.topics.read_text())
    original_leaves = collect_leaf_ids(topics)

    print(f"Loaded {sum(counts.values())} records across {len(counts)} topics")
    print(f"Original topic hierarchy: {len(original_leaves)} leaves")

    # Filter topics
    filtered_topics, removed_leaves = filter_topics(topics, counts)
    surviving_leaves = collect_leaf_ids(filtered_topics)

    print()
    if removed_leaves:
        print(f"Removing {len(removed_leaves)} empty leaf(s):")
        for tid in removed_leaves:
            print(f"  - {tid}  (0 records in training.jsonl)")
    else:
        print("No empty leaves — topic hierarchy already aligned with records.")

    # Filter tool schemas if provided
    removed_tools: list[str] = []
    filtered_schemas: list[dict] = []
    if args.tool_schemas:
        tool_schemas_raw = json.loads(args.tool_schemas.read_text())
        filtered_schemas, removed_tools = filter_tool_schemas(
            tool_schemas_raw, surviving_leaves
        )
        print()
        tools_list = tool_schemas_raw.get("tools", tool_schemas_raw) if isinstance(tool_schemas_raw, dict) else tool_schemas_raw
        print(f"Tool schemas: {len(tools_list)} → {len(filtered_schemas)}")
        if removed_tools:
            print(f"Removing {len(removed_tools)} orphaned tool(s):")
            for name in removed_tools:
                print(f"  - {name}  (no surviving leaf)")

    if args.dry_run:
        print("\n(dry-run — no files modified)")
        return

    # Write back topics.json
    if removed_leaves:
        args.topics.write_text(json.dumps(filtered_topics, indent=2))
        print(f"\n✓ topics.json updated ({len(original_leaves)} → {len(surviving_leaves)} leaves)")

    # Write back tool-schemas.json
    if args.tool_schemas and removed_tools:
        out_obj = {"tools": filtered_schemas} if isinstance(json.loads(args.tool_schemas.read_text()), dict) else filtered_schemas
        args.tool_schemas.write_text(json.dumps(out_obj, indent=2))
        print(f"✓ tool-schemas.json updated ({len(removed_tools)} tools dropped)")

    # Filter record-level tools
    if args.tool_schemas and removed_tools:
        surviving_tool_names = {
            (t.get("function") or {}).get("name", "") for t in filtered_schemas
        }
        modified = filter_record_tools(args.records, surviving_tool_names)
        print(f"✓ training.jsonl: {modified} records had their tools[] filtered to align with deployed tool set")

    if not removed_leaves and not removed_tools:
        print("\n(No changes needed.)")


if __name__ == "__main__":
    main()
