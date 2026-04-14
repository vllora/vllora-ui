# Design Doc: Pipeline Reasoning & Step Analysis

> **Date**: 2026-04-14
> **Status**: Design ready, pending implementation
> **Problem**: Users have no visibility into WHY the pipeline made each decision. The UI shows WHAT happened (records, topics, eval scores) but not the reasoning behind it.
> **Dual purpose**: Structured analysis also improves agent decision quality (research-backed).

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Research Findings](#research-findings)
3. [Proposed Architecture](#proposed-architecture)
4. [Layer 1: Agent-Side Structured Analysis](#layer-1-agent-side-structured-analysis)
5. [Layer 2: UI-Side Progressive Disclosure](#layer-2-ui-side-progressive-disclosure)
6. [Implementation Plan](#implementation-plan)
7. [References](#references)

---

## Problem Statement

The finetune pipeline makes many decisions automatically:
- Why certain topics got more training records than others
- Why the grader was changed (what failure pattern was detected)
- Why one model was chosen over another (4B vs 0.8B)
- Why training was restarted with different parameters
- What the readiness gate found and what it means
- Why seed queries were injected and from where

Currently the user sees: a sidebar with data (sources, topics, records, evaluations) but **no explanation of the reasoning or analysis** behind the decisions. The pipeline journal logs actions ("Step 4 completed: 401 records generated") but not the reasoning ("Equal allocation would waste budget on rarely-used procedures; trace data shows 110x frequency difference").

This makes the pipeline feel like a black box — users can't learn from it, can't catch mistakes early, and can't make informed decisions about whether to accept the pipeline's choices.

---

## Research Findings

### Agent Reasoning Helps the Agent Too

**Self-Reflection in LLM Agents** (arXiv:2405.06682) shows that LLMs that reflect on their own chain of thought produce guidance that significantly improves problem-solving performance. Critically, **structured reflections (observation + explanation + decision) outperform ad-hoc reflections** by a measurable margin.

**Multi-Agent Reflexion** (arXiv:2512.20845) shows separating observation, diagnosis, critique, and decision into distinct phases reduces shared blind spots and prevents reinforcing earlier mistakes (+6.2 points on HumanEval).

**Focused Chain-of-Thought** (arXiv:2511.22176) shows separating information extraction from reasoning reduces token usage 2-3x while maintaining accuracy.

**Key insight**: Forcing the agent to write structured analysis at each step is not just a display feature for users — it measurably improves the agent's subsequent decisions. The analysis format is scaffolding that helps the agent avoid mistakes.

### How Other Platforms Show Pipeline Analysis

| Platform | Pattern | What they show | What's missing |
|---|---|---|---|
| **Datadog Watchdog RCA** | Anomaly → correlated evidence → root cause hypothesis | Why an alert fired, what caused it, supporting data | Only for monitoring, not training pipelines |
| **dbt Explorer** | Recommendations per model, lineage DAGs | Specific actionable guidance generated from metadata | Only for data transforms |
| **W&B** | Metric charts, parameter sweeps, run comparison | WHAT happened quantitatively | No narrative WHY |
| **GitHub Actions** | Collapsible step list with status + logs | Step-by-step execution | Raw logs, not analysis |
| **AWS Cloudscape Progressive Steps** | Status icons + sub-steps + expandable details | Hierarchical progress with estimated completion | Template pattern, not implemented product |
| **Claude Code** | Inline thinking blocks (collapsible) | Agent's chain of thought | Unstructured, not queryable |
| **LangSmith** | Hierarchical run tree + Polly AI for queries | Full trace + queryable analysis | Complex, requires LangChain ecosystem |

**No platform currently shows structured decision analysis for ML training pipelines.** This is a gap in the market.

### Progressive Disclosure (Nielsen Norman Group)

The proven hierarchy for technical analysis:

1. **Glanceable** (always visible): Step name + status badge + one-line summary
2. **Expandable** (one click): Decision card with observation, analysis, decision, evidence
3. **Deep dive** (power users): Raw data, comparison tables, metric charts

---

## Proposed Architecture

### Two Layers, One Format

```
Layer 1: Agent writes structured analysis → stored in pipeline journal
Layer 2: UI reads journal → renders progressive disclosure

Both layers use the same data format: Decision Cards
```

```
┌──────────────────────────────────────────────────────────────┐
│  SKILL (Agent)                                               │
│                                                              │
│  At each pipeline step:                                      │
│  1. Observe: collect metrics, check results                  │
│  2. Analyze: compare against thresholds, identify patterns   │
│  3. Decide: choose action based on analysis                  │
│  4. Record: write decision card to journal                   │
│                                                              │
│  This structured format HELPS the agent reason better        │
│  (arXiv:2405.06682) AND produces data for the UI.            │
└───────────────────────────┬──────────────────────────────────┘
                            │ pipeline-journal.json
                            │ (decision cards per step)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  GATEWAY                                                     │
│                                                              │
│  Stores journal entries with decision card metadata.         │
│  Existing pipeline_journal table + new fields.               │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  UI                                                          │
│                                                              │
│  Pipeline Analysis view (new sidebar section):               │
│  - Timeline of steps with status badges                      │
│  - Expandable decision cards per step                        │
│  - Before/after comparison tables                            │
│  - Iteration history (why grader was changed, why re-eval)   │
└──────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Agent-Side Structured Analysis

### Decision Card Format

Every pipeline step produces a **decision card** — a structured JSON object stored in the pipeline journal.

```json
{
  "step": "step_4_generation",
  "phase": "generation",
  "iteration": 1,
  "timestamp": "2026-04-14T10:45:00Z",
  "status": "completed",
  "summary": "Generated 401 trace-weighted records with 76 seed queries (19%)",

  "observation": {
    "text": "12 topics with trace priority scores ranging from 0.0000 to 0.0848. modify-pending-order-items has highest priority (20.2% frequency, 42% failure rate). modify-pending-order-payment has lowest (0.9% frequency, 0% failure).",
    "metrics": {
      "topic_count": 12,
      "highest_priority_topic": "modify-pending-order-items",
      "highest_priority_score": 0.0848,
      "lowest_priority_topic": "modify-pending-order-payment",
      "lowest_priority_score": 0.0000,
      "frequency_range": "0.2% - 20.2%"
    }
  },

  "analysis": {
    "text": "Equal allocation (25 records/topic) would waste training budget on rarely-used procedures. Trace data shows 110x frequency difference between highest and lowest topics. Real users struggle most with modify-pending-order-items (42% failure) and exchange-delivered-order-items (37% failure).",
    "comparison": {
      "equal_allocation": {"per_topic": 25, "total": 300},
      "trace_allocation": {"highest": 50, "lowest": 3, "total": 401}
    }
  },

  "decision": {
    "text": "Use trace-weighted allocation: proportional to priority_score. High-priority topics get up to 50 records, low-priority get minimum floor of 3. Inject 20% real user queries from traces as seed prompts.",
    "rationale": "GRPO-LEAD (arXiv:2504.09696) validates per-prompt priority weighting. DCLM (arXiv:2406.11794) shows 10-30% curated data in synthetic-heavy mix optimizes generalization.",
    "action_taken": "generate_records.py --weight-by-trace-priority --seed-query-ratio 0.20"
  },

  "evidence": {
    "before_after": {
      "before": {"strategy": "equal", "per_topic": 25, "seed_queries": 0},
      "after": {"strategy": "trace-weighted", "highest": 50, "lowest": 3, "seed_queries": 76}
    },
    "key_numbers": {
      "total_records": 401,
      "seed_query_ratio": "19%",
      "duplicates_removed": 0
    }
  },

  "outcome": {
    "text": "401 records across 12 topics, 76 seed queries (19%), 0 duplicates. All topics have >= 3 records (floor enforced).",
    "next_step": "Write grader (trace-informed)"
  }
}
```

### Decision Cards Per Pipeline Step

| Step | What the card captures |
|---|---|
| **Step 1: Objective** | What inputs were detected, what mode was chosen (combined/PDF/trace), why |
| **Step 2A: Extraction** | How many parts extracted, any issues (consolidation, title diversity), quality metrics |
| **Step 2C: Trace Analysis** | Priority distribution, coverage gaps found, seed query count, grader dimensions discovered |
| **Step 3: Topics** | Topic hierarchy design rationale, trace enrichment (what was added), coverage analysis |
| **Step 4: Generation** | Allocation strategy (equal vs weighted), seed query ratio, record quality spot-check |
| **Step 5: Grader** | Grader design rationale, which trace failures informed dimensions, adversarial test results |
| **Step 5.5: Validation** | Quality gate results, any false positives identified, decisions about proceeding |
| **Step 7: Eval** | Per-model scores, readiness verdict, which model chosen and why, comparison table |
| **Step 7 (iteration)** | What failed in readiness, what was diagnosed, what fix was applied, before/after |
| **Step 8: Training** | Hyperparameters chosen and why, training progress, any early stopping and cause |

### How It Improves Agent Decisions

The structured format forces the agent to:

1. **Observe before acting** — collect metrics and state before making a decision
2. **Analyze explicitly** — compare options, identify patterns, reference thresholds
3. **Justify decisions** — state rationale with evidence, not just "I decided to..."
4. **Record evidence** — before/after comparisons make mistakes visible
5. **Plan next step** — explicit next-step field prevents skipping steps

Per the self-reflection research (arXiv:2405.06682), this structured observation→analysis→decision format outperforms:
- Just logging actions ("generated 401 records")
- Unstructured reasoning ("I think we should use trace weighting")
- No reflection (just proceeding to next step)

### SKILL.md Integration

Add a new logging requirement to the SKILL.md execution rules:

```markdown
**Decision card (MANDATORY at each step):** Before proceeding to the next step,
write a structured analysis using `log-step` with `--analysis` and `--decision` fields:

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_4_generation \
  --action generate_records \
  --status completed \
  --summary "Generated 401 trace-weighted records with 76 seed queries" \
  --analysis '{"observation": "12 topics, priority range 0.0-0.0848, 110x frequency skew", "analysis": "Equal allocation wastes budget on low-frequency topics", "decision": "Trace-weighted with 20% seeds"}' \
  --evidence '{"before": {"per_topic": 25}, "after": {"highest": 50, "lowest": 3, "seeds": 76}}'
```

The `log-step` command already accepts `--analysis` and `--decision` fields — we just need to make their usage mandatory and structured.

---

## Layer 2: UI-Side Progressive Disclosure

### New Sidebar Section: Pipeline Analysis

```
PIPELINE ANALYSIS  8 steps              ← NEW section (replaces or augments Pipeline Journal)
  ✓ Objective & Detection         10:38
  ✓ Extract & Analyze             10:40
  ✓ Build Topics                  10:43
  ✓ Generate Records              10:45
  ✓ Write Grader                  10:48
  ⚠ Evaluate (iteration 1)       10:55   ← warning = readiness failed
  ✓ Evaluate (iteration 2)       11:10
  ◐ Train                        11:25   ← in progress
```

### Three Tiers of Detail

**Tier 1: Glanceable (always visible)**

Each step shows: status icon + name + timestamp + one-line summary.

```
✓ Generate Records                                        10:45
  401 records, trace-weighted, 76 seed queries (19%)
```

**Tier 2: Expandable (click to see decision card)**

```
▼ Generate Records                                        10:45
┌──────────────────────────────────────────────────────────────┐
│ OBSERVATION                                                  │
│ 12 topics with trace priority 0.0000–0.0848.                │
│ modify-pending-order-items: 20% frequency, 42% failure.     │
│ modify-pending-order-payment: 0.9% frequency, 0% failure.   │
│                                                              │
│ ANALYSIS                                                     │
│ Equal allocation (25/topic) wastes budget on rarely-used     │
│ procedures. Trace data shows 110x frequency difference.      │
│                                                              │
│ DECISION                                                     │
│ Trace-weighted allocation: 50 for high-priority, 3 for low. │
│ 20% seed queries from real user conversations.               │
│                                                              │
│ ┌────────────────────────────────────────┐                   │
│ │ Before           →  After              │                   │
│ │ Equal: 25/topic      Highest: 50       │                   │
│ │ 0 seeds              76 seeds (19%)    │                   │
│ │ 300 total             401 total        │                   │
│ └────────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

**Tier 3: Deep dive (link to raw data)**

Each decision card links to the relevant raw data view:
- "View priority table" → Trace Analysis > Priority & Coverage
- "View records" → Training Data > All Topics
- "View eval results" → Eval Runs > eval-001

### Iteration History

When the pipeline iterates (fix grader → re-eval), the timeline shows it clearly:

```
⚠ Evaluate (iteration 1)                                 10:55
  FAIL: length_drift_risk — eval P95 (210 tok) is 3x GT P95 (69 tok)

  ┌─ FIX APPLIED ──────────────────────────────────────────┐
  │ Diagnosed: grader rewarding verbosity (no conciseness   │
  │ penalty). Added DRPO-safe conciseness criterion.        │
  │ Before: 0 conciseness checks. After: 1 criterion.      │
  └─────────────────────────────────────────────────────────┘

✓ Evaluate (iteration 2)                                  11:10
  PASS: readiness gate passed. Chose 0.8B (34% learnable vs 16% for 4B).
  
  ┌────────────────────────────────────────┐
  │ Model      Avg    Learnable  Decision  │
  │ 4B         0.731  16%        Too easy  │
  │ 0.8B       0.429  34%        ✓ Chosen  │
  └────────────────────────────────────────┘
```

### UI Components Needed

| Component | What it shows | Complexity |
|---|---|---|
| `PipelineAnalysisView.tsx` | Main view: step timeline with expandable cards | Medium |
| `StepCard.tsx` | Single step: status + summary + expandable decision card | Medium |
| `DecisionCard.tsx` | Observation / Analysis / Decision / Evidence sections | Low |
| `BeforeAfterTable.tsx` | Side-by-side comparison table | Low |
| `IterationBadge.tsx` | "Fix applied" banner between iteration steps | Low |

### Sidebar Integration

Add "PIPELINE ANALYSIS" as a sidebar section, replacing or augmenting the existing "PIPELINE JOURNAL" section:

```
PIPELINE JOURNAL  24 entries     ← existing (raw log)
     ↓ becomes ↓
PIPELINE ANALYSIS  8 steps       ← new (structured analysis with decision cards)
  Pipeline Journal  24 entries   ← raw log moves to sub-item for power users
```

---

## Implementation Plan

### Phase 1: Agent-Side (Structured Journal)

| Task | What | Lines |
|---|---|---|
| Extend `log-step` in `finetune.py` | Accept `--analysis` and `--evidence` as structured JSON fields | ~30 |
| Update `pipeline_journal.py` | Store decision card fields in journal entries | ~40 |
| Update SKILL.md | Make decision cards mandatory at each step with examples | ~100 |
| Test: verify structured entries in journal | Run tau-retail-combined, check journal format | — |

### Phase 2: UI Components

| Task | What | Lines |
|---|---|---|
| `PipelineAnalysisView.tsx` | Timeline of steps with expandable decision cards | ~200 |
| `StepCard.tsx` | Status + summary + expandable detail | ~80 |
| `DecisionCard.tsx` | 4-section card (observation/analysis/decision/evidence) | ~100 |
| `BeforeAfterTable.tsx` | Comparison table component | ~50 |
| Sidebar section | "PIPELINE ANALYSIS" with step items | ~30 |
| Router + wiring | Content section in TabContentRouter + DatasetDetailContentV2 | ~20 |

### Phase 3: Polish

| Task | What |
|---|---|
| Iteration visualization | "Fix applied" banners between iteration steps |
| Deep dive links | Link decision cards to relevant data views |
| Empty state | Friendly message when no analysis data (PDF-only older runs) |

---

## References

### Agent Reasoning

| Paper | arXiv ID | Key finding |
|---|---|---|
| Self-Reflection in LLM Agents | arXiv:2405.06682 | Structured reflections (observation+explanation+decision) outperform ad-hoc |
| Multi-Agent Reflexion (MAR) | arXiv:2512.20845 | Separating observation/diagnosis/critique reduces blind spots (+6.2 HumanEval) |
| Focused Chain-of-Thought | arXiv:2511.22176 | Separating extraction from reasoning reduces tokens 2-3x |

### UX Patterns

| Source | Pattern | Relevance |
|---|---|---|
| AWS Cloudscape Progressive Steps | Status icons + sub-steps + expandable details | Closest template for pipeline step analysis |
| Datadog Watchdog RCA | Anomaly → evidence → root cause | Model for iteration analysis (readiness fail → fix → re-eval) |
| dbt Explorer | Per-model recommendations from metadata | Auto-generated actionable guidance |
| Nielsen Norman Group | Progressive disclosure | Three-tier information hierarchy |
| GitHub Actions | Collapsible step list with logs | Step timeline with expandable detail |

### Platform References

| Platform | What they show | What's missing |
|---|---|---|
| W&B | Metrics, charts, parameter sweeps | No narrative reasoning |
| MLflow | Parameters, metrics, artifacts | No decision analysis |
| LangSmith | Agent trace trees + Polly AI queries | Complex, ecosystem-locked |
| Vertex AI | Pipeline DAGs + step logs | Raw logs, not analysis |
