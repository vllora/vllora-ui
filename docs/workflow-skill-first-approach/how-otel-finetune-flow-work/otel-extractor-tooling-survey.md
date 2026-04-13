# Pipeline Tooling Survey

> **Status:** Tooling reference (2026-04-08). Companion to
> `otel-traces-as-finetune-input.md`. This doc records what existing
> libraries can and cannot do for **every stage of the trace
> finetune pipeline**, so we don't reinvent code that already exists
> and don't expect libraries to handle work nobody has shipped.
> Updated as the landscape evolves.
>
> Original scope was extraction only (Stages 1–3). Stages 4–9 were
> added in a follow-up research pass — see "Stages 4–9: Pipeline
> tooling survey" further down.

## TL;DR — entire pipeline

**Scope split as of 2026-04-08:** the cloud server (LangDB Cloud)
handles GRPO training (Stage 7). Deployment (Stage 9) is deferred.
**Our local v1 pipeline owns Stages 1–6 and 8** — extract from
traces, derive a grader, rewrite the system prompt, run the
difficulty probe, hand the artifacts to the cloud, then evaluate the
trained model.

| Stages | Owner | What library / framework / platform | Reuse % | Notes |
|---|---|---|---|---|
| **1–3 — Trace ingestion + extraction** | Local pipeline | Phoenix `get_spans_dataframe` (read), LangSmith `LangSmithRunChatLoader` (read), LiteLLM (port tool-call normalization), OpenAI Cookbook validator (copy) | ~30% | Trajectory explosion is the novel piece nobody has shipped |
| **4 — Tool-call grader** | Local pipeline | `jsonschema` + ported BFCL set-match logic | ~45% | Partial-credit scoring math is custom |
| **5 — System prompt rewrite** | Local pipeline | LLM API call + `jinja2` template | ~20% | Meta-prompt for Qwen canonicalization is custom |
| **6 — Difficulty probe** | Local pipeline | vLLM `LLM.generate(n=8)` + custom bucketing | ~20% | Bucketing rules are custom. (Probe runs locally against the base model **before** handing artifacts to the cloud — gates whether training is worth running at all.) |
| **7 — GRPO training** | **Cloud server (LangDB Cloud)** | Cloud team's stack (presumed TRL + Unsloth or equivalent) | **N/A — not our code** | We hand off records + grader + rewritten system prompt + base model choice. The TRL #5366 pin (`transformers >= 5.0`) and other GRPO concerns belong to the cloud team, not us. |
| **8 — Held-out eval** | Local pipeline (model lives on cloud, eval orchestration is local) | `inspect-ai` + custom eval loop + `deepeval ToolCorrectnessMetric` scorer | ~50% | τ-bench domain definition is ~2 days of engineering. May run inference against the cloud-served model. |
| **9 — Deployment** | **Deferred** | (deferred) | — | Out of scope for v1 of this doc. Existing vLLora gateway likely handles it; revisit when we get there. |

**Net for our local pipeline (Stages 1–6 and 8):** Stages 1–6 are
majority-custom; Stage 8 is ~50/50. The custom code lives in
trajectory explosion (Stage 3), grader scoring math (Stage 4),
system-prompt meta-prompt (Stage 5), difficulty bucketing (Stage 6),
and held-out eval orchestration (Stage 8). **Total v1 pipeline code
estimate: ~600 LOC (extraction) + ~240 LOC (grader) + ~100 LOC
(prompt rewrite) + ~50 LOC (probe) + ~150 LOC (eval orchestration) ≈
1,140 LOC.** Plus the cloud handoff format spec.

---

## TL;DR — extraction only (original scope)

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

---

# Architecture: two skills, shared surfaces

> **Decision (2026-04-08):** The trace pipeline ships as a new,
> parallel skill — **`finetune-skill-otel/`** — that lives alongside
> the existing `finetune-skill/` (PDF pipeline). The two skills
> share the UI, gateway, storage layer, training JSONL format, and
> cloud handoff API — but **no pipeline code crosses the boundary.**

This is the most important architectural decision in the trace
pipeline, and it's motivated purely by risk minimization: the
existing PDF skill is already working and has been validated against
real test samples. Extending it to handle traces would create
shared-code breakage vectors that are hard to defend against.
Creating a new parallel skill **physically eliminates** the risk —
trace-skill code literally cannot reach PDF-skill code.

## What each skill owns

| Concern | `finetune-skill/` (PDF) | `finetune-skill-otel/` (OTel) |
|---|---|---|
| SKILL.md | existing, frozen | new, copy + modify |
| Pipeline orchestrator | `finetune.py` (existing) | `finetune-otel.py` (new, parallel) |
| Stage 1 inspection | `docling_extract.py` | span-tree walk (new) |
| Stage 2 topics | `relation-builder` agent (LLM clustering) | `trace_topics.py` (tool-schema lifting, no LLM) |
| Stage 3 records | `generate_records.py` (LLM-generated Q/A) | `otel_distill.py` (extracted decisions, no LLM) |
| Stage 4 grader | `grader-writing.md` (LLM judge rubric) | `trace_grader_builder.py` (Jaccard verifier) |
| Stage 5 system prompt | built from topics | `system_prompt_rewriter.py` (lift + rewrite) |
| Stage 6 probe thresholds | 3 gates (learnable, topic-trivial, sanity) | 4 gates (plus trivial_wrong, per-tool, refusal) |
| Stage 7 training config | PDF defaults | tool-routing deltas |
| Stage 8 analysis | `analysis-strategy.md` (per-topic + LLM critique) | `analyze_eval_trace.py` (per-tool + confusion matrix) |
| Reference docs | existing: grader-writing.md, iteration-strategy.md, analysis-strategy.md, etc. | new: trace-grader-reference.md, trace-hyperparameters.md, trace-analysis-strategy.md |
| Test samples | `~/test-samples/chess-tactics/` etc. | `~/test-samples/otel-phoenix/` |
| **Sub-agents** | **4** (`knowledge-extractor`, `relation-builder`, `nemo-data-generator`, `training-monitor`) — each exists because its stage is LLM-heavy or long-running | **0 in v1** — trace work is mechanical extraction, not LLM-heavy. Optional `trace-job-monitor` deferred pending `training-monitor` usefulness verification in PDF skill. See the concept doc's "Sub-agents: the trace skill is architecturally lighter" section. |

**Every row is either existing-in-PDF or new-in-trace.** No row is
"modified in PDF as part of trace work." That's the point.

## What's shared (lives in neither skill)

| Shared surface | Lives where | Change type |
|---|---|---|
| **UI** — workflow shell, Knowledge node, records/grader/training pages | `vllora/ui/src/` | **Additive only** — existing PDF components untouched, new trace components added alongside, dispatch at render time on `content_metadata.kind` |
| **Gateway API** (`POST /knowledge-sources`, `POST /workflows`, etc.) | `vllora/gateway/` | **Additive only** — `kind="otel-trace"` is a new enum variant; existing `kind="document"` paths unchanged |
| **`knowledge_sources` table** | Gateway SQLite | **Additive migration** — new nullable `trace_bundle_id` FK column; existing rows get NULL automatically |
| **`trace_bundles` table** | Gateway SQLite | **New table** — zero impact on PDF queries |
| **Training JSONL format** | OpenAI chat-completion format | **Same for both skills** — no schema change |
| **Cloud handoff API** | LangDB Cloud server | **Extended** with new `source_kind` and `grader.type` variants; existing PDF payloads unchanged |
| **Base model choice** | Qwen3.5-4B default for both | **Same** — per-workflow configurable |
| **Deployment** (Stage 9) | vLLora gateway + vLLM | **Deferred v1, same for both when it ships** |

## Why not "one skill with careful isolation patterns"?

An earlier version of this decision proposed keeping one skill with
a "fork at dispatcher" pattern — source kind determines which code
path runs, but both paths live in the same skill directory. That
approach has one fundamental weakness: it keeps both pipelines in
the same codebase, and a developer can still accidentally touch
shared code.

**The only way to guarantee the PDF skill can't be broken by trace
work is to make it physically impossible.** Two separate skills
achieve that; one skill with isolation patterns doesn't.

| Property | Fork-at-dispatcher | Two separate skills |
|---|---|---|
| PDF skill can be broken by trace work | Possible (shared code) | **Physically impossible** |
| Parallel development velocity | Blocked by regression tests | Unblocked |
| Version independence | Monolithic | PDF at v1.2, trace at v0.3-alpha |
| Claude Code skill discovery | Bloated (both paths in one skill) | Users install the one they need |
| Matches skill-first architecture | Violates it (one skill, two data shapes) | Honors it |

The duplication cost (~500 LOC of one-time copy + parallel reference
docs) is worth the physical isolation guarantee.

## Engineering contract

The rules that make the split safe are enforced by
[`trace-pipeline-isolation.md`](./trace-pipeline-isolation.md):

1. **Trace-skill work never modifies files inside `finetune-skill/`.**
   Any PR that touches `finetune-skill/` as part of trace work is
   rejected at review.
2. **Shared-surface changes (UI, gateway, DB) must be additive
   only.** No existing column is dropped, renamed, or semantically
   changed. No existing UI component is refactored as part of trace
   work. No existing gateway endpoint signature is changed.
3. **Golden tests run on every PR** — one per skill, independent.
4. **The existing `finetune-skill/` SKILL.md is frozen** until the
   trace skill has shipped and stabilized.

See that doc for the full file-level contract.

## Existing files that move during the split

Four files currently live in `finetune-skill/` from earlier design
work but actually belong in the new trace skill:

| Current location | New location |
|---|---|
| `finetune-skill/scripts/openinference_to_semconv.py` | `finetune-skill-otel/scripts/openinference_to_semconv.py` |
| `finetune-skill/scripts/otel_extract.py` | `finetune-skill-otel/scripts/otel_extract.py` |
| `finetune-skill/reference/otel-trace-ingestion.md` | `finetune-skill-otel/reference/otel-trace-ingestion.md` |
| `docs/workflow-skill-first-approach/trace-grader-reference.md` | `finetune-skill-otel/reference/trace-grader-reference.md` |

These moves happen when `finetune-skill-otel/` is created. Until
then, they remain in their current locations — the moves are
forward-looking.

---

# Storage decision: where trace bundles live in the gateway database

> **Decision (2026-04-08, research-backed):** Trace bundles live in a
> **separate `trace_bundles` table** with a foreign key from
> `knowledge_sources`. **Do not** merge them into `knowledge_sources`
> as a `kind="otel-trace"` row with a raw blob column. Earlier drafts
> of the design doc proposed the merged approach; verified prior art
> contradicted it.

## Why this is in the tooling survey, not just the concept doc

The concept doc (`otel-traces-as-finetune-input.md`) has the
high-level "what + why." This section is where the schema details,
the four-option trade-off, the migration cost analysis, and the
comparison against prior art live. It's implementation-flavored, so
it belongs here.

## The four storage options we considered

| | Approach | Verdict | Why |
|---|---|---|---|
| **(a)** | Same `knowledge_sources` table, `kind="otel-trace"`, raw OTLP-JSONL in a `raw_blob` column on the same row | ❌ **Worst** | Conflates two different row shapes (PDF vs trace) in one table. SQLite page cache degrades when rows swell to 100KB+. The "escape hatch to split later" claim is wrong: every consumer of `knowledge_sources` that touches the blob has to be updated when migrating, which is the **most expensive** migration path. |
| **(b)** | Same `knowledge_sources` table, blob in a 1:1 child file table | 🟡 Better than (a), still wrong | Schema hygiene better but still opaque at span level. Migration to a real schema later still required. |
| **(c)** | Full normalized: `trace_bundles` + `spans` tables + FK from `knowledge_sources` | 🟡 Eventually correct | Matches Phoenix / Langfuse / LangSmith exactly. Per-span querying works. But schema complexity is paid up-front and per-span queries are unused in v1. |
| **(d)** | **`trace_bundles` table only** (one row per upload bundle, raw OTLP-JSONL in a `raw_payload` blob), FK from `knowledge_sources` | ✅ **Recommended** | One new table. Bundle-level metadata queryable. Raw payload isolated for cheap migration to (c). Matches the spirit of prior art without paying per-span normalization cost up front. |

## How production platforms actually do this (verified)

| Platform | Trace storage | Dataset linkage |
|---|---|---|
| **Langfuse** ([schema.prisma](https://github.com/langfuse/langfuse/blob/main/packages/shared/prisma/schema.prisma)) | Separate `traces` + `observations` tables. Moved to ClickHouse in v3. | `dataset_items.sourceTraceId` / `sourceObservationId` — soft FK by ID string |
| **Arize Phoenix** ([MIGRATION.md](https://github.com/Arize-ai/phoenix/blob/main/MIGRATION.md), [DeepWiki](https://deepwiki.com/Arize-ai/phoenix/5.3-datasets-and-experiments)) | Separate `spans` + `traces` tables. One row per span; attributes stored as a JSON column (not a full-payload blob). | `dataset_examples.span_rowid` — hard FK |
| **LangSmith** ([dataset schemas blog](https://blog.langchain.com/dataset-schemas/)) | Separate `runs` (traces) and `datasets` | `DatasetExample.source_run_id` |
| **OTel ClickHouse exporter** ([blog post](https://clickhouse.com/blog/storing-traces-and-spans-open-telemetry-in-clickhouse)) | One row per span. `Map(String, String)` for resource and span attributes. | (not a dataset store) |
| **`wperron/sqliteexporter`** ([GitHub](https://github.com/wperron/sqliteexporter)) | Three tables: `spans`, `events`, `links`. Span attributes as JSON string column. Resource metadata inlined. | (not a dataset store) |

**No production platform stores traces in a documents-or-knowledge
table.** Traces are always a separate first-class entity at storage
layer. The "trace → dataset ingredient" join happens at the
application layer, via FK references like `sourceTraceId` /
`span_rowid` / `source_run_id`. Doing anything else would be unique
to vLLora in a way no prior art supports.

## The recommended schema

```sql
CREATE TABLE trace_bundles (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id),
    name          TEXT,
    source_system TEXT,           -- "phoenix" / "langfuse" / "user-upload" / etc.
    uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    span_count    INTEGER,
    model_names   TEXT,           -- JSON array: ["gpt-4o", ...]
    token_total   INTEGER,
    raw_payload   BLOB            -- Full OTLP-JSONL, optionally compressed
);

ALTER TABLE knowledge_sources ADD COLUMN trace_bundle_id TEXT
    REFERENCES trace_bundles(id);
-- kind = "otel-trace"  ⇒  trace_bundle_id IS NOT NULL
-- kind = "document"    ⇒  trace_bundle_id IS NULL
```

**`trace_bundles.raw_payload`** holds the full OTLP-JSONL of all
spans in the bundle. The bundle-level metadata columns
(`span_count`, `model_names`, `token_total`) are populated at upload
time by parsing the payload once. They are queryable without
deserializing the blob.

**`knowledge_sources.trace_bundle_id`** is a nullable FK. For
document sources it's NULL; for trace sources it points at the
matching `trace_bundles` row. The discriminator is `kind` on
`knowledge_sources`, same as today.

## Why this is the right call at our scale

Recapping our scale: 50–500 traces per upload, 10–100 KB per trace as
JSON, ~5–50 MB total per workflow, ~10–50 workflows in v1.

1. **The blob is under 100 KB in most cases.** SQLite's [Internal vs
   External BLOBs benchmark](https://sqlite.org/intern-v-extern-blob.html)
   shows in-DB storage wins under ~100 KB. We're in the right range
   to put `raw_payload` in `trace_bundles` directly without filesystem
   spillover.
2. **Bundle-level queries are fast.** Filtering workflows by
   `model_names`, `span_count`, or `source_system` doesn't touch
   the blob.
3. **`knowledge_sources` page cache stays warm.** Queries against the
   document-shaped table (which all PDFs and any future doc-flavored
   sources hit) don't get pushed out of cache by 50 MB of trace data
   sitting on the same pages.
4. **Migration to (c) is one SQL statement.** When/if we need
   per-span querying:
   ```sql
   INSERT INTO spans (span_id, trace_bundle_id, ...)
   SELECT json_extract(value, '$.spanId'),
          trace_bundles.id,
          ...
   FROM trace_bundles, json_each(trace_bundles.raw_payload);
   ```
   Self-contained within the `trace_bundles` schema boundary.
   Doesn't touch `knowledge_sources`, `topics`, `records`, or any
   pipeline table. Compare to a migration from option (a), which
   would require updating every query that reads `knowledge_sources`
   for trace data.

## Migration path if we need to revisit (option d → option c)

When per-span querying becomes necessary (likely use cases:
"filter training data by spans where `model=X`", "link
`dataset_examples` to specific spans like Phoenix does"), the
migration is:

1. **Add a `spans` table** with columns from the
   [`wperron/sqliteexporter`](https://github.com/wperron/sqliteexporter)
   reference: `span_id`, `trace_bundle_id` (FK), `trace_id`,
   `parent_span_id`, `name`, `kind`, `start_time`, `end_time`,
   `status_code`, `attributes` (TEXT/JSONB), `events` (TEXT/JSONB).
2. **Backfill in one pass** using `json_each()` on
   `trace_bundles.raw_payload`.
3. **Add `dataset_items.span_id` FK** matching the Langfuse
   `sourceObservationId` / Phoenix `span_rowid` pattern.
4. **`trace_bundles.raw_payload` can be nulled out** (archival) or
   retained — either is fine since the data is now denormalized into
   `spans`.

The migration is self-contained within the `trace_bundles` /
`spans` schema boundary and does not require touching any other
pipeline table. **That isolation is exactly why option (d) is worth
adopting now rather than option (a).**

## Sources

- [Langfuse Data Model](https://langfuse.com/docs/observability/data-model)
- [Langfuse Architecture (Handbook)](https://langfuse.com/handbook/product-engineering/architecture)
- [Langfuse `schema.prisma`](https://github.com/langfuse/langfuse/blob/main/packages/shared/prisma/schema.prisma)
- [Langfuse: Remove Prisma traces references (PR #5672)](https://github.com/langfuse/langfuse/pull/5672)
- [Langfuse Database Overview (DeepWiki)](https://deepwiki.com/langfuse/langfuse/3.1-database-overview)
- [Arize Phoenix MIGRATION.md](https://github.com/Arize-ai/phoenix/blob/main/MIGRATION.md)
- [Phoenix Datasets & Experiments (DeepWiki)](https://deepwiki.com/Arize-ai/phoenix/5.3-datasets-and-experiments)
- [Phoenix Persistence (SQLite)](https://docs.arize.com/phoenix/deployment/persistence)
- [LangSmith Dataset Schemas](https://blog.langchain.com/dataset-schemas/)
- [LangSmith Fine-tune on Chat Runs (cookbook)](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb)
- [ClickHouse: Storing OTel Traces and Spans](https://clickhouse.com/blog/storing-traces-and-spans-open-telemetry-in-clickhouse)
- [`wperron/sqliteexporter`: SQLite OTel Exporter](https://github.com/wperron/sqliteexporter)
- [SQLite: Internal vs External BLOBs benchmark](https://sqlite.org/intern-v-extern-blob.html)
- [SQLite JSONB (3.45.0)](https://sqlite.org/forum/forumpost/fa6f64e3dc1a5d97)
- [Lightweight SQLite OTel Collector](https://dev.manishsinha.me/sqlite-otel/)
- [`RedShiftVelocity/sqlite-otel`](https://github.com/RedShiftVelocity/sqlite-otel)

---

# UI tooling: trace visualization

> **Decision (2026-04-08, research-backed):** Use
> **[evilmartians/agent-prism](https://github.com/evilmartians/agent-prism)**
> for the workflow trace bundle viewer. It is a React component
> library purpose-built for visualizing agent execution traces with
> a native OTel adapter, and it matches vLLora UI's tech stack
> (React 19, Tailwind 3, TypeScript, Radix UI) directly.

## What agent-prism is

A **React component library** — not a standalone app, not a CLI.
The flagship `<TraceViewer>` component renders four visualizations
side-by-side from a single OTel trace input:

| View | What it shows |
|---|---|
| **Tree view** | Hierarchical span parent/child structure with collapsed-summary nodes for repetitive sequences and red highlights for errors |
| **Timeline / Gantt** | Execution concurrency, bottlenecks, color-coded status, accumulated cost |
| **Details panel** | Per-span: input/output content, cost, duration, tokens |
| **Sequence diagram** | Step-by-step replay with play/pause for decision chains |

**Stars / activity:** 322 GitHub stars, 376 commits on main, actively
developed by Evil Martians. Alpha release — APIs may change between
versions.

## OTel adapter ships out of the box

Two adapters are provided in `@evilmartians/agent-prism-data`:

- **`openTelemetrySpanAdapter`** — converts OTLP JSON to agent-prism's
  internal schema. Recognizes `gen_ai.*`, `llm.*`, `retrieval.*`
  semantic conventions. **This is the direct path for our
  `trace_bundles.raw_payload`.**
- **`langfuseSpanAdapter`** — converts Langfuse observation format

The data flow at runtime:

```
1. UI fetches GET /trace_bundles/{id} → row + raw_payload blob
2. Pass raw_payload through openTelemetrySpanAdapter:
   convertRawDocumentsToSpans(otlpData)
3. Render <TraceViewer data={[{ traceRecord, spans }]} /> in a tab
```

## Stack compatibility

| Requirement | agent-prism needs | vLLora UI has |
|---|---|---|
| React | 19+ | 19 ✓ |
| Tailwind CSS | 3 | 3.4 ✓ |
| TypeScript | yes | 5.9 ✓ |
| Radix UI | `@radix-ui/react-collapsible`, `@radix-ui/react-tabs` | yes ✓ |
| Vite | compatible | yes ✓ |

Direct match on every dimension. Same tech stack as the existing
shadcn/ui usage.

## Installation model — shadcn-style, not pure npm

```bash
# Copy components into your project (you own the source)
npx degit evilmartians/agent-prism/packages/ui/src/components \
  src/components/agent-prism

# Install the data and types packages from npm
npm install @evilmartians/agent-prism-data @evilmartians/agent-prism-types
```

This is the same pattern vLLora UI already uses for shadcn/ui — the
team is familiar with it. Implications:

1. **You own the component source.** Customizing styling = editing
   the files in your repo, not subclassing or theme overrides.
2. **Tailwind config update needed.** Add `agent-prism/**` to
   `tailwind.config.content` paths or the utility classes won't
   compile.
3. **Theme integration effort.** agent-prism uses CSS variable theme
   tokens that need to merge with vLLora's existing design tokens.
4. **Updates require manual rebase.** When agent-prism ships a new
   version, re-run `npx degit` and reconcile against any local edits.

## Caveats and watchouts

1. **Alpha API stability.** Pin a specific version. Revisit when
   agent-prism reaches 1.0. There's an open issue (#48) about a
   missing filter component, so the feature set is still growing.
2. **License verification.** The README says open source but the
   specific license needs confirmation against the LICENSE file
   before commit.
3. **Per-span filtering** — agent-prism doesn't currently ship a
   filter UI (issue #48). If we need "show me only execute_tool spans
   in this bundle" filtering, we either wait for upstream or build
   it ourselves.

## What this saves us

**Estimated ~1000 LOC of React work** that the team would otherwise
have to write from scratch: timeline / Gantt component, span tree
component, sequence diagram replay, details panel, parent-child
navigation. The existing `OtelTraceSourceViewer.tsx` we built earlier
becomes a thin wrapper around `<TraceViewer>`.

## Sources

- [evilmartians/agent-prism GitHub](https://github.com/evilmartians/agent-prism)
- [AgentPrism Evil Martians blog post](https://evilmartians.com/chronicles/debug-ai-fast-agent-prism-open-source-library-visualize-agent-traces)
- [@evilmartians/agent-prism-data on npm](https://www.npmjs.com/package/@evilmartians/agent-prism-data)

---

# Base model survey for tool-routing fine-tuning

> **Decision (2026-04-08, research-backed):**
> **`Qwen/Qwen3.5-4B`** is the recommended default base model for v1.
> **`Qwen/Qwen3-8B`** is the upgrade tier for complex routing.
> Smaller tiers (`Qwen3.5-2B`, `Qwen3.5-0.8B`) are available for
> tighter VRAM budgets. **Drop "Llama-3.2 or equivalent" from earlier
> drafts** — it scores significantly lower on tool-calling benchmarks
> and uses prompt-engineering-dependent parsing.

## Per-model survey

| Model | License | Tool-calling support | Unsloth GRPO | vLLM parser | BFCL-class | Verdict |
|---|---|---|---|---|---|---|
| **Qwen3.5-4B** ★ | Apache 2.0 | Native, Hermes-style | ✓ (`fast_inference=False`) | `--tool-call-parser qwen3_coder` ([PR #35347](https://github.com/vllm-project/vllm/pull/35347) fixed JSON malformation bug) | Top-tier (Qwen3 series at 70-76 BFCL v3) | **YES — recommended default** |
| **Qwen3-8B** | Apache 2.0 | Native, Hermes-style | ✓ FP8 ~16 GB VRAM | `--tool-call-parser hermes` | Top-tier; "lowest standard deviation across benchmarks" in 12-model comparisons | **YES — upgrade for complex routing** |
| **Qwen3-4B** | Apache 2.0 | Native, Hermes-style | ✓ ~8-10 GB FP8 | Same parser path | Top-tier (small-model class) | **YES — alternative to 3.5-4B** |
| **Qwen3.5-2B / 0.8B** | Apache 2.0 | Native, Hermes-style | ✓ tight VRAM | Same parser path | Smaller-model class | **YES — for VRAM-constrained deployment** |
| Qwen2.5-7B | Apache 2.0 | Hermes-style | ✓ | Same parser path | Lower than Qwen3 series | **NO — superseded by Qwen3+** |
| Llama 3.2 3B Instruct | Llama 3.2 Community License (more restrictive) | JSON-mode, prompt-engineering dependent | ✓ | Less stable parser path | **BFCL v3: 55.7%** | **NO — significantly lower BFCL than Qwen3-class** |
| Llama 3.1 8B Instruct | Llama license | Native | ✓ | parser support exists | BFCL ~76% on llm-stats snapshot (treat with skepticism — old benchmark) | **MAYBE** if Llama-family compat is required |
| Phi-4 mini Instruct (3.8B) | MIT | Native, no special tokens | ✓ ([issue #2682](https://github.com/unslothai/unsloth/issues/2682)) | No confirmed dedicated vLLM parser; uses prompt-format calling | No published BFCL score | **MAYBE** if MIT-only is required |
| Mistral Small 3.2 (24B) | Apache 2.0 | Native, 84.78% function calling accuracy (internal metric) | ✓ but tight | Native parser | Strong | **NO — too big for comfortable GRPO on single H100 (K=8 rollouts get tight)** |
| Gemma 3 4B/9B | Gemma license | Native via 6 special tokens | ✓ | **vLLM parser support unclear** — integration risk | No published BFCL for these sizes | **MAYBE for 9B**, but parser risk |

## Why Qwen3.5-4B specifically

1. **Proven vLLM parser path.** `--tool-call-parser qwen3_coder
   --enable-auto-tool-choice` is mainline vLLM with the JSON
   malformation bug fixed in PR #35347. No prompt engineering, no
   fragile regex parsing.
2. **Proven Unsloth GRPO path.** Documented working configuration:
   set `fast_inference=False` when loading the model. FP8 GRPO
   supported.
3. **Comfortable GPU budget on H100 80GB.** ~8–10 GB for the model
   with Unsloth FP8, leaving headroom for K=8 GRPO rollouts, large
   batch sizes, or scaling G beyond 8.
4. **Apache 2.0 license** — no commercial-use restrictions, no
   Llama-style licensing concerns.
5. **Most complete integration** of any small model in the 1B-7B
   range as of April 2026 — Unsloth + TRL + vLLM all have native
   support.
6. **Already the vLLora default.** This recommendation isn't asking
   the team to adopt something new — it's putting the existing
   default on a documented, evidence-backed footing.

## Cloud handoff fields the local pipeline must include

Based on the model recommendation, the cloud handoff payload should
specify:

```jsonc
{
  "records": "...",                  // JSONL training records
  "grader": "...",                   // grader spec (Stage 4 output)
  "system_prompt": "...",            // rewritten prompt (Stage 5)
  "base_model": "Qwen/Qwen3.5-4B",   // ← default
  "training_config": {
    "tool_call_parser": "qwen3_coder",
    "unsloth_fast_inference": false,
    "use_fp8": true
  }
}
```

The cloud team should pin TRL `transformers >= 5.0` for tool-use
support, and confirm Unsloth's Qwen3.5 chat template fix is in
their environment. These are cloud-side concerns, not local.

## Sources

- [Qwen3.5-4B HuggingFace](https://huggingface.co/Qwen/Qwen3.5-4B)
- [Qwen3-8B HuggingFace](https://huggingface.co/Qwen/Qwen3-8B)
- [Qwen3 Technical Report (arXiv:2505.09388)](https://arxiv.org/html/2505.09388v1)
- [Qwen3 blog](https://qwenlm.github.io/blog/qwen3/)
- [Unsloth Qwen3 blog](https://unsloth.ai/blog/qwen3)
- [Unsloth Qwen3.5 docs](https://unsloth.ai/docs/models/qwen3.5)
- [vLLM PR #35347 — Qwen3.5 tool calling fix](https://github.com/vllm-project/vllm/pull/35347)
- [vLLM issue #19056 — Hermes parser streaming bug](https://github.com/vllm-project/vllm/issues/19056)
- [Berkeley Function Calling Leaderboard V4](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [BFCL v3 leaderboard — llm-stats.com](https://llm-stats.com/benchmarks/bfcl-v3)
- [BFCL v3 leaderboard — pricepertoken.com](https://pricepertoken.com/leaderboards/benchmark/bfcl-v3)
- [Unsloth GRPO for Phi-4 — Issue #2682](https://github.com/unslothai/unsloth/issues/2682)

---

# Training data: where to get a real dataset large enough for GRPO

> **Honest finding (2026-04-08):** **No public OTel-format dataset
> is large enough for real GRPO training.** The Phoenix asset bucket
> maxes out at ~600 KB demo fixtures. The best path forward is
> `lambda/hermes-agent-reasoning-traces` (14,701 trajectories,
> Apache 2.0) with a ~150 LOC converter from ShareGPT format to
> OpenInference Parquet shape.

## Top candidate: `lambda/hermes-agent-reasoning-traces`

- **URL:** [huggingface.co/datasets/lambda/hermes-agent-reasoning-traces](https://huggingface.co/datasets/lambda/hermes-agent-reasoning-traces)
- **Size:** 14,701 rows total (7,646 kimi config + 7,055 glm-5.1
  config), **1.62 GB Parquet**
- **Format:** ShareGPT — `conversations` list of `{from, value}`
  messages with `<think>`, `<tool_call>`, `<tool_response>` blocks.
  Tool schema in `tools` column. **Not OTel/OpenInference — needs
  conversion.**
- **Content:** Real execution traces from Kimi-K2.5 and GLM-5.1
  running the NousResearch Hermes agent framework. Real terminal
  commands, real file edits, real browser navigation. Avg 24 turns
  per trajectory (kimi), 19 turns (glm-5.1). **Total 174,550 tool
  calls.**
- **9 tool categories, 10+ distinct tools:** `terminal_tool`,
  `execute_code`, `file_tools`, `web_tools`, `browser_tool`,
  `delegate_tool`, `mcp_tool`, `todo_tool`, `memory_tool`
- **License:** Apache 2.0
- **Estimated training records after extraction:** ~7,000–14,000
  (well above the 2,000+ ideal target). With 14,701 multi-turn
  trajectories at ~22 turns each and 40-60% surviving quality
  filters, this is the only public dataset that gets us above
  plumbing-test scale.
- **Quality-filtered subset:**
  [`DJLougen/hermes-agent-traces-filtered`](https://huggingface.co/datasets/DJLougen/hermes-agent-traces-filtered)
  (3,679 rows) — useful for faster iteration before processing the
  full set.

## Why every other candidate fails

| Dataset | Why it fails |
|---|---|
| **Phoenix asset bucket fixtures** | All ~600 KB / hundreds of spans — demo-scale, not training-scale |
| **PatronusAI/TRAIL** (148 traces, OTel format) | Too small (148 traces, 1,987 spans). Designed as eval benchmark with annotations — using as training would leak labels |
| **smolagents/codeagent-traces** (98k rows) | No tool_call/tool_response separation; code execution embedded in assistant content. No license. |
| **glaiveai/glaive-function-calling-v2** (113k rows) | Single-function-call conversations (1-2 turns). SFT-flavored, not multi-step agent. No reward variance for GRPO. |
| **hypervariance/function-calling-sharegpt** (87k rows) | Same problem — short 1-2 turn conversations |
| **nebius/SWE-rebench-openhands-trajectories** (67k trajectories) | Only 3 tools (`bash`, `str_replace_editor`, `bash_tools`). Topic distribution degenerate for general agent training. SWE-domain only. |
| **nebius/SWE-agent-trajectories** (80k rows) | Actions embedded as text in shell session format — harder to parse than the OpenHands variant |
| **`xlam-function-calling-60k`** | Function calling but without trajectory structure |

## What the converter looks like

The Hermes dataset uses ShareGPT-style messages with embedded
`<tool_call>` / `<tool_response>` XML-like blocks. Converting to
OpenInference Parquet shape (so `otel_extract.py` can process it)
needs:

1. **Parse each conversation** — extract `<tool_call>` and
   `<tool_response>` blocks from the assistant turns
2. **Build synthetic OTel spans** — one LLM span per assistant
   turn, with `gen_ai.input.messages` / `gen_ai.output.messages`
   populated from the conversation context up to that point. One
   `execute_tool` span per `<tool_call>` block.
3. **Assign trace_id and span_id** — UUID per conversation,
   per-span IDs derived from position
4. **Write to Parquet** in OpenInference column schema (matching the
   Phoenix `agents-toolcalling-tracesv2.parquet` format we already
   tested with)

**Estimated converter size: ~150 LOC of Python.** The Hermes
trajectories are well-structured (validated by NousResearch's
training pipeline), so the conversion is mechanical — no LLM
involvement, no fuzzy parsing.

## Recommended download command

```bash
# Quality-filtered subset (3,679 rows) — recommended for first run
huggingface-cli download DJLougen/hermes-agent-traces-filtered \
  --repo-type dataset \
  --local-dir ./hermes-traces-filtered

# Full kimi config (7,646 rows, ~800 MB) — for production training
huggingface-cli download lambda/hermes-agent-reasoning-traces \
  --repo-type dataset \
  --include "data/kimi-*" \
  --local-dir ./hermes-traces

# Or both configs (14,701 rows, ~1.62 GB)
huggingface-cli download lambda/hermes-agent-reasoning-traces \
  --repo-type dataset \
  --local-dir ./hermes-traces
```

Or in Python:

```python
from datasets import load_dataset

# Quality-filtered subset for fast iteration
ds = load_dataset("DJLougen/hermes-agent-traces-filtered", split="train")

# Full dataset
from datasets import concatenate_datasets
kimi = load_dataset("lambda/hermes-agent-reasoning-traces", "kimi", split="train")
glm  = load_dataset("lambda/hermes-agent-reasoning-traces", "glm-5.1", split="train")
full = concatenate_datasets([kimi, glm])
```

## Fallback paths (if Hermes doesn't work)

1. **Generate synthetic traces** — run smolagents + Phoenix
   instrumentation against the GAIA benchmark (466 questions, gated
   HF access). Produces real OTel traces in Phoenix Parquet format.
   Disadvantage: requires GPU time and produces traces in the
   pattern of *your* agent, not the distribution of production
   behaviors.
2. **Combine all Phoenix demo fixtures** — merge the 13 agent
   fixtures into one dataset. After dedup and quality filtering,
   you might get 1,000-3,000 spans total. Better than the 609-span
   baseline but still borderline. Not recommended as a primary
   strategy.
3. **Capture from a production agent** — instrument an existing
   production agent with OTel tracing for a few weeks, accumulate
   traces, use those. Highest quality but requires both an agent and
   patience.

## Sources

- [lambda/hermes-agent-reasoning-traces](https://huggingface.co/datasets/lambda/hermes-agent-reasoning-traces)
- [DJLougen/hermes-agent-traces-filtered](https://huggingface.co/datasets/DJLougen/hermes-agent-traces-filtered)
- [NousResearch/hermes-agent GitHub](https://github.com/NousResearch/hermes-agent)
- [PatronusAI/TRAIL](https://huggingface.co/datasets/PatronusAI/TRAIL)
- [TRAIL paper (arXiv:2505.08638)](https://arxiv.org/html/2505.08638v1)
- [smolagents/codeagent-traces](https://huggingface.co/datasets/smolagents/codeagent-traces)
- [nebius/SWE-rebench-openhands-trajectories](https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories)
- [nebius/SWE-agent-trajectories](https://huggingface.co/datasets/nebius/SWE-agent-trajectories)
- [glaiveai/glaive-function-calling-v2](https://huggingface.co/datasets/glaiveai/glaive-function-calling-v2)
- [Salesforce/xlam-function-calling-60k](https://huggingface.co/datasets/Salesforce/xlam-function-calling-60k)
- [Trace and Evaluate your Agent with Arize Phoenix (HF Blog)](https://huggingface.co/blog/smolagents-phoenix)

---

# Stages 4–9: Pipeline tooling survey

> **Added 2026-04-08 in a follow-up research pass.** Stages 1–3 are
> covered above; this section covers grader, system prompt rewriting,
> difficulty probe, GRPO training, eval, and deployment. Each stage
> has its own per-library findings and a verdict at the end.

## Stage 4 — Programmatic grader / verifier for tool calls

We need a deterministic verifier: `(predicted_tool_call,
ground_truth_tool_call) → score in [0.02, 1.0]`. Wrong tool name → 0.02
floor. Right tool + correct args → 1.0. Partial arg match →
proportional score. Set-match for parallel tool calls.

### `jsonschema` (Python)

- **URL**: [github.com/python-jsonschema/jsonschema](https://github.com/python-jsonschema/jsonschema)
- **What it does**: validates a JSON object against a JSON Schema draft
  spec. `validate()` raises `ValidationError`; `iter_errors()`
  enumerates all violations. Gives binary "valid / invalid" per
  argument key.
- **What it does NOT do**: no notion of "fraction of args correct" —
  the partial-credit arithmetic is custom. No tool-name matching, no
  parallel-call set-matching, no 0.02 floor.
- **License**: Apache 2.0
- **Maturity**: 4k+ stars, ubiquitous Python dep
- **Verdict**: **PARTIALLY USEFUL.** Use for arg schema validation
  inside the grader. Saves ~30 LOC of type-checking code.

### BFCL / `bfcl-eval`

- **URL**: [github.com/ShishirPatil/gorilla](https://github.com/ShishirPatil/gorilla/blob/main/berkeley-function-call-leaderboard/README.md), [pypi.org/project/bfcl-eval](https://pypi.org/project/bfcl-eval/)
- **What it does**: AST substring matching between predicted and GT
  function calls. Scores parallel calls as a set. Handles Python,
  Java, SQL, REST. V4 adds agentic multi-step evaluation.
- **What it does NOT do**: tightly coupled to BFCL's fixed 2000-function
  dataset and its own tool schema format. No `from bfcl import
  ToolCallMatcher` public API. Custom tools require `BFCL_PROJECT_ROOT`
  env var. Parallel-call set-matching logic is embedded in
  `checker/ast_checker.py` with BFCL-specific branching.
- **License**: Apache 2.0
- **Verdict**: **PARTIALLY USEFUL.** **Port** the parallel-set-match
  logic (~80 LOC from `checker/ast_checker.py`), don't import as a
  runtime dep. The AST substring matching idea is directly applicable.

### DeepEval `ToolCorrectnessMetric` + `ArgumentCorrectnessMetric`

- **URL**: [github.com/confident-ai/deepeval](https://github.com/confident-ai/deepeval), [deepeval.com/docs/metrics-tool-correctness](https://deepeval.com/docs/metrics-tool-correctness)
- **What it does**: `ToolCorrectnessMetric` is deterministic — score =
  (correctly used tools) / (total tools called). Supports
  `should_consider_ordering`, `should_exact_match`, and
  `evaluation_params=[ToolCallParams.INPUT_PARAMETERS]`. Can produce
  partial credit at the **per-call** level (not per-argument within a
  call).
- **What it does NOT do**: per-arg partial credit within a single call.
  No 0.02 floor for wrong tool name (returns 0). `ArgumentCorrectnessMetric`
  uses an LLM judge — non-deterministic and adds per-sample latency,
  unsuitable as the live GRPO reward function.
- **License**: Apache 2.0
- **Maturity**: ~7k stars
- **Verdict**: **PARTIALLY USEFUL** for Stage 8 offline eval (cross-check
  scorer). **NOT FIT** as the live GRPO reward function in Stage 7.

### TRL `RewardConfig`

- **URL**: [huggingface.co/docs/trl/main/grpo_trainer](https://huggingface.co/docs/trl/main/grpo_trainer)
- **What it does**: TRL ships **no** tool-call grader. `GRPOConfig`
  accepts a `reward_funcs` parameter for user-supplied callables. This
  is the hook for plugging your custom grader in.
- **Verdict**: **NOT FIT** as a grader. Use it as the integration point
  for the custom grader.

### τ-bench evaluation code

- Grades by comparing final database state against annotated goal
  state. Black-box task-completion metric, not a per-tool-call
  partial-credit function.
- **Verdict**: **NOT FIT** for Stage 4. Relevant only in Stage 8.

### Stage 4 best stack

- `jsonschema` for arg type validation
- Ported BFCL set-match logic (~80 LOC)
- Custom: tool-name match → branch (wrong = 0.02 floor), per-arg
  partial credit ratio, parallel call set scoring wrapper

**Total grader: ~240 LOC, ~110 LOC reused/ported, ~130 LOC custom.**
Net build vs. reuse: ~55% custom, ~45% reused.

---

## Stage 5 — System prompt rewriting / canonicalization

We need a one-shot rewrite of the demonstrator's system prompt: drop
dynamic context (dates, user IDs), drop demo-only capability claims,
fit student context budget, normalize tool catalog formatting.

### Anthropic Prompt Improver

- **URL**: [docs.anthropic.com/en/api/prompt-tools-improve](https://docs.anthropic.com/en/api/prompt-tools-improve)
- **What it does**: rewrites prompts via XML standardization, example
  enrichment with CoT, structural rewriting. Available as REST endpoint
  `POST /api/v0/prompt_tools/improve`.
- **What it does NOT do**: optimizes for **Claude**, not Qwen. Adds
  XML-heavy structure that's counterproductive for the student. Not
  callable as a Python library; requires Anthropic API key. **Does not
  reduce context length or drop capability claims.**
- **Verdict**: **NOT FIT.** Wrong optimization target.

### DSPy `MIPROv2` / `BootstrapFinetune`

- **URL**: [dspy.ai/learn/optimization/optimizers](https://dspy.ai/learn/optimization/optimizers/), [github.com/stanfordnlp/dspy](https://github.com/stanfordnlp/dspy)
- **What it does**: `MIPROv2` iteratively rewrites and samples
  instructions, using bootstrapped traces to propose better instruction
  text. `BootstrapFinetune` distills a prompt-based program into weight
  updates.
- **What it does NOT do**: requires a training set with labels to
  evaluate candidate prompts — can't run on a single system prompt
  without an eval loop. High setup cost for one-shot rewrite.
- **License**: MIT
- **Maturity**: 23k+ stars
- **Verdict**: **NOT FIT** for one-shot use. Useful later if we want
  automated prompt search over a dev set.

### `jinja2` / `mako` template engines

- **What they do**: text templating with variables, filters, loops.
  Useful for the **formatting** side — constructing the tool catalog
  section of the prompt from a structured tool-definition dict.
- **What they don't do**: no semantic rewriting; can't drop capability
  claims or summarize.
- **Verdict**: **PARTIALLY USEFUL** for the mechanical formatting step
  (tool catalog → consistent YAML/JSON block).

### Langfuse prompt management

- **URL**: [langfuse.com/docs/prompt-management/overview](https://langfuse.com/docs/prompt-management/overview)
- **What it does**: versioned prompt storage, A/B labels, SDK-level
  `get_prompt()` with caching.
- **What it does NOT do**: no rewriting capability — registry, not
  transformer.
- **Verdict**: **NOT FIT** for rewriting. Useful later for storing the
  canonicalized prompt with version history.

### Stage 5 best stack

- **One LLM call** with a purpose-written meta-prompt targeting Qwen's
  instruction format (use Claude Haiku or GPT-4o-mini for cost) — ~20
  LOC wrapping the SDK
- **`jinja2`** for tool catalog formatting

**Total: ~100 LOC.** Net build vs. reuse: ~80% custom logic, ~20%
jinja2 template rendering.

---

## Stage 6 — Pre-training probe (K-rollout difficulty distribution)

Run the untrained base model with K=8 rollouts on each record, score
each rollout with the grader, bucket records as trivial / learnable /
impossible.

### vLLM offline inference

- **URL**: [docs.vllm.ai/en/latest/serving/offline_inference](https://docs.vllm.ai/en/latest/serving/offline_inference/)
- **What it does**: `LLM.generate(prompts, SamplingParams(n=8,
  temperature=0.9))` runs exactly K=8 rollouts per prompt in a single
  batched call. Returns `RequestOutput` with `outputs[0..7]` — each
  has `.text` and `.token_ids`. Precisely the API the probe needs.
- **Caveat**: vLLM must be installed separately from the training
  environment (GPU dependency conflict with the Unsloth training
  container). Run probe before training, then deallocate before
  spinning up the trainer. Sequential on a single GPU; two jobs on
  cloud.
- **License**: Apache 2.0
- **Maturity**: 43k+ stars, in production at vLLora
- **Verdict**: **USE.** This is the right tool. Already in production.

### `lm-evaluation-harness` (EleutherAI)

- **What it does**: evaluates models on 60+ fixed academic benchmarks
  with automatic batching.
- **What it does NOT do**: no K-sample probing API. `generate_until`
  task type calls the model once per sample. Multi-sample sampling is
  not configurable. No bucketing logic.
- **Verdict**: **NOT FIT** for difficulty probing.

### TRL `GRPOTrainer` dry-run mode

- **What it does**: nothing — TRL has no "probe" or "dry run" mode.
  Loading the full trainer machinery (LoRA init, optimizer, ref model)
  is wasteful for probing.
- **Verdict**: **NOT FIT.** Use vLLM directly.

### `inspect-ai` (UK AISI)

- **URL**: [github.com/UKGovernmentBEIS/inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai)
- **What it does**: flexible eval framework. `@task` definitions with
  custom solvers and scorers. Supports multi-sample trials via
  `epochs` parameter. `AgentBridge` for plugging in external agents.
- **Caveat**: `epochs` repeats the full task N times rather than
  producing K candidates per prompt within one call. No native "sample
  K, compute variance" API. Overhead is significant for a pure probe.
- **Verdict**: **PARTIALLY USEFUL** for Stage 8 eval; overkill for
  Stage 6 probe.

### Stage 6 best stack

- **vLLM `LLM.generate(n=8)`** — direct, fast, already in production
- **Custom bucketing** (~40 LOC): trivial = all 8 scores ≥ 0.9;
  impossible = all 8 ≤ 0.1; learnable = anything in between

Net build vs. reuse: ~20% vLLM wrapper, ~80% custom bucketing +
orchestration.

---

## Stage 7 — GRPO training (handled by cloud server, not our code)

> **Scope note:** **Stage 7 is owned by the cloud server (LangDB
> Cloud), not the local v1 pipeline.** Our local pipeline produces
> the artifacts the cloud needs (records, grader, rewritten system
> prompt, base model choice), uploads them via the existing
> finetune API, and the cloud runs training. The library survey
> below is **informational reference only** — it describes what the
> cloud team is most likely using, so we know what their constraints
> are and what handoff format they expect. **None of the code in
> this section is something the local pipeline implements.**

### What the local pipeline owes the cloud

The cloud needs:

1. **Training records** as JSONL — one full conversation per line
   per the OpenAI fine-tuning format (see Stage 3 in the concept
   doc). Includes `messages` array, `tools` array, optional
   `tool_choice`. **All records share the same `tools` array** (the
   v1 consistency rule).
2. **Grader** as a programmatic function or schema-based config
   that takes `(predicted_tool_call, ground_truth_tool_call) →
   score in [0.02, 1.0]`. Format depends on what the cloud team
   accepts: a Python callable shipped as a file, or a declarative
   spec (preferred — easier to validate at the cloud boundary).
3. **System prompt** — the one rewritten prompt the local pipeline
   produced in Stage 5, applied identically to every record.
4. **Base model choice** — Qwen 2B/4B / Llama-3.2 / etc., per
   workflow.
5. **Difficulty probe results** (optional but recommended) — if the
   local probe (Stage 6) ran and the bucket distribution looks
   trainable, ship the probe report so the cloud doesn't re-do the
   work or proceed when it shouldn't.

The handoff format itself should be specified in a separate doc
(`docs/workflow-skill-first-approach/cloud-finetune-handoff.md`,
TBD).

### Reference: what the cloud most likely uses internally

The following library notes are **for context only**. The cloud team
chooses these; the local pipeline doesn't import them.

### TRL `GRPOTrainer` (HuggingFace)

- **URL**: [huggingface.co/docs/trl/main/grpo_trainer](https://huggingface.co/docs/trl/main/grpo_trainer)
- **What it does**: implements GRPO with configurable loss types
  (`dr_grpo`, `dapo`, `grpo`, `bnpo`, `cispo`, `sapo`, `luspo`,
  `vespo`). Online generation via vLLM backend, advantage estimation,
  clipping, logging. Our production stack.
- **Known issues** (each verified against the TRL issue tracker):
  - **#5366** — GRPOTrainer with Qwen tool-calling format does not
    generate tool calls during training unless `transformers >= 5.0`
    AND the system prompt explicitly gates tool use. Workarounds: use
    hermes-style tool tags in system prompt; avoid `try/except` in
    reward function.
  - **#4543** — multi-step agent training loses per-step prefixes
    when using vLLM server mode; importance sampling computes against
    the wrong behavior policy. Affects our trajectory-exploded
    records.
  - **#3881** — model deterioration with `accelerate` multi-GPU.
    Fixed in later releases but requires `unsloth_train()` instead
    of native `train()`.
  - **#3520** — BOS token bug, affects Gemma-family. Qwen unaffected.
- **License**: Apache 2.0
- **Maturity**: 12k+ stars
- **Verdict**: **USE** (already in production). Pin `transformers >=
  5.0`. Use `unsloth_train()` instead of native `train()`. Investigate
  #4543 before relying on multi-step trajectory training.

### Unsloth

- **URL**: [github.com/unslothai/unsloth](https://github.com/unslothai/unsloth), [unsloth.ai/docs/get-started/reinforcement-learning-rl-guide](https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide)
- **What it adds over TRL**: 90% VRAM reduction via optimized attention
  kernels, gradient checkpointing, custom triton kernels.
  `unsloth_train()` fixes the gradient accumulation normalization bug
  in vanilla TRL. FP8 GRPO support (1.4× faster, 60% less VRAM).
  Long-context GRPO up to 380K tokens. Supports `dr_grpo`, `dapo`,
  `bnpo` loss types natively.
- **Caveat**: Unsloth's tool-calling improvements (30-80% claimed in
  changelog) are at **inference time** (Studio), not in the GRPO
  training loop. The TRL #5366 training-loop issues still apply.
- **License**: Apache 2.0
- **Maturity**: 28k+ stars
- **Verdict**: **USE** (already in production). TRL + Unsloth is the
  right stack.

### Axolotl

- **URL**: [docs.axolotl.ai/docs/grpo.html](https://docs.axolotl.ai/docs/grpo.html)
- **What it does**: configuration-driven fine-tuning with YAML configs.
  Added GRPO support Feb 2025. vLLM as generation backend.
- **Caveat**: config-driven design makes injecting custom reward
  functions harder than writing Python directly against TRL. No
  specific tool-call training improvements over raw TRL.
- **Verdict**: **NOT FIT** as a replacement. Possibly useful as a
  reference for vLLM-accelerated rollout config.

### OpenRLHF

- **URL**: [github.com/OpenRLHF/OpenRLHF](https://github.com/OpenRLHF/OpenRLHF), [arxiv.org/html/2501.03262v4](https://arxiv.org/html/2501.03262v4)
- **What it does**: Ray-based distributed GRPO/PPO. 3.1× faster than
  TRL on 1-epoch GSM8K benchmark. Multi-node large-model training.
- **Caveat**: overkill for Qwen 2B/4B on a single or few GPUs. Ray
  cluster overhead negates the speedup at small scale. No Unsloth VRAM
  optimization integration.
- **Verdict**: **NOT FIT** for our scale. Revisit if scaling to 70B+.

### verl

- **URL**: [github.com/verl-project/verl](https://github.com/verl-project/verl)
- **What it does**: single-controller Ray actor managing GRPO, PPO,
  DAPO, DrGRPO. Scales to 671B with expert parallelism. FSDP +
  DeepSpeed + Megatron backends.
- **Caveat**: built for multi-node scale, minimum useful size ~30B+.
  Documentation targets A100/H100 clusters.
- **Verdict**: **NOT FIT** for our scale.

### NeMo RL

- **URL**: [docs.nvidia.com/nemo/rl/latest/guides/grpo-deepscaler.html](https://docs.nvidia.com/nemo/rl/latest/guides/grpo-deepscaler.html)
- **Status note**: NeMo-Aligner is **deprecated as of May 2025**.
  Successor NeMo RL supports GRPO with Qwen 2.5 up to 32B. Built on
  Ray + Megatron Core.
- **Caveat**: heavy NVIDIA-stack dependency (NeMo Core, Megatron). Not
  compatible with Unsloth or LoRA-based training. Massive overkill for
  Qwen 2B/4B on a single GPU.
- **Verdict**: **NOT FIT** for our stack.

### Stage 7 best stack — for our local pipeline

**Nothing.** Stage 7 is owned by the cloud server. Our pipeline's
job is to produce a clean handoff — records + grader + rewritten
system prompt + base model choice — and upload them via the existing
finetune API. The cloud team owns the trainer choice, the
TRL/Unsloth pin, the multi-step trajectory issue (#4543), and
everything else under "Reference: what the cloud most likely uses
internally."

**The only Stage 7 concern that survives on our side** is the
handoff format spec: what shape do records take, what shape does
the grader take, what metadata does the cloud need. This is a
separate doc (`cloud-finetune-handoff.md`, TBD).

If the cloud team asks "what should we use," the survey above is
the answer: TRL `GRPOTrainer` + Unsloth + `transformers >= 5.0` +
`unsloth_train()` instead of native `train()`. But that's their
call, not ours.

---

## Stage 8 — Eval framework (held-out paraphrases / held-out tasks)

Evaluate the trained model on held-out customer phrasings and tasks
the model has never seen.

### BFCL / `bfcl-eval`

- **What it does**: evaluates tool-call accuracy on a fixed
  2000-function dataset across simple, multiple, parallel, nested, and
  irrelevance categories. V4 adds multi-turn agentic eval.
- **Caveat**: does NOT support custom tool definitions without
  rewriting BFCL's internal schema and `eval_runner.py`. No documented
  "bring your own tools" API.
- **Verdict**: **PARTIALLY USEFUL** for benchmarking overall
  function-calling quality post-training. **Not directly usable** for
  domain-specific (shopping agent) eval without significant forking.

### τ-bench

- **URL**: [github.com/sierra-research/tau-bench](https://github.com/sierra-research/tau-bench), [github.com/sierra-research/tau2-bench](https://github.com/sierra-research/tau2-bench), [arxiv.org/abs/2406.12045](https://arxiv.org/abs/2406.12045)
- **What it does**: evaluates tool-using agents on multi-turn
  conversations with a simulated user. Grades by final database state
  vs. goal state. Measures pass^k. Modular codebase.
- **Caveat**: only **retail + airline domains** shipped OOTB. "Easy to
  add new domains" per readme, but in practice requires writing a full
  policy document, task database, and simulated-user prompt — roughly
  **2-4 days of domain engineering** for the shopping agent.
  τ²-Bench (2025) adds dual-control scenarios.
- **Verdict**: **PARTIALLY USEFUL.** The evaluation harness is
  reusable. Running it on a custom shopping agent requires the
  domain-definition effort.

### `inspect-ai` (UK AISI)

- **URL**: [github.com/UKGovernmentBEIS/inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai), [inspect.aisi.org.uk/agent-custom.html](https://inspect.aisi.org.uk/agent-custom.html)
- **What it does**: composable eval framework with `@task`, `@solver`,
  `@scorer` decorators. Multi-sample `epochs`, tool calling via
  `use_tools()`, `AgentBridge` for external agents (OpenAI SDK,
  LangChain, PydanticAI). BFCL plugin via `inspect_evals`.
- **Caveat**: BFCL integration uses the same fixed dataset. Wrapping
  our agent as an `inspect-ai` `Agent` adds 50-100 LOC of adapter.
- **License**: MIT
- **Maturity**: 3k+ stars, v0.3.130
- **Verdict**: **PARTIALLY USEFUL** as an eval harness. Best use: wrap
  vLLM-served fine-tuned model as an inspect-ai solver, run held-out
  paraphrase tasks, use `ToolCorrectnessMetric`-style scorer.

### `lm-evaluation-harness`

- No agent eval or tool-call accuracy metrics.
- **Verdict**: **NOT FIT** for Stage 8.

### DeepEval `ToolCorrectnessMetric` (offline use)

- Deterministic, partial credit per tool call. Skip
  `ArgumentCorrectnessMetric` to avoid the LLM judge.
- **Verdict**: **PARTIALLY USEFUL** as a scorer inside any eval
  harness.

### LLM-as-judge paraphrase eval (fallback)

- Generate paraphrases of training prompts using GPT-4o-mini, run the
  fine-tuned model, score with the Stage 4 grader. No new library
  needed beyond the vLLM offline inference from Stage 6.
- **Verdict**: This is the **pragmatic v1 path** for domain-specific
  eval until a τ-bench domain is written.

### Stage 8 best stack

- **Custom eval loop** (vLLM offline inference + Stage 4 grader) for
  paraphrase eval — pragmatic v1
- **`inspect-ai` + τ-bench domain definition** for task-level eval —
  v2 when domain engineering effort is justified
- **DeepEval `ToolCorrectnessMetric`** as a cross-check scorer

Net build vs. reuse: ~50% reuse (`inspect-ai` harness, deepeval
scorer), ~50% custom (τ-bench domain definition, paraphrase generation,
result aggregation).

---

## Stage 9 — Deployment (deferred)

> **Scope note:** **Stage 9 is deferred for v1.** The existing
> vLLora gateway already serves vLLM-based inference for the
> production stack, so deployment is not blocking the trace
> finetune pipeline. We'll revisit Stage 9 when:
>
> 1. The local pipeline (Stages 1–6, 8) is producing artifacts that
>    the cloud has trained on at least once
> 2. There is a fine-tuned LoRA adapter to actually serve
> 3. The handoff between cloud-trained adapter and the local
>    deployment endpoint becomes a real question
>
> The library survey below is **informational reference only** —
> kept so when we get to Stage 9, the landscape is already mapped.
> **None of this is in v1 scope.**

### vLLM

- **URL**: [docs.vllm.ai/en/latest/features/tool_calling](https://docs.vllm.ai/en/latest/features/tool_calling/)
- **What it does**: serves models with `--enable-auto-tool-choice
  --tool-call-parser hermes` for Qwen tool calling. The `hermes`
  parser extracts `<tool_call>` tags from Qwen2.5/Qwen3 output and
  returns structured `tool_calls` arrays in OpenAI response format.
  Supports LoRA adapter hot-loading via `--enable-lora`.
- **Known issue**: Qwen2.5-**Coder** models don't follow hermes
  format ([#29192](https://github.com/vllm-project/vllm/issues/29192))
  — they output JSON code blocks. Standard Qwen2.5/Qwen3 **Instruct**
  models work. Fine-tuned models that alter the tool-call token
  pattern may break the parser.
- **License**: Apache 2.0
- **Maturity**: 43k+ stars, in production
- **Verdict**: **USE** (already in production). Required flags:
  `--enable-auto-tool-choice --tool-call-parser hermes`. For LoRA
  fine-tune: add `--enable-lora --lora-modules
  ft-adapter=/path/to/lora`.

### SGLang

- **URL**: [github.com/sgl-project/sglang](https://github.com/sgl-project/sglang), [docs.sglang.io/advanced_features/structured_outputs.html](https://docs.sglang.io/advanced_features/structured_outputs.html)
- **What it does**: RadixAttention for KV cache reuse (faster
  multi-turn), compressed FSM for structured-output decoding with
  near-zero overhead. OpenAI-compatible API. Tool calling via
  constrained decoding with JSON schema.
- **Advantage over vLLM**: structured output (JSON-schema-constrained
  generation) at up to **4× higher throughput** for short-output tasks.
  For tool calls with a known JSON schema, SGLang's FSM constrained
  decoding can guarantee valid JSON and eliminate parser fragility.
- **Caveat**: smaller community than vLLM; Qwen3 hermes-tag-based
  parsing path is less battle-tested.
- **Verdict**: **PARTIALLY USEFUL.** Worth benchmarking for throughput
  on the tool-call workload. Consider as a production swap if vLLM
  throughput is insufficient.

### TGI (HuggingFace text-generation-inference)

- Tool calling via grammar-based constrained generation. **No Unsloth
  LoRA adapter loading support.** Less active community for
  Qwen-specific issues than vLLM.
- **Verdict**: **NOT FIT** for our stack (Unsloth LoRA, Qwen-specific).

### Ollama

- Local CPU/GPU serving. No production scalability, no multi-GPU, no
  LoRA hot-loading.
- **Verdict**: **NOT FIT** for production. Useful for local dev only.

### llama.cpp server

- CPU-focused. No batched serving. Tool-calling support is
  experimental (GGUF quantized models only).
- **Verdict**: **NOT FIT** for production.

### Managed platforms (HF Inference Endpoints, Modal, Together, Fireworks)

- Together AI and Fireworks support OpenAI-compatible tool calling
  with fine-tuned model uploads. HF Endpoints support custom Docker
  containers (you can ship your vLLM container).
- **Caveat**: vendor lock-in, egress costs. **Fine-tuned LoRA adapter
  serving on managed platforms requires merging the LoRA weights into
  the base model first** (no hot-loading).
- **Verdict**: **PARTIALLY USEFUL** as fallback if vLLora gateway is
  not self-hosted.

### Stage 9 best stack — deferred

**Out of scope for v1.** When we get to Stage 9, the most likely
answer is `vLLM --tool-call-parser hermes` + LoRA merge-or-load via
the existing vLLora gateway. ~50 LOC of deployment config and
gateway routing. But that's a v1.5+ decision, not now.

---

## Sources (Stages 4–9)

### Tool-call grader / verifier
- [python-jsonschema GitHub](https://github.com/python-jsonschema/jsonschema)
- [Berkeley BFCL GitHub](https://github.com/ShishirPatil/gorilla/blob/main/berkeley-function-call-leaderboard/README.md)
- [bfcl-eval on PyPI](https://pypi.org/project/bfcl-eval/)
- [DeepEval GitHub](https://github.com/confident-ai/deepeval)
- [DeepEval Tool Correctness docs](https://deepeval.com/docs/metrics-tool-correctness)
- [DeepEval Argument Correctness docs](https://deepeval.com/docs/metrics-argument-correctness)

### System prompt rewriting
- [Anthropic prompt improver API](https://docs.anthropic.com/en/api/prompt-tools-improve)
- [DSPy optimizers](https://dspy.ai/learn/optimization/optimizers/)
- [DSPy GitHub](https://github.com/stanfordnlp/dspy)
- [Langfuse prompt management](https://langfuse.com/docs/prompt-management/overview)

### Difficulty probe
- [vLLM offline inference docs](https://docs.vllm.ai/en/latest/serving/offline_inference/)
- [vLLM GitHub](https://github.com/vllm-project/vllm)
- [inspect-ai GitHub](https://github.com/UKGovernmentBEIS/inspect_ai)

### GRPO training
- [TRL GRPOTrainer docs](https://huggingface.co/docs/trl/main/grpo_trainer)
- [TRL issue #5366 — GRPO with tool use](https://github.com/huggingface/trl/issues/5366)
- [TRL issue #4543 — multi-step agent training](https://github.com/huggingface/trl/issues/4543)
- [TRL issue #3881 — model deterioration with accelerate](https://github.com/huggingface/trl/issues/3881)
- [TRL issue #3520 — BOS token garbage output](https://github.com/huggingface/trl/issues/3520)
- [Unsloth RL guide](https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide)
- [Unsloth GitHub](https://github.com/unslothai/unsloth)
- [Axolotl GRPO docs](https://docs.axolotl.ai/docs/grpo.html)
- [OpenRLHF arXiv](https://arxiv.org/html/2501.03262v4)
- [verl GitHub](https://github.com/verl-project/verl)
- [NeMo RL GRPO guide](https://docs.nvidia.com/nemo/rl/latest/guides/grpo-deepscaler.html)
- [Anyscale open-source RL libraries comparison](https://www.anyscale.com/blog/open-source-rl-libraries-for-llms)

### Eval frameworks
- [BFCL on inspect_evals](https://ukgovernmentbeis.github.io/inspect_evals/evals/assistants/bfcl/)
- [τ-bench GitHub](https://github.com/sierra-research/tau-bench)
- [τ²-bench GitHub](https://github.com/sierra-research/tau2-bench)
- [τ-bench arXiv](https://arxiv.org/abs/2406.12045)
- [inspect-ai custom agents docs](https://inspect.aisi.org.uk/agent-custom.html)

### Deployment
- [vLLM tool calling docs](https://docs.vllm.ai/en/latest/features/tool_calling/)
- [vLLM issue #29192 — Qwen2.5-Coder parser failure](https://github.com/vllm-project/vllm/issues/29192)
- [SGLang GitHub](https://github.com/sgl-project/sglang)
- [SGLang structured outputs docs](https://docs.sglang.io/advanced_features/structured_outputs.html)
- [Qwen function calling docs](https://qwen.readthedocs.io/en/latest/framework/function_call.html)
