---
name: finetune-skill-otel
description: Finetune a small open model to imitate a tool-using agent from OpenTelemetry GenAI traces. Input is an OTLP-JSONL or OpenInference Parquet trace bundle; output is a fine-tuned Qwen3.5-4B LoRA adapter specialized to the agent's tool schema.
---

# vLLora Finetune Skill — OTel Trace Edition

> **Status:** v0 scaffolding (2026-04-08). Implementation in progress.
> See `docs/workflow-skill-first-approach/how-otel-finetune-flow-work/otel-traces-as-finetune-input.md`
> in the vLLora UI repo for the full design rationale.

## Quick start — DO THIS FIRST

**Do NOT read every script before running.** The orchestrator handles everything. Just run:

```bash
python3 .claude/skills/finetune-skill-otel/scripts/finetune-otel.py \
  all ./source_traces_semconv.json \
  --out-dir ./finetune-project \
  --name "my-agent" \
  --fallback "You are a helpful agent. Use the available tools to assist the user."
```

This runs all local stages AND publishes to the gateway automatically.
Then use the workflow ID from `./finetune-project/config.json` for eval and training.

**Rules:**
- ALWAYS use `--out-dir ./finetune-project` (no other path)
- ALWAYS use `--out-dir ./finetune-project`
- Do NOT read individual script files before running — the orchestrator calls them
- If there's an error, THEN read the relevant script to debug

## What this skill does

Given a bundle of OpenTelemetry GenAI traces from a production tool-using
agent (e.g. a LangGraph shopping-agent running on GPT-4o), this skill:

1. **Extracts training records** from the traces (one per LLM decision
   point that emitted a successful tool call)
2. **Derives a programmatic grader** from the agent's tool schema (Jaccard
   verifier — no LLM judge)
3. **Rewrites the demonstrator's system prompt** for the student model
   (drops dynamic context, fits context budget, adapts to the student's
   tool-call syntax)
4. **Probes the base model** with K=8 rollouts per record to verify the
   dataset is trainable under GRPO (4 gate checks)
5. **Hands off** records + grader + system prompt + probe report to the
   vLLora cloud training API
6. **Analyzes the trained model** against held-out customer paraphrases
   with per-tool scores and a confusion matrix

The result is a fine-tuned Qwen3.5-4B (or similar tool-capable base model)
that can replace the demonstrator on the narrow task it was trained for,
at a fraction of the cost.

## What this skill is NOT

- **Not a replacement for `finetune-skill/` (PDF pipeline).** This is a
  parallel, architecturally separate skill. It shares the UI, gateway,
  storage, and cloud handoff with the PDF skill — but no pipeline code.
  See `docs/workflow-skill-first-approach/how-otel-finetune-flow-work/trace-pipeline-isolation.md`
  for the engineering contract.
- **Not for long-horizon agentic tasks.** Defensible only for single-turn
  or shallow-horizon fixed-schema tool routing. Long-horizon (10+ turn)
  tasks where even frontier demonstrators score 35–70% on τ-bench are
  out of scope.
- **Not a behavioral cloning pipeline.** The training objective is GRPO
  on a tool-capable base model, not SFT on demonstrations. The
  demonstrator's tool choices are pseudo-labels for the programmatic
  grader, not supervised loss targets.

## The 8-stage pipeline

```
Trace bundle arrives at workflow
          │
          ▼
  Stage 1 — Inspect bundle (no LLM)
          │
  ┌───────┼───────┐
  ▼       ▼       ▼
Stage 2  Stage 3  Stages 4+5
Topics   Records  Grader + System prompt
(no LLM) (no LLM) (grader: no LLM)
          │       (prompt: one LLM call)
  └───────┼───────┘
          ▼
  Stage 6 — Pre-training probe (4 gates)
          │
          │ GO
          ▼
  HANDOFF TO CLOUD SERVER (LangDB Cloud)
          │
          ▼
  Stage 7 — Eval (cloud: scores records with the grader)
          │
          ▼
  Stage 8 — GRPO training (cloud: trains the model)
          │
          ▼
     TRAINED MODEL
  (Stage 9 deploy deferred for v1)
```

**Only Stage 5 makes an LLM call** (a one-shot system prompt rewrite at
workflow-creation time). Every other local stage is mechanical extraction,
deterministic computation, or polling. Stages 7-8 run on the cloud via
`finetune-otel.py eval` and `finetune-otel.py train`. Stage 9 is deferred.

## Execution flow

The orchestrator `scripts/finetune-otel.py` handles the entire pipeline.

Run stages in this order:

```bash
# 1. Run all local stages + publish to gateway (creates workflow,
#    uploads records, topics, grader, trace bundle)
finetune-otel.py all <traces.json> --out-dir ./finetune-project --name "my-agent"

# 2. Run evaluation on the cloud (scores records using the grader)
finetune-otel.py eval --workflow-id <wf> --poll

# 3. Run GRPO training on the cloud
finetune-otel.py train --workflow-id <wf> \
  --config-file ./finetune-project/training_config.json

# 4. Analyze results (optional, after eval completes)
finetune-otel.py analyze <eval-results.json> --output report.json
```

The `all` subcommand automatically publishes to the gateway (creates
workflow, uploads trace bundle, records with topic assignment, grader).
The workflow ID is saved in `finetune-project/config.json`.

After `all` completes, use the workflow ID to run eval and training.
The eval and train subcommands call the same cloud API as the PDF skill —
the cloud doesn't know whether records came from PDFs or OTel traces.

## Base model

**Default: [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)** (Apache 2.0).
- vLLM tool-call parser: `--tool-call-parser qwen3_coder --enable-auto-tool-choice`
- Unsloth GRPO: supported with `fast_inference=False`
- FP8 GRPO VRAM: ~8–10 GB (fits comfortably on H100 80GB)

**Upgrade tier:** Qwen3-8B for complex routing (~16 GB FP8).
**Smaller tiers:** Qwen3.5-2B, Qwen3.5-0.8B for tighter VRAM budgets.

## Hyperparameter deltas from the PDF default

The PDF pipeline defaults (`lr=1e-6`, `β=0`, `loss_type=dr_grpo`, `G=8`,
`temperature=0.9`, `max_output_tokens` = GT P95 × 1.5) mostly carry over.
**Three changes** for tool routing:

| Parameter | PDF | Trace | Why |
|---|---|---|---|
| Temperature (training) | 0.9 | **1.0** | Smaller discrete output space needs broader exploration ([ToolRL](https://arxiv.org/abs/2504.13958)) |
| max_output_tokens | GT P95 × 1.5 | **GT P95 × 1.3** | Tool calls are short; tighter cap prevents length blowup ([Bespoke Labs](https://www.bespokelabs.ai/blog/improving-multi-turn-tool-use-with-reinforcement-learning)) |
| G (K rollouts) | 8 | **8 → 4** if `frac_reward_zero_std > 50%` at step 50 | ToolRL and IRC use K=4; monitor and adjust |

**Conditional escalation:** if length blowup is observed during training,
enable `β=0.001` with ref model refresh every 100 steps (Bespoke Labs).

Full table in `reference/trace-hyperparameters.md`.

## Pre-training probe gates (4 gates, Stage 6)

| Gate | Threshold | Why |
|---|---|---|
| `learnable_frac ≥ 25%` | (relaxed from PDF's 30%) | Tool routing has smaller output space → more zero-variance groups |
| `trivial_wrong_frac ≤ 10%` | (new, trace-specific) | Base model locked onto wrong tool = pre-existing bias to fix with contrastive data |
| No single tool > 70% trivial | (per-tool) | Default-mode collapse defense |
| `refusal_frac ≥ 10%` (if refusal in schema) | (new) | Teach refusal behavior explicitly |

Full rules in `reference/trace-readiness-gate.md`.

## Reference documentation

All under `reference/`:

- **`otel-trace-ingestion.md`** — input format spec (OTLP-JSONL, OpenInference Parquet/JSONL), schema map, adapter instructions
- **`trace-grader-reference.md`** — programmatic Jaccard grader formula, edge-case rules, full pytest suite
- **`trace-hyperparameters.md`** — (TODO) consolidated hyperparameter deltas
- **`trace-analysis-strategy.md`** — (TODO) per-tool workflow for weak-tool identification
- **`trace-readiness-gate.md`** — (TODO) 4-gate probe thresholds with rationale
- **`trace-iteration-strategy.md`** — (TODO) data-focused iteration loop

## Scripts

All under `scripts/`:

- **`openinference_to_semconv.py`** — convert Phoenix / OpenInference traces to OTel GenAI semconv shape
- **`otel_extract.py`** — extract `knowledge_parts.json` from OTLP-JSONL span files
- **`otel_distill.py`** — Stage 3: extract training records per LLM decision point (per-trace tool schemas, multi-agent safe)
- **`trace_topics.py`** — Stage 2: two-level topic hierarchy (agent identity → tool-call pattern)
- **`trace_grader_builder.py`** — (TODO) Stage 4: generate programmatic Jaccard grader
- **`trace_grader.py`** — (TODO) the grader function itself (scored against `trace-grader-reference.md`)
- **`system_prompt_rewriter.py`** — Stage 5: extract + rewrite the demonstrator's system prompt
- **`trace_probe_gates.py`** — Stage 6: 4-gate pre-training probe
- **`trace_hparams.py`** — Stage 7: tool-routing hyperparameter delta
- **`analyze_eval_trace.py`** — Stage 8: per-tool confusion matrix + weak-tool identification
- **`finetune-otel.py`** — orchestrator. `all` subcommand runs stages 1–5/7 then auto-publishes to the gateway. Also: `publish`, `upload`, `handoff`, and per-stage subcommands.
- **`nemotron_to_semconv.py`** — adapter: converts `nvidia/Nemotron-Agentic-v1` OpenAI chat-completion format to OTel-semconv spans (with injected system prompt templates for Stage 5 testing)

## Sub-agents

**None in v1.** The trace skill's pipeline is mechanical extraction and
doesn't need the sub-agent delegation pattern the PDF skill uses. See
`docs/workflow-skill-first-approach/how-otel-finetune-flow-work/trace-pipeline-isolation.md` for
the rationale.

## Design docs (in the vLLora UI repo)

The full design is in `docs/workflow-skill-first-approach/how-otel-finetune-flow-work/`:

1. **`otel-traces-as-finetune-input.md`** — concept doc (2,829 lines: workflow,
   stages, hyperparameters, eval metrics, failure modes, research citations)
2. **`otel-extractor-tooling-survey.md`** — library/tooling decisions
   (1,488 lines: storage, UI, base model, dataset, reuse % per stage)
3. **`trace-grader-reference.md`** — grader formula spec with edge cases
4. **`trace-pipeline-isolation.md`** — engineering contract for the
   split from `finetune-skill/`
5. **`trace-pipeline-testing.md`** — five-level testing ladder
6. **`trace-pipeline-implementation-plan.md`** — current state + next actions

**Read these before implementing any script in this skill.**

## Current implementation status

- [x] Directory scaffolding
- [x] Copied `otel_extract.py`, `otel-trace-ingestion.md`, `trace-grader-reference.md` from their current locations
- [x] Wrote `openinference_to_semconv.py` for Phoenix/OpenInference → semconv conversion
- [x] Wrote this SKILL.md
- [x] `otel_distill.py` — Stage 3 record extraction (per-trace tool schemas)
- [x] `trace_topics.py` — Stage 2 topic hierarchy (two-level: agent → pattern)
- [ ] `trace_grader.py` + `trace_grader_builder.py` — Stage 4 grader
- [ ] `system_prompt_rewriter.py` — Stage 5 prompt rewrite
- [ ] `trace_probe_gates.py` — Stage 6 probe
- [ ] `analyze_eval_trace.py` — Stage 8 analysis
- [ ] `finetune-otel.py` — orchestrator
- [ ] Reference docs (hyperparameters, analysis-strategy, readiness-gate, iteration-strategy)
- [ ] Unit tests (per `trace-grader-reference.md` pytest spec)
- [ ] Golden test against `test-samples/otel-phoenix/`

## Engineering contract

**This skill never modifies files inside `finetune-skill/`.** Per Rule 1
of `trace-pipeline-isolation.md`, any PR that touches `finetune-skill/`
as part of trace-skill work is rejected at review. The only exception
is the one-time migration of `otel_extract.py`, `openinference_to_semconv.py`,
and `otel-trace-ingestion.md` from `finetune-skill/` to here — which has
**already happened** (the originals are kept in `finetune-skill/` as a
safety net until this skill ships and stabilizes).
