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
    ├─→ Step 4: Generate Records (default)
    │   or Step 4B: NeMo (optional)
    │
    └─→ Step 5: Write Grader        ← parallel with Step 4
            ↓
Step 5.5: Validate Dataset
Step 5.5b: Data Quality Gate
    ↓
Step 7: Evaluate → Train → Iterate
```

Steps 4 and 5 can run in parallel — both depend on Steps 2+3, not on each other.

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
  ├── load_all_parts() ──→ excludes relevant: false
  ├── compose_system_prompt(root, ancestors, leaf) ──→ single flowing paragraph
  ├── For each leaf topic:
  │   ├── Gather linked parts (from relations)
  │   ├── Optional: RAG retrieval (--use-rag) ──→ excludes relevant: false
  │   ├── 5 prompt types × N records per type:
  │   │   explain, scenario, compare/analyze, edge_case, application
  │   └── LLM generates question + tags used_parts ──→ 1-3 parts per record
  │         ↓
  │   Record: {messages, id, topic, source_parts, prompt_type, ground_truth}
  └── Parallel: up to 4 topics concurrently
         ↓
training.jsonl (200+ records)
         ↓
  deduplicate_records.py (threshold 0.85)
         ↓
  upload-records (incremental or batch)
         ↓
  ✓ Records on gateway
```

### Layer 3B: NeMo Alternative (Optional)

```
topics.json
         ↓
  materialize_seed.py (--system-prompt, --topics)
         ↓
  curated-seed.parquet (topic, topic_path, composed_system_prompt, expected_difficulty)
         ↓
  NeMo server (localhost:8000)
  ├── rag-retrieval → retrieved_chunks (from gateway search)
  ├── raw_question → question_chunks → user_message (two-stage)
  ├── reference_answer
  └── judge columns (answerable, groundedness, specificity, relevancy)
         ↓
  nemo-dataset.json
         ↓
  convert_nemo_rows.py (--workflow-id → recovers source_parts via gateway search)
         ↓
  data_quality_gate.py
         ↓
  training.jsonl
         ↓
  ✓ Records on gateway
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
  data_quality_gate.py ─── [HARD/WARN GATE: diversity, duplicates, GT quality, alignment]
         ↓
  ✓ Ready for evaluation (Step 7)
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
  load_all_parts() filters out relevant: false parts
  RAG retrieval (--use-rag) filters out relevant: false parts
  Records only reference relevant knowledge

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
| `data_quality_gate.py` | 5.5b | Hard/Warn | Duplicate IDs, prompt length, diversity, GT quality, alignment | Fix data (regenerate, deduplicate, or adjust) |
