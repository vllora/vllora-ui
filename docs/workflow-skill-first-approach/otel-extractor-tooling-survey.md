# OTel Trace Extractor — Tooling Survey

> **Status:** Tooling reference (2026-04-08). Companion to
> `otel-traces-as-finetune-input.md`. This doc records what existing
> libraries can and cannot do for the extraction step, so we don't
> reinvent code that already exists and don't expect libraries to
> handle work that nobody has shipped. Updated as the landscape
> evolves.

## TL;DR

**No single library does "OTel agent trace → fine-tuning JSONL"
end-to-end.** Phoenix covers reading; LangSmith covers single-LLM-call
formatting (LangSmith-only, missing tool-call support); LiteLLM has the
right tool-call normalization logic but not as a standalone span-aware
API; OpenAI ships a 100-line schema validator. Everything between those
— the actual extraction logic — is custom code we have to write.

The novel piece is **trajectory explosion**: turning one trace into N
JSONL records, each with a growing context prefix. **No library does
this**, and our planned trainer (TRL `GRPOTrainer`) has open issues
proving the gap is real.

## What v1 builds vs. reuses

| Step | Source | Status | LOC est. |
|---|---|---|---|
| OTLP-JSONL file reader (raw) | **Custom** — `json.loads` per line + attribute key-value flattener | build | ~30 |
| Phoenix Parquet reader (when traces are in Phoenix) | [`arize-phoenix-client.get_spans_dataframe`](https://github.com/Arize-ai/phoenix) | use | wrapper ~10 |
| OpenInference → OTel GenAI semconv mapper | **Custom** — the two namespaces use different attribute names | build | ~40 |
| Span filter (`span_kind == LLM`) | **Custom** | build | ~5 |
| Turn-boundary detection (Langfuse Sessions / `invoke_agent` / time-gap fallback) | **Custom** — three strategies, no library does this | build | ~80 |
| `tool_call_id` ↔ `tool_use_id` normalizer (OpenAI ↔ Anthropic) | **Custom** — port the logic from [LiteLLM](https://github.com/BerriAI/litellm), don't import it as a dep | build (port) | ~30 |
| Tool call ↔ result linker by id | **Custom** | build | ~40 |
| **Trajectory exploder** (one trace → N JSONL records with growing prefix) | **Custom — the novel piece** | build | ~150 |
| SCoRe-style correction record extractor (Pattern B) | **Custom** — paper has algorithm, no reusable code | build | ~80 |
| OpenAI JSONL formatter | **Custom** — mirrors the format from the [OpenAI fine-tuning docs](https://platform.openai.com/docs/guides/supervised-fine-tuning) | build | ~50 |
| Schema validator | **Copy** from [OpenAI Cookbook `chat_finetuning_data_prep`](https://cookbook.openai.com/examples/chat_finetuning_data_prep) | reuse (copy) | ~100 |
| **Total** | | | **~600 LOC** |

Small enough to be one well-tested file. Large enough that nobody else
has written it for us.

## Library-by-library findings

### Category 1 — Trace export libraries

#### Arize Phoenix — `arize-phoenix` / `arize-phoenix-client`

- **URL**: [github.com/Arize-ai/phoenix](https://github.com/Arize-ai/phoenix), [pypi.org/project/arize-phoenix-client](https://pypi.org/project/arize-phoenix-client/)
- **What it actually does**: `px.Client().get_spans_dataframe(project_name=...)` pulls all spans as a flat pandas DataFrame indexed by `span_id`. Columns include `span_kind`, `parent_id`, `start_time`, `end_time`, `attributes.llm.input_messages`, `attributes.llm.output_messages`, `attributes.llm.model_name`. The `SpanQuery` DSL adds `.where()`, `.select()`, `.explode()` for filtered extraction. `TraceDataset` wraps the DataFrame and persists to Parquet.
- **What it does NOT do**: There is no OpenAI JSONL export method anywhere in the codebase — confirmed by reading [`trace_dataset.py`](https://github.com/Arize-ai/phoenix/blob/main/src/phoenix/trace/trace_dataset.py) directly. No turn boundaries, no tool-call linking, no trajectory explosion.
- **Schema note**: Phoenix uses OpenInference attribute naming (`attributes.llm.input_messages`), not OTel GenAI semconv (`gen_ai.input.messages`). A two-path mapper is needed.
- **License**: Apache 2.0
- **Maturity**: ~4.5k stars, weekly releases as of early 2026
- **Verdict**: **PARTIALLY USEFUL.** Best available tool for read + flat-span filtering when traces live in Phoenix. Useless beyond step 3.

#### Langfuse Python SDK

- **URL**: [langfuse.com/docs/api-and-data-platform/features/fine-tuning](https://langfuse.com/docs/api-and-data-platform/features/fine-tuning), [github.com/langfuse/langfuse-python](https://github.com/langfuse/langfuse-python)
- **What it actually does**: The UI can export a filtered observation table as OpenAI JSONL. The Python SDK gives raw trace/observation objects via REST queries; **there is no SDK method that produces JSONL directly.** "Export for Fine-Tuning" is a UI button, not a programmatic API.
- **License**: MIT (SDK), SSPL (self-hosted server)
- **Maturity**: ~12k stars, active
- **Verdict**: **NOT FIT** for automated extraction. Useful only if you already use Langfuse as your trace store and want manual UI exports.

#### LangSmith — `LangSmithRunChatLoader` + `convert_messages_for_finetuning`

- **URLs**: [LangChain v0.2 docs](https://python.langchain.com/v0.2/docs/integrations/chat_loaders/langsmith_llm_runs/), [LangSmith Cookbook](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb), [API reference](https://python.langchain.com/api_reference/community/adapters/langchain_community.adapters.openai.convert_messages_for_finetuning.html)
- **What it actually does**: `LangSmithRunChatLoader(client=client, project_name="my-project")` queries LangSmith for all LLM runs in a project and returns them as `ChatSession` objects via `.lazy_load()`. `convert_messages_for_finetuning(sessions)` converts those sessions into `{"messages": [...]}` dicts ready for JSONL.
- **Critical caveat**: The cookbook explicitly states tool/function calls are filtered out — *"the OpenAI API doesn't currently support the 'function_call' argument when fine-tuning. We will filter these out first."* **This is outdated guidance** (OpenAI added tool-call fine-tuning support in 2024), but the converter does not implement it. Using this for our v1 patterns (which require tool-call records) requires patching.
- **License**: MIT
- **Maturity**: LangSmith SDK ~2.5k stars; `LangSmithRunChatLoader` lives in `langchain-community`, not `langsmith` directly.
- **Verdict**: **PARTIALLY USEFUL** if traces are in LangSmith. Most complete JSONL formatting logic in any reviewed library, but the tool-call gap is fatal for our v1 patterns without a patch.

#### OpenInference instrumentation packages

- **URL**: [github.com/Arize-ai/openinference](https://github.com/Arize-ai/openinference)
- **What it does**: Pure instrumentation. The packages (`openinference-instrumentation-openai`, `-langchain`, `-dspy`, etc.) only generate spans — there is no consumer/reader outside Phoenix.
- **Verdict**: **NOT FIT** for extraction. Relevant only as the span schema reference for Phoenix-collected traces.

#### Traceloop / OpenLLMetry

- No trace-to-fine-tuning export utility found. Write-side instrumentation only.
- **Verdict**: **NOT FIT.**

### Category 2 — OTLP / OTel parsers

#### `opentelemetry-proto` (Python)

- **URL**: [github.com/open-telemetry/opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto)
- **What it does**: Protobuf definitions for OTLP. Use `google.protobuf.json_format.MessageToDict` to parse OTLP JSON into Python dicts, or proto decoding for binary. Low-level plumbing; no span-level helpers, no dataframe conversion, no attribute typing.
- **Verdict**: **PARTIALLY USEFUL** as a parsing primitive for OTLP binary. For OTLP JSON (newline-delimited), `json.loads()` + manual attribute extraction is simpler and avoids the proto dependency.

#### `otlp-json` (PyPI)

- **URL**: [pypi.org/project/otlp-json](https://pypi.org/project/otlp-json/)
- **What it does**: Encodes spans from a live Python process to OTLP 1.5 JSON. Explicitly not designed to read or parse OTLP files: *"not meant to be used for data received and forwarded."*
- **Verdict**: **NOT FIT.** Write-only.

#### `otel-file-exporter` (PyPI)

- **URL**: [pypi.org/project/otel-file-exporter](https://pypi.org/project/otel-file-exporter/)
- **What it does**: Writes traces/logs/metrics to `.jsonl` files from a live OTel SDK session. Write-side only.
- **Verdict**: **NOT FIT** for reading existing files.

#### OTel Collector `otlpjsonfilereceiver`

- **URL**: [github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/otlpjsonfilereceiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/otlpjsonfilereceiver/README.md)
- **What it does**: The Collector's reference implementation for ingesting OTLP-JSON files. Go binary, not a Python library.
- **Verdict**: **NOT FIT** for direct reuse, but useful as the **format spec authority** — confirms what canonical OTLP-JSON looks like.

**Honest conclusion for Category 2:** For reading OTLP JSON files in Python, `json.loads()` per line + manual attribute navigation (`resourceSpans[].scopeSpans[].spans[]`, `attributes[]` as a key-value list) is the right approach. **No library abstracts this reliably for the consumer side.**

### Category 3 — Trajectory extraction / trace-to-dataset libraries

**No purpose-built library exists.** Searching PyPI, GitHub, and HuggingFace found:

- **Datasets** of pre-extracted agent trajectories (SWE-agent, Hermes, TRAIL, Toolathlon — all HuggingFace datasets, not extraction tooling).
- **TRAIL from Patronus AI** ([dataset](https://huggingface.co/datasets/PatronusAI/TRAIL), [paper arXiv:2505.08638](https://arxiv.org/html/2505.08638v1)) is the closest conceptual peer: 148 human-annotated agentic traces in OpenInference format used for **eval**, not fine-tuning. The benchmark code evaluates traces; it does not extract training records from them. **This is the only project we found handling the same data shape we're handling.**
- **TRL `GRPOTrainer`** has active GitHub discussions about multi-step trajectory training ([#2704](https://github.com/huggingface/trl/discussions/2704), [#4543](https://github.com/huggingface/trl/issues/4543)) but **no trace-loading utilities**. Multi-step agent rollouts require different `prompt_id` per step — TRL currently forces one shared prompt per dataset example, making trajectory-explosion mathematically incorrect in server mode. **This is a known gap in our planned trainer.**

**Verdict**: **You must build the trajectory layer from scratch.** No library implements the "walk a trajectory, emit one JSONL line per LLM decision point" pattern. This is the most novel piece of v1.

### Category 4 — Tool-call normalization

#### LiteLLM

- **URL**: [docs.litellm.ai](https://docs.litellm.ai/docs/providers/anthropic), [github.com/BerriAI/litellm](https://github.com/BerriAI/litellm), [DeepWiki: tool calling](https://deepwiki.com/BerriAI/litellm/8.1-tool-calling-and-function-integration)
- **What it actually does**: `convert_tool_use_to_openai_format()` internally normalizes Anthropic `tool_use_id` to OpenAI `tool_call_id` in response objects. `_map_openai_mcp_server_tool()` converts in the other direction. The normalization is correct but operates on **live API response objects**, not on stored span attributes from a JSONL file.
- **License**: MIT
- **Maturity**: ~20k stars, very active
- **Verdict**: **PARTIALLY USEFUL** as a reference implementation. **Port the key lookup logic** rather than importing LiteLLM as a dependency for span-attribute normalization — the abstraction mismatch is too large.

### Category 5 — Schema validators

#### OpenAI Cookbook `chat_finetuning_data_prep`

- **URL**: [cookbook.openai.com/examples/chat_finetuning_data_prep](https://cookbook.openai.com/examples/chat_finetuning_data_prep)
- **What it does**: Standalone Python notebook/script that checks: role validity, required fields, message count distribution, token count, token-limit warnings (16,385 cap). Validates the `messages` array schema. The companion [`fine_tuning_for_function_calling`](https://cookbook.openai.com/examples/fine_tuning_for_function_calling) cookbook separately validates `tool_calls` with `tool_call_id` and `tool` role messages.
- **What it does NOT validate**: `tool_call_id` linkage correctness (that a `tool` result message matches a prior `tool_call_id`) — only structural format.
- **License**: MIT (OpenAI cookbook)
- **Verdict**: **USE.** Copy the validation functions into our pipeline directly. ~100 lines of pure Python with no dependencies.

#### `openai-fine-tuning-validate` (community)

- **URL**: [github.com/gh640/openai-fine-tuning-validate](https://github.com/gh640/openai-fine-tuning-validate)
- **What it does**: CLI wrapper around similar checks. Less complete than the OpenAI cookbook script.
- **Verdict**: **NOT FIT** — redundant and less complete.

## Things to know that aren't in any single library

These came out of the research and are worth knowing about even though they don't map to a "use this library" answer:

1. **TRAIL is OpenInference format.** Our OpenInference Parquet adapter (already prototyped from the Phoenix shopping fixture) is genuinely reusable for TRAIL-style data. Keep this in mind if we ever want to extend the eval pipeline using TRAIL as a benchmark.

2. **TRL `GRPOTrainer` does not support multi-step trajectories cleanly.** Issues #2704 and #4543 confirm: TRL forces one shared prompt per dataset example, so trajectory-exploded records (one JSONL line per decision point with growing prefix) need synthetic per-record IDs to satisfy TRL's per-example assumption. **This is a known gap in our planned trainer that may force record-shape decisions.** Investigate before finalizing the extractor.

3. **There is no Python OTLP-JSON file reader.** The closest thing is the OTel Collector's `otlpjsonfilereceiver`, which is a Go binary. For Python, hand-write a 30-line reader.

4. **OpenInference and OTel GenAI semconv use different attribute namespaces.** OpenInference: `attributes.llm.input_messages`, `attributes.llm.output_messages`. OTel GenAI: `gen_ai.input.messages`, `gen_ai.output.messages`. The mapper between them is custom code (~40 lines).

5. **No library handles the SCoRe correction record extraction.** The [SCoRe paper (ICLR 2025)](https://openreview.net/forum?id=CjwERcAU7w) describes the algorithm; no reusable code exists. We have to implement Pattern B from scratch.

## Recommended build-on-top stack

```
┌─ Read layer ─────────────────────────────────────────────┐
│   OTLP-JSONL file → custom 30-line reader                │
│   Phoenix project → arize-phoenix-client.get_spans_df   │
│   LangSmith project → LangSmithRunChatLoader (patched)   │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─ Normalize layer ────────────────────────────────────────┐
│   OpenInference attrs → OTel semconv attrs (custom map)  │
│   Anthropic tool_use_id → OpenAI tool_call_id (port      │
│      the lookup logic from LiteLLM, don't import it)     │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─ Extract layer ──────────────────────────────────────────┐
│   Filter span_kind == LLM             (custom)           │
│   Detect turn boundaries              (custom — three    │
│      strategies: Langfuse session /     strategies, no   │
│      invoke_agent span / time-gap)      library does it) │
│   Link tool calls ↔ results by id     (custom)           │
│   Walk trajectories, explode into     (custom — THE     │
│      N records with growing prefix      novel piece)     │
│   Extract SCoRe correction records    (custom)           │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─ Format layer ───────────────────────────────────────────┐
│   Render as OpenAI fine-tuning JSONL  (custom, mirrors   │
│      one full-conversation per line     OpenAI cookbook  │
│      with tool_call_id linkage)         format)          │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─ Validate layer ─────────────────────────────────────────┐
│   Schema validation                   (COPY OpenAI       │
│      role validity, token counts,       cookbook script  │
│      tool call structure                — ~100 lines)    │
└──────────────────────────────────────────────────────────┘
```

## Maintenance notes

This doc should be updated when:

- Any of the partial-fit libraries above ships an end-to-end extractor (would let us delete custom code).
- TRL fixes the multi-step trajectory issue (#4543) — would change how we shape exploded records.
- OpenInference or OTel GenAI semconv ships a turn-boundary attribute (would let us drop the custom turn detector).
- A new library appears that does trajectory explosion or SCoRe extraction.

## Sources

All citations were verified by a research agent against actual platform
docs, source code, and paper abstracts as of April 2026.

### Trace export libraries
- [Phoenix `trace_dataset.py` source](https://github.com/Arize-ai/phoenix/blob/main/src/phoenix/trace/trace_dataset.py)
- [Phoenix: Extract Data from Spans](https://arize.com/docs/phoenix/tracing/how-to-tracing/importing-and-exporting-traces/extract-data-from-spans)
- [arize-phoenix-client on PyPI](https://pypi.org/project/arize-phoenix-client/)
- [Langfuse Export for Fine-Tuning](https://langfuse.com/docs/api-and-data-platform/features/fine-tuning)
- [Langfuse Python SDK](https://github.com/langfuse/langfuse-python)
- [LangSmith Run Chat Loader](https://python.langchain.com/v0.2/docs/integrations/chat_loaders/langsmith_llm_runs/)
- [LangSmith Cookbook: Fine-tuning on Chat Runs](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb)
- [`convert_messages_for_finetuning` API reference](https://python.langchain.com/api_reference/community/adapters/langchain_community.adapters.openai.convert_messages_for_finetuning.html)
- [OpenInference GitHub](https://github.com/Arize-ai/openinference)

### OTLP / OTel parsers
- [opentelemetry-proto GitHub](https://github.com/open-telemetry/opentelemetry-proto)
- [otlp-json on PyPI](https://pypi.org/project/otlp-json/)
- [otel-file-exporter on PyPI](https://pypi.org/project/otel-file-exporter/)
- [OTLP JSON File Receiver (Collector contrib)](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/otlpjsonfilereceiver/README.md)
- [OTel GenAI agent spans spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [OTel GenAI attribute registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)

### Trajectory extraction (closest peers — none are end-to-end)
- [PatronusAI TRAIL HuggingFace dataset](https://huggingface.co/datasets/PatronusAI/TRAIL)
- [TRAIL paper (arXiv:2505.08638)](https://arxiv.org/html/2505.08638v1)
- [TRL GRPOTrainer agent trajectories discussion #2704](https://github.com/huggingface/trl/discussions/2704)
- [TRL multi-step trajectory issue #4543](https://github.com/huggingface/trl/issues/4543)
- [SCoRe (ICLR 2025)](https://openreview.net/forum?id=CjwERcAU7w)

### Tool-call normalization
- [LiteLLM Anthropic tool call docs](https://docs.litellm.ai/docs/providers/anthropic)
- [LiteLLM tool calling DeepWiki](https://deepwiki.com/BerriAI/litellm/8.1-tool-calling-and-function-integration)
- [LiteLLM GitHub](https://github.com/BerriAI/litellm)
- [Anthropic tool use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)

### Schema validators
- [OpenAI Cookbook: Chat Fine-tuning Data Prep](https://cookbook.openai.com/examples/chat_finetuning_data_prep)
- [OpenAI Fine-tuning for Function Calling Cookbook](https://cookbook.openai.com/examples/fine_tuning_for_function_calling)
- [OpenAI Supervised Fine-Tuning Guide](https://platform.openai.com/docs/guides/supervised-fine-tuning)
- [openai-fine-tuning-validate (community CLI)](https://github.com/gh640/openai-fine-tuning-validate)
