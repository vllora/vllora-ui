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
Define Objective → Extract Documents → Build Topics → Generate Data → Write Grader → Verify & Hand Off
     ↓ upload          ↓ upload          ↓ upload        ↓ upload        ↓ upload
   (workflow)      (knowledge)        (topics)        (records)       (grader)
```

**Each step uploads to the gateway immediately** — the vLLora UI shows progress in real time. You don't wait until the end to push data.

You execute Steps 1-6. Then the vLLora UI + Lucy take over for the interactive loop (evaluation, grader tuning, iteration, training, deployment).

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
│   │   ├── docling-result.json # Raw Docling response for this document
│   │   ├── knowledge_parts.json# Typed parts for this document
│   │   └── parts-index.json   # Part index for this document
│   ├── strategy-guide/          # Second document
│   │   └── ...
│   ├── all-parts-index.json    # Merged part index across ALL documents
│   └── extraction-notes.md     # Extraction notes for all documents
└── execution-log.md            # Running log of every step
```

**Multi-document handling**: Each source document gets its own subdirectory under `knowledge/` named by slugifying the filename (e.g., `chess-tactics-dave-regis/`, `strategy-guide/`). Use the document name, not `doc-1/` — the folder name should identify which document it came from at a glance. Each subdirectory contains that document's `docling-result.json`, `knowledge_parts.json`, and `parts-index.json`. A merged `knowledge/all-parts-index.json` combines all per-document indexes for topic design and data generation.

### Execution Log

Maintain `execution-log.md` as an **append-only** chronological record. After every action (not just step boundaries), delegate to the `execution-logger` subagent to append entries.

**Delegate logging after each action:**

```
Log to execution-log.md:
- Step: Step 4 — Generate Training Data
- Action: Pass 1 — LLM-driven generation for 18 leaf topics
- Strategy: chat_completion.py, model gpt-4o-mini, temperature 0.8, response_format json_object, 10 prompts per topic grounded in linked knowledge chunks
- Results: 180 records generated (centre-control: 10, tactical-sacrifices: 10, ...)
- Issues: None
```

The subagent will:
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
- [2026-03-06 10:36:00] Processed chess-tactics: 10 parts, opening-theory: 15 parts, endgame-manual: 8 parts
- [2026-03-06 10:36:10] Merged all-parts-index.json: 33 parts across 3 documents
- [2026-03-06 10:36:20] POST /workflows/{id}/knowledge → uploaded 3 knowledge sources with parts

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
- A **system prompt** ("You are...") that will prefix every training conversation

**Upload immediately** — create the workflow on the gateway so the UI shows progress from the start:
```bash
WORKFLOW_ID=$(uv run scripts/finetune.py create-workflow \
  --name "My Project" \
  --objective "Train a model to..." \
  --system-prompt "You are..." | tail -1)
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

**Submit ALL documents at once** — Docling processes them asynchronously, so fire all requests before polling:
```bash
# Create per-document directories using slugified filenames, submit all in parallel
DOCS=(*.pdf)  # or list specific files
TASK_IDS=()
DOC_DIRS=()

for DOC in "${DOCS[@]}"; do
  # Slugify: lowercase, replace spaces/special chars with hyphens, strip extension
  DOC_SLUG=$(echo "${DOC%.pdf}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  DOC_DIR="finetune-project/knowledge/$DOC_SLUG"
  mkdir -p "$DOC_DIR"
  DOC_DIRS+=("$DOC_DIR")

  TASK_RESPONSE=$(curl -sS -X POST "http://127.0.0.1:5001/v1/chunk/hybrid/file/async" \
    -F "files=@${DOC};type=application/pdf" \
    -F "include_converted_doc=true" \
    -F "convert_do_ocr=true" -F "convert_do_table_structure=true" \
    -F "convert_include_images=true" -F "convert_image_export_mode=embedded" \
    -F "chunking_merge_peers=true" -F "chunking_tokenizer=BAAI/bge-small-en-v1.5")
  TASK_ID=$(echo "$TASK_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['task_id'])")
  TASK_IDS+=("$TASK_ID")

  echo "Submitted $DOC → task $TASK_ID → $DOC_DIR"
done

echo "Submitted ${#DOCS[@]} documents total. Now polling..."
```

#### 2b. Poll all tasks until complete

```bash
for i in "${!TASK_IDS[@]}"; do
  TASK_ID="${TASK_IDS[$i]}"
  DOC_DIR="${DOC_DIRS[$i]}"

  # Poll until done
  while true; do
    STATUS=$(curl -sS "http://127.0.0.1:5001/v1/status/poll/$TASK_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','pending'))")
    [ "$STATUS" = "success" ] && break
    sleep 5
  done

  # Fetch result
  curl -sS "http://127.0.0.1:5001/v1/result/$TASK_ID" -o "$DOC_DIR/docling-result.json"
  echo "Saved result for ${DOCS[$i]} → $DOC_DIR/docling-result.json"
done
```

#### 2c. Process each document into knowledge parts

For **each** document directory, produce `knowledge_parts.json` and `parts-index.json`:

1. **Read the Docling result before writing any code.** Read chunks 0-9 to understand the document — title, structure, content type, heading patterns. Then read a few chunks from the middle and end. This context is critical for writing a good extraction script.

2. **Write a script** to create `{doc-slug}/knowledge_parts.json` — the required deliverable per document. The script must produce typed source_parts (text, table, image) with titles, extraction paths, and provenance metadata matching the schema in `reference/extraction-guide.md` Section 3.

   **Important**: Prefix all part IDs with the document identifier (typically the slugified filename) to keep them unique across documents. For example: `chess-tactics-chapter-3`, `strategy-guide-section-5`.

3. The extraction script must also produce `{doc-slug}/parts-index.json` — a lightweight index with `{id, type, title, extraction_path, pages, content_preview, source_doc}` per part (first 200 chars of content, plus the source document filename).

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
```bash
for DOC in *.pdf; do
  DOC_SLUG=$(echo "${DOC%.pdf}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  DOC_DIR="finetune-project/knowledge/$DOC_SLUG"
  mkdir -p "$DOC_DIR"
  pdftotext "$DOC" "$DOC_DIR/converted.txt"
done
```
Then write extraction scripts per document as above.

**Save your extraction notes** to `knowledge/extraction-notes.md` — for each document: name, page count, section headings, key concepts, number of parts extracted.

#### 2e. Verify ALL documents were processed

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
```

If any documents are missing, go back to Step 2a-2c and process the missing ones before continuing. Each document MUST have its own subdirectory (slugified filename) with `knowledge_parts.json` and `parts-index.json`.

**Upload immediately** — push each document's knowledge source + parts to the gateway so the UI shows sources as they're extracted:
```bash
for i in "${!DOCS[@]}"; do
  DOC="${DOCS[$i]}"
  DOC_DIR="${DOC_DIRS[$i]}"
  [ -f "$DOC_DIR/knowledge_parts.json" ] || continue

  uv run scripts/finetune.py upload-knowledge \
    --workflow-id $WORKFLOW_ID \
    --file "$DOC" \
    --parts-file "$DOC_DIR/knowledge_parts.json" \
    --name "$DOC" \
    --description "Source document: $DOC" \
    --metadata '{"extraction_method":"docling_hybrid"}'
done
```

### Step 3: Build Topic Hierarchy

**A topic = a type of training example you want to generate.** Each leaf topic answers the question: "what scenario should the model practice handling?" The hierarchy groups related scenarios together so you can balance coverage and spot gaps.

Decide what topics to create based on:
- **The objective** — what behaviors does the model need? Each distinct behavior cluster becomes a topic.
- **The documents** (if available) — what content exists to generate examples from? Read `knowledge/all-parts-index.json` (the merged index across all documents) and use `extraction_path` values as a checklist to make sure your topics cover the available material, not as a template to copy directly.

Save to `topics.json` as a **flat array** — every topic at the same level, hierarchy expressed via `parent_id`:

```json
[{"id": "billing", "name": "Billing", "parent_id": null, "system_prompt": "Focus on payment and subscription questions"},
 {"id": "billing-refunds", "name": "Refunds", "parent_id": "billing", "system_prompt": "Focus on refund requests and policies"}]
```

Aim for 3-7 root topics, 2-3 levels deep, each leaf supporting 10-30 training examples. See `reference/topic-hierarchy.md` for design guidelines.

**Topic-source linking**: After uploading knowledge source parts, link them to topics via the `POST /topics/relations` API. Only create links to parts you've actually extracted — never fabricate references. See `reference/api-reference.md` Section 13 for the relations API.

**Build topic-part relations.** After designing topics, delegate to the `relation-builder` subagent — it reads `knowledge/all-parts-index.json` (the merged index across all documents) and `topics.json`, iteratively matches parts to topics using a retrieve-and-verify loop, and writes `relations.json`. This keeps the parts-index scanning out of main context.

If there are no documents (objective-only pipeline), skip this step — no relations.json needed.

**Upload immediately** — push topics and relations to the gateway so the UI shows the topic hierarchy and coverage:
```bash
uv run scripts/finetune.py upload-topics \
  --workflow-id $WORKFLOW_ID --file topics.json

# Upload relations (if they exist)
if [ -f relations.json ]; then
  uv run scripts/finetune.py upload-relations \
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
uv run scripts/generate_records.py \
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
uv run scripts/finetune.py upload-records \
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
      output_schema: { type: "object", properties: { reasoning: { type: "string" }, score: { type: "number" } }, required: ["reasoning", "score"] },
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
uv run scripts/dry_run_grader.py \
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
uv run scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

### Step 5.5: Validate Before Upload

```bash
uv run scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

Checks: valid JSON, required fields, message structure, no assistant messages (RFT), duplicate IDs, record count (minimum 50, recommend 100-200+), and short user messages (< 10 chars). The `--topics` and `--parts` flags cross-reference `topic` and `source_parts` fields against the actual topic hierarchy and parts index — flagging any orphaned references. Fix errors before proceeding.

### Step 6: Verify & Hand Off

Since each step uploaded data immediately, the gateway already has the full workflow. Verify everything landed correctly before handing off to the UI.

```bash
uv run scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

**Expected**: All counts > 0 and evaluator = YES. If any are missing, re-run the upload for that step.

Tell the user: **"Open http://localhost:5173/finetune to see your workflow. Everything is ready for evaluation."**

### Step 7: Run Evaluation

Run the grader against a rollout model (e.g., `gpt-4o-mini`) that generates responses for each prompt. The gateway auto-uploads your local records + evaluator to the cloud when you create an evaluation.

**Using the helper script** (recommended):
```bash
uv run scripts/run_evaluation.py --dataset-id $WORKFLOW_ID --output evaluations/eval-v1.json
```

This creates the eval run, polls every 3 seconds, prints summary (average score, pass/fail counts), and saves results.

**Or manually:**
```bash
# Create evaluation (dataset_id = your workflow_id — gateway auto-uploads)
EVAL=$(curl -s -X POST http://localhost:9090/finetune/evaluations \
  -H "Content-Type: application/json" \
  -d "{\"dataset_id\": \"$WORKFLOW_ID\", \"rollout_model_params\": {\"model\": \"gpt-4o-mini\"}}")
EVAL_ID=$(echo "$EVAL" | python3 -c "import sys,json; print(json.load(sys.stdin)['evaluation_run_id'])")

# Poll until status == "completed" (every 3 seconds)
while true; do
  RESULT=$(curl -s http://localhost:9090/finetune/evaluations/$EVAL_ID)
  STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ] && echo "FAILED" && exit 1
  sleep 3
done

# Print summary
echo "$RESULT" | python3 -c "
import sys,json
r=json.load(sys.stdin)
s=r.get('summary',{})
print(f'Average: {s.get(\"average_score\",\"N/A\")}')
print(f'Passed: {s.get(\"passed_count\",\"N/A\")}, Failed: {s.get(\"failed_count\",\"N/A\")}')
"
```

**Tip:** Use `--limit 10` for a quick test before running on the full dataset.

Save results to `evaluations/eval-v1.json` — you'll compare against later iterations.

### Step 8: Analyze & Iterate

Read the eval results and decide whether to proceed to training or iterate.

**Decision framework:**

| Verdict | Criteria | Action |
|---------|----------|--------|
| **GO** | avg > 0.6 AND pass rate > 70% | Proceed to Step 9 (Training) |
| **WARNING** | avg 0.5-0.6 OR pass rate 60-70% | Can train, but iteration may help |
| **NO-GO** | avg < 0.5 OR pass rate < 60% | Must iterate before training |

**Quick diagnosis:**
1. **All scores ~0 or ~1** → Grader broken or too lenient — check criteria
2. **One topic consistently low** → Data problem for that topic — regenerate prompts
3. **Good responses scoring low** → Grader criteria misaligned with objective
4. **Contradictory reasons** → LLM judge prompt too vague — make it more specific

**Fixing the grader** (no data re-upload needed):
```bash
# Edit grader.js, then update:
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -F "file=@grader.js"
```

**Fixing the data** (requires re-upload of records):
- Regenerate weak topics, add edge cases, improve prompt variety
- Re-validate: `uv run scripts/validate_dataset.py training.jsonl`
- Re-upload records: `PUT /finetune/workflows/$WORKFLOW_ID/records`

**After each change**, re-run evaluation:
```bash
uv run scripts/run_evaluation.py --dataset-id $WORKFLOW_ID --output evaluations/eval-v2.json
```

**Tracking progress:** Save each eval result to `evaluations/eval-v{N}.json`. Log what changed and scores before/after in `execution-log.md`. Stop iterating when avg > 0.6 AND pass rate > 70%, or after 3+ iterations with no improvement.

See `reference/iteration-strategy.md` for the full 9-part diagnosis framework.

### Step 9: Train & Iterate

Start training and delegate monitoring to a background subagent. If anomalies are detected, diagnose the issue, adjust, and start a new iteration. **Max 5 iterations.**

#### 9a. Start the first training run

```bash
JOB=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "dataset": "'$WORKFLOW_ID'",
    "base_model": "unsloth/Qwen3.5-4B",
    "output_model": "my-finetuned-model",
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
echo "Started job: $JOB_ID"
```

**Base model selection:**
| Model | Best for |
|-------|----------|
| `unsloth/Qwen3.5-4B` | Fast experiments, narrow tasks |
| Larger models (7B+) | Complex reasoning, broad domains |

Start with the smaller model. After 2 failed iterations on the same model, escalate: `Qwen3.5-4B` → `7B` → larger.

**Config adjustments (initial):**
| Situation | Adjustment |
|-----------|------------|
| < 50 records | `epochs: 1` (avoid overfitting) |
| > 500 records | `epochs: 3-4` |
| Complex task | `lora_rank: 16` |
| Simple task | `lora_rank: 4` |

#### 9b. Spawn a monitor subagent

After starting each job, spawn the `training-monitor` subagent **in the background** with the job_id and workflow_id. Use the Agent tool:

```
Agent(
  subagent_type: "training-monitor",
  run_in_background: true,
  prompt: "Monitor training job {JOB_ID} on workflow {WORKFLOW_ID}.
    GATEWAY_URL=http://localhost:9090
    WORKFLOW_ID={workflow_id}
    JOB_ID={job_id}
    Poll metrics every 15s. Report anomalies immediately. Report when done."
)
```

The monitor polls `GET /jobs/{job_id}/metrics` and `GET /jobs/{job_id}/status` every 15 seconds and reports back when:
- Job **succeeds** → report final metrics
- Job **fails** → report error
- **Anomaly detected** → report anomaly type + metrics (monitor does NOT cancel — that's the main agent's call)

#### 9c. Handle the monitor's report

When the background monitor returns, act based on its **status** field:

**If `succeeded`:**
1. Fetch per-epoch scores:
   ```bash
   curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/finetune-evaluations?finetune_job_id=$JOB_ID"
   ```
2. Save results to `training-jobs/job-v{N}.json`
3. Log to `execution-log.md`
4. Test the model with prompts NOT in the training set
5. Compare fine-tuned vs base model behavior
6. Report to user — **done!**

**If `failed`:**
1. Read the error from the monitor's report
2. Log failure to `execution-log.md`
3. If retryable (e.g. infra error), start a new job with same config → go to 9b
4. If not retryable, report to user

**If `anomaly_detected`:**
Diagnose and start the next iteration (see 9d).

#### 9d. Diagnose and iterate on anomaly

1. **Cancel the running job** (the monitor only reports — cancellation is the main agent's decision):
   ```bash
   curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs/$JOB_ID/cancel
   ```

2. **Fetch per-epoch reasons** to understand what's failing:
   ```bash
   curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/finetune-evaluations?finetune_job_id=$JOB_ID"
   ```
3. Read `reason` fields from lowest-scoring records

4. **Apply fix** based on the anomaly type reported by the monitor + your diagnosis:

   | Anomaly | Config Fix |
   |---------|-----------|
   | NaN/Inf loss | Lower `learning_rate` by 2x |
   | KL divergence | Lower `learning_rate` by 2x |
   | High clipping | Increase `max_output_tokens` by 2x |
   | Weak signal | Rewrite grader for better differentiation |
   | Reward collapse | Increase `lora_rank` (4→8→16) |
   | No learning (flat epochs) | Try larger base model |
   | Overfitting (scores peak then decline) | Reduce `epochs` to peak epoch |

5. **If data or grader changed**, sync to cloud before next run:
   ```bash
   # If grader was updated:
   curl -s -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
     -F "file=@grader.js"

   # If records were updated:
   uv run scripts/finetune.py upload-records \
     --workflow-id $WORKFLOW_ID --file training.jsonl

   # Sync changes:
   curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/upload
   ```

6. **Start a new training job** with the adjusted config (back to 9a with updated params)
7. **Spawn a new `training-monitor`** for the new job (9b)
8. **Log the iteration** to `execution-log.md`

#### 9e. Iteration limits and escalation

- **Max 5 iterations.** After 5 failed iterations, stop and report a full diagnosis to the user including all anomalies encountered, fixes attempted, and metric trends.
- **Base model escalation:** After 2 failed iterations on the same base model, escalate to a larger model: `Qwen3.5-4B` → `7B` → larger.

#### 9f. Iteration log format

Track every iteration in `execution-log.md`:
```markdown
## Training Iteration 1
- [2026-03-17 14:30:00] Started job ft_job_001
  - Base: Qwen3.5-4B, lr: 0.00001, lora_rank: 8, epochs: 2
- [2026-03-17 14:45:00] Monitor: anomaly detected — KL divergence (0.3→0.8→1.2)
- [2026-03-17 14:45:05] Cancelled job ft_job_001
- [2026-03-17 14:46:00] Diagnosis: learning rate too high for this dataset size
- [2026-03-17 14:46:00] Fix: lr 0.00001 → 0.000005

## Training Iteration 2
- [2026-03-17 14:47:00] Started job ft_job_002
  - Base: Qwen3.5-4B, lr: 0.000005, lora_rank: 8, epochs: 2
- [2026-03-17 15:10:00] Monitor: job succeeded
  - Final reward: 0.72, epochs completed: 2
  - Per-epoch progression: 0→0.55, 1→0.68, 2→0.72
- [2026-03-17 15:10:30] Saved to training-jobs/job-v2.json
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
| `reference/workflow-guide.md` | For the full detailed walkthrough of every step |

## Helper Scripts

Run with `uv run` (PEP 723 — dependencies declared inline).

| Script | Purpose |
|--------|---------|
| `scripts/finetune.py` | Gateway API wrapper — create workflow, upload knowledge/topics/records/grader, verify |
| `scripts/generate_records.py` | Generate training records from topics + knowledge — calls LLM per leaf topic |
| `scripts/validate_dataset.py` | Validate JSONL before upload — format, fields, RFT compliance, cross-reference topics/parts |
| `scripts/upload_dataset.py` | Upload dataset + grader to gateway (standalone mode) |
| `scripts/run_evaluation.py` | Create eval job, poll until complete (~30 min timeout), save results |
| `scripts/start_training.py` | Start training job, poll until complete, save response |
| `scripts/chat_completion.py` | Call LLM via gateway — validates JSON output when `response_format` is `json_object` |
| `scripts/dry_run_grader.py` | Dry-run grader on a single row — instant syntax/logic check |
