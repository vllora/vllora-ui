# How Record Generation Works — Deep Dive

> **Note:** This document primarily covers the native generation path via `generate_records.py`. Distilabel and NeMo are optional Step 4 alternatives that still reuse the same upstream artifacts and emit the same final `training.jsonl`.

The data generation step (Step 4) produces the actual training records — the prompts the model will practice on during fine-tuning. This document explains the generation strategy, how records are grounded in source material, the LLM calls involved, and the validation process.

## Three-Backend Architecture

Step 4 has three backends:

| Backend | When to use | Script |
|------|-------------|--------|
| **Native (default, this doc)** | Default path — no additional infrastructure needed | `scripts/generate_records.py` |
| **Distilabel (optional)** | When you want Instruction Backtranslation + DEITA for text-only data or APIGen augmentation around canonical tool traces | `scripts/run_distilabel_text_backend.py`, `scripts/apply_deita_selection.py`, `scripts/run_distilabel_apigen_backend.py` |
| **NeMo Data Designer (optional)** | When NeMo server is running and you need judge columns + reference answers | repo: https://github.com/vllora/nemo — see SKILL.md Step 4C |

**NeMo's two-stage template** generates a `raw_question` without seeing retrieved text first (for diversity), then retrieves question-specific chunks, then refines into the final `user_message`. This is inspired by multi-stage retrieval pipelines (arXiv:2509.25736 describes a similar retrieve-generate-refine approach for telecom), but note the paper actually retrieves first — the "blind question first" design is a recipe choice, not a direct replication.

**`generate_records.py` with `--enrich-sources`** provides a lighter version of the same idea: generates questions grounded in linked parts, then enriches `source_parts` metadata with question-specific retrieval. Unlike `--use-rag`, `--enrich-sources` is independent and only requires `--workflow-id`. It does not refine the question text itself — it only supplements traceability after generation.

## Distilabel in Step 4

Distilabel intentionally fits around the same artifact contract instead of replacing it.

Text-only mode:

- candidate generation uses existing topic-to-part relations
- Instruction Backtranslation creates candidate prompts from grounded source chunks
- DEITA-inspired scoring and diversity filtering select the final rows

Tool-calling mode:

- `trace-analysis/decision-points.jsonl` stays canonical
- APIGen only adds new rows for underrepresented tool topics
- canonical rows are copied through unchanged

This keeps Steps 5-8 backend-agnostic: all they see is `training.jsonl`.

---

## What Records Are

A training record is a **prompt** — a system message + user message that the model will respond to during training. The model generates its own response, and the grader scores it. You only provide the input side.

```json
{
  "messages": [
    {"role": "system", "content": "You are an expert chess tutor who teaches tactical and strategic concepts. When analyzing chess positions, identify tactical patterns including forks, pins, skewers, and discovered attacks, prioritizing forcing sequences. For fork opportunities, calculate all candidate moves that attack two or more pieces simultaneously, evaluating whether the fork is absolute or can be parried."},
    {"role": "user", "content": "Explain the knight fork and when it's most effective"}
  ],
  "id": "forks-001",
  "topic": "forks",
  "source_parts": ["chess-tactics-chapter-3-forks", "strategy-guide-section-5"],
  "prompt_type": "explain",
  "ground_truth": "A knight fork occurs when a knight attacks two or more pieces simultaneously..."
}
```

**Key insight**: This is **RFT (Reinforcement Fine-Tuning)** — no assistant messages are included. The model learns by generating responses and getting scored by the grader, not by copying reference answers.

> **Sequential dependency**: Records must complete fully before grader creation (Step 5). The grader needs to analyze sample records to identify domain-specific scoring criteria. Do not run Steps 4 and 5 in parallel.

**Note**: The system message is a **composed prompt** — it combines the root persona (`--system-prompt`), ancestor topic system_prompts, and the leaf topic's system_prompt. See [System Prompt Composition](#system-prompt-composition) below for details.

---

## Design Decisions (Research-Backed)

Three design principles drive the generation strategy, each backed by research:

### 1. Multi-Call Generation (5 prompt types per topic)

**Why not one big call?** When you ask an LLM to generate N items in a single call, you get repetitive patterns, positional bias, and source material skew. Research confirms this:

- **"Synthetic Eggs in Many Baskets"** (arXiv:2511.01490): Fine-tuning on synthetic data from diverse sources mitigates distribution collapse. Multi-source generation significantly outperforms single-source on distribution breadth.
- **"Balancing Cost and Effectiveness"** (NeurIPS 2024, arXiv:2409.19759): Generating new questions (vs rephrasing) is the superior strategy at scale.
- **"What Matters in LLM-generated Data"** (arXiv:2506.19262): Low-diversity synthetic data leads to model collapse over iterations.

Each prompt type uses different instructions and temperatures:

| Type | Weight | Temp | What it generates |
|------|--------|------|-------------------|
| `explain` | 25% | 0.7 | "What is...", "How does... work", "Describe..." |
| `scenario` | 25% | 0.9 | "I'm dealing with...", "My situation is..." |
| `compare_analyze` | 20% | 0.8 | "Compare X vs Y", "What are the pros and cons..." |
| `edge_case` | 15% | 1.0 | "What happens if...", "What's the exception when..." |
| `application` | 15% | 0.85 | "Walk me through...", "Help me figure out..." |

**Key insight from "Hard Examples Are All You Need"** (arXiv:2508.14094): Hard examples yield **47% gains** vs 3-15% for easy ones. The `edge_case` (temp 1.0) and `compare_analyze` types are most likely to produce these high-value hard prompts.

**Structured-output override** (`--ground-truth-format`): When set, a constraint is injected into the LLM prompt that forces ALL prompt types into scenario-based questions with concrete inputs. Open-ended prompts ("Explain...", "Describe...", "Compare pros and cons...") are incompatible with structured-output tasks (e.g., "Eligible. EIC: $X") — they produce model refusals during training because the model can't answer "Explain..." with a structured determination. The constraint converts every type to "Given [specific scenario], determine [answer]."

**Append-mode dedup**: When `--append` is used (e.g., after a crash), the script reads the existing output JSONL and skips topics already present, preventing duplicate records.

### 2. Source-Weighted Topic Distribution

By default, every leaf topic gets an **equal number of records** (`--records-per-topic`). This is the recommended approach:

- **OpenAI RFT Guide**: Training distribution should approximate inference distribution. If users query all topics, training data should be balanced.
- **"Hard Examples"** (arXiv:2508.14094): Difficulty matters far more than volume — 10 hard records yield 47% gains vs 3-15% for easy ones. Source material volume is not a proxy for difficulty.
- **OpenAI SFT best practices**: "If 60% of training data has a certain behavior but only 5% should at inference time, you will get overabundance of that behavior."

With `--weight-by-source`, records are distributed proportionally to linked source parts instead, with a **3:1 max imbalance ratio** to prevent majority-topic overfitting. Formula: `adjusted_count = round(records_per_topic * min(parts_for_topic / avg_parts, 3.0))`, clamped to `[min_per_topic, max_per_topic]`.

### 3. Two-Level Parallelism

- **Outer**: Multiple topics generated concurrently (`--parallel N`, up to 8)
- **Inner**: All 5 prompt-type calls within a topic run concurrently (always on)

This means a topic with 5 prompt types completes in ~1 LLM call time, not 5x.

---

## End-to-End Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GENERATE RECORDS PIPELINE                            │
│                     (generate_records.py — Step 4)                          │
│                                                                             │
│  4 key features:                                                            │
│    1. Multi-call: 5 prompt types per topic (not 1 big call)                 │
│    2. Equal distribution by default (--weight-by-source for proportional)    │
│    3. Two-level parallelism: topics concurrent + calls-per-topic concurrent  │
│    4. Two-stage GT for multi-label (--no-ground-truth + derive_ground_truth) │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
 PHASE 1: LOAD & PREPARE
═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────────────────┐
  │ topics.json  │   │ relations.json   │   │ knowledge/{slug}/           │
  │              │   │                  │   │   knowledge_parts.json      │
  │ [{id (slug), │   │ [{topic_id       │   │                             │
  │   name,      │   │   (slug),        │   │ [{id, type, title, content, │
  │   parent_id, │   │   part_id}, ...] │   │
  │   system_    │   │                  │   │   content_metadata}, ...]   │
  │   prompt}]   │   │                  │   │                             │
  └──────┬───────┘   └────────┬─────────┘   └──────────────┬──────────────┘
         │                    │                             │
         ▼                    │                             ▼
  ┌──────────────────┐        │               ┌──────────────────────────┐
  │ find_leaf_topics │        │               │ load_all_parts()         │
  │                  │        │               │                          │
  │ Filter: topics   │        │               │ Glob: */knowledge_parts  │
  │ whose ID is NOT  │        │               │ Key by part ID           │
  │ any topic's      │        │               │ → dict[str, dict]        │
  │ parent_id        │        │               └─────────────┬────────────┘
  └────────┬─────────┘        │                             │
           │                  │                             │
           ▼                  ▼                             ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                   PREPARED DATA (in memory)                          │
  │                                                                      │
  │  leaves: [topic, ...]     (only leaf topics — no children)           │
  │  topic_index: {id → topic}  (all topics for hierarchy lookup)        │
  │  relations: [{topic_id (slug), part_id}, ...]                         │
  │  parts: {part_id → {id, type, title, content, content_metadata}}     │
  └──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                    RECORD DISTRIBUTION                                │
  │                                                                      │
  │  compute_topic_record_counts():                                      │
  │                                                                      │
  │  DEFAULT (equal):                                                    │
  │    Every leaf topic gets records_per_topic (clamped to min/max)       │
  │    Example (--records-per-topic 25, 4 topics):                       │
  │      Topic A: 25 records    Topic C: 25 records                      │
  │      Topic B: 25 records    Topic D: 25 records                      │
  │                                                                      │
  │  WITH --weight-by-source:                                            │
  │    weight = min(parts_for_topic / avg_parts, 3.0)  ← 3:1 cap        │
  │    adjusted = round(records_per_topic * weight)                       │
  │    clamped to [--min-per-topic, --max-per-topic]                      │
  │    Example (--records-per-topic 25, avg 6 parts):                    │
  │      Topic A: 12 parts → weight 2.0 → 50 records (capped at max)    │
  │      Topic B:  3 parts → weight 0.5 → 13 records                    │
  │      Topic C:  6 parts → weight 1.0 → 25 records                    │
  │      Topic D:  2 parts → weight 0.3 → 10 records (floored at min)   │
  └──────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════
 PHASE 2: PER-TOPIC GENERATION (outer parallel: up to 8 topics concurrently)
═══════════════════════════════════════════════════════════════════════════════

  For EACH leaf topic (with its allocated record count):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  ┌─ Step A: Gather Source Material ──────────────────────────────────┐  │
  │  │                                                                   │  │
  │  │  relations.json ──filter by topic_id──► part_ids: [p-01, p-03]   │  │
  │  │                                                                   │  │
  │  │  parts[p-01] ──► {id, type, title, content, content_metadata}    │  │
  │  │  parts[p-03] ──► {id, type, title, content, content_metadata}    │  │
  │  │                                                                   │  │
  │  │  Build chunk_text (max 20 chunks, separated by ---):              │  │
  │  │                                                                   │  │
  │  │    Text part:   "[p-01] Section Title\nContent text here..."      │  │
  │  │    Table part:  "[p-03] Table Title\n[TABLE: caption — N rows     │  │
  │  │                  × M cols — columns: col1, col2]\nMarkdown table" │  │
  │  │                                                                   │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                              │                                          │
  │                              ▼                                          │
  │  ┌─ Step B: Compose Hierarchical System Prompt ─────────────────────┐  │
  │  │                                                                   │  │
  │  │  get_ancestor_chain(leaf, topic_index):                           │  │
  │  │    Walk parent_id up to root → [root, ..., parent]                │  │
  │  │                                                                   │  │
  │  │  compose_system_prompt(root_prompt, ancestors, leaf):             │  │
  │  │    ┌─────────────────────────────────────────────┐                │  │
  │  │    │  Segment 1: --system-prompt CLI arg          │ ← root        │  │
  │  │    │  "You are an expert chess tutor..."           │   persona     │  │
  │  │    │                                               │               │  │
  │  │    │  Segment 2: ancestor[0].system_prompt         │ ← domain      │  │
  │  │    │  "When analyzing chess positions, identify    │   focus       │  │
  │  │    │   tactical patterns including forks, pins..." │               │  │
  │  │    │                                               │               │  │
  │  │    │  Segment 3: leaf.system_prompt                │ ← skill       │  │
  │  │    │  "For fork opportunities, calculate all       │   focus       │  │
  │  │    │   candidate moves that attack two or more..." │               │  │
  │  │    └─────────────────────────────────────────────┘                │  │
  │  │    Joined with space → single flowing paragraph                   │  │
  │  │                                                                   │  │
  │  │  NOTE: This is PER-TOPIC (same for all records of this topic).    │  │
  │  │  Different leaf topics get different composed prompts.             │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                              │                                          │
  │                              ▼                                          │
  │  ┌─ Step C: Distribute Across Prompt Types ─────────────────────────┐  │
  │  │                                                                   │  │
  │  │  distribute_across_prompt_types(total=25):                        │  │
  │  │                                                                   │  │
  │  │    ┌──────────────┬────────┬──────┬───────────────────────────┐   │  │
  │  │    │ Type         │ Weight │ Temp │ Count (for 25 total)      │   │  │
  │  │    ├──────────────┼────────┼──────┼───────────────────────────┤   │  │
  │  │    │ explain      │  25%   │ 0.7  │ 7  (What is..., How...)  │   │  │
  │  │    │ scenario     │  25%   │ 0.9  │ 6  (I'm dealing with...) │   │  │
  │  │    │ compare      │  20%   │ 0.8  │ 5  (Compare X vs Y...)   │   │  │
  │  │    │ edge_case    │  15%   │ 1.0  │ 4  (What happens if...)  │   │  │
  │  │    │ application  │  15%   │ 0.85 │ 3  (Walk me through...)  │   │  │
  │  │    └──────────────┴────────┴──────┴───────────────────────────┘   │  │
  │  │                                                      Total: 25   │  │
  │  │                                                                   │  │
  │  │  For small totals (<5): collapses to fewer types                  │  │
  │  │                                                                   │  │
  │  │  HARD MODE (--difficulty hard): Evol-Instruct operators           │  │
  │  │  (arXiv:2304.12244) for harder records targeting 0.20-0.65 zone:  │  │
  │  │                                                                   │  │
  │  │    ┌──────────────┬────────┬──────┬───────────────────────────┐   │  │
  │  │    │ Type         │ Weight │ Temp │ What it produces          │   │  │
  │  │    ├──────────────┼────────┼──────┼───────────────────────────┤   │  │
  │  │    │ multi_step   │  30%   │ 0.8  │ Combine 2+ rules/facts   │   │  │
  │  │    │ indirect     │  25%   │ 0.9  │ Aliases, derived forms    │   │  │
  │  │    │ edge_case    │  25%   │ 1.0  │ Exceptions, boundaries   │   │  │
  │  │    │ complex_input│  20%   │ 0.85 │ 10-20 items, distractors │   │  │
  │  │    └──────────────┴────────┴──────┴───────────────────────────┘   │  │
  │  │                                                                   │  │
  │  │  ADAPTIVE MODE (--difficulty adaptive --eval-scores):             │  │
  │  │    Easy topics (base >0.70) → hard mode prompts                   │  │
  │  │    Hard topics (base <0.30) → normal mode prompts                 │  │
  │  │    Medium topics            → normal mode prompts                 │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                              │                                          │
  │                              ▼                                          │
  │  ┌─ Step D: Parallel LLM Calls (inner parallelism) ────────────────┐  │
  │  │                                                                   │  │
  │  │  ThreadPoolExecutor(max_workers=5) — all types run concurrently:  │  │
  │  │                                                                   │  │
  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                 │  │
  │  │  │ Call 1:      │ │ Call 2:      │ │ Call 3:      │ ...           │  │
  │  │  │ explain (7)  │ │ scenario (6) │ │ compare (5)  │               │  │
  │  │  │ temp=0.7     │ │ temp=0.9     │ │ temp=0.8     │               │  │
  │  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘               │  │
  │  │         │                │                │                        │  │
  │  │         ▼                ▼                ▼                        │  │
  │  │  ┌──────────┐    ┌──────────┐    ┌──────────┐                     │  │
  │  │  │ 7 items  │    │ 6 items  │    │ 5 items  │   ...               │  │
  │  │  └──────────┘    └──────────┘    └──────────┘                     │  │
  │  │         │                │                │                        │  │
  │  │         └────────────────┼────────────────┘                        │  │
  │  │                          ▼                                         │  │
  │  │                   Merge all items                                  │  │
  │  │                                                                   │  │
  │  │  Each call gets the SAME source material and topic context,        │  │
  │  │  but different instructions and temperatures → diverse prompts.    │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                              │                                          │
  │                              ▼                                          │
  │  ┌─ Step E: Build Training Records ─────────────────────────────────┐  │
  │  │                                                                   │  │
  │  │  For each item across all prompt-type responses:                   │  │
  │  │                                                                   │  │
  │  │  ┌─────────────────────────────────────────────────────────────┐  │  │
  │  │  │  record = {                                                  │  │  │
  │  │  │    "messages": [                                             │  │  │
  │  │  │      {"role": "system", "content": composed_prompt},         │  │  │
  │  │  │      {"role": "user",   "content": item["prompt"]}           │  │  │
  │  │  │    ],                                                        │  │  │
  │  │  │    "id": "{topic_id}-{index:03d}",                           │  │  │
  │  │  │    "topic": topic_id,                                        │  │  │
  │  │  │    "source_parts": [part_ids from relations],                │  │  │
  │  │  │    "prompt_type": "explain" | "scenario" | ... ,             │  │  │
  │  │  │    "ground_truth": item["ground_truth"]                      │  │  │
  │  │  │  }                                                           │  │  │
  │  │  └─────────────────────────────────────────────────────────────┘  │  │
  │  │                                                                   │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                              │                                          │
  │                              ▼                                          │
  │  ┌─ Step F: Flush (write to file + optional incremental upload) ────┐  │
  │  │                                                                   │  │
  │  │  Append records to training.jsonl (thread-safe via write_lock)    │  │
  │  │                                                                   │  │
  │  │  If --upload-incremental:                                         │  │
  │  │    Write batch to temp .jsonl → call finetune.py upload-records   │  │
  │  │    → records appear in UI immediately                             │  │
  │  │                                                                   │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  Repeat for ALL leaf topics (outer ThreadPoolExecutor with --parallel N workers)


═══════════════════════════════════════════════════════════════════════════════
 PHASE 3: POST-GENERATION
═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
  │ training.jsonl   │────►│ deduplicate_records.py│────►│ training.jsonl  │
  │ (raw output)     │     │ --threshold 0.85      │     │ (deduplicated)  │
  └──────────────────┘     └──────────────────────┘     └────────┬────────┘
                                                                  │
                           ┌──────────────────────┐               │
                           │ validate_dataset.py   │◄──────────────┘
                           │                       │
                           │ Checks:               │
                           │ - Valid JSON           │
                           │ - Has messages + id    │
                           │ - Has user message     │
                           │ - No assistant msgs    │
                           │ - No duplicate IDs     │
                           │ - >= 50 records total  │
                           └───────────┬───────────┘
                                       │
                                       ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │            TWO-STAGE GT (for multi-label tasks)                      │
  │                                                                      │
  │  If --no-ground-truth was used in Stage 1:                          │
  │                                                                      │
  │  ┌──────────────────┐     ┌──────────────────────┐                  │
  │  │ training.jsonl   │────►│ derive_ground_truth.py│                  │
  │  │ (no GT field)    │     │ --gt-prompt "..."     │                  │
  │  └──────────────────┘     │ --normalize           │                  │
  │                           │                       │                  │
  │                           │ For each record:      │                  │
  │                           │ 1. Extract user msg   │                  │
  │                           │ 2. Send to LLM with   │                  │
  │                           │    topic-agnostic GT   │                  │
  │                           │    prompt              │                  │
  │                           │ 3. Write GT back       │                  │
  │                           └──────────┬────────────┘                  │
  │                                      │                               │
  │                                      ▼                               │
  │                           ┌──────────────────────┐                  │
  │                           │ training.jsonl       │                  │
  │                           │ (with complete GT)   │                  │
  │                           └──────────────────────┘                  │
  │                                                                      │
  │  Why: Per-topic generation suppresses labels from other topics       │
  │  (arXiv:2505.17510). Topic-agnostic GT derivation finds ALL labels. │
  └──────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                           ┌──────────────────────┐
                           │ finetune.py           │
                           │ upload-records        │
                           │ (if not already       │
                           │  uploaded incremental) │
                           └───────────┬───────────┘
                                       │
                                       ▼
                           ┌──────────────────────┐
                           │ Gateway API           │
                           │ POST /finetune/       │
                           │   workflows/{id}/     │
                           │   records             │
                           │                       │
                           │ Transforms:           │
                           │ messages → data.input │
                           │ source_parts → metadata│
                           │ output → {} (empty)   │
                           └──────────────────────┘
```

---

## Two-Stage Generation for Multi-Label Tasks

For multi-label classification or structured-output tasks, a two-stage generation approach prevents single-label suppression (arXiv:2505.17510):

**Stage 1: Generate records without ground truth**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are..." \
  --output finetune-project/training.jsonl \
  --no-ground-truth \
  --records-per-topic 25
```

Stage 1 creates records per-topic, which controls difficulty distribution. The `--no-ground-truth` flag skips GT generation during this phase.

**Stage 2: Derive ground truth topic-agnostically**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/derive_ground_truth.py \
  --input finetune-project/training.jsonl \
  --output finetune-project/training.jsonl
```

`derive_ground_truth.py` derives complete ground truth labels without the topic context that would bias the LLM toward single-label answers. This is critical for multi-label tasks where per-topic generation naturally suppresses co-occurring labels.

**When to use**: Any task where records can belong to multiple categories or require multi-label ground truth. For single-label tasks, the standard single-stage generation (with inline GT) works fine.

**Research basis**: arXiv:2505.17510 shows that generating ground truth within a topic-specific context causes models to suppress labels from other topics, leading to incomplete multi-label annotations.

---

## Difficulty Control

Three mechanisms control record difficulty, each at a different stage:

### At generation time: `--difficulty` flag

| Mode | Flag | Effect |
|------|------|--------|
| Normal (default) | `--difficulty normal` | 5 balanced prompt types (explain/scenario/compare/edge_case/application) |
| Hard | `--difficulty hard` | 4 Evol-Instruct prompt types targeting learnable zone (multi_step/indirect/edge_case/complex_input). Reduces trivial records from ~60% to ~30%. |
| Adaptive | `--difficulty adaptive --eval-scores eval-001.json` | Per-topic: easy topics (base >0.70) get hard prompts, hard topics get normal. Requires prior eval. |

Research: Evol-Instruct (arXiv:2304.12244) mutation operators; arXiv:2603.24202 (medium difficulty achieves best results); arXiv:2508.14094 (hard examples yield 10x more improvement).

### Before upload: `--probe-and-rewrite`

```bash
python3 generate_records.py ... --probe-and-rewrite --workflow-id $WF
```

After generating all records, runs a K=1 probe on each record using the base model, scores through the grader, and rewrites trivial records (score > 0.85) to be harder. Adds harder variants alongside originals.

Defaults to probing with **Qwen3.5-4B** (largest available model). This is a conservative filter — if the 4B model aces a record, it's trivial for ALL models. Override with `--probe-model Qwen3.5-0.8B` only after Step 7b when the training model is known.

Research: arXiv:2505.17063 (Synthetic Data RL: +2.6pp from generate-eval-rewrite loop).

### After eval: `harden-records` (Step 7c++)

Post-eval hardening — see section below.

---

## Post-Eval Hardening (Step 7c++)

After initial generation and evaluation, the readiness gate may detect that too many records are **trivially easy** (score > 0.85) for the base model. Trivial records produce near-zero GRPO gradient because all K=8 completions score similarly. The `harden-records` command fixes this by generating harder variants.

**Signal density fix flow:**
```
eval → readiness-check detects signal density warning
  (trivial > 40% AND learnable < 35%)
         ↓
finetune.py harden-records
  → reads training.jsonl + eval results
  → identifies trivial records (score > 0.85)
  → LLM rewrites each trivial record's user input to be harder
  → ADDS variants alongside originals (does not replace)
         ↓
re-upload records → re-eval → verify improved signal density
```

**How it works**:
- **Domain-agnostic**: The LLM reads the original record + its eval score + the grader's reason, then rewrites the user input to be more challenging. No task-specific templates needed.
- **Additive, not destructive**: Harder variants are added alongside the original records, preserving the original data distribution. The hardened variants get new IDs (e.g., `original-id-hard`).
- **Targeted**: Only records scoring above the threshold (default 0.85) are hardened. Records in the learnable zone (0.30-0.70) are left untouched — they already provide good gradient signal.

**Research basis**: arXiv:2505.17063 demonstrates +29.2% improvement from a generate-eval-rewrite loop. This is consistent with "Hard Examples Are All You Need" (arXiv:2508.14094) showing that hard examples yield 47% gains vs 3-15% for easy ones.

**When to use**: When the readiness gate reports a signal density warning, or when the difficulty probe shows > 40% trivial records. This is an iterative process — harden, re-eval, check signal density again.

---

## Data Flow: What Goes Where

```
                     ┌─────────────────────────────────────────────┐
                     │           PER-TOPIC (shared)                │
                     │                                             │
                     │  composed_prompt = root + ancestors + leaf  │
                     │  part_ids = [from relations.json]           │
                     │  chunk_text = [content from parts]          │
                     │                                             │
                     │  These are the SAME for all records         │
                     │  within a single leaf topic.                │
                     └─────────────────┬───────────────────────────┘
                                       │
                     ┌─────────────────┴───────────────────────────┐
                     │           PER-RECORD (unique)               │
                     │                                             │
                     │  prompt_text = LLM-generated user question  │
                     │  prompt_type = which call generated it      │
                     │  ground_truth = LLM-generated source excerpt│
                     │  id = "{topic_id}-{index:03d}"              │
                     │                                             │
                     │  Each record gets a unique prompt and       │
                     │  ground_truth from the LLM response.        │
                     └─────────────────────────────────────────────┘
```

### What feeds the LLM vs what goes into the record

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    LLM INPUT (meta-prompt)                   │
  │                                                              │
  │  - Prompt-type instruction ─┐                                │
  │    (explain / scenario /    │                                │
  │     compare / edge / apply) │                                │
  │  - topic.name               │ Context for generating         │
  │  - topic.system_prompt      │ diverse, grounded prompts      │
  │  - chunk_text (source       │                                │
  │    material from parts)    ─┘                                │
  │                                                              │
  │  NOT included in LLM input:                                  │
  │  - The composed_prompt (that goes into the record directly)  │
  │  - The --system-prompt CLI arg (composed separately)         │
  └──────────────────────────────────────────────────────────────┘
                              │
                              ▼ LLM generates
  ┌──────────────────────────────────────────────────────────────┐
  │                    LLM OUTPUT                                 │
  │                                                               │
  │  {"items": [                                                  │
  │    {"prompt": "...", "ground_truth": "..."},                  │
  │    {"prompt": "...", "ground_truth": "..."},                  │
  │    ...                                                        │
  │  ]}                                                           │
  └──────────────────────────────────────────────────────────────┘
                              │
                              ▼ Script assembles
  ┌──────────────────────────────────────────────────────────────┐
  │                    TRAINING RECORD                             │
  │                                                               │
  │  {                                                            │
  │    "messages": [                                              │
  │      {"role": "system", "content": composed_prompt},          │
  │             ↑ from compose_system_prompt() — NOT from LLM     │
  │      {"role": "user", "content": item["prompt"]}              │
  │             ↑ from LLM output                                 │
  │    ],                                                         │
  │    "id": "{topic_id}-{index:03d}",                            │
  │    "topic": topic_id,                                         │
  │    "source_parts": part_ids,  ← from relations (per-topic)   │
  │    "prompt_type": "explain",  ← which call generated it      │
  │    "ground_truth": item["ground_truth"]  ← from LLM output   │
  │  }                                                            │
  └──────────────────────────────────────────────────────────────┘
```

### Separation of concerns: system prompt vs source context

```
  ┌─────────────────────────────────────────────────────────┐
  │  System Prompt (messages[0])                             │
  │  ──────────────────────────                              │
  │  PURPOSE: Define the model's ROLE/PERSONA                │
  │  SCOPE:   Per-topic (hierarchical composition)           │
  │  SOURCE:  --system-prompt CLI arg + topic hierarchy      │
  │                                                          │
  │  "You are an expert chess tutor... When analyzing        │
  │   chess positions, identify tactical patterns...         │
  │   For fork opportunities, calculate all candidate..."    │
  │                                                          │
  │  Does NOT contain source material / knowledge parts.     │
  │  The system prompt is about WHO the model is.            │
  └─────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │  Source Context (in the LLM meta-prompt, NOT in record)  │
  │  ──────────────────────────────────────────              │
  │  PURPOSE: Give LLM grounding material to write prompts   │
  │  SCOPE:   Per-topic (same chunks for all records)        │
  │  SOURCE:  knowledge_parts.json via relations.json        │
  │                                                          │
  │  The LLM reads the source material and generates         │
  │  questions ABOUT it. The source content itself does       │
  │  NOT appear in the final training record.                 │
  │                                                          │
  │  Instead, traceability is via:                            │
  │  - source_parts: [part IDs] — which parts were used      │
  │  - ground_truth: concise excerpt — what the answer is     │
  └─────────────────────────────────────────────────────────┘
```

---

## System Prompt Composition

Each training record gets a **composed** system prompt, not just the root `--system-prompt`. The `compose_system_prompt()` function in `generate_records.py` builds it by walking the topic hierarchy:

1. **`build_topic_index(topics)`** — creates a lookup dict from topic ID to topic dict
2. **`get_ancestor_chain(topic, topic_index)`** — walks from leaf to root via `parent_id`, returns `[root, ..., parent]` (excludes the leaf)
3. **`compose_system_prompt(root_prompt, ancestors, leaf)`** — joins segments with a space (`" ".join()`) into a single flowing paragraph:
   - `root_prompt` (the `--system-prompt` CLI argument — the model persona)
   - Each ancestor's `system_prompt` (falls back to the topic's `name` field if missing)
   - The leaf's `system_prompt` (falls back to the topic's `name` field if missing)

**Example**: For a 2-level topic hierarchy with leaf topic "Fork Detection":

```
Root persona:     "You are an expert chess tutor who teaches tactical and strategic concepts."
Domain topic:     "When analyzing chess positions, identify tactical patterns including forks, pins, skewers, and discovered attacks, prioritizing forcing sequences."
Leaf (skill):     "For fork opportunities, calculate all candidate moves that attack two or more pieces simultaneously, evaluating whether the fork is absolute or can be parried."
```

The composed prompt in `messages[0].content` becomes all segments joined with a space into a single flowing paragraph (target: 50-150 words total, 3 segments for a 2-level hierarchy).

Records for different leaf topics get **different composed prompts**, even though they share the same root persona and may share intermediate ancestors. This gives each topic's training records a progressively narrower focus.

---

## Record Format — What Each Field Means

| Field | Required | Example | Purpose |
|-------|----------|---------|---------|
| `messages` | Yes | `[{role, content}, ...]` | The training prompt (system + user) |
| `id` | Yes | `"forks-001"` | Unique ID, appears in eval results |
| `topic` | No | `"forks"` | Links record to topic for coverage analysis |
| `source_parts` | No | `["chess-tactics-ch3"]` | Links record to source material for traceability |
| `prompt_type` | No | `"explain"` | Which prompt type generated this record |
| `ground_truth` | No | `"A knight fork occurs..."` | Source excerpt for grader verification |

### Message roles in training records

| Role | When to include | Count |
|------|----------------|-------|
| `system` | Always (sets the model persona) | Exactly 1, first message |
| `user` | Always (the prompt to practice on) | At least 1 |

**Important**: RFT records contain only `system` + `user` messages — no `assistant` messages. `validate_dataset.py` will flag assistant messages as errors. For multi-turn context, embed prior conversation turns directly in the user message.

---

## CLI Usage

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are an expert chess tutor..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 25 \
  --min-per-topic 10 \
  --max-per-topic 50 \
  --parallel 4 \
  --upload-incremental --workflow-id $WORKFLOW_ID
```

| Arg | Default | Purpose |
|-----|---------|---------|
| `--records-per-topic` | 25 | Target records per leaf topic (equal for all topics by default) |
| `--min-per-topic` | 10 | Floor — even sparse topics get at least this many |
| `--max-per-topic` | 50 | Cap — prevents one topic from dominating |
| `--weight-by-source` | false | Distribute proportionally to linked source parts (max 3:1 ratio) |
| `--parallel` | 1 | Outer parallelism: topics concurrently (max 8). Inner parallelism always on. |
| `--model` | gpt-4o-mini | LLM model for generation |
| `--append` | false | Append to existing file instead of overwriting |
| `--no-ground-truth` | false | Skip generating ground_truth excerpts |
| `--upload-incremental` | false | Upload each topic's records to gateway immediately |

---

## Gateway Upload: Skill Format → API Format

Records are uploaded via `finetune.py upload-records`, which transforms:

```
 SKILL FORMAT (training.jsonl)              GATEWAY API FORMAT (POST body)
 ─────────────────────────────              ────────────────────────────────
 {                                          {
   "messages": [                              "records": [{
     {"role": "system", ...},                   "id": "forks-001",
     {"role": "user", ...}                      "data": {
   ],                                             "input": {
   "id": "forks-001",           ──────►             "messages": [
   "topic": "forks",                                  {"role": "system", ...},
   "source_parts": ["ch3"],                           {"role": "user", ...}
   "prompt_type": "explain",                        ]
   "ground_truth": "..."                          },
 }                                                "output": {}        ← empty (RFT)
                                                },
                                                "topic": "forks",
                                                "metadata": "{\"source_parts\":[\"ch3\"],
                                                              \"prompt_type\":\"explain\",
                                                              \"ground_truth\":\"...\"}",
                                                "is_generated": true
                                              }]
                                            }
```

Key transformations:
- `messages` moves into `data.input.messages`
- `source_parts`, `prompt_type`, and `ground_truth` move into stringified `metadata`
- `output` is set to empty object (RFT — model generates its own output)
- Records are batched 200 per API call to avoid large payloads

---

## Generation Strategies

### Default: Multi-call with prompt types

The script makes 5 parallel LLM calls per topic, each with different instructions and temperature. This is the default behavior — no flags needed.

### Variant generation (Step 4.5)

If some topics are under-represented after the initial pass:
1. Identify under-represented topics (< 50% of average record count per topic)
2. Select seed records from those topics
3. Call `chat_completion.py` asking the LLM to create 3-5 variants per seed — same scenario, different specifics/difficulty/tone
4. Each variant gets `source_record_id` pointing to the original seed record for lineage tracking
5. Keep system prompt and prior turns unchanged — vary only the final user message
6. Append variants to `training.jsonl`

### Post-eval reweighting (future improvement)

After an eval iteration, measure per-prompt-type scores. Shift weight toward types where the base model scores lowest — these "hard examples" yield 47% gains vs 3-15% for easy ones (arXiv:2508.14094).

---

## Validation (Step 5.5)

Before upload, `validate_dataset.py` checks every record:

| Check | What it catches |
|-------|----------------|
| Valid JSON | Malformed lines |
| Has `messages` array | Missing required field |
| Has `id` | Missing required field |
| Has at least one `user` message | System-only records |
| User message >= 10 chars | Empty or trivially short prompts |
| No assistant-only messages | Records that don't follow RFT format |
| No duplicate IDs | Collision from multiple generation passes |
| Record count >= 50 | Too few records for meaningful training |

---

## How to Monitor Progress

### During generation

```bash
# Records generated so far
wc -l finetune-project/training.jsonl 2>/dev/null || echo "not started"

# Records per topic
python3 -c "
import json, collections
c = collections.Counter()
for line in open('finetune-project/training.jsonl'):
    c[json.loads(line).get('topic','unknown')] += 1
for t, n in c.most_common():
    print(f'  {t}: {n}')
print(f'Total: {sum(c.values())}')
" 2>/dev/null

# Records per prompt type
python3 -c "
import json, collections
c = collections.Counter()
for line in open('finetune-project/training.jsonl'):
    c[json.loads(line).get('prompt_type','unknown')] += 1
for t, n in c.most_common():
    print(f'  {t}: {n}')
" 2>/dev/null
```

### After upload (gateway DB)

```bash
DB=~/.vllora/vllora.db
WF_ID=$(sqlite3 $DB "SELECT id FROM workflows ORDER BY created_at DESC LIMIT 1;")

# Total records
sqlite3 $DB "SELECT COUNT(*) FROM workflow_records WHERE workflow_id='$WF_ID';"

# Records per topic
sqlite3 $DB "SELECT topic, COUNT(*) FROM workflow_records WHERE workflow_id='$WF_ID' GROUP BY topic;"
```

---

## Built-in Safeguards

`generate_records.py` has several safeguards to prevent silent data quality issues:

| Safeguard | What it does |
|-----------|-------------|
| **Zero-relation guard** | Skips topics with no source parts instead of generating hallucinated questions. Prints clear warning with remediation advice. |
| **LLM retry** | Retries failed LLM calls once (MAX_LLM_RETRIES=2). Logs each retry attempt and which prompt types failed per topic. |
| **Pre-flight relations check** | Before generation starts, lists all leaf topics with zero relations so you can fix `relations.json` first. |
| **System prompt length warning** | Warns if the composed system prompt exceeds 200 words (target: 50-150). |
| **Enrich-sources caching** | Caches `--enrich-sources` gateway search results by question keywords within each topic to avoid redundant calls. |
| **Per-topic summary table** | Prints `Topic | Target | Got | Sources | Prompt Types` at the end, with ⚠ for shortfalls. |
| **Over-request + trim** | Requests 1.2× the target per topic, then trims to exact count. Compensates for LLM under-delivery. |
| **Relevance filtering** | All retrieval functions (RAG + enrich-sources) skip parts marked `relevant: false`. |

---

## Common Issues

### Few or no records generated

| Symptom | Cause | Fix |
|---------|-------|-----|
| 0 records for a topic | Topic has zero relations (no source parts) | The script **skips** topics with no source material and prints a warning. Add relations via relation-builder or use `--use-rag` |
| 0 records | LLM API key missing or invalid | Check if `OPENAI_API_KEY` is set |
| 0 records | `chat_completion.py` not found | Check `scripts/chat_completion.py` exists |
| <10 records per topic | Some prompt-type calls failed | Check stderr — the script retries once per prompt type and lists failed types per topic |
| All records in one topic | Agent only processed one leaf topic | Check if it looped over all leaves |

### Pre-flight validation

The script runs a **pre-flight check** before generation: it verifies every leaf topic has at least 1 relation. Topics with zero relations are listed upfront as warnings, so you can fix `relations.json` before waiting for LLM calls.

### Records not grounded in source material

- **Symptom**: Prompts are generic ("Tell me about chess") instead of specific ("Explain the Lucena position from Chapter 8")
- **Cause**: `relations.json` is empty, or the generation prompt didn't include source material
- **Check**: Look at `source_parts` in records — empty arrays mean no grounding. The per-topic summary table at the end shows `Sources` count per topic.

### Duplicate or repetitive prompts

- **Cause**: Even with multi-call, overlapping prompt types can produce similar prompts
- **Fix**: **Always** run `deduplicate_records.py --threshold 0.85` after generation. This is mandatory, not optional. Expect 5-15% reduction. If duplicates exceed 20%, the topic hierarchy has too much overlap — consider merging topics.

### Topic distribution is heavily skewed

- **Symptom**: One topic has 50 records, another has 3
- **Check**: The per-topic summary table printed at the end shows `Target` vs `Got` for each topic with ⚠ for shortfalls. Default is equal distribution. If using `--weight-by-source` and weighting looks wrong, adjust `--min-per-topic` / `--max-per-topic` or switch back to equal (drop the flag)

---

## Research References

| Paper | arXiv | Relevance |
|-------|-------|-----------|
| Hard Examples Are All You Need | 2508.14094 | Hard prompts yield 47% gains; edge_case type targets these |
| No Prompt Left Behind | 2509.21880 | Zero-variance prompts waste training; sparse topics need fewer records |
| Synthetic Eggs in Many Baskets | 2511.01490 | Multi-source generation prevents distribution collapse |
| Balancing Cost and Effectiveness | 2409.19759 | New question generation beats rephrasing at scale |
| What Matters in LLM-generated Data | 2506.19262 | Low-diversity synthetic data causes model collapse |
| DeepSeek-R1 | 2501.12948 | GRPO from scratch, K=16 sampling benefits from prompt diversity |
| DAPO | 2503.14476 | Dynamic sampling skips zero-variance; type diversity helps |
| Tricks or Traps | 2508.08221 | Dataset composition bias causes conflicting GRPO results |
