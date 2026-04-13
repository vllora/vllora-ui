"""
Unit tests for otel_distill.py.

Uses hand-crafted semconv span fixtures to exercise all four v1 patterns
(A single-shot, B error recovery, C sequential ReAct, D parallel tool
calls) plus the skip cases (response writer, refusal, failed attempts,
missing tool execution).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import pytest  # noqa: E402
from otel_distill import (  # noqa: E402
    all_tool_calls_succeeded,
    build_tool_execution_index,
    extract_records,
    extract_records_from_trace,
    extract_tool_calls_from_output,
    extract_tool_schema_from_spans,
    is_execute_tool_span,
    is_llm_chat_span,
    semconv_msg_to_openai,
    span_status_ok,
)


# ─── Span fixture builders ──────────────────────────────────────────────────


def _msg(role, text=None, tool_calls=None, tool_result=None, tool_call_id=None):
    parts = []
    if text is not None:
        parts.append({"type": "text", "content": text})
    if tool_calls:
        for tc in tool_calls:
            parts.append(
                {
                    "type": "tool_call",
                    "id": tc["id"],
                    "name": tc["name"],
                    "arguments": tc.get("arguments", {}),
                }
            )
    if tool_result is not None:
        parts.append(
            {"type": "tool_result", "id": tool_call_id, "result": tool_result}
        )
    return {"role": role, "parts": parts}


def _llm_span(
    span_id,
    trace_id="trace_1",
    parent_id=None,
    start_time="2025-01-01T00:00:00Z",
    status_code="OK",
    inputs=None,
    outputs=None,
):
    return {
        "trace_id": trace_id,
        "span_id": span_id,
        "parent_span_id": parent_id,
        "start_time": start_time,
        "end_time": start_time,
        "status_code": status_code,
        "attributes": {
            "gen_ai.operation.name": "chat",
            "gen_ai.request.model": "gpt-4o",
            "gen_ai.input.messages": inputs or [],
            "gen_ai.output.messages": outputs or [],
        },
    }


def _tool_exec_span(
    tool_call_id,
    tool_name,
    trace_id="trace_1",
    start_time="2025-01-01T00:00:01Z",
    status_code="OK",
    result=None,
):
    return {
        "trace_id": trace_id,
        "span_id": f"tool_{tool_call_id}",
        "parent_span_id": None,
        "start_time": start_time,
        "end_time": start_time,
        "status_code": status_code,
        "attributes": {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": tool_name,
            "gen_ai.tool.call.id": tool_call_id,
            "gen_ai.tool.call.result": result,
        },
    }


# ─── Classification primitives ──────────────────────────────────────────────


def test_is_llm_chat_span():
    assert is_llm_chat_span(_llm_span("s1"))
    assert not is_llm_chat_span(_tool_exec_span("tc_1", "search"))


def test_is_execute_tool_span():
    assert is_execute_tool_span(_tool_exec_span("tc_1", "search"))
    assert not is_execute_tool_span(_llm_span("s1"))


def test_span_status_ok_defaults_to_ok_when_missing():
    assert span_status_ok({"attributes": {}})  # no status_code key
    assert span_status_ok({"status_code": "OK"})
    assert span_status_ok({"status_code": None})


def test_span_status_ok_rejects_error():
    assert not span_status_ok({"status_code": "ERROR"})
    assert not span_status_ok({"status_code": "STATUS_CODE_ERROR"})


# ─── Tool call extraction ───────────────────────────────────────────────────


def test_extract_tool_calls_empty():
    assert extract_tool_calls_from_output(None) == []
    assert extract_tool_calls_from_output([]) == []


def test_extract_tool_calls_single():
    output = [
        _msg(
            "assistant",
            tool_calls=[{"id": "c1", "name": "product_search", "arguments": {"q": "tablet"}}],
        )
    ]
    result = extract_tool_calls_from_output(output)
    assert len(result) == 1
    assert result[0]["id"] == "c1"
    assert result[0]["name"] == "product_search"
    assert result[0]["arguments"] == {"q": "tablet"}


def test_extract_tool_calls_parallel():
    output = [
        _msg(
            "assistant",
            tool_calls=[
                {"id": "c1", "name": "product_search", "arguments": {"q": "tablet"}},
                {"id": "c2", "name": "product_search", "arguments": {"q": "phone"}},
            ],
        )
    ]
    result = extract_tool_calls_from_output(output)
    assert len(result) == 2
    assert {r["arguments"]["q"] for r in result} == {"tablet", "phone"}


def test_extract_tool_calls_ignores_text_only():
    # Response-writer output: text, no tool_call parts
    output = [_msg("assistant", text="I found a tablet for you.")]
    assert extract_tool_calls_from_output(output) == []


# ─── Success checking via tool_call_id linkage ─────────────────────────────


def test_all_tool_calls_succeeded_happy_path():
    tool_calls = [{"id": "c1", "name": "search", "arguments": {}}]
    exec_index = {"c1": _tool_exec_span("c1", "search", status_code="OK")}
    assert all_tool_calls_succeeded(tool_calls, exec_index)


def test_all_tool_calls_succeeded_fails_on_missing_id():
    tool_calls = [{"id": "", "name": "search", "arguments": {}}]
    assert not all_tool_calls_succeeded(tool_calls, {})


def test_all_tool_calls_succeeded_fails_on_missing_exec_span():
    tool_calls = [{"id": "c1", "name": "search", "arguments": {}}]
    assert not all_tool_calls_succeeded(tool_calls, {})


def test_all_tool_calls_succeeded_fails_on_error_status():
    tool_calls = [{"id": "c1", "name": "search", "arguments": {}}]
    exec_index = {"c1": _tool_exec_span("c1", "search", status_code="ERROR")}
    assert not all_tool_calls_succeeded(tool_calls, exec_index)


def test_all_tool_calls_succeeded_requires_all_succeed():
    tool_calls = [
        {"id": "c1", "name": "search", "arguments": {}},
        {"id": "c2", "name": "search", "arguments": {}},
    ]
    exec_index = {
        "c1": _tool_exec_span("c1", "search", status_code="OK"),
        "c2": _tool_exec_span("c2", "search", status_code="ERROR"),
    }
    assert not all_tool_calls_succeeded(tool_calls, exec_index)


# ─── Semconv → OpenAI format conversion ────────────────────────────────────


def test_semconv_msg_system_to_openai():
    msg = _msg("system", text="You are a helpful assistant.")
    assert semconv_msg_to_openai(msg) == {
        "role": "system",
        "content": "You are a helpful assistant.",
    }


def test_semconv_msg_user_to_openai():
    msg = _msg("user", text="Find me a tablet")
    assert semconv_msg_to_openai(msg) == {
        "role": "user",
        "content": "Find me a tablet",
    }


def test_semconv_msg_assistant_text_only():
    msg = _msg("assistant", text="I found a tablet for you.")
    result = semconv_msg_to_openai(msg)
    assert result["role"] == "assistant"
    assert result["content"] == "I found a tablet for you."
    assert "tool_calls" not in result


def test_semconv_msg_assistant_with_tool_call():
    msg = _msg(
        "assistant",
        tool_calls=[{"id": "c1", "name": "product_search", "arguments": {"q": "tablet"}}],
    )
    result = semconv_msg_to_openai(msg)
    assert result["role"] == "assistant"
    assert result["content"] is None
    assert len(result["tool_calls"]) == 1
    assert result["tool_calls"][0]["id"] == "c1"
    assert result["tool_calls"][0]["type"] == "function"
    assert result["tool_calls"][0]["function"]["name"] == "product_search"
    # Arguments must be a JSON string per OpenAI format
    assert json.loads(result["tool_calls"][0]["function"]["arguments"]) == {"q": "tablet"}


def test_semconv_msg_tool_result_to_openai():
    msg = _msg("tool", tool_result={"results": [1, 2, 3]}, tool_call_id="c1")
    result = semconv_msg_to_openai(msg)
    assert result["role"] == "tool"
    assert result["tool_call_id"] == "c1"
    assert json.loads(result["content"]) == {"results": [1, 2, 3]}


# ─── Pattern A: Single-shot ────────────────────────────────────────────────


def test_pattern_a_single_shot_emits_one_record():
    """User asks → agent calls one tool → tool succeeds → 1 record."""
    spans = [
        _llm_span(
            "llm1",
            inputs=[
                _msg("system", text="You are a shopping assistant."),
                _msg("user", text="Find me a tablet"),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {
                            "id": "c1",
                            "name": "product_search",
                            "arguments": {"q": "tablet"},
                        }
                    ],
                )
            ],
        ),
        _tool_exec_span("c1", "product_search", result={"found": True}),
    ]

    records = extract_records(spans, tool_schema=[])
    assert len(records) == 1
    record = records[0]
    # GRPO format: messages = prompt only (no assistant turn)
    assert len(record["messages"]) == 2  # system, user
    assert record["messages"][0]["role"] == "system"
    assert record["messages"][1]["role"] == "user"
    assert record["messages"][-1]["role"] != "assistant"
    # Ground truth holds the demonstrated tool call
    assert "ground_truth" in record
    gt = json.loads(record["ground_truth"])
    assert isinstance(gt, list) and len(gt) > 0
    assert gt[0]["function"]["name"] == "product_search"


# ─── Pattern B: Error recovery ─────────────────────────────────────────────


def test_pattern_b_error_recovery_skips_failed_attempt():
    """
    Failed LLM span → execute_tool ERROR → subsequent successful LLM span.
    Only the successful span becomes a record, and its input_messages
    already include the failed attempt + error (provider populates this).
    """
    spans = [
        # Failed first attempt
        _llm_span(
            "llm1",
            start_time="2025-01-01T00:00:00Z",
            inputs=[
                _msg("system", text="You are a shopping assistant."),
                _msg("user", text="Find me a tablet"),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {
                            "id": "c1",
                            "name": "product_details",  # wrong tool
                            "arguments": {"product_id": 1},
                        }
                    ],
                )
            ],
        ),
        # Execute tool failed
        _tool_exec_span(
            "c1",
            "product_details",
            start_time="2025-01-01T00:00:01Z",
            status_code="ERROR",
            result={"error": "Product 1 not found"},
        ),
        # Successful recovery — input_messages include the failed attempt
        _llm_span(
            "llm2",
            start_time="2025-01-01T00:00:02Z",
            inputs=[
                _msg("system", text="You are a shopping assistant."),
                _msg("user", text="Find me a tablet"),
                _msg(
                    "assistant",
                    tool_calls=[
                        {
                            "id": "c1",
                            "name": "product_details",
                            "arguments": {"product_id": 1},
                        }
                    ],
                ),
                _msg(
                    "tool",
                    tool_result={"error": "Product 1 not found"},
                    tool_call_id="c1",
                ),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {
                            "id": "c2",
                            "name": "product_search",  # corrected
                            "arguments": {"q": "tablet"},
                        }
                    ],
                )
            ],
        ),
        _tool_exec_span(
            "c2",
            "product_search",
            start_time="2025-01-01T00:00:03Z",
            result={"found": True},
        ),
    ]

    records = extract_records(spans, tool_schema=[])
    # Only the recovery span becomes a record (failed span is skipped).
    # The recovery record's context naturally includes the failed attempt,
    # which is the SCoRe correction signal.
    assert len(records) == 1
    record = records[0]
    # GRPO format: messages = prompt only (ends with tool error turn, not assistant)
    # system, user, assistant(failed), tool(error) = 4 messages
    assert len(record["messages"]) == 4
    assert record["messages"][-1]["role"] != "assistant"
    assert record["messages"][-1]["role"] == "tool"
    # The prior assistant message is the failed attempt (context)
    failed_assistant = record["messages"][-2]
    assert failed_assistant["role"] == "assistant"
    assert failed_assistant["tool_calls"][0]["function"]["name"] == "product_details"
    # Ground truth holds the corrected tool call
    assert "ground_truth" in record
    gt = json.loads(record["ground_truth"])
    assert isinstance(gt, list) and len(gt) > 0
    assert gt[0]["function"]["name"] == "product_search"


def test_pattern_b_error_recovery_no_tool_call_id():
    """
    Pattern B with producers that omit gen_ai.tool.call.id on execute_tool
    spans (Phoenix/OpenInference sources pre-semconv-adoption).

    Regression test for the deep-copy bug: previously name_fallback was
    deep-copied before each span's success check and the copy discarded on
    failure, so the original queue was never advanced. The recovery span
    would re-pop the same ERROR entry and also fail, silently dropping the
    record.

    After the fix (direct mutation), the failed-attempt span pops the ERROR
    exec entry from the shared queue. The recovery span then pops the OK
    exec entry and correctly becomes a training record.
    """

    def _exec_no_id(tool_name, start_time, status_code="OK", result=None):
        """execute_tool span with gen_ai.tool.call.id intentionally absent."""
        return {
            "trace_id": "trace_1",
            "span_id": f"exec_{tool_name}_{start_time}",
            "parent_span_id": None,
            "start_time": start_time,
            "end_time": start_time,
            "status_code": status_code,
            "attributes": {
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.tool.name": tool_name,
                "gen_ai.tool.call.result": result,
            },
        }

    spans = [
        # Failed first attempt — LLM calls "search", exec fails
        _llm_span(
            "llm1",
            start_time="2025-01-01T00:00:00Z",
            inputs=[
                _msg("system", text="You are a search assistant."),
                _msg("user", text="Find me a laptop"),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[{"id": "", "name": "search", "arguments": {"q": "laptop"}}],
                )
            ],
        ),
        _exec_no_id("search", "2025-01-01T00:00:01Z", status_code="ERROR", result={"error": "timeout"}),
        # Recovery span — LLM calls "search" again with refined query, exec succeeds
        _llm_span(
            "llm2",
            start_time="2025-01-01T00:00:02Z",
            inputs=[
                _msg("system", text="You are a search assistant."),
                _msg("user", text="Find me a laptop"),
                _msg("assistant", tool_calls=[{"id": "", "name": "search", "arguments": {"q": "laptop"}}]),
                _msg("tool", tool_result={"error": "timeout"}, tool_call_id=""),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[{"id": "", "name": "search", "arguments": {"q": "laptop computer"}}],
                )
            ],
        ),
        _exec_no_id("search", "2025-01-01T00:00:03Z", status_code="OK", result={"results": ["ThinkPad"]}),
    ]

    records = extract_records(spans, tool_schema=[])
    # Without the fix: 0 records (recovery span re-matched ERROR entry, also failed).
    # With the fix: 1 record from the recovery span only.
    assert len(records) == 1
    record = records[0]
    # messages = system, user, assistant(failed), tool(error) — 4 turns as context
    assert len(record["messages"]) == 4
    assert record["messages"][-1]["role"] == "tool"
    # Ground truth is the corrected search call
    gt = json.loads(record["ground_truth"])
    assert gt[0]["function"]["name"] == "search"
    assert gt[0]["function"]["arguments"]["q"] == "laptop computer"


# ─── Pattern C: Sequential ReAct ────────────────────────────────────────────


def test_pattern_c_sequential_react_emits_n_records():
    """
    Multi-step ReAct: 3 LLM decisions in one trace, each informed by prior
    tool results. Produces 3 records with growing context prefixes.
    """
    spans = [
        # Decision 1: initial search
        _llm_span(
            "llm1",
            start_time="2025-01-01T00:00:00Z",
            inputs=[
                _msg("system", text="You are a shopping assistant."),
                _msg("user", text="Compare the dishwasher and the toaster"),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c1", "name": "product_search", "arguments": {"q": "dishwasher"}}
                    ],
                )
            ],
        ),
        _tool_exec_span(
            "c1", "product_search", start_time="2025-01-01T00:00:01Z", result={"id": 8}
        ),
        # Decision 2: second search (context includes first result)
        _llm_span(
            "llm2",
            start_time="2025-01-01T00:00:02Z",
            inputs=[
                _msg("system", text="You are a shopping assistant."),
                _msg("user", text="Compare the dishwasher and the toaster"),
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c1", "name": "product_search", "arguments": {"q": "dishwasher"}}
                    ],
                ),
                _msg("tool", tool_result={"id": 8}, tool_call_id="c1"),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c2", "name": "product_search", "arguments": {"q": "toaster"}}
                    ],
                )
            ],
        ),
        _tool_exec_span(
            "c2", "product_search", start_time="2025-01-01T00:00:03Z", result={"id": 7}
        ),
        # Decision 3: comparison (context includes both prior results)
        _llm_span(
            "llm3",
            start_time="2025-01-01T00:00:04Z",
            inputs=[
                _msg("system", text="You are a shopping assistant."),
                _msg("user", text="Compare the dishwasher and the toaster"),
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c1", "name": "product_search", "arguments": {"q": "dishwasher"}}
                    ],
                ),
                _msg("tool", tool_result={"id": 8}, tool_call_id="c1"),
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c2", "name": "product_search", "arguments": {"q": "toaster"}}
                    ],
                ),
                _msg("tool", tool_result={"id": 7}, tool_call_id="c2"),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {
                            "id": "c3",
                            "name": "product_comparison",
                            "arguments": {"product_a": 8, "product_b": 7},
                        }
                    ],
                )
            ],
        ),
        _tool_exec_span(
            "c3", "product_comparison", start_time="2025-01-01T00:00:05Z", result={"ok": True}
        ),
    ]

    records = extract_records(spans, tool_schema=[])
    assert len(records) == 3

    # Record 1: GRPO format — messages = prompt only: system + user (2 items)
    assert len(records[0]["messages"]) == 2
    assert records[0]["messages"][-1]["role"] == "user"
    assert "ground_truth" in records[0]
    gt0 = json.loads(records[0]["ground_truth"])
    assert gt0[0]["function"]["name"] == "product_search"

    # Record 2: prompt ends with tool result: system + user + assistant + tool (4 items)
    assert len(records[1]["messages"]) == 4
    assert records[1]["messages"][-1]["role"] == "tool"
    assert "ground_truth" in records[1]
    gt1 = json.loads(records[1]["ground_truth"])
    assert gt1[0]["function"]["name"] == "product_search"

    # Record 3: prompt ends with second tool result: system + user + assistant + tool + assistant + tool (6 items)
    assert len(records[2]["messages"]) == 6
    assert records[2]["messages"][-1]["role"] == "tool"
    assert "ground_truth" in records[2]
    gt2 = json.loads(records[2]["ground_truth"])
    assert gt2[0]["function"]["name"] == "product_comparison"


# ─── Pattern D: Parallel tool calls ─────────────────────────────────────────


def test_pattern_d_parallel_calls_emits_one_record_with_set():
    """One LLM span emits K parallel tool calls → 1 record with K tool_calls."""
    spans = [
        _llm_span(
            "llm1",
            inputs=[
                _msg("system", text="You are a shopping assistant."),
                _msg("user", text="Compare the dishwasher and the toaster"),
            ],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c1", "name": "product_search", "arguments": {"q": "dishwasher"}},
                        {"id": "c2", "name": "product_search", "arguments": {"q": "toaster"}},
                    ],
                )
            ],
        ),
        _tool_exec_span("c1", "product_search", result={"id": 8}),
        _tool_exec_span("c2", "product_search", result={"id": 7}),
    ]

    records = extract_records(spans, tool_schema=[])
    assert len(records) == 1
    record = records[0]
    # GRPO format: messages end with user turn (no assistant), ground_truth holds parallel calls
    assert record["messages"][-1]["role"] != "assistant"
    assert "ground_truth" in record
    gt = json.loads(record["ground_truth"])
    assert len(gt) == 2
    names = [tc["function"]["name"] for tc in gt]
    queries = [json.loads(tc["function"]["arguments"])["q"] for tc in gt]
    assert names == ["product_search", "product_search"]
    assert set(queries) == {"dishwasher", "toaster"}


# ─── Skip cases (non-decision LLM spans) ───────────────────────────────────


def test_response_writer_is_skipped():
    """LLM span with text output but no tool_calls (response writer) → skipped."""
    spans = [
        _llm_span(
            "llm1",
            inputs=[
                _msg("user", text="Find me a tablet"),
                _msg("tool", tool_result={"found": True}, tool_call_id="c_prior"),
            ],
            outputs=[
                _msg("assistant", text="I found a tablet for you."),
            ],
        )
    ]
    assert extract_records(spans, tool_schema=[]) == []


def test_failed_tool_call_is_skipped():
    """LLM span whose tool call execution failed → skipped (no record)."""
    spans = [
        _llm_span(
            "llm1",
            inputs=[_msg("user", text="Find product 999")],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c1", "name": "product_details", "arguments": {"id": 999}}
                    ],
                )
            ],
        ),
        _tool_exec_span("c1", "product_details", status_code="ERROR", result={"error": "not found"}),
    ]
    assert extract_records(spans, tool_schema=[]) == []


def test_missing_execution_span_is_skipped():
    """LLM span emitted a tool call but no execute_tool span exists → skipped."""
    spans = [
        _llm_span(
            "llm1",
            inputs=[_msg("user", text="Find a tablet")],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c1", "name": "product_search", "arguments": {"q": "tablet"}}
                    ],
                )
            ],
        )
        # no execute_tool span for c1
    ]
    assert extract_records(spans, tool_schema=[]) == []


# ─── Cross-trace grouping ───────────────────────────────────────────────────


def test_spans_grouped_by_trace_id():
    """Multiple traces in one input file produce independent records."""
    spans = [
        # Trace 1: single-shot
        _llm_span(
            "llm_a",
            trace_id="trace_1",
            inputs=[_msg("user", text="Find a tablet")],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c_a", "name": "product_search", "arguments": {"q": "tablet"}}
                    ],
                )
            ],
        ),
        _tool_exec_span("c_a", "product_search", trace_id="trace_1"),
        # Trace 2: single-shot (different trace)
        _llm_span(
            "llm_b",
            trace_id="trace_2",
            inputs=[_msg("user", text="Track package K91")],
            outputs=[
                _msg(
                    "assistant",
                    tool_calls=[
                        {"id": "c_b", "name": "track_package", "arguments": {"id": "K91"}}
                    ],
                )
            ],
        ),
        _tool_exec_span("c_b", "track_package", trace_id="trace_2"),
    ]

    records = extract_records(spans, tool_schema=[])
    assert len(records) == 2
    # Each record is independent — no cross-trace context bleed
    # GRPO format: tool call is in ground_truth, not the last message
    names = sorted(
        json.loads(r["ground_truth"])[0]["function"]["name"] for r in records
    )
    assert names == ["product_search", "track_package"]


# ─── Tool schema extraction ─────────────────────────────────────────────────


def test_extract_tool_schema_from_gen_ai_request_tools():
    schema = [{"name": "product_search", "description": "Search products"}]
    spans = [
        {
            "trace_id": "t1",
            "span_id": "s1",
            "attributes": {
                "gen_ai.operation.name": "chat",
                "gen_ai.request.tools": schema,
                "gen_ai.input.messages": [],
                "gen_ai.output.messages": [],
            },
        }
    ]
    assert extract_tool_schema_from_spans(spans) == schema


def test_extract_tool_schema_from_openinference_params():
    schema = [{"name": "product_search"}]
    params = {"model": "gpt-4o", "tools": schema}
    spans = [
        {
            "trace_id": "t1",
            "span_id": "s1",
            "attributes": {
                "gen_ai.operation.name": "chat",
                "llm.invocation_parameters": json.dumps(params),
                "gen_ai.input.messages": [],
                "gen_ai.output.messages": [],
            },
        }
    ]
    assert extract_tool_schema_from_spans(spans) == schema


def test_extract_tool_schema_returns_empty_when_missing():
    spans = [
        {
            "trace_id": "t1",
            "span_id": "s1",
            "attributes": {
                "gen_ai.operation.name": "chat",
                "gen_ai.input.messages": [],
                "gen_ai.output.messages": [],
            },
        }
    ]
    assert extract_tool_schema_from_spans(spans) == []
