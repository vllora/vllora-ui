"""
Unit tests for trace_topics.py.

Verifies the two-concept split:
  1. Topic hierarchy (UI concept) keeps empty topics
  2. Per-record `tools` array (training concept) excludes never-called tools
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import pytest  # noqa: E402
from trace_topics import (  # noqa: E402
    annotate_hierarchy_with_counts,
    build_both,
    build_per_record_tools_array,
    build_topic_hierarchy,
    count_records_per_tool,
)


# ─── Fixture builders ──────────────────────────────────────────────────────


def _oai_tool(name, description=""):
    """OpenAI-style tool schema entry."""
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": {}},
        },
    }


def _flat_tool(name, description=""):
    """Flat-style tool schema entry (Claude, some OpenInference variants)."""
    return {"name": name, "description": description}


def _record(tool_calls: list[tuple[str, dict]]):
    """Build a minimal training record with the given tool calls in its
    last assistant message."""
    return {
        "messages": [
            {"role": "system", "content": "You are an assistant."},
            {"role": "user", "content": "Do the thing"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": f"c{i}",
                        "type": "function",
                        "function": {
                            "name": name,
                            "arguments": json.dumps(args),
                        },
                    }
                    for i, (name, args) in enumerate(tool_calls)
                ],
            },
        ],
        "tools": [],
    }


# ─── build_topic_hierarchy ──────────────────────────────────────────────────


def test_topic_hierarchy_from_openai_schema():
    schema = [
        _oai_tool("product_search", "Search products"),
        _oai_tool("product_details", "Get details for a product"),
    ]
    h = build_topic_hierarchy(schema, agent_root_name="Shopping Agent")
    assert h["name"] == "Shopping Agent"
    assert len(h["leaves"]) == 2
    assert h["leaves"][0]["name"] == "product_search"
    assert h["leaves"][0]["description"] == "Search products"
    assert h["leaves"][0]["record_count"] == 0


def test_topic_hierarchy_from_flat_schema():
    schema = [_flat_tool("a", "A tool"), _flat_tool("b", "B tool")]
    h = build_topic_hierarchy(schema)
    assert [leaf["name"] for leaf in h["leaves"]] == ["a", "b"]


def test_topic_hierarchy_keeps_empty_topics():
    """Tools defined but never called stay in the hierarchy."""
    schema = [
        _oai_tool("used_tool", "Actually called"),
        _oai_tool("empty_tool", "Never called"),
    ]
    records = [_record([("used_tool", {"x": 1})])]
    hierarchy, _ = build_both(schema, records)
    # Both tools present
    names = [leaf["name"] for leaf in hierarchy["leaves"]]
    assert "used_tool" in names
    assert "empty_tool" in names
    # But their record_counts differ
    counts = {leaf["name"]: leaf["record_count"] for leaf in hierarchy["leaves"]}
    assert counts["used_tool"] == 1
    assert counts["empty_tool"] == 0


def test_topic_hierarchy_deduplicates_names():
    """Duplicate tool names in the schema are collapsed."""
    schema = [
        _oai_tool("product_search", "Old description"),
        _oai_tool("product_search", "New description"),
    ]
    h = build_topic_hierarchy(schema)
    assert len(h["leaves"]) == 1
    assert h["leaves"][0]["name"] == "product_search"
    # Most recent description wins
    assert h["leaves"][0]["description"] == "New description"


def test_topic_hierarchy_skips_nameless_tools():
    """Tools without a name are silently ignored (malformed schema entries)."""
    schema = [
        {"type": "function", "function": {"description": "has no name"}},
        _oai_tool("real_tool"),
    ]
    h = build_topic_hierarchy(schema)
    assert len(h["leaves"]) == 1
    assert h["leaves"][0]["name"] == "real_tool"


# ─── count_records_per_tool ─────────────────────────────────────────────────


def test_count_records_single_call_per_record():
    records = [
        _record([("product_search", {"q": "tablet"})]),
        _record([("product_search", {"q": "phone"})]),
        _record([("track_package", {"id": "K91"})]),
    ]
    counts = count_records_per_tool(records)
    assert counts == {"product_search": 2, "track_package": 1}


def test_count_records_parallel_calls_counted_separately():
    """Pattern D: one record with K parallel tool calls increments each
    tool's count separately."""
    records = [
        _record(
            [
                ("product_search", {"q": "dishwasher"}),
                ("product_search", {"q": "toaster"}),
                ("product_comparison", {"a": 1, "b": 2}),
            ]
        ),
    ]
    counts = count_records_per_tool(records)
    assert counts == {"product_search": 2, "product_comparison": 1}


def test_count_records_refusal_records_not_counted():
    """Records with no tool_calls in the last assistant message don't
    contribute to any tool's count."""
    records = [
        {
            "messages": [
                {"role": "user", "content": "Do something I can't do"},
                {"role": "assistant", "content": "I can't help with that."},
            ],
            "tools": [],
        }
    ]
    assert count_records_per_tool(records) == {}


def test_count_records_only_last_assistant_counted():
    """If multiple assistant messages exist (Pattern C context), only
    the LAST one contributes to counts — it's the training target."""
    records = [
        {
            "messages": [
                {"role": "user", "content": "..."},
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "c0",
                            "type": "function",
                            "function": {"name": "first_tool", "arguments": "{}"},
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": "c0", "content": "result"},
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "c1",
                            "type": "function",
                            "function": {"name": "second_tool", "arguments": "{}"},
                        }
                    ],
                },
            ],
            "tools": [],
        }
    ]
    counts = count_records_per_tool(records)
    # Only second_tool is counted; first_tool is context
    assert counts == {"second_tool": 1}


# ─── build_per_record_tools_array ──────────────────────────────────────────


def test_per_record_tools_excludes_never_called():
    """Never-called tools are dropped from the per-record array."""
    schema = [
        _oai_tool("used_tool"),
        _oai_tool("empty_tool"),
    ]
    records = [_record([("used_tool", {"x": 1})])]
    _, per_record = build_both(schema, records)
    names = [_name_of(t) for t in per_record]
    assert names == ["used_tool"]


def test_per_record_tools_includes_all_called():
    schema = [
        _oai_tool("a"),
        _oai_tool("b"),
        _oai_tool("c"),
    ]
    records = [
        _record([("a", {})]),
        _record([("b", {})]),
        # 'c' never called
    ]
    _, per_record = build_both(schema, records)
    names = [_name_of(t) for t in per_record]
    assert names == ["a", "b"]


def test_per_record_tools_latest_description_wins():
    """Duplicate tool names in schema collapse to the LAST occurrence's
    description (developer-intent-evolved-toward-latest rule)."""
    schema = [
        _oai_tool("tool_x", "Old desc (deprecated)"),
        _oai_tool("tool_x", "New desc (current)"),
    ]
    records = [_record([("tool_x", {})])]
    _, per_record = build_both(schema, records)
    assert len(per_record) == 1
    assert per_record[0]["function"]["description"] == "New desc (current)"


def test_per_record_tools_stable_order():
    """Tools appear in the per-record array in their first-seen order in
    the input schema, even after dedup."""
    schema = [
        _oai_tool("zeta"),
        _oai_tool("alpha"),
        _oai_tool("zeta", "updated zeta"),  # duplicate
    ]
    records = [
        _record([("zeta", {})]),
        _record([("alpha", {})]),
    ]
    _, per_record = build_both(schema, records)
    names = [_name_of(t) for t in per_record]
    # zeta comes first (first seen), then alpha
    assert names == ["zeta", "alpha"]


# ─── build_both integration ────────────────────────────────────────────────


def test_build_both_shopping_agent_scenario():
    """End-to-end: 6 tools defined, 4 used. Hierarchy keeps all 6, per-
    record tools array has 4. This mirrors the real shopping-agent fixture.
    """
    schema = [
        _oai_tool("product_search", "Search products"),
        _oai_tool("product_details", "Get product details"),
        _oai_tool("product_comparison", "Compare two products"),
        _oai_tool("track_package", "Track a shipment"),
        _oai_tool("apply_discount_code", "Apply a discount"),
        _oai_tool("customer_support", "Unused in this bundle"),
    ]
    records = [
        # 13 product_search calls
        *[_record([("product_search", {"q": f"item{i}"})]) for i in range(13)],
        # 11 track_package calls
        *[_record([("track_package", {"id": f"P{i}"})]) for i in range(11)],
        # 5 product_details calls
        *[_record([("product_details", {"id": i})]) for i in range(5)],
        # 4 apply_discount_code calls
        *[_record([("apply_discount_code", {"code": f"X{i}"})]) for i in range(4)],
        # product_comparison and customer_support are never called
    ]

    hierarchy, per_record = build_both(schema, records, agent_root_name="Shopping Agent")

    # Hierarchy: all 6 tools, with 2 empty
    assert len(hierarchy["leaves"]) == 6
    empty_names = {
        leaf["name"] for leaf in hierarchy["leaves"] if leaf["record_count"] == 0
    }
    assert empty_names == {"product_comparison", "customer_support"}

    # Per-record tools: only the 4 used
    per_record_names = [_name_of(t) for t in per_record]
    assert set(per_record_names) == {
        "product_search",
        "track_package",
        "product_details",
        "apply_discount_code",
    }
    assert len(per_record) == 4

    # Count accuracy
    counts = {leaf["name"]: leaf["record_count"] for leaf in hierarchy["leaves"]}
    assert counts["product_search"] == 13
    assert counts["track_package"] == 11
    assert counts["product_details"] == 5
    assert counts["apply_discount_code"] == 4
    assert counts["product_comparison"] == 0
    assert counts["customer_support"] == 0


def test_build_both_empty_records():
    """No records → all tools are empty in the hierarchy, per-record array is empty."""
    schema = [_oai_tool("a"), _oai_tool("b")]
    hierarchy, per_record = build_both(schema, records=[])
    assert len(hierarchy["leaves"]) == 2
    assert all(leaf["record_count"] == 0 for leaf in hierarchy["leaves"])
    assert per_record == []


# ─── Helpers ───────────────────────────────────────────────────────────────


def _name_of(tool: dict) -> str:
    if tool.get("type") == "function":
        return tool["function"]["name"]
    return tool["name"]
