# OTel Trace Ingestion

> **⚠ STATUS: DEPRECATED (2026-04-20).** The `otel_extract.py` flow described here is unused by the training pipeline — `consolidate_parts.py` does not consume `kind: "otel-trace"` parts. The real OTel trace path is:
>
> - **`trace_analyze.py`** reads `source_traces_semconv.json` directly (no extraction step) and emits `trace-analysis/*.json` + `decision-points.jsonl` for training.
> - **`upload_trace_analysis.py`** registers the trace bundle as a `kind=otel-trace` knowledge source so the UI can render it.
>
> This document is retained as reference for the OTel GenAI semconv shape + attribute names the pipeline relies on. Do NOT run `otel_extract.py` as part of the pipeline — its output is discarded.

---

## OTel GenAI semantic conventions we consume (authoritative reference)

The finetune pipeline (via `trace_analyze.py`) reads traces that follow the OpenTelemetry GenAI semantic conventions. This section documents which attributes we rely on and which are explicitly unsupported.

---

## OTel GenAI semantic conventions we consume

We follow the OpenTelemetry GenAI conventions (status: development as of
April 2026). The shape has settled but the spec is not yet stable. Specs:

- [GenAI client spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [GenAI agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)

### Required attributes

| Attribute | Notes |
|-----------|-------|
| `gen_ai.operation.name` | `chat`, `embeddings`, `execute_tool`, `invoke_agent`, `text_completion` |
| `gen_ai.provider.name` | `openai`, `anthropic`, `aws.bedrock`, etc. |

### Recommended attributes

| Attribute | Used for |
|-----------|---------|
| `gen_ai.request.model` | Header chip in trace UI; filter facet |
| `gen_ai.response.model` | Provenance |
| `gen_ai.usage.input_tokens` | Usage stats |
| `gen_ai.usage.output_tokens` | Usage stats |
| `gen_ai.request.temperature` | Provenance |
| `gen_ai.response.finish_reasons` | Bubble badge |

### Content attributes (opt-in — may be absent)

| Attribute | What it carries |
|-----------|-----------------|
| `gen_ai.system_instructions` | System prompt (string) |
| `gen_ai.input.messages` | Array of `{role, parts: [{type, content|...}]}` |
| `gen_ai.output.messages` | Array of `{role, finish_reason, parts: [...]}` |

> **DEPRECATED — never code against these.** v1.38.0 of the spec removed:
> - `gen_ai.prompt`
> - `gen_ai.completion`
>
> Use `gen_ai.input.messages` / `gen_ai.output.messages` instead.

### Agent attributes (on `invoke_agent` spans)

| Attribute | What it carries |
|-----------|-----------------|
| `gen_ai.agent.name` | Human-readable agent name |
| `gen_ai.agent.id` | Unique agent identifier |
| `gen_ai.conversation.id` | Correlates multi-turn — primary grouping key |

### Tool attributes (on `execute_tool` spans)

| Attribute | What it carries |
|-----------|-----------------|
| `gen_ai.tool.name` | Function name |
| `gen_ai.tool.type` | `function`, `extension`, `datastore` |
| `gen_ai.tool.call.id` | Matches `tool_call.id` in messages |
| `gen_ai.tool.call.arguments` | JSON args |
| `gen_ai.tool.call.result` | JSON result |

---

## Output: knowledge_parts.json

Each part is one logical unit from a span:

- `system` part — when `gen_ai.system_instructions` is present
- one part per `gen_ai.input.messages[i]`
- one part per `gen_ai.output.messages[i]`
- one extra part per `execute_tool` span (the `(name, args, result)` triple)

`extraction_path` is `{trace_id}/{span_id}#{kind}-{index}` so you can navigate
back to the source span from the UI.

`content_metadata.kind === "otel-trace"` is the discriminator the UI uses
to render the source via `OtelTraceSourceViewer.tsx` (timeline of bubbles)
instead of the PDF/document viewer.

Full metadata schema written by the extractor:

```json
{
  "kind": "otel-trace",
  "trace_id": "...",
  "span_id": "...",
  "parent_span_id": "...",
  "operation_name": "chat",
  "provider_name": "openai",
  "request_model": "gpt-4o",
  "response_model": "gpt-4o-2024-11-20",
  "conversation_id": "conv-...",
  "agent_name": "...",
  "agent_id": "...",
  "input_tokens": 84,
  "output_tokens": 142,
  "start_time": "...",
  "end_time": "...",
  "duration_ms": 2420,
  "role": "system|user|assistant|tool",
  "finish_reason": "stop|tool_calls|...",
  "tool_name": "...",
  "tool_call_id": "..."
}
```

---

## Running the script

```bash
# Per-conversation files (default — recommended)
python3 finetune-skill/scripts/otel_extract.py traces.json \
    --out-dir finetune-project/knowledge

# Single output file (skips per-conversation grouping)
python3 finetune-skill/scripts/otel_extract.py traces.json \
    -o finetune-project/knowledge/otel-all/knowledge_parts.json

# Group by trace_id instead of conversation_id
python3 finetune-skill/scripts/otel_extract.py traces.json \
    --out-dir finetune-project/knowledge --split-by trace
```

The script accepts either:
- a flat JSON array of spans, or
- an OTLP-JSON document (`{"resourceSpans": [...]}`).

Try it with the bundled sample:

```bash
python3 finetune-skill/scripts/otel_extract.py \
    finetune-skill/templates/sample-otel-trace.json \
    --out-dir /tmp/otel-test
```

---

## Gotchas

1. **Content attributes are opt-in.** A trace with no `gen_ai.input.messages` /
   `gen_ai.output.messages` produces zero parts. The producer must explicitly
   enable content capture (`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`
   or equivalent SDK option). The UI surfaces a hint when content is missing.
2. **Don't read `gen_ai.prompt` / `gen_ai.completion`.** Deprecated in
   v1.38.0. If a producer still emits them, treat them as garbage and ask
   the producer to upgrade.
3. **Conversation grouping is the default** because that's what produces
   useful per-conversation finetune sources. Single-span traces still work —
   they end up in their own group.
4. **Tokens may be missing.** Many proxies don't forward `gen_ai.usage.*`.
   The UI shows `—` and the records pipeline doesn't depend on token counts.
5. **OTLP nanosecond timestamps** are converted to ISO/ms by the script;
   producers using ISO strings work transparently.
