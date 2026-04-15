# Data Quality Validation Design

> **Purpose**: Automated semantic quality validation for generated training data.
> **Problem**: Structural checks (counts, format) pass but 45% of seed queries are assigned to wrong topics, 17% of records have no GT, and GTs are duplicated. These issues were only caught by manual inspection.
> **Date**: 2026-04-15

## Research Summary

### Why structural checks are insufficient

"The Data-Quality Illusion" (arXiv:2510.00866) shows that classifier-based quality filtering improves downstream tasks without actually improving language modeling on the high-quality set — surface-level quality classifiers can be misleading. Structural checks (format, length, dedup) are necessary but insufficient.

OpenAI RFT docs recommend: (a) verify gold-answer accuracy with domain experts, (b) test grader on base model completions, (c) run small-scale RFT first. They do NOT document automated content-alignment checks — their validation is grader-focused.

### Issue 1: Seed topic assignment by last action tool (45% misalignment)

**Root cause**: `trace_analyze.py` assigns seeds by the last action tool called in the trace (`trace_primary_topic()`). Multi-turn conversations drift — user asks about product features, conversation eventually leads to order cancellation.

**Research**: MINT-CL (arXiv:2411.14252) demonstrates that user utterance intent and agent action diverge significantly in multi-turn conversations. For GRPO, what matters is what the model sees as input (user's opening message), not the conversation outcome.

**Fix**: Use **first action tool** as primary signal, not last. The first tool call is the closest proxy for "what the user actually asked about."

| Approach | Pro | Con |
|----------|-----|-----|
| First-turn keyword matching | Fast, no LLM | Low accuracy for ambiguous queries |
| **First action tool** | Mechanical, deterministic | Misses if agent misunderstood |
| Last action tool (current) | Reflects outcome | 45% mismatch with opening query |
| LLM classifier | Most accurate | Slow, expensive, overkill |

**Multi-intent splitting**: Traces where the agent calls multiple action tools (e.g., return + cancel) should be split into separate training examples, one per action segment. This is standard in dialogue systems (SGD, MultiWOZ both segment by service/domain).

### Issue 2: Zero ground truth on seed records (17% dead weight)

**Research**: "No Prompt Left Behind" (arXiv:2509.21880, ICLR 2026) — records with no reward signal become zero-variance prompts where all rollouts get identical rewards. Standard GRPO wastes these entirely. Their RL-ZVP algorithm recovers up to 8.61 accuracy points, but TRL's GRPOTrainer doesn't implement it.

"Spurious Rewards" (arXiv:2506.10947) — for Qwen models specifically, records without GT are not catastrophic but are wasteful.

**Fix**: Derive GT from the trace itself. The trace contains the agent's actual successful response — extract it as ground truth. The trace IS the answer.

### Issue 3: Duplicated/generic ground truths (45 records share 5 GTs)

**Research**: DRA-GRPO (arXiv:2505.09655) — when distinct inputs receive identical rewards, GRPO suffers "Diversity-Quality Inconsistency" and collapses into dominant modes. GDPO (arXiv:2601.05242) confirms identical reward distributions collapse normalized advantages.

**Fix**: Detect records sharing verbatim GTs. Cap at 2 per unique GT string. For the rest, derive specific GTs from each record's context (the knowledge source parts used to generate it).

## Implementation: Data Quality Gate

### Where it runs

After `generate_records.py` (Step 4) and before grader/eval (Step 5). New command:

```bash
uv run finetune.py data-quality-check \
  --records training.jsonl \
  --topics topics.json \
  --output data-quality-report.json
```

### What it checks (5 dimensions)

| Check | Method | Threshold | Research basis |
|-------|--------|-----------|----------------|
| Topic-content alignment | Keyword match (fast) + LLM sample (thorough) | >80% aligned per topic | MINT-CL (arXiv:2411.14252) |
| GT coverage | Count records with/without GT | >90% with GT | "No Prompt Left Behind" (arXiv:2509.21880) |
| GT uniqueness | Count distinct GT strings vs total | <5% duplicated beyond 2 | DRA-GRPO (arXiv:2505.09655) |
| GT relevance | LLM judge on 20% sample: "does GT answer the question?" | >80% relevant | OpenAI RFT grader validation |
| Seed quality | Surface intent vs assigned topic keyword check | >70% match per topic | MINT-CL (arXiv:2411.14252) |

### Output: data-quality-report.json

```json
{
  "status": "WARN",
  "checks": {
    "topic_alignment": {
      "status": "FAIL",
      "score": 0.55,
      "details": "131/291 seeds don't match assigned topic by surface intent",
      "worst_topics": [
        {"topic": "transfer-to-human-agents", "misaligned_pct": 84},
        {"topic": "get-order-details", "misaligned_pct": 76}
      ]
    },
    "gt_coverage": {
      "status": "WARN",
      "score": 0.83,
      "details": "68/389 records (17%) have no ground truth"
    },
    "gt_uniqueness": {
      "status": "WARN",
      "score": 0.86,
      "details": "45 records share 5 duplicated GTs"
    }
  },
  "recommendations": [
    "Reassign seed queries by first action tool instead of last",
    "Derive GT from trace agent responses for seed records",
    "Deduplicate GTs — cap at 2 per unique GT string"
  ]
}
```

### Surfacing to users (analysis.json + UI)

The quality gate writes results to `analysis.json` under a `data-quality` section:

```json
{
  "data-quality": {
    "status": "needs-attention",
    "summary": "Found 3 quality issues in your teaching examples that could hurt training.",
    "assessment": "45% of real customer queries are assigned to wrong skills. 68 examples have no answer key. Some answer keys are too generic (same answer repeated 9 times).",
    "metrics": {
      "topic_alignment_score": 0.55,
      "gt_coverage_pct": 83,
      "gt_uniqueness_pct": 86,
      "seeds_misassigned": 131,
      "records_no_gt": 68,
      "duplicated_gt_records": 45
    },
    "next_action": "Fixing seed assignment and generating missing answer keys."
  }
}
```

The UI already has `SectionInsight` and `PipelineAnalysisView` that render `analysis.json` sections — the `data-quality` section will appear automatically.

## Implementation Plan

### Phase 1: Fix seed assignment (trace_analyze.py)

1. Change `trace_primary_topic()` to use first action tool, not last
2. Add multi-intent trace splitting (split at action boundaries)
3. Add surface-intent validation: filter seeds where keyword intent doesn't match assigned topic

### Phase 2: Add data quality gate (finetune.py)

1. New `data-quality-check` command with 5 checks
2. Write results to `data-quality-report.json` + `analysis.json`
3. SKILL.md: make this a mandatory step between Step 4 and Step 5

### Phase 3: Fix GT issues

1. Derive GT from trace agent response for seed records
2. Detect and cap duplicated GTs
3. Re-derive generic GTs with record-specific context

## References

- MINT-CL (arXiv:2411.14252) — Multi-turn intent classification, intent vs action divergence
- "No Prompt Left Behind" (arXiv:2509.21880, ICLR 2026) — Zero-variance prompt frequency, waste
- DRA-GRPO (arXiv:2505.09655) — Diversity-Quality Inconsistency from identical rewards
- GDPO (arXiv:2601.05242) — Reward distribution collapse from identical advantages
- "Spurious Rewards" (arXiv:2506.10947) — Random rewards with Qwen models
- "Data-Quality Illusion" (arXiv:2510.00866) — Surface quality classifiers misleading
- OpenAI RFT Guide — Grader validation, small-scale RFT first
- SGD Dataset — Multi-service dialogue segmentation standard
- MultiWOZ — Multi-domain dialogue state tracking benchmark
