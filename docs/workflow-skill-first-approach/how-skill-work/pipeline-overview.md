# How the Finetune Skill Works — Pipeline Overview

This document explains the full skill pipeline step by step, what happens at each stage, what files are produced, what APIs are called, and how long each step typically takes. Use this to understand what the skill agent is doing at any point during execution.

## Pipeline at a Glance

```
Step 1: Define Objective          (~1 min)    → workflow created on gateway       ↑ uploaded
Step 2: Extract Documents         (~5-15 min) → per-document knowledge parts      ↑ uploaded
Step 3: Build Topic Hierarchy     (~3-5 min)  → topics.json + relations.json      ↑ uploaded
Step 4: Generate Training Data    (~5-20 min) → training.jsonl (50-200+ records)  ↑ uploaded
Step 5: Write Grader              (~2-3 min)  → grader.js                         ↑ uploaded
Step 6: Verify & Hand Off         (~30 sec)   → confirm all data in gateway DB
─────────────────────────────────────────────────────────────────────────────────────────────
Step 7: Eval → Readiness Gate → Train  (~30-90 min) → eval-first, then train   ↑ cloud
Step 8: Analyze Results           (~5-10 min) → eval + training analysis
Step 9: Iterate (If Needed)       (~30-60 min)→ eval-only or post-training fixes
```

**Each step uploads to the gateway immediately** via `scripts/finetune.py` — the vLLora UI shows progress in real time. There is no final "push" step; Step 6 just verifies everything landed correctly.

**Steps 1-6** prepare the dataset. **Steps 7-9** evaluate and train the model. All 9 steps run by default — do NOT stop at Step 6. If the user only asks for data preparation, you may stop at Step 6, but by default run the full pipeline including evaluation and training.

Total: ~20-45 minutes for Steps 1-6 with 3 documents and 100+ records.

## Helper Scripts

All gateway API calls go through `scripts/finetune.py` — a single wrapper script with subcommands:

| Command | Step | What it does |
|---------|------|-------------|
| `finetune.py create-workflow` | 1 | Creates workflow, prints workflow ID |
| `finetune.py upload-knowledge` | 2 | Uploads document + extracted parts |
| `finetune.py upload-topics` | 3 | Uploads topic hierarchy |
| `finetune.py upload-relations` | 3 | Uploads topic-to-part mappings |
| `finetune.py upload-records` | 4 | Transforms JSONL → gateway format, uploads in batches |
| `finetune.py upload-grader` | 5 | Uploads JavaScript grader script |
| `finetune.py verify` | 6 | Checks all data landed in gateway DB |
| `finetune.py status` | any | Full workflow status: gateway data + checkpoint + jobs + next step |
| `finetune.py create-eval` | 7b | Creates evaluation job, saves metadata locally |
| `finetune.py poll-eval` | 7b | Polls eval job until complete, saves results |
| `finetune.py readiness-check` | 7c | Checks if eval results pass pre-training readiness gate (3 hard + 8 soft checks) |
| `finetune.py create-training` | 7d | Creates training job, saves metadata locally |
| `finetune.py poll-training` | 7e | Polls training job until complete, saves status + metrics |
| `finetune.py sync-jobs` | 8 | Syncs training + eval jobs from gateway to local tracking files |
| `finetune.py diagnose-grader` | 9a | Diagnose grader issues: score buckets, reason patterns, grader source, record context check. Tells the agent WHY scores cluster and whether the root cause is DATA or GRADER. |
| `finetune.py delete-knowledge` | — | Delete knowledge source(s) from a workflow |
| `finetune.py print-row-outputs` | 8 | Print epoch table for one row: rollout output, score, reason |

Other helper scripts:

| Script | Step | What it does |
|--------|------|-------------|
| `docling_extract.py` | 2a | Submits PDF(s) to Docling Serve async API, polls until done, supports batch mode |
| `pdftotext_extract.py` | 2a | Fallback PDF extraction via pdftotext (no Docker required), same output schema |
| `extract_tables.py` | 2b | Upgrades text parts to table parts using structured Docling table data (headers, rows, metadata) |
| `consolidate_parts.py` | 2c | Merges adjacent text parts, drops short fragments, fixes Unicode, validates quality |
| `validate_extraction.py` | 2e | Cross-document extraction quality gate (parts/page, title diversity, avg length) |
| `generate_records.py` | 4 | Generates records per leaf topic via LLM (calls `chat_completion.py`). Use `--embed-source-context` for extraction tasks — embeds per-question source excerpts (from ground_truth) into user message as natural "here's the doc, answer this" pattern. System prompt stays unchanged (topic hierarchy). |
| `chat_completion.py` | 4 | Calls LLM API — validates JSON when `response_format` is `json_object` |
| `validate_dataset.py` | 5.5 | Validates JSONL format, fields, RFT compliance, cross-refs topics/parts |
| `dry_run_grader.py` | 5 | Tests grader on one record via gateway sandbox |
| `run_evaluation.py` | 7b | Legacy: Creates eval job, polls until complete. Prefer `finetune.py create-eval` + `poll-eval` |
| `start_training.py` | 7d | Legacy: Starts training job, polls until complete. Prefer `finetune.py create-training` + `poll-training` |
| `analyze_training.py` | 8b | Fetches/analyzes training metrics — reward trend, KL health, clipping, loss stability, per-epoch evals, severity-tagged alerts |
| `print_metrics_table.py` | 8 | Print training metrics table (per-epoch or per-step) — human-readable format |
| `checkpoint.py` | all | Pipeline checkpoint — save/check/reset step progress for crash recovery |

All scripts use PEP 723 inline dependencies. Run with `python3` (requires `requests` package) or `uv run` (auto-installs deps).

## Subagents

The skill uses 3 subagents to handle context-heavy, long-running, or repetitive work in isolated contexts:

| Subagent | Invoked at | What it does | Input | Output |
|----------|-----------|-------------|-------|--------|
| `knowledge-extractor` | Step 2b (parallel, 1 per PDF) | Extracts knowledge from ONE document: polls Docling, builds parts, post-processes, uploads | SKILL_DIR, WORKFLOW_ID, DOC_PATH, DOC_SLUG, DOC_DIR, TASK_ID | `knowledge_parts.json`, `parts-index.json`, gateway upload |
| `relation-builder` | Step 3b | Matches knowledge parts to leaf topics (max 15 per topic) | `all-parts-index.json` + `topics.json` via PROJECT_DIR | `relations.json` |
| `training-monitor` | Step 7e (background) | Polls training metrics every 30s, detects anomalies (NaN loss, KL divergence, overfitting), saves metrics data for post-training analysis | Gateway URL, WORKFLOW_ID, JOB_ID, OUTPUT_DIR | `{JOB_ID}-metrics.json`, `{JOB_ID}-monitor-report.json` |

The main agent delegates to subagents explicitly. Each subagent starts with a fresh context, reads only the files it needs, and returns a structured summary. The `knowledge-extractor` runs in parallel (1 per document) during Step 2. The `training-monitor` runs in the background during Step 7e — it writes a Python script, launches it via `nohup`, and returns immediately.

## Local Files → Gateway Mapping

Each local file maps to a gateway API endpoint. The `finetune.py` script handles all transformations:

| Local file | Gateway endpoint | Transformation |
|-----------|-----------------|----------------|
| *(objective/name)* | `POST /finetune/workflows` | Direct JSON |
| `doc.pdf` + `knowledge_parts.json` | `POST /workflows/{id}/knowledge` + `/parts` | `id` → `reference_id`, removes `source_id` |
| `topics.json` | `POST /workflows/{id}/topics` | Wrapped in `{"topics": [...]}` |
| `relations.json` | `POST /workflows/{id}/topics/relations` | Wrapped in `{"relations": [...]}` |
| `training.jsonl` | `POST /workflows/{id}/records` | `messages` → `data.input.messages`, batched 200/call |
| `grader.js` | `PATCH /workflows/{id}/evaluator` | Wrapped in evaluator config object |

### Record format transformation detail

The skill writes records in **OpenAI format** locally (system content is a composed prompt — see Step 4):
```json
{"messages": [{"role": "system", "content": "You are...\n\nSpecialize in: ...\n\nFocus on: ..."}, {"role": "user", "content": "..."}], "id": "r-001", "topic": "forks", "source_parts": ["chess-tactics-ch3"]}
```

`finetune.py upload-records` transforms each record to **gateway format** before uploading:
```json
{"id": "r-001", "data": {"input": {"messages": [...]}, "output": {}}, "topic": "forks", "metadata": "{\"source_parts\": [\"chess-tactics-ch3\"]}", "is_generated": true}
```

The gateway DB stores the **wrapped format** (`data.input.messages`). The UI handles both formats via `extractMessages()`.

---

## Step 1: Define Objective

**What happens**: The agent asks the user (or infers from the prompt) what the model should learn. It creates a workflow on the gateway with a name, objective, and system prompt.

**Script call**:
```bash
WORKFLOW_ID=$(python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-workflow \
  --name "My Project" --objective "Train a model to..." | tail -1)
```

**Persist the workflow ID** to a config file so it's easy to find later:
```bash
cat > finetune-project/config.json << EOF
{"workflow_id": "$WORKFLOW_ID", "gateway_url": "http://localhost:9090"}
EOF
```

**Files produced**: `finetune-project/config.json` (workflow ID + gateway URL). Data goes straight to the gateway DB.

**How to verify progress**:
```bash
# Check if workflow exists
sqlite3 ~/.vllora/vllora.db "SELECT id, name FROM workflows ORDER BY created_at DESC LIMIT 1;"
```

**Execution log entry**:
```
## Step 1: Define Objective
- [timestamp] Workflow created on gateway
  - ID: <uuid>
  - Name: <project name>
  - Objective: <what the model should do>
  - System prompt: "You are..."
```

---

## Step 2: Extract Documents

This is the longest and most complex step. It has 4 sub-stages.

### 2a-2b. Extract documents via Docling (or pdftotext fallback)

**What happens**: The agent checks if Docling Serve is running on `localhost:5001`. If not, it starts the Docker container. Then it processes each PDF individually using `scripts/docling_extract.py` in single mode — extract, write custom script, consolidate, validate, and upload each document before moving to the next.

**Why individual mode, not batch?** Batch mode (`--batch`) submits all PDFs in parallel but blocks until ALL complete. If one PDF is 84 pages (4 min) and another is 282 pages (15 min), the agent idles for 11 minutes waiting. Individual mode lets the agent fully process small PDFs while Docling works on larger ones.

**Script call** (per document):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/docling_extract.py document.pdf \
  --output finetune-project/knowledge/doc-slug/docling-result.json
```

The script auto-detects whether the PDF is digital or scanned — it skips OCR for digital PDFs (30-50% faster). No manual flags needed.

> **IMPORTANT**: Always use `docling_extract.py` — it uses the async API with polling. Do NOT use curl to hit Docling endpoints directly, as the sync endpoint times out on large documents (>100 pages).

**Internally**, the script calls these Docling endpoints (agents should NOT call these directly):
- `POST /v1/chunk/hybrid/file/async` — submits each document (with `chunking_max_tokens=8192` as safety ceiling, OCR auto-detected)
- `GET /v1/status/poll/{task_id}` — polls until `success` or `failed`
- `GET /v1/result/{task_id}` — fetches the processed result

**What to watch for**:
- Docker may need to pull the Docling image (~2GB) on first run
- Batch mode means total time ≈ slowest PDF, not sum of all
- For large PDFs (200+ pages), extraction can take 10-20 minutes

**Fallback — pdftotext** (when Docker is not available):

Use `scripts/pdftotext_extract.py` — same CLI pattern, zero dependencies (just needs `pdftotext` installed). Outputs `knowledge_parts.json` directly (no `docling-result.json` step):

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/pdftotext_extract.py --batch \
  doc1.pdf:finetune-project/knowledge/doc1/knowledge_parts.json \
  doc2.pdf:finetune-project/knowledge/doc2/knowledge_parts.json
```

Note: pdftotext loses tables, images, and complex layout. Then run `consolidate_parts.py` and `validate_extraction.py` on the output — same as the Docling path.

**Files produced** (per document):
```
finetune-project/knowledge/
├── chess-tactics/              # Slugified filename (not doc-1/)
│   └── docling-result.json    # Raw Docling output (can be 10-50MB+)
├── strategy-guide/
│   └── docling-result.json
└── endgame-manual/
    └── docling-result.json
```

**How to verify progress**:
```bash
# Check which documents have been extracted
ls -lh finetune-project/knowledge/*/docling-result.json
```

### 2c. Process each document into knowledge parts

**What happens**: For each document, the agent:
1. **Reads the Docling result** — examines chunks 0-9, then samples from middle and end to understand the document structure
2. **Writes a Python extraction script** at `knowledge/{doc-slug}/extract.py` — tailored to each document's structure (heading patterns, noise filters, table handling). The script lives inside the per-document directory, NOT in the project root.
3. **Runs the script** — transforms raw Docling output into typed, structured `knowledge_parts.json`
4. **Runs consolidation** — `scripts/consolidate_parts.py` merges adjacent text parts under the same heading, drops short fragments (<50 chars), fixes Unicode escape sequences, reassigns sequential IDs, and regenerates `parts-index.json`

This is where the agent spends the most **context window** — it reads large JSON files to understand the document, then writes custom code. This is the step most likely to get stuck if the Docling result is very large (>30MB).

**Consolidation** (run after the extraction script):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/consolidate_parts.py knowledge/{doc-slug}/knowledge_parts.json
```

This reduces part count (e.g., 1018 raw → 45 consolidated), improves title diversity, and ensures content is long enough for meaningful training data. Use `--dry-run` to validate without modifying.

**Files produced** (per document):
```
finetune-project/knowledge/{doc-slug}/
├── extract.py                # Custom extraction script for THIS document
├── docling-result.json        # From step 2b (already exists)
├── knowledge_parts.json       # Structured parts: text, table, image (consolidated)
└── parts-index.json           # Lightweight index for topic design (regenerated)
```

Where `{doc-slug}` is the slugified filename (e.g., `chess-tactics/`, `strategy-guide/`).

**`knowledge_parts.json` structure**:
```json
{
  "source": {
    "id": "chess-tactics",
    "name": "chess-tactics.pdf",
    "description": "Chess tactics textbook"
  },
  "parts": [
    {
      "id": "chess-tactics-chapter-3",
      "source_id": "chess-tactics",
      "type": "text",
      "title": "Chapter 3: Tactical Motifs",
      "content": "The fork is a tactic where...",
      "extraction_path": "[\"3 Tactical Motifs\"]",
      "extraction_metadata": { "pages": [42, 43], "source_chunks": [20] }
    },
    {
      "id": "chess-tactics-table-1",
      "type": "table",
      "title": "Common Fork Patterns",
      "content": "| Pattern | Frequency | ...",
      ...
    }
  ]
}
```

**`parts-index.json` structure** (lightweight — no full content):
```json
[
  {
    "id": "chess-tactics-chapter-3",
    "type": "text",
    "title": "Chapter 3: Tactical Motifs",
    "extraction_path": "[\"3 Tactical Motifs\"]",
    "pages": [42, 43],
    "content_preview": "The fork is a tactic where a single piece...",
    "source_doc": "chess-tactics.pdf"
  }
]
```

**How to verify progress**:
```bash
# Check which documents have been processed
ls finetune-project/knowledge/*/knowledge_parts.json 2>/dev/null

# Count parts per document
for f in finetune-project/knowledge/*/knowledge_parts.json; do
  echo "$f: $(python3 -c "import json; print(len(json.load(open('$f')).get('parts',[])))" 2>/dev/null) parts"
done
```

### 2d. Merge part indexes

**What happens**: The agent merges all per-document `parts-index.json` files into a single `all-parts-index.json`. This merged index is what downstream steps (topic design, data generation) use — it's small enough to read in context.

**Files produced**:
```
finetune-project/knowledge/
├── all-parts-index.json       # Merged index across all documents
└── extraction-notes.md        # Summary of all documents extracted
```

### 2e. Verify ALL documents were processed

**CRITICAL CHECK — do NOT proceed to Step 3 until this passes.** Two checks run:

**Check 1: Document completeness** — counts source PDFs vs extracted `knowledge_parts.json`:
```bash
DOC_COUNT=$(ls *.pdf 2>/dev/null | wc -l | tr -d ' ')
EXTRACTED_COUNT=$(find finetune-project/knowledge -mindepth 2 -name 'knowledge_parts.json' 2>/dev/null | wc -l | tr -d ' ')
echo "Source documents: $DOC_COUNT | Extracted: $EXTRACTED_COUNT"

if [ "$EXTRACTED_COUNT" -lt "$DOC_COUNT" ]; then
  echo "ERROR: Only $EXTRACTED_COUNT of $DOC_COUNT documents extracted!"
  exit 1
fi
```

**Check 2: Extraction quality gate** — validates all documents pass quality thresholds:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py finetune-project/knowledge/
```

This checks per-document: parts-per-page ratio (>15 = FAIL), short parts (<50 chars, >20% = FAIL), title diversity (<50% = FAIL), avg content length (<100 chars = FAIL), and Unicode encoding issues. Use `--fix` to auto-run `consolidate_parts.py` on failing documents:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

If any documents are missing, the agent goes back to Step 2a-2c. If quality checks fail, the agent re-runs consolidation or fixes the extraction script.

### 2f. Upload knowledge sources

**What happens**: Each document is uploaded as a separate knowledge source with its extracted parts.

**Script call** (per document):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-knowledge \
  --workflow-id $WORKFLOW_ID \
  --file "$DOC" \
  --parts-file "$DOC_DIR/knowledge_parts.json" \
  --name "$DOC" \
  --force
```

The `--force` flag uses PUT upsert — it atomically replaces any existing source with the same name, making re-uploads safe.

**How to verify**:
```bash
# Check merged index
python3 -c "import json; d=json.load(open('finetune-project/knowledge/all-parts-index.json')); print(f'{len(d[\"parts\"])} total parts')"
```

---

## Step 3: Build Topic Hierarchy

**What happens**: The agent designs a topic hierarchy based on the objective and the extracted content. It reads `all-parts-index.json` to understand what material is available, then creates a tree of topics.

After designing topics, it delegates to the **relation-builder subagent** — a separate agent that reads `all-parts-index.json` and `topics.json`, matches parts to topics, and writes `relations.json`.

**Files produced**:
```
finetune-project/
├── topics.json                # Flat array with parent_id for hierarchy
└── relations.json             # Topic → part mappings
```

**`topics.json` structure**:
```json
[
  {"id": "tactics", "name": "Tactical Patterns", "parent_id": null, "system_prompt": "Specialize in: tactical chess patterns and combinations."},
  {"id": "forks", "name": "Forks", "parent_id": "tactics", "system_prompt": "Focus on: fork tactics — knight forks, pawn forks, queen forks."},
  {"id": "pins", "name": "Pins", "parent_id": "tactics", "system_prompt": "Focus on: pin and skewer tactics, absolute vs relative pins."}
]
```

Each topic's `system_prompt` is a **segment** that gets composed with its ancestors during record generation (Step 4). Root topics use `"Specialize in: ..."`, leaf topics use `"Focus on: ..."`. Keep each segment to 1-2 sentences.

**`relations.json` structure**:
```json
[
  {"topic_identifier": "forks", "part_identifier": "chess-tactics-chapter-3"},
  {"topic_identifier": "forks", "part_identifier": "strategy-guide-section-5"},
  {"topic_identifier": "pins", "part_identifier": "chess-tactics-chapter-4"}
]
```

**ID format**: Use the **string reference_id** from `topics.json` and `knowledge_parts.json` — NOT gateway UUIDs. The gateway resolves both `topic_identifier` and `part_identifier` by matching against either the UUID `id` or the string `reference_id` automatically. Do NOT manually query the database to map reference_ids to UUIDs.

**Upload** (immediately after creation):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics --workflow-id $WORKFLOW_ID --file topics.json
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-relations --workflow-id $WORKFLOW_ID --file relations.json
```

**How to verify progress**:
```bash
# Check topics
python3 -c "import json; t=json.load(open('finetune-project/topics.json')); print(f'{len(t)} topics, {len([x for x in t if x[\"parent_id\"] is None])} roots')"

# Check relations
python3 -c "import json; r=json.load(open('finetune-project/relations.json')); print(f'{len(r)} relations')" 2>/dev/null
```

---

## Step 3.5: Categorize Existing Records (optional)

If the user provides existing training data (not generated by the skill), the agent assigns each record to a leaf topic before generating new data. This step is skipped when generating all data from scratch.

**How it works**: The agent reads the existing records and `topics.json`, then uses the LLM to classify each record into the most appropriate leaf topic based on its content. The `topic` field is set on each record.

---

## Step 4: Generate Training Data

**What happens**: For each leaf topic, the agent:
1. Finds related parts via `relations.json`
2. Reads the full content from the relevant `{doc-slug}/knowledge_parts.json`
3. Composes a hierarchical system prompt by walking up the topic tree (root persona + ancestor system_prompts + leaf system_prompt)
4. Calls an LLM (via `scripts/chat_completion.py`) to generate user prompts grounded in that content
5. Writes each record to `training.jsonl` with the composed system prompt

This step makes **multiple LLM API calls** — typically one per leaf topic, each generating 10 prompts. With 15-20 leaf topics, that's 15-20 API calls.

**External dependency**: Requires an LLM API key (OpenAI, etc.) configured for `chat_completion.py`.

**Which files to read for source material**: The agent reads full part content from `{doc-slug}/knowledge_parts.json` files (not the merged index, which only has previews). It uses `all-parts-index.json` to locate which document a part belongs to.

**Files produced**:
```
finetune-project/
└── training.jsonl             # One JSON record per line
```

**Record format** (OpenAI/skill format — no assistant messages for RFT):
```json
{"messages": [{"role": "system", "content": "You are an expert chess tutor...\n\nSpecialize in: tactical chess patterns and combinations.\n\nFocus on: fork tactics — knight forks, pawn forks, queen forks."}, {"role": "user", "content": "Explain the knight fork"}], "id": "forks-001", "topic": "forks", "source_parts": ["chess-tactics-chapter-3"]}
```

The system message is a **composed prompt** — `generate_records.py` walks up the topic hierarchy and joins the root persona (`--system-prompt`) with ancestor and leaf `system_prompt` segments. Each leaf topic gets a different composed prompt. See `generate-records-deep-dive.md` for the composition logic.

**Upload** (immediately after generation):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --workflow-id $WORKFLOW_ID --file training.jsonl
```

The script transforms records from skill format to gateway format automatically (see [Local Files → Gateway Mapping](#local-files--gateway-mapping)).

**How to verify progress**:
```bash
# Count records generated so far
wc -l finetune-project/training.jsonl 2>/dev/null

# Check topic distribution
python3 -c "
import json, collections
topics = collections.Counter()
for line in open('finetune-project/training.jsonl'):
    r = json.loads(line)
    topics[r.get('topic','unknown')] += 1
for t, c in topics.most_common():
    print(f'  {t}: {c}')
print(f'Total: {sum(topics.values())}')
" 2>/dev/null
```

### Step 4.5: Variant Generation (optional)

If some topics are under-represented, the agent generates variants from existing records — varying scenario, difficulty, tone while keeping the system prompt unchanged.

**How it works**:
1. Identify under-represented topics (< 50% of average record count)
2. Select seed records from those topics
3. Call `chat_completion.py` asking the LLM to create 3-5 variants per seed — same scenario, different specifics/difficulty/tone
4. Each variant gets `source_record_id` pointing to the original seed record for lineage tracking
5. Append variants to `training.jsonl`

---

## Step 5: Write Grader

**What happens**: The agent reads sample records from `training.jsonl`, analyzes what good vs. bad responses look like, then writes a JavaScript grader function. The grader scores model responses 0-1 using either programmatic checks, LLM-as-judge, or a hybrid.

It then dry-runs the grader against a sample row via the gateway's QuickJS sandbox to verify it works:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID \
  --script grader.js \
  --row '{"messages": [...]}'
```

The dry-run sends the grader + one record to the gateway sandbox and returns `{score, reason}` instantly. If the script has syntax errors, the `reason` field contains the JS error. The sandbox does NOT support `console.log`.

**Upload** (immediately after writing):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file grader.js
```

**Files produced**:
```
finetune-project/
└── grader.js                  # JavaScript grader function
```

### Step 5.5: Validate Dataset

The agent runs `validate_dataset.py` against `training.jsonl` to check:
- Valid JSON on every line
- Required fields present (`messages`, `id`)
- No assistant messages (RFT format)
- No duplicate IDs
- No trivially short user messages (< 10 chars)
- Minimum record count (≥ 50, recommend 100-200+)
- Cross-references topic IDs against `topics.json` (with `--topics` flag)
- Cross-references source_parts against `all-parts-index.json` (with `--parts` flag)

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

---

## Step 6: Verify & Hand Off

**What happens**: Since each step already uploaded data to the gateway, Step 6 just verifies everything landed correctly. The agent runs the verify command and confirms all counts are > 0.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

Output:
```
Workflow: <uuid>
  Records: 214 [OK]
  Topics: 18 [OK]
  Sources: 3 [OK]
  Parts: 33 [OK]
  Relations: 42 [OK]
  Evaluator: YES

All checks passed. Ready for evaluation.
```

The UI at `http://localhost:5173/finetune` shows progress throughout the run — not just at the end.

### When each piece becomes visible in the UI

| After step | What appears in UI |
|------------|-------------------|
| Step 1 | Workflow card on the finetune list page |
| Step 2 | Knowledge sources + parts in the Sources view |
| Step 3 | Topic hierarchy on the Canvas view, coverage bars |
| Step 4 | Records in the Table view, record counts on topic nodes |
| Step 5 | Grader indicator, evaluation becomes possible |

---

## Step 7: Evaluate & Validate Before Training (Eval-First Flow)

**What happens**: The agent runs an **eval-first loop**: evaluate with the base model, check the readiness gate, fix issues, re-eval — and only start training after the readiness gate passes. This prevents wasting hours of GPU time on bad data or a broken grader.

**Key insight**: Eval is fast (~45 min) and cheap. Training is slow (hours) and expensive.

```
Eval → Readiness Gate → [FAIL] → Fix data/grader → Re-eval → ... → [PASS] → Train
```

**Time**: ~45 min per eval iteration + hours for training.

### 7a. Pre-training validation (RFT-specific)

Before creating any eval job, the agent validates:
1. **Grader score distribution** — dry-run the grader on 3-5 sample records with varying quality responses. Check that scores spread across 0-1, not cluster at extremes.
2. **max_output_tokens** — default is 512. Only increase if >50% clipping in training metrics.
3. **Validation set** — split training.jsonl into train (80%) and validation (20%) for reward hacking detection.

### 7b. Create eval job (eval-only — NO training yet)

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations
```

Poll eval in foreground:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval \
  --file evaluations/eval-001.json
```

### 7c. Pre-Training Readiness Gate

After eval completes, check if data and grader are ready for training:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file evaluations/eval-001.json
```

The readiness gate runs **3 hard checks** (grader quality) and **8 soft checks** (quality signals):

**Hard checks** (must ALL pass — these ask "is the grader working?", not "is the model good?"):
| Check | Pass criteria | Research basis |
|-------|--------------|----------------|
| Sample count | >= 50 records | OpenAI RFT: "several dozen to a few hundred" |
| Score std | > 0.10 (grader differentiates) | Zero-variance → zero gradient is fundamental to GRPO (DAPO §2.2). Threshold is a heuristic. |
| Average score | > 0.05 (some signal present) | OpenAI: "0% success rate means RFT cannot bootstrap" |

**Soft checks** (warnings — training can proceed):
| Check | Pass criteria | Research basis |
|-------|--------------|----------------|
| Score concentration | < 50% at single value | DAPO (arXiv:2503.14476): filters uniform groups. Threshold is a heuristic. |
| High score fraction | < 50% scores > 0.9 | Heuristic. Lenient grader → weak within-group variance. |
| Binary fraction | < 60% exact 0/1 | DeepSeek-R1 and DAPO use 100% binary rewards successfully. Binary works but is less sample-efficient. |
| Dead-weight | < 50% records score < 0.1 | "No Prompt Left Behind" (arXiv:2509.21880): 30-99% zero-var is normal |
| Pass rate | > 20% records score > 0.7 | Hard prompts are most valuable (arXiv:2508.14094) |
| Prompt learnability | > 30% prompts have varied scores | DAPO §2.2: dynamic sampling filters zero-variance groups |
| Score-length correlation | < 0.3 | Dr. GRPO (arXiv:2503.20783) identifies length bias. Threshold is a heuristic. |
| Topic balance | No single topic > 40% | Heuristic — balanced data is standard ML practice |

**Decision:**
- **Exit code 0 (PASS)** → All checks passed → proceed to Step 7d (Start Training)
- **Exit code 1 (FAIL)** → Hard check(s) failed → fix issues → return to Step 7b (Re-eval)
- **Exit code 2 (WARN)** → Only soft checks failed, or 1 hard check failed marginally (within 80% of threshold). **Not all WARNs are safe to train through**: if `score_concentration` > 70%, fix the grader first (most K=8 groups will score identically → zero gradient → wasted GPU hours). Other soft warnings (pass_rate, binary_frac, dead_weight) are safe to proceed.

**Max 5 eval-only iterations.** If readiness gate never passes, escalate to user.

### 7d. Start Training (only after readiness gate passes)

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "unsloth/Qwen3.5-4B" \
  --output-model "project-v1" \
  --output-dir training-jobs
```

**Base model selection:**
| Model | Best for |
|-------|----------|
| `unsloth/Qwen3.5-4B` | Fast experiments, narrow tasks |
| `unsloth/Qwen3.5-9B` | Complex reasoning, broad domains |

**GRPO training defaults** (research-validated):
| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `learning_rate` | **1e-6** | Universal consensus: DeepSeekMath, DAPO, Dr. GRPO, TRL all use 1e-6 |
| `response_candidates_count` | **8** (minimum) | GRPO needs multiple candidates for advantage estimation |
| `warmup_steps` | **20-50** | DAPO uses 20, "Tricks or Traps" uses 50 |

**Epoch guidelines** (RFT ≠ SFT — fresh responses each epoch, no repetition risk. Published work: "Tricks or Traps" uses 50 epochs; OpenAI says "hundreds or thousands"):
| Records | Recommended epochs |
|---------|-------------------|
| < 50 | 15-30 |
| 50-200 | 10-20 |
| > 500 | 5-10 |

### 7e. Monitor training

Spawn the `training-monitor` subagent. It writes a Python monitoring script that polls metrics every 30s, detects 6 anomaly types, and saves metrics for post-training analysis. Returns immediately.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training-jobs/train-001.json \
  --poll-interval 60 --max-wait 7200
```

**Files produced**:
```
finetune-project/evaluations/
└── eval-001.json              # Eval results (per-record scores)
finetune-project/training-jobs/
├── train-001.json             # Training job metadata + status
├── {JOB_ID}-metrics.json      # Raw metrics from monitor
└── {JOB_ID}-monitor-report.json  # Anomaly report from monitor
```

**This step can also be done via the vLLora UI** — click "Run Evaluation" or "Start Training" on the workflow page.

---

## Step 8: Analyze Results

**What happens**: The agent analyzes results at two points: after eval (Step 8a) and after training (Step 8b). Before analyzing, it syncs jobs from the gateway to pick up any status changes from the UI.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py sync-jobs \
  --workflow-id $WORKFLOW_ID --output-dir finetune-project
```

> **Read `reference/analysis-strategy.md`** before analyzing. It has decision trees, action templates, derived metrics to compute, and interactive presentation guidelines.
> **Read `reference/training-metrics-guide.md`** for GRPO metric interpretation.

### 8a. Analyze eval results (before training)

This runs during the eval-first loop (Step 7b→7c). Compute:

1. **Overall**: average score, pass rate (>0.7 threshold), score range
2. **Per-topic breakdown**: group scores by topic, sort by average (weakest first)
3. **Low-scoring records**: list records <0.7 with their `reason` fields
4. **Score distribution**: are scores spread out (good) or clustered (grader issue)?
5. **Readiness gate output**: which criteria passed/failed

Then run the readiness gate (Step 7c) to decide: fix + re-eval, or proceed to training.

**Filter dead-weight records**: Find records where max score < 0.1 (dead weight for GRPO), diagnose why, remove them, regenerate replacements if needed.

### 8b. Analyze training results (after training completes)

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
  --metrics-file training-jobs/$JOB_ID-metrics.json \
  --epoch-evals-file training-jobs/$JOB_ID-epoch-evals.json
```

The script computes reward trend, KL health, clipping ratio, loss stability, grad norm spikes, signal strength, and per-topic trajectories.

**Present findings interactively:**
```
=== Evaluation Results ===
Average score: 0.72 | Pass rate: 78% | Records: 209

Per-topic breakdown:
  strategic-endgame:     0.45 (lowest)
  tactical-forks:        0.91 (strong)

=== Training Results ===
Reward: 0.2 → 0.7 | KL: stable | No anomalies

=== Suggested Actions ===
1. [RECOMMENDED] Regenerate records for "strategic-endgame"
2. [OPTIONAL] Tighten grader on "concrete_examples"

What would you like to do?
```

### 8c. Update iteration tracker

After every eval/training cycle, append a summary to `iterations.md`.

### 8d. Quick diagnosis patterns

| Signal | Likely cause | Suggested action |
|--------|-------------|-----------------|
| All scores ~0 | Grader broken or too strict | Fix grader, dry-run, re-eval |
| All scores ~1 | Grader too lenient | Add harder criteria, re-eval |
| **>50% scores at one value** | **Grader too coarse OR data missing source text** | Run `diagnose-grader` to identify root cause. For extraction tasks: check if records include source document text (`--embed-source-context`). For all tasks: check grader for score snapping, refusal partial credit. |
| One topic consistently low | Weak prompts or poor source material | Regenerate records, add source material |
| Good responses scoring low | Grader criteria misaligned | Adjust criteria weights or LLM judge prompt |
| NaN/Inf loss in training | Numerical failure (check completion clipping first) | Check truncation, then lower LR |
| KL very high but reward improving | **Normal with beta=0** (modern GRPO default per DAPO/TRL — KL is unpenalized and not even tracked in most frameworks) | No action needed |
| train_reward up, valid_reward flat | **Reward hacking** | Improve grader, increase KL penalty, inspect outputs |
| Reward plateau | Grader not differentiating well | Improve grader for smoother score spread |
| Reward collapse | Grader binary or reward hacking | Rewrite grader with partial credit |
| No learning across epochs | Task too hard for base model | Try larger base model |
| Overfitting (peak then decline) | Too many epochs | Reduce `epochs` to peak epoch |

---

## Step 9: Iterate (If Needed)

**What happens**: Two iteration loops with different speeds and costs.

> **For full iteration diagnosis and escalation strategy**, read `reference/iteration-strategy.md`.

### 9a. Eval-only iteration (readiness gate failed — fast, cheap)

**Step 1: Diagnose.** Always run `diagnose-grader` first to understand the root cause:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py diagnose-grader \
  --file evaluations/eval-001.json --workflow-id $WORKFLOW_ID
```
This shows score distribution, reason patterns per bucket, auto-diagnosis (DATA vs GRADER root cause), the grader source code, and whether records include source document text.

**Step 2: Fix based on diagnosis.** The root cause is often DATA, not just the grader:

| diagnose-grader says | Root cause | Fix |
|---|---|---|
| "EXTRACTION TASK BUT RECORDS MISSING SOURCE TEXT" | **DATA** | Regenerate with `generate_records.py --embed-source-context`, re-upload |
| "Model refuses to answer" + short records | **DATA** | Same — records need source document text (for extraction tasks only) |
| "Grader gives same score" + records have source text | **GRADER** | Edit grader.js, remove score snapping, add early-exit for refusals |
| Both issues | **BOTH** | Fix data first, then grader |

**Fixing the data** (extraction task — records missing source text):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics topics.json --relations relations.json --knowledge-dir knowledge \
  --system-prompt "You are..." --output training.jsonl \
  --embed-source-context --records-per-topic 10
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file training.jsonl
```

**Fixing the grader** (no data re-upload needed):
```bash
# Edit grader.js based on diagnose-grader output, then:
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

Return to Step 7b — create a new eval and re-run the readiness gate. ~45 min per iteration.

### 9b. Post-training iteration (training completed but unsatisfactory)

1. **Only hyperparams need adjusting** — skip eval, go directly to Step 7d with new training config
2. **Data or grader needs fixing** — apply fixes, return to Step 7b (re-eval first, then training)
3. **Model too weak** — try a larger base model (4B → 9B)

### 9c. Iteration limits and escalation

- **Max 5 eval-only iterations** before training. If readiness gate never passes, escalate to user.
- **Max 3 training iterations.**
- **Base model escalation:** After 2 failed iterations on the same model: `Qwen3.5-4B` → `9B`.
- **When to stop:** User says satisfied, OR avg score > 0.8 AND training reward > 0.7, OR 3+ iterations with no improvement.
- **Auto-iterate in non-interactive mode:** When running via `claude -p`, the orchestrator auto-applies the top-priority fix and re-evals without asking.

---

## Common Bottlenecks

| Symptom | Likely cause | How to check |
|---------|-------------|--------------|
| Stuck after Step 1 | Docling not running or Docker pull in progress | `curl http://127.0.0.1:5001/health` and `docker ps` |
| Only 1 of N `docling-result.json` files | Still polling or a task failed | Check Docling task status via the poll API |
| `docling-result.json` exists but no `knowledge_parts.json` | Agent struggling to process large JSON (>30MB) | Check execution log for Python tracebacks |
| Topics created but no `relations.json` | Relation-builder subagent hasn't run or failed | Check `execution-log.md` for "relation-builder" entries |
| Few records in `training.jsonl` | LLM API rate limiting or key missing | Check if `OPENAI_API_KEY` is set; check agent output for errors |
| `finetune.py` upload fails | Gateway not running or wrong endpoint | `curl http://localhost:9090/health` |
| Extraction script errors | Bad Docling result or document-specific edge case | Check `execution-log.md` for Python errors in Step 2c |
| Grader dry-run fails | JS syntax error in grader | Check the `reason` field in dry-run response |
| Records uploaded but UI shows blank | Record format mismatch | Check `data` column in DB — should be `{"input":{"messages":...}}` |

## File System Timeline

During a successful run, files appear in this order:

```
t=0    finetune-project/execution-log.md           ← Step 1 starts
t=1m   (workflow created in gateway DB)             ← Step 1 done, UI shows workflow card

t=2m   knowledge/chess-tactics/docling-result.json    ← Step 2b (first doc done)
t=3m   knowledge/strategy-guide/docling-result.json  ← Step 2b (second doc done)
t=4m   knowledge/endgame-manual/docling-result.json  ← Step 2b (third doc done)
t=6m   knowledge/chess-tactics/knowledge_parts.json  ← Step 2c (first doc extracted + consolidated)
t=6m   knowledge/chess-tactics/parts-index.json
t=8m   knowledge/strategy-guide/knowledge_parts.json ← Step 2c (second doc extracted + consolidated)
t=10m  knowledge/endgame-manual/knowledge_parts.json ← Step 2c (third doc extracted + consolidated)
t=10m  knowledge/all-parts-index.json               ← Step 2d (merged)
t=10m  knowledge/extraction-notes.md
t=10m  (knowledge sources uploaded to gateway)       ← UI shows Sources view

t=12m  topics.json                                  ← Step 3
t=14m  relations.json                               ← Step 3 (relation-builder)
t=14m  (topics + relations uploaded to gateway)      ← UI shows Canvas view

t=15m  training.jsonl (growing)                     ← Step 4 (records appear incrementally)
t=25m  training.jsonl (final)                       ← Step 4 done
t=25m  (records uploaded to gateway)                 ← UI shows Table view

t=27m  grader.js                                    ← Step 5
t=27m  (grader uploaded to gateway)                  ← UI shows evaluation ready

t=28m  (verified all data in gateway DB)             ← Step 6 done

t=29m  evaluations/eval-001.json (creating)         ← Step 7b (eval-only, no training yet)
t=74m  evaluations/eval-001.json (results)           ← eval complete
t=74m  (readiness gate check)                        ← Step 7c
t=74m  [PASS] → training starts                      ← Step 7d
t=74m  training-jobs/train-001.json (creating)       ← training job
t=74m  training-monitor launched (background)        ← Step 7e
t=2-4h training-jobs/train-001.json (complete)       ← training done
t=2-4h training-jobs/{JOB_ID}-metrics.json           ← monitor metrics saved
t=2-4h iterations.md (updated)                       ← Step 8e
```

## Monitoring a Running Skill Agent

Use this one-liner to check progress at any time. Set `PROJECT_DIR` to your test workspace:

```bash
PROJECT_DIR=finetune-project

echo "=== Execution Log (last 5 lines) ==="
tail -5 "$PROJECT_DIR/execution-log.md" 2>/dev/null || echo "  (not started)"

echo -e "\n=== Docling Results ==="
ls -lh "$PROJECT_DIR/knowledge/*/docling-result.json" 2>/dev/null || echo "  (none yet)"

echo -e "\n=== Knowledge Parts ==="
for f in "$PROJECT_DIR/knowledge/*/knowledge_parts.json"; do
  [ -f "$f" ] && echo "  $f: $(python3 -c "import json; print(len(json.load(open('$f')).get('parts',[])))" 2>/dev/null) parts"
done
ls "$PROJECT_DIR/knowledge/all-parts-index.json" 2>/dev/null && echo "  Merged index: YES" || echo "  Merged index: NO"

echo -e "\n=== Topics ==="
[ -f "$PROJECT_DIR/topics.json" ] && python3 -c "import json; t=json.load(open('$PROJECT_DIR/topics.json')); print(f'  {len(t)} topics')" 2>/dev/null || echo "  (not created)"

echo -e "\n=== Relations ==="
[ -f "$PROJECT_DIR/relations.json" ] && python3 -c "import json; r=json.load(open('$PROJECT_DIR/relations.json')); print(f'  {len(r)} relations')" 2>/dev/null || echo "  (not created)"

echo -e "\n=== Training Data ==="
[ -f "$PROJECT_DIR/training.jsonl" ] && echo "  $(wc -l < "$PROJECT_DIR/training.jsonl") records" || echo "  (not started)"

echo -e "\n=== Grader ==="
[ -f "$PROJECT_DIR/grader.js" ] && echo "  YES ($(wc -l < "$PROJECT_DIR/grader.js") lines)" || echo "  (not written)"

echo -e "\n=== Gateway DB ==="
DB=~/.vllora/vllora.db
WF_ID=$(sqlite3 $DB "SELECT id FROM workflows ORDER BY created_at DESC LIMIT 1;" 2>/dev/null)
if [ -n "$WF_ID" ]; then
  echo "  Workflow: $WF_ID"
  echo "  Records: $(sqlite3 $DB "SELECT COUNT(*) FROM workflow_records WHERE workflow_id='$WF_ID';")"
  echo "  Topics: $(sqlite3 $DB "SELECT COUNT(*) FROM workflow_topics WHERE workflow_id='$WF_ID';")"
  echo "  Sources: $(sqlite3 $DB "SELECT COUNT(*) FROM knowledge_sources WHERE workflow_id='$WF_ID';")"
else
  echo "  (no workflow found)"
fi
```
