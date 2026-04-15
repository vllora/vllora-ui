# /// script
# requires-python = ">=3.10"
# ///
"""
otel_extract.py — turn OTel GenAI traces into knowledge_parts.json

Sibling of `extract_router.py` / `build_knowledge_parts.py`. Reads a file of
OpenTelemetry GenAI spans and emits the same `knowledge_parts.json` format the
rest of the pipeline already understands. Once written, `consolidate_parts.py`
picks the file up automatically — no other pipeline step changes.

Input formats accepted:
  1. JSON array of spans: [{trace_id, span_id, ...}, ...]
  2. OTLP-JSON: {"resourceSpans": [{"scopeSpans": [{"spans": [...]}]}]}

Span attributes follow the OpenTelemetry GenAI semantic conventions
(April 2026, status: development). See:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/

DEPRECATED attributes we DO NOT consume (removed in v1.38.0):
  - gen_ai.prompt
  - gen_ai.completion
Use `gen_ai.input.messages` and `gen_ai.output.messages` instead.

Each emitted knowledge part is one logical unit from the trace:
  - the system instructions (if present)
  - one part per user/assistant/tool message
  - one part per tool call (arguments + result)

The part's `content_metadata` carries the OTel attributes the UI uses to
re-render the trace inside the dataset Sources view (see
`OtelTraceSourceViewer.tsx`):
    {
      "kind": "otel-trace",
      "trace_id": ..., "span_id": ..., "parent_span_id": ...,
      "operation_name": ..., "provider_name": ..., "request_model": ...,
      "conversation_id": ..., "agent_name": ...,
      "role": "system|user|assistant|tool",
      "finish_reason": ..., "tool_name": ..., "tool_call_id": ...,
      "input_tokens": ..., "output_tokens": ...,
      "start_time": ..., "end_time": ..., "duration_ms": ...
    }

Usage:
    python3 otel_extract.py traces.json -o finetune-project/knowledge/otel-{conv}/knowledge_parts.json
    python3 otel_extract.py traces.json --out-dir finetune-project/knowledge --split-by conversation
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable


# ─── Span normalization ─────────────────────────────────────────────────────────


def _attr(span: dict, key: str, default: Any = None) -> Any:
    """Look up `gen_ai.foo` from either flat or OTLP `attributes` shape."""
    # Flat shape (what most non-OTLP serializers produce)
    if key in span:
        return span[key]
    flat = span.get("attributes")
    if isinstance(flat, dict):
        if key in flat:
            return flat[key]
    # OTLP shape: attributes = [{key, value: {stringValue|intValue|...}}]
    if isinstance(flat, list):
        for kv in flat:
            if not isinstance(kv, dict):
                continue
            if kv.get("key") == key:
                v = kv.get("value", {})
                for k in ("stringValue", "intValue", "doubleValue", "boolValue"):
                    if k in v:
                        return v[k]
                if "kvlistValue" in v or "arrayValue" in v:
                    # Best-effort — caller can handle structured values
                    return v
    return default


def _iter_spans(payload: Any) -> Iterable[dict]:
    """Accept either a flat list of spans or OTLP-JSON resourceSpans."""
    if isinstance(payload, list):
        yield from (s for s in payload if isinstance(s, dict))
        return
    if isinstance(payload, dict) and "resourceSpans" in payload:
        for rs in payload.get("resourceSpans") or []:
            for ss in rs.get("scopeSpans") or []:
                for s in ss.get("spans") or []:
                    yield s
        return
    raise ValueError(
        "Unrecognized OTel payload — expected a list of spans or an OTLP-JSON document",
    )


def _duration_ms(span: dict) -> int:
    start = span.get("start_time") or span.get("startTimeUnixNano")
    end = span.get("end_time") or span.get("endTimeUnixNano")
    if isinstance(start, (int, float)) and isinstance(end, (int, float)):
        # Nanoseconds → ms
        return max(0, int((float(end) - float(start)) / 1_000_000))
    if isinstance(start, str) and isinstance(end, str):
        # ISO timestamps
        try:
            from datetime import datetime

            ts = datetime.fromisoformat(start.replace("Z", "+00:00"))
            te = datetime.fromisoformat(end.replace("Z", "+00:00"))
            return max(0, int((te - ts).total_seconds() * 1000))
        except Exception:
            return 0
    return 0


# ─── Part emission ──────────────────────────────────────────────────────────────


def _common_meta(span: dict) -> dict:
    return {
        "kind": "otel-trace",
        "trace_id": span.get("trace_id") or span.get("traceId"),
        "span_id": span.get("span_id") or span.get("spanId"),
        "parent_span_id": span.get("parent_span_id") or span.get("parentSpanId"),
        "operation_name": _attr(span, "gen_ai.operation.name"),
        "provider_name": _attr(span, "gen_ai.provider.name"),
        "request_model": _attr(span, "gen_ai.request.model"),
        "response_model": _attr(span, "gen_ai.response.model"),
        "conversation_id": _attr(span, "gen_ai.conversation.id"),
        "agent_name": _attr(span, "gen_ai.agent.name"),
        "agent_id": _attr(span, "gen_ai.agent.id"),
        "input_tokens": _attr(span, "gen_ai.usage.input_tokens"),
        "output_tokens": _attr(span, "gen_ai.usage.output_tokens"),
        "start_time": span.get("start_time") or span.get("startTimeUnixNano"),
        "end_time": span.get("end_time") or span.get("endTimeUnixNano"),
        "duration_ms": _duration_ms(span),
    }


def _stringify_message_parts(message: dict) -> str:
    parts = message.get("parts") or []
    out: list[str] = []
    for p in parts:
        t = p.get("type")
        if t == "text":
            out.append(str(p.get("content", "")))
        elif t == "tool_call":
            out.append(
                f"[tool_call name={p.get('name')} id={p.get('id')}] "
                f"{json.dumps(p.get('arguments', {}), ensure_ascii=False)}"
            )
        elif t == "tool_result":
            out.append(
                f"[tool_result id={p.get('toolCallId') or p.get('tool_call_id')}] "
                f"{json.dumps(p.get('result'), ensure_ascii=False)}"
            )
        else:
            out.append(json.dumps(p, ensure_ascii=False))
    return "\n".join(out).strip()


def _make_part(part_id: str, content: str, meta: dict, extraction_path: str) -> dict:
    return {
        "id": part_id,
        "type": "text",
        "content": content,
        "content_metadata": {k: v for k, v in meta.items() if v is not None},
        "extraction_path": extraction_path,
    }


def extract_parts_from_span(span: dict, idx_in_trace: int) -> list[dict]:
    """Emit one or more parts from a single OTel span."""
    parts: list[dict] = []
    meta = _common_meta(span)
    span_id = meta.get("span_id") or f"span-{idx_in_trace}"
    trace_id = meta.get("trace_id") or "trace"
    base_path = f"{trace_id}/{span_id}"

    # System instructions
    sys_prompt = _attr(span, "gen_ai.system_instructions")
    if isinstance(sys_prompt, str) and sys_prompt.strip():
        parts.append(
            _make_part(
                f"{span_id}-system",
                sys_prompt.strip(),
                {**meta, "role": "system"},
                f"{base_path}#system",
            )
        )

    # Input messages (user / tool / earlier assistant turns)
    inputs = _attr(span, "gen_ai.input.messages") or []
    if isinstance(inputs, list):
        for i, msg in enumerate(inputs):
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "user")
            text = _stringify_message_parts(msg)
            if not text:
                continue
            parts.append(
                _make_part(
                    f"{span_id}-in-{i}",
                    text,
                    {**meta, "role": role},
                    f"{base_path}#in-{i}",
                )
            )

    # Output messages (assistant)
    outputs = _attr(span, "gen_ai.output.messages") or []
    if isinstance(outputs, list):
        for i, msg in enumerate(outputs):
            if not isinstance(msg, dict):
                continue
            text = _stringify_message_parts(msg)
            if not text:
                continue
            parts.append(
                _make_part(
                    f"{span_id}-out-{i}",
                    text,
                    {
                        **meta,
                        "role": msg.get("role", "assistant"),
                        "finish_reason": msg.get("finish_reason"),
                    },
                    f"{base_path}#out-{i}",
                )
            )

    # Execute-tool spans: emit a part for the tool result so the model sees
    # the (tool_name, args, result) triple even if the producer didn't put
    # it back into a chat message.
    if meta.get("operation_name") == "execute_tool":
        tool_name = _attr(span, "gen_ai.tool.name")
        args = _attr(span, "gen_ai.tool.call.arguments")
        result = _attr(span, "gen_ai.tool.call.result")
        if tool_name is not None or args is not None or result is not None:
            content = (
                f"tool: {tool_name}\n"
                f"arguments: {json.dumps(args, ensure_ascii=False, default=str)}\n"
                f"result: {json.dumps(result, ensure_ascii=False, default=str)}"
            )
            parts.append(
                _make_part(
                    f"{span_id}-tool",
                    content,
                    {
                        **meta,
                        "role": "tool",
                        "tool_name": tool_name,
                        "tool_call_id": _attr(span, "gen_ai.tool.call.id"),
                    },
                    f"{base_path}#tool",
                )
            )

    return parts


# ─── Top-level pipeline ─────────────────────────────────────────────────────────


def group_by_conversation(spans: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for s in spans:
        conv = _attr(s, "gen_ai.conversation.id") or s.get("trace_id") or s.get("traceId") or "unknown"
        groups.setdefault(str(conv), []).append(s)
    return groups


def build_parts_for_group(spans: list[dict]) -> list[dict]:
    out: list[dict] = []
    for i, span in enumerate(sorted(spans, key=lambda s: s.get("start_time") or "")):
        out.extend(extract_parts_from_span(span, i))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract OTel GenAI traces into knowledge_parts.json")
    parser.add_argument("input", type=Path, help="OTel trace file (JSON list or OTLP-JSON)")
    parser.add_argument("-o", "--output", type=Path, help="Output knowledge_parts.json (single file)")
    parser.add_argument(
        "--out-dir",
        type=Path,
        help="Directory to write per-conversation knowledge_parts.json files (mutually exclusive with -o)",
    )
    parser.add_argument(
        "--split-by",
        choices=["conversation", "trace", "none"],
        default="conversation",
        help="How to group spans into output files",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: input not found: {args.input}", file=sys.stderr)
        return 2
    if args.output and args.out_dir:
        print("error: pass either --output or --out-dir, not both", file=sys.stderr)
        return 2

    payload = json.loads(args.input.read_text())
    spans = list(_iter_spans(payload))
    if not spans:
        print("warning: no spans found", file=sys.stderr)
        return 0

    if args.split_by == "none":
        groups = {"all": spans}
    elif args.split_by == "trace":
        groups = {}
        for s in spans:
            tid = s.get("trace_id") or s.get("traceId") or "unknown"
            groups.setdefault(str(tid), []).append(s)
    else:
        groups = group_by_conversation(spans)

    if args.output:
        # Single-file mode: collapse all groups
        all_parts: list[dict] = []
        for g in groups.values():
            all_parts.extend(build_parts_for_group(g))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(all_parts, indent=2, ensure_ascii=False))
        print(f"wrote {len(all_parts)} parts → {args.output}")
        return 0

    out_dir = args.out_dir or Path("finetune-project/knowledge")
    out_dir.mkdir(parents=True, exist_ok=True)
    total_parts = 0
    for key, group_spans in groups.items():
        parts = build_parts_for_group(group_spans)
        if not parts:
            continue
        slug = "".join(c if c.isalnum() or c in "-_" else "-" for c in key)[:80] or "unknown"
        target = out_dir / f"otel-{slug}" / "knowledge_parts.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(parts, indent=2, ensure_ascii=False))
        total_parts += len(parts)
        print(f"wrote {len(parts):4d} parts → {target}")
    print(f"done: {total_parts} parts across {len(groups)} group(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
