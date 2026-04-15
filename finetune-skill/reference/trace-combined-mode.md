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

The `--system-prompt` MUST be the `simplified_prompt` from `trace-analysis/prompts.json` — this is the actual production prompt the model will see at inference time. Do NOT write your own prompt. Using a different prompt creates distribution shift.

```bash
SIMPLIFIED=$(python3 -c "import json; print(json.load(open('finetune-project/trace-analysis/prompts.json')).get('simplified_prompt','You are a customer service agent.'))")
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

### What the trace flags do

- `--weight-by-trace-priority`: High-failure topics get more records (proportional to `frequency × failure_rate`)
- `--trace-prompts-file`: Injects real user queries as seed records (17-20% of data) + overrides system prompt with production prompt
- `--seed-query-ratio 0.20`: 20% of records per topic are real queries from traces

---

## Step 5: Trace-Informed Grader

Auto-generate grader draft from trace failure dimensions:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/grader_from_traces.py \
  --grader-hints finetune-project/trace-analysis/grader-hints.json \
  --output finetune-project/quality-checker/grader-draft.js
```

The draft uses a checklist rubric with dimensions derived from production failure patterns. Review and customize before training.
