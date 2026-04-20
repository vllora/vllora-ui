# Research: Trace-Informed Curriculum for GRPO Finetuning

> **Date**: 2026-04-13
> **Status**: Historical — decision implemented. The separate `finetune-skill-otel/` has been consolidated into `finetune-skill/`, which now handles PDF, OTel trace, and combined modes in a single pipeline. References below to `finetune-skill-otel/` describe pre-consolidation state; the trace-extraction logic now lives in `finetune-skill/scripts/trace_analyze.py`.
> **Original question**: Should the PDF finetune skill and OTel trace finetune skill be unified into one skill, or kept separate with a data bridge? (Answered: unified.)

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Two-Skill Architecture](#current-two-skill-architecture)
3. [Research: Can You Mix Knowledge + Tool-Routing in One GRPO Run?](#research-mixing-in-one-grpo-run)
4. [Research: Trace-Informed Curriculum Design](#research-trace-informed-curriculum-design)
5. [Research: Industry Practice and Tooling](#research-industry-practice-and-tooling)
6. [Proposed Architecture: Data Bridge](#proposed-architecture-data-bridge)
7. [Implementation Plan](#implementation-plan)
8. [Decision](#decision)
9. [References](#references)

---

## Problem Statement

We have two separate finetune skills:

1. **`finetune-skill/`** (PDF pipeline) — Extracts knowledge from documents, generates Q&A training pairs, GRPO trains the model to answer correctly based on document knowledge.
2. **`finetune-skill-otel/`** (OTel trace pipeline) — Ingests OpenTelemetry GenAI traces from production, extracts tool-routing patterns, GRPO trains the model for correct tool selection.

The intuition: these two data sources are complementary.
- **PDFs** provide the *correct knowledge* (what the model should know).
- **Traces** provide the *real usage patterns* (what users actually ask, where the model fails, which tools matter most).

The question: should we unify them into one GRPO training run, keep them as two fully separate skills, or connect them via a data bridge?

---

## Current Two-Skill Architecture

### Side-by-Side Comparison

| Dimension | PDF Finetune (`finetune-skill/`) | OTel Trace Finetune (`finetune-skill-otel/`) |
|---|---|---|
| **Input source** | PDFs, technical docs, manuals | OpenTelemetry GenAI spans from production agent logs |
| **Input extraction** | LLM-based extraction via `docling_extract.py` → semantic chunks (`knowledge_parts.json`) | Mechanical span-tree walk via `otel_extract.py` → system prompts, messages, tool calls |
| **Training objective** | Knowledge grounding: teach model facts/procedures from documents | Behavior cloning via pseudo-labels: teach model to replicate agent's tool-routing decisions |
| **Grader type** | **LLM-as-judge** (JavaScript, evaluates response quality using Claude/GPT-4) | **Programmatic Jaccard grader** (deterministic, tool-call matching only, no LLM) |
| **Grader evaluation** | Subjective: accuracy, helpfulness, tone, safety, completeness (custom per-domain rubric) | Objective: tool name match (binary 0→0.02 penalty) + parameter set Jaccard + value match → score in [0.02, 1.0] |
| **Training data format** | JSONL: `{messages, id, topic, source_parts, ground_truth}` | Same JSONL format, but derived from tool-call decision points in traces |
| **Base model (default)** | Configurable (Qwen 3.5-0.8B/2B/4B) | Qwen 3.5-4B (tool-calling optimized) |
| **Pipeline stages** | 8 stages: extract → consolidate → topics → records → grader → probe → eval → train | 8 stages: inspect → topics → extract records → build grader → rewrite prompt → probe → eval → train |
| **Sub-agents** | 4: knowledge-extractor, relation-builder, nemo-data-generator, training-monitor | 0 in v1 (pipeline is mostly mechanical extraction + 1 LLM call for prompt rewrite) |
| **Grading speed** | ~500ms–2s per record (one LLM call per rollout) | ~10μs per grader call (pure Python) |
| **Hyperparameter deltas** | lr=1e-6, β=0, loss_type=dr_grpo, G=8, temp=0.9, max_tokens=GT_P95×1.5 | temp=1.0 (discrete exploration), max_tokens=GT_P95×1.3 (shorter tool calls), G=4 if refusal variance >50% |

### Why They Were Originally Isolated

Per `docs/workflow-skill-first-approach/how-otel-finetune-flow-work/trace-pipeline-isolation.md`:

1. **No code sharing**: PDF skill is frozen. Trace skill is a parallel implementation with its own orchestrator, scripts, and reference docs.
2. **Additive-only shared surfaces**: UI, gateway, and cloud endpoints gain new components without reshaping existing PDF-focused surfaces.
3. **Independent CI**: Two golden-path tests block merge if either pipeline breaks.
4. **Workload difference**: PDF pipeline is LLM-heavy (4 sub-agents). Trace pipeline is mechanical (0 sub-agents).

### Where They Overlap

- Both use same JSONL training format (`messages` + metadata)
- Both invoke GRPO training on cloud handoff
- Both score via a grader (LLM judge vs Jaccard)
- Both run 4-gate readiness probes
- Both measure eval results per-topic

### Where They Fundamentally Diverge

- **Grader semantics**: Subjective quality vs deterministic tool matching
- **Reward signal shape**: Continuous 0.0–1.0 vs near-binary
- **Difficulty distribution**: Likely very different base-model pass rates per task type
- **Failure modes**: PDF → grader exploitation (length padding, style mimicry). Trace → default-tool collapse, refusal undersampling

---

## Research: Mixing in One GRPO Run

### Can you combine knowledge QA and tool-routing in a single GRPO training run?

**Finding: No established method exists, and the practical barriers are significant.**

#### 1. No GRPO Paper Addresses Heterogeneous Reward Signals

- **DeepSeek-R1** (arXiv:2501.12948) uses GRPO but trains on a single task type (reasoning) with a single reward signal. Its multi-domain RL stage (math + code + reasoning) uses a *homogeneous* correctness reward — not different grader types per sample.
- **DAPO** (arXiv:2503.14476) and **Dr. GRPO** (arXiv:2503.20783) focus on algorithmic improvements (dynamic sampling, normalization bias) rather than multi-task setups.
- **"No Prompt Left Behind"** (arXiv:2509.21880, ICLR 2026) documents that zero-variance prompts are frequent even within a single task. Mixing tasks with different difficulty distributions would increase zero-variance frequency.

#### 2. TRL GRPOTrainer Lacks Per-Sample Reward Routing

The `GRPOTrainer` accepts a single `reward_funcs` list, but all functions are applied to every sample. There is no built-in mechanism for "apply grader A to QA samples, grader B to tool samples." You could hack around this (each grader returns 0.0 for non-applicable samples), but this wastes K completions and distorts group statistics.

#### 3. Reward Scale Mismatch

Knowledge QA graders produce continuous scores (0.0–1.0 based on answer completeness). Tool-routing graders are near-binary (correct tool or not). GRPO's per-group normalization handles this within groups, but across groups, binary rewards produce sharper advantage signals — causing one task to dominate gradient updates.

#### 4. Difficulty Distribution Collision

Per "Hard Examples Are All You Need" (arXiv:2508.14094), GRPO learns most from examples with 10–40% base accuracy. If QA sits at 25% and tool-routing at 60%, the optimizer heavily favors QA updates, starving tool-routing.

#### 5. OpenAI RFT Explicitly Warns Against This

OpenAI's RFT documentation describes single-grader-per-run as the supported mode. Their recommended approach for multi-capability models is sequential training runs or multi-turn graders that evaluate everything in one score.

#### 6. Tool-Use Training Literature Uses SFT, Not RL

- **ToolLLM** (arXiv:2307.16789) — SFT on synthetic tool-use trajectories, not GRPO
- **Gorilla** (arXiv:2305.15334) — SFT with retrieval-augmented training
- **ToolACE** (arXiv:2401.06301) — SFT via multi-agent simulation
- **Toolformer** (arXiv:2302.04761) — Self-supervised SFT

The dominant pattern for "know facts + use tools" is two-stage: (1) SFT on mixed data, then (2) RL on one focused task. We don't support SFT.

### Conclusion: Single-Run Unification Is Not Viable

Without SFT support, per-sample reward routing in TRL, or any validated multi-reward GRPO pattern, combining both data types in one GRPO run would be pioneering without guidance and at high risk of one task dominating the other.

---

## Research: Trace-Informed Curriculum Design

### The Key Insight: Traces Are Not Training Data — They're a Requirements Specification

Instead of mixing traces INTO training, traces should INFORM training. The research strongly supports using production signals to prioritize what to train on.

### Per-Prompt Priority Weighting in GRPO

**GRPO-LEAD** (arXiv:2504.09696) — Difficulty-aware advantage reweighting. Computes per-prompt difficulty from empirical correctness rates, then scales advantages so harder prompts get larger gradient updates. The core formula:

```
priority_score = frequency × (1 - pass_rate) × business_impact_multiplier
```

This is directly implementable: score each prompt by base-model pass rate, weight accordingly.

**Goldilocks RL** (arXiv:2602.14868) — A teacher model predicts question difficulty for the student model, selecting "neither too easy nor too hard" questions. Continuously adapts as the student improves. Outperforms standard GRPO under same compute budget.

**VCRL** (arXiv:2509.19803) — Variance-based curriculum that uses rollout variance as a difficulty signal. High-variance prompts (some correct, some wrong) are the most learnable. Zero-variance (all correct or all wrong) are skipped or deprioritized.

**AceGRPO** (arXiv:2602.07906) — Adaptive curriculum that bootstraps an evolving pool of intermediate-difficulty states.

**Cog-DRIFT** (arXiv:2604.04767) — Reformulates hard problems into easier variants (multiple-choice, cloze), trains on those first, then transfers back. Shows +10% on originally unsolvable problems.

### Oversampling Is Safe with GRPO

GRPO normalizes advantages within each prompt group (K rollouts). Oversampling a prompt means it appears in more batches — each instance normalizes independently. No distortion of group statistics.

**"No Prompt Left Behind"** (arXiv:2509.21880) confirms the real risk is *under*-sampling (zero-variance prompts contribute nothing), not oversampling. Their RL-ZVP method gains up to 8.61 accuracy points over standard GRPO by extracting signal from zero-variance prompts.

### Failure Mining from Production

**"Hard Examples Are All You Need"** (arXiv:2508.14094) — Hard examples (10–40% base accuracy) yield 47% gains vs 3–15% for easy ones. Production traces directly identify which topics are "hard" via failure rates.

**RLTHF** (arXiv:2502.13417) — Human-AI hybrid framework using reward distribution to identify "hard-to-annotate samples." Routes difficult samples to human annotation. Closest paper to "use production signals to find what needs fixing."

**Online Iterative RLHF** (arXiv:2405.07863) — Full feedback loop: sample from current policy → score → update → repeat. Outperforms offline methods by a large margin specifically because it closes the feedback loop. This is the theoretical foundation for trace-informed curriculum.

**"Less is More"** (arXiv:2502.14560) — Selecting only 25% of training data (by response-quality margin) matches training on the full dataset. Confirms that smart selection > more data.

---

## Research: Industry Practice and Tooling

### Observability Platforms

| Platform | Trace Collection | Failure Detection | Training Data Generation |
|---|---|---|---|
| **Arize Phoenix** | OpenTelemetry-native | LLM-as-judge evals, custom metrics | No |
| **LangFuse** | Custom + OTel | Scoring, annotation workflows | No |
| **LangSmith** | LangChain-native | Evaluation framework | No |
| **Deepchecks** | Custom | Hard sample mining, explainable segmentation | Export for finetuning (closest) |

**Gap in all platforms**: They stop at "identify bad traces." None automate "convert traces into prioritized training records." This is the novel opportunity.

**Deepchecks** is closest — offers "hard sample mining" that identifies underperforming interactions, segments by explainable properties (text length, language, code presence), and exports them as fine-tuning data. Integrates with NVIDIA AI Blueprints for "data flywheels."

### Training Platforms

| Platform | Multi-source support | Per-sample grader | Feedback loop |
|---|---|---|---|
| **OpenAI RFT** | Single grader per run | No | Documented eval→improve→re-eval flywheel, but manual |
| **HuggingFace TRL** | `reward_weights` for multiple reward functions, but applied to ALL samples | No per-sample routing | No built-in |
| **Together AI / Fireworks** | SFT only for custom data | N/A | No |

### TRL GRPOTrainer Per-Prompt Weighting

TRL doesn't support a per-prompt weight column directly. Two implementation paths:

1. **Oversampling** (simpler): Duplicate high-priority prompts in the dataset proportional to their priority score. Safe with GRPO's group normalization.
2. **Custom reward scaling** (cleaner): Implement a reward function that multiplies the base grader score by a priority weight looked up from `trace_priority.json`.

TRL does support `reward_weights` in `GRPOConfig` for weighting multiple reward signals, and loss variants like GSPO (sequence-level importance sampling), VESPO (variational importance weighting), and CISPO (clipped importance sampling) — but these are for multi-reward weighting, not per-prompt priority.

---

## Proposed Architecture: Data Bridge

### Overview

Keep the two skills separate, but connect them via a `trace_priority.json` data bridge. The OTel skill produces trace analysis as a side-effect. The PDF skill consumes it as a prioritization signal.

```
finetune-skill-otel/               finetune-skill/
(trace analysis + tool-routing)    (knowledge training)
        │                                  │
        │  trace_priority.json             │
        └──────────────►──────────────────┘
                                           │
                                  generate_records.py
                                  --weight-by-traces
                                           │
                                        GRPO train
```

### Stage 1: Trace Analysis (New Stage in OTel Skill)

**New script**: `trace_analyze.py`

**Input**: OTel traces (already ingested by `otel_extract.py`)

**Process**:
1. **Cluster traces by scenario type** — Embed user queries via sentence-transformers, cluster with HDBSCAN or k-means
2. **Map clusters to existing topic hierarchy** — Cosine similarity between cluster centroid embeddings and topic name/description embeddings. Threshold: >0.7 = mapped, <0.7 = uncovered.
3. **Compute per-topic statistics**:
   - `frequency`: Fraction of total traces in this topic
   - `failure_rate`: Fraction of traces where the model produced an error, hallucination, or wrong tool call
   - `avg_turns`: Average multi-turn depth (complexity signal)
   - `tool_error_rate`: Fraction of tool executions with error status
   - `common_tool_sequence`: Most frequent tool-call sequence pattern
4. **Compute priority score**:
   ```
   priority_score = frequency × (1 - pass_rate) × business_impact_multiplier
   ```
   Where `business_impact_multiplier` defaults to 1.0 but can be manually set per topic.
5. **Detect uncovered scenarios** — Clusters with no topic match → flagged for new topic creation.

**Output**: `trace_priority.json`

```json
{
  "generated_at": "2026-04-13T10:30:00Z",
  "trace_count": 1247,
  "coverage": {
    "mapped_traces": 1089,
    "unmapped_traces": 158,
    "topic_coverage": 0.873
  },
  "topic_priorities": {
    "billing/refunds": {
      "frequency": 0.34,
      "failure_rate": 0.72,
      "avg_turns": 4.2,
      "tool_error_rate": 0.15,
      "common_tool_sequences": [
        ["lookup_order", "process_refund", "send_confirmation"]
      ],
      "priority_score": 0.81,
      "sample_queries": [
        "I want a refund for order #12345",
        "Can you process a partial refund?"
      ]
    },
    "alerts/multi-condition": {
      "frequency": 0.12,
      "failure_rate": 0.89,
      "avg_turns": 6.1,
      "tool_error_rate": 0.22,
      "common_tool_sequences": [
        ["create_alert", "add_condition", "add_condition", "test_alert"]
      ],
      "priority_score": 0.93,
      "sample_queries": [
        "Set up an alert when CPU > 80% AND memory > 90%"
      ]
    }
  },
  "uncovered_scenarios": [
    {
      "cluster_label": "deployment/rollback",
      "trace_count": 42,
      "sample_queries": [
        "Roll back the last deployment",
        "How do I revert to v2.3?"
      ],
      "suggested_action": "Create new topic in topic hierarchy"
    }
  ]
}
```

### Stage 2: Trace-Informed Record Generation

**Existing file**: `finetune-skill/scripts/generate_records.py`

**New flag**: `--weight-by-traces <path-to-trace_priority.json>`

**Integration point**: `compute_topic_record_counts()` function (line 467 in current code).

**Current prioritization modes** (already exist):
1. Equal distribution (default) — every topic gets `--records-per-topic` (default 25)
2. `--weight-by-source` — topics with more linked knowledge parts get more records (3:1 cap)
3. `--weight-by-difficulty` — hard topics 45%, medium 35%, easy 20% of budget

**New mode**: `--weight-by-traces` — reads `trace_priority.json`, allocates records proportional to `priority_score`.

**Allocation algorithm**:
```python
# 1. Load trace priorities
trace_data = json.load(open(trace_priority_path))
topic_priorities = trace_data["topic_priorities"]

# 2. For each leaf topic, look up priority score (default 0.5 for unmapped)
for topic in leaf_topics:
    if topic in topic_priorities:
        scores[topic] = topic_priorities[topic]["priority_score"]
    else:
        scores[topic] = 0.5  # neutral priority for topics not seen in traces

# 3. Normalize to sum=1.0, multiply by total record budget
total = sum(scores.values())
for topic in leaf_topics:
    record_counts[topic] = round((scores[topic] / total) * total_budget)

# 4. Apply floor: every topic gets at least 3 records (avoid zero coverage)
for topic in leaf_topics:
    record_counts[topic] = max(record_counts[topic], MIN_RECORDS_PER_TOPIC)
```

**Prompt type shifting** (within each topic's record budget):
- High-failure topics (failure_rate > 0.7): shift toward `edge_case` (40%) and `scenario` (35%) prompts, reduce `explain` (10%)
- Normal topics: use default distribution
- This ensures hard scenarios get harder prompt types, not just more volume

### Stage 3: Standard GRPO (Unchanged)

No changes to the GRPO training itself. The training data is now shaped by real usage patterns, but the grader, training config, and pipeline are identical to the existing PDF skill flow.

### How Each Trace Signal Maps to a Training Decision

| Trace signal | Extraction source | Training decision |
|---|---|---|
| **Query frequency per topic** | Cluster user queries → map to topic hierarchy | More records for high-frequency topics |
| **Failure rate per topic** | K=8 rollouts on production prompts, measure pass rate | Hard topics get larger share of record budget |
| **Tool error rate** | Count `execute_tool` spans with error status per tool | Generate more `edge_case` prompts for error-prone tools |
| **Multi-turn depth** | Count turns in ReAct chains per trace | Deep chains = complex scenario → more records + harder prompt types |
| **Uncovered scenarios** | Trace clusters that don't map to any existing topic | Flag for new topic creation in next pipeline iteration |
| **Tool call sequences** | Extract common A→B→C patterns from successful traces | Inform scenario prompt generation ("user does A then B then C") |
| **Sample queries** | Representative user messages from each cluster | Seed `generate_records.py` with real phrasing (more natural prompts) |

---

## Implementation Plan: Unified Skill with Auto-Detection

### Design Principle

**One skill. Auto-detects inputs. Does the right thing.**

The user provides a folder with their inputs. The skill looks at what's there and adapts:

| Input folder contains | Skill behavior |
|---|---|
| PDFs only | Standard PDF pipeline (existing, no change) |
| Traces only | Standard OTel pipeline (existing, no change) |
| **PDFs + Traces** | **Trace-informed PDF pipeline (NEW)** — analyze traces first, then use priorities to weight record generation |

### How Traces Contribute to Each Pipeline Step

Traces don't just affect record allocation — they contribute to **three** stages of the pipeline:

| Pipeline step | Without traces (current) | With traces (proposed) |
|---|---|---|
| **Topic generation** | Topics from PDF structure only | PDF topics + trace-discovered topics (coverage gaps flagged) |
| **System prompt** | Written manually or from PDF headings | Production prompt extracted from traces → simplified for small model |
| **Record allocation** | Equal records per topic | Weighted by trace frequency x failure rate |
| **Record prompts** | LLM-generated synthetic queries | Seeded with real user queries from traces |
| **Grader design** | Manual rule writing | Production prompt constraints inform grading criteria |

#### Contribution 1: Topic Generation — Traces ADD Missing Topics

Currently topics come only from PDFs. But traces reveal what users actually ask about — which may not match what the PDF covers:

```
PDF-derived topics:              Trace-derived signals:
├── Cancel pending order         ├── Cancel pending order    (16.7% of traces)
├── Modify payment               ├── Modify payment          (0.9%)
├── Modify items                 ├── Modify items            (28.3%)
├── Modify address               ├── Modify address          (13.5%)
├── Return delivered order       ├── Return delivered order   (26.7%)
├── Exchange delivered order     ├── Exchange delivered order (27.6%)
│                                ├── ??? "partial refund"     (4.2%) ◄── NOT IN PDF
│                                └── ??? "order tracking"     (8.1%) ◄── NOT IN PDF
└── Transfer to human            └── Transfer to human        (5.4%)
```

Traces should:
- **ADD topics** the PDF missed (real user needs not covered by documentation — flag as coverage gaps)
- **REWEIGHT topics** (usage frequency influences record allocation)
- **NOT REMOVE topics** — PDF topics with low trace frequency may be rare but critical. Keep them with a minimum floor.

Research backing: Intent discovery from conversation logs (arXiv:2505.11176) shows production queries reliably surface intents that pre-defined taxonomies miss, with ~71% recovery rate.

#### Contribution 2: System Prompt — Extract, Simplify, Reference

The traces contain the production agent's full system prompt. But research says **don't copy it verbatim** to the finetuned model:

| Approach | What it means | Research says |
|---|---|---|
| Copy production prompt | Finetuned model gets same long, complex prompt | Bad — small models can't follow complex prompts well |
| Ignore production prompt | Write new prompt from scratch | Bad — loses real-world constraints and rules |
| **Extract + simplify** | Use production prompt as reference, distill to minimal framing | **Correct** — training examples teach behavior, prompt just sets context |

The "vibe-tuning" research (Distil Labs 2025) shows small models (Qwen3-4B) learn task behavior from **training examples**, not from long system prompts. The system prompt's role shifts from "tell the model everything" to "set minimal framing."

**Concrete proposal**: The skill extracts the production system prompt from traces and uses it to:
1. **Inform the grader** — the production prompt's rules become grading criteria
2. **Seed the simplified prompt** — extract role + output format + key constraints only
3. **Generate better training prompts** — production prompt's edge cases become training scenarios

#### Contribution 3: Seed Queries — Real User Phrasing

Traces contain real user messages — how actual users phrase their requests. This is gold for training prompt generation:

```
From traces (real phrasing):
  "I want to return the blue jacket from my last order"
  "Can you cancel order #W2378156? I ordered by mistake"
  "I need to exchange my keyboard for one with clicky switches"

vs. LLM-generated (synthetic phrasing):
  "Please process a return for item X"
  "I would like to cancel order Y"
  "I wish to exchange product Z"
```

Real queries are more diverse in tone, specificity, and complexity. Using them as seeds for `generate_records.py` produces more realistic training data.

Research backing: ACM Web Conference 2025 shows LLM-generated synthetic data often drifts from real distributions in style, tone, and content proportions. Real user queries as seeds address this directly.

#### Contribution 4: Grader Design — Failure Dimensions + Calibration

Traces should inform **what the grader checks**, not **what "correct" looks like**. Three channels:

**Channel A: Failure patterns → grader dimensions (highest value)**

From failed traces, cluster what went wrong:

```
Failed traces analysis:
  15% failed because: skipped authentication before acting
   8% failed because: called wrong tool (cancel instead of return)
  12% failed because: wrong tool parameters (missing item_ids)
   5% failed because: didn't confirm with user before destructive action
```

Each high-frequency failure mode becomes a grader dimension. This is better than inventing rubric dimensions from scratch — you grade on what the model **actually struggles with**.

Research backing: "No Prompt Left Behind" (arXiv:2509.21880) shows GRPO needs variance in scores to learn. Grader dimensions derived from real failure modes target exactly where the model sometimes succeeds and sometimes fails — maximizing gradient signal. "Hard Examples Are All You Need" (arXiv:2508.14094) reinforces this — the training signal comes from examples where the model struggles.

**Channel B: Production prompt rules → grader criteria**

The production system prompt contains explicit rules:
```
"You must authenticate the user before any action"
"Only cancel orders with status 'pending'"
"Get explicit user confirmation before destructive actions"
```

These rules automatically become grader criteria with specific score impacts. This maps directly to Constitutional AI (Bai et al., arXiv:2212.08073) — explicit rules become reward signals.

**Channel C: Success/failure pairs → grader calibration**

Run the grader on 20–50 known-outcome traces as a validation step:
- Successful traces should score > 0.7
- Failed traces should score < 0.4
- If not → grader rubric is miscalibrated, fix before training

This catches grader bugs early. Reward model overoptimization research (Gao et al., arXiv:2210.10760) shows even small miscalibrations compound during RL training.

**What the grader should NOT do with traces:**

| Risk | Why it's bad |
|---|---|
| Check "does it look like the production agent's response" | Model learns to mimic style, not task competence (reward hacking) |
| Use successful traces as the only correct answer | Penalizes valid alternative approaches; caps model at production agent's level |
| Exact tool sequence matching against reference traces | Many valid tool orderings exist; GRPO needs to explore alternatives |

**Rule**: Traces define CRITERIA (what dimensions to check). PDFs + task logic define CORRECTNESS (what the right answer is).

The skill uses trace-derived dimensions to auto-generate the grader rubric instead of requiring the user to write it from scratch. The user can review and adjust before training starts.

### Summary: All Trace Contributions

| Pipeline step | What traces provide | Artifact |
|---|---|---|
| **Topic generation** | Discover missing topics, flag coverage gaps | `trace_topics.json` |
| **System prompt** | Extract production prompt → simplify for small model | `trace_prompts.json` |
| **Record allocation** | Priority scores: frequency x failure rate per topic | `trace_priority.json` |
| **Record prompts** | Real user queries as seeds for realistic diversity | `trace_prompts.json` |
| **Grader design** | Failure dimensions, prompt rules as criteria, calibration pairs | `trace_grader_hints.json` |

### Seed Query Ratio: 15-25% Real, 75-85% Synthetic

When mixing real user queries from traces with synthetic LLM-generated queries:

| Topic type | Real seed % | Synthetic % | Rationale |
|---|---|---|---|
| High-traffic (>20% of traces) | 30-40% | 60-70% | Enough real examples, deployment accuracy matters most |
| Medium-traffic (5-20%) | 15-25% | 75-85% | Balance real diversity with synthetic coverage |
| Long-tail (<5%) | 5-10% | 90-95% | Insufficient real examples, synthetic fills gaps |
| Novel/aspirational (0 traces) | 0% | 100% | No production data exists |

**Use real queries as-is** — don't paraphrase. Their value IS authentic phrasing, typos, ambiguity. If you paraphrase them, you lose exactly what makes them useful.

**Difficulty filter**: drop real queries scoring >0.9 at K=8. Easy queries waste GRPO compute (zero-variance groups per "No Prompt Left Behind", arXiv:2509.21880).

Research backing: DCLM (arXiv:2406.11794) — 10-30% curated data in synthetic-heavy mix optimizes generalization. Self-Instruct (arXiv:2212.10560) — 175 real seeds shaped 52K synthetic distribution. Lima (arXiv:2305.11206) — quality dominates quantity.

### Gateway Storage: Separate `trace_analyses` Table

Trace artifacts are stored in a new `trace_analyses` table in the gateway SQLite DB (not as workflow columns or files on disk). This matches MLflow and LangFuse patterns for small structured metadata.

API: `GET/PUT /api/workflows/:id/trace-analysis` — single endpoint, 4 JSON fields. Old workflows have no row (backward compatible).

### What NOT to Do (Research Warnings)

| Risk | Mitigation |
|---|---|
| **Overfitting to trace distribution** — model only handles common queries | Minimum floor per topic (no topic below 3 records regardless of frequency) |
| **Too many real seed queries** — model echoes production phrasing patterns | 15-25% real overall; monitor for mode collapse, reduce to 10% if detected |
| **Copying production prompt verbatim** — small models can't follow complex prompts | Extract + simplify: role + format + key constraints only |
| **Removing low-frequency PDF topics** — rare but critical scenarios disappear | Traces REWEIGHT, never REMOVE. PDF topics always preserved |
| **Entropy collapse** — in-distribution accuracy rises, out-of-distribution drops | Keep diverse prompt types (explain, scenario, edge_case) even for high-priority topics |

### Full Pipeline Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER INPUT FOLDER                                                      │
│  ├── pdfs/retail-agent-policy.pdf        "What's correct"               │
│  └── source_traces_semconv.json          "What users actually do"       │
└──────────────┬──────────────────────────────────┬───────────────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│  STEP 2: PDF Extraction  │       │  STEP 3: Trace Analysis (NEW)       │
│  (existing, no change)   │       │                                      │
│                          │       │  Produces 4 outputs:                 │
│  docling_extract.py      │       │                                      │
│  → knowledge_parts.json  │       │  1. trace_priority.json              │
│                          │       │     Per-topic frequency + failure    │
│                          │       │     → feeds record allocation        │
│                          │       │                                      │
│                          │       │  2. trace_topics.json                │
│                          │       │     Topics found in traces but NOT   │
│                          │       │     in PDFs → coverage gaps          │
│                          │       │     → feeds topic generation         │
│                          │       │                                      │
│                          │       │  3. trace_prompts.json               │
│                          │       │     Production system prompt          │
│                          │       │     (extracted, simplified)           │
│                          │       │     + seed user queries              │
│                          │       │     → feeds prompt & record design   │
│                          │       │                                      │
│                          │       │  4. trace_grader_hints.json          │
│                          │       │     Failure dimensions from traces   │
│                          │       │     + prompt rules as criteria       │
│                          │       │     + calibration pairs              │
│                          │       │     → feeds grader design            │
│                          │       │                                      │
└──────────┬───────────────┘       └──┬──────────┬─────────┬──────┬───────┘
           │                          │          │         │      │
           │                          │          │         │      │
           ▼                          ▼          │         │      │
┌──────────────────────────────────────────────┐ │         │      │
│  STEP 4: Topic Generation (MODIFIED)         │ │         │      │
│                                              │ │         │      │
│  PDF knowledge  +  trace_topics.json         │ │         │      │
│  → Combined topic hierarchy                  │ │         │      │
│  → PDF topics preserved (comprehensive)      │ │         │      │
│  → Trace-only topics ADDED (coverage gaps)   │ │         │      │
│  → User sees which topics came from where    │ │         │      │
│                                              │ │         │      │
│  Output: topics.json (enriched)              │ │         │      │
└──────────┬───────────────────────────────────┘ │         │      │
           │                                     │         │      │
           ▼                                     ▼         ▼      │
┌─────────────────────────────────────────────────────────────┐   │
│  STEP 5: Generate Records (MODIFIED)                        │   │
│                                                             │   │
│  Inputs:                                                    │   │
│  ├── knowledge_parts (from PDFs)                            │   │
│  ├── topics.json (enriched with trace topics)               │   │
│  ├── trace_priority.json → weighted allocation              │   │
│  └── trace_prompts.json → real user queries as seeds        │   │
│                                                             │   │
│  ┌────────────────────────────────────────────────────┐     │   │
│  │ Topic                   Equal   Trace-Informed     │     │   │
│  │ exchange-delivered        16  →   30  (+87%)       │     │   │
│  │ return-delivered          16  →   25  (+56%)       │     │   │
│  │ cancel-pending            16  →    8  (-50%)       │     │   │
│  │ modify-pending-payment    16  →    3  (-81%)       │     │   │
│  │ *partial refund (NEW)      0  →    5  (from trace) │     │   │
│  └────────────────────────────────────────────────────┘     │   │
│                                                             │   │
│  Output: training.jsonl (trace-informed)                    │   │
└──────────────────────────────┬──────────────────────────────┘   │
                               │                                  │
                               ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 6: Grader Configuration (MODIFIED)                                │
│                                                                         │
│  If trace_grader_hints.json exists:                                     │
│  ├── Auto-generate grader dimensions from failure patterns              │
│  │   e.g. "authentication_before_action" (15% of traces failed here)   │
│  ├── Convert production prompt rules into grading criteria              │
│  │   e.g. "only cancel pending orders" → check order status in grader  │
│  ├── Provide calibration pairs for grader validation                    │
│  │   Run grader on known-outcome traces, verify score correlation       │
│  └── User reviews auto-generated rubric, adjusts before training        │
│  Else:                                                                  │
│  └── Manual grader configuration (existing)                             │
│                                                                         │
│  Output: grader.json (trace-informed rubric)                            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 7-8: Eval → Train  (existing, no change)                         │
│                                                                         │
│  Same GRPO config, same cloud handoff.                                  │
│  Grader now has trace-informed dimensions targeting real failure modes.  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Artifacts (What the User Sees)

All trace analysis outputs are visible in `finetune-project/`:

```
finetune-project/
├── knowledge/                    ← from PDF extraction (existing)
│   └── retail-agent-policy/
│       ├── knowledge_parts.json
│       └── parts-index.json
├── topics.json                   ← topic hierarchy, enriched with trace topics
├── relations.json                ← topic↔source links (existing)
├── trace_priority.json           ← NEW: per-topic frequency + failure + priority score
├── trace_topics.json             ← NEW: topics discovered from traces, coverage gaps flagged
├── trace_prompts.json            ← NEW: production system prompt + seed user queries
├── trace_grader_hints.json       ← NEW: failure dimensions + prompt rules + calibration pairs
├── training.jsonl                ← records, weighted by trace priority + seeded with real queries
├── grader.json                   ← grader rubric, auto-generated from trace hints
├── config.json                   ← existing
└── pipeline-journal.json         ← existing
```

### UI: Topics View with Trace Priority

When traces are available, the UI topics view surfaces trace-derived signals per topic:

```
┌─────────────────────────────────────────────────────────────────┐
│  Topics                                        trace-informed   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ■ Exchange Delivered Order              Priority: ████████ 0.93│
│    Sources: 7 parts  │  Traces: 127 (27.6%)  │  Fail: 43.3%   │
│    Records: 30 allocated                                        │
│                                                                 │
│  ■ Return Delivered Order                Priority: ███████░ 0.81│
│    Sources: 8 parts  │  Traces: 123 (26.7%)  │  Fail: 39.0%   │
│    Records: 25 allocated                                        │
│                                                                 │
│  ■ Cancel Pending Order                  Priority: ██░░░░░░ 0.32│
│    Sources: 6 parts  │  Traces: 77 (16.7%)   │  Fail: 39.0%   │
│    Records: 8 allocated                                         │
│                                                                 │
│  ■ Modify Pending Payment                Priority: ░░░░░░░░ 0.02│
│    Sources: 5 parts  │  Traces: 4 (0.9%)     │  Fail: 0.0%    │
│    Records: 3 allocated (minimum)                               │
│                                                                 │
│  ■ Partial Refund (from traces)          Priority: ██░░░░░░ 0.28│
│    Sources: 0 parts  │  Traces: 19 (4.2%)    │  Fail: 68.4%   │
│    Records: 5 allocated  ⚠ COVERAGE GAP — no PDF source        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Grader Dimensions (auto-generated from traces)                 │
│                                                                 │
│  ■ Authentication before action          Fail rate: 15.0%       │
│    "Model must authenticate user before any state change"       │
│                                                                 │
│  ■ Correct tool parameters               Fail rate: 12.0%       │
│    "Tool calls must include all required parameters"            │
│                                                                 │
│  ■ Correct tool selection                Fail rate:  8.0%       │
│    "Model must select the right tool for the user's intent"     │
│                                                                 │
│  ■ User confirmation before action       Fail rate:  5.0%       │
│    "Model must get explicit yes/no before destructive actions"  │
│                                                                 │
│  [Review & Adjust Grader]                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The user can inspect all trace artifacts directly or view them in the UI. They can also override priorities manually (e.g., boost a low-frequency but business-critical topic) before training starts.

### What Changes in the Skill

#### SKILL.md Changes

Add to Step 1 (Input Detection):

```markdown
## Step 1: Detect and Ingest Inputs

Check the user's input folder for:
- `pdfs/` directory → PDF knowledge source (extract with docling)
- `source_traces_semconv.json` or `*.traces.json` → OTel GenAI traces

If BOTH are present, this is a **trace-informed finetune**:
1. Extract knowledge from PDFs (Step 2, unchanged)
2. Analyze traces (Step 3, NEW) — produces trace_priority.json,
   trace_topics.json, trace_prompts.json
3. Enrich topics with trace-discovered topics (Step 4, modified)
4. Generate records with trace priorities + seed queries (Step 5, modified)

If only PDFs: standard pipeline.
If only traces: standard OTel pipeline.
```

Add Step 3 (Trace Analysis — only runs when traces detected):

```markdown
## Step 3: Analyze Traces (auto — when traces are present)

Run trace analysis on the OTel traces to understand real usage patterns:

python3 scripts/trace_analyze.py source_traces_semconv.json \
  --output-dir finetune-project/

This produces four artifacts:

### trace_priority.json — Per-topic priority scores
- **Frequency**: How often each topic appears in real traces
- **Failure rate**: How often the model fails on each topic
- **Priority score**: frequency × failure_rate (0.0–1.0)
- Consumed by record generation in Step 5

### trace_topics.json — Coverage gap analysis
- Topics discovered in traces that don't exist in PDF-derived topics
- Each entry includes: topic name, trace count, sample queries, suggested action
- Consumed by topic generation in Step 4

### trace_prompts.json — Production prompt + seed queries
- Production system prompt extracted from traces (first system message)
- Simplified version for the finetuned model (role + format + key constraints)
- Real user queries grouped by topic (used as seed prompts in Step 5)

### trace_grader_hints.json — Grader dimensions + calibration
- Failure dimensions: clustered failure modes from failed traces, ranked by frequency
- Prompt rules: production system prompt rules extracted as grading criteria
- Calibration pairs: known success/failure traces for grader validation
- Consumed by grader configuration in Step 6
```

Modify Step 4 (Topic Generation):

```markdown
## Step 4: Generate Topics (MODIFIED when traces present)

If trace_topics.json exists:
  → Start with PDF-derived topics (comprehensive coverage)
  → ADD trace-discovered topics that don't overlap with PDF topics
  → Flag coverage gaps (topics from traces with no PDF source material)
  → NEVER remove PDF topics — even low-frequency ones may be critical
Else:
  → Standard topic generation from PDF only (existing)
```

Modify Step 5 (Record Generation):

```markdown
## Step 5: Generate Training Records (MODIFIED when traces present)

If trace_priority.json exists:
  → Allocate records proportional to priority score (high-priority topics get more)
  → Minimum floor: every topic gets at least 3 records
If trace_prompts.json exists:
  → Use real user queries as seed prompts (more realistic phrasing and diversity)
  → Use simplified production prompt as system prompt reference
Else:
  → Equal allocation with LLM-generated prompts (existing default)
```

Modify Step 6 (Grader Configuration):

```markdown
## Step 6: Configure Grader (MODIFIED when traces present)

If trace_grader_hints.json exists:
  → Auto-generate grader dimensions from failure patterns
    (each high-frequency failure mode becomes a scored dimension)
  → Convert production prompt rules into grading criteria
    (e.g., "must authenticate first" → grader checks auth before action)
  → Run grader on calibration pairs to validate scores
    (success traces should score >0.7, failures <0.4)
  → Present auto-generated rubric to user for review and adjustment
Else:
  → Manual grader configuration (existing)

IMPORTANT: Traces define WHAT the grader checks (dimensions).
PDFs + task logic define WHAT IS CORRECT (scoring).
Never score based on similarity to the production agent's response.
```

#### Scripts Changes

**`scripts/trace_analyze.py`** (new, ~200 lines) — lives in the unified skill:
- Input: `source_traces_semconv.json`
- Reads OTel spans, groups by trace_id
- Extracts system prompt from first system message
- Clusters user queries by topic (embedding similarity or tool-call patterns)
- Computes per-topic: frequency, failure rate, priority score
- Detects topics not present in PDF-derived topics (coverage gaps)
- Extracts representative user queries per topic (seed prompts)
- Outputs: `trace_priority.json`, `trace_topics.json`, `trace_prompts.json`

**`scripts/generate_records.py`** (modified, ~80 lines added):
- Load `trace_priority.json` if exists → use for record allocation
- Load `trace_prompts.json` if exists → use seed queries in prompt generation
- Load enriched `topics.json` → includes trace-discovered topics

### How the Skill Decides What To Do

```python
# Pseudocode for the skill's auto-detection (in SKILL.md instructions)

input_dir = user's project folder

has_pdfs = exists(input_dir / "pdfs/") and any .pdf or .md files
has_traces = exists(input_dir / "source_traces_semconv.json")
             or any file matching *traces*.json

if has_pdfs and has_traces:
    # COMBINED MODE: trace-informed pipeline
    extract_knowledge(pdfs/)                              # existing
    analyze_traces(traces)                                # NEW
      → trace_priority.json                               #   priority scores
      → trace_topics.json                                 #   coverage gaps
      → trace_prompts.json                                #   system prompt + seed queries
      → trace_grader_hints.json                           #   failure dimensions + calibration
    create_topics(pdf_knowledge, trace_topics)             # MODIFIED — enriched
    generate_records(                                      # MODIFIED
        trace_priority=trace_priority.json,                #   weighted allocation
        seed_queries=trace_prompts.json                    #   real user phrasing
    )
    configure_grader(trace_grader_hints.json)              # MODIFIED — auto-generated rubric
    eval → train                                          # existing

elif has_pdfs:
    # PDF-ONLY MODE (existing, no change)
    extract_knowledge → topics → records → grader → eval → train

elif has_traces:
    # TRACE-ONLY MODE (existing, no change)
    extract_traces → topics → records → grader → eval → train
```

### Effort Summary

| Change | What | Lines |
|---|---|---|
| `SKILL.md` | Auto-detection + Step 3 + modify Steps 4, 5, 6 | ~100 |
| `scripts/trace_analyze.py` | New: traces → 4 artifacts (priority, topics, prompts, grader hints) | ~300 |
| `scripts/generate_records.py` | Load trace artifacts for weighted allocation + seed queries | ~80 |
| `scripts/grader_from_traces.py` | New: trace_grader_hints → auto-generated grader rubric | ~150 |
| **Total** | | **~630 lines** |

### Test Scenario

`test-samples/tau-retail-combined/` validates the combined mode:

```
tau-retail-combined/
├── pdfs/retail-agent-policy.md         ← knowledge source
└── source_traces_semconv.json          ← 460 real GPT-4o traces
```

The skill should auto-detect both inputs, run trace analysis producing 3 visible artifacts, enrich topics with trace-discovered gaps, and generate training records weighted by real usage patterns with real user query seeds.

---

## Decision

### Recommendation: One Unified Skill with Auto-Detection

**One skill** that auto-detects whether the user provided PDFs, traces, or both — and adapts its pipeline accordingly.

| Input | Skill behavior |
|---|---|
| PDFs only | Standard knowledge-extraction pipeline |
| Traces only | Standard OTel tool-routing pipeline |
| PDFs + Traces | **Trace-informed knowledge pipeline** — traces drive record allocation priorities |

**Why unified, not two separate skills:**
- Simpler user experience — one skill, one folder, one run
- The skill decides how to process inputs, not the user
- Traces and PDFs serve the same goal (better model) from different angles

**Why NOT one GRPO run with mixed data:**
- No validated multi-reward GRPO pattern exists (TRL doesn't support per-sample grader routing)
- Different grader types (LLM judge vs Jaccard) have reward scale mismatch
- Research shows mixed tasks cause one to dominate gradient updates
- SFT (the prerequisite for true mixing) is not supported in our stack

**The trace data influences WHAT to train on, not HOW to train.** The training itself (grader, GRPO config, eval) stays unchanged. Only the record allocation per topic changes.

### If SFT Support Is Added Later

The path to deeper unification opens:
1. **SFT on mixed data** (knowledge + tool-routing) → establishes both capabilities
2. **GRPO stage 1**: Knowledge grounding (PDF grader)
3. **GRPO stage 2**: Tool routing refinement (Jaccard grader, knowledge frozen or low LR)

This matches the DeepSeek-R1 pattern (SFT → RL stages) and is the industry standard for multi-capability training.

---

## Real Trace Datasets for Validation

### Why Not Synthetic Traces

Synthetic traces can't validate the trace-informed curriculum concept — they'd be generated to match the knowledge source, defeating the purpose. The whole point is that **real traces reveal unexpected usage patterns** (frequency skew, failure clusters, uncovered scenarios) that the knowledge source alone doesn't predict.

### Recommended: tau-bench (MIT License)

**Source**: `github.com/sierra-research/tau-bench` (Sierra Research, MIT license)

tau-bench is the ideal dataset because it ships with **both trajectories AND paired domain documentation**:

| Domain | Tasks | Trajectories (GPT-4o) | Success Rate | Wiki Size | Tools |
|---|---|---|---|---|---|
| **Retail** | 115 unique | 460 (4 trials each) | 60.4% (278/460) | 81 lines | 16 tools |
| **Airline** | 50 unique | 200 (4 trials each) | 42% (84/200) | 70 lines | 14 tools |

**Why this is perfect for our demo:**
- `wiki.md` = the PDF knowledge source (return policies, order rules, booking procedures)
- Trajectories = real multi-turn agent conversations with tool calls and user interactions
- Success/failure labels exist (`reward: 1.0` or `0.0`) — failure mining is built-in
- Different tools have very different usage frequencies — proves prioritization value
- MIT license allows unrestricted use

#### Retail Domain Data Profile

**Tool call distribution** (from GPT-4o trajectories):
```
get_order_details:              1029  (28.4%)  ← dominates
get_user_details:                389  (10.7%)
find_user_id_by_name_zip:        386  (10.6%)
get_product_details:             359   (9.9%)
find_user_id_by_email:           208   (5.7%)
return_delivered_order_items:    160   (4.4%)
exchange_delivered_order_items:  151   (4.2%)
modify_pending_order_items:      149   (4.1%)
list_all_product_types:          106   (2.9%)
cancel_pending_order:             92   (2.5%)
modify_pending_order_address:     71   (2.0%)
calculate:                        56   (1.5%)
think:                            50   (1.4%)
modify_user_address:              38   (1.0%)
transfer_to_human_agents:         25   (0.7%)
modify_pending_order_payment:      5   (0.1%)  ← almost never used
```

**Key insight for demo**: The wiki.md covers `modify_pending_order_payment` with the same depth as `return_delivered_order_items`, but real traces show returns are 32x more frequent. Without trace-informed curriculum, training wastes equal budget on a rarely-used tool.

**Trajectory format** (OpenAI chat completions format):
```json
{
  "task_id": 0,
  "reward": 1.0,           // 1.0 = success, 0.0 = failure
  "traj": [
    {"role": "system", "content": "# Retail agent policy..."},
    {"role": "user", "content": "I'd like to exchange..."},
    {"role": "assistant", "content": null, "tool_calls": [
      {"function": {"name": "find_user_id_by_name_zip", "arguments": "{...}"}}
    ]},
    {"role": "tool", "content": "user_123", "tool_call_id": "call_xxx"},
    ...
  ],
  "info": {
    "task": {
      "actions": [...],      // ground truth tool call sequence
      "instruction": "..."   // user persona + goal
    }
  }
}
```

#### Airline Domain Data Profile

Lower success rate (42%) makes it rich in failure examples. Tools include `search_direct_flight`, `book_reservation`, `cancel_reservation`, `update_reservation_flights`, etc.

### Other Real Trace Sources

| Source | Format | Size | Tool Calls | License | Notes |
|---|---|---|---|---|---|
| **Toolathlon Trajectories** (HKUST-NLP) | JSONL (per model) | 1.51 GB, 17 models | Yes, diverse APIs | CC-BY-4.0 | Benchmark trajectories, very rich |
| **Hermes Agent Reasoning Traces** (Lambda) | JSONL, ShareGPT | ~3,679 rows | Yes (terminal, browser, files) | Check repo | Real execution, coding domain |
| **Salesforce xLAM 60K** | JSON/Parquet | 60K examples | Yes, structured | Apache 2.0 | Single-turn function calling |
| **Glaive Function Calling V2** | Parquet | 113K samples | Yes, multi-turn | Apache 2.0 | Widely used but synthetic |

### Platforms That Do NOT Provide Public Trace Data

- **LangFuse**: Export is self-hosted only (your own traces)
- **Arize Phoenix**: No bundled sample trace parquet. Tutorials generate traces live
- **OpenTelemetry GenAI SIG**: Schema spec only, no sample data files

### Conversion: tau-bench → OTel Semconv

tau-bench trajectories use OpenAI chat completions format. Conversion to OTel GenAI semconv requires:

1. Each trajectory → one `trace_id`
2. Each LLM turn (assistant message with or without tool_calls) → one `gen_ai.client` span with `gen_ai.operation.name: "chat"`
3. Each tool result → one span with `gen_ai.operation.name: "execute_tool"`
4. Tool definitions from `get_info()` methods → `gen_ai.request.tools` attribute
5. Messages accumulated into `gen_ai.input.messages` / `gen_ai.output.messages`

A conversion script (`tau_bench_to_otel.py`) is provided in the test scenario.

---

## References

### GRPO/RFT Core Papers

| Paper | arXiv ID | Relevance |
|---|---|---|
| DeepSeek-R1 | arXiv:2501.12948 | GRPO from scratch, single-task RL, SFT→RL pattern |
| DAPO | arXiv:2503.14476 | Dynamic sampling, clip-higher, zero-variance handling |
| Dr. GRPO | arXiv:2503.20783 | Algorithmic length bias from per-token normalization |
| No Prompt Left Behind | arXiv:2509.21880 | Zero-variance prompt frequency, RL-ZVP method |
| Hard Examples Are All You Need | arXiv:2508.14094 | Difficulty distribution: hard examples yield 47% gains |

### Curriculum Learning for GRPO

| Paper | arXiv ID | Relevance |
|---|---|---|
| GRPO-LEAD | arXiv:2504.09696 | Per-prompt difficulty-aware advantage reweighting |
| Goldilocks RL | arXiv:2602.14868 | Teacher-guided difficulty selection, outperforms standard GRPO |
| VCRL | arXiv:2509.19803 | Variance-based curriculum, rollout variance as difficulty signal |
| AceGRPO | arXiv:2602.07906 | Adaptive curriculum with evolving difficulty pool |
| Cog-DRIFT | arXiv:2604.04767 | Reformulate hard problems into easier variants first |
| Curriculum Learning for Efficient Reasoning | arXiv:2508.08940 | General curriculum learning survey for LLM training |

### Grader Design / Reward Modeling

| Paper | arXiv ID | Relevance |
|---|---|---|
| Training LMs to Follow Instructions (InstructGPT) | arXiv:2203.02155 | Reward models from preference pairs — trace success/failure pairs are analogous |
| Constitutional AI | arXiv:2212.08073 | Explicit rules → reward signals — production prompt rules → grader criteria |
| Scaling Laws for Reward Model Overoptimization | arXiv:2210.10760 | Grader miscalibration compounds during RL — calibrate with trace pairs |
| Let's Verify Step by Step | arXiv:2305.20050 | Process reward models — evaluate invariants from traces, not exact sequences |
| Intent Discovery with Topic Modeling | arXiv:2505.11176 | Production conversation logs surface intents pre-defined taxonomies miss |

### Feedback Loop / Online Learning

| Paper | arXiv ID | Relevance |
|---|---|---|
| Online Iterative RLHF | arXiv:2405.07863 | Close feedback loop: sample→score→update→repeat |
| RLTHF | arXiv:2502.13417 | Human-AI hybrid, reward distribution identifies hard samples |
| Less is More | arXiv:2502.14560 | 25% data selection matches full dataset training |
| KILO | arXiv:2508.03571 | Dynamic knowledge graphs for continual optimization |

### Tool-Use Training

| Paper | arXiv ID | Relevance |
|---|---|---|
| ToolLLM | arXiv:2307.16789 | SFT on tool-use trajectories (not RL) |
| Gorilla | arXiv:2305.15334 | Retrieval-augmented SFT for API calls |
| ToolACE | arXiv:2401.06301 | Multi-agent simulation for tool-learning data |
| Toolformer | arXiv:2302.04761 | Self-supervised SFT for tool insertion |
| Self-RAG | arXiv:2310.11511 | Self-retrieval + critique via SFT |
| ReAct | arXiv:2210.03629 | Interleaved reasoning + acting framework |

### Multi-Task RL

| Paper | arXiv ID | Relevance |
|---|---|---|
| Reinforced Multi-Task Learning | arXiv:2310.04399 | Task-specific reward heads + weighted sampling (PPO, not GRPO) |
| GR3 | arXiv:2603.10535 | Additive vs multiplicative length penalties |
| Tricks or Traps | arXiv:2508.08221 | Practical GRPO failure modes |

### Industry / Platform References

| Source | URL/Doc | Relevance |
|---|---|---|
| OpenAI RFT Guide | developers.openai.com | Single grader per run, eval→improve flywheel |
| HuggingFace TRL GRPOTrainer | huggingface.co/docs/trl | reward_weights, loss variants (GSPO, VESPO, CISPO) |
| Deepchecks Hard Sample Mining | llmdocs.deepchecks.com | Closest production system for trace→training data |
| Deepchecks Data Flywheel | deepchecks.com | NVIDIA AI Blueprints integration for continuous learning |
| Arize Phoenix | docs.arize.com | OTel-native trace collection, no training generation |
| LangFuse | langfuse.com | Trace scoring + annotation, no training generation |
| LangSmith | docs.smith.langchain.com | Evaluation framework, no training generation |
