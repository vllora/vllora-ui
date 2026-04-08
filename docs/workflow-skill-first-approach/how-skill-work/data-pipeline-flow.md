# Data Pipeline Flow: PDF to Training Records

Visual reference for the complete data pipeline. Shows what transforms happen at each step, what files are produced, where gates enforce quality, and how relevance filtering flows through the system.

---

## Dependency Graph

```
Step 1: Define Objective
    ↓
Step 2: Extract Documents
    ↓ (hard gate: extraction validated + gateway verified)
Step 3: Build Topic Hierarchy
    ↓ (relevance filter applied, topics + relations uploaded)
Step 3.5: Categorize Existing Records (optional — only if records pre-exist)
    ↓
    │ (SEQUENTIAL — Step 5 needs sample records from Step 4)
    Step 4: Generate Records (default)
         or Step 4B: NeMo (optional)
         derive_ground_truth.py (MANDATORY for multi-label/set-output tasks;
           skip only for single-answer QA/MCQ/extraction tasks)
    ↓
Step 4.5: Topic Balance Check
    ↓
    Step 5: Write Grader
    ↓
Step 5.5: Validate Dataset
Step 5.5b: Data Quality Gate (includes GT distribution diversity checks)
    ↓
Step 6: Verify & Hand Off
    ↓
Step 7: Evaluate → Readiness Gate → [Harden Records] → Headroom Gate → Train
    ↓
Step 8: Analyze Results (eval + training)
    ↓
Step 9: Iterate (if needed — fix data/grader, re-eval/retrain)
```

Step 5 (Write Grader) must run after Step 4 (Generate Records) — the grader needs sample records to identify domain-specific scoring criteria.

---

## Complete Data Flow

### Layer 1: PDF → Knowledge Parts (Step 2)

```
pdfs/doc-1.pdf    pdfs/doc-2.pdf    pdfs/doc-3.pdf
      ↓                 ↓                 ↓
   Docling Serve (or pdftotext fallback)
      ↓                 ↓                 ↓
   docling-result.json (per document)
      ↓                 ↓                 ↓
   build_knowledge_parts.py (deterministic)
      ↓                 ↓                 ↓
   knowledge_parts.json    parts-index.json     ← relevant: null at this stage
   (full content)          (lightweight index)
      ↓                 ↓                 ↓
   upload to gateway (knowledge source + parts)
      ↓                 ↓                 ↓
      └────────────┬────────────┘
                   ↓
         merge all parts-index.json
                   ↓
         all-parts-index.json (all parts, relevant: null)
                   ↓
         validate_extraction.py ─── [HARD GATE]
           • Part count > 0 per document
           • Parts-per-page ≤ 15 (FAIL) / ≥ 1 (WARN incomplete)
           • Short parts (<50 chars) ≤ 5% WARN / ≤ 20% FAIL
           • Title diversity ≥ 50% (no single title > 50% of parts)
           • Unicode/encoding sanity (no replacement chars)
                   ↓
         verify gateway upload ──── [HARD GATE]
           • Source count == #PDFs uploaded
           • Parts count per source matches local knowledge_parts.json
           • Source names match PDF filenames exactly
                   ↓
         ✓ Ready for Step 3
```

### Layer 2: Knowledge → Topics + Relations (Step 3)

```
all-parts-index.json (relevant: null)
         ↓
  ┌──────────────────────────────────────────────┐
  │ 3a. RELEVANCE FILTER                         │
  │   For each part: does it serve the OBJECTIVE? │
  │   Write relevant: true/false back to index    │
  │   Result: 60 relevant out of 200 total        │
  └──────────────────────────────────────────────┘
         ↓
all-parts-index.json (relevant: true/false)    ← filtering decision persisted
         ↓ (relevant: true parts only)
  ┌──────────────────────────────────────────────┐
  │ 3b. DESIGN TOPICS                            │
  │   Identify skills from relevant content       │
  │   Organize by skill, NOT document structure   │
  │   Merge overlapping skills across documents   │
  │   2-level hierarchy: Domain → Skill           │
  │   Difficulty as metadata (expected_difficulty) │
  └──────────────────────────────────────────────┘
         ↓
topics.json (flat array, parent_id hierarchy)
         ↓
  ┌──────────────────────────────────────────────┐
  │ 3c. WRITE SYSTEM PROMPT SEGMENTS             │
  │   Root: "You are..." (persona + behavior)     │
  │   Domain: behavioral instruction (When/For)   │
  │   Leaf: specific focus (action verbs)         │
  │   Self-check: 4-point quality gate            │
  └──────────────────────────────────────────────┘
         ↓
topics.json (with system_prompt segments)
         ↓
  ┌──────────────────────────────────────────────┐
  │ 3d. BUILD RELATIONS                          │
  │   relation-builder subagent                   │
  │   Links relevant parts → leaf topics          │
  │   Only relevant: true parts linked            │
  │   Max 15 parts per topic                      │
  └──────────────────────────────────────────────┘
         ↓
relations.json (topic_identifier → part_identifier)
         ↓
  Upload: topics + relations + relevance labels
         ↓
  ✓ Ready for Steps 4 + 5

```

### Layer 3: Topics + Knowledge → Records (Step 4)

```
topics.json + relations.json + knowledge_parts.json files
         ↓
  generate_records.py
  ├── Pre-flight: warn for leaf topics with zero relations (would be SKIPPED)
  ├── load_all_parts() ──→ only relevant parts (filtered in Step 3a)
  ├── compose_system_prompt(root, ancestors, leaf) ──→ single flowing paragraph (warn if >200 words)
  ├── For each leaf topic:
  │   ├── Guard: skip if 0 source parts (no relations + no RAG) → warn, don't hallucinate
  │   ├── Gather linked parts from relations (curated in Step 3d — NOT augmented with RAG)
  │   ├── 5 prompt types × N records per type (with retry on failure):
  │   │   explain, scenario, compare/analyze, edge_case, application
  │   └── LLM generates question + tags used_parts ──→ 1-3 parts per record
  │         ↓
  │       --enrich-sources: re-query gateway with generated question → enrich source_parts (cached)
  │         ↓
  │   Record: {messages, id, topic, source_parts, prompt_type, ground_truth}
  ├── Parallel: up to 4 topics concurrently
  └── Summary table: Topic | Target | Got | Sources | Prompt Types

  Alternative: --rag-only mode (skip Step 3d, use gateway semantic search instead of relations)
         ↓
training.jsonl (200+ records)
         ↓
  deduplicate_records.py (threshold 0.85) ← MANDATORY
         ↓
  ┌──────────────────────────────────────────────────────────────┐
  │ TWO-STAGE GT — MANDATORY for multi-label / set-output tasks  │
  │ (allergen detection, ICD coding, tagging, entity extraction).│
  │ Skip only for single-answer QA / MCQ / single-field extract. │
  │ Source: SKILL.md Step 4 "Multi-label GT completeness         │
  │ (critical for set-output tasks)" — arXiv:2505.17510.         │
  │                                                              │
  │  training.jsonl ──► derive_ground_truth.py                   │
  │  (no GT field)      --gt-prompt "..." --overwrite            │
  │                     • Reads each record's user message        │
  │                     • Calls LLM topic-agnostically to list   │
  │                       ALL labels/entities                    │
  │                     • Overwrites the ground_truth field      │
  │                           │                                  │
  │                           ▼                                  │
  │                     training.jsonl (with complete GT)         │
  │                           │                                  │
  │                           ▼                                  │
  │                     finetune.py reconcile-topics             │
  │                     --apply --max-per-topic 30               │
  │                     --min-per-topic 25                        │
  │                     (re-assigns drifted records; HARD FAIL   │
  │                      if any topic < 25 — see feedback memo)   │
  │                                                              │
  │  Topic-agnostic GT derivation prevents single-label          │
  │  suppression in multi-label tasks (arXiv:2505.17510).        │
  │  Reconciliation fixes the ~7% topic drift Stage 2 creates.   │
  └──────────────────────────────────────────────────────────────┘
         ↓
  upload-records (incremental or batch)
         ↓
  ✓ Records on gateway
```

### Layer 3B: NeMo Alternative (Optional — requires NeMo server at localhost:8000)

```
topics.json + root system prompt
         ↓
  materialize_seed.py (NeMo repo — not in this skill)
         ↓
  curated-seed.parquet
  ├── topic, topic_name, topic_path
  ├── composed_system_prompt  (root + ancestors + leaf — same as generate_records.py)
  └── expected_difficulty     (from topic metadata — NOT random)
         ↓
  NeMo server (localhost:8000)
  ├── POST /seed/upload-curated  → upload parquet
  ├── POST /seed/inspect-curated → verify schema
  └── POST /jobs → recipe execution
         ↓
  Recipe column pipeline (12 columns):
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  1. retrieved_chunks    = rag-retrieval(topic_path → gateway search)    │
  │  2. topic_context       = expression(topic_path) [seed passthrough]     │
  │  3. difficulty          = expression(expected_difficulty) [from seed]    │
  │  4. raw_question        = llm-text(topic + chunks → question)    [DROP] │
  │  5. question_chunks     = rag-retrieval(raw_question → search)   [DROP] │
  │  6. system_prompt       = expression(composed_system_prompt) [SEED]     │
  │  7. user_message        = llm-text(refine raw_question + chunks)        │
  │  8. reference_answer    = llm-text(answer from chunks)                  │
  │  9. judge_answerable    = llm-judge(binary 0/1)                         │
  │ 10. judge_groundedness  = llm-judge(0/0.5/1)                            │
  │ 11. judge_specificity   = llm-judge(binary 0/1)                         │
  │ 12. score_relevancy     = rag-relevancy(Jaccard overlap)                │
  └──────────────────────────────────────────────────────────────────────────┘
         ↓
  Preview job (10 rows) → review → Full job
         ↓
  GET /jobs/{id}/dataset → nemo-dataset.json
         ↓
  convert_nemo_rows.py
  ├── filters by judge scores (answerable=1, groundedness≥0.75, specificity≥0.75)
  ├── --workflow-id → recovers source_parts via gateway search
  └── maps to training.jsonl format
         ↓
  data_quality_gate.py (format/structure — complements judge columns)
         ↓
  validate_dataset.py --nemo
         ↓
  upload-records
         ↓
  ✓ Records on gateway

  ⚠️ Known limitations:
  - rag-retrieval does NOT filter by relevant:true/false (NeMo server issue)
  - source_parts are recovered via re-query (approximate, not exact)
  - system_prompt MUST come from seed (expression), NOT LLM-generated per row
  - materialize_seed.py lives in NeMo repo, not finetune-skill
```

### Layer 3.5: Categorize Existing Records (Step 3.5 — only if records pre-exist)

```
user-supplied records.jsonl + topics.json
         ↓
  Assign each record to a leaf topic (no LLM needed if record already tagged)
         ↓
  Merge into training.jsonl — then continue at Step 4.5
```

Skipped entirely when generating all data from scratch in Step 4.

### Layer 3.75: Topic Balance Check (Step 4.5)

```
training.jsonl (post-dedupe, post-reconcile)
         ↓
  Count records per leaf topic
         ↓
  ┌──────────────────────────────────────────────┐
  │ HARD GATE: every leaf topic ≥ 25 records     │
  │ (generated at 30 to absorb drift/removal)    │
  │ Source: SKILL.md Step 4.5 —                  │
  │ "MANDATORY: minimum 25 records per leaf       │
  │  topic AFTER reconciliation."                 │
  └──────────────────────────────────────────────┘
         ↓
  On fail → diagnose root cause → fix prompt/topic →
  regenerate with `generate_records.py --append` →
  re-dedupe → re-reconcile → re-check
         ↓
  ✓ Ready for Step 5
```

### Layer 4: Knowledge + Topics → Grader (Step 5)

```
all-parts-index.json + topics.json + (training.jsonl if Step 4 finished)
         ↓
  ┌──────────────────────────────────────────────┐
  │ Analyze domain from extracted content:        │
  │   Read knowledge parts for rules/formulas     │
  │   Read topics for skill areas                 │
  │   Read sample records (if available)          │
  │   Identify 3-5 domain-specific criteria       │
  └──────────────────────────────────────────────┘
         ↓
  Copy closest grader template → customize domain parts
         ↓
grader.js
         ↓
  dry_run_grader.py --row ──── [HARD GATE: hand-crafted test]
    • Grader file parses (no JS syntax errors)
    • Returns {score, reason} for a synthetic perfect answer
    • Returns {score, reason} for a synthetic wrong answer
    • Scores differ (grader actually discriminates)
  dry_run_grader.py --live ─── [HARD GATE: live model test]
    • Real base-model completion passes through grader
    • Extraction/parsing handles actual model output format
    • No uncaught exceptions on messy live output
         ↓
  upload-grader
         ↓
  ✓ Grader on gateway
```

#### Grader Templates (`finetune-skill/templates/`)

Pick the template whose scoring architecture matches the task type — the Layer 4
box "Copy closest grader template" step resolves to one of these:

| Template | Task type | Scoring approach | When to pick |
|---|---|---|---|
| `grader-template.js` | Generic / freeform | Checklist rubric (decomposed yes/no criteria) + stratified correctness gate (correct: 0.5–1.0, wrong: 0.0–0.5). Conciseness via rubric criterion. | Default starting point for any task that doesn't fit one of the specialised templates. Based on Rubrics-as-Rewards (arXiv:2507.17746) and HERO stratification (arXiv:2510.07242). |
| `grader-classification.js` | Single-label classification (sentiment, intent, triage, severity) | LLM label extraction + fuzzy match vs GT + LLM-judge explanation quality. 4-tier: 0.8–1.0 correct+good, 0.6–0.7 correct+weak, 0.2–0.4 related wrong, 0.05–0.20 wrong attempted. NEVER 0.0 for attempted answers. | Closed label set, exactly one correct label per record. |
| `grader-multilabel.js` | Multi-label set comparison (allergens, ICD codes, tags, entity extraction, moderation flags) | Regex + LLM fallback parsing → set comparison with F-beta (default β=0.5 precision-heavy). Per-FP penalty (0.15 each), precision floor (< 0.67 caps at 0.40), OOV/duplicate counted as FP. | Model outputs a SET of labels from a fixed vocabulary. Defends MO-GRPO over-prediction exploit (arXiv:2509.22047). |
| `grader-mcq.js` | MCQ / short-answer QA with verifiable answer | Regex + LLM extraction fallback, programmatic correctness, LLM-judge reasoning. 4-tier: 0.9–1.0 correct+strong reasoning, 0.6–0.8 correct+weak, 0.1–0.4 wrong+reasoning, 0.0 empty/refusal. Soft word-count penalty on WRONG only; brevity bonus on CORRECT. | Questions with a single verifiable answer in `ground_truth` (A/B/C/D, numeric, named entity). |
| `grader-extraction.js` | Structured data extraction (metrics, fields, entities from docs) | Field-level F0.5 (β=0.5), per-field hallucination penalty (0.1–0.2), precision floor cap 0.5 if precision < 0.75, LLM-judge CONCISENESS criterion. | Extract specific fields from documents; hallucination must be penalised harder than misses. |
| `grader-compliance.js` | Multi-rule application (FDA, tax, legal, medical coding) | Rule recall + false-citation penalty + citation accuracy + LLM-judge explanation + conciseness. | Model applies multiple rules simultaneously and cites them. If purely set-based, prefer `grader-multilabel.js`. |
| `grader-readability.js` | Plain-language simplification (ELI5, contract-to-English, medical-to-patient) | Weighted: readability + accuracy preservation + jargon elimination + completeness. Accuracy weighted ≥ 40% to defend MO-GRPO criterion-hacking. Target grade level + forbidden jargon list. | Simplification/translation tasks where accuracy must not be sacrificed for readability. |

All templates share three cross-cutting GRPO defences: (1) never return `score=0.0`
for an attempted non-empty answer (use 0.02–0.05 minimum — see feedback memo
`feedback_grader_no_zero_hard_gate`), (2) stratified correctness tiers so wrong-but-fluent
cannot outscore partially-correct, (3) conciseness as a rubric/LLM-judge criterion, not
a uniform word-count penalty (DRPO anti-pattern, arXiv:2510.04474).

### Layer 5: Final Validation (Steps 5.5 + 5.5b)

```
training.jsonl + topics.json + all-parts-index.json
         ↓
  validate_dataset.py ──── [HARD GATE: JSON, fields, RFT, references]
    • Every line parses as JSON
    • Required fields present (messages, id, topic, source_parts)
    • No `assistant` messages in training records (RFT format)
    • topic references resolve to a valid leaf in topics.json
    • source_parts references resolve to real part IDs
         ↓
  data_quality_gate.py ─── [HARD/WARN GATE — see reference/data-quality-gate.md]
    Gate 1 Structural (free):
      • Record count ≥ 50 [HARD]
      • Duplicate IDs = 0 [HARD]
      • Empty user prompts = 0 [HARD]
      • Short prompts < 20 chars [WARN]
      • GT coverage ≥ 70% [WARN]
      • Topic count ≥ 3 leaf topics [WARN]
      • Topic dominance: no topic > 40% [WARN]
      • Topic balance: no topic < 50% of median count [HARD]
      • Thin topics: ≥ 5 records per topic [WARN]
      • Missing system prompts = 0 [WARN]
      • Orphan topic IDs = 0 [WARN]
    Gate 2 Diversity (free, trigram Jaccard):
      • Near-duplicate fraction < 10% at 0.85 similarity [WARN]
      • Avg pairwise distance ≥ 0.40 [WARN]
      • Per-topic avg distance ≥ 0.35 [WARN]
      • GT dominance: most-common exact GT ≤ 25% [WARN]
      • Label skew: no single label > 40% of records [WARN]
      • GT uniqueness: ≥ 10% unique GT values [WARN]
    Gate 3 GT Quality (LLM-judge, samples 30 by default):
      • Mean GT score ≥ 0.60 (specificity 0.4 + completeness 0.3
        + actionability 0.3) [WARN]
      • Low-quality GT fraction (< 0.4) < 20% [WARN]
    Gate 4 Prompt-GT Alignment (LLM-judge):
      • Mean alignment ≥ 0.60 [WARN]
      • Misaligned (< 0.4) fraction < 15% [WARN]
    Gate 5 Completion Length (free):
      • Estimated P95 ≤ max_output_tokens [HARD] — adaptive ×2/×3/×5
        multiplier on GT length by system-prompt size
      • Estimated truncation fraction > 5% [WARN], > 30% [HARD]
         ↓
  ✓ Ready for evaluation (Step 7)
```

### Layer 5.5: Verify & Hand Off (Step 6)

```
training.jsonl + topics.json + grader.js (all uploaded to gateway)
         ↓
  finetune.py verify --workflow-id $WORKFLOW_ID
  ├── Records count  > 0  (GET /finetune/workflows/{id})
  ├── Topics count   > 0  (GET /finetune/workflows/{id}/topics)
  ├── Sources count  > 0  (GET /finetune/workflows/{id}/knowledge)
  ├── Parts count    > 0  (sum over sources)
  ├── Relations count > 0 (GET /finetune/workflows/{id}/topics/relations)
  └── Evaluator = YES     (workflow.eval_script is set)
  All six must pass; any MISSING → exit 1, re-upload the missing artifact.
         ↓
  ✓ Ready for Step 7 (Evaluate)
```

### Layer 6a: Eval → Readiness → Train (Step 7)

```
workflow records + grader (on gateway)
         ↓
  finetune.py create-eval --model Qwen3.5-4B      (7b: eval 4B)
  finetune.py create-eval --model Qwen3.5-0.8B    (7b: eval 0.8B)
         ↓
  poll-eval → evaluations/eval-NNN.json
         ↓
  finetune.py readiness-check
  --file evaluations/eval-NNN.json
  --training-file training.jsonl
  --objective-target-tokens <spec>
  HARD checks (all must pass — see reference/readiness-gate.md):
    • Sample count ≥ 50
    • Score std > 0.10   (grader differentiates)
    • Average score > 0.05  (some nonzero signal)
    • Zero-score fraction < 10%
    • spec_mismatch not flagged (gt_p95 ≤ target×2)
    • length_drift_risk not flagged (resp_p95 ≤ gt_p95×2)
  SOFT / WARN checks (training can proceed, some need eyes):
    • Score concentration at single value < 50%
      (> 70% → fix grader first — not safe to train)
    • Fraction scores > 0.9  < 50%
    • Fraction exact 0 or 1  < 60%
    • Dead-weight fraction (score < 0.1) < 50%
    • Pass rate (>0.7)       > 20%
    • Prompt learnability    > 30%
    • Score-length correlation < 0.3
    • Topic balance: no topic > 40% of records
  Headroom gate (HARD, both bounds):
    • 4B avg score in [0.05, 0.75] — below → capability fail;
      above → eval smaller model (0.8B/2B) or reframe task
         ↓
  Compare learnable_frac across models → choose best
         ↓
  finetune.py difficulty-probe  (signal density)
         ↓
  (optional) finetune.py harden-records  — see Layer 6 below
         ↓
  finetune.py create-training --base-model <chosen>
  finetune.py poll-training [--no-early-stop when intentionally disabling monitor auto-cancel]
  ├── training-monitor subagent watches epoch evals
  └── auto-cancel on clipping, EMA plateau/degradation, or length exploitation unless `--no-early-stop`
```

### Layer 6: Post-Eval Signal Density Fix (Step 7c++ — optional)

```
eval results (per-record scores)
         ↓
  readiness-check → detects signal density warning
  (trivial > 40% AND learnable < 35%)
         ↓
  finetune.py harden-records
    --eval-file evaluations/eval-NNN.json
    --training-file training.jsonl
    --min-score 0.85     (trivial threshold; dead-band fix uses 0.10)
  Process (see cmd_harden_records in finetune.py):
    1. Load eval results → build {record_id: (best_score, reason)}
       using the highest-epoch score per record.
    2. Select records where score ≥ --min-score (default 0.85).
       Default heuristic: apply when trivial% > 40% AND learnable% < 35%
       on the chosen model (per readiness-gate.md).
    3. For each trivial record, build a domain-agnostic LLM prompt
       containing: the score, grader reason, system prompt (first 300 ch),
       current user message, and ground truth.
    4. LLM rewrites ONLY the user message to require deeper reasoning
       while keeping the SAME ground_truth. System prompt and topic
       assignment are not changed.
    5. Validate the rewritten record (GT still answerable from linked
       parts, lineage tracked via evolved_from pointing at the original).
    6. ADD the harder variant alongside the original (originals kept as
       anchors per arXiv:2603.24202). No record is replaced or deleted.
  Output: training.jsonl with new `evolved_from` records appended.
         ↓
  training.jsonl (original + hardened variants)
         ↓
  re-upload records → re-eval → verify improved signal density
         ↓
  ✓ Better GRPO gradient signal (arXiv:2505.17063: +29.2% from generate-eval-rewrite)
```

### Layer 7: Analyze & Iterate (Steps 8 + 9)

```
eval results + training jobs
         ↓
  finetune.py sync-jobs --workflow-id $WORKFLOW_ID
         ↓
  Step 8a: Analyze eval — overall, per-topic, bottom/top 20% records
  Step 8b: Analyze training — reward curves, clipping, length drift
         ↓
  finetune.py log-iteration --phase training
         ↓
  Decision:
  ├── PASS → hand off model
  └── FAIL → Step 9: fix data/grader → back to Step 4.5 / 5 / 7
```

Step 8 and Step 9 do not produce new data files — they read eval/training artifacts and
drive the next iteration. See [reference/analysis-strategy.md](../../../finetune-skill/reference/analysis-strategy.md).

---

## Relevance Filtering Lifecycle

The `relevant` field tracks which extracted parts serve the workflow objective. It flows through the entire pipeline:

```
Step 2 (Extract):
  parts-index.json created → relevant: null (not yet classified)

Step 3a (Filter):
  Agent evaluates each part against OBJECTIVE
  Writes relevant: true or false to all-parts-index.json
  Uploads labels to gateway via update-part-relevance

Step 3d (Relations):
  relation-builder only links relevant: true parts to topics
  Irrelevant parts never appear in relations.json

Step 4 (Generate):
  Only relevant parts reach here (filtered in Step 3a)
  Relations link only relevant parts (curated in Step 3d)
  Records only reference relevant knowledge
  (--rag-only mode: gateway search has safety-net filter for relevant:false)

Step 4B (NeMo):
  ⚠ rag-retrieval plugin does NOT filter by relevance (known limitation)
  convert_nemo_rows.py filters when recovering source_parts

Step 5 (Grader):
  Reads all-parts-index.json — sees labels but uses full knowledge

UI:
  Parts display blue "Relevant" or orange "Irrelevant" badge
  Stats bar shows "X relevant, Y excluded"
```

---

## Files Produced at Each Step

| Step | File | Location | Description |
|------|------|----------|-------------|
| 2 | `docling-result.json` | `knowledge/{slug}/` | Raw Docling extraction output |
| 2 | `knowledge_parts.json` | `knowledge/{slug}/` | Typed, linked parts (full content) |
| 2 | `parts-index.json` | `knowledge/{slug}/` | Lightweight index (id, type, title, preview, relevant) |
| 2 | `all-parts-index.json` | `knowledge/` | Merged index across all documents |
| 3 | `all-parts-index.json` | `knowledge/` | Updated with `relevant: true/false` labels |
| 3 | `topics.json` | `finetune-project/` | Flat topic array with system_prompt segments |
| 3 | `relations.json` | `finetune-project/` | Topic → part mappings (relevant parts only) |
| 4 | `training.jsonl` | `finetune-project/` | Training records (system + user messages) |
| 4B | `curated-seed.parquet` | `finetune-project/` | NeMo seed (one row per leaf topic) |
| 4B | `nemo-dataset.json` | `finetune-project/` | Raw NeMo output rows |
| 4B | `nemo-metadata.jsonl` | `finetune-project/` | Judge scores sidecar |
| 4 | *(derive_ground_truth.py)* | *(updates training.jsonl in-place)* | Derives complete GT topic-agnostically. **MANDATORY for multi-label / set-output tasks** (Stage 2 of two-stage generation). Skip only for single-answer QA / MCQ / single-field extraction. Source: SKILL.md Step 4. |
| 4 | *(finetune.py reconcile-topics)* | *(updates training.jsonl in-place)* | Re-assigns records whose derived GT contradicts their topic (mandatory after derive_ground_truth) |
| 5 | `grader.js` | `finetune-project/` | JavaScript grader function |
| 5.5b | `data-quality-report.json` | `finetune-project/` | Quality gate results |
| 7 | `evaluations/eval-NNN.json` | `finetune-project/evaluations/` | Eval job file + per-record scores (one per model evaluated) |
| 7 | `difficulty-report.json` | `finetune-project/` | Signal density breakdown (trivial/learnable/dead) from difficulty-probe |
| 7 | `training-jobs/train-NNN.json` | `finetune-project/training-jobs/` | Training job file + epoch metrics |
| 7/8 | `execution-log.md` | `finetune-project/` | Progression table + iteration journal (log-iteration) |

---

## Gates and Validation Checkpoints

| Gate | Step | Type | What It Checks | On Failure |
|------|------|------|----------------|------------|
| `validate_extraction.py` | 2d | Hard | Part count, title diversity, short parts, Unicode | Re-extract with adjusted thresholds |
| Gateway upload verify | 2e | Hard | Source count matches docs, parts count per source, source names match PDF filenames | Delete and re-upload with correct `--file` path |
| Relevance filter review | 3a | Soft | Parts classified as relevant/irrelevant | Log summary, review with user if many excluded |
| System prompt self-check | 3c | Soft | Trigger words, action verbs, no root repetition, natural flow | Rewrite segments |
| Grader dry-run (hand-crafted) | 5.1 | Hard | Syntax errors, basic scoring logic | Fix grader code |
| Grader dry-run (live) | 5.1 | Hard | Real model output compatibility | Fix extraction/parsing to handle actual formats |
| `validate_dataset.py` | 5.5 | Hard | JSON validity, required fields, no assistant messages, topic/parts cross-references | Fix records |
| `data_quality_gate.py` | 5.5b | Hard/Warn | Duplicate IDs, prompt length, diversity, GT quality, alignment, gt_dominance, label_skew, low_gt_uniqueness, topic balance (hard fail) | Fix data (regenerate, deduplicate, or adjust) |
| `finetune.py reconcile-topics` | 4 | Hard | Every topic ≥ `--min-per-topic` after topic-drift reassignment | Regenerate gap topics with `--append` (commands printed on failure) |
| Topic balance check | 4.5 | Hard | Every leaf topic ≥ 25 records | Diagnose → fix prompt/topic → regenerate with `--append` |
| `finetune.py verify` | 6 | Hard | Source/part/topic/record counts > 0 on gateway, grader uploaded, evaluator = YES | Re-upload missing artifacts |
| `finetune.py readiness-check` | 7c | Hard | samples ≥ 50, std > 0.10, avg 0.05–0.75, zero_frac < 10%, no `spec_mismatch`, no `length_drift_risk` | Fix data/grader/GT per check → re-eval |
| `finetune.py difficulty-probe` | 7c+ | Hard/Warn | learnable ≥ 30% pass, 15–30% warn, < 15% fail | Harden records (Step 7c++) or rewrite grader |
| `finetune.py diagnose-clipping` | 7f | Hard | Diagnoses A (config tight), B (grader drift), C (spec mismatch) on auto-cancel | Apply the specific fix (cap, grader penalty, or GT regen) before restarting training |
