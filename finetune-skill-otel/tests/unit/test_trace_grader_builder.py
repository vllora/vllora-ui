"""
Unit tests for trace_grader_builder.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from trace_grader_builder import (  # noqa: E402
    FORMULA_VERSION,
    WRONG_TOOL_FLOOR,
    build_grader_config,
    detect_case_insensitive_params,
)


# ─── Fixture builders ──────────────────────────────────────────────────────


def _oai_tool(name, description="", properties=None):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties or {},
                "required": list((properties or {}).keys()),
            },
        },
    }


def _flat_tool(name, description="", properties=None):
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties or {},
        },
    }


# ─── build_grader_config ────────────────────────────────────────────────────


def test_build_config_has_required_fields():
    schema = [_oai_tool("product_search")]
    config = build_grader_config(schema)
    assert config["type"] == "programmatic_tool_call"
    assert config["formula_version"] == FORMULA_VERSION
    assert config["tool_schema"] == schema
    assert config["wrong_tool_floor"] == WRONG_TOOL_FLOOR
    assert config["case_insensitive_params"] == []


def test_build_config_preserves_tool_schema_verbatim():
    schema = [
        _oai_tool("a", "A tool", {"x": {"type": "string"}}),
        _oai_tool("b", "B tool", {"y": {"type": "integer"}}),
    ]
    config = build_grader_config(schema)
    # Schema is passed through unchanged — the cloud will use it
    assert config["tool_schema"] == schema


def test_build_config_respects_custom_floor():
    config = build_grader_config([], wrong_tool_floor=0.1)
    assert config["wrong_tool_floor"] == 0.1


def test_build_config_respects_custom_version():
    config = build_grader_config([], formula_version="v2-experimental")
    assert config["formula_version"] == "v2-experimental"


# ─── detect_case_insensitive_params ────────────────────────────────────────


def test_detect_enum_string_param_from_openai_schema():
    schema = [
        _oai_tool(
            "fetch",
            properties={
                "method": {"type": "string", "enum": ["GET", "POST", "PUT"]},
                "url": {"type": "string"},
            },
        )
    ]
    result = detect_case_insensitive_params(schema)
    assert result == [{"tool": "fetch", "param": "method"}]


def test_detect_enum_string_param_from_flat_schema():
    schema = [
        _flat_tool(
            "fetch",
            properties={
                "method": {"type": "string", "enum": ["get", "post"]},
            },
        )
    ]
    result = detect_case_insensitive_params(schema)
    assert result == [{"tool": "fetch", "param": "method"}]


def test_detect_ignores_numeric_enum():
    """Numeric enums are compared exactly, not case-insensitively."""
    schema = [
        _oai_tool(
            "set_limit",
            properties={
                "limit": {"type": "integer", "enum": [10, 50, 100]},
            },
        )
    ]
    assert detect_case_insensitive_params(schema) == []


def test_detect_ignores_boolean_enum():
    schema = [
        _oai_tool(
            "toggle",
            properties={
                "state": {"type": "boolean", "enum": [True, False]},
            },
        )
    ]
    assert detect_case_insensitive_params(schema) == []


def test_detect_ignores_mixed_type_enum():
    """Mixed-type enums (partial strings) are not case-insensitive —
    can't be sure which values are strings."""
    schema = [
        _oai_tool(
            "ambiguous",
            properties={
                "value": {"enum": ["foo", 1, "bar"]},
            },
        )
    ]
    assert detect_case_insensitive_params(schema) == []


def test_detect_handles_multiple_tools_with_enums():
    schema = [
        _oai_tool(
            "fetch",
            properties={
                "method": {"type": "string", "enum": ["GET", "POST"]},
                "url": {"type": "string"},
            },
        ),
        _oai_tool(
            "send_notification",
            properties={
                "channel": {"type": "string", "enum": ["email", "sms", "push"]},
                "priority": {"type": "string", "enum": ["low", "med", "high"]},
                "body": {"type": "string"},
            },
        ),
        _oai_tool("no_enums", properties={"query": {"type": "string"}}),
    ]
    result = detect_case_insensitive_params(schema)
    assert sorted(result, key=lambda d: (d["tool"], d["param"])) == [
        {"tool": "fetch", "param": "method"},
        {"tool": "send_notification", "param": "channel"},
        {"tool": "send_notification", "param": "priority"},
    ]


def test_detect_skips_empty_enum_list():
    schema = [
        _oai_tool(
            "weird",
            properties={
                "value": {"type": "string", "enum": []},
            },
        )
    ]
    assert detect_case_insensitive_params(schema) == []


def test_detect_skips_nameless_tools():
    schema = [
        {"type": "function", "function": {"parameters": {"properties": {}}}},
        _oai_tool("real_tool"),
    ]
    # Nameless tool is skipped; real_tool has no enums
    assert detect_case_insensitive_params(schema) == []


# ─── Integration: full shopping-agent scenario ─────────────────────────────


def test_build_config_shopping_agent_scenario():
    """Full build against a realistic shopping-agent schema."""
    schema = [
        _oai_tool(
            "product_search",
            description="Search products",
            properties={
                "query": {"type": "string"},
                "category": {
                    "type": "string",
                    "enum": ["electronics", "home", "clothing"],
                },
                "page_size": {"type": "integer"},
            },
        ),
        _oai_tool(
            "product_details",
            properties={"product_id": {"type": "integer"}},
        ),
        _oai_tool(
            "track_package",
            properties={
                "carrier": {
                    "type": "string",
                    "enum": ["FedEx", "UPS", "USPS"],
                },
                "tracking_number": {"type": "string"},
            },
        ),
    ]

    config = build_grader_config(schema)

    assert config["type"] == "programmatic_tool_call"
    assert config["formula_version"] == "v1"
    assert config["wrong_tool_floor"] == 0.02
    assert len(config["tool_schema"]) == 3

    # Two case-insensitive params: product_search.category + track_package.carrier
    ci = config["case_insensitive_params"]
    assert len(ci) == 2
    assert {"tool": "product_search", "param": "category"} in ci
    assert {"tool": "track_package", "param": "carrier"} in ci
