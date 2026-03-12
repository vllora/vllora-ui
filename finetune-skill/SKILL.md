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
Define Objective → Extract Documents → Build Topics → Generate Data → Write Grader
→ Push to Gateway → Open vLLora UI → Lucy handles evaluation, iteration, training
```

You execute Steps 1-6. Then the vLLora UI + Lucy take over for the interactive loop (evaluation, grader tuning, iteration, training, deployment).

### Working Directory

Create a local directory for all artifacts:

```
finetune-project/
├── training.jsonl              # Training prompts (JSONL format)
├── grader.js                   # Evaluation/grader function
├── topics.json                 # Topic hierarchy
├── knowledge/                  # Extracted domain knowledge
│   ├── docling-result.json     # Raw Docling response
│   ├── knowledge_parts.json    # Typed parts: text, table, image
│   └── document-extraction.md  # Extraction notes
└── execution-log.md            # Running log of every step
```

### Execution Log

Keep an execution log (`execution-log.md`) — append after EVERY step. Every log entry MUST include a full timestamp in `YYYY-MM-DD HH:MM:SS` format. Get the time by running `date '+%Y-%m-%d %H:%M:%S'` via Bash.

```markdown
## Step 1: Define Objective
- [2026-03-06 10:32:15] System prompt defined: "You are a chess tactics tutor..."

## Step 2: Extract Documents
- [2026-03-06 10:32:40] Reading document: chess-tactics.pdf (84 pages)
- [2026-03-06 10:35:12] Extracted 10 sections, saved to knowledge/document-extraction.md

## Step 3: Build Topics
- [2026-03-06 10:36:45] Created 6 root topics, 18 leaf topics, saved to topics.json

## Step 4: Generate Training Data
- [2026-03-06 10:45:30] 120 total records across 18 topics, saved to training.jsonl

## Step 5: Write Grader
- [2026-03-06 10:47:00] Grader written to grader.js (hybrid: programmatic + LLM-as-judge)

## Step 6: Push to Gateway
- [2026-03-06 10:48:00] POST /finetune/workflows → created, id: "wf_abc123"
- [2026-03-06 10:48:10] POST /workflows/{id}/knowledge → uploaded 1 knowledge source
- [2026-03-06 10:48:20] POST /workflows/{id}/records → uploaded 120 records
- [2026-03-06 10:48:25] POST /workflows/{id}/topics → saved 18 topics
- [2026-03-06 10:48:30] PATCH /workflows/{id}/evaluator → saved grader
- [2026-03-06 10:48:31] Ready! Tell user to open vLLora UI
```

**Rule: Update the execution log after completing each step, before starting the next one.**

---

### Step 1: Define the Objective

Ask the user what behaviors the model should learn. Produce two things:
- An **objective statement** describing desired behaviors and constraints
- A **system prompt** ("You are...") that will prefix every training conversation

### Step 2: Extract Documents

Read the user's documents (PDFs, markdown, text). Extract typed, linked source_parts — text passages, tables (with cell structure), and images (with base64 data) — into `knowledge_parts.json`.

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

3. **Read the document before writing any code.** Read chunks 0-9 to understand the document — title, structure, content type, heading patterns. Then read a few chunks from the middle and end. This context is critical for writing a good extraction script.

4. **Write a script** to create `knowledge/knowledge_parts.json` — this is the required deliverable. The script must produce typed source_parts (text, table, image) with titles, extraction paths, and provenance metadata matching the schema in `reference/extraction-guide.md` Section 3.

See `reference/extraction-guide.md` for the full response structure, schema, and step-by-step guidance.

**Fallback — pdftotext** (when Docker is not available):
```bash
pdftotext input.pdf output.txt
python3 .claude/skills/vllora-finetune/templates/extract-sections.py \
  knowledge/converted.md knowledge/sections.json
```

**Save your extraction notes** to `knowledge/document-extraction.md` — document name, page count, section headings, key concepts.

### Step 3: Build Topic Hierarchy

**A topic = a type of training example you want to generate.** Each leaf topic answers the question: "what scenario should the model practice handling?" The hierarchy groups related scenarios together so you can balance coverage and spot gaps.

Decide what topics to create based on:
- **The objective** — what behaviors does the model need? Each distinct behavior cluster becomes a topic.
- **The document** (if available) — what content exists to generate examples from? Use `extraction_path` values from `knowledge_parts.json` as a checklist to make sure your topics cover the available material, not as a template to copy directly.

Save to `topics.json` as a **flat array** — every topic at the same level, hierarchy expressed via `parent_id`:

```json
[{"id": "billing", "name": "Billing", "parent_id": null, "system_prompt": "Focus on payment and subscription questions"},
 {"id": "billing-refunds", "name": "Refunds", "parent_id": "billing", "system_prompt": "Focus on refund requests and policies"}]
```

Aim for 3-7 root topics, 2-3 levels deep, each leaf supporting 10-30 training examples. See `reference/topic-hierarchy.md` for design guidelines.

**Topic-source linking**: After uploading knowledge source parts, link them to topics via the `POST /topics/relations` API. Only create links to parts you've actually extracted — never fabricate references. See `reference/api-reference.md` Section 13 for the relations API.

### Step 3.5: Categorize Existing Records

If the user provides existing training data, assign each record to a leaf topic before generating new data:

```jsonl
{"messages": [...], "id": "record-1", "topic": "billing/refunds"}
```

Skip this step if generating all data from scratch.

### Step 4: Generate Training Data

Write prompts to `training.jsonl` — one JSON object per line. Each line is a **prompt** (system + user messages only — no assistant messages):

```jsonl
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "..."}], "id": "record-1", "topic": "billing/refunds"}
```

For each leaf topic, generate 10-30 prompts covering: happy paths, edge cases, errors, ambiguous queries, and multi-turn follow-ups. See `reference/data-format.md` for format details.

**Generate enough data.** At least **100-200 total records** across all topics.

### Step 4.5: Generate Variants for Augmentation

If some topics are under-represented, create variants of existing records:

1. Keep system prompt and prior turns unchanged
2. Vary only the final user message — change scenario, specifics, tone, complexity
3. Track lineage: `"source_record_id"` pointing to the original
4. Generate 3-5 variants per source record

### Step 5: Write the Grader

Write a JavaScript grader function to `grader.js`. Scores model responses 0-1, runs server-side during evaluation and training.

```javascript
async function evaluate(input) {
  const messages = input.messages || [];
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();
  if (!lastAssistant) return { score: 0, reason: "No response" };
  // Score the response...
  return { score: 0.8, reason: "Good response with accurate info" };
}
```

The grader can use `__langdb_call_llm_as_judge_obj({prompt, max_tokens})` for subjective quality assessment. See `reference/grader-writing.md` for patterns and `templates/grader-template.js` for a starter.

### Step 5.5: Validate Before Upload

```bash
uv run scripts/validate_dataset.py training.jsonl
```

Checks: valid JSON, required fields, message structure, no assistant messages (RFT), duplicate IDs, record count. Fix errors before proceeding.

### Step 6: Push to Gateway & Hand Off

Create a workflow in the gateway and populate it with all your data. This makes everything visible in the vLLora UI where Lucy takes over.

```bash
# 1. Create workflow
WORKFLOW=$(curl -s -X POST http://localhost:9090/finetune/workflows \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "objective": "Train a model to..."}')
WORKFLOW_ID=$(echo "$WORKFLOW" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2a. Upload knowledge source (file + metadata)
KS=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge \
  -F "file=@document.pdf" \
  -F "name=document.pdf" \
  -F "description=Source document" \
  -F 'metadata={"total_pages":84,"extraction_method":"docling_hybrid"}')
KS_ID=$(echo "$KS" | python3 -c "import sys,json; print(json.load(sys.stdin)['knowledge_source']['id'])")

# 2b. Add extracted parts
PARTS=$(python3 -c "import json; d=json.load(open('knowledge/knowledge_parts.json')); print(json.dumps(d['parts']))")
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts \
  -H "Content-Type: application/json" -d "$PARTS"

# 3. Upload records (read training.jsonl, format as records array)
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records \
  -H "Content-Type: application/json" \
  -d '{"records": [
    {"id": "record-1", "data": {"input": {"messages": [...]}}, "topic": "billing/refunds"}
  ]}'

# 4. Save topics (flat format with parent_id)
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'topics': json.load(open('topics.json'))}))")"

# 4b. Link topics to knowledge source parts
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
  -H "Content-Type: application/json" \
  -d '{"relations": [{"topic_identifier": "topic-id", "part_identifier": "part-reference-id"}]}'

# 5. Save evaluator (grader)
GRADER_SCRIPT=$(cat grader.js)
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -H "Content-Type: application/json" \
  -d "{\"evaluator\": {\"type\": \"js\", \"config\": {\"script\": $(echo "$GRADER_SCRIPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}}}"
```

**Done!** Tell the user:

> Your finetune dataset is ready in the vLLora UI. Open **http://localhost:5173**, select the **"My Project"** workflow, and Lucy will guide you through evaluation, iteration, and training.

### What Lucy Handles Next

Once the user opens the vLLora UI, Lucy takes over with visual tools for:
- **Evaluation**: Run the grader against a rollout model, see per-record scores
- **Iteration**: Tune the grader, fix weak records, re-evaluate until scores are good
- **Training**: Start training jobs, monitor metrics in real-time, view loss curves
- **Deployment**: Deploy the fine-tuned model and test it

These interactive tasks are better in the UI — visual score distributions, per-record drilldown, real-time metrics charts, and Lucy's guided iteration loop.

## Reference Files (Deep Dives)

Read these when you need more detail on a specific step:

| File | When to read |
|------|-------------|
| `reference/api-reference.md` | When making API calls — all 58 gateway endpoints with curl examples |
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
| `scripts/validate_dataset.py` | Validate JSONL before upload — checks format, fields, RFT compliance |
| `scripts/upload_dataset.py` | Upload dataset + grader to gateway (standalone mode) |
| `scripts/run_evaluation.py` | Create eval job, poll until complete, save results |
| `scripts/start_training.py` | Start training job, poll until complete, save response |
