# Trace-Combined Mode Reference

> **When to read**: This document applies only when **both PDFs and OTel traces** are detected in the input folder (combined mode). If you only have PDFs, skip this.

## Overview

In combined mode, production OTel traces inform every pipeline step:

| Step | How traces influence it |
|------|----------------------|
| **Step 1: Objective** | Update objective with trace failure rates after Step 2C |
| **Step 2C: Trace Analysis** | Analyze traces → 4 artifacts (priority, topics, prompts, grader-hints) |
| **Step 3: Topics** | Enrich PDF-derived topics with trace-discovered topics + failure-informed prompts |
| **Step 4: Records** | Weight allocation by trace priority, inject seed queries from real conversations |
| **Step 5: Grader** | Auto-generate grader criteria from trace failure dimensions |

---

## Step 2C: Trace Analysis

Run trace analysis to produce 4 artifacts:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/trace_analyze.py \
  --traces source_traces_semconv.json \
  --output-dir finetune-project/trace-analysis
```

### Artifacts produced

| Artifact | What it contains | Consumed by |
|---|---|---|
| `trace-analysis/priority.json` | Per-topic frequency + failure rate + priority score | Step 4 (record allocation) |
| `trace-analysis/topics.json` | Topics found in traces, coverage gaps vs PDF topics | Step 3 (topic enrichment) |
| `trace-analysis/prompts.json` | Production system prompt (simplified) + real user queries | Step 4 (seed prompts + system prompt) |
| `trace-analysis/grader-hints.json` | Failure dimensions + prompt rules + calibration pairs | Step 5 (grader draft) |

### Upload trace data to gateway

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/upload_trace_analysis.py \
  --workflow-id $WORKFLOW_ID \
  --traces source_traces_semconv.json \
  --project-dir finetune-project/ \
  --name "OTel Traces"
```

### MANDATORY: Write trace influence summary to analysis.json

The UI shows a "Training Impact" view. Without this, it's empty:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
  --project-dir finetune-project --section trace-influence --status ready \
  --summary "Production traces shaped your training in 5 ways." \
  --assessment "1. System prompt: using the actual production prompt (not a custom one). 2. Topics: N topics from traces, M from documents. 3. Record allocation: high-failure topics get more examples (e.g., address-modify gets 50 vs payment-modify gets 25). 4. Seed queries: N real customer questions injected. 5. Grader: N failure dimensions from production errors." \
  --metrics '{"trace_count": N, "system_prompt_source": "trace", "topics_from_traces": N, "seed_queries": N, "grader_dimensions_from_traces": N, "high_failure_topics": ["topic1", "topic2"]}'
```

### Update the workflow objective with trace findings

Step 1 used a placeholder. Now update with real failure data:

```bash
TOP_FAILURES=$(python3 -c "import json; p=json.load(open('finetune-project/trace-analysis/priority.json')); items=sorted(p.items(),key=lambda x:x[1].get('failure_rate',0),reverse=True)[:3]; print(', '.join(f'{t} ({int(v[\"failure_rate\"]*100)}% failure)' for t,v in items))")
echo "High-failure areas: $TOP_FAILURES"
```

### Present trace analysis to user before proceeding

- Show the priority table (top 5 high-priority and bottom 3 low-priority topics)
- Flag any coverage gaps (topics in traces but not in PDFs)
- Show the simplified production system prompt
- Ask if the user wants to adjust priorities

### Step 2C completion checklist

All must be done before Step 3:
- [ ] 4 trace analysis artifacts in `trace-analysis/`
- [ ] Trace data uploaded to gateway
- [ ] `analysis.json` has `trace-influence` section (MANDATORY)
- [ ] Objective updated with trace failure rates
- [ ] Summary presented to user

---

## Step 3: Trace Topic Enrichment

If `finetune-project/trace-analysis/topics.json` exists:

1. Start with PDF-derived topics (comprehensive domain coverage)
2. Check `trace-analysis/topics.json` for coverage gaps — topics that appear in traces but not in PDF topics
3. **ADD** trace-discovered topics as new leaf topics (flag with `"source": "trace"` in metadata)
4. **NEVER REMOVE** PDF-derived topics even if they have low trace frequency — rare topics may be critical
5. Show the user which topics were added from traces vs which came from PDFs

### Trace-informed topic prompts

Per-topic system prompts MUST incorporate trace failure patterns. Read `trace-analysis/priority.json` for each topic's failure rate. For high-failure topics (>30%), the system prompt segment should specifically address the failure patterns — emphasize the exact procedures that fail in production. Read `trace-analysis/grader-hints.json` for specific failure dimensions to address.

---

## Step 4: Trace-Informed Record Generation

### System prompt MUST match production

The `--system-prompt` MUST be the `system_prompt` from `trace-analysis/prompts.json` — this is the actual production prompt the model sees at inference time. Do NOT write your own prompt and do NOT use `simplified_prompt` (that field is for seed-query LLM scaffolding only and strips ~91% of the policy, causing training/inference distribution shift).

```bash
PRODUCTION_PROMPT=$(python3 -c "import json; print(json.load(open('finetune-project/trace-analysis/prompts.json')).get('system_prompt','You are a customer service agent.'))")
```

### Trace-informed generation flags

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "$SIMPLIFIED" \
  --output finetune-project/training.jsonl \
  --records-per-topic 30 --parallel 4 \
  --weight-by-trace-priority \
  --trace-priority-file finetune-project/trace-analysis/priority.json \
  --trace-prompts-file finetune-project/trace-analysis/prompts.json \
  --seed-query-ratio 0.20 \
  --workflow-id $WORKFLOW_ID --enrich-sources
```

### Tool-calling vs text-only (IMPORTANT)

**Tool-calling agents** (tool-schemas.json exists): Do NOT use `generate_records.py`. Use `decision-points.jsonl` directly as training data. These are multi-turn records with full conversation context — the correct format. Single-turn synthetics create distribution shift (model skips auth, predicts args from nowhere). See [tool-calling-training-design.md](../research-trace-pdf-combine/tool-calling-training-design.md).

### Tool description sanitization (default on for tool-calling)

`trace_analyze.py` strips agent-behavior clauses from tool descriptions by default. Specifically, sentences matching `"The agent needs to … (confirm|confirmation) … to proceed."` are removed from every tool's `function.description` before being written to `tool-schemas.json` and embedded in each `decision-points.jsonl` record.

**Why**: these clauses encode *agent policy* ("ask for confirmation first"), not *tool semantics*. When the model reads its own tool description at generation time and sees "ask for confirmation", it emits text narration instead of a `tool_call` — even on records where the user has already confirmed three turns back. The policy belongs in the **system prompt** (where the full tau-bench–style policy already lives), not inside tool descriptions. Preconditions like *"Only transfer if the user explicitly asks for a human agent"* (in `transfer_to_human_agents`) are NOT stripped — they're valid semantic constraints on when the tool may be called.

**Opt out**: `trace_analyze.py --preserve-tool-descriptions` keeps descriptions verbatim. Use only for debug comparisons; do not train with this flag.

**Verification**: diff `trace-analysis/tool-schemas.json` against the raw trace attribute `gen_ai.request.tools` — sanitized descriptions should be shorter and contain no "The agent needs to … to proceed." sentences, while preconditions and factual descriptions are preserved.

**Text-only agents** (no tool-schemas.json): Use `generate_records.py` with these flags:
- `--weight-by-trace-priority`: High-failure topics get more records
- `--trace-prompts-file`: Injects seed queries + overrides system prompt
- `--seed-query-ratio 0.20`: 20% seeds from real traces

---

## Step 5: Trace-Informed Grader

Auto-generate grader draft from trace failure dimensions:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/grader_from_traces.py \
  --grader-hints finetune-project/trace-analysis/grader-hints.json \
  --output finetune-project/quality-checker/grader-draft.js
```

The draft uses a checklist rubric with dimensions derived from production failure patterns. Review and customize before training.
