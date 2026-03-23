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
Step 7: Start Eval & Training     (~5-30 min) → eval + training jobs (parallel)    ↑ cloud
Step 8: Analyze & Present         (~5-10 min) → interactive findings + user choice
Step 9: Iterate (If Needed)       (~30-60 min)→ apply fixes, new jobs (max 5x)
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

Other helper scripts:

| Script | Step | What it does |
|--------|------|-------------|
| `docling_extract.py` | 2a | Submits PDF(s) to Docling Serve async API, polls until done, supports batch mode |
| `pdftotext_extract.py` | 2a | Fallback PDF extraction via pdftotext (no Docker required), same output schema |
| `extract_tables.py` | 2b | Upgrades text parts to table parts using structured Docling table data (headers, rows, metadata) |
| `consolidate_parts.py` | 2c | Merges adjacent text parts, drops short fragments, fixes Unicode, validates quality |
| `validate_extraction.py` | 2e | Cross-document extraction quality gate (parts/page, title diversity, avg length) |
| `generate_records.py` | 4 | Generates records per leaf topic via LLM (calls `chat_completion.py`) |
| `chat_completion.py` | 4 | Calls LLM API — validates JSON when `response_format` is `json_object` |
| `validate_dataset.py` | 5.5 | Validates JSONL format, fields, RFT compliance, cross-refs topics/parts |
| `dry_run_grader.py` | 5 | Tests grader on one record via gateway sandbox |
| `run_evaluation.py` | 7a | Creates eval job, polls until complete |
| `start_training.py` | 7b | Starts training job, polls until complete (alternative to direct curl used by SKILL.md) |
| `analyze_training.py` | 8 | Fetches/analyzes training metrics — reward trend, KL health, clipping, loss stability, per-epoch evals, severity-tagged alerts |
| `upload_dataset.py` | — | Cloud dataset upload (standalone, not used in pipeline) |

All scripts use PEP 723 inline dependencies and run via `uv run scripts/<name>.py`.

## Subagents

The skill uses 3 subagents to handle context-heavy, long-running, or repetitive work in isolated contexts:

| Subagent | Invoked at | What it does | Input | Output |
|----------|-----------|-------------|-------|--------|
| `execution-logger` | After every action | Appends timestamped entries to `execution-log.md` | Step name, action, results | Updated log file |
| `relation-builder` | Step 3b | Matches knowledge parts to leaf topics | `all-parts-index.json` + `topics.json` | `relations.json` |
| `training-monitor` | Step 7b (background) | Polls training metrics, detects anomalies (NaN loss, KL divergence, overfitting), saves metrics data for post-training analysis | Gateway URL, workflow ID, job ID | `{JOB_ID}-metrics.json`, `{JOB_ID}-status.json`, `{JOB_ID}-epoch-evals.json` |

The main agent delegates to subagents explicitly. If a subagent fails, check `execution-log.md` for error entries. The `training-monitor` runs in the background during Step 7b — it watches for anomalies and saves all metrics so `analyze_training.py` can run without re-fetching from the API.

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
WORKFLOW_ID=$(uv run scripts/finetune.py create-workflow \
  --name "My Project" --objective "Train a model to..." \
  --system-prompt "You are..." | tail -1)
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
uv run scripts/docling_extract.py document.pdf \
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
uv run scripts/pdftotext_extract.py --batch \
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
uv run scripts/consolidate_parts.py knowledge/{doc-slug}/knowledge_parts.json
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
uv run scripts/validate_extraction.py finetune-project/knowledge/
```

This checks per-document: parts-per-page ratio (>15 = FAIL), short parts (<50 chars, >20% = FAIL), title diversity (<50% = FAIL), avg content length (<100 chars = FAIL), and Unicode encoding issues. Use `--fix` to auto-run `consolidate_parts.py` on failing documents:
```bash
uv run scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

If any documents are missing, the agent goes back to Step 2a-2c. If quality checks fail, the agent re-runs consolidation or fixes the extraction script.

### 2f. Upload knowledge sources

**What happens**: Each document is uploaded as a separate knowledge source with its extracted parts.

**Script call** (per document):
```bash
uv run scripts/finetune.py upload-knowledge \
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
uv run scripts/finetune.py upload-topics --workflow-id $WORKFLOW_ID --file topics.json
uv run scripts/finetune.py upload-relations --workflow-id $WORKFLOW_ID --file relations.json
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
uv run scripts/finetune.py upload-records --workflow-id $WORKFLOW_ID --file training.jsonl
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
uv run scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID \
  --script grader.js \
  --row '{"messages": [...]}'
```

The dry-run sends the grader + one record to the gateway sandbox and returns `{score, reason}` instantly. If the script has syntax errors, the `reason` field contains the JS error. The sandbox does NOT support `console.log`.

**Upload** (immediately after writing):
```bash
uv run scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file grader.js
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
uv run scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

---

## Step 6: Verify & Hand Off

**What happens**: Since each step already uploaded data to the gateway, Step 6 just verifies everything landed correctly. The agent runs the verify command and confirms all counts are > 0.

```bash
uv run scripts/finetune.py verify --workflow-id $WORKFLOW_ID
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

## Step 7: Start Evaluation & Training (Parallel)

**What happens**: On the first run, the agent starts both an evaluation job and a training job simultaneously. They run on the cloud in parallel — there's no prior data to analyze, so there's no reason to wait for eval before training.

**Time**: 5-30 minutes depending on record count and model speed. Both run concurrently.

### 7a. Create evaluation job

```bash
uv run scripts/run_evaluation.py --dataset-id $WORKFLOW_ID --output evaluations/eval-v1.json
```

Or manually via the API:
```bash
EVAL=$(curl -s -X POST http://localhost:9090/finetune/evaluations \
  -H "Content-Type: application/json" \
  -d "{\"dataset_id\": \"$WORKFLOW_ID\", \"rollout_model_params\": {\"model\": \"gpt-4o-mini\"}}")
EVAL_ID=$(echo "$EVAL" | python3 -c "import sys,json; print(json.load(sys.stdin)['evaluation_run_id'])")
echo "Eval started: $EVAL_ID"
```

### 7b. Create training job

```bash
JOB=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "dataset": "'$WORKFLOW_ID'",
    "base_model": "unsloth/Qwen3.5-4B",
    "output_model": "chess-tutor-v1",
    "display_name": "Training run 1",
    "training_config": {
      "learning_rate": 0.00001,
      "lora_rank": 8,
      "gradient_accumulation_steps": 5,
      "epochs": 2,
      "batch_size": 5
    },
    "inference_parameters": {
      "max_output_tokens": 1000,
      "temperature": 1.0,
      "top_p": 1.0,
      "response_candidates_count": 2
    }
  }')
JOB_ID=$(echo "$JOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Training started: $JOB_ID"
```

**Base model selection:**
| Model | Best for |
|-------|----------|
| `unsloth/Qwen3.5-4B` | Fast experiments, narrow tasks |
| Larger models (7B+) | Complex reasoning, broad domains |

**Config adjustments (initial):**
| Situation | Adjustment |
|-----------|------------|
| < 50 records | `epochs: 1` (avoid overfitting) |
| > 500 records | `epochs: 3-4` |
| Complex task | `lora_rank: 16` |
| Simple task | `lora_rank: 4` |

### 7c. Poll both jobs

Poll both jobs until they complete. Report progress to the user as results arrive:

```bash
# Poll eval
EVAL_STATUS=$(curl -s "http://localhost:9090/finetune/evaluations/$EVAL_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))")

# Poll training
JOB_STATUS=$(curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs/$JOB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))")
```

As each job completes, save results:
- Eval results → `evaluations/eval-v1.json`
- Training results → `training-jobs/job-v1.json` (fetch via `GET /finetune/workflows/$WORKFLOW_ID/dataset/finetune-evaluations?finetune_job_id=$JOB_ID`)

**Files produced**:
```
finetune-project/evaluations/
└── eval-v1.json               # Full evaluation results
finetune-project/training-jobs/
└── job-v1.json                # Training job results
```

**This step can also be done via the vLLora UI** — click "Run Evaluation" or "Start Training" on the workflow page.

---

## Step 8: Analyze Results & Present Findings

**What happens**: Once results arrive (eval, training, or both), the agent analyzes and presents findings to the user. The analysis is **interactive** — present what you found and let the user drive the next action.

> **Read `reference/analysis-strategy.md`** before analyzing. It has decision trees, action templates, derived metrics to compute, and interactive presentation guidelines.

### 8a. What to analyze

**From eval results:**
- Average score across all records
- Per-topic score breakdown (which topics score lowest?)
- Score distribution (all 0s? all 1s? smooth spread?)
- Common `reason` patterns in low-scoring records
- Pass rate (score > threshold)

**From training results (per-epoch):**
- Reward progression (improving? plateauing? declining?)
- Loss curve (decreasing? NaN/Inf?)
- KL divergence (stable? exploding?)
- Per-record score trends across epochs
- Lowest-scoring records and their `reason` fields

**Cross-referencing (when both available):**
- Do eval-weak topics also score low in training?
- Did training improve on the topics that eval flagged?
- Is the grader consistent between eval and training?

### 8b. Present to user interactively

**Show a clear summary:**
```
=== Evaluation Results ===
Average score: 0.72 | Pass rate: 78% | Records: 209

Per-topic breakdown:
  strategic-endgame:     0.45 (lowest — 5 of 11 records below threshold)
  tactical-forks:        0.91 (strong)
  opening-principles:    0.68
  ...

=== Training Results ===
Epochs: 2 | Final reward: 0.65 | Trend: 0.40 → 0.55 → 0.65 (improving)
No anomalies detected.

=== Suggested Actions ===
1. [RECOMMENDED] Regenerate records for "strategic-endgame" — low eval scores suggest weak prompts
2. [OPTIONAL] Tighten grader weight on "concrete_examples" — many mediocre scores cite lack of examples
3. [OPTIONAL] Run 1 more training epoch — reward still improving at epoch 2

What would you like to do?
```

**Let the user choose:**
- "Regenerate endgame records" → agent regenerates, re-uploads, starts new eval+training
- "Adjust the grader" → agent modifies grader.js, re-uploads, starts new eval
- "Run another training epoch" → agent starts new job with `epochs: 3`
- "Looks good, I'm satisfied" → done
- User may also direct their own analysis: "I think the grader is too lenient on X"

### 8c. Quick diagnosis patterns

| Signal | Likely cause | Suggested action |
|--------|-------------|-----------------|
| All scores ~0 | Grader broken or too strict | Fix grader, dry-run, re-eval |
| All scores ~1 | Grader too lenient | Add harder criteria, re-eval |
| One topic consistently low | Weak prompts or poor source material for that topic | Regenerate records, add source material |
| Good responses scoring low | Grader criteria misaligned with objective | Adjust criteria weights or LLM judge prompt |
| NaN/Inf loss in training | Learning rate too high | Lower `learning_rate` by 2x |
| KL divergence exploding | Model drifting too far | Lower `learning_rate` by 2x |
| Reward plateau (flat after epoch 1) | Grader not differentiating well | Improve grader for smoother score spread |
| Reward collapse (all same score) | Grader binary or reward hacking | Rewrite grader with partial credit |
| No learning across epochs | Task too hard for base model | Try larger base model |
| Overfitting (peak then decline) | Too many epochs | Reduce `epochs` to peak epoch |

---

## Step 9: Iterate (If Needed)

**What happens**: Based on the user's choice from Step 8, the agent applies fixes and starts new jobs. **Max 5 iterations.**

### 9a. Apply the chosen fix

**Fixing the grader** (no data re-upload needed):
```bash
# Edit grader.js, then update:
uv run scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

**Fixing the data** (requires re-upload):
```bash
# Regenerate records for weak topics, re-validate, re-upload
uv run scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file training.jsonl

# Sync to cloud
curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/upload
```

**Adjusting training config**: Modify parameters in the next job creation (Step 7b).

### 9b. Start new eval + training jobs

After applying fixes, start new jobs — same as Step 7a + 7b but with incremented version numbers:
```bash
uv run scripts/run_evaluation.py --dataset-id $WORKFLOW_ID --output evaluations/eval-v2.json
# New training job with adjusted config
JOB=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs ...)
```

### 9c. Iteration limits and escalation

- **Max 5 iterations.** After 5, stop and report full diagnosis to the user.
- **Base model escalation:** After 2 failed iterations on the same model: `Qwen3.5-4B` → `7B` → larger.
- **When to stop:** User says they're satisfied, OR avg score > 0.8 AND training reward > 0.7, OR 3+ iterations with no improvement.

**Files produced**:
```
finetune-project/training-jobs/
└── job-v1.json                # Training job results
```

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
