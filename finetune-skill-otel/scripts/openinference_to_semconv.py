# /// script
# requires-python = ">=3.10"
# dependencies = ["pandas", "pyarrow"]
# ///
"""
openinference_to_semconv.py — convert Arize OpenInference traces to OTel
GenAI semconv shape understood by `otel_extract.py`.

Input shapes accepted:
  1. JSONL — one OpenInference span per line (small Phoenix unit-test
     fixtures like `trace.jsonl`).
  2. Parquet — Phoenix demo/production exports (flattened columns like
     `attributes.llm.input_messages`).

Output: a flat JSON array of spans that conforms to the OTel GenAI
semconv attribute namespace (`gen_ai.*`), ready for `otel_extract.py`
to consume unchanged.

We convert two span kinds:
  - LLM  → semconv `chat` operation, with `gen_ai.input.messages` and
           `gen_ai.output.messages` populated. Tool calls inside an
           assistant message become parts of type `tool_call`.
  - TOOL → semconv `execute_tool` operation, with `gen_ai.tool.name`,
           `gen_ai.tool.call.arguments`, and `gen_ai.tool.call.result`.

All other span kinds (CHAIN, AGENT, RETRIEVER, EMBEDDING, RERANKER,
UNKNOWN) are skipped — they're framework scaffolding, not training
signal.

Status filter: drops any span with `status_code != OK`.

Usage:
    python3 openinference_to_semconv.py traces.parquet -o semconv.json
    python3 openinference_to_semconv.py traces.jsonl   -o semconv.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def _coerce(v: Any) -> Any:
    """Numpy arrays / records → plain Python."""
    if v is None:
        return None
    if hasattr(v, "tolist"):
        return v.tolist()
    return v


def _msg_to_semconv(raw: Any) -> dict | None:
    """One OpenInference message dict → one semconv message dict.

    OpenInference message keys: `message.role`, `message.content`,
    `message.tool_calls` (list of `{tool_call.function.name,
    tool_call.function.arguments}`).
    """
    if raw is None:
        return None
    if not hasattr(raw, "items") and not isinstance(raw, dict):
        try:
            raw = {k: raw[k] for k in raw.dtype.names}  # type: ignore[attr-defined]
        except Exception:
            return None

    def _pick(*keys):
        for k in keys:
            if k in raw:
                v = raw[k]
                if v is not None:
                    return v
        return None

    role = _pick("message.role", "role") or "user"
    content = _pick("message.content", "content")
    tool_calls = _coerce(_pick("message.tool_calls", "tool_calls"))

    parts: list[dict] = []
    if isinstance(content, str) and content.strip():
        parts.append({"type": "text", "content": content})
    if isinstance(tool_calls, list):
        for i, tc in enumerate(tool_calls):
            if not isinstance(tc, dict):
                continue
            name = tc.get("tool_call.function.name") or tc.get("name")
            args_raw = tc.get("tool_call.function.arguments") or tc.get("arguments")
            try:
                args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
            except Exception:
                args = args_raw
            parts.append(
                {
                    "type": "tool_call",
                    "id": tc.get("id") or f"tc-{i}",
                    "name": name,
                    "arguments": args,
                }
            )
    if not parts:
        return None
    return {"role": role, "parts": parts}


def _msgs_to_semconv(raw_list: Any) -> list[dict]:
    raw_list = _coerce(raw_list)
    if not isinstance(raw_list, list):
        return []
    out = []
    for m in raw_list:
        sm = _msg_to_semconv(m)
        if sm:
            out.append(sm)
    return out


def _llm_span_to_semconv(
    *,
    trace_id: str | None,
    span_id: str | None,
    parent_id: str | None,
    start_time: Any,
    end_time: Any,
    status_code: str | None,
    input_messages: Any,
    output_messages: Any,
    model_name: str | None,
    input_value_fallback: str | None = None,
    output_value_fallback: str | None = None,
    invocation_parameters: Any = None,
) -> dict | None:
    inputs = _msgs_to_semconv(input_messages)
    outputs = _msgs_to_semconv(output_messages)
    if not inputs and isinstance(input_value_fallback, str):
        inputs = [{"role": "user", "parts": [{"type": "text", "content": input_value_fallback}]}]
    if not outputs and isinstance(output_value_fallback, str):
        outputs = [
            {"role": "assistant", "parts": [{"type": "text", "content": output_value_fallback}]}
        ]
    if not inputs and not outputs:
        return None

    # OpenInference stores the tool schema inside `llm.invocation_parameters`
    # (JSON-encoded dict with a `tools` key). OTel semconv v1.38.0 has no
    # stable `gen_ai.request.tools` key yet, so we preserve the tools list
    # under both the nominal semconv name AND `llm.invocation_parameters`
    # for maximum downstream compatibility.
    tools_schema: list | None = None
    if isinstance(invocation_parameters, str):
        try:
            invocation_parameters = json.loads(invocation_parameters)
        except Exception:
            invocation_parameters = None
    if isinstance(invocation_parameters, dict):
        raw = invocation_parameters.get("tools")
        if isinstance(raw, list):
            tools_schema = raw

    attrs = {
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": model_name,
        "gen_ai.response.model": model_name,
        "gen_ai.input.messages": inputs,
        "gen_ai.output.messages": outputs,
        "gen_ai.request.tools": tools_schema,
    }
    return {
        "trace_id": trace_id,
        "span_id": span_id,
        "parent_span_id": parent_id,
        "start_time": str(start_time) if start_time is not None else None,
        "end_time": str(end_time) if end_time is not None else None,
        "status_code": status_code or "OK",
        "attributes": {k: v for k, v in attrs.items() if v is not None},
    }


def _tool_span_to_semconv(
    *,
    trace_id: str | None,
    span_id: str | None,
    parent_id: str | None,
    start_time: Any,
    end_time: Any,
    status_code: str | None,
    tool_name: str | None,
    arguments: Any,
    result: Any,
    tool_call_id: str | None = None,
) -> dict | None:
    if tool_name is None and arguments is None and result is None:
        return None
    attrs = {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": tool_name,
        "gen_ai.tool.call.id": tool_call_id,
        "gen_ai.tool.call.arguments": arguments,
        "gen_ai.tool.call.result": result,
    }
    return {
        "trace_id": trace_id,
        "span_id": span_id,
        "parent_span_id": parent_id,
        "start_time": str(start_time) if start_time is not None else None,
        "end_time": str(end_time) if end_time is not None else None,
        "status_code": status_code or "OK",
        "attributes": {k: v for k, v in attrs.items() if v is not None},
    }


def _convert_parquet(path: Path) -> tuple[list[dict], dict]:
    import pandas as pd  # lazy import

    df = pd.read_parquet(path)
    stats = {"total": len(df), "llm": 0, "tool": 0, "non_ok": 0, "skipped_kind": 0}
    out: list[dict] = []

    def _g(row, col):
        return row[col] if col in row and row[col] is not None else None

    for _, row in df.iterrows():
        # Preserve status_code — do NOT drop non-OK spans. Training-relevance
        # filtering (including "only train on successful decisions") is the
        # extractor's job, not the format adapter's.
        status = _g(row, "status_code")
        if status not in (None, "OK"):
            stats["non_ok"] += 1
        kind = _g(row, "span_kind") or _g(row, "attributes.openinference.span.kind")
        trace_id = _g(row, "context.trace_id")
        span_id = _g(row, "context.span_id")
        parent_id = _g(row, "parent_id")
        start = _g(row, "start_time")
        end = _g(row, "end_time")

        if kind == "LLM":
            sp = _llm_span_to_semconv(
                trace_id=trace_id,
                span_id=span_id,
                parent_id=parent_id,
                start_time=start,
                end_time=end,
                status_code=status,
                input_messages=_g(row, "attributes.llm.input_messages"),
                output_messages=_g(row, "attributes.llm.output_messages"),
                model_name=_g(row, "attributes.llm.model_name"),
                input_value_fallback=_g(row, "attributes.input.value"),
                output_value_fallback=_g(row, "attributes.output.value"),
                invocation_parameters=_g(row, "attributes.llm.invocation_parameters"),
            )
            if sp:
                out.append(sp)
                stats["llm"] += 1
        elif kind == "TOOL":
            args_raw = _g(row, "attributes.input.value")
            try:
                arguments = (
                    json.loads(args_raw)
                    if isinstance(args_raw, str) and args_raw.startswith("{")
                    else args_raw
                )
            except Exception:
                arguments = args_raw
            result_raw = _g(row, "attributes.output.value")
            try:
                result = (
                    json.loads(result_raw)
                    if isinstance(result_raw, str) and result_raw.startswith("{")
                    else result_raw
                )
            except Exception:
                result = result_raw
            sp = _tool_span_to_semconv(
                trace_id=trace_id,
                span_id=span_id,
                parent_id=parent_id,
                start_time=start,
                end_time=end,
                status_code=status,
                tool_name=_g(row, "attributes.tool.name"),
                arguments=arguments,
                result=result,
            )
            if sp:
                out.append(sp)
                stats["tool"] += 1
        else:
            stats["skipped_kind"] += 1
    return out, stats


def _convert_jsonl(path: Path) -> tuple[list[dict], dict]:
    stats = {"total": 0, "llm": 0, "tool": 0, "non_ok": 0, "skipped_kind": 0}
    out: list[dict] = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        stats["total"] += 1
        span = json.loads(line)
        status = span.get("status_code")
        if status not in (None, "OK"):
            stats["non_ok"] += 1
        attrs = span.get("attributes", {}) or {}
        kind = (
            attrs.get("openinference", {}).get("span", {}).get("kind")
            or span.get("span_kind")
        )
        ctx = span.get("context") or {}
        trace_id = ctx.get("trace_id")
        span_id = ctx.get("span_id")
        parent_id = span.get("parent_id")
        start = span.get("start_time")
        end = span.get("end_time")
        llm = attrs.get("llm", {}) or {}

        if kind == "LLM":
            sp = _llm_span_to_semconv(
                trace_id=trace_id,
                span_id=span_id,
                parent_id=parent_id,
                start_time=start,
                end_time=end,
                status_code=status,
                input_messages=[
                    e["message"] for e in (llm.get("input_messages") or []) if isinstance(e, dict)
                ],
                output_messages=[
                    e["message"] for e in (llm.get("output_messages") or []) if isinstance(e, dict)
                ],
                model_name=llm.get("model_name"),
                input_value_fallback=(attrs.get("input") or {}).get("value"),
                output_value_fallback=(attrs.get("output") or {}).get("value"),
                invocation_parameters=llm.get("invocation_parameters"),
            )
            if sp:
                out.append(sp)
                stats["llm"] += 1
        elif kind == "TOOL":
            tool = attrs.get("tool", {}) or {}
            sp = _tool_span_to_semconv(
                trace_id=trace_id,
                span_id=span_id,
                parent_id=parent_id,
                start_time=start,
                end_time=end,
                status_code=status,
                tool_name=tool.get("name"),
                arguments=(attrs.get("input") or {}).get("value"),
                result=(attrs.get("output") or {}).get("value"),
            )
            if sp:
                out.append(sp)
                stats["tool"] += 1
        else:
            stats["skipped_kind"] += 1
    return out, stats


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path, help="OpenInference .parquet or .jsonl")
    p.add_argument("-o", "--output", type=Path, required=True, help="Semconv JSON output")
    args = p.parse_args()

    if not args.input.exists():
        print(f"error: not found: {args.input}", file=sys.stderr)
        return 2

    if args.input.suffix.lower() == ".parquet":
        spans, stats = _convert_parquet(args.input)
    else:
        spans, stats = _convert_jsonl(args.input)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(spans, indent=2, ensure_ascii=False, default=str))
    print(
        f"converted {len(spans)} spans → {args.output} "
        f"(LLM={stats['llm']}, TOOL={stats['tool']}, "
        f"non_ok={stats.get('non_ok', 0)} skipped_kind={stats.get('skipped_kind', 0)}, "
        f"total seen={stats['total']})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
