---
name: vllora-finetune
description: |
  Guide for fine-tuning LLMs using the vLLora platform. Use this skill whenever the user mentions fine-tuning, finetuning, training a custom model, creating training datasets, writing evaluation/grader functions, or improving model quality through iteration. Also use it when users have documents (PDFs, manuals, knowledge bases) they want to convert into training data, or when they ask about evaluating model outputs with scoring functions. This skill applies even if users don't explicitly say "vLLora" — any request to fine-tune or build training data for an LLM should trigger it.
---

# vLLora Finetune Skill

Prepare fine-tuning datasets for the vLLora platform. You handle the intelligence-heavy work — reading documents, designing topics, generating training data, and writing graders. Then you push everything to the gateway and hand off to the vLLora UI, where Lucy (the AI assistant) takes over for evaluation, iteration, and training.

> **CRITICAL:** Execute all API calls directly via Bash. **NEVER create shell scripts (.sh files).** Do not save curl commands to files, do not create `run-pipeline.sh` or similar.

## How vLLora Fine-Tuning Works (Read This First)

vLLora fine-tuning uses a **grader function** as the training objective. The model generates its own responses during training, and the grader scores them. High-scoring responses get reinforced, low-scoring ones get penalized.

**The grader IS your training objective.** Whatever the grader rewards, the model learns to do. A grader that checks accuracy, tone, and completeness will produce a model that's accurate, well-toned, and complete.

The training data defines the *prompts* the model practices on. The grader defines *what good looks like*.

### Prerequisites for Success

1. **The base model must already have some capability on the task.** Fine-tuning makes gradual improvements — it cannot teach a model something it has zero ability to do. If the base model produces complete garbage, it may be too small or the task too far outside its training.

2. **The task must be unambiguous.** If two domain experts would give different answers, the training signal will be noisy and the model won't converge.

3. **The task should be guess-proof.** If the model can score well by guessing (binary yes/no, multiple choice), the signal is too noisy. Reframe to open-ended answers.

4. **The grader must produce smooth, varied scores.** Binary pass/fail (0 or 1) gives a weak signal. Partial credit (0.0, 0.3, 0.5, 0.7, 1.0) creates smoother learning gradients.

## The Pipeline

```
Define Objective → Extract Documents → Build Topics → Generate Data → Write Grader → Verify → Evaluate → Analyze → Train
     ↓ upload          ↓ upload          ↓ upload        ↓ upload        ↓ upload                    ↓ iterate    ↓ iterate
   (workflow)      (knowledge)        (topics)        (records)       (grader)                  (fix grader/data) (adjust config)
```

**Each step uploads to the gateway immediately** — the vLLora UI shows progress in real time. You don't wait until the end to push data.

**Execute ALL steps (1-9).** Steps 1-6 prepare the dataset. Steps 7-9 evaluate and train the model. Do NOT stop at Step 6 — always run evaluation at minimum. If the user only asks for data preparation, you may stop at Step 6, but by default run the full pipeline including evaluation and training.

### Working Directory

Create a local directory for all artifacts:

```
finetune-project/
├── training.jsonl              # Training prompts (JSONL format)
├── grader.js                   # Evaluation/grader function
├── topics.json                 # Topic hierarchy
├── relations.json              # Topic → part mappings for data generation
├── knowledge/                  # Extracted domain knowledge
│   ├── chess-tactics/           # Per-document subdirectory (slugified filename)
│   │   ├── extract.py          # Custom extraction script FOR THIS document
│   │   ├── docling-result.json # Raw Docling response for this document
│   │   ├── knowledge_parts.json# Typed parts for this document
│   │   └── parts-index.json   # Part index for this document
│   ├── strategy-guide/          # Second document
│   │   └── ...
│   ├── all-parts-index.json    # Merged part index across ALL documents
│   └── extraction-notes.md     # Extraction notes for all documents
├── config.json                 # Workflow ID + gateway URL
├── execution-log.md            # Running log of every step (created at Step 1)
├── iterations.md               # Iteration-over-iteration progress tracker
├── evaluations/                # Eval results per iteration
│   └── eval-001.json           # Full eval results (scores per record)
└── training-jobs/              # Training job metadata per iteration
    └── train-001.json          # Training config + status
```

**Multi-document handling**: Each source document gets its own subdirectory under `knowledge/` named by slugifying the filename (e.g., `chess-tactics-dave-regis/`, `strategy-guide/`). Use the document name, not `doc-1/` — the folder name should identify which document it came from at a glance. Each subdirectory contains that document's `docling-result.json`, `knowledge_parts.json`, and `parts-index.json`. A merged `knowledge/all-parts-index.json` combines all per-document indexes for topic design and data generation.

**Table-heavy documents** (e.g., USDA reference tables, lookup databases): Documents that are mostly tabular data produce many table parts but limited conversational training data. For these documents, write a "synthesis part" — a prose summary of the key facts from the tables — and include it as a text part alongside the tables. This gives the model facts to reference in conversational answers rather than trying to recite table rows.

**Workflow reuse**: Each test run should create a fresh workflow via `finetune.py create-workflow` or the gateway API. Do not reuse a workflow from a previous run — leftover topics, records, or grader state will interfere. If you need to re-run, create a new workflow and update `config.json`. You can list existing workflows with `GET /finetune/workflows` to see what's already there.

### Execution Log

Maintain `execution-log.md` as an **append-only** chronological record.

> **CRITICAL:** Create `execution-log.md` at the START of Step 1, before any other work. Write to it IMMEDIATELY after each action — do NOT wait until the end to write the log retroactively. The log must reflect real-time progress so that if the pipeline fails mid-run, the log shows exactly where it stopped. Use `echo` or `cat >>` to append entries directly — do not buffer them.

After every action (not just step boundaries), append entries to `execution-log.md` immediately.

**Log after each action** using `echo` or `cat >>`:

```
Log to execution-log.md:
- Step: Step 4 — Generate Training Data
- Action: Pass 1 — LLM-driven generation for 18 leaf topics
- Strategy: chat_completion.py, model gpt-4o-mini, temperature 0.8, response_format json_object, 10 prompts per topic grounded in linked knowledge chunks
- Results: 180 records generated (centre-control: 10, tactical-sacrifices: 10, ...)
- Issues: None
```

Logging steps:
1. Read the current `execution-log.md` (or create it if it doesn't exist)
2. Get the current timestamp via `date '+%Y-%m-%d %H:%M:%S'`
3. Append new entries — **never overwrite or delete previous entries**
4. Format consistently using the template below

**Log entry format:**
```markdown
## Step N: Step Name
- [YYYY-MM-DD HH:MM:SS] Action description
  - Strategy: approach, model, parameters (for LLM-driven actions)
  - Results: counts, files written, outputs
  - Issues: failures, retries, what was fixed (if any)
```

**Example log** (showing multi-pass generation with a retry):
```markdown
## Step 1: Define Objective
- [2026-03-06 10:32:15] System prompt defined: "You are a chess tactics tutor..."
- [2026-03-06 10:32:20] POST /finetune/workflows → created, id: "wf_abc123"

## Step 2: Extract Documents
- [2026-03-06 10:32:40] Submitted 3 documents to Docling in parallel
  - chess-tactics.pdf (84 pages) → chess-tactics/
  - opening-theory.pdf (120 pages) → opening-theory/
  - endgame-manual.pdf (56 pages) → endgame-manual/
- [2026-03-06 10:35:12] All 3 Docling tasks complete
- [2026-03-06 10:36:00] Processed chess-tactics: 42 raw parts → consolidated to 10 parts (4.2/page)
  - Quality gate: parts/page 4.2 OK, title diversity 85% OK, avg length 480 chars OK
- [2026-03-06 10:36:30] Processed opening-theory: 68 raw → 15 parts (3.0/page)
  - Quality gate: parts/page 3.0 OK, title diversity 78% OK, avg length 620 chars OK
- [2026-03-06 10:37:00] Processed endgame-manual: 29 raw → 8 parts (2.9/page)
  - Quality gate: parts/page 2.9 OK, title diversity 90% OK, avg length 550 chars OK
- [2026-03-06 10:37:10] Merged all-parts-index.json: 33 parts across 3 documents
- [2026-03-06 10:37:20] POST /workflows/{id}/knowledge → uploaded 3 knowledge sources with parts

## Step 3: Build Topics
- [2026-03-06 10:36:45] Created 6 root topics, 18 leaf topics, saved to topics.json
- [2026-03-06 10:37:00] Delegated to relation-builder: linked 42 parts across 18 topics
- [2026-03-06 10:37:10] POST /workflows/{id}/topics → saved 18 topics + 42 relations

## Step 4: Generate Training Data
- [2026-03-06 10:40:00] Strategy: LLM-driven generation via chat_completion.py
  - Model: gpt-4o-mini, temperature: 0.8, response_format: json_object
  - Approach: 1 pass per leaf topic, 10 prompts each, grounded in linked knowledge chunks
  - Generation prompt: "Generate N diverse user prompts varying difficulty, tone, type"
  - Prompt types targeted: explain-why, compare, what-if, analyze, teach-me
- [2026-03-06 10:42:00] Pass 1 results: 180 records across 18 leaf topics
  - centre-control: 10, centre-opening-plans: 10, tactical-sacrifices: 10, ...
- [2026-03-06 10:43:00] Validation: 178/180 passed — 2 records had empty content, removed
- [2026-03-06 10:44:00] Pass 2 (edge cases): +36 records for under-represented topics
- [2026-03-06 10:45:30] Final: 214 records saved to training.jsonl
- [2026-03-06 10:45:35] POST /workflows/{id}/records → uploaded 214 records

## Step 5: Write Grader
- [2026-03-06 10:47:00] Grader written to grader.js (hybrid: programmatic + LLM-as-judge)
- [2026-03-06 10:47:05] PATCH /workflows/{id}/evaluator → saved grader

## Step 6: Verify & Hand Off
- [2026-03-06 10:48:00] Verified all data in gateway DB
  - Records: 214, Topics: 18, Sources: 3, Parts: 33, Relations: 42, Evaluator: YES
- [2026-03-06 10:48:01] Ready! Told user to open vLLora UI
```

**Rules:**
1. **Delegate after every action** — not just step boundaries. Each pass, fix, retry, and validation gets its own log entry.
2. **Log the strategy** — for LLM-driven actions, always record: model, parameters, prompt approach, and rationale.
3. **Never overwrite** — re-running a step adds new entries below the old ones. Previous entries are history.
4. **Log failures** — if something fails, log what failed and why before fixing it.

---

### Step 1: Define the Objective

Ask the user what behaviors the model should learn. Produce two things:
- An **objective statement** describing desired behaviors and constraints
- A **system prompt** ("You are...") that will be used in Step 4 (record generation) to prefix every training conversation

> **Note:** The system prompt is NOT stored on the workflow. It's composed at record generation time (Step 4) from a root persona + per-topic segments, and embedded in each record's `messages[0]`. Save it locally for use in Step 4.

**Upload immediately** — create the workflow on the gateway so the UI shows progress from the start:
```bash
WORKFLOW_ID=$(python3 scripts/finetune.py create-workflow \
  --name "My Project" \
  --objective "Train a model to..." | tail -1)
echo "Workflow created: $WORKFLOW_ID"
```
Save `$WORKFLOW_ID` — every subsequent step uses it to upload data incrementally.

**Persist the workflow ID** to a config file so it's easy to find later:
```bash
cat > finetune-project/config.json << EOF
{"workflow_id": "$WORKFLOW_ID", "gateway_url": "http://localhost:9090"}
EOF
```

### Step 2: Extract Documents

Read the user's documents (PDFs, markdown, text). Extract typed, linked source_parts — text passages, tables (with cell structure), and images (with base64 data). Each document produces its own `knowledge_parts.json` in a per-document subdirectory.

**Process each document through these stages:**

#### 2a. Submit all documents to Docling in parallel

Check if Docling Serve is running:
```bash
curl -sS http://127.0.0.1:5001/health
```
If not running, check if Docker is available:
```bash
docker info > /dev/null 2>&1 && echo "Docker OK" || echo "Docker NOT available"
```
- **Docker available**: Start Docling: `docker run -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest` — wait for startup to complete, then verify with the health check.
- **Docker NOT available**: Skip to the **pdftotext fallback** at the end of this step. You lose table structure and image extraction but can still produce text-based knowledge parts.

**Extract each document individually** using the `docling_extract.py` helper script. Process each PDF end-to-end (extract → write custom script → consolidate → validate → upload) before moving to the next. This avoids blocking: a small PDF can be fully processed while a larger one is still being extracted by Docling.

```bash
# Process each PDF one at a time: extract → process → upload → next
for DOC in *.pdf; do
  DOC_SLUG=$(echo "${DOC%.pdf}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  DOC_DIR="finetune-project/knowledge/$DOC_SLUG"

  # Extract via Docling (blocks until this PDF is done)
  python3 scripts/docling_extract.py "$DOC" \
    --output "$DOC_DIR/docling-result.json"

  # Then immediately: read chunks, write extract.py, run it,
  # consolidate, validate, upload — see steps 2c-2g below
done
```

> **IMPORTANT**: Always use `docling_extract.py` — it uses the async API with polling. Do NOT use curl to hit Docling endpoints directly, as the sync endpoint times out on large documents (>100 pages).

> **Why not batch mode?** `--batch` mode submits all PDFs in parallel but blocks until ALL complete. A 282-page PDF takes 15 min while an 84-page one finishes in 4 min. Processing each individually lets you extract, process, and upload the smaller PDFs immediately while Docling works on the larger ones. Use `--batch` only if all documents are similar size.

> **Note**: For large PDFs (200+ pages), Docling extraction can take 10-20 minutes.

#### 2c. Process each document into knowledge parts

For **each** document directory, produce `knowledge_parts.json` and `parts-index.json`:

1. **Read the Docling result before writing any code.** Read chunks 0-9 to understand the document — title, structure, content type, heading patterns. Then read a few chunks from the middle and end. This context is critical for writing a good extraction script.

2. **Write a script** inside the per-document directory: `knowledge/{doc-slug}/extract.py`. This keeps extraction scripts co-located with their document's data, not scattered in the project root. The script must produce `knowledge/{doc-slug}/knowledge_parts.json` — typed source_parts (text, table, image) with titles, extraction paths, and provenance metadata matching the schema in `reference/extraction-guide.md` Section 3.

   **Script location**: `finetune-project/knowledge/{doc-slug}/extract.py` — NOT in `finetune-project/` root.

   **Chunking philosophy**: Docling's `max_tokens` is just a safety ceiling — it prevents runaway chunks but should NOT determine your part boundaries. **Your extraction script decides how to group content** based on the document's actual structure. Group content by semantic units:
   - A section heading + all its content = one part
   - A chapter intro + its examples = one part
   - Don't split mid-paragraph or mid-example
   - Target 200-2000 chars per part, but let the content dictate the boundaries — a 3000-char section is better as one part than split arbitrarily

   **Important**: Prefix all part IDs with the document identifier (typically the slugified filename) to keep them unique across documents. For example: `chess-tactics-chapter-3`, `strategy-guide-section-5`.

3. **Upgrade table parts** — after producing `knowledge_parts.json`, run the table extraction script to upgrade any text parts that reference Docling tables to proper `type: "table"` with structured metadata:

   ```bash
   python3 scripts/extract_tables.py \
     --docling-result "$DOC_DIR/docling-result.json" \
     --parts-file "$DOC_DIR/knowledge_parts.json"
   ```

   This inspects the original Docling result for structured table data (headers, rows, cell grid) and adds it as `content_metadata` on the corresponding parts. Table parts keep their markdown rendering in `content` (for display) but gain structured `content_metadata.headers` and `content_metadata.rows` (for programmatic grader lookups). Skip this step only if the document has no tables.

4. **Consolidate parts** — after table upgrade, run the consolidation script to merge small fragments, fix Unicode encoding, and validate quality:

   ```bash
   python3 scripts/consolidate_parts.py "$DOC_DIR/knowledge_parts.json"
   ```

   This merges adjacent text parts under the same heading, drops parts under 50 chars, fixes Unicode escapes, reassigns IDs, and regenerates `parts-index.json`. **A healthy extraction produces 2-10 parts per page.** If the script reports FAIL, fix the extraction script and re-run.

   > ⚠️ **ID rewrite warning:** `consolidate_parts.py` reassigns ALL part IDs to sequential `{doc-slug}-p-001`, `{doc-slug}-p-002`, etc. Your original semantic IDs from the extraction script are replaced. Build `relations.json` AFTER consolidation using the rewritten IDs from `parts-index.json`, not the original IDs.

   You can also dry-run to check quality without modifying:
   ```bash
   python3 scripts/consolidate_parts.py "$DOC_DIR/knowledge_parts.json" --dry-run
   ```

See `reference/extraction-guide.md` for the full response structure, schema, and step-by-step guidance.

#### 2d. Merge part indexes

After processing all documents, merge the per-document indexes into a single `knowledge/all-parts-index.json`:

```bash
python3 -c "
import json, glob, os
all_parts = []
# Find all parts-index.json in subdirectories (skip all-parts-index.json at root)
for idx_file in sorted(glob.glob('finetune-project/knowledge/*/parts-index.json')):
    parts = json.load(open(idx_file))
    if isinstance(parts, dict) and 'parts' in parts:
        all_parts.extend(parts['parts'])
    elif isinstance(parts, list):
        all_parts.extend(parts)
json.dump({'parts': all_parts}, open('finetune-project/knowledge/all-parts-index.json', 'w'), indent=2)
doc_count = len(glob.glob('finetune-project/knowledge/*/parts-index.json'))
print(f'Merged {len(all_parts)} parts from {doc_count} documents')
"
```

This merged index is what you use for topic design (Step 3) and data generation (Step 4) — it's small enough to read in context and covers all documents.

**Fallback — pdftotext** (when Docker is not available):

Use the `pdftotext_extract.py` helper — same CLI pattern as `docling_extract.py` but zero dependencies (just needs `pdftotext` installed). Outputs `knowledge_parts.json` in the same schema.

Single document:
```bash
python3 scripts/pdftotext_extract.py document.pdf -o finetune-project/knowledge/doc-slug/knowledge_parts.json
```

Batch mode (all PDFs at once):
```bash
python3 scripts/pdftotext_extract.py --batch \
  doc1.pdf:finetune-project/knowledge/doc1/knowledge_parts.json \
  doc2.pdf:finetune-project/knowledge/doc2/knowledge_parts.json
```

Then run `consolidate_parts.py` and `validate_extraction.py` on the output — same as the Docling path. Note: pdftotext loses tables, images, and complex layout.

**Save your extraction notes** to `knowledge/extraction-notes.md` — for each document: name, page count, section headings, key concepts, number of parts extracted.

#### 2e. Assess source content quality

After extraction, assess whether each document's content is suitable for training data generation. Not all PDFs are equally useful — a document full of move notation or reference tables produces worse training data than one with explanatory prose.

**Quick content quality check** (run per document after extraction):
```bash
python3 -c "
import json, re
d = json.load(open('$DOC_DIR/knowledge_parts.json'))
parts = d.get('parts', [])
# Count parts with teaching/explanatory content (2+ teaching keywords)
teaching_kw = ['explain', 'because', 'reason', 'strategy', 'concept', 'important', 'principle', 'technique', 'understand', 'learn']
good = sum(1 for p in parts if sum(1 for kw in teaching_kw if kw in p.get('content','').lower()) >= 2)
total = len(parts)
print(f'Teaching-quality parts: {good}/{total} ({good/max(total,1)*100:.0f}%)')
if good / max(total, 1) < 0.10:
    print('WARNING: <10% of parts have explanatory content. This document is mostly notation/data.')
    print('  Training data quality will be limited — consider adding a more expository document.')
else:
    print('OK: Document has sufficient explanatory content for quality training data.')
"
```

**What to do if a document scores <10%:**
- It's still usable for demo/testing — the LLM can synthesize questions from game annotations
- For production quality, add a more explanatory document (textbook, tutorial, manual)
- Log the assessment in `extraction-notes.md` so downstream steps know what to expect

#### 2f. Verify ALL documents were processed and pass structural quality gates

**CRITICAL CHECK — do NOT proceed to Step 3 until this passes:**
```bash
# Count source documents vs extracted documents
DOC_COUNT=$(ls *.pdf 2>/dev/null | wc -l | tr -d ' ')
EXTRACTED_COUNT=$(find finetune-project/knowledge -mindepth 2 -name 'knowledge_parts.json' 2>/dev/null | wc -l | tr -d ' ')
echo "Source documents: $DOC_COUNT | Extracted: $EXTRACTED_COUNT"

if [ "$EXTRACTED_COUNT" -lt "$DOC_COUNT" ]; then
  echo "ERROR: Only $EXTRACTED_COUNT of $DOC_COUNT documents extracted!"
  echo "Missing documents — go back and process the remaining ones."
  exit 1
else
  echo "OK: All $DOC_COUNT documents extracted."
fi

# Run quality validation across all documents
python3 scripts/validate_extraction.py finetune-project/knowledge/
```

If any documents are missing, go back to Step 2a-2c and process the missing ones. If the quality validation fails, run the consolidation script on the failing documents:
```bash
python3 scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

If consolidation alone doesn't fix the issues (e.g., broken heading detection), fix the extraction script and re-extract the failing documents.

**Upload immediately** — push each document's knowledge source + parts to the gateway so the UI shows sources as they're extracted. Use `--force` for safe re-uploads (uses PUT upsert — atomically replaces any existing source with the same name):
```bash
for i in "${!DOCS[@]}"; do
  DOC="${DOCS[$i]}"
  DOC_DIR="${DOC_DIRS[$i]}"
  [ -f "$DOC_DIR/knowledge_parts.json" ] || continue

  python3 scripts/finetune.py upload-knowledge \
    --workflow-id $WORKFLOW_ID \
    --file "$DOC" \
    --parts-file "$DOC_DIR/knowledge_parts.json" \
    --name "$DOC" \
    --force \
    --description "Source document: $DOC" \
    --metadata '{"extraction_method":"docling_hybrid"}'
done
```

### Step 3: Build Topic Hierarchy

**A topic = a type of training example you want to generate.** Each leaf topic answers the question: "what scenario should the model practice handling?" The hierarchy groups related scenarios together so you can balance coverage and spot gaps.

Decide what topics to create based on:
- **The objective** — what behaviors does the model need? Each distinct behavior cluster becomes a topic.
- **The documents** (if available) — what content exists to generate examples from? Read `knowledge/all-parts-index.json` (the merged index across all documents) and use `extraction_path` values as a checklist to make sure your topics cover the available material, not as a template to copy directly.

Save to `topics.json` as a **flat array** — every topic at the same level, hierarchy expressed via `parent_id`. Each topic has a `system_prompt` that describes its specialization:

```json
[
  {"id": "billing", "name": "Billing", "parent_id": null, "system_prompt": "Specialize in: payment and subscription questions. Help users understand billing cycles, charges, and payment methods."},
  {"id": "billing-refunds", "name": "Refunds", "parent_id": "billing", "system_prompt": "Focus on: refund requests and policies. Guide users through the refund process, explain eligibility, and handle edge cases."}
]
```

Aim for 3-7 root topics, 2-3 levels deep, each leaf supporting 10-30 training examples. See `reference/topic-hierarchy.md` for design guidelines.

**System prompt composition**: The `system_prompt` field on each topic is a **segment** that gets composed with its ancestors during record generation. The final system prompt in a training record is:

```
[Root system prompt from --system-prompt]

[Root topic system_prompt]

[Parent topic system_prompt]

[Leaf topic system_prompt]
```

Each level adds specificity without contradicting the parent. Keep each segment to 1-2 sentences. The composed prompt should be 50-150 words total.

**Example composed prompt** (for a record under `billing > refunds`):
```
You are a helpful customer support agent for Acme Corp.

Specialize in: payment and subscription questions. Help users understand billing cycles, charges, and payment methods.

Focus on: refund requests and policies. Guide users through the refund process, explain eligibility, and handle edge cases.
```

**Topic-source linking**: After uploading knowledge source parts, link them to topics via the `POST /topics/relations` API. Only create links to parts you've actually extracted — never fabricate references. See `reference/api-reference.md` Section 13 for the relations API.

**Build topic-part relations.** After designing topics, delegate to the `relation-builder` subagent — it reads `knowledge/all-parts-index.json` (the merged index across all documents) and `topics.json`, iteratively matches parts to topics using a retrieve-and-verify loop, and writes `relations.json`. This keeps the parts-index scanning out of main context.

> **ID format note:** Use **human-readable slugs** for topic `id` values in `topics.json` (e.g., `"billing-refunds"`, `"protein-timing"`). The `finetune.py upload-topics` command automatically converts these to UUIDs for the gateway (to avoid cross-workflow collisions) while preserving the slug as `reference_id` for lookups. Use the same slug as `topic_identifier` in `relations.json`, and use the part's string ID (e.g., `chess-tactics-chapter-3`) as `part_identifier`. Do NOT query the database to map IDs manually — `finetune.py upload-relations` resolves everything locally.

If there are no documents (objective-only pipeline), skip this step — no relations.json needed.

**Upload immediately** — push topics and relations to the gateway so the UI shows the topic hierarchy and coverage:
```bash
python3 scripts/finetune.py upload-topics \
  --workflow-id $WORKFLOW_ID --file topics.json

# Upload relations (if they exist)
if [ -f relations.json ]; then
  python3 scripts/finetune.py upload-relations \
    --workflow-id $WORKFLOW_ID --file relations.json
fi
```

### Step 3.5: Categorize Existing Records

If the user provides existing training data, assign each record to a leaf topic before generating new data:

```jsonl
{"messages": [...], "id": "record-1", "topic": "billing/refunds"}
```

Skip this step if generating all data from scratch.

### Step 4: Generate Training Data

Write prompts to `training.jsonl` — one JSON object per line. Each line is a **prompt** (system + user messages only — no assistant messages):

```jsonl
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "..."}], "id": "record-1", "topic": "billing/refunds", "source_parts": ["p-001", "p-003"]}
```

Each record includes `source_parts` — the IDs of the knowledge parts used as grounding material. This enables traceability from any record back to the specific document sections it was derived from.

Use `scripts/generate_records.py` to generate user prompts via LLM, grounded in the knowledge chunks linked to each topic:

```bash
python3 scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are an expert chess tutor..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 10
```

The script:
1. Loads topics, relations, and all knowledge parts from per-document `knowledge_parts.json` files
2. Finds leaf topics (topics that aren't parents of any other topic)
3. For each leaf topic: gathers linked source chunks via `relations.json`, calls `chat_completion.py` to generate grounded user prompts, writes records incrementally
4. Reports progress per topic and summarizes failures at the end

If some topics fail, use `--append` to retry only the missing ones without overwriting existing records.

**Customizing generation:** Adapt `--records-per-topic`, `--model`, and `--temperature` to the project. You can also:
- Run multiple passes (basic questions, then edge cases, then multi-turn)
- Validate generated prompts with a second LLM call
- Generate more for under-represented topics
- Use `parts-index.json` instead of full content if chunks are too large for context

**Generate enough data.** At least **100-200 total records** across all topics.

**Upload immediately** — push records to the gateway so the UI shows training data as it's generated:
```bash
python3 scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file training.jsonl
```

### Step 4.5: Generate Variants for Augmentation

If some topics are under-represented, use `scripts/chat_completion.py` to create variants:

1. Select seed records from under-represented topics
2. Call the LLM with the seed prompt + instructions to vary scenario, specifics, tone, complexity
3. Keep system prompt and prior turns unchanged — vary only the final user message
4. Track lineage: `"source_record_id"` pointing to the original
5. Generate 3-5 variants per source record, append to `training.jsonl`

### Step 5: Write the Grader

Write a JavaScript grader function to `grader.js`. Scores model responses 0-1, runs server-side during evaluation and training.

**Before writing the grader, analyze the training data:**
1. Read 10-15 sample rows from `training.jsonl` spanning different topics
2. For each, think about what a perfect vs. mediocre vs. bad response looks like
3. Identify 3-5 domain-specific qualities that separate good from bad
4. Design criteria and weight allocation
5. Then write the JS grader informed by this analysis

```javascript
function evaluate(input) {
  // Extract response and history
  let response = "";
  let history = "";
  if (input.response && typeof input.response === "string") {
      response = input.response;
      history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
  } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
      const lastMessage = input.messages[input.messages.length - 1];
      if (lastMessage.content) response = lastMessage.content;
      history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
  }
  if (!response) return { score: 0, reason: "No response" };

  // Define LLM judge config
  const config = {
      prompt_template: [
          { role: "system", content: "You are an expert evaluator." },
          { role: "user", content: "History:\n{{history}}\n\nResponse:\n{{response}}\n\nRate 0-5 on criteria..." }
      ],
      output_schema: { type: "object", properties: { reasoning: { type: "string" }, score: { type: "number" } }, required: ["reasoning", "score"], additionalProperties: false },
      completion_params: { model_name: "gpt-4.1", temperature: 0.0, max_tokens: 1000 }
  };
  input.history = history;
  input.response = response;
  const result = __langdb_call_llm_as_judge_obj(config, input);
  return { score: result.score || 0, reason: result.reasoning || "" };
}
```

The grader can use `__langdb_call_llm_as_judge_obj(config, input)` for subjective quality assessment — `config` has `prompt_template` (array of `{role, content}` messages with `{{history}}`/`{{response}}` template vars), `output_schema` (JSON Schema for structured output), and `completion_params` (`{model_name, temperature, max_tokens}`). Set `input.history` and `input.response` before calling. See `reference/grader-writing.md` for patterns and `templates/grader-template.js` for a starter.

#### Step 5.1: Mandatory Dry-Run

**You MUST dry-run the grader before uploading.** This catches syntax errors, runtime crashes, and scoring logic bugs before they waste an entire evaluation run:

```bash
python3 scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID \
  --script grader.js \
  --row '{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "What is X?"}, {"role": "assistant", "content": "X is..."}]}'
```

This sends the grader + one row to the gateway's QuickJS sandbox and returns score/reason/errors instantly — no dataset upload needed. Verify:
1. **No errors** — the script compiles and runs
2. **Score is reasonable** — not always 0 or always 1
3. **Reason is informative** — explains why the score was given

If the dry-run fails, fix the grader and re-run. Do NOT proceed to upload until the dry-run passes.

**Note:** The sandbox does NOT support `console.log` — use the `reason` field for debug output. If the dry-run fails, the reason contains the JS error.

**Upload immediately** — push the grader to the gateway so the UI shows it's ready for evaluation:
```bash
python3 scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

### Step 5.5: Validate Before Upload

```bash
python3 scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

Checks: valid JSON, required fields, message structure, no assistant messages (RFT), duplicate IDs, record count (minimum 50, recommend 100-200+), and short user messages (< 10 chars). The `--topics` and `--parts` flags cross-reference `topic` and `source_parts` fields against the actual topic hierarchy and parts index — flagging any orphaned references. Fix errors before proceeding.

### Step 6: Verify & Hand Off

Since each step uploaded data immediately, the gateway already has the full workflow. Verify everything landed correctly before handing off to the UI.

```bash
python3 scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

**Expected**: All counts > 0 and evaluator = YES. If any are missing, re-run the upload for that step.

Tell the user the data is visible at `http://localhost:5173/finetune`, then **proceed immediately to Step 7** (evaluation).

### Step 7: Start Evaluation & Training (Parallel)

**Always start both eval AND training together.** They run on the cloud in parallel and answer different questions:

| | Eval Job (~45 min) | Training Job (hours) |
|---|---------|-------------|
| **Tests** | Base model + your data + your grader | Whether finetuning improves the model |
| **Tells you** | Is my data good? Is my grader fair? | Is the model learning? Are hyperparams right? |
| **Iterate on** | Prompts, topics, grader criteria | Learning rate, epochs, lora_rank |

**Two iteration loops** (run in parallel, don't block each other):

1. **Fast loop (data quality)** — Eval finishes first (~45 min). Analyze per-topic scores, identify weak topics, fix data/grader, re-upload, re-eval. Repeat until avg score > 0.85. **Don't wait for training to iterate on data.**

2. **Slow loop (training quality)** — Training runs for hours with per-epoch evaluations built in. When it finishes, check metrics (reward trend, KL divergence, loss). Adjust hyperparams if needed, retrain with the latest (improved) data.

The fast loop ensures your data is good. The slow loop ensures the model learns from that good data. **Start both on every iteration** — even if training takes longer, you get the eval feedback quickly to keep improving data.

#### 7a. Pre-training validation

Before starting training, validate `max_output_tokens`. The default is **512** — higher values (e.g., 2000) can cause training jobs to fail on the cloud infrastructure. Only increase if you see 100% clipping in training metrics.

> **WARNING**: Setting `max_output_tokens` above 512 may cause training failures. Start with 512 and only increase if clipping is a problem.

#### 7b. Create both jobs (non-blocking)

Use `--create-only` to create the eval job without blocking, so you can start training immediately:

```bash
# Create eval (saves metadata to evaluations/eval-001.json)
# Use --limit N for quick iteration checks (e.g., --limit 50 to eval a subset)
python3 scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations

# Available base models:
# unsloth/Qwen3.5-0.8B, unsloth/Qwen3.5-2B, unsloth/Qwen3.5-4B, unsloth/Qwen3.5-9B

# Create training job (saves metadata to training-jobs/train-001.json)
python3 scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "unsloth/Qwen3.5-4B" \
  --output-model "chess-tutor-v1" \
  --output-dir training-jobs
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

> **Note on eval IDs**: The `POST /finetune/evaluations` response returns `evaluation_run_id` — use this for polling. The workflow's `eval_job_ids` field may show a different internal ID that returns 404. Always use the ID from the create response.

#### 7c. Monitor training + poll eval

Poll both eval and training jobs in parallel using `finetune.py` commands. These commands poll the gateway API and save results locally.

```bash
# Poll eval in foreground (updates evaluations/eval-001.json with progress + results)
python3 scripts/finetune.py poll-eval \
  --file evaluations/eval-001.json

# Poll training in background (updates training-jobs/train-001.json + saves metrics)
# --workflow-id is optional — reads from the job file if omitted
python3 scripts/finetune.py poll-training \
  --file training-jobs/train-001.json &
```

**Key rule**: When one job completes before the other, **immediately analyze its results and start iterating**. Don't wait for the slower job:
- Eval finishes first (usual case) → analyze scores, fix weak topics, re-upload data, start new eval + new training. The old training job keeps running — its results will inform hyperparameter tuning later.
- Training finishes first → analyze metrics (reward, KL, loss), present findings. If training succeeded, check per-epoch evals via `GET /finetune/workflows/{id}/finetune-evaluations?finetune_job_id={job_id}`.
- Both done → cross-reference eval scores with training metrics for the complete picture.

**Data saved by polling** (no re-fetching needed in Step 8):
- `training-jobs/train-001.json` — job status (updated live)
- `training-jobs/{JOB_ID}-metrics.json` — full metrics timeseries
- `training-jobs/{JOB_ID}-epoch-evals.json` — per-epoch per-record evaluations
- `evaluations/eval-001.json` — eval status + full results (updated live)

### Step 8: Analyze Results & Present Findings

Analyze each job's results **as soon as they arrive** — don't wait for both to finish. The analysis is **interactive** — present what you found and let the user drive the next action.

> **Read `reference/analysis-strategy.md`** for decision trees, action templates, and derived metrics.

#### 8a. Analyze training results (when training completes)

The `poll-training` command saved all data to `training-jobs/`. Analyze the saved files — **no API calls needed**:

```bash
python3 scripts/analyze_training.py \
  --metrics-file training-jobs/$JOB_ID-metrics.json \
  --epoch-evals-file training-jobs/$JOB_ID-epoch-evals.json
```

For JSON output (useful for cross-referencing with eval in Step 8c):
```bash
python3 scripts/analyze_training.py \
  --metrics-file training-jobs/$JOB_ID-metrics.json \
  --epoch-evals-file training-jobs/$JOB_ID-epoch-evals.json \
  --json > training-jobs/job-v1-analysis.json
```

The script computes: reward trend, KL health, clipping ratio, loss stability, grad norm spikes, signal strength, and per-topic learning trajectories. It exits with code 1 if critical alerts are found.

Present immediately:
```
=== Training Results (eval still running) ===
Status: succeeded | Epochs: 2 | Steps: 26/26
Reward: 0.762 → 0.745 (declining ⚠️)
KL: final=0.05, max=1146633 (⚠️ exploded at step 10)
Clipping: avg=100%, max=100% (⚠️ all outputs truncated)

Record trajectories: 12 improved, 8 stagnant, 2 degraded
Weakest topic: chess-tactical-thinking (avg delta=-0.05)

Issues found:
  [CRITICAL] KL divergence spiked to 1,146,633 at step 10 — learning rate too aggressive
  [CRITICAL] 100% clipping — all outputs truncated at max_output_tokens
  [HIGH] Reward declined slightly — model got worse, not better

While we wait for eval results, I recommend:
  A. Note these training issues — we'll combine with eval analysis for full picture
  B. Cancel and restart training now with lr=0.000005
```

#### 8b. Analyze eval results (when eval completes)

```bash
curl -s "http://localhost:9090/finetune/evaluations/$EVAL_ID" > evaluations/eval-v1.json
```

**Must compute:**
1. **Overall**: average score, pass rate (>0.7 threshold), score range
2. **Per-topic breakdown**: group scores by topic, sort by average (weakest first)
3. **Low-scoring records**: list records <0.7 with their `reason` fields
4. **Score distribution**: are scores spread out (good) or clustered (grader issue)?

#### 8c. Cross-reference (when both available)

When both results are available, combine the analysis:

```
=== Combined Analysis ===

Evaluation: GO ✅ (avg 0.917, 98% pass rate)
Training:   WARNING ⚠️ (reward declined, KL explosions)

Per-topic:
  Topic                        Eval Score    Status
  chess-early-checkmates          0.952       ✅
  chess-combinations              0.952       ✅
  chess-tactical-thinking         0.800       ⚠️ (weakest, min=0.57)
  ...

Training issues:
  1. [CRITICAL] KL spikes (9 of 26 steps) — lr too high
  2. [CRITICAL] 100% clipping — max_output_tokens=1000 too low
  3. [HIGH] Reward declining — training made model worse

=== Suggested Actions ===
  A. [RECOMMENDED] Lower lr 0.00001→0.000005 AND increase max_output_tokens 1000→2000, run new training
  B. [OPTIONAL] Also regenerate "tactical-thinking" records (weakest eval topic)
  C. [OPTIONAL] Keep eval as-is (0.917 is excellent), only fix training config
  D. I'm satisfied — done

What would you like to do?
```

**Let the user choose.** The user may also direct their own analysis: "I think the grader is too lenient on X" or "lower the learning rate more aggressively".

#### 8c. Quick diagnosis patterns

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

#### 8d. Update Iteration Tracker

**After every eval/training cycle**, append a summary to `iterations.md`. This is the **single source of truth** for tracking progress across iterations. Create it on the first iteration if it doesn't exist.

```markdown
# Iteration Tracker — {Project Name}

## Iteration 1 — {date}

### Config
| Setting | Value |
|---------|-------|
| Base model | unsloth/Qwen3.5-4B |
| Learning rate | 1e-5 |
| LoRA rank | 8 |
| Epochs | 2 |
| Records | 180 |
| Topics | 15 leaf |

### Eval Results
| Metric | Value |
|--------|-------|
| Average score | 0.921 |
| Pass rate (>0.7) | 89.4% |
| Score range | 0.51 — 1.0 |

### Per-Topic Breakdown (sorted weakest first)
| Topic | Avg Score | Pass Rate | Records Below 0.7 |
|-------|-----------|-----------|-------------------|
| food-supplements | 0.771 | 75% | 5/12 |
| protein-safety | 0.813 | 83% | 2/12 |
| ... | ... | ... | ... |

### Training Results
| Metric | Value |
|--------|-------|
| Status | failed / succeeded |
| Final reward | 0.745 |
| KL divergence | healthy / exploded at step N |
| Clipping | avg X%, max Y% |

### What Changed (from previous iteration)
- (First iteration — baseline)

### Recommendations for Next Iteration
1. [CRITICAL] Retry training — cloud infra failure
2. [RECOMMENDED] Regenerate food-supplements records (5/12 below threshold)
3. [OPTIONAL] Improve protein-safety records (too academic)
4. [GOOD] Grader works well — no changes needed

---

## Iteration 2 — {date}

### What Changed (from Iteration 1)
- Regenerated food-supplements records with richer source material
- Lowered learning rate to 5e-6
- Increased max_output_tokens to 2000

### Eval Results
...
```

**Rules for the iteration tracker:**
- **Append only** — never overwrite or delete previous iterations
- **Include actual numbers** — no vague "improved" or "got better", always cite the metric
- **Compare to previous** — "avg score 0.921 → 0.945 (+0.024)" when there's a prior iteration
- **Actionable recommendations** — each recommendation should be a specific action (regenerate X, adjust Y), not generic advice

### Step 9: Iterate (If Needed)

Based on the user's choice from Step 8, apply fixes and start new jobs. **Max 5 iterations.**

#### 9a. Apply the chosen fix

**Fixing the grader** (no data re-upload needed):
```bash
# Edit grader.js, then update:
python3 scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

**Fixing the data** (requires re-upload):
```bash
# Regenerate records for weak topics, re-validate, re-upload
python3 scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file training.jsonl

# No manual sync needed — the gateway auto-uploads workflow data to the cloud
# when creating eval or training jobs (via ensure_dataset_uploaded()).
```

**After any fix, always start BOTH new eval AND new training:**
```bash
# New eval with improved data
python3 scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations

# New training with improved data (adjust config if needed)
python3 scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "unsloth/Qwen3.5-4B" \
  --output-model "project-v2" \
  --output-dir training-jobs
```

**Adjusting training config**: Modify parameters in the next job creation (Step 7b).

**If training failed with an opaque error** (e.g., "worker exited with status 1"): This is usually a transient cloud infrastructure failure. Retry with the same config first. If it fails again, try a smaller model or reduce batch size.

#### 9b. Start new eval + training jobs

After applying fixes, start new jobs — same as Step 7a + 7b but with incremented version numbers:
```bash
python3 scripts/run_evaluation.py --dataset-id $WORKFLOW_ID --output evaluations/eval-v2.json
# New training job with adjusted config
JOB=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs ...)
```

#### 9c. Iteration limits and escalation

- **Max 5 iterations.** After 5, stop and report full diagnosis to the user.
- **Base model escalation:** After 2 failed iterations on the same model: `Qwen3.5-4B` → `7B` → larger.
- **When to stop:** User says they're satisfied, OR avg score > 0.8 AND training reward > 0.7, OR 3+ iterations with no improvement.

#### 9d. Iteration log format

Track every iteration in `execution-log.md` with **actual metrics from the API**:
```markdown
## Iteration 1
- [2026-03-17 14:30:00] Started eval eval-v1 + training job ft_job_001
  - Base: Qwen3.5-4B, lr: 0.00001, lora_rank: 8, epochs: 2, max_output_tokens: 1000
- [2026-03-17 14:35:00] Training metrics (in-flight): step 10/26, reward=0.65, kl=0.04, clip=12%
- [2026-03-17 14:40:00] Training metrics (in-flight): step 20/26, reward=0.68, kl=0.06, clip=15%
  - [WARNING] Clipping trending up — may need higher max_output_tokens next run
- [2026-03-17 14:45:00] Eval completed: avg=0.72, pass_rate=78%
  - Weak topics: strategic-endgame (0.45), pawn-endgames (0.52)
- [2026-03-17 15:10:00] Training completed
  - Reward: 0.55 → 0.65 (improving, delta=+0.10)
  - KL: final=0.08, max=0.12 (healthy)
  - Clipping: avg=14%, max=18% (OK)
  - Loss: 0.42 → 0.31 (decreasing, good)
  - Per-epoch evals: 12 improved, 8 stagnant, 2 degraded
- [2026-03-17 15:10:30] Presented findings to user
  - User chose: "Regenerate endgame records, increase max_output_tokens"

## Iteration 2
- [2026-03-17 15:15:00] Regenerated 22 records for endgame topics
- [2026-03-17 15:16:00] Started eval eval-v2 + training job ft_job_002
  - Base: Qwen3.5-4B, lr: 0.000005, lora_rank: 8, epochs: 2, max_output_tokens: 512
- [2026-03-17 15:30:00] Training completed
  - Reward: 0.60 → 0.72 (improving, delta=+0.12)
  - KL: final=0.05, max=0.07 (healthy)
  - Clipping: avg=3%, max=5% (fixed!)
  - Per-epoch evals: 18 improved, 3 stagnant, 1 degraded
  - Per-topic learning: endgame topics avg delta=+0.15 (big improvement)
- [2026-03-17 15:31:00] Saved to training-jobs/job-v2-metrics.json, job-v2-epoch-evals.json
```

### Using the vLLora UI

The vLLora UI at **http://localhost:5173** provides visual tools for the same steps above:
- Score distributions and per-record drilldown for evaluation results
- Real-time training metrics charts and loss curves
- Interactive grader editing and data management

If the user prefers the visual experience, tell them to open the UI after Step 6.

## Reference Files (Deep Dives)

Read these when you need more detail on a specific step:

| File | When to read |
|------|-------------|
| `reference/api-reference.md` | When making API calls — all 64 gateway endpoints with curl examples |
| `reference/data-format.md` | When generating JSONL — format rules, validation, quality tips |
| `reference/extraction-guide.md` | When extracting documents — Docling API, response structure, knowledge_parts.json schema |
| `reference/grader-writing.md` | When writing the grader — 3 patterns, design guidelines, common mistakes |
| `reference/topic-hierarchy.md` | When designing topics — structure, coverage analysis, balance scoring |
| `reference/iteration-strategy.md` | When analyzing results — diagnosis, stall patterns, escalation ladder |
| `reference/analysis-strategy.md` | **Read at Step 8** — data fields, decision trees, action templates, interactive presentation |
| `reference/workflow-guide.md` | For the full detailed walkthrough of every step |

## Helper Scripts

Run with `uv run` (PEP 723 — dependencies declared inline).

| Script | Purpose |
|--------|---------|
| `scripts/finetune.py` | Gateway API wrapper — create workflow, upload knowledge/topics/records/grader, verify |
| `scripts/generate_records.py` | Generate training records from topics + knowledge — calls LLM per leaf topic |
| `scripts/validate_dataset.py` | Validate JSONL before upload — format, fields, RFT compliance, cross-reference topics/parts |
| `scripts/run_evaluation.py` | Create eval job, poll until complete (~30 min timeout), save results |
| `scripts/start_training.py` | Start training job, poll until complete, save response |
| `scripts/analyze_training.py` | Fetch + analyze training metrics — reward trend, KL, clipping, loss, per-epoch evals, alerts |
| `scripts/chat_completion.py` | Call LLM via gateway — validates JSON output when `response_format` is `json_object` |
| `scripts/dry_run_grader.py` | Dry-run grader on a single row — instant syntax/logic check |
| `scripts/consolidate_parts.py` | Merge adjacent text parts, drop short fragments, fix Unicode, regenerate parts-index |
| `scripts/validate_extraction.py` | Cross-document extraction quality gate (parts/page, title diversity, avg length) |
| `scripts/docling_extract.py` | Submit PDF(s) to Docling Serve async API, poll until done, supports batch mode |
| `scripts/pdftotext_extract.py` | Fallback PDF extraction via pdftotext (no Docker required), same output schema |
