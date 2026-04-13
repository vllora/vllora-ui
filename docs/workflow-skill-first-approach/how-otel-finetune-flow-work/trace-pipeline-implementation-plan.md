# Trace Pipeline — Implementation Plan & Status

> **Status:** Live implementation tracker (2026-04-08). Updated as work
> progresses. This is a context-preservation doc for compaction-resistant
> continuation of the trace-skill implementation.

## Current state (what's done)

### Design phase (complete)

All design decisions locked and documented in these companion docs:

| Doc | Purpose |
|---|---|
| `otel-traces-as-finetune-input.md` | Concept doc — 8-stage pipeline, patterns A/B/C/D, hyperparameter deltas, eval metrics |
| `otel-extractor-tooling-survey.md` | Tooling decisions — storage, UI library (agent-prism), base model (Qwen3.5-4B), dataset (Hermes), stages 4–9 library survey |
| `trace-grader-reference.md` | Grader formula (ToolRL Jaccard) with edge cases and pytest spec |
| `trace-pipeline-isolation.md` | Engineering contract — two-skills split, file ownership, PR checklist |
| `trace-pipeline-testing.md` | Five-level testing ladder, pass criteria, CI vs cloud split |

**Key decisions already made (do not re-litigate):**

1. **Two skills, not one.** `finetune-skill-otel/` is parallel to `finetune-skill/`. Zero shared pipeline code. Shared: UI, gateway, storage, cloud handoff, training JSONL format.
2. **Storage: separate `trace_bundles` table** with FK from `knowledge_sources` (nullable `trace_bundle_id` column). Verified against Langfuse / Phoenix / LangSmith prior art.
3. **UI: agent-prism** (evilmartians/agent-prism) for the trace viewer. Shadcn-style install. Native OTel adapter already ships.
4. **Base model: Qwen3.5-4B** default. Qwen3-8B upgrade tier. Drop Llama-3.2.
5. **Dataset: `lambda/hermes-agent-reasoning-traces`** (14.7k trajectories) for large-scale training — needs ~150 LOC ShareGPT→OpenInference converter.
6. **Grader: ToolRL Jaccard** with `0.02` wrong-tool floor. Deterministic Python, no LLM judge. Formula in `trace-grader-reference.md`.
7. **Stage 7 (training) runs on existing LangDB Cloud** — no cloud changes needed. Local pipeline produces records + grader + config in the format the cloud already accepts (same shape as PDF skill handoff).
8. **Stage 9 (deployment) deferred for v1.** Existing vLLora gateway handles inference.
9. **Sub-agents: zero in v1.** Trace pipeline is mechanical extraction; doesn't need the PDF skill's LLM-heavy sub-agent pattern.
10. **Pattern B (error recovery) handled implicitly.** Skip failed LLM spans; successful recovery spans' `input_messages` already include the failed attempt as context → they ARE the SCoRe correction records. No special case needed.

### Track C (OTel skill) — implementation in progress

```
finetune-skill-otel/
├── SKILL.md                              ✓ written
├── scripts/
│   ├── openinference_to_semconv.py       ✓ IMPLEMENTED + fixed (preserves status_code for error-recovery detection)
│   ├── otel_extract.py                   ✓ copied (existing)
│   ├── otel_distill.py                   ✓ IMPLEMENTED + TESTED (29 tests passing, 345 LOC)
│   ├── trace_grader.py                   ✓ IMPLEMENTED + TESTED (31 tests passing, 245 LOC)
│   ├── trace_topics.py                   ✓ IMPLEMENTED (two-level: agent identity → tool-call pattern)
│   ├── trace_grader_builder.py           🟡 stub
│   ├── system_prompt_rewriter.py         🟡 stub
│   ├── trace_probe_gates.py              🟡 stub
│   ├── trace_hparams.py                  🟡 stub
│   ├── analyze_eval_trace.py             🟡 stub
│   └── finetune-otel.py                  🟡 stub
├── reference/
│   ├── otel-trace-ingestion.md           ✓ copied
│   └── trace-grader-reference.md         ✓ copied
├── tests/
│   ├── unit/
│   │   ├── test_trace_grader.py          ✓ 31 tests passing
│   │   └── test_otel_distill.py          ✓ 29 tests passing
│   ├── integration/                      (empty)
│   ├── golden/                           (empty)
│   └── fixtures/                         (empty)
└── subagents/                            (intentionally empty)

Total so far: 60 tests passing in 40ms.
```

### Track A (Gateway / BE) — not started

Needs (in the `../gateway/` repo, separate from this one):
- Migration adding `trace_bundles` table + nullable `knowledge_sources.trace_bundle_id` column
- `POST /trace_bundles` endpoint
- `GET /trace_bundles/{id}` endpoint
- Extend `POST /knowledge-sources` to accept `kind="otel-trace"`

### Track B (UI) — not started

Needs (in `vllora/ui/src/`):
- Install agent-prism via `npx degit evilmartians/agent-prism/packages/ui/src/components src/components/agent-prism`
- Install npm packages: `@evilmartians/agent-prism-data`, `@evilmartians/agent-prism-types`
- Update `tailwind.config.js` to add `agent-prism/**` to `content` paths
- Create `src/components/datasets/sources-view/OtelTraceSourceViewer.tsx` as a thin wrapper around `<TraceViewer>`
- Wire into `KnowledgeSourceRenderer` to dispatch on `content_metadata.kind === "otel-trace"`

---

## Implementation plan — next actions (ordered)

### Track C continuation (in priority order)

1. **`trace_topics.py`** ✅ DONE — two-level hierarchy: Level 0 = agent identity (from first sentence of system prompt), Level 1 = tool-call pattern. Per-trace tool schemas (multi-agent safe). Per-record `tools` array uses only tools actually called. 100% record→topic assignment on Nemotron 3k-trace dataset (was 0.03% with old flat approach).

2. **`trace_grader_builder.py`** (~40 LOC) — takes a tool schema + the `trace_grader` module and produces a JSON config the cloud can use to instantiate the same grader server-side. Output: `grader.json` with `type="programmatic_tool_call"`, tool schema embedded, formula version string.

3. **`trace_probe_gates.py`** (~100 LOC) — implements the 4 Stage 6 gates:
   - `learnable_frac ≥ 25%` (relaxed from PDF's 30%)
   - `trivial_wrong_frac ≤ 10%`
   - No single tool > 70% trivial
   - `refusal_frac ≥ 10%` (if refusal is in schema)
   Uses `trace_grader.grade()` to score rollout buckets. For now, operates on mock K=8 rollout distributions; actual vLLM integration is deferred.

4. **`system_prompt_rewriter.py`** (~80 LOC) — Stage 5 one-shot rewrite. Extract demonstrator's system prompt from LLM spans, rewrite for student model (drop dynamic context, strip demo-only capability claims, shorten to student context budget, add student-model tool-call syntax). Can be implemented as an LLM API call (Claude Haiku or GPT-4o-mini) with a purpose-written meta-prompt.

5. **`trace_hparams.py`** (~30 LOC) — produces the hyperparameter delta config from Stage 7:
   - Temperature 0.9 → 1.0
   - max_output_tokens multiplier 1.5 → 1.3
   - G=8 (conditional drop to 4 based on probe)
   - Everything else carries over from PDF defaults

6. **`analyze_eval_trace.py`** (~150 LOC) — Stage 8 analysis. Input: eval results from cloud. Output: per-tool scores, confusion matrix, weak-tool identification with recommendations.

7. **`finetune-otel.py`** (~300 LOC) — orchestrator. Parallel to `finetune.py` in the PDF skill. Walks all 8 stages in order, produces the cloud handoff payload, hands off to the existing LangDB Cloud training API (same endpoint the PDF skill uses).

### Track C — integration work (after scripts 1-7)

8. **Level 2 integration tests** (from `trace-pipeline-testing.md`):
   - `test_inspect_to_topics.py`
   - `test_topics_to_records.py`
   - `test_records_to_grader.py`
   - `test_grader_to_probe.py`
   - `test_records_to_handoff.py`

9. **Level 3 golden test** — `tests/golden/test_trace_pipeline_golden.py` against the Phoenix shopping-agent parquet fixture in `~/Documents/GitHub/test-samples/otel-phoenix/source_traces.parquet`. Checked-in expected files in `tests/expected/shopping_agent/`.

10. **Copy the Phoenix shopping-agent fixture** into `tests/fixtures/` (or point to the existing `test-samples/` location) so the golden test is self-contained.

### Track A (Gateway / BE) — parallel work

Can start anytime. First PR:
- Migration SQL (additive-only: new table, nullable column)
- Empty endpoint handlers that return `501 Not Implemented`
- This unblocks Track B to wire against stubbed backend

Second PR:
- Implement `POST /trace_bundles` (store raw_blob, compute rollup metadata)
- Implement `GET /trace_bundles/{id}` (return row + blob)
- Extend `POST /knowledge-sources` to accept `kind="otel-trace"` and populate FK

### Track B (UI) — parallel work

Can start anytime. First PR:
- Install agent-prism (shadcn degit + npm deps)
- Update Tailwind config
- Create `OtelTraceSourceViewer.tsx` stub that renders `<TraceViewer>` against a committed fixture (no backend calls yet)

Second PR:
- Wire `OtelTraceSourceViewer` into `KnowledgeSourceRenderer` via `kind` dispatch
- Switch from fixture to real `GET /trace_bundles/{id}` once Track A endpoints are up

---

## Key technical decisions for implementers

### File structure contract

Per `trace-pipeline-isolation.md`:
- **Trace work never modifies `finetune-skill/`** (the PDF skill). Files moved from there (`otel_extract.py`, `otel-trace-ingestion.md`, `openinference_to_semconv.py`) live in `finetune-skill-otel/`; originals stay in `finetune-skill/` as safety net until trace skill ships.
- **Shared-surface changes are additive only.** New UI components alongside existing ones (not refactoring). New API endpoints alongside existing ones. New DB columns nullable with default.
- **PR checklist** in `trace-pipeline-isolation.md` must be run on every trace-skill PR.

### JSONL record format

**OpenAI chat-completion format**, one full conversation per line. The `otel_distill.py` test file has concrete examples. Key points:

- `messages` array is the full conversation prefix ending with the assistant's tool_call (the training target)
- `tools` array is the tool schema **from the record's own trace** (per-trace, not global — supports multi-agent datasets)
- Parallel tool calls: single assistant message with `tool_calls` array of length K
- Tool results: `{role: "tool", tool_call_id: "...", content: "..."}` per OpenAI convention

### Status code preservation

`openinference_to_semconv.py` preserves `status_code` on every span it emits (both LLM and execute_tool spans). This is load-bearing — without it, `otel_distill.py` can't detect failed tool calls and Pattern B (error recovery) wouldn't work.

### Tool call ID linking

`otel_distill.py` uses `gen_ai.tool.call.id` to link LLM tool_call outputs to their execute_tool spans. Both OpenAI's `tool_call_id` and Anthropic's `tool_use_id` map to this semconv attribute; the adapter handles normalization.

### Grader scoring formula

**ToolRL Jaccard** (`trace_grader.py`):
```
r_name  = 1 if normalize_name(pred) == normalize_name(gt) else 0
r_param = |keys(gt) ∩ keys(pred)| / |keys(gt) ∪ keys(pred)|
r_value = |{ k ∈ intersect : gt[k] == pred[k] }|
S_raw   = r_name + r_param + r_value
S_max   = 1 + len(gt_args)
score   = clamp(S_raw / S_max, floor=0.02, ceiling=1.0)
```

Wrong tool name → 0.02 floor (never 0.0 — kills zero-variance per `feedback_grader_no_zero_hard_gate`).

**Open question** noted in `trace-grader-reference.md`: exact `S_max` denominator vs the ToolRL paper's `1 + |GT| + Σ|keys(GT_j)|`. Current impl uses `1 + len(gt_args)` with clamping. Both work for reasonable inputs; the paper formulation may produce smoother gradients. Revisit after first training run if scores cluster too tightly.

---

## How to continue after compaction

If this conversation is compacted and context is lost, read these docs **in this order** to rebuild full context:

1. **This doc** (`trace-pipeline-implementation-plan.md`) — current status + next actions
2. **`trace-pipeline-isolation.md`** — what files you can and cannot modify
3. **`otel-traces-as-finetune-input.md`** — the concept, the 8 stages, the patterns
4. **`trace-grader-reference.md`** — grader formula and edge cases
5. **`trace-pipeline-testing.md`** — testing strategy
6. **`otel-extractor-tooling-survey.md`** — tooling decisions

Then examine the current state of `finetune-skill-otel/` to see what's implemented:

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui/finetune-skill-otel
find . -type f -not -path '*/__pycache__/*' | sort
cat SKILL.md  # skill overview + implementation status checklist
uv run --with pytest python -m pytest tests/unit/ -v  # verify all tests pass
```

**To continue implementation**, pick up from the "Implementation plan — next actions" section above. The ordering is dependency-aware: each script unblocks the next.

---

## Commands that work today

### Run all unit tests

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui/finetune-skill-otel
uv run --with pytest python -m pytest tests/unit/ -v
```

Should show **60 tests passing in ~40ms** (31 grader + 29 distill).

### Convert a Phoenix shopping-agent parquet to semconv JSON

```bash
cd /Users/anhthuduong/Documents/GitHub/vllora/ui/finetune-skill-otel
uv run --with pandas --with pyarrow python scripts/openinference_to_semconv.py \
    ~/Documents/GitHub/test-samples/otel-phoenix/source_traces.parquet \
    -o /tmp/shopping_agent_semconv.json
```

### Extract training records from the semconv JSON

```bash
python scripts/otel_distill.py \
    /tmp/shopping_agent_semconv.json \
    --output /tmp/shopping_agent_training.jsonl
```

Should produce ~30-40 training records from the 33-decision shopping-agent fixture (each decision point that has a successful tool call becomes a record).

---

## Milestones

| Milestone | Status | Notes |
|---|---|---|
| Design docs complete | ✅ done | 5 companion docs, all citations verified |
| Track C scaffolding | ✅ done | Directory structure + SKILL.md + copied files |
| `trace_grader.py` + tests | ✅ done | 31 tests, 245 LOC |
| `otel_distill.py` + tests | ✅ done | 29 tests, 345 LOC |
| `trace_topics.py` | ✅ done | Two-level hierarchy (agent → pattern), multi-agent safe |
| `trace_grader_builder.py` | ⏳ | |
| `trace_probe_gates.py` | ⏳ | |
| `system_prompt_rewriter.py` | ⏳ | |
| `trace_hparams.py` | ⏳ | |
| `analyze_eval_trace.py` | ⏳ | |
| `finetune-otel.py` (orchestrator) | ⏳ | |
| Integration tests | ⏳ | Level 2 of testing ladder |
| Golden test against Phoenix fixture | ⏳ | Level 3 of testing ladder |
| Track A — Gateway migration + endpoints | ⏳ not started | Can run in parallel |
| Track B — Agent-prism UI wiring | ⏳ not started | Can run in parallel |
| First end-to-end cloud training run | ⏳ | Level 4 of testing ladder |
| v1 acceptance (L1+L2+L3 green 3 days + 1 successful L4) | ⏳ | Defined in `trace-pipeline-testing.md` |
