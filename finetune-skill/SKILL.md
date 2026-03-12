---
name: vllora-finetune
description: |
  Guide for fine-tuning LLMs using the vLLora platform. Use this skill whenever the user mentions fine-tuning, finetuning, training a custom model, creating training datasets, writing evaluation/grader functions, or improving model quality through iteration. Also use it when users have documents (PDFs, manuals, knowledge bases) they want to convert into training data, or when they ask about evaluating model outputs with scoring functions. This skill applies even if users don't explicitly say "vLLora" — any request to fine-tune or build training data for an LLM should trigger it.
---

# vLLora Finetune Skill

Fine-tune LLMs using the vLLora platform. You handle all the intelligence — generating training data, writing graders, designing topics, analyzing results. The vLLora backend handles what you can't do locally: running evaluations against a live model, executing training jobs, and serving the fine-tuned model.

**You execute the entire pipeline yourself — including all API calls.** After you generate the training data and grader files, you must actually upload the dataset, create evaluation jobs, poll for results, and submit training jobs.

> **CRITICAL:** Use the helper scripts in `scripts/` for API operations. They handle UUID generation, error handling, and polling automatically. Run them with `uv run` (PEP 723 — dependencies are inline). If `uv` is not available, fall back to direct curl commands. **NEVER create shell scripts (.sh files).** Do not save curl commands to files, do not create `run-pipeline.sh` or similar.

## How vLLora Fine-Tuning Works (Read This First)

vLLora fine-tuning uses a **grader function** as the training objective. Instead of the model simply memorizing input-output pairs, it generates its own responses during training, and the grader scores them. High-scoring responses get reinforced, low-scoring ones get penalized.

This means **the grader IS your training objective**. Whatever the grader rewards, the model will learn to do. A grader that only checks response length will produce a model that writes long responses. A grader that checks accuracy, tone, and completeness will produce a model that's accurate, well-toned, and complete.

The training data you provide defines the *prompts* the model practices on. The grader defines *what good looks like*.

### Prerequisites for Success

Before starting the pipeline, verify these conditions. If they aren't met, fine-tuning will struggle regardless of data or grader quality:

1. **The base model must already have some capability on the task.** Fine-tuning makes gradual improvements — it cannot teach a model something it has zero ability to do. Run a few test prompts against the base model first. If it gets roughly 30-60%+ of responses in the right direction, fine-tuning can improve it. If it produces complete garbage, the base model may be too small or the task too far outside its training.

2. **The task must be unambiguous.** If two domain experts would give different answers to the same prompt, the training signal will be noisy. The grader will reward contradictory behaviors and the model won't converge. Refine vague tasks into specific, verifiable ones.

3. **The task should be guess-proof.** If the model can score well by guessing (e.g., binary yes/no questions, multiple choice with few options), the training signal is too noisy. The model may learn to guess instead of reason. Reframe to open-ended answers or add subclasses.

4. **The grader must produce smooth, varied scores.** Binary pass/fail (0 or 1) gives a weak training signal. Partial credit scores (0.0, 0.3, 0.5, 0.7, 1.0) create smoother learning gradients that help the model understand what "almost right" looks like and improve incrementally.

## The Pipeline

```
Define Objective → Extract Documents → Build Topics → Generate JSONL Data → Write Grader
→ Upload Dataset (API) → Run Evaluation (API) → Analyze Results → Iterate
→ Train Model (API) → Test (API) → Done
```

You execute every step yourself, including the API calls. Don't stop at generating files — upload them, run evaluation, analyze the results, fix issues, and repeat until scores are good enough to train.

### Working Directory

Create a local directory to store all fine-tuning artifacts. Keep everything in one place so you can track progress across iterations:

```
finetune-project/
├── training.jsonl              # Training prompts (JSONL format)
├── grader.js                   # Evaluation/grader function
├── topics.json                 # Topic hierarchy
├── reference/                  # Extracted domain knowledge (required when documents provided)
│   ├── docling-result.json     # Raw Docling response (chunks + document)
│   ├── knowledge_parts.json    # Typed parts: text, table, image (agent-created)
│   ├── document-extraction.md  # Structured extraction summary
│   └── ...                     # Additional extraction files per document
├── evaluations/                # Evaluation results (one file per run)
│   ├── eval-v1.json            # Full API response from evaluation run
│   ├── eval-v2.json
│   └── ...
├── training-jobs/              # Training job results
│   ├── job-001.json            # Job creation response + final status
│   └── job-001-epochs.json     # Per-epoch evaluation scores during training
├── execution-log.md            # Running log of every step (written as you go)
└── iteration-log.md            # Track what changed each iteration and why
```

**Save evaluation results** after each run — store the full API response from `GET /finetune/evaluations/{id}` (includes per-record scores, reasons, and summary). This lets you compare across iterations and spot patterns.

**Save training job responses** — store the job creation response and final status from `GET /finetune/reinforcement-jobs/{id}/status`. After training completes, also save the per-epoch scores from `GET /finetune/datasets/{id}/finetune-evaluations` to see how the model improved during training.

**Keep an iteration log** — a simple markdown file tracking what you changed and the results:

```markdown
## Iteration 1 — 2026-03-05
- Dataset: my-dataset-v1 (backend: ds_abc123)
- Eval run: eval_xyz789
- Result: avg=0.45, pass_rate=60%, std=0.35 → NO-GO
- Issues: Grader too strict on response length, technical/* topics under-represented
- Changes: Relaxed length check, added 15 prompts to technical/*

## Iteration 2 — 2026-03-05
- Dataset: my-dataset-v2 (backend: ds_def456)
- Eval run: eval_abc012
- Result: avg=0.72, pass_rate=85%, std=0.22 → GO
- Decision: Proceed to training

## Training — 2026-03-05
- Job: ft_job_001 (provider: ftjob-abc123)
- Base model: unsloth/Qwen3.5-4B
- Output model: my-custom-model
- Status: succeeded
- Epoch scores: 0→0.52, 1→0.68, 2→0.79
```

This log is critical for diagnosing stalls — if scores aren't improving, the history shows exactly what was tried and what happened.

**Keep an execution log** (`execution-log.md`) — append to this file after EVERY step. Every time you complete a step (read a document, generate topics, generate data, write a grader, make an API call, get a response), immediately update the log before moving to the next step. This is critical for traceability.

**Timestamps are mandatory.** Every log entry MUST include a full timestamp in `YYYY-MM-DD HH:MM:SS` format. Get the current time by running `date '+%Y-%m-%d %H:%M:%S'` via Bash before each log entry. Do NOT use date-only formats like `[2026-03-06]` — always include hours, minutes, and seconds so step durations are visible.

```markdown
## Step 1: Define Objective
- [2026-03-06 10:32:15] System prompt defined: "You are a chess tactics tutor..."

## Step 2: Gather Knowledge
- [2026-03-06 10:32:40] Reading document: chess-tactics.pdf (84 pages)
- [2026-03-06 10:35:12] Extracted 10 sections, saved to knowledge/document-extraction.md
- [2026-03-06 10:35:13] Key topics found: forks, pins, skewers, discoveries, combinations...

## Step 3: Build Topics
- [2026-03-06 10:36:45] Created 6 root topics, 18 leaf topics, saved to topics.json

## Step 4: Generate Training Data
- [2026-03-06 10:38:20] Generating records for topic: forks (15 records)
- [2026-03-06 10:40:05] Generating records for topic: pins (12 records)
- [2026-03-06 10:45:30] Done. 120 total records across 18 topics, saved to training.jsonl

## Step 5: Write Grader
- [2026-03-06 10:47:00] Grader written to grader.js (hybrid: programmatic + LLM-as-judge)

## Step 6: Upload & Evaluate
- [2026-03-06 10:47:30] POST /finetune/datasets → 200 OK, backend_id: "ds_abc123"
- [2026-03-06 10:47:35] POST /finetune/evaluations → 200 OK, eval_id: "eval_xyz"
- [2026-03-06 10:47:38] Polling... status: running
- [2026-03-06 10:48:50] Polling... status: running
- [2026-03-06 10:49:55] Polling... status: completed, avg=0.52, pass_rate=65%
- [2026-03-06 10:49:56] Saved full response to evaluations/eval-v1.json

## Step 7: Analyze & Iterate
- [2026-03-06 10:50:10] Low-scoring topics: skewers(0.35), combinations(0.40)
- [2026-03-06 10:50:11] Decision: NO-GO, need to improve skewer prompts and grader criteria
- [2026-03-06 10:52:30] Added 10 skewer prompts, adjusted grader weights
- [2026-03-06 10:53:00] Re-uploaded as my-dataset-v2, backend_id: "ds_def456"
```

Use full timestamps (`YYYY-MM-DD HH:MM:SS`) so each step's duration is visible.

This makes it easy to verify what the agent actually did, which API calls were made, and what responses came back.

**Rule: Update the execution log after completing each step, before starting the next one.** Don't batch log entries — write them incrementally.

### Step 1: Define the Objective

Ask the user what behaviors the model should learn. Produce two things:
- An **objective statement** describing desired behaviors and constraints
- A **system prompt** ("You are...") that will prefix every training conversation

### Step 2: Extract Documents

Read the user's documents (PDFs, markdown, text). Extract typed, linked knowledge parts — text passages, tables (with cell structure), and images (with base64 data) — into `knowledge_parts.json`.

**Primary method — Docling Serve** (best quality, handles tables/images/complex layouts):

1. Check if Docling Serve is running:
```bash
curl -sS http://127.0.0.1:5001/health
```
If not running, start it: `docker run -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest` — wait for startup to complete, then verify with the health check.

2. Call the hybrid chunk API with images:
```bash
TASK_RESPONSE=$(curl -sS -X POST "http://127.0.0.1:5001/v1/chunk/hybrid/file/async" \
  -F "files=@document.pdf;type=application/pdf" \
  -F "include_converted_doc=true" \
  -F "convert_do_ocr=true" -F "convert_do_table_structure=true" \
  -F "convert_include_images=true" -F "convert_image_export_mode=embedded" \
  -F "chunking_merge_peers=true" -F "chunking_tokenizer=BAAI/bge-small-en-v1.5")
TASK_ID=$(echo "$TASK_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['task_id'])")
```
Poll `/v1/status/poll/$TASK_ID` until success, then fetch `/v1/result/$TASK_ID` and save as `knowledge/docling-result.json`.

3. **Read the document before writing any code.** Read chunks 0-9 to understand the document — title, structure, content type, heading patterns. Then read a few chunks from the middle and end. This context is critical for writing a good extraction script — without it you'll produce noise (chess moves as headings, blank pages as parts, domain patterns lost).

4. **Write a script** to create `knowledge/knowledge_parts.json` — this is the required deliverable, not optional. The script must produce typed parts (text, table, image) with headings, cross-references, and image data matching the schema in `extraction-guide.md` Section 3. Normalized chunks or cleaned chunk lists are NOT sufficient — the downstream pipeline (topics, training data, UI) requires the full `knowledge_parts.json` format.

The Docling response contains both `chunks[]` (text segments with headings, pages, doc_item pointers) and `documents[0].content.json_content` (the full DoclingDocument with texts, tables, pictures). Your script resolves the pointers, classifies each item by type (text/table/image), extracts structured data, discovers images via caption `parent.$ref` (pictures are NOT in chunk doc_items), falls back to page-level renders when `pictures[].image` is null, and builds bidirectional cross-references.

See `knowledge/extraction-guide.md` for the full response structure, schema, and step-by-step guidance.

**Fallback — pdftotext** (when Docker is not available):
```bash
pdftotext input.pdf output.txt
python3 .claude/skills/vllora-finetune/templates/extract-sections.py \
  knowledge/converted.md knowledge/sections.json
```
Note: pdftotext loses tables, images, and complex layout — use Docling Serve when possible.

**Working directory after extraction:**
```
knowledge/
├── docling-result.json       # Raw Docling response (chunks + document)
├── knowledge_parts.json      # Typed parts — text, table, image (agent-created)
└── document-extraction.md    # Agent's extraction notes
```

**Save your extraction notes** to `knowledge/document-extraction.md` — document name, page count, section headings, key concepts. This grounds your training data in real content and makes `sourceChunkRefs` in the topic hierarchy verifiable.

### Step 3: Build Topic Hierarchy

Organize the domain into a topic tree and save it to `topics.json`. This ensures balanced training data across all areas. See `reference/topic-hierarchy.md` for the structure and design guidelines.

Quick version — create a JSON array of topic nodes:
```json
[{"id": "billing", "name": "Billing", "description": "Payment and subscription questions",
  "children": [
    {"id": "billing/refunds", "name": "Refunds", "description": "Refund requests and policies", "children": []}
  ]}]
```
Aim for 3-7 root topics, 2-3 levels deep, each leaf supporting 10-30 training examples.

**sourceChunkRefs**: Only add `sourceChunkRefs` after you have actually read a document and extracted content from it. The values must reference real sections you read — e.g., if you read a PDF and found a "Refund Policy" section on page 12, you might use `"product-manual:page12-refund-policy"`. Never fabricate sourceChunkRefs for documents you haven't read. If the user mentions having a document but you haven't read it yet, omit sourceChunkRefs until you do.

### Step 4: Generate Training Data

Write prompts to `training.jsonl` — one JSON object per line. Each line is a **prompt** the model will practice on. The model generates its own responses during training and the grader scores them. You only provide system + user messages:

```jsonl
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "..."}], "id": "record-1"}
```

For each leaf topic, generate 10-30 prompts covering: happy paths, edge cases, errors, ambiguous queries, and multi-turn follow-ups. See `reference/data-format.md` for format details and `templates/sample-conversation.jsonl` for examples.

**Generate enough data.** A useful dataset needs at least **100-200 total records** across all topics. With 10 leaf topics, that's 10-20 per topic minimum. Don't stop at a handful — the model needs volume and variety to learn. Generate all the data before moving to the next step.

### Step 5: Write the Grader

Write a JavaScript grader function to `grader.js`. This function scores model responses 0-1 and runs server-side during evaluation and training — it defines what the model learns to optimize.

```javascript
async function evaluate(input) {
  const messages = input.messages || [];
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();
  if (!lastAssistant) return { score: 0, reason: "No response" };
  // Score the response...
  return { score: 0.8, reason: "Good response with accurate info" };
}
```

The grader can use `__langdb_call_llm_as_judge_obj({prompt, max_tokens})` to call an LLM for subjective quality assessment. See `reference/grader-writing.md` for patterns and `templates/grader-template.js` for a starter template.

### Step 5.5: Validate Before Upload

Before uploading, validate your dataset:

```bash
uv run scripts/validate_dataset.py training.jsonl
```

This checks: valid JSON, required fields (`messages`, `id`), message structure, no assistant messages (RFT), duplicate IDs, and record count. Fix any errors before proceeding.

### Step 6: Upload & Evaluate

Use the helper scripts for API operations. They handle UUID generation, error handling, and response parsing automatically.

**1. Upload the dataset:**
```bash
uv run scripts/upload_dataset.py --file training.jsonl --grader grader.js
```

This generates a UUID, uploads the JSONL + grader, and prints the backend dataset ID. Save this ID — you need it for all subsequent calls.

> **CRITICAL:** The `dataset_id` must be a valid UUID. The script handles this automatically. If using curl directly, generate one with `uuidgen | tr '[:upper:]' '[:lower:]'`.

**2. Run evaluation:**
```bash
uv run scripts/run_evaluation.py --dataset-id BACKEND_DATASET_ID --output evaluations/eval-v1.json
```

This creates an eval job, polls until complete, prints summary stats, and saves the full response.

**3. If `uv` is not available**, fall back to curl. See `reference/api-reference.md` for full endpoint docs and curl examples.

### Step 7: Analyze & Iterate

This is where most of the work happens. Read `reference/iteration-strategy.md` for the full guide. The key analyses:

**1. Evaluation results** — Read the `summary` (average score, pass rate) and individual record scores/reasons. Sort records by score and read the grader's `reason` on the lowest-scoring ones. Decide GO (avg > 0.6, pass rate > 70%) or NO-GO.

**2. Topic distribution** — Count records per topic. Are any topics under-represented (<5% of total)? Cross-reference with eval scores — topics with both low record count AND low scores need the most attention.

**3. Data variety** — Within each topic, check that prompts cover different question types (direct, vague, frustrated), complexity levels (simple, medium, complex), and scenarios (happy path, error, edge case). Repetitive prompts waste training capacity.

**4. Diagnose and fix** — If scores are bad, determine whether it's a data problem (prompts too vague, missing topics) or a grader problem (criteria misaligned, too strict/lenient):
- **Grader fix only**: `PATCH /finetune/datasets/{id}/evaluator` (no re-upload needed)
- **Data fix**: Re-upload the entire dataset with a new `dataset_id`

**5. If iterations stall** (3+ rounds with no improvement) — Don't keep making small tweaks. See `reference/iteration-strategy.md` for 10 specific stall patterns (Part 8) and a 6-level escalation ladder (Part 9) ranging from quick fixes to drastic measures.

### Step 8: Train

Once evaluation scores are good (avg > 0.6, pass rate > 70%), start training:

```bash
uv run scripts/start_training.py --dataset-id BACKEND_DATASET_ID --output-model my-model-name --output training-jobs/job-001.json
```

This creates the job, polls until complete (every 15s), and saves the response. Training takes 15-60 minutes.

Once training succeeds, fetch per-epoch scores via `GET /finetune/datasets/{dataset_id}/finetune-evaluations?finetune_job_id=JOB_ID` and save to `training-jobs/job-001-epochs.json`. Scores should increase each epoch — if they don't, see `reference/iteration-strategy.md` Part 2.

Update `iteration-log.md` with the job ID, base model, output model name, and epoch score progression.

### Step 9: Test

After training succeeds, test the fine-tuned model by sending queries directly:

```bash
curl -X POST http://localhost:9090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "my-model-name", "messages": [{"role": "user", "content": "Test query"}]}'
```

Test each topic area with queries the model hasn't seen in training. Compare responses to the base model to verify improvement.

## Reference Files (Deep Dives)

Read these when you need more detail on a specific step:

| File | When to read |
|------|-------------|
| `reference/api-reference.md` | When making API calls — full endpoint docs with curl examples |
| `reference/data-format.md` | When generating JSONL — format rules, validation, quality tips |
| `reference/grader-writing.md` | When writing the grader — 3 patterns, design guidelines, common mistakes |
| `reference/topic-hierarchy.md` | When designing topics — structure, coverage analysis, balance scoring |
| `reference/iteration-strategy.md` | When analyzing results — diagnosis, stall patterns, escalation ladder |
| `reference/workflow-guide.md` | For the full detailed walkthrough of every step |

## Helper Scripts

These scripts handle API operations with proper error handling, UUID generation, and polling. Run with `uv run` (PEP 723 — dependencies declared inline).

| Script | Purpose |
|--------|---------|
| `scripts/validate_dataset.py` | Validate JSONL before upload — checks format, fields, RFT compliance |
| `scripts/upload_dataset.py` | Upload dataset + grader to gateway — auto-generates UUID |
| `scripts/run_evaluation.py` | Create eval job, poll until complete, save results |
| `scripts/start_training.py` | Start training job, poll until complete, save response |
