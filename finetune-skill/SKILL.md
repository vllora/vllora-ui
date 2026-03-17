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
├── relations.json              # Topic → part mappings for data generation
├── knowledge/                  # Extracted domain knowledge
│   ├── docling-result.json     # Raw Docling response
│   ├── knowledge_parts.json    # Typed parts: text, table, image
│   ├── parts-index.json        # Lightweight part index with previews
│   └── document-extraction.md  # Extraction notes
└── execution-log.md            # Running log of every step
```

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

## Step 2: Extract Documents
- [2026-03-06 10:32:40] Reading document: chess-tactics.pdf (84 pages)
- [2026-03-06 10:35:12] Extracted 10 sections, saved to knowledge/document-extraction.md

## Step 3: Build Topics
- [2026-03-06 10:36:45] Created 6 root topics, 18 leaf topics, saved to topics.json
- [2026-03-06 10:37:00] Delegated to relation-builder: linked 42 parts across 18 topics

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

## Step 5: Write Grader
- [2026-03-06 10:47:00] Grader written to grader.js (hybrid: programmatic + LLM-as-judge)

## Step 6: Push to Gateway
- [2026-03-06 10:48:00] POST /finetune/workflows → created, id: "wf_abc123"
- [2026-03-06 10:48:10] POST /workflows/{id}/knowledge → uploaded 1 knowledge source
- [2026-03-06 10:48:20] POST /workflows/{id}/records → uploaded 214 records
- [2026-03-06 10:48:25] POST /workflows/{id}/topics → saved 18 topics
- [2026-03-06 10:48:30] PATCH /workflows/{id}/evaluator → saved grader
- [2026-03-06 10:48:31] Ready! Tell user to open vLLora UI
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

The extraction script must also produce `knowledge/parts-index.json` — a lightweight index with `{id, type, title, extraction_path, pages, content_preview}` per part (first 200 chars of content). This index is small enough to read during topic design and is used to map parts to topics.

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

**Build topic-part relations.** After designing topics, delegate to the `relation-builder` subagent — it reads `knowledge/parts-index.json` and `topics.json`, iteratively matches parts to topics using a retrieve-and-verify loop, and writes `relations.json`. This keeps the parts-index scanning out of main context.

If there are no documents (objective-only pipeline), skip this step — no relations.json needed.

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

Use `scripts/chat_completion.py` to generate user prompts via LLM, grounded in the knowledge chunks linked to each topic:

1. **Read the structured data** — `topics.json`, `relations.json`, `knowledge/knowledge_parts.json`
2. **For each leaf topic:**
   - Find related part IDs from `relations.json` where `topic_identifier` matches
   - Read the content for those parts from `knowledge_parts.json`
   - Build a prompt asking the LLM to generate N user messages, using the chunks as grounding material
   - Call `chat_completion.py` with `response_format` for structured JSON output
   - Parse the response and write records to `training.jsonl`

**Example generation call** (for one topic):

```bash
python3 -c "
import json, subprocess

topics = json.load(open('topics.json'))
relations = json.load(open('relations.json'))
parts = {p['id']: p for p in json.load(open('knowledge/knowledge_parts.json'))['parts']}

# Find leaf topics (not a parent of any other topic)
parent_ids = {t['parent_id'] for t in topics if t['parent_id']}
leaves = [t for t in topics if t['id'] not in parent_ids]

record_num = 0
with open('training.jsonl', 'w') as out:
    for topic in leaves:
        # Get chunks linked to this topic via relations
        part_ids = [r['part_identifier'] for r in relations if r['topic_identifier'] == topic['id']]
        chunks = [parts[pid] for pid in part_ids if pid in parts]
        chunk_text = '\n---\n'.join(f\"[{c['id']}] {c.get('title','')}\n{c['content']}\" for c in chunks[:20])

        request = json.dumps({
            'messages': [{'role': 'user', 'content': f'''Generate 10 diverse user prompts for fine-tuning.

Topic: {topic['name']}
Focus: {topic['system_prompt']}

Source material:
{chunk_text}

Each prompt should be a realistic question/request grounded in the source material.
Vary: difficulty, tone, type (explain-why, compare, what-if, analyze, teach-me).
Return JSON: {{\"prompts\": [\"prompt1\", \"prompt2\", ...]}}''}],
            'model': 'gpt-4o-mini',
            'temperature': 0.8,
            'response_format': {'type': 'json_object'}
        })

        result = subprocess.run(
            ['uv', 'run', 'scripts/chat_completion.py'],
            input=request, capture_output=True, text=True
        )
        prompts = json.loads(result.stdout)['prompts']

        for p in prompts:
            record_num += 1
            record = {
                'messages': [
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': p}
                ],
                'id': f'r-{record_num:03d}',
                'topic': topic['id']
            }
            out.write(json.dumps(record) + '\n')
"
```

This is a starting point — adapt the generation prompt, number of records, and number of passes to the project. You can:
- Run multiple passes (basic questions, then edge cases, then multi-turn)
- Validate generated prompts with a second LLM call
- Generate more for under-represented topics
- Use `parts-index.json` instead of full content if chunks are too large for context

**Generate enough data.** At least **100-200 total records** across all topics.

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

**After writing the grader, dry-run it against a sample row** to verify it executes without errors:

```bash
uv run scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID \
  --script grader.js \
  --row '{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "What is X?"}, {"role": "assistant", "content": "X is..."}]}'
```

This sends the grader + one row to the gateway's QuickJS sandbox and returns score/reason/errors instantly — no dataset upload needed. Use it to confirm the script compiles, check scoring logic on a known example, and iterate before committing to a full evaluation.

**Note:** The sandbox does NOT support `console.log` — use the `reason` field for debug output. If the dry-run fails, the reason contains the JS error.

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

# 2b. Add extracted parts (move id → reference_id for safe re-uploads)
PARTS=$(python3 -c "
import json
d = json.load(open('knowledge/knowledge_parts.json'))
for p in d['parts']:
    p['reference_id'] = p.pop('id', None)
    p.pop('source_id', None)
print(json.dumps(d['parts']))
")
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

# 4b. Link topics to knowledge source parts (if relations.json exists)
if [ -f relations.json ]; then
  RELATIONS=$(cat relations.json)
  curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
    -H "Content-Type: application/json" \
    -d "{\"relations\": $RELATIONS}"
fi

# 5. Save evaluator (grader)
GRADER_SCRIPT=$(cat grader.js)
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -H "Content-Type: application/json" \
  -d "{\"evaluator\": {\"type\": \"js\", \"config\": {\"script\": $(echo "$GRADER_SCRIPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}}}"
```

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
GRADER_SCRIPT=$(cat grader.js)
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -H "Content-Type: application/json" \
  -d "{\"evaluator\": {\"type\": \"js\", \"config\": {\"script\": $(echo "$GRADER_SCRIPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}}}"
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

### Step 9: Start Training

Once evaluation scores are satisfactory, start a reinforcement fine-tuning job.

**Base model selection:**
| Model | Best for |
|-------|----------|
| `unsloth/Qwen3.5-4B` | Fast experiments, narrow tasks |
| Larger models (7B+) | Complex reasoning, broad domains |

Start with the smaller model. Scale up after validation.

**Using the helper script** (recommended):
```bash
uv run scripts/start_training.py \
  --workflow-id $WORKFLOW_ID \
  --dataset-id $WORKFLOW_ID \
  --output-model my-finetuned-model \
  --output training-jobs/job-v1.json
```

Polls every 15 seconds until training completes (~10-60 min depending on data size).

**Or manually:**
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

# Poll status
curl -s http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs/$JOB_ID/status
# Status: pending → running → succeeded | failed

# Monitor metrics (while running)
curl -s http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs/$JOB_ID/metrics
```

**Config adjustments:**
| Situation | Adjustment |
|-----------|------------|
| < 50 records | `epochs: 1` (avoid overfitting) |
| > 500 records | `epochs: 3-4` |
| Complex task | `lora_rank: 16` |
| Simple task | `lora_rank: 4` |

**Metrics to watch** (from the metrics endpoint):
| Metric | Healthy | Warning |
|--------|---------|---------|
| `reward` | Trending up | Flat or declining |
| `kl` | < 0.5, stable | Rising > 1.5x → lower learning rate |
| `clipped_ratio` | < 0.20 | > 0.70 → increase `max_output_tokens` |
| `loss` | Decreasing | NaN/Inf → cancel immediately |
| `frac_reward_zero_std` | < 0.60 | > 0.60 → grader not differentiating |

**After training succeeds:**
- Test the model with prompts NOT in the training set
- Compare fine-tuned vs base model behavior
- If quality is insufficient, return to Step 8 (iterate) or retrain with different config

**Done!** Tell the user their model is ready.

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
| `scripts/chat_completion.py` | Call LLM via gateway — for generating prompts, variants, validation |
| `scripts/dry_run_grader.py` | Dry-run grader on a single row — instant syntax/logic check |
