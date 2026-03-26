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
2. Read `finetune-project/execution-log.md` to understand what was already completed
3. Verify gateway state — run `python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID` to see what's uploaded
4. Check for local artifacts:
   - `knowledge/` exists + has parts → Step 2 (extraction) is done
   - `topics.json` exists → Step 3 (topics) is done
   - `relations.json` exists → Step 3 (relations) is done
   - `training.jsonl` exists → Step 4 (data generation) is done
   - `grader.js` exists → Step 5 (grader) is done
   - `evaluations/` has eval results → Step 7-8 (eval) is done
   - `training-jobs/` has job files → Step 7 (training) was started
   - `iterations.md` exists → Previous iterations were run
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

**Delegate to the `knowledge-extractor` subagent** (installed at `.claude/agents/knowledge-extractor.md`) — it processes all documents through the extraction pipeline (Docling or pdftotext fallback), produces structured knowledge parts, uploads to the gateway, and validates the output. Provide `SKILL_DIR=${CLAUDE_SKILL_DIR}`, `WORKFLOW_ID`, `GATEWAY_URL=http://localhost:9090`, `PROJECT_DIR=finetune-project`, and the list of document paths.

The subagent handles the full extraction workflow: Docling extraction, per-document extract.py scripts, table upgrades, consolidation, gateway upload, index merging, and validation. It returns a summary of parts extracted per document.

> **For full extraction workflow details** (if you need to understand or debug), read [reference/extraction-guide.md](reference/extraction-guide.md).

After the subagent returns, verify the output exists before proceeding:
- `knowledge/all-parts-index.json` must exist with parts from all documents
- Each document should have its own subdirectory under `knowledge/` with `knowledge_parts.json`

If there are no documents (objective-only pipeline), skip this step.

**Review extraction with the user.** Present a per-document summary of what was extracted (document name, chapter/section count, parts count). Ask the user which areas they want the training to focus on. Use their answer to guide topic design in Step 3 — do NOT re-run extraction. All content is already on disk; topics control what gets used for training.

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
  --records-per-topic 10
```

The script loads topics + relations, finds leaf topics, gathers linked source chunks, and calls the LLM to generate grounded user prompts per topic. If some topics fail, use `--append` to retry without overwriting. Adapt `--records-per-topic`, `--model`, and `--temperature` to the project. Run multiple passes if needed (basic questions, then edge cases, then multi-turn). **Generate at least 100-200 total records.**

**Upload immediately** — push records to the gateway so the UI shows training data as it's generated:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file training.jsonl
```

**Review generated data with the user.** Present a per-topic breakdown (topic name, record count, 2-3 sample prompts per topic). Ask:
- Do these prompts look like realistic user questions?
- Any topics with weak/repetitive prompts that need regeneration?
- Any gaps — scenarios the user expected but didn't see?

The UI at `http://localhost:5173/finetune` also shows all records grouped by topic — point the user there for a visual review.

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

See [reference/grader-writing.md](reference/grader-writing.md) for 3 patterns (pure programmatic, LLM-as-judge, hybrid), design guidelines, and common mistakes. Use `${CLAUDE_SKILL_DIR}/templates/grader-template.js` as a starter.

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

Tell the user the data is visible at `http://localhost:5173/finetune`, then **proceed immediately to Step 7** (evaluation).

### Step 7: Start Evaluation & Training (Parallel)

**Always start both eval AND training together.** They run on the cloud in parallel and answer different questions:

| | Eval Job (~45 min) | Training Job (hours) |
|---|---------|-------------|
| **Tests** | Base model + your data + your grader | Whether finetuning improves the model |
| **Tells you** | Is my data good? Is my grader fair? | Is the model learning? Are hyperparams right? |
| **Iterate on** | Prompts, topics, grader criteria | Learning rate, epochs, lora_rank |

**Two iteration loops** (run in parallel): **Fast loop** — eval finishes in ~45 min, iterate on data/grader immediately. **Slow loop** — training runs for hours, check metrics when done. Start both on every iteration — the fast loop improves data while the slow loop validates training.

#### 7a. Pre-training validation

Before starting training, validate `max_output_tokens`. The default is **512** — higher values (e.g., 2000) can cause training jobs to fail on the cloud infrastructure. Only increase if you see 100% clipping in training metrics.

> **WARNING**: Setting `max_output_tokens` above 512 may cause training failures. Start with 512 and only increase if clipping is a problem.

#### 7b. Create both jobs (non-blocking)

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
| Situation | Adjustment |
|-----------|------------|
| < 50 records | `epochs: 1` (avoid overfitting) |
| > 500 records | `epochs: 3-4` |
| Complex task | `lora_rank: 16` |
| Simple task | `lora_rank: 4` |
| Compute-constrained | `response_candidates_count: 4` (minimum viable, but signal quality degrades) |
| Unstable training (KL spikes) | Lower `learning_rate` to 5e-7. If using LLM-judge grader, keep KL penalty enabled |

> **Note on eval IDs**: The `POST /finetune/evaluations` response returns `evaluation_run_id` — use this for polling. The workflow's `eval_job_ids` field may show a different internal ID that returns 404. Always use the ID from the create response.

#### 7c. Monitor training + poll eval

**Monitor training.** Delegate to the `training-monitor` subagent (installed at `.claude/agents/training-monitor.md`) — provide `GATEWAY_URL=http://localhost:9090`, `WORKFLOW_ID`, `JOB_ID` (from the training job file), and `OUTPUT_DIR=training-jobs`. The subagent writes a Python monitoring script, launches it via `nohup`, and **returns immediately** with the report file path. The script runs autonomously for the duration of training (30-120+ min), saving metrics and checking for anomalies.

**Poll eval in foreground** (while the training monitor runs autonomously):

```bash
# Poll eval in foreground (updates evaluations/eval-001.json with progress + results)
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval \
  --file evaluations/eval-001.json
```

**After eval completes**, check if the training monitor report exists:
```bash
test -f training-jobs/{JOB_ID}-monitor-report.json && echo "Training done" || echo "Training still running"
```

If training is still running, periodically check `tail -5 /tmp/training_monitor_{JOB_ID}.log` for progress. Once the report file appears, read it for anomalies before proceeding to analysis.

**Key rule**: When eval completes, **immediately analyze eval results** — don't wait for training. Both save data locally (`training-jobs/` and `evaluations/`) so Step 8 needs no API calls.

### Step 8: Analyze Results & Present Findings

Analyze each job's results **as soon as they arrive** — don't wait for both to finish. The analysis is **interactive** — present what you found and let the user drive the next action.

> **Read [reference/analysis-strategy.md](reference/analysis-strategy.md)** for decision trees, action templates, derived metrics, and presentation format.

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
| NaN/Inf loss in training | Learning rate too high | Lower `learning_rate` by 2x |
| KL divergence exploding | Model drifting too far | Lower `learning_rate` by 2x |
| Reward plateau | Grader not differentiating well | Improve grader for smoother score spread |
| Reward collapse | Grader binary or reward hacking | Rewrite grader with partial credit |
| No learning across epochs | Task too hard for base model | Try larger base model |
| Overfitting (peak then decline) | Too many epochs | Reduce `epochs` to peak epoch |

#### 8d. Update Iteration Tracker

**After every eval/training cycle**, append a summary to `iterations.md`. Create it on the first iteration if it doesn't exist. Include: config, eval results (per-topic breakdown), training results (reward/KL/clipping), what changed from previous iteration, and actionable recommendations. See [reference/analysis-strategy.md](reference/analysis-strategy.md) for the full template.

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
