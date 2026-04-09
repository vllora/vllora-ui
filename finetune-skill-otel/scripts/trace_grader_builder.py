# /// script
# requires-python = ">=3.10"
# ///
"""
trace_grader_builder.py — Stage 4: build a declarative grader config.

Takes a tool schema (ideally the per-record tools array from
`trace_topics.py`, since that's the version the training records
actually use) and produces a `grader.json` config that the cloud
training server uses to instantiate the same Jaccard grader
server-side as `trace_grader.grade()` does locally.

The config is **declarative** — it describes WHAT the grader does,
not HOW. The cloud re-implements the grader from the spec. This
avoids shipping Python code across trust boundaries and keeps the
local grader and cloud grader in lockstep via the `formula_version`
field.

The output shape matches the Stage 7 handoff payload's `grader`
field from the concept doc:

    {
      "type": "programmatic_tool_call",
      "formula_version": "v1",
      "tool_schema": [...],
      "wrong_tool_floor": 0.02,
      "case_insensitive_params": [
        {"tool": "product_search", "param": "category"},
        ...
      ]
    }

Usage:
    python3 trace_grader_builder.py per_record_tools.json \\
        --output grader.json

    # or from the raw tool schema:
    python3 trace_grader_builder.py tool_schema.json --output grader.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


FORMULA_VERSION = "v1"
WRONG_TOOL_FLOOR = 0.02


def _tool_name(tool: dict) -> str | None:
    if not isinstance(tool, dict):
        return None
    if tool.get("type") == "function" and isinstance(tool.get("function"), dict):
        return tool["function"].get("name")
    return tool.get("name")


def _tool_parameters(tool: dict) -> dict:
    """Extract the JSON Schema `parameters` object from a tool definition.

    Handles OpenAI-style (`function.parameters`) and flat-style
    (`parameters`) tool schemas.
    """
    if not isinstance(tool, dict):
        return {}
    if tool.get("type") == "function" and isinstance(tool.get("function"), dict):
        params = tool["function"].get("parameters") or {}
    else:
        params = tool.get("parameters") or {}
    return params if isinstance(params, dict) else {}


def detect_case_insensitive_params(tool_schema: list[dict]) -> list[dict]:
    """Find every tool parameter with a string `enum` constraint.

    Enum values are case-insensitive at grade time (e.g. `"GET" == "get"`
    for an HTTP method enum). This helper walks each tool's parameters
    and emits a list of `{"tool": name, "param": key}` entries for the
    grader to apply the case-insensitive rule against.

    Only the top level of `parameters.properties` is inspected; deeply
    nested enums (e.g. inside array-of-object parameters) are not
    handled in v1 — a known limitation.

    Only string enums get the case-insensitive treatment; numeric and
    boolean enums are compared exactly.
    """
    result: list[dict] = []
    for tool in tool_schema:
        tool_name = _tool_name(tool)
        if not tool_name:
            continue
        params = _tool_parameters(tool)
        properties = params.get("properties") or {}
        if not isinstance(properties, dict):
            continue
        for param_name, param_spec in properties.items():
            if not isinstance(param_spec, dict):
                continue
            enum = param_spec.get("enum")
            if not isinstance(enum, list) or not enum:
                continue
            if all(isinstance(v, str) for v in enum):
                result.append({"tool": tool_name, "param": param_name})
    return result


def build_grader_config(
    tool_schema: list[dict],
    formula_version: str = FORMULA_VERSION,
    wrong_tool_floor: float = WRONG_TOOL_FLOOR,
) -> dict:
    """Build the declarative grader config.

    Args:
        tool_schema: list of tool definitions (OpenAI or flat shape)
        formula_version: grader formula version — the cloud uses this
            to pick the matching server-side implementation
        wrong_tool_floor: the floor score returned for wrong tool names

    Returns:
        A dict ready to be serialized as `grader.json` and shipped to
        the cloud as part of the Stage 7 handoff payload.
    """
    return {
        "type": "programmatic_tool_call",
        "formula_version": formula_version,
        "tool_schema": tool_schema,
        "wrong_tool_floor": wrong_tool_floor,
        "case_insensitive_params": detect_case_insensitive_params(tool_schema),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build a declarative programmatic-grader config from a tool schema"
    )
    parser.add_argument(
        "tool_schema",
        type=Path,
        help="Tool schema JSON (OpenAI-style or flat) — ideally the per-record tools array from trace_topics.py",
    )
    parser.add_argument(
        "--formula-version",
        default=FORMULA_VERSION,
        help=f"Grader formula version (default: {FORMULA_VERSION})",
    )
    parser.add_argument(
        "--wrong-tool-floor",
        type=float,
        default=WRONG_TOOL_FLOOR,
        help=f"Wrong-tool-name floor score (default: {WRONG_TOOL_FLOOR})",
    )
    parser.add_argument("--output", type=Path, required=True, help="Output grader.json")
    args = parser.parse_args()

    if not args.tool_schema.exists():
        print(f"error: tool schema not found: {args.tool_schema}", file=sys.stderr)
        return 2

    tool_schema = json.loads(args.tool_schema.read_text())
    if not isinstance(tool_schema, list):
        print("error: tool schema must be a JSON array", file=sys.stderr)
        return 2

    config = build_grader_config(
        tool_schema,
        formula_version=args.formula_version,
        wrong_tool_floor=args.wrong_tool_floor,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(config, indent=2, ensure_ascii=False))

    print(
        f"wrote grader config → {args.output} "
        f"(type={config['type']}, version={config['formula_version']}, "
        f"tools={len(config['tool_schema'])}, "
        f"case-insensitive params={len(config['case_insensitive_params'])})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
