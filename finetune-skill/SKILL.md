---
name: vllora-finetune
description: |
  Guide for fine-tuning LLMs using the vLLora platform. Use this skill whenever the user mentions fine-tuning, finetuning, training a custom model, creating training datasets, writing evaluation/grader functions, or improving model quality through iteration. Also use it when users have documents (PDFs, manuals, knowledge bases) they want to convert into training data, or when they ask about evaluating model outputs with scoring functions. This skill applies even if users don't explicitly say "vLLora" — any request to fine-tune or build training data for an LLM should trigger it.
---

# vLLora Finetune Skill

Run the full fine-tuning pipeline on the vLLora platform. You handle the entire workflow — reading documents, designing topics, generating training data, writing graders, running evaluations, analyzing results, and iterating until the model is ready. Each step uploads to the gateway immediately so the vLLora UI shows progress in real time.

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

**Wait for training to complete.** Do NOT exit after launching training. Poll `training-jobs/{JOB_ID}-monitor-report.json` (or use `finetune.py poll-training`) until training finishes. Then analyze results (Step 8) and iterate (Step 9) if the eval pass rate is below 80% or training shows anomalies. **The pipeline is not done until you've analyzed results and either iterated or confirmed the model meets the objective.**

**Auto-iterate when running non-interactively.** If the user is not responding (e.g., running via `claude -p`), do NOT ask "what would you like to do?" and stop. Instead, make your own judgment: if eval pass rate < 80%, apply the top-priority fix from the analysis and start a new iteration automatically. Max 3 auto-iterations.

**Checkpoint after each step** — so the pipeline can resume after crashes:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step <STEP_NAME> --project-dir finetune-project --workflow-id $WORKFLOW_ID
```
Step names: `create-workflow`, `extract`, `topics`, `relations`, `generate-data`, `grader`, `validate`, `upload-records`, `upload-grader`, `eval`, `training`, `analyze`.

### Working Directory

Create a local directory for all artifacts:

```
finetune-project/
├── training.jsonl, grader.js, topics.json, relations.json, config.json
├── execution-log.md, iterations.md
├── knowledge/                  # Per-document subdirs (slugified filename)
│   ├── {doc-slug}/             # docling-result.json, knowledge_parts.json, parts-index.json, extract.py
│   └── all-parts-index.json   # Merged index across ALL documents
├── evaluations/                # eval-001.json, eval-002.json, ...
└── training-jobs/              # train-001.json, {JOB_ID}-metrics.json, ...
```

**Multi-document handling**: Each document gets its own subdirectory under `knowledge/` named by slugifying the filename. A merged `knowledge/all-parts-index.json` combines all per-document indexes for topic design and data generation.

**Table-heavy documents**: Write a "synthesis part" — a prose summary of key facts from tables — and include it as a text part alongside the table parts. This gives the model facts to reference conversationally.

**Workflow reuse**: Reuse the existing workflow when iterating (adding records, re-running evals, retraining). The API supports upserting records — duplicates are updated in place, new records are inserted, and existing eval scores are preserved. Only create a new workflow when starting a completely different project or dataset.

**Error handling**: If an API call returns a 4xx/5xx error, do NOT abandon the workflow and create a new one. Read the error message, fix the issue (e.g., duplicate IDs, invalid data), and retry the same request against the same workflow.

**NEVER modify skill files.** The `.claude/skills/` and `.claude/agents/` directories are read-only. Do not edit, patch, or write to any file under these paths. If a script has a bug, work around it — do not fix the script in place.

### Execution Log

Maintain `execution-log.md` as an **append-only** chronological record. Create it at the START of Step 1. Write to it IMMEDIATELY after each action — not retroactively.

**Format:** `## Step N: Name` → `- [timestamp] Action` → `Strategy:` / `Results:` / `Issues:` sub-items. Log after every action (not just step boundaries), include strategy for LLM-driven actions, never overwrite, and log failures before fixing. See [reference/workflow-guide.md](reference/workflow-guide.md) for a full example.

---

### Prerequisites

Before starting, verify the gateway is running and Python dependencies are available:
```bash
# Check gateway
curl -s http://localhost:9090/finetune/workflows | head -c 100 && echo " OK" || echo "ERROR: Gateway not running at localhost:9090"

# Ensure requests package is installed (needed by all helper scripts)
python3 -c "import requests" 2>/dev/null || pip install requests
```

### Resume from Previous Run

**ALWAYS check for an existing `finetune-project/` directory before starting a new pipeline.** If one exists, this is a continuation — do NOT start from scratch.

**Detection:**
```bash
if [ -f finetune-project/config.json ]; then
  echo "EXISTING PROJECT FOUND — resuming"
  WORKFLOW_ID=$(python3 -c "import json; print(json.load(open('finetune-project/config.json'))['workflow_id'])")
  echo "Workflow ID: $WORKFLOW_ID"
else
  echo "No existing project — starting fresh"
fi
```

**If an existing project is found:**
1. Read `finetune-project/config.json` to get the `workflow_id`
2. Check checkpoint state — this is the most reliable way to know what's done:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py status --project-dir finetune-project
```
3. If no checkpoint file exists, fall back to local artifact detection:
   - `knowledge/` exists + has parts → extraction is done
   - `topics.json` exists → topics is done
   - `relations.json` exists → relations is done
   - `training.jsonl` exists → data generation is done
   - `grader.js` exists → grader is done
   - `evaluations/` has eval results → eval is done
   - `training-jobs/` has job files → training was started
4. Verify gateway state — `python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID`
5. **Pick up from the first incomplete step** — do NOT re-run completed steps
6. Append to `execution-log.md` (never overwrite) with a "Resumed" entry:
   ```
   ## Resumed — [timestamp]
   - Previous run completed through Step N
   - Gateway state: records=X, topics=Y, sources=Z, evaluator=YES/NO
   - Picking up from Step M
   ```

**Common resume scenarios:**
| State found | What happened | Action |
|-------------|---------------|--------|
| `config.json` + `knowledge/` + no `topics.json` | Crashed during or after extraction | Resume from Step 3 (topics) |
| Everything through `grader.js` + no `evaluations/` | Crashed before eval | Resume from Step 7 (eval + training) |
| `evaluations/` has results + no `training-jobs/` | Eval completed but training never started | Analyze eval (Step 8), then start training |
| `training-jobs/` has a job file with status `running` | Training was in progress | Poll the existing job, don't create a new one |
| `iterations.md` exists with iteration 1 results | First iteration completed | Read findings, apply fixes (Step 9), start iteration 2 |

### Step 1: Define the Objective

Ask the user what behaviors the model should learn. Produce two things:
- An **objective statement** describing desired behaviors and constraints
- A **system prompt** ("You are...") that will be used in Step 4 (record generation) to prefix every training conversation

> **Note:** The system prompt is NOT stored on the workflow. It's composed at record generation time (Step 4) from a root persona + per-topic segments, and embedded in each record's `messages[0]`. Save it locally for use in Step 4.

**Upload immediately** — create the workflow on the gateway so the UI shows progress from the start:
```bash
WORKFLOW_ID=$(python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-workflow \
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

Extract all documents in parallel — **spawn one `knowledge-extractor` subagent per document**. Each agent handles its own PDF independently (Docling extraction, custom extract.py, post-processing, gateway upload).

**2a. Check Docling availability and submit all PDFs:**

```bash
curl -sS http://127.0.0.1:5001/health 2>/dev/null && echo "DOCLING_OK" || echo "DOCLING_UNAVAILABLE"
```

If Docling is available, submit all PDFs at once (non-blocking):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/docling_extract.py --submit-only \
  "pdfs/doc1.pdf:finetune-project/knowledge/doc1-slug/docling-result.json" \
  "pdfs/doc2.pdf:finetune-project/knowledge/doc2-slug/docling-result.json" \
  ...
```

This returns a JSON manifest with `task_id` per document. Docling processes them in parallel.

**2b. Spawn one `knowledge-extractor` per document (parallel):**

For each document, spawn a subagent with:
- `SKILL_DIR=${CLAUDE_SKILL_DIR}`
- `WORKFLOW_ID`, `GATEWAY_URL=http://localhost:9090`
- `DOC_PATH` — the PDF path
- `DOC_SLUG` — the slug (lowercase, hyphens)
- `DOC_DIR` — e.g., `finetune-project/knowledge/<slug>`
- `TASK_ID` — from the manifest (so the agent polls its own result)

Spawn up to 4-5 agents at once. If there are more documents, spawn in batches.

**2c. After ALL agents return — merge indexes:**

```bash
python3 -c "
import json, glob
parts = []
for f in sorted(glob.glob('finetune-project/knowledge/*/parts-index.json')):
    with open(f) as fh:
        data = json.load(fh)
        parts.extend(data.get('parts', data) if isinstance(data, dict) else data)
with open('finetune-project/knowledge/all-parts-index.json', 'w') as fh:
    json.dump({'parts': parts}, fh, indent=2)
print(f'Merged {len(parts)} parts from {len(glob.glob(\"finetune-project/knowledge/*/parts-index.json\"))} documents')
"
```

**2d. Validate:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py finetune-project/knowledge/
```

> **For full extraction workflow details** (if you need to understand or debug), read [reference/extraction-guide.md](reference/extraction-guide.md).

If there are no documents (objective-only pipeline), skip this step.

**Review extraction with the user.** Present a per-document summary of what was extracted (document name, section count, parts count, sample section titles). Ask:
- Do these look like the right sections from each document?
- Any documents where the extraction missed important content or grouped things incorrectly?
- Which areas should we focus training on?

**If the user wants to re-extract a specific document** (e.g., "the fee schedule in Contract-A got merged into one big part — split those into individual items"), spawn a new `knowledge-extractor` for just that document with `CUSTOM_INSTRUCTIONS` set to the user's request. Then re-merge indexes and re-validate. Only re-extract the specific documents the user flagged — not all of them.

Use the user's focus areas to guide topic design in Step 3. All content is already on disk; topics control what gets used for training.

### Step 3: Build Topic Hierarchy

**A topic = a type of training example you want to generate.** Each leaf topic answers the question: "what scenario should the model practice handling?" The hierarchy groups related scenarios together so you can balance coverage and spot gaps.

Decide what topics to create based on:
- **The user's focus areas** — which documents/chapters/sections did the user say are most important? Prioritize these as top-level topics.
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

**System prompt composition**: The `system_prompt` field on each topic is a **segment** that gets composed with its ancestors during record generation: `[Root --system-prompt] + [Root topic] + [Parent topic] + [Leaf topic]`. Each level adds specificity without contradicting the parent. Keep each segment to 1-2 sentences, 50-150 words total when composed.

**Topic-source linking**: After uploading knowledge source parts, link them to topics via the `POST /topics/relations` API. Only create links to parts you've actually extracted — never fabricate references.

**Build topic-part relations.** Delegate to the `relation-builder` subagent (installed at `.claude/agents/relation-builder.md`) — provide `PROJECT_DIR` (the absolute path to the finetune-project directory). It reads `knowledge/all-parts-index.json` and `topics.json`, matches parts to topics, and writes `relations.json`.

> **ID format note:** Use human-readable slugs for topic `id` values (e.g., `"billing-refunds"`). `finetune.py upload-topics` auto-converts to UUIDs. Use the same slug as `topic_identifier` in `relations.json` and part string IDs as `part_identifier`. `finetune.py upload-relations` resolves everything locally — no manual ID mapping.

If there are no documents (objective-only pipeline), skip this step.

**Checkpoint** after topics and relations are complete:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step topics --project-dir finetune-project --workflow-id $WORKFLOW_ID
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step relations --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

**Upload immediately** — push topics and relations to the gateway so the UI shows the topic hierarchy and coverage:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics \
  --workflow-id $WORKFLOW_ID --file topics.json

# Upload relations (if they exist)
if [ -f relations.json ]; then
  python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-relations \
    --workflow-id $WORKFLOW_ID --file relations.json
fi
```

**Review topics with the user.** Present the topic hierarchy (name, parent, linked source material count, planned records-per-topic). Ask:
- Are these the right focus areas?
- Any topics to add, remove, or rebalance?
- How many records per topic? (default: 8 per leaf)

Adjust topics based on feedback before proceeding to data generation. This is the **primary filtering step** — topics determine what training data gets generated. Getting this right avoids regenerating data later.

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

Use `generate_records.py` to generate user prompts via LLM, grounded in the knowledge chunks linked to each topic:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are an expert chess tutor..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 10 \
  --parallel 4 \
  --upload-incremental --workflow-id $WORKFLOW_ID
```

The script loads topics + relations, finds leaf topics, gathers linked source chunks, and calls the LLM to generate grounded user prompts per topic. If some topics fail, use `--append` to retry without overwriting. Adapt `--records-per-topic`, `--model`, and `--temperature` to the project. Run multiple passes if needed (basic questions, then edge cases, then multi-turn). **Generate at least 100-200 total records.**

**Deduplicate** — parallel generation can produce near-duplicate prompts across overlapping topics:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/deduplicate_records.py finetune-project/training.jsonl --threshold 0.85
```

With `--upload-incremental`, records appear in the UI as each topic completes — no separate upload step needed. If you ran without `--upload-incremental`, upload manually:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file training.jsonl
```

**Review generated data with the user.** Present a per-topic breakdown (topic name, record count, 2-3 sample prompts per topic). Ask:
- Do these prompts look like realistic user questions?
- Any topics with weak/repetitive prompts that need regeneration?
- Any gaps — scenarios the user expected but didn't see?

The UI at `http://localhost:5173/finetune` also shows all records grouped by topic — point the user there for a visual review.

**Checkpoint** after data generation:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step generate-data --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 4.5: Generate Variants for Augmentation

If some topics are under-represented, use `chat_completion.py` to create variants:

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

The grader function signature: `function evaluate(input) { ... return { score, reason }; }` where score is 0.0-1.0. The function can use `__langdb_call_llm_as_judge_obj(config, input)` for subjective quality assessment — `config` has `prompt_template` (message array with `{{history}}`/`{{response}}` template vars), `output_schema` (JSON Schema), and `completion_params` (`{model_name, temperature, max_tokens}`). Set `input.history` and `input.response` before calling. **Synchronous only** — no async/await.

See [reference/grader-writing.md](reference/grader-writing.md) for 3 patterns (pure programmatic, LLM-as-judge, hybrid), design guidelines, and common mistakes. Pick the template that best matches the task:

| Template | Best for | Key criteria |
|----------|----------|-------------|
| `templates/grader-template.js` | General-purpose (default) | accuracy, helpfulness, clarity, completeness, tone |
| `templates/grader-extraction.js` | Structured data extraction (10-K metrics, medical coding) | field accuracy, hallucination rate, format compliance |
| `templates/grader-compliance.js` | Rule application (FDA, tax, legal) | rule recall, false positives, citation accuracy |
| `templates/grader-readability.js` | Simplification (contract→English, ELI5) | readability + Flesch-Kincaid, jargon elimination, accuracy preservation |

Copy the closest template, then customize the criteria weights and programmatic checks for your domain.

#### Step 5.1: Mandatory Dry-Run

**You MUST dry-run the grader before uploading.** This catches syntax errors, runtime crashes, and scoring logic bugs before they waste an entire evaluation run:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID \
  --script grader.js \
  --row '{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "What is X?"}, {"role": "assistant", "content": "X is..."}]}'
```

Verify: no errors, score is reasonable (not always 0/1), reason is informative. Fix and re-run until it passes — do NOT proceed to upload until dry-run passes. The sandbox does NOT support `console.log` — use the `reason` field for debug output.

**Upload immediately** — push the grader to the gateway so the UI shows it's ready for evaluation:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

**Checkpoint** after grader upload:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step grader --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 5.5: Validate Before Upload

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

Checks: valid JSON, required fields, message structure, no assistant messages (RFT), duplicate IDs, record count (minimum 50, recommend 100-200+), and short user messages (< 10 chars). The `--topics` and `--parts` flags cross-reference `topic` and `source_parts` fields against the actual topic hierarchy and parts index — flagging any orphaned references. Fix errors before proceeding.

### Step 6: Verify & Hand Off

Since each step uploaded data immediately, the gateway already has the full workflow. Verify everything landed correctly before handing off to the UI.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

**Expected**: All counts > 0 and evaluator = YES. If any are missing, re-run the upload for that step.

**Checkpoint** after verify:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step validate --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

Tell the user the data is visible at `http://localhost:5173/finetune`, then **proceed immediately to Step 7** (evaluation).

### Step 7: Start Evaluation & Training (Parallel)

**Always start both eval AND training together.** They run on the cloud in parallel and answer different questions:

| | Eval Job (~45 min) | Training Job (hours) |
|---|---------|-------------|
| **Tests** | Base model + your data + your grader | Whether finetuning improves the model |
| **Tells you** | Is my data good? Is my grader fair? | Is the model learning? Are hyperparams right? |
| **Iterate on** | Prompts, topics, grader criteria | Learning rate, epochs, lora_rank |

**Two iteration loops** (run in parallel): **Fast loop** — eval finishes in ~45 min, iterate on data/grader immediately. **Slow loop** — training runs for hours, check metrics when done. Start both on every iteration — the fast loop improves data while the slow loop validates training.

#### 7a. Pre-training validation (RFT-specific — do NOT skip)

**⚠️ These checks are specific to RFT/GRPO training.** GRPO learns by comparing multiple completions per prompt — if all completions score the same, the gradient is zero and the model learns nothing. Validate BEFORE committing to an expensive training run.

**7a-i. Validate max_output_tokens.**
The default is **512** — higher values increase cost per step (8 completions × N tokens each). Only increase if you see >50% clipping in training metrics.

**7a-ii. Validate grader score distribution (CRITICAL for GRPO).**
GRPO computes advantages as `(reward - mean) / std`. If all completions score identically → std=0 → advantage=0 → **zero gradient**. Run the grader on diverse sample responses and check the distribution:

```bash
# Dry-run grader on 3-5 records with varying quality responses
# Check that scores SPREAD across 0-1, not cluster at extremes
python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role":"system","content":"..."}, {"role":"user","content":"..."}, {"role":"assistant","content":"Good detailed response..."}]}'

python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role":"system","content":"..."}, {"role":"user","content":"..."}, {"role":"assistant","content":"Short bad answer"}]}'
```

**Red flags that predict training failure:**
| Score Distribution | Problem | Fix |
|---|---|---|
| All scores 0.8-1.0 | Grader too lenient — GRPO gets no gradient | Add stricter criteria, penalize more flaws |
| All scores 0.0-0.2 | Grader too strict OR base model too weak | Relax criteria, or try larger base model |
| Only 0 or 1 (binary) | No partial credit → weak gradient signal | Add granular scoring (0.0, 0.3, 0.5, 0.7, 1.0) |
| Same score for good and bad responses | Grader not discriminating | Rewrite grader criteria to differentiate quality |

**The ideal distribution**: Scores spread across 0.2-0.9 with meaningful differentiation between good, mediocre, and bad responses.

**7a-iii. Create a validation set for reward hacking detection.**
RFT can suffer from **reward hacking** — the model learns to exploit grader weaknesses instead of genuinely improving. A held-out validation set detects this:

```bash
# Split training.jsonl into train (80%) and validation (20%)
python3 -c "
import json, random
random.seed(42)
with open('finetune-project/training.jsonl') as f:
    records = [json.loads(l) for l in f]
random.shuffle(records)
split = int(len(records) * 0.8)
train, val = records[:split], records[split:]
with open('finetune-project/training.jsonl', 'w') as f:
    for r in train: f.write(json.dumps(r) + '\n')
with open('finetune-project/validation.jsonl', 'w') as f:
    for r in val: f.write(json.dumps(r) + '\n')
print(f'Split: {len(train)} train, {len(val)} validation')
"
```

Upload both to the gateway — the training API uses the validation set for periodic evaluation during training. Compare `train_reward_mean` vs `valid_reward_mean` at each checkpoint. If they diverge significantly → reward hacking.

#### 7b. Pre-submission validation + create both jobs

**⚠️ Before creating eval or training, verify records exist on the gateway:**
```bash
RECORD_COUNT=$(curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))")
echo "Records on gateway: $RECORD_COUNT"
if [ "$RECORD_COUNT" -lt 1 ]; then
  echo "ERROR: No records on gateway — upload records first (Step 4)"
  exit 1
fi
```
This prevents the eval-001 "0 results" bug — creating an eval with no records succeeds but returns empty results.

Use `--create-only` to create the eval job without blocking, so you can start training immediately:

```bash
# Create eval (saves metadata to evaluations/eval-001.json)
# Use --limit N for quick iteration checks (e.g., --limit 50 to eval a subset)
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations

# Available base models:
# unsloth/Qwen3.5-0.8B, unsloth/Qwen3.5-2B, unsloth/Qwen3.5-4B, unsloth/Qwen3.5-9B

# Create training job (saves metadata to training-jobs/train-001.json)
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
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

**GRPO training defaults** (research-validated — see `reference/analysis-strategy.md` Part 6 for full rationale and sources):

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `learning_rate` | **1e-6** | Universal consensus: DeepSeekMath, DAPO, Dr. GRPO, TRL all use 1e-6. Do NOT use SFT rates (2e-5 to 5e-5) — they are 20-50x too high for GRPO and cause KL explosions. |
| `response_candidates_count` | **8** (minimum) | GRPO needs multiple candidates to compute advantages. With G=2, advantage estimates are too noisy. All published work uses G≥8: DeepSeekMath (G=64), DAPO (G=16), Dr. GRPO (G=8), TRL default (G=8). |
| `warmup_steps` | **20-50** | DAPO uses 20, "Tricks or Traps" uses 50. Linear warmup then constant LR. |

**Config adjustments (initial):**

> **⚠️ RFT epochs ≠ SFT epochs.** In SFT, 1-3 epochs avoids memorization. In RFT/GRPO, the model generates **fresh responses each epoch** — there's no repetition risk. RFT needs many more epochs for the model to explore the response space and learn reward-maximizing strategies. OpenAI's RFT uses hundreds of passes over the same prompts.

| Situation | Adjustment |
|-----------|------------|
| < 50 records | `epochs: 10-15` — fewer prompts need more passes to build signal |
| 50-200 records | `epochs: 5-10` — default range for typical datasets |
| > 500 records | `epochs: 3-5` — more data provides richer signal per epoch |
| Complex task | `lora_rank: 16` |
| Simple task | `lora_rank: 4` |
| Compute-constrained | `response_candidates_count: 4` (minimum viable, but signal quality degrades) |
| High KL but training otherwise healthy | **Do NOT lower LR just for KL.** In GRPO, KL is often not penalized (beta=0 is the DAPO/TRL default). High KL is expected as the model diverges from base. Check clipping ratio and reward trend instead |
| Unstable training (NaN loss, reward collapse) | Lower `learning_rate` to 5e-7. Check for 100% completion truncation first |

> **Note on eval IDs**: The `POST /finetune/evaluations` response returns `evaluation_run_id` — use this for polling. The workflow's `eval_job_ids` field may show a different internal ID that returns 404. Always use the ID from the create response.

#### 7c. Monitor training + poll eval

**Monitor training.** Delegate to the `training-monitor` subagent (installed at `.claude/agents/training-monitor.md`) — provide `GATEWAY_URL=http://localhost:9090`, `WORKFLOW_ID`, `JOB_ID` (from the training job file), and `OUTPUT_DIR=training-jobs`. The subagent writes a Python monitoring script, launches it via `nohup`, and **returns immediately** with the report file path. The script runs autonomously for the duration of training (30-120+ min), saving metrics and checking for anomalies.

**Poll eval in foreground** (while the training monitor runs autonomously):

```bash
# Poll eval in foreground (updates evaluations/eval-001.json with progress + results)
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval \
  --file evaluations/eval-001.json
```

**After eval completes**, check if training is done:
```bash
test -f training-jobs/{JOB_ID}-monitor-report.json && echo "Training done — read report" || echo "Training still running"
```

If training is still running, **poll it in the foreground** (do NOT use `sleep` in Bash):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training-jobs/train-001.json \
  --poll-interval 60 --max-wait 7200
```
This polls every 60s for up to 2 hours, printing step progress. When it returns, read the monitor report for anomalies.

> **⚠️ NEVER use `sleep 300` or `sleep 600` in a Bash tool call to wait for training.** This blocks a turn for minutes with zero feedback. Always use `poll-training` or check the monitor report file.

**After training completes, update the local train JSON** with final status so files aren't stale:
```bash
python3 -c "
import json
f = 'training-jobs/train-001.json'  # adjust filename
d = json.load(open(f))
d['status'] = 'succeeded'  # or 'failed' — match the actual outcome
json.dump(d, open(f, 'w'), indent=2)
"
```

**Key rule**: When eval completes, **immediately analyze eval results** — don't wait for training. Both save data locally (`training-jobs/` and `evaluations/`) so Step 8 needs no API calls.

### Step 8: Analyze Results & Present Findings

Analyze each job's results **as soon as they arrive** — don't wait for both to finish. Present findings to the user. If the user is interactive, let them choose the next action. If running non-interactively (no user response), auto-apply the highest-priority fix and iterate.

> **Read [reference/analysis-strategy.md](reference/analysis-strategy.md)** for decision trees, action templates, derived metrics, and presentation format.
> **Read [reference/training-metrics-guide.md](reference/training-metrics-guide.md)** for GRPO metric interpretation — healthy ranges, red flags, and what to change. Use the Quick Decision Table to determine iteration actions.

#### 8a. Analyze training results (when training completes)

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
  --metrics-file training-jobs/$JOB_ID-metrics.json \
  --epoch-evals-file training-jobs/$JOB_ID-epoch-evals.json
```

For JSON output: add `--json > training-jobs/job-v1-analysis.json`. The script computes reward trend, KL health, clipping ratio, loss stability, grad norm spikes, signal strength, and per-topic learning trajectories. Exits with code 1 if critical alerts found. Present findings immediately — don't wait for eval.

#### 8b. Analyze eval results (when eval completes)

**Must compute:**
1. **Overall**: average score, pass rate (>0.7 threshold), score range
2. **Per-topic breakdown**: group scores by topic, sort by average (weakest first)
3. **Low-scoring records**: list records <0.7 with their `reason` fields
4. **Score distribution**: are scores spread out (good) or clustered (grader issue)?

#### 8b+. Filter Dead-Weight Records & Regenerate Replacements

**Why this matters:** Research on GRPO/RFT shows that models **cannot learn from negative-only rewards**. When every sampled response to a question scores 0, the gradient is zero — the model learns nothing. Worse, these dead-weight records can actively destabilize training.

**After eval completes:**
1. Find records where max score < 0.1 — these are dead weight
2. Diagnose WHY (grader hard gate? wrong premise? model too weak? ambiguous question?)
3. Remove dead-weight records from `training.jsonl`
4. Regenerate replacements for the same topics using `generate_records.py --append` with different parameters (higher temperature, different prompt types)
5. Re-validate and re-upload

**When to skip regeneration:** If only 1-2 records out of 200+ scored 0, removing without replacement is fine. Regenerate when dead-weight records are >5% of total or concentrated in a single topic.

#### 8c. Cross-reference (when both available)

Combine eval scores with training metrics. Present a summary showing per-topic eval scores alongside training health indicators, then suggest prioritized actions. **Let the user choose** — they may direct their own analysis.

#### 8c. Quick diagnosis patterns

| Signal | Likely cause | Suggested action |
|--------|-------------|-----------------|
| All scores ~0 | Grader broken or too strict | Fix grader, dry-run, re-eval |
| Some records score 0, rest normal | Dead-weight records | Remove + regenerate (Step 8b+) |
| All scores ~1 | Grader too lenient | Add harder criteria, re-eval |
| One topic consistently low | Weak prompts or poor source material | Regenerate records, add source material |
| Good responses scoring low | Grader criteria misaligned | Adjust criteria weights or LLM judge prompt |
| NaN/Inf loss in training | Numerical failure (empty batches, truncation) | Check completion clipping first, then lower LR |
| train_reward up, valid_reward flat | **Reward hacking** (model exploiting grader) | Improve grader criteria, enable/increase KL penalty, inspect outputs |
| KL very high but reward improving | **Normal for GRPO** (beta=0 default) | No action needed — KL divergence is expected in RFT |
| Reward plateau | Grader not differentiating well | Improve grader for smoother score spread |
| Reward collapse | Grader binary or reward hacking | Rewrite grader with partial credit |
| No learning across epochs | Task too hard for base model | Try larger base model |
| Overfitting (peak then decline) | Too many epochs | Reduce `epochs` to peak epoch |

#### 8d. Update Iteration Tracker

**After every eval/training cycle**, append a summary to `iterations.md`. **Create it now if it doesn't exist:**

```bash
if [ ! -f finetune-project/iterations.md ]; then
  cat > finetune-project/iterations.md << 'EOF'
# Iteration History

Track each eval/training cycle: what was tried, what happened, what to change next.

EOF
  echo "Created iterations.md"
fi
```

Then append the current iteration's results:
```markdown
## Iteration N — [date]

**Config:** model=Qwen3.5-4B, LR=1e-6, epochs=2, lora_rank=8
**Eval:** avg_score=0.65, pass_rate=67%, weakest_topic=X (avg 0.3)
**Training:** reward 0.2→0.7, KL stable at 0.8, no anomalies
**Changed from previous:** [what was fixed]
**Next action:** [what to try next]
```

Include: config, eval results (per-topic breakdown), training results (reward/KL/clipping), what changed from previous iteration, and actionable recommendations. See [reference/analysis-strategy.md](reference/analysis-strategy.md) for the full template.

**Checkpoint** after analysis:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step analyze --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 9: Iterate (If Needed)

Based on the user's choice from Step 8, apply fixes and start new jobs. **Max 5 iterations.**

> **For full iteration diagnosis and escalation strategy**, read [reference/iteration-strategy.md](reference/iteration-strategy.md).

#### 9a. Apply the chosen fix

**Fixing the grader** (no data re-upload needed):
```bash
# Edit grader.js, then update:
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

**Fixing the data** (requires re-upload):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file training.jsonl
```

#### 9b. Start new eval + training jobs

After applying fixes, start new jobs — same as Step 7b but with incremented version numbers:
```bash
# New eval
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations

# New training job with adjusted config
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "unsloth/Qwen3.5-4B" \
  --output-model "project-v2" \
  --output-dir training-jobs
```

**Adjusting training config**: Modify parameters in the next job creation (Step 7b).

**If training failed with an opaque error** (e.g., "worker exited with status 1"): This is usually a transient cloud infrastructure failure. Retry with the same config first. If it fails again, try a smaller model or reduce batch size.

**Persistent training failures (3+ attempts fail):**

If training keeps failing, STOP retrying blindly and diagnose:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| KL > 1M consistently | **May be normal** — GRPO with beta=0 allows large KL. Only a problem if outputs degenerate | Check output quality, not just KL number. If outputs are good, continue |
| NaN loss on first step | Empty batches or 100% completion truncation | Check `completions/clipped_ratio` — lower `max_output_tokens` to 256-512 |
| Fails at step 1-5 then stops | Cloud infra issue or OOM from long completions | Try smaller model (4B → 2B → 0.8B) or reduce `response_candidates_count` to 4 |
| Fails mid-training (step 50+) | Gradient instability or numerical overflow | Add `warmup_steps: 50`, check for NaN in grad_norm |
| Multiple NaN jobs in a row | Grader returning 0 for all completions → zero gradient → NaN | Run eval first — check if base model can score >0 on any records |
| Reward flat after many epochs | No learning signal — all completions scoring identically | Check `frac_reward_zero_std` — improve grader granularity (partial credit) |

**Escalation ladder:**
1. **Retry once** with same config (transient failure)
2. **Lower LR** to 5e-7 (KL/gradient issues)
3. **Lower max_output_tokens** to 256 (OOM/truncation issues)
4. **Smaller model** (4B → 2B)
5. **Stop and report** — present diagnosis to user with what was tried

#### 9c. Iteration limits and escalation

- **Max 5 iterations.** After 5, stop and report full diagnosis.
- **Base model escalation:** After 2 failed iterations: `Qwen3.5-4B` → `7B` → larger.
- **When to stop:** User satisfied, OR avg score > 0.8 AND training reward > 0.7, OR 3+ iterations with no improvement.

### Using the vLLora UI

The vLLora UI at **http://localhost:5173** provides score distributions, training metrics charts, and interactive grader editing. Tell the user to open it after Step 6.

## Reference Files (Deep Dives)

Read these when you need more detail on a specific step:

| File | When to read |
|------|-------------|
| `reference/api-reference.md` | When making API calls — all 76 gateway endpoints with curl examples |
| `reference/data-format.md` | When generating JSONL — format rules, validation, quality tips |
| `reference/extraction-guide.md` | When extracting documents — Docling API, response structure, knowledge_parts.json schema |
| `reference/grader-writing.md` | When writing the grader — 3 patterns, design guidelines, common mistakes |
| `reference/topic-hierarchy.md` | When designing topics — structure, coverage analysis, balance scoring |
| `reference/iteration-strategy.md` | When analyzing results — diagnosis, stall patterns, escalation ladder |
| `reference/analysis-strategy.md` | **Read at Step 8** — data fields, decision trees, action templates, interactive presentation |
| `reference/workflow-guide.md` | For the full detailed walkthrough of every step |

## Helper Scripts

Run with `python3 ${CLAUDE_SKILL_DIR}/scripts/<script>`. Key scripts:

- **`finetune.py`** — Gateway API wrapper (create workflow, upload knowledge/topics/records/grader, verify, create-eval, create-training, poll-eval, poll-training)
- **`generate_records.py`** — Generate training records from topics + knowledge via LLM
- **`validate_dataset.py`** — Validate JSONL (format, fields, RFT compliance, cross-reference topics/parts)
- **`analyze_training.py`** — Analyze training metrics (reward trend, KL, clipping, loss, per-epoch evals)
- **`print_metrics_table.py`** — Print training metrics table (per-epoch or per-step)
- **`dry_run_grader.py`** — Dry-run grader on a single row (instant syntax/logic check)
- **`consolidate_parts.py`** — Merge adjacent text parts, drop fragments, fix Unicode
- **`validate_extraction.py`** — Cross-document extraction quality gate
- **`docling_extract.py`** / **`pdftotext_extract.py`** — PDF extraction (Docling or fallback)
- **`extract_tables.py`** — Upgrade text parts with Docling table data
- **`chat_completion.py`** — Low-level LLM call wrapper (used internally by `generate_records.py`)
- **`run_evaluation.py`** — Standalone eval script (legacy — prefer `finetune.py create-eval`)
- **`start_training.py`** — Standalone training script (legacy — prefer `finetune.py create-training`)
