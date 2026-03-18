# Finetune Skill Testing Guide

How to test the vLLora finetune skill end-to-end, verify data lands in the gateway DB, and confirm the UI can visualize it. This guide is designed so any agent (human or AI) can pick it up, run the test, identify issues, and recommend fixes.

## Related Documentation

Before testing, read these guides to understand how the skill works internally:

| Document | What it covers |
|----------|---------------|
| [Pipeline Overview](how-skill-work/pipeline-overview.md) | Full 9-step pipeline, scripts reference, subagents, file→gateway mapping |
| [Extraction Deep Dive](how-skill-work/extraction-deep-dive.md) | Docling API, multi-document flow, knowledge_parts.json schema, debugging |
| [Topic Generation Deep Dive](how-skill-work/generate-topics-deep-dive.md) | Topic hierarchy design, relation-builder subagent, topic-part linking |
| [Record Generation Deep Dive](how-skill-work/generate-records-deep-dive.md) | LLM-powered data generation, record format, validation, grounding |

## Prerequisites

- vLLora gateway running at `localhost:9090` (built from `vllora/gateway`)
- Distri server running at `localhost:8081` (built from `distri/`)
- vLLora UI dev server at `localhost:5173` (from `vllora/ui`)
- Claude Code CLI (`claude`) installed
- `uv` installed (Python script runner used by skill scripts)
- At least one PDF document to use as knowledge source

## Setup

### 1. Clean the test directory

Before every test run, wipe the test workspace to ensure a clean state. Set `TEST_DIR` to your test workspace path:

```bash
# Set this to your test workspace — adjust for your machine
TEST_DIR=/path/to/your/test-workspace

# Remove everything except .git (if it exists)
rm -rf "$TEST_DIR/finetune-project"
rm -rf "$TEST_DIR/.claude"
rm -f "$TEST_DIR"/*.pdf "$TEST_DIR"/*.txt "$TEST_DIR"/*.jsonl "$TEST_DIR"/*.json "$TEST_DIR"/*.js "$TEST_DIR"/*.md
```

### 2. Copy skill files (exclude README.md)

```bash
# Set SKILL_DIR to wherever the skill source lives
SKILL_DIR=/path/to/vllora/ui/finetune-skill

mkdir -p "$TEST_DIR/.claude"
cp "$SKILL_DIR/SKILL.md" "$TEST_DIR/.claude/"
cp -r "$SKILL_DIR/reference" "$TEST_DIR/.claude/"
cp -r "$SKILL_DIR/scripts" "$TEST_DIR/.claude/"
cp -r "$SKILL_DIR/templates" "$TEST_DIR/.claude/"
```

### 3. Copy test PDF documents

```bash
cp your-documents/*.pdf "$TEST_DIR/"
```

### 4. Restart the backend

```bash
cd vllora/ui && bash scripts/restart-backend.sh
```

Or manually:
```bash
# Terminal 1: Distri server
cd distri && cargo run --package distri-server-cli --features "ui sqlite" -- serve --port=8081

# Terminal 2: vLLora gateway
cd vllora/gateway && cargo run
```

## Running the Skill

### Option A: Full pipeline via Claude Code

```bash
cd "$TEST_DIR"
claude -p "I want to fine-tune a [YOUR DOMAIN] AI model. I have PDF documents in this directory.

Objective: [DESCRIBE WHAT THE MODEL SHOULD DO]

Execute the full vLLora finetune skill pipeline:
1. Create a workflow on the gateway (http://localhost:9090)
2. Extract the PDF documents for knowledge sources
3. Build a topic hierarchy from the extracted content
4. Generate training data (at least 50 records)
5. Write a grader/evaluator script
6. Upload everything to the gateway

Use the scripts in .claude/scripts/ and follow .claude/SKILL.md instructions exactly.
IMPORTANT: Do NOT create shell scripts. Execute all commands directly via bash." \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
  --max-turns 100
```

### Option B: Step-by-step manual testing

Run each pipeline step individually using the `finetune.py` wrapper script:

```bash
cd "$TEST_DIR"

# Step 1: Create workflow
WORKFLOW_ID=$(uv run .claude/scripts/finetune.py create-workflow \
  --name "Test Workflow" \
  --objective "Train a model to..." \
  --system-prompt "You are..." | tail -1)
echo "Created workflow: $WORKFLOW_ID"

# Step 2: Extract documents (requires Docling or manual extraction)
# The skill uses Docling API or reads PDFs directly — see extraction-deep-dive.md

# Step 3: Upload topics (after creating topics.json manually or via LLM)
uv run .claude/scripts/finetune.py upload-topics \
  --workflow-id $WORKFLOW_ID --file finetune-project/topics.json

# Step 3b: Upload relations (after creating relations.json)
uv run .claude/scripts/finetune.py upload-relations \
  --workflow-id $WORKFLOW_ID --file finetune-project/relations.json

# Step 4: Generate data (via chat_completion.py) then upload
uv run .claude/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl

# Step 5: Upload grader
uv run .claude/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file finetune-project/grader.js

# Step 5.5: Validate (with cross-reference checks)
uv run .claude/scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json

# Step 6: Verify
uv run .claude/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

## Verification Checkpoints

After the skill completes, verify each layer:

### 1. Check execution log

```bash
cat finetune-project/execution-log.md
```

**What to look for:**
- All steps logged (Step 1 through Step 6)
- No errors or retries on API calls
- Record counts match expectations (50+ records)
- Topic hierarchy was created
- Grader script was written
- All documents were extracted (one `doc-N/` directory per source document)
- `all-parts-index.json` was generated with parts from all documents

### 2. Verify data in gateway SQLite

```bash
DB=~/.vllora/vllora.db

# Workflow exists?
sqlite3 $DB "SELECT id, name, objective FROM workflows ORDER BY created_at DESC LIMIT 1;"

# Get the workflow ID
WF_ID=$(sqlite3 $DB "SELECT id FROM workflows ORDER BY created_at DESC LIMIT 1;")

# Records count and format
sqlite3 $DB "SELECT COUNT(*) FROM workflow_records WHERE workflow_id='$WF_ID';"
sqlite3 $DB "SELECT substr(data,1,300) FROM workflow_records WHERE workflow_id='$WF_ID' LIMIT 2;"

# Topics exist?
sqlite3 $DB "SELECT id, name, parent_id FROM workflow_topics WHERE workflow_id='$WF_ID';"

# Knowledge sources exist? (should be one per source document)
sqlite3 $DB "SELECT id, name FROM knowledge_sources WHERE workflow_id='$WF_ID';"
sqlite3 $DB "SELECT COUNT(*) FROM knowledge_source_parts WHERE source_id IN (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID');"

# Parts per knowledge source (verify each document has parts)
sqlite3 $DB "SELECT ks.name, COUNT(ksp.id) FROM knowledge_sources ks LEFT JOIN knowledge_source_parts ksp ON ks.id = ksp.source_id WHERE ks.workflow_id='$WF_ID' GROUP BY ks.id;"

# Topic-source relations exist?
sqlite3 $DB "SELECT COUNT(*) FROM workflow_topic_sources WHERE workflow_id='$WF_ID';"
```

### 3. Verify record data format

The skill writes records in **OpenAI format** (`{"messages": [...]}`) locally, but `finetune.py upload-records` transforms them to **gateway format** before uploading. The gateway DB stores the wrapped format:

```json
{"input": {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]}, "output": {}}
```

Check:
```bash
# Should see "input" key wrapping messages (gateway format)
sqlite3 $DB "SELECT substr(data,1,200) FROM workflow_records WHERE workflow_id='$WF_ID' LIMIT 3;"

# Count records with gateway format (should match total)
sqlite3 $DB "SELECT COUNT(*) FROM workflow_records WHERE workflow_id='$WF_ID' AND data LIKE '{\"input\"%';"
```

**Note**: The UI handles both formats — it checks for `data.input.messages` (gateway) and `data.messages` (OpenAI) via `extractMessages()`. If you see top-level `{"messages":...}` in the DB, records were uploaded without the `finetune.py` transformation — they'll still work in the UI but may not work for evaluation.

### 4. Verify UI visualization

Open `http://localhost:5173/finetune` in a browser:

- [ ] New workflow card appears on the finetune list page
- [ ] Click into workflow — overview shows correct record count, topic count
- [ ] **Data tab > Records**: table shows records with input text, topic labels
- [ ] **Data tab > Canvas**: topic hierarchy renders with node counts and coverage bars
- [ ] **Data tab > Linked Sources**: knowledge documents listed with part counts
- [ ] Click a topic node on canvas → bottom drawer shows records table
- [ ] Click a source in explorer → source detail view shows parts
- [ ] Records show source references (e.g., "Chapter 3 +1")

### 5. Test evaluation flow

```bash
# Using the helper script (recommended)
uv run .claude/scripts/run_evaluation.py --dataset-id $WF_ID --output evaluations/eval-v1.json --limit 10

# Or manually via curl
curl -X POST http://localhost:9090/finetune/evaluations \
  -H 'Content-Type: application/json' \
  -d '{"dataset_id":"'$WF_ID'","rollout_model_params":{"model":"gpt-4o-mini"}}'
```

**Expected**: 201 Created with evaluation_run_id
**If error "No valid training records found"**: record format issue (see section 3)

## Common Issues & Fixes

### Issue: "No valid training records found" when starting evaluation

**Cause**: Records stored in wrong format. The gateway's `record_to_training_line()` expects either:
- `{"input": {"messages": [...]}}` (gateway format) — **this is what `finetune.py` produces**
- `{"messages": [...]}` (OpenAI format) — also accepted

**Fix**: Ensure records were uploaded via `finetune.py upload-records` (which wraps messages in `data.input`). If uploaded via raw curl, the format may be wrong.

### Issue: Records show in DB but UI displays blank/empty input text

**Cause**: UI's `extractMessages()` function in `ConversationThreadCell.utilities.ts` doesn't handle the format.

**Fix**: `extractMessages()` must check for both `data.input.messages` (gateway) and `data.messages` (OpenAI) formats.

### Issue: Workflow created but no records uploaded

**Cause**: The agent used `upload_dataset.py` instead of `finetune.py upload-records`. `upload_dataset.py` posts to `/finetune/datasets` (cloud endpoint), not `/finetune/workflows/{id}/records` (local gateway).

**Fix**: Use `finetune.py upload-records` which posts to the correct workflow records endpoint.

### Issue: Topics created but no topic-source relations

**Cause**: The skill may skip the relations step, or `relations.json` was not generated.

**Fix**: Check `execution-log.md` for the relation-builder subagent. The skill should use `finetune.py upload-relations` after generating `relations.json`.

### Issue: Knowledge sources missing parts

**Cause**: Document extraction may have failed or produced empty results. Docling API may be unavailable.

**Fix**: Check each per-document directory (`knowledge/doc-N/knowledge_parts.json`) to see which documents failed. If Docling fails, the skill should fall back to direct PDF text extraction.

### Issue: Only one knowledge source when multiple documents provided

**Cause**: The skill created a single merged knowledge source instead of one per document.

**Fix**: Each document should be uploaded separately via `finetune.py upload-knowledge`. Check that the agent loops over all documents in Step 2.

### Issue: Canvas shows 0% coverage on all nodes

**Cause**: `sourceChunkRefs` on records or `topic_sources` relations not set up correctly.

**Fix**: Each topic needs relations linking it to knowledge source parts. Records need `source_chunk_ref` pointing to the part they were generated from. Check that `relations.json` was uploaded via `finetune.py upload-relations`.

## Data Format Reference

### Record (local skill format — in training.jsonl)
```json
{
  "messages": [
    {"role": "system", "content": "You are an expert chess tutor..."},
    {"role": "user", "content": "Explain the knight fork"}
  ],
  "id": "forks-001",
  "topic": "forks",
  "source_parts": ["doc-1-chapter-3"]
}
```

### Record (gateway DB format — after upload via finetune.py)
```json
{
  "input": {
    "messages": [
      {"role": "system", "content": "You are an expert chess tutor..."},
      {"role": "user", "content": "Explain the knight fork"}
    ]
  },
  "output": {}
}
```

### Topic hierarchy
```json
[
  {
    "id": "tactics",
    "name": "Tactical Patterns",
    "parent_id": null,
    "system_prompt": "Focus on tactical chess patterns"
  },
  {"id": "forks", "name": "Forks", "parent_id": "tactics", "system_prompt": "Focus on fork tactics"}
]
```

### Relations
```json
[
  {"topic_identifier": "forks", "part_identifier": "doc-1-chapter-3"},
  {"topic_identifier": "pins", "part_identifier": "doc-1-chapter-4"}
]
```

### Knowledge source part
```json
{
  "id": "doc-1-chapter-3",
  "type": "text",
  "title": "Chapter 3: Tactical Motifs",
  "content": "The fork is a tactic...",
  "extraction_path": "[\"3 Tactical Motifs\"]",
  "extraction_metadata": {"pages": [42, 43], "source_chunks": [20]}
}
```

## Skill Improvement Checklist

After running the test, evaluate:

- [ ] **Completeness**: Did all pipeline steps execute (Steps 1-6 for data prep, optionally Steps 7-9 for eval/training)?
- [ ] **Data quality**: Are records diverse, well-formed, and grounded in source documents?
- [ ] **Topic coverage**: Does each topic have roughly equal record counts?
- [ ] **Grader quality**: Does the grader script check multiple quality dimensions (accuracy, completeness, tone)?
- [ ] **Error handling**: Did the skill handle API failures gracefully?
- [ ] **Format consistency**: Are all records transformed correctly (gateway format in DB)?
- [ ] **Knowledge linking**: Are records linked back to source document parts?
- [ ] **Multi-document**: If multiple documents were provided, does each get its own knowledge source with parts?
- [ ] **UI compatibility**: Does the UI correctly render all data produced by the skill?
- [ ] **Script usage**: Did the agent use `finetune.py` subcommands (not raw curl)?
