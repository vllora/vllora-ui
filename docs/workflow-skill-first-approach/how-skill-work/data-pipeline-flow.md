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
    │
    ↓ (SEQUENTIAL — Step 5 needs sample records from Step 4)
    Step 4: Generate Records (default)
         or Step 4B: NeMo (optional)
         optional: derive_ground_truth.py (two-stage GT for multi-label)
    ↓
    Step 5: Write Grader
            ↓
Step 5.5: Validate Dataset
Step 5.5b: Data Quality Gate (includes GT distribution diversity checks)
    ↓
Step 7: Evaluate → Readiness Gate → [Harden Records] → Headroom Gate → Train → Iterate
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
                   ↓
         verify gateway upload ──── [HARD GATE: source count, parts count, names]
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
  │ TWO-STAGE GT (if --no-ground-truth was used in Stage 1):    │
  │                                                              │
  │  training.jsonl ──► derive_ground_truth.py                   │
  │  (no GT field)      --gt-prompt "..." --normalize            │
  │                           │                                  │
  │                           ▼                                  │
  │                     training.jsonl (with complete GT)         │
  │                                                              │
  │  Topic-agnostic GT derivation prevents single-label          │
  │  suppression in multi-label tasks (arXiv:2505.17510)         │
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
  dry_run_grader.py --live ─── [HARD GATE: live model test]
         ↓
  upload-grader
         ↓
  ✓ Grader on gateway
```

### Layer 5: Final Validation (Steps 5.5 + 5.5b)

```
training.jsonl + topics.json + all-parts-index.json
         ↓
  validate_dataset.py ──── [HARD GATE: JSON, fields, RFT, references]
         ↓
  data_quality_gate.py ─── [HARD/WARN GATE: diversity, duplicates, GT quality, alignment,
                            gt_dominance, label_skew, low_gt_uniqueness, topic balance hard fail,
                            GT distribution diversity (label coverage, multi-label completeness)]
         ↓
  ✓ Ready for evaluation (Step 7)
```

### Layer 6: Post-Eval Signal Density Fix (Step 7c++ — optional)

```
eval results (per-record scores)
         ↓
  readiness-check → detects signal density warning
  (trivial > 40% AND learnable < 35%)
         ↓
  harden_records.py
  ├── Reads training.jsonl + eval results
  ├── Identifies trivial records (score > 0.85)
  ├── For each trivial: LLM rewrites user input to be harder
  ├── Domain-agnostic: reads record + score + grader reason
  └── ADDS harder variants alongside originals (no replacement)
         ↓
  training.jsonl (original + hardened variants)
         ↓
  re-upload records → re-eval → verify improved signal density
         ↓
  ✓ Better GRPO gradient signal (arXiv:2505.17063: +29.2% from generate-eval-rewrite)
```

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
| 4 | *(derive_ground_truth.py)* | *(updates training.jsonl in-place)* | Derives complete GT topic-agnostically for multi-label tasks (optional — Stage 2 of two-stage generation) |
| 5 | `grader.js` | `finetune-project/` | JavaScript grader function |
| 5.5b | `data-quality-report.json` | `finetune-project/` | Quality gate results |

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
