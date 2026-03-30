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
| [RFT/GRPO Training Explained](how-skill-work/rft-grpo-training-explained.md) | How GRPO works step-by-step, G vs epochs, grader as training objective, failure modes, parameter reference |

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

### 2. Copy skill files and sub-agents

The skill lives inside `.claude/skills/finetune-skill/` — this is how Claude Code discovers skills. Sub-agents live in `.claude/agents/` — Claude Code discovers them automatically.

```bash
# Set REPO_DIR to the vllora/ui repo root
REPO_DIR=/path/to/vllora/ui
SKILL_DIR="$REPO_DIR/finetune-skill"

# Copy skill
mkdir -p "$TEST_DIR/.claude/skills/finetune-skill"
cp "$SKILL_DIR/SKILL.md" "$TEST_DIR/.claude/skills/finetune-skill/"
cp -r "$SKILL_DIR/reference" "$TEST_DIR/.claude/skills/finetune-skill/"
cp -r "$SKILL_DIR/scripts" "$TEST_DIR/.claude/skills/finetune-skill/"
cp -r "$SKILL_DIR/templates" "$TEST_DIR/.claude/skills/finetune-skill/"

# Copy sub-agents (training-monitor, execution-logger, relation-builder)
mkdir -p "$TEST_DIR/.claude/agents"
cp "$REPO_DIR/agents/"*.md "$TEST_DIR/.claude/agents/"
```

The skill uses 3 sub-agents:

| Agent | Purpose |
|-------|---------|
| `knowledge-extractor` | Per-document parallel extraction — spawned once per PDF in Step 2 |
| `relation-builder` | Builds topic↔part relations from `all-parts-index.json` and `topics.json` |
| `training-monitor` | Background watchdog — polls training metrics, detects anomalies, saves data for post-training analysis |

Without these agents, the skill still works but loses parallel extraction, automated relation building, and background monitoring.

### 3. Copy test PDF documents

Use the curated chess tutor PDFs from the skill docs (see [chess-pdf/README.md](how-skill-work/chess-pdf/README.md) for the full evaluation):

```bash
# Recommended: top 3 chess PDFs for demo testing
PDF_DIR="$(dirname "$SKILL_DIR")/docs/workflow-skill-first-approach/how-skill-work/chess-pdf"
cp "$PDF_DIR"/*.pdf "$TEST_DIR/"
```

| PDF | Pages | Best for |
|-----|-------|---------|
| `Chess-Strategy-Lasker-Indian.pdf` | 282 | Full strategy coverage — best quality, slower extraction |
| `chess-tactics-and-combinations-dave-regis-646.pdf` | 84 | Tactical patterns — faster extraction, tested at 0.987 avg eval |
| `02.-Learn-and-Master-Progressive-Chess-author-Matej-Guid.pdf` | ~55 | Supplementary content — adds topic variety |

For a **quick test**, use just the tactics book (84 pages, fastest extraction). For a **full demo**, use all 3.

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

**Recommended PDFs for demo:**
- **Primary:** `chess-tactics-and-combinations-dave-regis-646.pdf` (84 pages) — tactical patterns: forks, pins, skewers, combinations, checkmates. Clean chapter structure, fast extraction, tested at 0.987 avg eval.
- **Secondary:** `Chess-Strategy-Lasker-Indian.pdf` (282 pages) — comprehensive strategy: openings, middlegame, endgames, pawn structures. Public domain (1915). Dense prose, excellent headings.
- **Skip:** `02.-Learn-and-Master-Progressive-Chess-author-Matej-Guid.pdf` — this teaches Progressive Chess (a variant with different rules), NOT standard chess. Including it would confuse the tutor model.

**Quick test (1 PDF, ~5 min extraction):** Use Dave Regis only.
**Full demo (2 PDFs, ~15 min extraction):** Use Dave Regis + Lasker.

The skill auto-invokes when the user mentions fine-tuning. The user only needs to describe what model they want — SKILL.md handles everything else (objective, system prompt, pipeline steps).

```bash
cd "$TEST_DIR"
claude -p "I want to fine-tune a chess tutor model using the PDF documents in this directory. The model should teach tactical patterns and strategic concepts, explaining clearly with concrete examples from real games." \
  --dangerously-skip-permissions \
  --model sonnet \
  --max-turns 200
```

> **Tip**: For the 282-page Lasker book, Docling extraction takes 10-20 minutes. If Docling times out or restarts, the task is lost — the agent needs to re-submit. Use `--dangerously-skip-permissions` to avoid the agent getting stuck on permission prompts in headless mode.

### Option B: Step-by-step manual testing

Run each pipeline step individually using the `finetune.py` wrapper script:

```bash
cd "$TEST_DIR"

# Step 1: Create workflow
WORKFLOW_ID=$(uv run .claude/skills/finetune-skill/scripts/finetune.py create-workflow \
  --name "Test Workflow" \
  --objective "Train a model to..." \
  --system-prompt "You are..." | tail -1)
echo "Created workflow: $WORKFLOW_ID"

# Step 2: Extract documents (requires Docling or manual extraction)
# The skill uses Docling API or reads PDFs directly — see extraction-deep-dive.md

# Step 2b: Upload knowledge sources (use --force for safe re-uploads via PUT upsert)
for DOC in *.pdf; do
  DOC_SLUG=$(echo "${DOC%.pdf}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  DOC_DIR="finetune-project/knowledge/$DOC_SLUG"
  [ -f "$DOC_DIR/knowledge_parts.json" ] || continue
  uv run .claude/skills/finetune-skill/scripts/finetune.py upload-knowledge \
    --workflow-id $WORKFLOW_ID \
    --file "$DOC" \
    --parts-file "$DOC_DIR/knowledge_parts.json" \
    --name "$DOC" \
    --force
done

# Step 3: Upload topics (after creating topics.json manually or via LLM)
uv run .claude/skills/finetune-skill/scripts/finetune.py upload-topics \
  --workflow-id $WORKFLOW_ID --file finetune-project/topics.json

# Step 3b: Upload relations (after creating relations.json)
uv run .claude/skills/finetune-skill/scripts/finetune.py upload-relations \
  --workflow-id $WORKFLOW_ID --file finetune-project/relations.json

# Step 4: Generate training records via generate_records.py, then upload
uv run .claude/skills/finetune-skill/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 10

# Upload records to gateway
uv run .claude/skills/finetune-skill/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl

# Step 5: Upload grader
uv run .claude/skills/finetune-skill/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file finetune-project/grader.js

# Step 5.5: Validate (with cross-reference checks)
uv run .claude/skills/finetune-skill/scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json

# Step 6: Verify
uv run .claude/skills/finetune-skill/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
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
- All documents were extracted (one subdirectory per source document, named by slugified filename)
- `all-parts-index.json` was generated with parts from all documents

### 2. Verify extraction quality

**CRITICAL** — extraction quality issues cascade through the entire pipeline. Bad parts → bad topics → bad training data. Catch these early.

```bash
DB=~/.vllora/vllora.db
WF_ID=$(sqlite3 $DB "SELECT id FROM workflows ORDER BY created_at DESC LIMIT 1;")

echo "=== Extraction Quality Report ==="

# Parts-per-source ratio (expect 2-10 parts/page, flag >15)
echo ""
echo "--- Parts per Knowledge Source ---"
sqlite3 $DB "
  SELECT ks.name,
         COUNT(ksp.id) as parts,
         json_extract(ks.metadata, '$.total_pages') as pages,
         CASE
           WHEN json_extract(ks.metadata, '$.total_pages') IS NOT NULL
           THEN ROUND(CAST(COUNT(ksp.id) AS FLOAT) / json_extract(ks.metadata, '$.total_pages'), 1)
           ELSE 'N/A'
         END as parts_per_page
  FROM knowledge_sources ks
  LEFT JOIN knowledge_source_parts ksp ON ks.id = ksp.source_id
  WHERE ks.workflow_id='$WF_ID'
  GROUP BY ks.id;"

# Title diversity — detect broken heading detection
echo ""
echo "--- Title Diversity (top 5 most common) ---"
sqlite3 $DB "
  SELECT title, COUNT(*) as cnt
  FROM knowledge_source_parts
  WHERE source_id IN (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID')
  GROUP BY title
  ORDER BY cnt DESC LIMIT 5;"

# Short parts — detect extraction fragmentation
echo ""
echo "--- Short Parts (<50 chars) ---"
sqlite3 $DB "
  SELECT COUNT(*) as short_parts,
         (SELECT COUNT(*) FROM knowledge_source_parts WHERE source_id IN
           (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID')) as total_parts
  FROM knowledge_source_parts
  WHERE source_id IN (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID')
    AND LENGTH(content) < 50;"

# Average content length per source
echo ""
echo "--- Avg Content Length per Source ---"
sqlite3 $DB "
  SELECT ks.name,
         ROUND(AVG(LENGTH(ksp.content))) as avg_chars,
         MIN(LENGTH(ksp.content)) as min_chars,
         MAX(LENGTH(ksp.content)) as max_chars
  FROM knowledge_sources ks
  JOIN knowledge_source_parts ksp ON ks.id = ksp.source_id
  WHERE ks.workflow_id='$WF_ID'
  GROUP BY ks.id;"

# Unicode/encoding issues — detect unescaped Unicode sequences
echo ""
echo "--- Unicode Encoding Issues ---"
sqlite3 $DB "
  SELECT COUNT(*) as bad_encoding_parts
  FROM knowledge_source_parts
  WHERE source_id IN (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID')
    AND (content LIKE '%\u0%' OR title LIKE '%\u0%'
         OR extraction_path LIKE '%\u0%');"

# Nonsense extraction paths — detect garbage headings
echo ""
echo "--- Extraction Path Samples (first 10) ---"
sqlite3 $DB "
  SELECT DISTINCT extraction_path
  FROM knowledge_source_parts
  WHERE source_id IN (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID')
    AND extraction_path IS NOT NULL
  LIMIT 10;"
```

**What to look for:**

| Check | Healthy | Problem |
|-------|---------|---------|
| Parts per page | 2-10 | >15 = too granular, <1 = incomplete extraction |
| Title diversity | Many unique titles | >50% share same title = heading detection broken |
| Short parts (<50 chars) | <5% of total | >20% = fragmentation, parts not merged |
| Avg content length | 200-2000 chars | <100 = too fragmented, >5000 = chunks too large |
| Unicode encoding | 0 bad parts | >0 = extraction script didn't decode Unicode |
| Extraction paths | Real section names | `\u0xxx` sequences or document title repeated = broken |

**If any check fails**, the extraction needs to be re-run with fixes before proceeding. See "Common Issues" section below for specific fixes.

### 3. Verify data in gateway SQLite

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
# Create eval job (non-blocking — saves metadata locally)
uv run .claude/skills/finetune-skill/scripts/finetune.py create-eval \
  --workflow-id $WF_ID --output-dir evaluations

# Poll until complete
uv run .claude/skills/finetune-skill/scripts/finetune.py poll-eval \
  --file evaluations/eval-001.json
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

**Cause**: Records were uploaded via raw curl to the wrong endpoint, or `finetune.py upload-records` was not used. The correct endpoint is `POST /finetune/workflows/{id}/records` (local gateway).

**Fix**: Use `finetune.py upload-records` which posts to the correct workflow records endpoint.

### Issue: Topics created but no topic-source relations

**Cause**: The skill may skip the relations step, or `relations.json` was not generated.

**Fix**: Check `execution-log.md` for the relation-builder subagent. The skill should use `finetune.py upload-relations` after generating `relations.json`.

### Issue: Knowledge sources missing parts

**Cause**: Document extraction may have failed or produced empty results. Docling API may be unavailable.

**Fix**: Check each per-document directory (`knowledge/{doc-slug}/knowledge_parts.json`) to see which documents failed. If Docling fails, the skill should fall back to direct PDF text extraction.

### Issue: Only one knowledge source when multiple documents provided

**Cause**: The agent processed the first document, then moved to Step 3 without looping back for the remaining documents. This is a common agent behavior issue — the agent gets a successful result and advances prematurely.

**How to detect**: Compare PDF count vs knowledge source count:
```bash
DOC_COUNT=$(ls *.pdf 2>/dev/null | wc -l | tr -d ' ')
EXTRACTED_COUNT=$(find finetune-project/knowledge -mindepth 2 -name 'knowledge_parts.json' 2>/dev/null | wc -l | tr -d ' ')
echo "Source: $DOC_COUNT | Extracted: $EXTRACTED_COUNT"
```

**Fix**: SKILL.md now includes a hard validation check (Step 2e) that blocks progression to Step 3 unless all documents are extracted. Each document should be uploaded separately via `finetune.py upload-knowledge`. If the agent still skips documents, increase `--max-turns` or explicitly list all documents in the prompt.

### Issue: Too many parts per document (>15 parts/page)

**Cause**: The extraction script creates one part per Docling text item instead of merging adjacent text items under the same heading. A 100-page PDF should NOT produce 1000+ parts.

**Symptoms in UI**:
- Source detail shows hundreds of tiny parts (26-135 chars each)
- All parts have the same generic title (e.g., "Chess Workbook")
- Scrolling through parts list takes forever

**How to detect**:
```bash
sqlite3 $DB "
  SELECT ks.name, COUNT(ksp.id) as parts,
         json_extract(ks.metadata, '$.total_pages') as pages
  FROM knowledge_sources ks
  JOIN knowledge_source_parts ksp ON ks.id = ksp.source_id
  WHERE ks.workflow_id='$WF_ID'
  GROUP BY ks.id;"
```
If parts/pages > 15, extraction is too granular.

**Fix**: The extraction script must consolidate adjacent text parts that share the same `extraction_path`. See `reference/extraction-guide.md` Step 4.5 for the merging algorithm. Also enforce a minimum content length (50 chars) — parts below that threshold should be merged with neighbors or dropped.

### Issue: All parts have the same title (broken heading detection)

**Cause**: The extraction script relied on Docling's chunk `headings` field, which often contains noise (document title repeated, chess moves parsed as headings, page numbers). When heading detection fails, every part gets the document title as its heading.

**Symptoms in UI**:
- Every part in the source detail has the same name
- Extraction paths all show the document title instead of section names
- Topic hierarchy (if auto-generated) is flat or nonsensical

**How to detect**:
```bash
sqlite3 $DB "
  SELECT title, COUNT(*) as cnt
  FROM knowledge_source_parts
  WHERE source_id IN (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID')
  GROUP BY title ORDER BY cnt DESC LIMIT 5;"
```
If the top title accounts for >50% of parts, heading detection is broken.

**Fix**: Rebuild heading context from the document structure (`doc['texts']` array, filtering for `label: "section_header"`) instead of chunk headings. See `reference/extraction-guide.md` Step 4.5 title diversity validation.

### Issue: Unicode escape sequences in extraction paths or content

**Cause**: The extraction script stored raw `\u043e\u043f...` escape sequences instead of decoded Unicode text. This happens when JSON strings containing non-ASCII characters (Cyrillic, CJK, accented Latin) are not properly decoded during extraction.

**Symptoms in UI**:
- Part titles or extraction paths show `\u0xxx` sequences
- Content appears as escaped Unicode instead of readable text
- Mixed-language documents show garbled section names

**How to detect**:
```bash
sqlite3 $DB "
  SELECT COUNT(*) FROM knowledge_source_parts
  WHERE source_id IN (SELECT id FROM knowledge_sources WHERE workflow_id='$WF_ID')
    AND (content LIKE '%\\u0%' OR title LIKE '%\\u0%' OR extraction_path LIKE '%\\u0%');"
```

**Fix**: The extraction script must use `json.dumps(..., ensure_ascii=False)` when writing `knowledge_parts.json` to preserve Unicode characters. When reading Docling's JSON response, ensure `json.load()` (not manual string parsing) is used to properly decode Unicode escapes.

### Issue: Canvas shows 0% coverage on all nodes

**Cause**: `sourceChunkRefs` on records or `topic_sources` relations not set up correctly.

**Fix**: Each topic needs relations linking it to knowledge source parts. Records need `source_chunk_ref` pointing to the part they were generated from. Check that `relations.json` was uploaded via `finetune.py upload-relations`.

### Issue: Duplicate knowledge sources uploaded

**Cause**: The agent uploaded a knowledge source, then re-ran extraction and uploaded again without checking if the source already exists. This creates duplicate entries with different UUIDs but the same document content.

**How to detect**:
```bash
sqlite3 $DB "SELECT name, COUNT(*) as cnt FROM knowledge_sources WHERE workflow_id='$WF_ID' GROUP BY name HAVING cnt > 1;"
```

**Fix**: `finetune.py upload-knowledge` supports safe re-uploads via `--force`:
- Without `--force`: uses `POST` (create) — will create a duplicate if source exists
- With `--force`: uses `PUT` (upsert) — the gateway atomically soft-deletes the existing source with the same name and creates the new one in one request. No data loss risk.

The upsert endpoint is `PUT /finetune/workflows/{id}/knowledge`. Response includes `replaced: true` and `replaced_id` when a source was replaced.

Use `--force` when re-uploading after fixing extraction scripts or part IDs.

### Issue: Agent creates relations-uuid.json (manual UUID mapping)

**Cause**: The agent doesn't know that the gateway resolves `part_identifier` by matching against both UUID and `reference_id`. It queries the DB to map reference_ids to UUIDs and creates a separate `relations-uuid.json`.

**Fix**: SKILL.md now explicitly states that `relations.json` should use reference_ids (string IDs from `knowledge_parts.json`), not UUIDs. The gateway's `create_relations` service queries `id OR reference_id` on both topics and parts tables.

### Issue: Extraction script placed outside per-document directory

**Cause**: The agent writes extraction scripts like `extract_chess_tactics.py` in `finetune-project/` root instead of inside `knowledge/{doc-slug}/`.

**Fix**: SKILL.md now specifies the script location as `knowledge/{doc-slug}/extract.py`. This keeps extraction artifacts co-located with their document's data.

### Issue: Execution log written retroactively instead of incrementally

**Cause**: The agent batches all logging at the end of the pipeline run instead of appending entries after each action as instructed.

**Fix**: SKILL.md now includes a CRITICAL note to create `execution-log.md` at Step 1 start and append after every action using `echo`/`cat >>`. The log should reflect real-time progress.

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
  "source_parts": ["chess-tactics-chapter-3"]
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
  {"topic_identifier": "forks", "part_identifier": "chess-tactics-chapter-3"},
  {"topic_identifier": "pins", "part_identifier": "chess-tactics-chapter-4"}
]
```

### Knowledge source part
```json
{
  "id": "chess-tactics-chapter-3",
  "type": "text",
  "title": "Chapter 3: Tactical Motifs",
  "content": "The fork is a tactic...",
  "extraction_path": "[\"3 Tactical Motifs\"]",
  "extraction_metadata": {"pages": [42, 43], "source_chunks": [20]}
}
```

## How the Skill Pipeline Runs

Understanding the execution flow helps identify where things go wrong and what to optimize.

### Execution Flow (9 Steps)

```
Step 1: Create workflow on gateway        (fast — single API call)
Step 2: Extract documents via Docling     (SLOW — 30-120s per document)
Step 3: Build topic hierarchy + relations  (medium — LLM calls for hierarchy design)
Step 4: Generate training records          (SLOW — LLM call per record batch)
Step 5: Write grader script               (fast — single LLM generation)
Step 5.5: Validate dataset                (fast — local validation)
Step 6: Verify all data in gateway        (fast — single script call)
Step 7: Start eval + training in parallel (cloud — both jobs run simultaneously)
Step 8: Analyze results & present findings (interactive — user drives next action)
Step 9: Iterate if needed                 (apply fixes, start new eval+training jobs, max 5 iterations)
```

### Bottlenecks & Improvement Opportunities

| Bottleneck | Cause | Impact | Possible Improvement |
|------------|-------|--------|---------------------|
| **Document extraction (Step 2)** | Docling API is async; polling waits for server-side processing. Large PDFs with tables/images take longer. | 30-120s per document. Multiple documents = serial extraction. | Parallelize extraction across documents. Add progress feedback. Fall back to direct text extraction faster on timeout. |
| **Record generation (Step 4)** | One LLM call per leaf topic batch (via `generate_records.py` → `chat_completion.py`). Each call generates ~5-15 records. | 50+ records = 5-10 LLM calls = 30-60s total. | Increase batch size per call. Parallelize across topics. Cache partial results for retry. |
| **Agent turn overhead** | Claude Code uses one turn per bash command. Steps with many sequential commands consume turns quickly. | Can hit `--max-turns` limit before pipeline completes. | Combine related commands. Use `finetune.py` subcommands (fewer turns than raw curl). |
| **Subagent spawning** | relation-builder and training-monitor subagents each need their own agent session. | 10-20s overhead per subagent spawn. | Could inline relation-building into main agent if subagent overhead is too high. |
| **Validation round-trips** | `validate_dataset.py` runs after records are generated. If validation fails, agent must regenerate. | Wasted generation work if format is wrong. | Validate incrementally during generation, not after. |

### What to Measure

When testing, note these timing metrics in the execution log:

- Total pipeline wall time (target: <10 minutes for 50 records + 1 document)
- Per-step times (which step is the bottleneck?)
- Number of agent turns consumed
- Number of LLM API calls for record generation
- Number of retry/error recovery attempts

---

## UI Display Validation

After the skill pipeline completes and data is in the gateway, verify the UI correctly displays all data. This is critical — the whole point of the skill is to produce data the UI can visualize.

### Data Flow: Skill → Gateway → UI

```
Skill produces files (JSONL, JSON, JS)
  ↓ finetune.py uploads to gateway
Gateway stores in SQLite (vllora.db)
  ↓ UI fetches via REST API
UI renders in React components
```

### 6. Verify Records Display

Open `http://localhost:5173/finetune` → click into the workflow → **Data tab > Records**

**What to check:**

| Check | How to verify | Expected |
|-------|--------------|----------|
| Record count matches | Compare header count with `sqlite3` count | Must match exactly |
| Input text renders | Click a record row → sidebar shows full conversation | System prompt + user message visible |
| Topic labels show | Each record row shows its topic name | Not raw topic ID — should be human-readable name |
| Topic grouping works | Toggle "Group by Topic" → records grouped under topic headers | Parent topics → child topics → records hierarchy |
| Message extraction handles both formats | Check records have visible input text | `extractMessages()` handles both `data.messages[]` (skill format) and `data.input.messages[]` (gateway format) |
| Source references show | Record rows with linked sources show "Chapter N +M" | Clicking opens source part detail |
| Metadata preserved | Record sidebar shows metadata section | `source_parts`, `topic`, `id` from skill are accessible |

**Key file**: `src/components/datasets/records-table/cells/ConversationThreadCell.utilities.ts` — `extractMessages()` function handles format detection.

### 7. Verify Canvas Display

**Data tab > Canvas**

| Check | How to verify | Expected |
|-------|--------------|----------|
| Topic hierarchy renders | Canvas shows tree of topic nodes | Matches the topic hierarchy from `topics.json` |
| Record counts per node | Each node shows a count badge | Leaf nodes show direct count; parent nodes show sum of children |
| Coverage bars | Nodes with linked sources show coverage percentage | Based on `workflow_topic_sources` relations |
| Quality scores | Nodes with evaluation results show score dot | Green ≥0.8, amber ≥0.6, red <0.6 |
| Click interaction | Click a topic node → bottom drawer opens | Shows records filtered to that topic |
| Expand/collapse | Parent nodes can expand to show children | Tree structure navigable |

**Key file**: `src/components/datasets/dataset-canvas/TopicHierarchyCanvas.tsx`

### 8. Verify Sources Display

**Data tab > Linked Sources** (or click a source in the explorer sidebar)

| Check | How to verify | Expected |
|-------|--------------|----------|
| All documents listed | Source count matches number of uploaded documents | One card per knowledge source |
| Part counts correct | Each source shows part count | Matches `sqlite3` count of `knowledge_source_parts` |
| Part content renders | Click into a source → parts listed with content preview | Text, title, extraction path visible |
| Topic coverage shown | Single document view shows topic coverage bars | Shows which topics are linked to this document's parts |
| Part types correct | Parts show type icons (text, table, image) | Based on `part_type` field |

**Key file**: `src/components/datasets/sources-view/SourcesView.tsx`

### 9. Verify Coverage Stats

**Overview tab or Coverage dialog**

| Check | How to verify | Expected |
|-------|--------------|----------|
| Balance score | Overview card shows balance score (0-1) | Computed from topic distribution evenness |
| Topic distribution | Coverage dialog shows per-topic record counts | All leaf topics should have records (no orphan topics) |
| Knowledge coverage | Percentage of knowledge parts linked to records | Higher is better; 0% means no source linking |
| Uncategorized count | Header shows uncategorized record count | Should be 0 if all records have topic assignments |

---

## User Expectations vs What the UI Shows

This section documents what users expect to see after running the skill pipeline, what the UI actually shows, and known gaps. Use this as a checklist for UI improvements.

### What Works Well

| User expectation | UI behavior | Status |
|-----------------|-------------|--------|
| See all my training records | Records table with topic grouping, search, filtering | Working |
| Browse topic hierarchy visually | Canvas view with dagre auto-layout, interactive nodes | Working |
| See which documents were extracted | Sources view lists all knowledge sources with parts | Working |
| See how topics connect to source documents | Topic-source relations shown as coverage bars | Working |
| See record count per topic | Shown on canvas nodes and in table group headers | Working |
| Navigate between records, topics, and sources | Explorer sidebar + view tabs + click interactions | Working |
| See system prompt composition | Record detail sidebar shows composed prompt from hierarchy | Working |

### Known Gaps

| User expectation | Current behavior | Gap | Priority |
|-----------------|-----------------|-----|----------|
| See eval score trends across training epochs | Epoch/trend columns always empty | `flattenEvaluationResults()` in `finetune-api.ts` doesn't populate `epoch` and `trend` fields | **Critical** |
| See why each record scored the way it did | `reason` field stored but not rendered in result rows | Component exists but field not wired up | High |
| See training loss curves | No training metrics visualization | No chart component for training metrics over time | High |
| See which specific knowledge chunks are uncovered | Only aggregated coverage percentage shown | No drilldown to individual uncovered parts | Medium |
| See which source parts generated which records | No generation provenance tracking | Skill doesn't store generation config in record metadata | Medium |
| See extraction path for each record | `extraction_path` metadata stored but not displayed | Low priority — internal metadata | Low |

### Format Compatibility Notes

The skill produces records in **OpenAI format** locally (`{"messages": [...]}`), and `finetune.py upload-records` wraps them into **gateway format** (`{"input": {"messages": [...]}, "output": {}}`). The UI handles both:

- `extractMessages()` checks for `data.input.messages` (gateway) first, then `data.messages` (OpenAI)
- If records are uploaded without the `finetune.py` wrapper (e.g., raw curl), they'll display in the UI but may fail evaluation
- Check the DB format with: `sqlite3 $DB "SELECT substr(data,1,100) FROM workflow_records WHERE workflow_id='$WF_ID' LIMIT 1;"`

---

## Skill Improvement Checklist

After running the test, evaluate:

- [ ] **Completeness**: Did all pipeline steps execute (Steps 1-6 for data prep, optionally Steps 7-9 for eval/training)?
- [ ] **Extraction quality**: Parts-per-page ratio 2-10? Title diversity >50%? Avg content length >200 chars? No Unicode escapes?
- [ ] **Data quality**: Are records diverse, well-formed, and grounded in source documents?
- [ ] **Topic coverage**: Does each topic have roughly equal record counts?
- [ ] **Grader quality**: Does the grader script check multiple quality dimensions (accuracy, completeness, tone)?
- [ ] **Error handling**: Did the skill handle API failures gracefully?
- [ ] **Format consistency**: Are all records transformed correctly (gateway format in DB)?
- [ ] **Knowledge linking**: Are records linked back to source document parts?
- [ ] **Multi-document**: If multiple documents were provided, does each get its own knowledge source with parts?
- [ ] **UI compatibility**: Does the UI correctly render all data produced by the skill?
- [ ] **Script usage**: Did the agent use `finetune.py` subcommands (not raw curl)?
- [ ] **Performance**: Total pipeline time <10 min? Which step was the bottleneck?
- [ ] **Turn efficiency**: How many agent turns consumed vs `--max-turns` limit?
- [ ] **Source linking accuracy**: Do `sourceChunkRefs` in records match actual knowledge source part IDs?
- [ ] **Relations completeness**: Do all leaf topics have at least one topic-source relation?
- [ ] **Encoding correctness**: No `\u0xxx` escape sequences in titles, extraction paths, or content?
