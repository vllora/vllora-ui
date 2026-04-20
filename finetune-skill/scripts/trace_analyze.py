# /// script
# requires-python = ">=3.10"
# ///
"""
trace_analyze.py — Analyze OTel GenAI traces to inform the PDF finetune pipeline.

Reads an OTel semconv JSON file and produces 4 artifacts that feed into
the PDF-based finetune pipeline:

  1. trace_priority.json  — per-topic frequency + failure rate + priority score
  2. trace_topics.json    — topics discovered in traces, coverage gaps vs PDF topics
  3. trace_prompts.json   — production system prompt (simplified) + seed user queries
  4. trace_grader_hints.json — failure dimensions + prompt rules + calibration pairs

This script is part of the unified finetune skill's auto-detection flow.
When the user provides both PDFs and traces, the skill runs this script
automatically before record generation.

Usage:
    python3 trace_analyze.py spans.json \\
        --output-dir finetune-project/ \\
        [--pdf-topics topics.json]    # optional: compare against PDF topics
        [--max-seed-queries 500]      # cap seed queries per topic
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── Span helpers (adapted from otel_distill.py) ─────────────────────────────


def _attrs(span: dict) -> dict:
    return span.get("attributes") or {}


def is_llm_chat_span(span: dict) -> bool:
    return _attrs(span).get("gen_ai.operation.name") == "chat"


def is_execute_tool_span(span: dict) -> bool:
    return _attrs(span).get("gen_ai.operation.name") == "execute_tool"


def span_status_ok(span: dict) -> bool:
    status = span.get("status_code")
    return status in (None, "OK")


def group_by_trace_id(spans: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for span in spans:
        tid = span.get("trace_id") or "__unknown__"
        groups.setdefault(str(tid), []).append(span)
    return groups


# ─── Message extraction ──────────────────────────────────────────────────────


def _text_of_parts(parts: list[dict]) -> str:
    return "\n".join(
        str(p.get("content", "")) for p in parts if p.get("type") == "text"
    ).strip()


def extract_system_prompt(trace_spans: list[dict]) -> str:
    """Extract the system prompt from the first chat span's input messages."""
    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        input_msgs = _attrs(span).get("gen_ai.input.messages") or []
        for msg in input_msgs:
            if not isinstance(msg, dict):
                continue
            if msg.get("role") == "system":
                parts = msg.get("parts") or []
                text = _text_of_parts(parts) if parts else ""
                if not text:
                    text = msg.get("content") or ""
                if text:
                    return text
    return ""


def extract_user_queries(trace_spans: list[dict]) -> list[str]:
    """Extract all user messages from a trace's chat spans."""
    queries: list[str] = []
    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        input_msgs = _attrs(span).get("gen_ai.input.messages") or []
        for msg in input_msgs:
            if not isinstance(msg, dict):
                continue
            if msg.get("role") != "user":
                continue
            parts = msg.get("parts") or []
            text = _text_of_parts(parts) if parts else ""
            if not text:
                text = msg.get("content") or ""
            if text and len(text) > 5:
                queries.append(text)
    return queries


def extract_tool_calls_from_span(span: dict) -> list[str]:
    """Extract tool names from a chat span's output messages."""
    output_msgs = _attrs(span).get("gen_ai.output.messages") or []
    tool_names: list[str] = []
    for msg in output_msgs:
        if not isinstance(msg, dict):
            continue
        for part in msg.get("parts") or []:
            if isinstance(part, dict) and part.get("type") == "tool_call":
                name = part.get("name") or ""
                if name:
                    tool_names.append(name)
    return tool_names


def extract_tool_schemas_from_traces(traces: dict[str, list[dict]]) -> list[dict]:
    """Extract tool function schemas from trace span attributes.

    Looks for tool definitions in:
    1. gen_ai.request.tools (OpenTelemetry GenAI semconv)
    2. llm.invocation_parameters (OpenInference — tools inside params)
    3. Tool call arguments (infer schema from observed args)

    Returns OpenAI-compatible tool schema list, or empty list if no tools found
    (text-only agent — no tool-calling).
    """
    seen_tools: dict[str, dict] = {}  # name → schema

    for spans in traces.values():
        for span in spans:
            if not is_llm_chat_span(span):
                continue
            attrs = _attrs(span)

            # Source 1: gen_ai.request.tools (semconv standard)
            request_tools = attrs.get("gen_ai.request.tools")
            if isinstance(request_tools, list):
                for tool in request_tools:
                    if not isinstance(tool, dict):
                        continue
                    func = tool.get("function", tool)
                    name = func.get("name", "")
                    if name and name not in seen_tools:
                        seen_tools[name] = {
                            "type": "function",
                            "function": {
                                "name": name,
                                **({"description": func["description"]} if func.get("description") else {}),
                                **({"parameters": func["parameters"]} if func.get("parameters") else {}),
                            },
                        }

            # Source 2: llm.invocation_parameters (OpenInference)
            inv_params = attrs.get("llm.invocation_parameters")
            if isinstance(inv_params, str):
                try:
                    inv_params = json.loads(inv_params)
                except (json.JSONDecodeError, TypeError):
                    inv_params = None
            if isinstance(inv_params, dict):
                for tool in inv_params.get("tools", []):
                    if not isinstance(tool, dict):
                        continue
                    func = tool.get("function", tool)
                    name = func.get("name", "")
                    if name and name not in seen_tools:
                        seen_tools[name] = {
                            "type": "function",
                            "function": {
                                "name": name,
                                **({"description": func["description"]} if func.get("description") else {}),
                                **({"parameters": func["parameters"]} if func.get("parameters") else {}),
                            },
                        }

            # Source 3: Infer from tool call arguments (fallback)
            output_msgs = attrs.get("gen_ai.output.messages") or []
            for msg in output_msgs:
                if not isinstance(msg, dict):
                    continue
                for part in msg.get("parts") or []:
                    if not isinstance(part, dict) or part.get("type") != "tool_call":
                        continue
                    name = part.get("name", "")
                    if not name or name in seen_tools:
                        continue
                    # Infer basic schema from observed arguments
                    args = part.get("arguments") or part.get("args")
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except (json.JSONDecodeError, TypeError):
                            args = {}
                    if isinstance(args, dict) and args:
                        properties = {}
                        for k, v in args.items():
                            if isinstance(v, str):
                                properties[k] = {"type": "string"}
                            elif isinstance(v, bool):
                                properties[k] = {"type": "boolean"}
                            elif isinstance(v, int):
                                properties[k] = {"type": "integer"}
                            elif isinstance(v, float):
                                properties[k] = {"type": "number"}
                            elif isinstance(v, list):
                                properties[k] = {"type": "array", "items": {"type": "string"}}
                            else:
                                properties[k] = {"type": "string"}
                        seen_tools[name] = {
                            "type": "function",
                            "function": {
                                "name": name,
                                "parameters": {
                                    "type": "object",
                                    "properties": properties,
                                },
                            },
                        }

        # Early exit once we have schemas (they're the same across all traces)
        if seen_tools:
            break

    return list(seen_tools.values())


def extract_decision_points(
    traces: dict[str, list[dict]],
    tool_schemas: list[dict],
    system_prompt: str = "",
    max_per_topic: int = 50,
) -> list[dict]:
    """Extract per-decision-point training records from OTel traces.

    Only extracts decision points for ACTION tools (cancel, modify, return,
    exchange, transfer). Skips lookup tools (get_*, find_*, list_*) and
    utility tools (calculate, think) — these are called in every conversation
    and would overwhelm the training data with non-skill decisions.

    Each decision point uses the span's input_msgs as context (which already
    contains the full conversation history) rather than building context
    incrementally. This avoids message duplication bugs.

    Returns empty list if no tool calls found (text-only agent).
    """
    if not tool_schemas:
        return []

    records: list[dict] = []
    record_idx = 0
    skipped_failed = 0
    span_tools_fallback_count = 0  # records that fell back to global tool_schemas
    dropped_orphan_tool = 0        # records dropped due to unrecoverable tool_call_id
    dropped_parse_failure = 0      # records dropped due to unparseable GT args
    dropped_errored_call = 0       # records dropped because the GT call returned an error

    # Index tool execution results per trace so we can skip decision points
    # whose ground-truth call errored in production (the agent later corrected
    # them). Training on errored calls teaches the model to reproduce failures.
    # Key: (trace_id, tool_name, canonical_args_json) -> result_str
    def _canon_args(args):
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                return args
        if isinstance(args, dict):
            return json.dumps(args, sort_keys=True, ensure_ascii=False)
        return str(args)

    tool_result_index: dict[tuple[str, str, str], str] = {}
    for trace_id, spans in traces.items():
        for span in spans:
            attrs = _attrs(span)
            tool_name = attrs.get("gen_ai.tool.name")
            if not tool_name:
                continue
            args = attrs.get("gen_ai.tool.call.arguments")
            result = attrs.get("gen_ai.tool.call.result", "")
            key = (trace_id, tool_name, _canon_args(args))
            tool_result_index[key] = str(result)

    def _call_errored(trace_id: str, tool_name: str, args) -> bool:
        result = tool_result_index.get((trace_id, tool_name, _canon_args(args)))
        if not result:
            return False  # no execution result found — conservative pass-through
        low = result.lower()
        return "error:" in low or "error :" in low

    for trace_id, spans in traces.items():
        # Only extract GT from SUCCESSFUL traces for ACTION/LOOKUP tools.
        # Failed traces contain wrong actions — using them as ground truth
        # teaches the model to fail.
        # Trace success comes from tau_bench.reward >= 0.5 when present, else
        # falls back to absence of ERROR status. Unknown outcome (reward missing
        # AND no ERROR) is treated as success (conservative pass-through).
        #
        # EXCEPTION: utility tools (`think`, `calculate`) co-occur with hard
        # conversations that fail for unrelated reasons. The utility call
        # itself didn't cause the failure, so its DP is still a valid learning
        # signal. The per-DP errored-GT filter below still catches bad utility
        # calls. Relaxation follows the Hard Examples (arXiv:2508.14094) result
        # that difficulty is prompt-specific, not trace-level.
        trace_failed = infer_trace_success(spans) is False
        for span in spans:
            if not is_llm_chat_span(span):
                continue
            attrs = _attrs(span)

            # Check output for tool calls (all types — action, lookup, utility)
            # We keep all tool types because the model needs to learn the full
            # reasoning chain (lookup → action). Subsampling happens after extraction
            # to rebalance away from lookup dominance.
            output_msgs = attrs.get("gen_ai.output.messages") or []
            action_call = None
            for msg in output_msgs:
                if not isinstance(msg, dict):
                    continue
                for part in msg.get("parts") or []:
                    if not isinstance(part, dict) or part.get("type") != "tool_call":
                        continue
                    name = part.get("name", "")
                    if not name:
                        continue
                    raw_args = part.get("arguments") or part.get("args")
                    args_parse_failed = False
                    args: dict | None = None
                    if isinstance(raw_args, str):
                        stripped = raw_args.strip()
                        if stripped:
                            try:
                                parsed = json.loads(stripped)
                                args = parsed if isinstance(parsed, dict) else {}
                            except (json.JSONDecodeError, TypeError):
                                args_parse_failed = True
                                args = None
                        else:
                            args = {}
                    elif isinstance(raw_args, dict):
                        args = raw_args
                    elif raw_args is None:
                        args = {}
                    else:
                        args = {}
                    # Filter records whose GT args were present but unparseable.
                    # An empty-args GT from a parse failure is not legitimate {} —
                    # it produces consistent 0-reward in GRPO (model can never match
                    # the real call). Better to drop than train on noise.
                    if args_parse_failed:
                        dropped_parse_failure += 1
                        continue
                    action_call = {"name": name, "arguments": args if isinstance(args, dict) else {}}
                    break
                if action_call:
                    break

            if not action_call:
                continue  # No action tool call in this span

            # Trace-level filter applies to action/lookup DPs only. Utility-tool
            # DPs (think/calculate) from failed traces are retained because the
            # utility call itself didn't cause the trace failure (see comment
            # at the trace loop).
            if trace_failed and _classify_tool(action_call["name"]) != "utility":
                skipped_failed += 1
                continue

            # Skip decision points whose GT call errored in the trace. The
            # agent later corrected these in follow-up calls; using the failed
            # attempt as GT would teach the model to reproduce failures.
            if _call_errored(trace_id, action_call["name"], action_call["arguments"]):
                dropped_errored_call += 1
                continue

            # Build context from this span's input_msgs (already contains full history)
            context: list[dict] = []
            if system_prompt:
                context.append({"role": "system", "content": system_prompt})

            # Build context from span's input_msgs.
            # CRITICAL: every tool message must have tool_call_id matching
            # an assistant tool_call's id. Cloud eval validates this.
            # Each tool_call_id must be UNIQUE within the conversation.
            input_msgs = attrs.get("gen_ai.input.messages") or []
            pending_tool_call_ids: list[str] = []  # IDs from most recent assistant tool_calls
            tc_counter = 0  # Unique counter per record for tool_call_id generation

            for msg in input_msgs:
                if not isinstance(msg, dict):
                    continue
                role = msg.get("role", "")
                if role not in ("user", "assistant", "tool", "system"):
                    continue
                if role == "system":
                    continue  # Already added system prompt above
                parts = msg.get("parts") or []
                text = _text_of_parts(parts) if parts else msg.get("content", "")
                entry: dict = {"role": role}
                if text:
                    entry["content"] = text

                # Assistant with tool_calls — generate IDs for matching.
                # An assistant turn can carry BOTH text AND tool_calls; we must
                # check `tc_parts` regardless of whether text is present, or the
                # tool response that follows becomes orphaned ("tool_call_id not
                # found in request" at eval time).
                if role == "assistant":
                    tc_parts = [p for p in parts if isinstance(p, dict) and p.get("type") == "tool_call"]
                    if tc_parts:
                        if not text:
                            entry["content"] = None
                        pending_tool_call_ids = []
                        tool_calls_list = []
                        for p in tc_parts:
                            # Generate unique ID per tool call within this record
                            tc_counter += 1
                            tc_id = p.get("tool_call_id") or f"call_{record_idx}_{tc_counter}"
                            pending_tool_call_ids.append(tc_id)
                            tool_calls_list.append({
                                "id": tc_id,
                                "type": "function",
                                "function": {
                                    "name": p.get("name", ""),
                                    "arguments": json.dumps(p.get("arguments", {})) if isinstance(p.get("arguments"), dict) else str(p.get("arguments", "")),
                                },
                            })
                        entry["tool_calls"] = tool_calls_list
                    elif not text:
                        continue  # Skip empty assistant messages

                # Tool result — must have matching tool_call_id
                if role == "tool":
                    tc_id = msg.get("tool_call_id")
                    if not tc_id and pending_tool_call_ids:
                        tc_id = pending_tool_call_ids.pop(0)
                    elif not tc_id:
                        tc_id = f"call_{record_idx}_auto"
                    entry["tool_call_id"] = tc_id

                context.append(entry)

            # Post-process: ensure every tool message's tool_call_id matches
            # a preceding assistant's tool_call id. Fix mismatches by scanning
            # backwards from each tool message to find its assistant.
            all_assistant_ids: set[str] = set()
            for m in context:
                if m.get("role") == "assistant" and m.get("tool_calls"):
                    for tc in m["tool_calls"]:
                        if tc.get("id"):
                            all_assistant_ids.add(tc["id"])

            # Reject records where any tool message has no preceding assistant tool_call
            # OR where two tool messages end up claiming the same tool_call_id. Cloud
            # eval rejects both ("tool_call_id not found in request").
            record_has_orphan_tool = False
            # Track already-claimed tool_call_ids so we don't assign the same id
            # to multiple tool messages (duplicates cause the same eval failure).
            claimed_ids: set[str] = set()
            for ci, m in enumerate(context):
                if m.get("role") != "tool":
                    continue
                tc_id = m.get("tool_call_id")
                if tc_id and tc_id in all_assistant_ids and tc_id not in claimed_ids:
                    claimed_ids.add(tc_id)
                    continue
                if tc_id and tc_id in claimed_ids:
                    # Duplicate — need to find an unused id from preceding assistant.
                    tc_id = None
                # Try to repair by finding preceding assistant with an unused tool_call id.
                patched_id: str | None = None
                for prev_i in range(ci - 1, -1, -1):
                    prev = context[prev_i]
                    if prev.get("role") == "assistant" and prev.get("tool_calls"):
                        for tc in prev["tool_calls"]:
                            cand = tc.get("id")
                            if cand and cand not in claimed_ids:
                                patched_id = cand
                                break
                        if patched_id:
                            break
                if patched_id:
                    m["tool_call_id"] = patched_id
                    claimed_ids.add(patched_id)
                else:
                    record_has_orphan_tool = True
                    break
            if record_has_orphan_tool:
                dropped_orphan_tool += 1
                continue  # Drop the whole record — unusable for chat template

            # Extract per-span tool set
            span_tools = None
            raw_tools = attrs.get("gen_ai.request.tools")
            if isinstance(raw_tools, list) and raw_tools:
                span_tools = [
                    {"type": "function", "function": t.get("function", t)}
                    for t in raw_tools if isinstance(t, dict)
                ]
            effective_tools = span_tools or tool_schemas
            if span_tools is None:
                span_tools_fallback_count += 1

            topic = tool_name_to_topic(action_call["name"])
            record_idx += 1

            records.append({
                "id": f"trace-{trace_id[:8]}-dp-{record_idx:04d}",
                "messages": context,
                "tools": effective_tools,
                "ground_truth": action_call,
                "topic": topic,
                "prompt_type": "trace_decision_point",
            })
    # Subsample to rebalance: lookup tools (get_*, find_*, list_*) dominate
    # (60%+) but action tools are the real training target. Cap lookup/utility
    # at 2x the action tool count to prevent signal dilution while keeping
    # the reasoning chain (ToolRL trains on all tools but with rebalancing).
    if records:
        import random as _dp_random
        from collections import Counter as _DPCounter
        _dp_random.seed(42)

        action_records = [r for r in records if _classify_tool(r["ground_truth"]["name"]) == "action"]
        other_records = [r for r in records if _classify_tool(r["ground_truth"]["name"]) != "action"]

        # Rebalance across ACTION topics — natural trace distribution is skewed
        # (e.g. exchange=160 vs payment=5 = 32:1). Cap each action topic at
        # max(5 × minority, minority_floor=15) to prevent the model from
        # defaulting to the majority class when uncertain.
        by_topic: dict[str, list[dict]] = {}
        for r in action_records:
            by_topic.setdefault(r["topic"], []).append(r)
        if by_topic:
            minority = min(len(v) for v in by_topic.values())
            cap_per_topic = max(minority * 5, 15)
            rebalanced: list[dict] = []
            caps_applied: list[tuple[str, int, int]] = []
            for topic, recs in by_topic.items():
                if len(recs) > cap_per_topic:
                    _dp_random.shuffle(recs)
                    caps_applied.append((topic, len(recs), cap_per_topic))
                    recs = recs[:cap_per_topic]
                rebalanced.extend(recs)
            if caps_applied:
                print(f"  Rebalanced action topics: cap={cap_per_topic} (5× minority={minority})")
                for topic, before, after in caps_applied:
                    print(f"    {topic}: {before} → {after}")
            action_records = rebalanced

        max_other = max(len(action_records) * 2, 200)  # At least 200 or 2x actions
        if len(other_records) > max_other:
            _dp_random.shuffle(other_records)
            other_records = other_records[:max_other]
            print(f"  Subsampled lookup/utility: {len(records) - len(action_records)} → {len(other_records)} "
                  f"(capped at 2x action count={len(action_records)})")

        records = action_records + other_records

    if skipped_failed:
        print(f"  Decision points: skipped {skipped_failed} failed trace(s) "
              f"(reward < 0.5). Their actions are unreliable as ground truth.")
    if dropped_parse_failure:
        print(f"  Decision points: dropped {dropped_parse_failure} record(s) "
              f"with unparseable GT arguments (would produce 0-reward noise).")
    if dropped_errored_call:
        print(f"  Decision points: dropped {dropped_errored_call} record(s) "
              f"whose GT call returned an error in the trace (training on "
              f"failed attempts teaches the model to reproduce them).")
    if dropped_orphan_tool:
        print(f"  Decision points: dropped {dropped_orphan_tool} record(s) "
              f"with orphan tool messages (chat template would reject).")
    if span_tools_fallback_count:
        total_emitted = len(records) if not records else record_idx
        pct = (span_tools_fallback_count / total_emitted * 100) if total_emitted else 0
        print(f"  Decision points: {span_tools_fallback_count}/{total_emitted} "
              f"records ({pct:.0f}%) fell back to global tool_schemas (no "
              f"gen_ai.request.tools). If >20%%, check OI adapter (see "
              f"feedback_oi_adapter_tool_schema.md).")

    return records


def extract_trace_ground_truth(trace_spans: list[dict]) -> dict | str | None:
    """Derive ground truth from a trace's first action tool call.

    Returns a model-neutral tool-call dict when the trace has tool calls:
      {"name": "cancel_pending_order", "arguments": {"order_id": "W123", ...}}

    This matches the format used by generate_records.py for synthetic records,
    so seed records and synthetic records have consistent GT format.

    Returns None if no action tool calls found (text-only trace).
    """
    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        output_msgs = _attrs(span).get("gen_ai.output.messages") or []
        for msg in output_msgs:
            if not isinstance(msg, dict):
                continue
            for part in msg.get("parts") or []:
                if not isinstance(part, dict) or part.get("type") != "tool_call":
                    continue
                name = part.get("name", "")
                if not name or _classify_tool(name) != "action":
                    continue
                # Found first action tool call — return as dict
                args = part.get("arguments") or part.get("args")
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except (json.JSONDecodeError, TypeError):
                        args = {}
                return {
                    "name": name,
                    "arguments": args if isinstance(args, dict) else {},
                }

    return None


# ─── Trace reward / success detection ────────────────────────────────────────


def get_trace_reward(trace_spans: list[dict]) -> float | None:
    """Extract reward signal from trace metadata (tau-bench format)."""
    for span in trace_spans:
        reward = _attrs(span).get("tau_bench.reward")
        if reward is not None:
            return float(reward)
    return None


def infer_trace_success(trace_spans: list[dict]) -> bool | None:
    """Infer success from span statuses if no explicit reward."""
    reward = get_trace_reward(trace_spans)
    if reward is not None:
        return reward >= 0.5

    # Fallback: check if any span has ERROR status
    has_error = any(
        span.get("status_code") == "ERROR" for span in trace_spans
    )
    return not has_error if trace_spans else None


# ─── Tool-based topic mapping ────────────────────────────────────────────────

# Maps tool names to topic categories. For the initial implementation,
# we use the tool name itself as the topic (deterministic, no embedding).
# Embedding-based mapping can be added later.


def tool_name_to_topic(tool_name: str) -> str:
    """Map a tool name to a topic string.

    Uses the tool name directly as the topic. Normalizes by replacing
    underscores with hyphens and lowercasing.
    """
    return tool_name.lower().replace("_", "-")


def _classify_tool(tool_name: str) -> str:
    """Classify a tool as 'action', 'lookup', or 'utility'."""
    lower = tool_name.lower()
    if any(lower.startswith(p) for p in ("get_", "find_", "list_", "search_")):
        return "lookup"
    if lower in ("think", "calculate"):
        return "utility"
    return "action"


def trace_primary_topic(trace_spans: list[dict]) -> str | None:
    """Determine the primary topic of a trace by its FIRST action tool.

    Uses the first action tool (not the last) because that reflects the
    agent's response to the user's opening request. The last tool often
    reflects conversation drift or follow-up requests, causing 45% of
    seed queries to be misassigned (MINT-CL, arXiv:2411.14252).

    Falls back to the most-called tool if no action tool found.
    """
    action_tools: list[str] = []
    fallback_tool: str | None = None

    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        tools = extract_tool_calls_from_span(span)
        for t in tools:
            if fallback_tool is None:
                fallback_tool = t
            if _classify_tool(t) == "action":
                action_tools.append(t)

    if action_tools:
        return tool_name_to_topic(action_tools[0])
    if fallback_tool:
        return tool_name_to_topic(fallback_tool)
    return None


def trace_all_topics(trace_spans: list[dict]) -> list[str]:
    """Extract ALL distinct action topics from a trace.

    For multi-intent traces (user asks about return AND cancellation),
    returns all action topics in order. Used to split multi-intent
    traces into separate training examples.
    """
    seen: set[str] = set()
    topics: list[str] = []
    for span in trace_spans:
        if not is_llm_chat_span(span):
            continue
        for t in extract_tool_calls_from_span(span):
            if _classify_tool(t) == "action":
                topic = tool_name_to_topic(t)
                if topic not in seen:
                    seen.add(topic)
                    topics.append(topic)
    return topics


# ─── System prompt rule extraction ───────────────────────────────────────────


def extract_prompt_rules(system_prompt: str) -> list[dict]:
    """Extract explicit rules from a system prompt.

    Looks for sentences containing imperative language (must, should, only,
    never, always, cannot, etc.) — these are the constraints that should
    become grader criteria.
    """
    if not system_prompt:
        return []

    rule_indicators = [
        "must", "should", "only", "never", "always", "cannot", "can only",
        "has to", "have to", "required", "not allowed", "do not",
    ]

    rules: list[dict] = []
    # Split by sentence (rough — handles bullet points too)
    sentences = re.split(r'[.\n]', system_prompt)
    for sentence in sentences:
        sentence = sentence.strip().strip("-").strip()
        if len(sentence) < 10:
            continue
        lower = sentence.lower()
        for indicator in rule_indicators:
            if indicator in lower:
                rules.append({
                    "rule": sentence,
                    "source": "prompt_rule",
                    "indicator": indicator,
                })
                break

    return rules


def simplify_system_prompt(system_prompt: str) -> str:
    """Distill a production system prompt to minimal framing for a small model.

    Keeps: role declaration, output format, key constraints.
    Removes: detailed procedures (learned from training examples), examples,
    verbose explanations.

    Research: "vibe-tuning" (Distil Labs 2025) shows small models learn
    behavior from training examples, not long prompts.
    """
    if not system_prompt:
        return ""

    lines = system_prompt.split("\n")
    kept: list[str] = []

    # Keep the first paragraph (role declaration)
    in_first_para = True
    for line in lines:
        stripped = line.strip()
        if in_first_para:
            if not stripped:
                in_first_para = False
                kept.append("")
            else:
                kept.append(stripped)
            continue

        # Keep lines with key constraints (short imperative rules)
        lower = stripped.lower()
        is_constraint = any(
            kw in lower
            for kw in ("must", "should not", "only", "never", "always", "cannot")
        )
        if is_constraint and len(stripped) < 200:
            kept.append(stripped)

    result = "\n".join(kept).strip()
    # Cap at ~500 chars
    if len(result) > 500:
        result = result[:497] + "..."
    return result


# ─── Artifact 1: trace_priority.json ─────────────────────────────────────────


def build_trace_priority(
    traces: dict[str, list[dict]],
) -> dict[str, dict]:
    """Compute per-topic priority scores from traces.

    Priority = frequency × failure_rate.
    Higher = the topic appears often AND the model fails on it.
    """
    topic_trace_counts: Counter = Counter()
    topic_success: Counter = Counter()
    topic_failure: Counter = Counter()
    total_traces = len(traces)

    for trace_id, spans in traces.items():
        topic = trace_primary_topic(spans)
        if not topic:
            continue

        topic_trace_counts[topic] += 1
        success = infer_trace_success(spans)
        if success is True:
            topic_success[topic] += 1
        elif success is False:
            topic_failure[topic] += 1

    priority: dict[str, dict] = {}
    for topic in topic_trace_counts:
        count = topic_trace_counts[topic]
        successes = topic_success.get(topic, 0)
        failures = topic_failure.get(topic, 0)
        total = successes + failures
        frequency = count / total_traces if total_traces > 0 else 0
        failure_rate = failures / total if total > 0 else 0
        priority_score = frequency * failure_rate

        priority[topic] = {
            "frequency": round(frequency, 4),
            "trace_count": count,
            "success_count": successes,
            "failure_count": failures,
            "failure_rate": round(failure_rate, 4),
            "priority_score": round(priority_score, 4),
        }

    return priority


# ─── Artifact 2: trace_topics.json ───────────────────────────────────────────


def build_trace_topics(
    priority: dict[str, dict],
    pdf_topics: list[str] | None = None,
) -> dict:
    """Identify topics from traces and flag coverage gaps vs PDF topics."""
    discovered = sorted(priority.keys())

    coverage_gaps: list[dict] = []
    if pdf_topics is not None:
        pdf_set = {t.lower().replace("_", "-") for t in pdf_topics}
        for topic in discovered:
            if topic not in pdf_set:
                info = priority[topic]
                coverage_gaps.append({
                    "topic": topic,
                    "trace_count": info["trace_count"],
                    "frequency": info["frequency"],
                    "suggested_action": "Review: topic appears in traces but not in PDF knowledge source",
                })

    return {
        "discovered_topics": discovered,
        "topic_count": len(discovered),
        "coverage_gaps": coverage_gaps,
        "coverage_gap_count": len(coverage_gaps),
    }


# ─── Artifact 3: trace_prompts.json ──────────────────────────────────────────


def _similarity(a: str, b: str) -> float:
    """Simple trigram similarity (0.0–1.0) for near-duplicate detection.

    Good enough for ~300 queries. No external dependencies needed.
    At production scale (>10K), use MinHash or embedding-based dedup.
    """
    def trigrams(s: str) -> set[str]:
        s = s.lower().strip()
        return {s[i:i+3] for i in range(max(0, len(s) - 2))}
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _deduplicate_queries(queries: list[str], threshold: float = 0.85) -> list[str]:
    """Remove near-duplicate queries using trigram similarity.

    Keeps the longest query from each cluster (more complete phrasing).
    Based on SemDeDup (arXiv:2303.09540): dedup at 0.85-0.90 threshold
    improves per-token learning efficiency.
    """
    if len(queries) <= 1:
        return queries

    # Sort by length descending — prefer longer (more complete) queries
    sorted_queries = sorted(queries, key=len, reverse=True)
    kept: list[str] = []
    for q in sorted_queries:
        is_dupe = any(_similarity(q, k) > threshold for k in kept)
        if not is_dupe:
            kept.append(q)
    return kept


def build_trace_prompts(
    traces: dict[str, list[dict]],
    priority: dict[str, dict],
    max_seed_queries: int = 500,
) -> dict:
    """Extract production system prompt and seed user queries from traces.

    Quality pipeline (research-backed):
    1. Extract first user message per trace as the seed query
    2. Assign to topic based on FIRST ACTION TOOL (not last) — the first
       action reflects the agent's response to the user's opening request.
       Last-action assignment causes 45% misalignment (MINT-CL, arXiv:2411.14252).
    3. Surface-intent validation: filter seeds where the user's stated intent
       clearly doesn't match the assigned topic (prevents cross-topic pollution)
    4. Deduplicate at 0.85 trigram similarity (SemDeDup, arXiv:2303.09540)
    5. Extract GT from trace agent response for reward signal
       ("No Prompt Left Behind", arXiv:2509.21880 — zero-GT wastes compute)
    """
    # Extract system prompt from the first trace
    system_prompt = ""
    for spans in traces.values():
        system_prompt = extract_system_prompt(spans)
        if system_prompt:
            break

    # Topic-keyword mapping for surface-intent validation.
    # Seeds where user intent clearly contradicts assigned topic are filtered.
    topic_intent_keywords: dict[str, list[str]] = {
        "cancel-pending-order": ["cancel", "cancellation", "don't want"],
        "return-delivered-order-items": ["return", "refund", "send back"],
        "exchange-delivered-order-items": ["exchange", "swap size", "different size", "different color"],
        "modify-pending-order-items": ["change item", "modify item", "swap item", "replace item"],
        "modify-pending-order-address": ["address", "shipping address", "delivery address"],
        "modify-pending-order-payment": ["payment", "credit card", "gift card", "pay with"],
        "modify-user-address": ["default address", "home address", "update address"],
        "find-user-id-by-email": ["email"],
        "find-user-id-by-name-zip": ["name", "zip"],
        "get-order-details": ["order status", "where is my order", "track"],
        "get-product-details": ["product", "price", "specification", "feature"],
        "transfer-to-human-agents": ["human", "agent", "supervisor", "escalat", "transfer", "speak to"],
    }

    def _intent_matches_topic(query: str, topic: str) -> bool:
        """Check if user query's surface intent is compatible with topic.

        Returns True if: (a) we have no keywords for this topic (unknown topic),
        (b) the query mentions keywords for this topic, or (c) the query is
        generic ("help", "hi") with no specific intent signal.
        """
        keywords = topic_intent_keywords.get(topic)
        if not keywords:
            return True  # Unknown topic — don't filter
        q = query.lower()
        # Check if query matches THIS topic's keywords
        if any(kw in q for kw in keywords):
            return True
        # Check if query matches ANY other topic's keywords
        matches_other = False
        for other_topic, other_kws in topic_intent_keywords.items():
            if other_topic != topic and any(kw in q for kw in other_kws):
                matches_other = True
                break
        # If query matches another topic clearly, it's misassigned
        if matches_other:
            return False
        # Generic query (no specific intent detected) — keep it
        return True

    def detect_surface_intent(query: str) -> list[str]:
        """Detect user's stated intent from query text."""
        q = query.lower()
        intents: list[str] = []
        for intent, keywords in topic_intent_keywords.items():
            if any(kw in q for kw in keywords):
                intents.append(intent)
        return intents or ["general"]

    # Collect user queries grouped by topic (first-action-based assignment)
    topic_queries: dict[str, list[dict]] = defaultdict(list)
    intent_filtered = 0
    for trace_id, spans in traces.items():
        topic = trace_primary_topic(spans)
        if not topic:
            continue
        queries = extract_user_queries(spans)
        if not queries:
            continue
        query = queries[0]  # First user message

        # Surface-intent validation: filter seeds that clearly don't match
        if not _intent_matches_topic(query, topic):
            intent_filtered += 1
            continue

        # NOTE: Do NOT attach tool-call GT to first-message seeds.
        # The user's first message typically lacks the arguments needed for the
        # tool call (order_id, email, etc. come from later turns). Attaching
        # the trace's tool call as GT creates unverifiable reward — the model
        # can't predict args it hasn't seen (ToolRL, arXiv:2504.18176).
        # Tool-calling GT comes from decision-points.jsonl instead.
        # Seeds serve as prompt diversity only.

        surface_intents = detect_surface_intent(query)
        is_multi_intent = len(surface_intents) > 1
        topic_queries[topic].append({
            "query": query,
            "surface_intents": surface_intents,
            "is_multi_intent": is_multi_intent,
        })

    if intent_filtered:
        print(f"  Filtered {intent_filtered} seeds where surface intent contradicts assigned topic")

    # Deduplicate and cap per topic
    seed_queries: dict[str, list[str]] = {}
    seed_metadata: dict[str, list[dict]] = {}
    total_seeds = 0
    dedup_removed = 0

    for topic in sorted(topic_queries.keys()):
        raw_queries = [q["query"] for q in topic_queries[topic]]
        metadata = {q["query"]: q for q in topic_queries[topic]}

        # Step 1: Exact dedup (preserve order)
        unique = list(dict.fromkeys(raw_queries))

        # Step 2: Near-duplicate removal (trigram similarity >= 0.85)
        before_dedup = len(unique)
        deduped = _deduplicate_queries(unique, threshold=0.85)
        dedup_removed += before_dedup - len(deduped)

        # Step 3: Cap per topic
        per_topic_cap = max(10, max_seed_queries // max(len(topic_queries), 1))
        final = deduped[:per_topic_cap]

        seed_queries[topic] = final
        seed_metadata[topic] = [metadata.get(q, {}) for q in final]
        total_seeds += len(final)

    return {
        "system_prompt": system_prompt,
        "simplified_prompt": simplify_system_prompt(system_prompt),
        "seed_queries": seed_queries,
        "seed_metadata": seed_metadata,
        "total_seed_queries": total_seeds,
        "near_duplicates_removed": dedup_removed,
        "intent_filtered": intent_filtered,
        "topics_with_seeds": len(seed_queries),
    }


# ─── Artifact 4: trace_grader_hints.json ─────────────────────────────────────


def _infer_failure_dimensions(
    traces: dict[str, list[dict]],
    priority: dict[str, dict],
) -> list[dict]:
    """Infer grader dimensions from failure patterns in traces.

    Analyzes failed traces to identify common failure modes:
    - Tool called without prior authentication
    - Wrong tool selected (action tool doesn't match task intent)
    - Missing tool parameters
    """
    dimensions: list[dict] = []
    total_traces = len(traces)
    failed_traces = [
        (tid, spans) for tid, spans in traces.items()
        if infer_trace_success(spans) is False
    ]
    if not failed_traces:
        return dimensions

    # Dimension: authentication before action
    # Check if failed traces skipped auth tools before calling action tools
    auth_skip_count = 0
    auth_tools = {"find-user-id-by-email", "find-user-id-by-name-zip"}
    for tid, spans in failed_traces:
        tools_in_order: list[str] = []
        for span in spans:
            if is_llm_chat_span(span):
                tools_in_order.extend(
                    tool_name_to_topic(t) for t in extract_tool_calls_from_span(span)
                )

        has_auth = any(t in auth_tools for t in tools_in_order)
        has_action = any(
            t not in auth_tools and not t.startswith("get-") and t not in ("think", "calculate")
            for t in tools_in_order
        )
        if has_action and not has_auth:
            auth_skip_count += 1

    if auth_skip_count > 0:
        dimensions.append({
            "name": "authentication_before_action",
            "description": "Model must authenticate user (find user ID) before any state-changing tool call",
            "failure_count": auth_skip_count,
            "failure_rate": round(auth_skip_count / len(failed_traces), 3),
            "source": "trace_failure",
        })

    # Dimension: per-topic failure rates (topics with >30% failure)
    for topic, info in sorted(priority.items(), key=lambda x: -x[1]["failure_rate"]):
        if info["failure_rate"] < 0.3:
            continue
        if info["trace_count"] < 3:
            continue
        dimensions.append({
            "name": f"topic_{topic}_accuracy",
            "description": f"Model accuracy on '{topic}' tasks ({info['failure_rate']:.0%} failure rate in traces)",
            "failure_count": info["failure_count"],
            "failure_rate": info["failure_rate"],
            "source": "trace_failure",
        })

    return dimensions


def _select_calibration_pairs(
    traces: dict[str, list[dict]],
    max_pairs: int = 30,
) -> list[dict]:
    """Select success/failure trace pairs for grader calibration.

    Prefers pairs from the same task_id (different trial outcomes).
    Falls back to random sampling if task_id metadata isn't available.
    """
    # Group by task_id if available (tau-bench format)
    by_task: dict[int, dict[str, list[str]]] = defaultdict(lambda: {"success": [], "failure": []})

    for trace_id, spans in traces.items():
        task_id = None
        for span in spans:
            task_id = _attrs(span).get("tau_bench.task_id")
            if task_id is not None:
                break

        success = infer_trace_success(spans)
        if task_id is not None:
            bucket = "success" if success else "failure"
            by_task[int(task_id)][bucket].append(trace_id)

    pairs: list[dict] = []

    # Paired: same task, different outcome
    for task_id, buckets in by_task.items():
        if buckets["success"] and buckets["failure"]:
            pairs.append({
                "task_id": task_id,
                "success_trace_id": buckets["success"][0],
                "failure_trace_id": buckets["failure"][0],
                "expected_score_range_success": [0.7, 1.0],
                "expected_score_range_failure": [0.0, 0.4],
            })
            if len(pairs) >= max_pairs:
                break

    # If no task_id metadata, sample individual traces
    if not pairs:
        successes = [
            tid for tid, spans in traces.items()
            if infer_trace_success(spans) is True
        ][:max_pairs]
        failures = [
            tid for tid, spans in traces.items()
            if infer_trace_success(spans) is False
        ][:max_pairs]
        for tid in successes:
            pairs.append({
                "trace_id": tid,
                "outcome": "success",
                "expected_score_range": [0.7, 1.0],
            })
        for tid in failures:
            pairs.append({
                "trace_id": tid,
                "outcome": "failure",
                "expected_score_range": [0.0, 0.4],
            })

    return pairs[:max_pairs]


def build_trace_grader_hints(
    traces: dict[str, list[dict]],
    priority: dict[str, dict],
    system_prompt: str,
) -> dict:
    """Build grader hints from trace failure patterns and prompt rules."""
    # Failure dimensions from traces
    failure_dimensions = _infer_failure_dimensions(traces, priority)

    # Rules from production system prompt
    prompt_rules = extract_prompt_rules(system_prompt)
    for rule in prompt_rules:
        failure_dimensions.append({
            "name": f"rule_{rule['indicator']}",
            "description": rule["rule"],
            "failure_count": 0,
            "failure_rate": 0.0,
            "source": "prompt_rule",
        })

    # Calibration pairs
    calibration_pairs = _select_calibration_pairs(traces)

    return {
        "dimensions": failure_dimensions,
        "dimension_count": len(failure_dimensions),
        "calibration_pairs": calibration_pairs,
        "calibration_pair_count": len(calibration_pairs),
        "prompt_rules_as_criteria": [r["rule"] for r in prompt_rules],
    }


# ─── Main ────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze OTel traces to inform the PDF finetune pipeline"
    )
    parser.add_argument(
        "traces",
        help="Path to OTel semconv JSON file (source_traces_semconv.json)",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory to write the 4 artifacts (e.g., finetune-project/)",
    )
    parser.add_argument(
        "--pdf-topics",
        default=None,
        help="Path to PDF-derived topics.json (for coverage gap detection)",
    )
    parser.add_argument(
        "--max-seed-queries",
        type=int,
        default=500,
        help="Max seed queries to extract per topic (default: 500)",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir) / "trace-analysis"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load spans
    print(f"Loading traces from {args.traces}...")
    with open(args.traces) as f:
        spans = json.load(f)
    print(f"  Loaded {len(spans)} spans")

    # Group by trace
    traces = group_by_trace_id(spans)
    print(f"  {len(traces)} traces")

    success_count = sum(1 for s in traces.values() if infer_trace_success(s) is True)
    failure_count = sum(1 for s in traces.values() if infer_trace_success(s) is False)
    print(f"  {success_count} successes, {failure_count} failures")

    # Artifact 1: trace_priority.json
    print("\nBuilding trace_priority.json...")
    priority = build_trace_priority(traces)
    priority_path = output_dir / "priority.json"
    with open(priority_path, "w") as f:
        json.dump(priority, f, indent=2)
    print(f"  {len(priority)} topics, written to {priority_path}")

    # Artifact 2: trace_topics.json
    print("\nBuilding trace_topics.json...")
    pdf_topic_names: list[str] | None = None
    if args.pdf_topics:
        with open(args.pdf_topics) as f:
            pdf_data = json.load(f)
        # Extract leaf topic names from hierarchy
        pdf_topic_names = []
        for child in pdf_data.get("children", []):
            if "children" in child:
                for leaf in child["children"]:
                    pdf_topic_names.append(leaf.get("name", ""))
            else:
                pdf_topic_names.append(child.get("name", ""))
    trace_topics = build_trace_topics(priority, pdf_topic_names)
    topics_path = output_dir / "topics.json"
    with open(topics_path, "w") as f:
        json.dump(trace_topics, f, indent=2)
    print(f"  {trace_topics['topic_count']} topics discovered, {trace_topics['coverage_gap_count']} coverage gaps")

    # Artifact 3: trace_prompts.json
    print("\nBuilding trace_prompts.json...")
    trace_prompts = build_trace_prompts(traces, priority, args.max_seed_queries)
    prompts_path = output_dir / "prompts.json"
    with open(prompts_path, "w") as f:
        json.dump(trace_prompts, f, indent=2)
    prompt_preview = trace_prompts["simplified_prompt"][:80] + "..." if trace_prompts["simplified_prompt"] else "(none)"
    print(f"  System prompt: {prompt_preview}")
    print(f"  {trace_prompts['total_seed_queries']} seed queries across {trace_prompts['topics_with_seeds']} topics")

    # Artifact 4: trace_grader_hints.json
    print("\nBuilding trace_grader_hints.json...")
    grader_hints = build_trace_grader_hints(
        traces, priority, trace_prompts["system_prompt"]
    )
    hints_path = output_dir / "grader-hints.json"
    with open(hints_path, "w") as f:
        json.dump(grader_hints, f, indent=2)
    print(f"  {grader_hints['dimension_count']} grader dimensions ({sum(1 for d in grader_hints['dimensions'] if d['source'] == 'trace_failure')} from traces, {sum(1 for d in grader_hints['dimensions'] if d['source'] == 'prompt_rule')} from prompt rules)")
    print(f"  {grader_hints['calibration_pair_count']} calibration pairs")

    # Artifact 5: tool-schemas.json (only if traces contain tool calls)
    print("\nExtracting tool schemas...")
    tool_schemas = extract_tool_schemas_from_traces(traces)
    if tool_schemas:
        schemas_path = output_dir / "tool-schemas.json"
        with open(schemas_path, "w") as f:
            json.dump({"tools": tool_schemas}, f, indent=2)
        print(f"  {len(tool_schemas)} tool schemas extracted (tool-calling agent detected)")
        print(f"  Tools: {', '.join(t['function']['name'] for t in tool_schemas)}")
    else:
        print(f"  No tool schemas found (text-only agent — no tool-calling training needed)")

    # Artifact 6: decision-points.jsonl (only if tool-calling agent)
    decision_point_count = 0
    if tool_schemas:
        print("\nExtracting decision points from traces...")
        # Use the full production prompt — training must match what the model
        # will see at inference. simplified_prompt is for seed-query generation
        # only, and chops 91% of tau-bench's policy.
        production_prompt = trace_prompts.get("system_prompt", "")
        decision_points = extract_decision_points(traces, tool_schemas, production_prompt)
        if decision_points:
            dp_path = output_dir / "decision-points.jsonl"
            with open(dp_path, "w") as f:
                for dp in decision_points:
                    f.write(json.dumps(dp, ensure_ascii=False) + "\n")
            decision_point_count = len(decision_points)
            # Per-topic distribution
            from collections import Counter as _DPCounter
            dp_topics = _DPCounter(dp["topic"] for dp in decision_points)
            print(f"  {decision_point_count} decision points across {len(dp_topics)} topics")
            for topic, count in dp_topics.most_common(5):
                print(f"    {topic}: {count}")
        else:
            print("  No decision points extracted (traces may lack tool call output)")

    # Summary
    print(f"\n{'='*60}")
    print(f"Trace analysis complete. Artifacts written to {output_dir}/")
    print(f"  priority.json          — {len(priority)} topics with priority scores")
    print(f"  topics.json            — {trace_topics['coverage_gap_count']} coverage gaps detected")
    print(f"  prompts.json           — {trace_prompts['total_seed_queries']} seed queries")
    print(f"  grader-hints.json      — {grader_hints['dimension_count']} grader dimensions")
    if tool_schemas:
        print(f"  tool-schemas.json      — {len(tool_schemas)} tool function schemas")
    if decision_point_count:
        print(f"  decision-points.jsonl  — {decision_point_count} tool-call training records")


if __name__ == "__main__":
    main()
