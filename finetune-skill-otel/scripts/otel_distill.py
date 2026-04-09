# /// script
# requires-python = ">=3.10"
# ///
"""
otel_distill.py — Stage 3: extract training records from OTel trace spans.

Reads a semconv JSON file (one span per list entry, as produced by
`openinference_to_semconv.py` or a raw OTLP-JSONL source that already
uses gen_ai.* attributes) and emits training records in OpenAI chat-
completion JSONL format — one JSONL line per successful LLM decision
point.

**The unit of extraction is an LLM decision point**, not a trace or turn.
A trace contains N decision points; each successful one becomes one
training record. Four patterns are handled automatically by the
decision-point rule:

    A — Single-shot:       1 LLM span → 1 record
    B — Error recovery:    failed LLM span is skipped; subsequent
                           successful LLM span becomes a record whose
                           input_messages already include the failed
                           attempt + error (provider populated), so
                           it IS the SCoRe correction record
    C — Sequential ReAct:  N LLM spans → N records with growing context
                           (each span's input_messages naturally include
                           all prior turns)
    D — Parallel calls:    1 LLM span with K tool_calls in output_messages
                           → 1 record with K tool_calls in the assistant
                           message (OpenAI format)

A "successful LLM decision point" is an LLM span (`operation.name == chat`)
whose output_messages contain at least one tool_call, AND where every
emitted tool_call has a corresponding execute_tool span in the same trace
with status_code == OK (linked via gen_ai.tool.call.id).

Spans where tool_calls all failed are **skipped** — no imitation record,
no correction record. The successful recovery span (if any) handles
both via the "input_messages already include the failed attempt" trick.

Spans with text output and no tool_calls are skipped (response writers,
Pattern B dropouts).

Usage:
    python3 otel_distill.py spans.json \\
        --output training.jsonl \\
        [--tool-schema tools.json]

If --tool-schema is not provided, the tool schema is lifted from the
first LLM span's request attributes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


# ─── Span classification ────────────────────────────────────────────────────


def _attrs(span: dict) -> dict:
    return span.get("attributes") or {}


def is_llm_chat_span(span: dict) -> bool:
    return _attrs(span).get("gen_ai.operation.name") == "chat"


def is_execute_tool_span(span: dict) -> bool:
    return _attrs(span).get("gen_ai.operation.name") == "execute_tool"


def span_status_ok(span: dict) -> bool:
    """Default to OK if not set — absent status_code means 'not reported'."""
    status = span.get("status_code")
    return status in (None, "OK")


# ─── Grouping / indexing ────────────────────────────────────────────────────


def group_by_trace_id(spans: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for span in spans:
        tid = span.get("trace_id") or "__unknown__"
        groups.setdefault(str(tid), []).append(span)
    return groups


def build_tool_execution_index(spans: list[dict]) -> dict[str, dict]:
    """Index execute_tool spans by tool_call_id (for success checking)."""
    index: dict[str, dict] = {}
    for span in spans:
        if not is_execute_tool_span(span):
            continue
        tool_call_id = _attrs(span).get("gen_ai.tool.call.id")
        if tool_call_id:
            index[str(tool_call_id)] = span
    return index


def build_tool_name_fallback_index(spans: list[dict]) -> dict[str, list[dict]]:
    """Fallback index keyed by `gen_ai.tool.name` for traces where
    producers don't emit `gen_ai.tool.call.id` on execute_tool spans
    (common with Phoenix/OpenInference sources before the semconv
    field is adopted).

    Spans are stored in chronological order within each tool-name
    queue so the first unmatched call pops the earliest matching
    execute_tool span. Only spans NOT already in `build_tool_execution_index`
    by ID are included — ID-based matching always takes precedence.
    """
    by_name: dict[str, list[dict]] = {}
    sorted_spans = sorted(spans, key=lambda s: str(s.get("start_time") or ""))
    for span in sorted_spans:
        if not is_execute_tool_span(span):
            continue
        if _attrs(span).get("gen_ai.tool.call.id"):
            continue  # already indexed by ID
        tool_name = _attrs(span).get("gen_ai.tool.name")
        if not tool_name:
            continue
        by_name.setdefault(str(tool_name), []).append(span)
    return by_name


# ─── Tool call extraction + success checking ───────────────────────────────


def extract_tool_calls_from_output(output_messages: list[dict] | None) -> list[dict]:
    """Pull `{id, name, arguments}` dicts from the assistant's output parts.

    Returns an empty list if no tool calls were emitted (the model only
    produced text, or there are no output messages).
    """
    if not output_messages:
        return []
    tool_calls: list[dict] = []
    for msg in output_messages:
        if not isinstance(msg, dict):
            continue
        for part in msg.get("parts") or []:
            if not isinstance(part, dict):
                continue
            if part.get("type") != "tool_call":
                continue
            tool_calls.append(
                {
                    "id": part.get("id") or "",
                    "name": part.get("name") or "",
                    "arguments": part.get("arguments") if part.get("arguments") is not None else {},
                }
            )
    return tool_calls


def all_tool_calls_succeeded(
    tool_calls: list[dict],
    tool_exec_index: dict[str, dict],
    name_fallback: dict[str, list[dict]] | None = None,
) -> bool:
    """True iff every tool call has a matching execute_tool span with OK status.

    Match order:
      1. By `gen_ai.tool.call.id` via `tool_exec_index`.
      2. If the ID is missing or not in the index, AND a
         `name_fallback` (tool_name → queue of execute_tool spans)
         is supplied, pop the next matching span from that queue.
         This handles producers that don't emit tool.call.id yet.

    Missing everywhere → False. Non-OK status → False.

    NOTE: name_fallback is mutated (spans are popped as they're
    matched). Callers that need to re-check should deep-copy first.
    """
    for tc in tool_calls:
        tc_id = str(tc.get("id") or "")
        exec_span = tool_exec_index.get(tc_id) if tc_id else None
        if exec_span is None and name_fallback is not None:
            queue = name_fallback.get(str(tc.get("name") or ""))
            if queue:
                exec_span = queue.pop(0)
        if exec_span is None:
            return False
        if not span_status_ok(exec_span):
            return False
    return True


# ─── Semconv → OpenAI message format ───────────────────────────────────────


def _text_of_parts(parts: list[dict]) -> str:
    """Concatenate text parts into a single string."""
    return "\n".join(
        str(p.get("content", "")) for p in parts if p.get("type") == "text"
    ).strip()


def semconv_msg_to_openai(msg: dict) -> dict:
    """Convert a semconv message to OpenAI chat-completion format.

    Semconv message shape (from otel_extract.py / openinference_to_semconv.py):
        {
          "role": "system" | "user" | "assistant" | "tool",
          "parts": [
              {"type": "text", "content": "..."},
              {"type": "tool_call", "id": ..., "name": ..., "arguments": {...}},
              {"type": "tool_result", "id": ..., "result": ...},
          ],
        }

    OpenAI chat-completion shape:
        system/user → {"role": "...", "content": "..."}
        assistant   → {"role": "assistant", "content": str|None, "tool_calls": [...]?}
        tool        → {"role": "tool", "tool_call_id": "...", "content": "..."}
    """
    role = msg.get("role") or "user"
    parts = msg.get("parts") or []

    if role == "tool":
        tool_call_id: str | None = None
        content_buf: list[str] = []
        for p in parts:
            if not isinstance(p, dict):
                continue
            t = p.get("type")
            if t == "tool_result":
                tool_call_id = tool_call_id or p.get("id") or p.get("tool_call_id")
                result = p.get("result")
                content_buf.append(
                    result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
                )
            elif t == "text":
                content_buf.append(str(p.get("content", "")))
        return {
            "role": "tool",
            "tool_call_id": tool_call_id or "",
            "content": "\n".join(content_buf).strip(),
        }

    if role == "assistant":
        text = _text_of_parts(parts)
        tool_calls: list[dict] = []
        for p in parts:
            if not isinstance(p, dict):
                continue
            if p.get("type") != "tool_call":
                continue
            args = p.get("arguments")
            args_json = (
                args if isinstance(args, str) else json.dumps(args or {}, ensure_ascii=False)
            )
            tool_calls.append(
                {
                    "id": p.get("id") or "",
                    "type": "function",
                    "function": {
                        "name": p.get("name") or "",
                        "arguments": args_json,
                    },
                }
            )
        out: dict[str, Any] = {"role": "assistant", "content": text or None}
        if tool_calls:
            out["tool_calls"] = tool_calls
        return out

    # system / user / any other role → plain text
    return {"role": role, "content": _text_of_parts(parts)}


def build_assistant_tool_call_message(tool_calls: list[dict]) -> dict:
    """Build an OpenAI-format assistant message carrying only tool_calls.

    Used for the *predicted* output position of a training record (the
    thing we want the student model to learn to emit). Content is None
    per OpenAI's convention when the assistant is calling tools.
    """
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": tc.get("id") or "",
                "type": "function",
                "function": {
                    "name": tc.get("name") or "",
                    "arguments": (
                        tc["arguments"]
                        if isinstance(tc.get("arguments"), str)
                        else json.dumps(tc.get("arguments") or {}, ensure_ascii=False)
                    ),
                },
            }
            for tc in tool_calls
        ],
    }


# ─── Tool schema extraction ─────────────────────────────────────────────────


def extract_tool_schema_from_spans(spans: list[dict]) -> list[dict]:
    """Pull a tool schema from any LLM span's request attributes.

    The tool schema is typically consistent across all LLM spans in a
    workflow, so we return the first one we find. Checks several possible
    locations:
      - `gen_ai.request.tools` (OTel semconv)
      - `llm.invocation_parameters` → `tools` key (OpenInference, may be
        JSON-serialized)
      - `llm.tools` (some OpenInference variants)

    Returns an empty list if no schema is found. Callers can override
    with an explicit --tool-schema argument.
    """
    for span in spans:
        attrs = _attrs(span)
        if attrs.get("gen_ai.operation.name") != "chat":
            continue

        tools = attrs.get("gen_ai.request.tools")
        if tools:
            return tools if isinstance(tools, list) else []

        params = attrs.get("llm.invocation_parameters")
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = None
        if isinstance(params, dict) and isinstance(params.get("tools"), list):
            return params["tools"]

        llm_tools = attrs.get("llm.tools")
        if isinstance(llm_tools, list):
            return llm_tools

    return []


# ─── Per-trace extraction ──────────────────────────────────────────────────


def extract_records_from_trace(
    trace_spans: list[dict],
    tool_schema: list[dict],
) -> list[dict]:
    """Extract training records from all successful LLM decision points
    in a single trace.

    Returns a list of records. Each record is an OpenAI chat-completion
    dict: `{"messages": [...], "tools": [...]}`.
    """
    # Sort by start_time (lexicographic on ISO timestamps, or int nanoseconds)
    sorted_spans = sorted(
        trace_spans, key=lambda s: str(s.get("start_time") or "")
    )
    tool_exec_index = build_tool_execution_index(sorted_spans)
    name_fallback = build_tool_name_fallback_index(sorted_spans)

    records: list[dict] = []
    for span in sorted_spans:
        if not is_llm_chat_span(span):
            continue

        attrs = _attrs(span)
        output_messages = attrs.get("gen_ai.output.messages") or []
        input_messages = attrs.get("gen_ai.input.messages") or []

        tool_calls = extract_tool_calls_from_output(output_messages)
        if not tool_calls:
            continue  # not a decision point (response writer or refusal)

        if not all_tool_calls_succeeded(tool_calls, tool_exec_index, name_fallback):
            continue  # Pattern B failed attempt — skip, recovery span handles it

        # Build the training record:
        # messages = input_messages (as-is from the provider, which include
        #            all prior tool results for sequential ReAct) + the
        #            assistant's tool_call output
        messages = [semconv_msg_to_openai(m) for m in input_messages]
        messages.append(build_assistant_tool_call_message(tool_calls))

        records.append(
            {
                "messages": messages,
                "tools": tool_schema,
            }
        )

    return records


# ─── Top-level ──────────────────────────────────────────────────────────────


def extract_records(
    spans: list[dict],
    tool_schema: list[dict] | None = None,
) -> list[dict]:
    """Extract training records from a flat list of semconv spans.

    If `tool_schema` is None, lift it from the first LLM span's request
    attributes. Returns a flat list of OpenAI chat-completion records.
    """
    if tool_schema is None:
        tool_schema = extract_tool_schema_from_spans(spans)

    by_trace = group_by_trace_id(spans)
    all_records: list[dict] = []
    for _, trace_spans in by_trace.items():
        all_records.extend(extract_records_from_trace(trace_spans, tool_schema))
    return all_records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract OpenAI chat-completion training records from semconv spans"
    )
    parser.add_argument(
        "input", type=Path, help="Semconv JSON file (list of spans)"
    )
    parser.add_argument(
        "--tool-schema",
        type=Path,
        required=False,
        help="Optional JSON file overriding the tool schema (defaults to lifting from spans)",
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="Output training.jsonl"
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: not found: {args.input}", file=sys.stderr)
        return 2

    data = json.loads(args.input.read_text())
    if not isinstance(data, list):
        print("error: expected a list of spans in input", file=sys.stderr)
        return 2

    tool_schema: list[dict] | None = None
    if args.tool_schema:
        if not args.tool_schema.exists():
            print(f"error: --tool-schema not found: {args.tool_schema}", file=sys.stderr)
            return 2
        schema_data = json.loads(args.tool_schema.read_text())
        tool_schema = schema_data if isinstance(schema_data, list) else []

    records = extract_records(data, tool_schema)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    tool_count = len(tool_schema) if tool_schema else len(extract_tool_schema_from_spans(data))
    print(
        f"wrote {len(records)} records → {args.output} "
        f"(tool schema: {tool_count} tools, "
        f"total input spans: {len(data)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
