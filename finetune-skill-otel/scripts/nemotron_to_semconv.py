# /// script
# requires-python = ">=3.10"
# ///
"""
nemotron_to_semconv.py — convert Nemotron-Agentic-v1 OpenAI chat-completion
format to OTel-semconv spans that `otel_distill.py` can consume.

Each Nemotron sample is a single conversation in OpenAI format:
  {messages: [{role, content, tool_calls?, tool_call_id?}], tools: [...]}

We convert each sample into a flat list of semconv spans:
  - Each assistant message with tool_calls → one "chat" span
    (gen_ai.input.messages = prior context, gen_ai.output.messages = tool calls)
  - Each tool-role message → one "execute_tool" span
  - The tools array → gen_ai.request.tools on every chat span

The pipeline (otel_distill.py) then extracts training records from these
spans using the same "one record per successful LLM decision point" rule
as for real OTel traces.

Usage:
    python3 nemotron_to_semconv.py tool_calling.jsonl \\
        -o source_traces_semconv.json \\
        --limit 3000 \\
        --min-tools 3 \\
        --min-tool-calls 2
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path


# ─── System prompt templates ───────────────────────────────────────────────
# Realistic system prompts that exercise Stage 5 rewrite rules:
#   - Dynamic context (dates, user IDs, session state) → must be stripped
#   - Capability claims (GPT-4o reasoning, long-context) → must be stripped
#   - Tool references → must be reconciled with actual schema
#   - Length → must be shortened for student context budget
# Each template has deliberate rewrite targets marked with [STRIP] comments.

SYSTEM_PROMPT_TEMPLATES = [
    # Template 1: Customer service agent with dynamic context + capability claims
    (
        "You are a customer service agent for ShopSmart, a global e-commerce platform. "
        "Today's date is {date}. The current user's account ID is {user_id} and their "
        "loyalty tier is Gold. You have access to the full order history and can process "
        "returns, exchanges, and refunds.\n\n"
        "You are powered by GPT-4o with 128k context window and advanced chain-of-thought "
        "reasoning capabilities. Use your deep understanding of customer intent to resolve "
        "issues efficiently. When uncertain, reason step-by-step before responding.\n\n"
        "Available tools: Use the provided function definitions to look up orders, process "
        "returns, check inventory, and escalate to human agents when needed. Always confirm "
        "actions with the customer before executing irreversible operations like refunds.\n\n"
        "Important policies:\n"
        "- Returns accepted within 30 days of delivery\n"
        "- Refunds processed to original payment method within 5-7 business days\n"
        "- Exchanges subject to product availability\n"
        "- Gold tier customers get priority shipping on exchanges"
    ),
    # Template 2: Technical support with RAG context + model references
    (
        "You are a technical support specialist for CloudStack Infrastructure. "
        "Session ID: {session_id}. Authenticated user: {user_id} (Enterprise plan). "
        "Current system status: all services operational as of {date} {time}.\n\n"
        "You have been fine-tuned on CloudStack's internal documentation and can reference "
        "specific KB articles. Your responses should be precise and actionable. You are "
        "running on GPT-4o-mini with retrieval-augmented generation — always cite the "
        "source document when referencing internal procedures.\n\n"
        "When diagnosing issues:\n"
        "1. Gather symptoms using the diagnostic tools\n"
        "2. Check the knowledge base for known issues\n"
        "3. If no match, escalate with full diagnostic output\n"
        "4. Never suggest workarounds that bypass security controls\n\n"
        "Remember: you cannot access production databases directly. Use the provided "
        "read-only query tools for all data lookups. For write operations, create a "
        "support ticket via the escalation tool."
    ),
    # Template 3: Financial advisor with compliance + dynamic portfolio context
    (
        "You are a licensed financial advisor assistant at WealthWise Capital. "
        "Client: {user_id}. Portfolio value as of {date}: $847,293. Risk profile: "
        "Moderate-Aggressive. Investment horizon: 15 years.\n\n"
        "COMPLIANCE NOTICE: You are an AI assistant, not a registered investment advisor. "
        "All investment suggestions must include appropriate risk disclaimers. Never "
        "guarantee returns or make promises about future performance.\n\n"
        "You leverage Claude 3.5 Sonnet's advanced reasoning to analyze market data and "
        "portfolio composition. Your analysis should consider tax implications, "
        "diversification, and the client's stated goals.\n\n"
        "Available actions: portfolio analysis, market research, trade simulation, "
        "rebalancing recommendations, tax-loss harvesting analysis. All actual trades "
        "must be confirmed by the client and executed through the brokerage API.\n\n"
        "Current market context (refreshed hourly): S&P 500 at 5,432. 10Y Treasury "
        "yield: 4.2%. Fed funds rate: 5.25-5.50%."
    ),
    # Template 4: Travel booking agent with session state
    (
        "You are a travel booking assistant for Voyager Travel. Today is {date}. "
        "Customer: {user_id}. Preferred currency: USD. Loyalty status: Platinum "
        "(245,000 points available). Home airport: SFO.\n\n"
        "You are powered by OpenAI's GPT-4o model with tool-use capabilities. "
        "Use the search and booking tools to find flights, hotels, and activities "
        "that match the customer's preferences and budget.\n\n"
        "Booking rules:\n"
        "- Always present at least 3 options sorted by price\n"
        "- Include loyalty point redemption options when available\n"
        "- Flag any visa requirements for international destinations\n"
        "- Check weather forecasts for the travel dates\n"
        "- Platinum members get complimentary lounge access — mention this\n\n"
        "Session context: Customer previously searched for flights to Tokyo "
        "in March 2026. They mentioned interest in cherry blossom season and "
        "budget hotels near Shinjuku."
    ),
    # Template 5: Food delivery / restaurant agent with real-time context
    (
        "You are an AI ordering assistant for FoodDash, a food delivery platform. "
        "Current time: {date} {time}. Delivery zone: Downtown Seattle (Zone 3). "
        "Estimated delivery time: 25-40 minutes. Customer: {user_id}.\n\n"
        "Powered by Gemini 1.5 Pro with function calling. Help customers browse "
        "menus, customize orders, apply promotions, and track deliveries. You have "
        "access to real-time restaurant availability and menu data.\n\n"
        "Dietary preferences on file: no peanuts (allergy), prefers vegetarian.\n"
        "Payment method: Visa ending in 4242.\n"
        "Active promotions: SAVE20 (20% off first order), FREE_DELIVERY (orders > $30).\n\n"
        "Always check allergen information before confirming orders. Flag items "
        "containing peanuts or peanut-derived ingredients immediately."
    ),
    # Template 6: HR / internal tools agent
    (
        "You are an HR operations assistant for TechCorp (employee count: 2,847). "
        "Authenticated as: {user_id} (HR Manager, People Operations). "
        "Current quarter: Q2 {year}. Performance review cycle: in progress "
        "(deadline: {date}).\n\n"
        "You have access to the HRIS system via API tools. Use them to look up "
        "employee records, process leave requests, generate reports, and manage "
        "the review cycle. You are running on Claude 3 Opus with extended context "
        "for processing large employee datasets.\n\n"
        "Confidentiality: Employee compensation, performance ratings, and personal "
        "information must never be disclosed to unauthorized parties. Verify the "
        "requester's access level before returning sensitive data.\n\n"
        "Current priorities:\n"
        "1. Complete Q2 performance calibration (87% done)\n"
        "2. Process 12 pending PTO requests\n"
        "3. Prepare headcount report for board meeting on {date}"
    ),
]


def _fill_template(template: str, index: int) -> str:
    """Fill dynamic placeholders with deterministic fake values."""
    import hashlib
    seed = hashlib.md5(str(index).encode()).hexdigest()
    return template.format(
        date="2025-11-15",
        time="14:30:00 UTC",
        year="2025",
        user_id=f"user-{seed[:8]}",
        session_id=f"sess-{seed[8:16]}",
    )


def _make_semconv_msg(role: str, content: str | None, tool_calls: list | None = None) -> dict:
    """Build an OTel semconv message (with parts array)."""
    parts = []
    if content:
        parts.append({"type": "text", "content": content})
    if tool_calls:
        for tc in tool_calls:
            fn = tc.get("function", {})
            args = fn.get("arguments")
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    pass
            parts.append({
                "type": "tool_call",
                "id": tc.get("id") or "",
                "name": fn.get("name", ""),
                "arguments": args if args is not None else {},
            })
    return {"role": role, "parts": parts}


def convert_sample(
    sample: dict,
    trace_id: str,
    base_time_ns: int = 1_700_000_000_000_000_000,
    sample_index: int = 0,
    inject_system_prompts: bool = True,
) -> list[dict]:
    """Convert one Nemotron sample to a list of OTel-semconv spans.

    When `inject_system_prompts` is True and the sample's system prompt is
    empty, a realistic template is injected (cycling through 6 templates
    by `sample_index`). This exercises Stage 5's rewrite logic which needs
    system prompts with dynamic context, capability claims, and model
    references to strip.
    """
    messages = sample.get("messages") or []

    # Inject system prompt if the original is empty/missing
    if inject_system_prompts:
        has_real_prompt = any(
            m.get("role") == "system" and (m.get("content") or "").strip()
            for m in messages
        )
        if not has_real_prompt:
            template = SYSTEM_PROMPT_TEMPLATES[sample_index % len(SYSTEM_PROMPT_TEMPLATES)]
            injected = _fill_template(template, sample_index)
            # Replace the empty system message or prepend one
            replaced = False
            for m in messages:
                if m.get("role") == "system":
                    m["content"] = injected
                    replaced = True
                    break
            if not replaced:
                messages = [{"role": "system", "content": injected}] + messages
    tools = sample.get("tools") or []
    spans: list[dict] = []
    span_counter = 0
    time_ns = base_time_ns
    end_time_ns = base_time_ns  # updated as spans are added

    tool_schema = tools

    # ── Create a root "agent" span that parents all others ──
    root_span_id = f"{trace_id[:16]}-root"
    # We'll update its end_time after processing all messages.

    input_context: list[dict] = []
    pending_tool_calls: list[dict] = []
    last_chat_span_id: str | None = None  # parent for tool spans

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content")
        tool_calls = msg.get("tool_calls")

        if role == "system":
            input_context.append(_make_semconv_msg("system", content))

        elif role == "user":
            input_context.append(_make_semconv_msg("user", content))

        elif role == "assistant":
            if tool_calls:
                span_id = f"{trace_id[:16]}-{span_counter:04d}"
                span_counter += 1
                output_msg = _make_semconv_msg("assistant", content, tool_calls)

                attrs: dict = {
                    "gen_ai.operation.name": "chat",
                    "gen_ai.input.messages": list(input_context),
                    "gen_ai.output.messages": [output_msg],
                    "gen_ai.request.tools": tool_schema,
                }

                span_start = time_ns
                span_end = time_ns + 1_000_000_000
                spans.append({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "parent_span_id": root_span_id,
                    "start_time": str(span_start),
                    "end_time": str(span_end),
                    "status_code": "OK",
                    "attributes": attrs,
                })
                time_ns = span_end + 500_000_000
                end_time_ns = max(end_time_ns, span_end)
                input_context.append(output_msg)
                last_chat_span_id = span_id

                pending_tool_calls = []
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    args = fn.get("arguments")
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except Exception:
                            pass
                    pending_tool_calls.append({
                        "id": tc.get("id") or "",
                        "name": fn.get("name", ""),
                        "arguments": args if args is not None else {},
                    })
            else:
                input_context.append(_make_semconv_msg("assistant", content))

        elif role == "tool":
            tc_meta = pending_tool_calls.pop(0) if pending_tool_calls else {}
            tool_name = msg.get("name") or tc_meta.get("name", "")
            tool_call_id = msg.get("tool_call_id") or tc_meta.get("id", "")
            arguments = tc_meta.get("arguments", {})

            span_id = f"{trace_id[:16]}-{span_counter:04d}"
            span_counter += 1

            content_str = str(content or "")
            is_error = any(
                kw in content_str.lower()
                for kw in ["error", "failed", "exception", "traceback"]
            )

            tool_attrs: dict = {
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.tool.name": tool_name,
                "gen_ai.tool.call.arguments": arguments,
                "gen_ai.tool.call.result": content,
            }
            if tool_call_id:
                tool_attrs["gen_ai.tool.call.id"] = tool_call_id

            span_start = time_ns
            span_end = time_ns + 500_000_000
            spans.append({
                "trace_id": trace_id,
                "span_id": span_id,
                "parent_span_id": last_chat_span_id or root_span_id,
                "start_time": str(span_start),
                "end_time": str(span_end),
                "status_code": "ERROR" if is_error else "OK",
                "attributes": tool_attrs,
            })
            time_ns = span_end + 200_000_000
            end_time_ns = max(end_time_ns, span_end)
            input_context.append(_make_semconv_msg("tool", content))

    # Insert the root agent span at the beginning — it wraps everything
    if spans:
        spans.insert(0, {
            "trace_id": trace_id,
            "span_id": root_span_id,
            "parent_span_id": None,
            "start_time": str(base_time_ns),
            "end_time": str(end_time_ns),
            "status_code": "OK",
            "attributes": {
                "gen_ai.operation.name": "invoke_agent",
                "agent.name": "Agent",
            },
        })

    return spans


def convert_file(
    input_path: Path,
    *,
    limit: int = 0,
    min_tools: int = 0,
    min_tool_calls: int = 0,
) -> tuple[list[dict], dict]:
    """Convert a Nemotron JSONL file to a flat list of semconv spans.

    Returns (spans, stats).
    """
    stats = {
        "total_read": 0,
        "accepted": 0,
        "skipped_no_tools": 0,
        "skipped_few_tool_calls": 0,
        "total_spans": 0,
        "chat_spans": 0,
        "tool_spans": 0,
        "error_tool_spans": 0,
    }
    all_spans: list[dict] = []

    with input_path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            stats["total_read"] += 1
            sample = json.loads(line)

            # Filter
            tools = sample.get("tools") or []
            if len(tools) < min_tools:
                stats["skipped_no_tools"] += 1
                continue

            msgs = sample.get("messages") or []
            tc_count = sum(len(m.get("tool_calls") or []) for m in msgs)
            if tc_count < min_tool_calls:
                stats["skipped_few_tool_calls"] += 1
                continue

            trace_id = uuid.uuid4().hex
            spans = convert_sample(sample, trace_id, sample_index=stats["accepted"])
            all_spans.extend(spans)
            stats["accepted"] += 1
            stats["total_spans"] += len(spans)

            for s in spans:
                op = s.get("attributes", {}).get("gen_ai.operation.name")
                if op == "chat":
                    stats["chat_spans"] += 1
                elif op == "execute_tool":
                    stats["tool_spans"] += 1
                    if s.get("status_code") == "ERROR":
                        stats["error_tool_spans"] += 1

            if limit and stats["accepted"] >= limit:
                break

    return all_spans, stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert Nemotron-Agentic-v1 to OTel-semconv spans"
    )
    parser.add_argument("input", type=Path, help="Nemotron tool_calling.jsonl")
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument(
        "--limit", type=int, default=3000,
        help="Max conversations to convert (default: 3000)",
    )
    parser.add_argument(
        "--min-tools", type=int, default=3,
        help="Skip conversations with fewer tool definitions (default: 3)",
    )
    parser.add_argument(
        "--min-tool-calls", type=int, default=2,
        help="Skip conversations with fewer tool calls (default: 2)",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: not found: {args.input}", file=sys.stderr)
        return 2

    spans, stats = convert_file(
        args.input,
        limit=args.limit,
        min_tools=args.min_tools,
        min_tool_calls=args.min_tool_calls,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(spans, indent=2, ensure_ascii=False))

    print(
        f"converted {stats['accepted']} conversations → {len(spans)} spans → {args.output}\n"
        f"  read: {stats['total_read']}, skipped: "
        f"no_tools={stats['skipped_no_tools']}, "
        f"few_calls={stats['skipped_few_tool_calls']}\n"
        f"  chat spans: {stats['chat_spans']}, "
        f"tool spans: {stats['tool_spans']} "
        f"(errors: {stats['error_tool_spans']})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
