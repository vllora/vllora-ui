"""
Unit tests for trace_topics.py.

Verifies the two-level topic hierarchy:
  Level 0: agent identity (from normalized system prompt)
  Level 1: functional category — tools grouped by verb/domain keyword

Also verifies per-record `tools` array (training concept) still works.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import pytest  # noqa: E402
from trace_topics import (  # noqa: E402
    MIN_RECORDS_PER_LEAF,
    _classify_tool,
    build_both,
    build_per_record_tools_array,
    build_record_topic_index,
    build_topic_hierarchy,
    count_records_per_tool,
    flatten_hierarchy_leaves,
    normalize_system_prompt,
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


def _record(tool_calls: list[tuple[str, dict]], system_prompt: str = "You are an assistant."):
    """Build a minimal training record with the given tool calls."""
    return {
        "messages": [
            {"role": "system", "content": system_prompt},
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


def _records_n(tool_name: str, n: int, system_prompt: str = "You are an assistant."):
    """Build n identical records calling the given tool."""
    return [_record([(tool_name, {})], system_prompt=system_prompt) for _ in range(n)]


# ─── _classify_tool ─────────────────────────────────────────────────────────


def test_classify_verb_prefix():
    assert _classify_tool("search_products") == "search"
    assert _classify_tool("get_weather") == "get"
    assert _classify_tool("calculate_tax") == "calculate"


def test_classify_verb_any_position():
    """Verb keywords match in any word position, not just prefix."""
    assert _classify_tool("product_search") == "search"
    assert _classify_tool("amazon_search_results") == "search"


def test_classify_domain_fallback():
    """If no verb matches, domain keywords are used."""
    assert _classify_tool("stock_price") == "finance"
    assert _classify_tool("weather_forecast") == "weather"
    assert _classify_tool("airport_arrivals") == "geo"


def test_classify_unknown():
    assert _classify_tool("astronomy_api") == "other"
    assert _classify_tool("keto_recipes_by_difficulty") == "food"


# ─── normalize_system_prompt ──────────────────────────────────────────────


def test_normalize_extracts_first_sentence():
    prompt = "You are a shopping assistant for MegaStore. Today is 2025-11-15. Session ID: sess-abc."
    assert normalize_system_prompt(prompt) == "You are a shopping assistant for MegaStore."


def test_normalize_strips_numbers_in_role():
    prompt = "You are an HR assistant for TechCorp (employee count: 2,847)."
    normalized = normalize_system_prompt(prompt)
    assert "2,847" not in normalized
    assert "HR assistant" in normalized


def test_normalize_identical_for_same_agent():
    p1 = "You are a CS agent for ShopSmart. Today is 2025-01-01. User: user-abc123."
    p2 = "You are a CS agent for ShopSmart. Today is 2025-06-15. User: user-xyz789."
    assert normalize_system_prompt(p1) == normalize_system_prompt(p2)


def test_normalize_different_for_different_agents():
    p1 = "You are a shopping assistant for MegaStore."
    p2 = "You are a technical support agent for CloudCo."
    assert normalize_system_prompt(p1) != normalize_system_prompt(p2)


def test_normalize_empty_prompt():
    assert normalize_system_prompt("") == ""


# ─── build_topic_hierarchy ────────────────────────────────────────────────


def test_single_agent_groups_by_category():
    """Records with same verb category merge into one leaf."""
    records = [
        *_records_n("search_products", 6),
        *_records_n("find_items", 4),  # "find" → search category
        *_records_n("track_order", 3),
    ]
    h = build_topic_hierarchy(records)
    assert len(h["children"]) == 1
    agent = h["children"][0]
    cats = {c["name"]: c["record_count"] for c in agent["children"]}
    # search_products (6) + find_items (4) = search (10)
    assert cats["search"] == 10
    # track_order (3) < MIN_RECORDS → merged to "other"
    assert cats["other"] == 3


def test_multi_agent_hierarchy():
    """Different system prompts → multiple roots."""
    records = [
        *_records_n("search_products", 6, "You are a shopping agent."),
        *_records_n("diagnose_issue", 6, "You are a support agent."),
    ]
    h = build_topic_hierarchy(records)
    assert len(h["children"]) == 2
    names = {a["name"] for a in h["children"]}
    assert "Shopping Agent" in names
    assert "Support Agent" in names


def test_parallel_tool_calls_classified_by_primary():
    """Pattern D: parallel calls classified by primary tool's category."""
    records = [
        *[_record([("search_products", {}), ("filter_results", {})]) for _ in range(6)],
    ]
    h = build_topic_hierarchy(records)
    cats = {c["name"]: c["record_count"] for c in h["children"][0]["children"]}
    # "search_products" primary → search category
    assert cats["search"] == 6


def test_empty_records_produces_empty_hierarchy():
    h = build_topic_hierarchy([])
    assert h["children"] == []


def test_no_system_prompt_fallback():
    """Records without system prompts get grouped under 'Unknown Agent'."""
    record = {
        "messages": [
            {"role": "user", "content": "hi"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {"id": "c0", "type": "function",
                     "function": {"name": "tool_a", "arguments": "{}"}},
                ],
            },
        ],
        "tools": [],
    }
    h = build_topic_hierarchy([record])
    assert len(h["children"]) == 1
    assert h["children"][0]["name"] == "Unknown Agent"


def test_min_records_threshold_merges_small_categories():
    """Categories below MIN_RECORDS_PER_LEAF merge into 'other'."""
    records = [
        *_records_n("get_weather", 20),      # get: 20 (above threshold)
        *_records_n("book_flight", 2),        # book: 2 (below threshold)
        *_records_n("random_stuff", 1),       # other: 1
    ]
    h = build_topic_hierarchy(records)
    cats = {c["name"]: c["record_count"] for c in h["children"][0]["children"]}
    assert cats["get"] == 20
    assert cats["other"] == 3  # book (2) + random_stuff (1)
    assert "book" not in cats


# ─── flatten_hierarchy_leaves ─────────────────────────────────────────────


def test_flatten_produces_full_paths():
    records = [
        *_records_n("search_products", 6, "You are a shopping agent."),
        *_records_n("check_status", 6, "You are a support agent."),
    ]
    h = build_topic_hierarchy(records)
    leaves = flatten_hierarchy_leaves(h)
    full_paths = {leaf["full_path"] for leaf in leaves}
    assert "Shopping Agent / search" in full_paths
    assert "Support Agent / check" in full_paths


# ─── build_record_topic_index ─────────────────────────────────────────────


def test_record_topic_index_assigns_categories():
    records = [
        *_records_n("search_products", 6, "You are a shopping agent."),
        *_records_n("check_status", 6, "You are a support agent."),
    ]
    index = build_record_topic_index(records)
    assert index[0] == "Shopping Agent / search"
    assert index[6] == "Support Agent / check"


def test_record_topic_index_100_percent_coverage():
    """Every record with a tool call gets a topic assignment."""
    records = [
        *_records_n("search_products", 6, "You are agent X."),
        *_records_n("get_details", 6, "You are agent Y."),
    ]
    h = build_topic_hierarchy(records)
    index = build_record_topic_index(records)
    leaf_paths = {leaf["full_path"] for leaf in flatten_hierarchy_leaves(h)}

    for i, fp in index.items():
        assert fp is not None, f"Record {i} has no topic"
        assert fp in leaf_paths, f"Record {i} topic '{fp}' not in hierarchy"


# ─── count_records_per_tool ───────────────────────────────────────────────


def test_count_records_single_call_per_record():
    records = [
        _record([("product_search", {"q": "tablet"})]),
        _record([("product_search", {"q": "phone"})]),
        _record([("track_package", {"id": "K91"})]),
    ]
    counts = count_records_per_tool(records)
    assert counts == {"product_search": 2, "track_package": 1}


def test_count_records_parallel_calls_counted_separately():
    records = [
        _record([
            ("product_search", {"q": "dishwasher"}),
            ("product_search", {"q": "toaster"}),
            ("product_comparison", {"a": 1, "b": 2}),
        ]),
    ]
    counts = count_records_per_tool(records)
    assert counts == {"product_search": 2, "product_comparison": 1}


def test_count_records_refusal_records_not_counted():
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


# ─── build_per_record_tools_array ─────────────────────────────────────────


def test_per_record_tools_excludes_never_called():
    schema = [_oai_tool("used_tool"), _oai_tool("empty_tool")]
    records = [_record([("used_tool", {"x": 1})])]
    _, per_record = build_both(schema, records)
    names = [_name_of(t) for t in per_record]
    assert names == ["used_tool"]


def test_per_record_tools_includes_all_called():
    schema = [_oai_tool("a"), _oai_tool("b"), _oai_tool("c")]
    records = [_record([("a", {})]), _record([("b", {})])]
    _, per_record = build_both(schema, records)
    names = [_name_of(t) for t in per_record]
    assert names == ["a", "b"]


# ─── build_both integration ──────────────────────────────────────────────


def test_build_both_shopping_agent_scenario():
    """End-to-end: 6 tools defined, 4 used. Categories group by verb."""
    schema = [
        _oai_tool("search_products", "Search products"),
        _oai_tool("get_product_details", "Get product details"),
        _oai_tool("compare_products", "Compare two products"),
        _oai_tool("track_package", "Track a shipment"),
        _oai_tool("apply_discount_code", "Apply a discount"),
        _oai_tool("customer_support", "Unused in this bundle"),
    ]
    prompt = "You are a shopping assistant."
    records = [
        *_records_n("search_products", 13, prompt),
        *_records_n("track_package", 11, prompt),
        *_records_n("get_product_details", 8, prompt),
        *_records_n("apply_discount_code", 6, prompt),
    ]

    hierarchy, per_record = build_both(schema, records, agent_root_name="Shopping Agent")

    assert len(hierarchy["children"]) == 1
    agent = hierarchy["children"][0]
    assert agent["name"] == "Shopping Assistant"

    cats = {c["name"]: c["record_count"] for c in agent["children"]}
    # search_products (13) → search
    assert cats["search"] == 13
    # get_product_details (8) → get
    assert cats["get"] == 8
    # track_package has no verb match → other
    # apply_discount_code has no verb match → other
    # (11 + 6 = 17 in other)
    assert cats["other"] == 17

    # Per-record tools: only 4 called tools
    per_record_names = {_name_of(t) for t in per_record}
    assert per_record_names == {
        "search_products", "track_package",
        "get_product_details", "apply_discount_code",
    }


def test_build_both_empty_records():
    schema = [_oai_tool("a"), _oai_tool("b")]
    hierarchy, per_record = build_both(schema, records=[])
    assert hierarchy["children"] == []
    assert per_record == []


def test_build_both_multi_agent():
    """Two agents, different tools → separate roots with category leaves."""
    schema = [_oai_tool("search_items"), _oai_tool("check_status")]
    records = [
        *_records_n("search_items", 6, "You are a shopping agent."),
        *_records_n("check_status", 6, "You are a support agent."),
    ]
    hierarchy, per_record = build_both(schema, records)

    assert len(hierarchy["children"]) == 2
    agents = {a["name"]: a for a in hierarchy["children"]}

    shopping = agents["Shopping Agent"]
    assert len(shopping["children"]) == 1
    assert shopping["children"][0]["name"] == "search"
    assert shopping["children"][0]["record_count"] == 6

    support = agents["Support Agent"]
    assert len(support["children"]) == 1
    assert support["children"][0]["name"] == "check"
    assert support["children"][0]["record_count"] == 6

    assert len(per_record) == 2


# ─── Helpers ──────────────────────────────────────────────────────────────


def _name_of(tool: dict) -> str:
    if tool.get("type") == "function":
        return tool["function"]["name"]
    return tool["name"]
