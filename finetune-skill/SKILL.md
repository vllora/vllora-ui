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
Define Objective → Extract Docs → Build Topics → Generate Data → Write Grader → Validate
     ↓ upload         ↓ upload        ↓ upload       ↓ upload       ↓ upload
   (workflow)      (knowledge)      (topics)       (records)      (grader)

                   ┌─────────────────────────────────────────────────────────┐
                   │                                                         │
Validate → Data Quality Gate → Verify → Evaluate                             │
               ↓ FAIL                      ↓                                 │
          Fix data (cheap)          ┌──────────────────────────────┐         │
               ↓                    │   Eval-First Loop (fast)      │         │
          Re-validate               │ Analyze → Readiness Gate ────→│── PASS ─→ Train → Analyze → Done
                                    │      ↑         ↓ FAIL         │            ↓ bad
                                    │      ├── Fix data/grader ─────┘        Iterate (back to Eval)
                                    │      └── Fix topics (if stalled 2+ evals)
                                    └──────────────────────────────┘
```

**Each step uploads to the gateway immediately** — the vLLora UI shows progress in real time.

**Respect step dependencies — do NOT pre-draft steps before their inputs exist.** The dependency graph is:

```
Extract (Step 2) → Topics (Step 3) → ┬→ Generate Records (Step 4)
                                      └→ Write Grader (Step 5)      → Validate (Step 5.5)
```

Steps 4 and 5 can run in parallel — both depend on extraction + topics, not on each other. But do NOT start topics before extraction finishes, and do NOT start records or grader before topics are complete. Do NOT "pre-draft" topics or graders while extraction is still running — you will produce blind guesses disconnected from the actual document content, leading to poor topic coverage and grader criteria that don't match the data.

**Execute ALL steps (1-9).** Steps 1-6 prepare the dataset. Step 7 runs eval iterations until data/grader are validated. Only then does training start. Do NOT stop at Step 6 — always run evaluation at minimum.

**Eval first, train later.** Do NOT start training on the first iteration. Run eval, check the readiness gate, fix issues, re-eval. Only start training after the readiness gate passes (Step 7c→7d). This avoids wasting hours of GPU time on bad data or a broken grader.

**Wait for training to complete.** Once training starts (Step 7e), poll until it finishes. Run post-training eval on the trained model (Step 8b) and compare with the base model baseline (Step 7d). Analyze training metrics (Step 8c) and iterate (Step 9b) if needed.

**Auto-iterate when running non-interactively.** If the user is not responding (e.g., running via `claude -p`), make your own judgment: if readiness gate fails, apply the top-priority fix and re-eval automatically. Max 5 eval-only auto-iterations, max 3 training auto-iterations.

**Checkpoint after each step** — so the pipeline can resume after crashes:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step <STEP_NAME> --project-dir finetune-project --workflow-id $WORKFLOW_ID
```
Step names: `create-workflow`, `extract`, `topics`, `relations`, `generate-data`, `grader`, `validate`, `data-quality-gate`, `eval-N` (e.g. `eval-1`, `eval-2`), `readiness-pass`, `difficulty-probe`, `training`, `analyze`.

### Research Context: This is GRPO, Not SFT

This pipeline uses **GRPO (Group Relative Policy Optimization)** — a reinforcement learning method, NOT supervised fine-tuning. GRPO has counterintuitive properties that differ from SFT and generic ML. When you encounter unexpected behavior during eval or training, **research before guessing**:

**How GRPO works (always keep this in mind):**
- The model generates K completions per prompt (default K=8)
- Your grader scores each completion (0-1)
- GRPO computes advantages by comparing scores within each group — reinforces better completions, suppresses worse ones
- If all K completions score the same (zero variance) → zero gradient → that prompt teaches nothing
- The model will find and exploit ANY shortcut that maximizes the grader score — this is by design, not a bug

**When a fix isn't working — research before retrying.** Follow this file's steps and tables for normal pipeline execution. But if you've tried a fix and it didn't help (same problem persists after grader change, training still failing after config adjustment), **stop and web search before trying again.** GRPO has counterintuitive properties — the fix you'd guess from SFT experience is often wrong.

**How to research** (only when a fix fails or you hit an unfamiliar problem):
1. Web search with GRPO-specific queries — always include "GRPO" or "RFT":
   - ✗ "model generating long responses" (generic, gets SFT advice)
   - ✓ "GRPO length exploitation completions growing" (specific)
2. Key sources: TRL GRPOTrainer docs, arXiv papers (DeepSeek-R1 2501.12948, DAPO 2503.14476, Dr. GRPO 2503.20783, GR3 2603.10535, GRPO-LEAD 2504.09696, "Hard Examples" 2508.14094, "No Prompt Left Behind" 2509.21880), OpenAI RFT Guide, Unsloth issues
3. **Verify citations before writing them.** Read the actual paper section, not just the abstract. Confirm the paper says what you claim — don't cite a related paper for a claim it didn't make. Say "documents" vs "recommends" accurately.
4. Check if the recommended fix is available in our training API before implementing
5. Implement the best AVAILABLE fix, noting limitations in the execution log

**Common traps from applying SFT intuition to GRPO:**
- "Loss should decrease" — wrong. GRPO loss starts at 0 and rises slightly (on-policy → off-policy divergence).
- "More data is better" — not always. Easy records (base model scores >0.8) provide almost no gradient. Hard records with zero base model score also provide nothing.
- "Low eval scores mean training will fail" — wrong. DeepSeek-R1 started at 15.6% and reached 71%. Low base scores = high GRPO headroom.
- "High zero-variance means broken training" — wrong. 30-99% zero-variance per batch is normal (arXiv:2509.21880). Only a problem when reward is also flat.
- "Add a length penalty to fix verbose outputs" — depends on the form. **Additive** penalties (`score -= λ * length`) cause "length collapse" for any λ (GR3 arXiv:2603.10535). **Multiplicative** threshold penalties (`score *= factor`) are safer (GR3 endorses this form). The algorithmic root cause is per-token `1/|o_i|` normalization (Dr. GRPO arXiv:2503.20783). Best fix: semantic conciseness via LLM-judge or tight `max_output_tokens`.

### Working Directory

Create a local directory for all artifacts:

```
finetune-project/
├── training.jsonl, grader.js, topics.json, relations.json, config.json
├── execution-log.md, iterations.md
├── knowledge/                  # Per-document subdirs (slugified filename)
│   ├── {doc-slug}/             # {slug}.md, extract.py, knowledge_parts.json, parts-index.json
│   └── all-parts-index.json   # Merged index across ALL documents
├── evaluations/                # eval-001.json, eval-002.json, ...
└── training-jobs/              # train-001.json, {JOB_ID}-metrics.json, ...
```

**Multi-document handling**: Each document gets its own subdirectory under `knowledge/` named by slugifying the filename. A merged `knowledge/all-parts-index.json` combines all per-document indexes for topic design and data generation.

**Table-heavy documents**: Write a "synthesis part" — a prose summary of key facts from tables — and include it as a text part alongside the table parts. This gives the model facts to reference conversationally.

**Workflow ID comes from `config.json` ONLY.** If `finetune-project/config.json` exists, read the `workflow_id` from it — that is the current workflow. If it does NOT exist, ALWAYS create a new workflow via `create-workflow`. Do NOT search the gateway API for workflows with the same name and reuse their ID. Workflow names are not unique — multiple runs can have the same name. The `config.json` file is the single source of truth for which workflow this project belongs to.

**Workflow reuse**: When iterating on the SAME project (adding records, re-running evals, retraining), reuse the workflow from `config.json`. The API supports upserting records. Only create a new workflow (delete `config.json` first) when starting a completely different project.

**Error handling**: If an API call returns a 4xx/5xx error, do NOT abandon the workflow and create a new one. Read the error message, fix the issue (e.g., duplicate IDs, invalid data), and retry the same request against the same workflow.

**NEVER modify skill files.** The `.claude/skills/` and `.claude/agents/` directories are read-only. Do not edit, patch, or write to any file under these paths. If a script has a bug, work around it — do not fix the script in place.

### Execution Log

Maintain `execution-log.md` as an **append-only** chronological record. Append a section IMMEDIATELY after EACH step completes — not retroactively. Never overwrite.

**Minimum required fields per step** (see [reference/execution-log-template.md](reference/execution-log-template.md) for full template). **ALL fields below are mandatory — not suggestions.** The execution log is the primary debugging artifact when something goes wrong in later steps. Skipping fields here costs hours of re-investigation later.

- **Every step**: timestamp (ISO 8601 or `YYYY-MM-DD HH:MM`), duration (minutes or "< 1 min")
- **Step 2**: per-document: Docling chunks → build_knowledge_parts count + table count. Reused existing: yes/no. Validation: PASS/FAIL. Gateway verify: N sources, M total parts.
- **Step 3**: relevance filter: total/relevant/excluded + 2-3 sample excluded titles. Topic count: N total (M leaf). **Difficulty breakdown: N easy, N medium, N hard.** System prompt self-check: passed/failed. Relations: N total, per-topic range min-max. Upload counts: topics=N, relations=N, relevance labels=N.
- **Step 4**: mode (relations/rag-only). Records per topic (default or custom). **Per-topic counts** (topic-name: N, ...). source_parts coverage: N/total with per-record tagging. Dedup: removed N. Upload: N records.
- **Step 5**: template copied (exact filename). **Criteria list with weights** (e.g., "F1=0.40, hidden_bonus=0.20, conciseness=0.15"). Dry-run Test 1: score + reason summary. **Dry-run Test 2 (live): 3 sample scores** (e.g., "0.7, 0.3, 1.0"). If Test 2 fails, log the failure reason BEFORE the fix, then log the retry scores. Gateway verify: evaluator uploaded, char count.
- **Step 7 (each eval)**: eval job ID, model name, **duration (minutes)**. Results: avg, std, zero_frac%, perfect_frac%, **score mode at frac%**. **Per-topic scores: topic-name=avg (weakest first).** Readiness gate: PASS/FAIL with hard check details.
- **Step 7e (training)**: job ID, base model, **full config: epochs, learning_rate, lora_rank, max_output_tokens, response_candidates_count (K), batch_size**. Note: `loss_type="dr_grpo"` is the default.
- **Step 8 (analysis)**: per-topic breakdown (weakest topics). Dead-weight records: N scoring 0.0. Training metrics: final_reward, reward_delta, KL, clipping%. Recommendations.
- **Step 9 (each iteration)**: iteration number, what changed and why, change_type (grader/records/both/hyperparams). Re-eval results: avg=X (was Y), Δ=Z. Verdict.

**⚠️ Log EVERY step, not just Step 1.** If the execution log has only Step 1 when Step 5 is complete, the log is useless for debugging.

**⚠️ Per-topic scores are the most diagnostic field.** When eval avg is 0.68, knowing that "hidden-sesame=0.31, hidden-egg=0.42, explicit-allergens=0.95" tells you exactly where to focus. An avg alone tells you nothing actionable.

---

### Prerequisites

Before starting, verify the gateway is running and `uv` is available:
```bash
# Check gateway
curl -s http://localhost:9090/finetune/workflows | head -c 100 && echo " OK" || echo "ERROR: Gateway not running at localhost:9090"

# Check uv (used to run all helper scripts with their deps)
uv --version 2>/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
```

All helper scripts use `uv run` with PEP 723 inline dependencies — no manual `pip install` needed.

### Resume from Previous Run

**ALWAYS check for an existing `finetune-project/` directory before starting a new pipeline.** If one exists, this is a continuation — do NOT start from scratch.

**Reusing extractions across workflows:** Even when creating a NEW workflow (new `config.json` + workflow ID), existing `knowledge/{slug}/docling-result.json` files can be reused. Docling extraction is the slowest step — if the same PDFs were already extracted in a previous run, the `--skip-existing` flag (and knowledge-extractor subagent) will detect and reuse them. Do NOT delete the `knowledge/` directory when starting a new workflow from the same documents.

**Detection** — `config.json` is the ONLY way to detect an existing project. Do NOT list workflows from the gateway API to find one with a matching name:
```bash
if [ -f finetune-project/config.json ]; then
  echo "EXISTING PROJECT FOUND — resuming"
  WORKFLOW_ID=$(python3 -c "import json; print(json.load(open('finetune-project/config.json'))['workflow_id'])")
  echo "Workflow ID: $WORKFLOW_ID"
else
  echo "No config.json — will create new workflow in Step 1"
fi
```

**If an existing project is found:**
1. Read `finetune-project/config.json` to get the `workflow_id`
2. **Run `status` to see the full picture** — this is the single source of truth:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py status --workflow-id $WORKFLOW_ID
```
This shows gateway data (records, topics, sources, grader), all job statuses, local checkpoint state, and recommends the next step. **Follow its recommendation.**

3. **Sync jobs from gateway** to pick up jobs created by the UI or other agents:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project
```
This creates local tracking files for any jobs you don't already have and updates statuses for existing jobs (e.g., a job you created that was later cancelled from the UI).

4. **Cancel broken eval jobs** — if `status` shows a running eval scoring ~0.0, the grader is broken and the eval is wasting compute. Cancel it before proceeding:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py cancel-eval --workflow-id $WORKFLOW_ID --eval-id <EVAL_ID>
```
5. **Pick up from the recommended step** — do NOT re-run completed steps
6. Append to `execution-log.md` (never overwrite) with a "Resumed" entry:
   ```
   ## Resumed — [timestamp]
   - Status output: records=X, topics=Y, sources=Z, grader=YES/NO
   - Jobs: [list active/cancelled/done]
   - Picking up from Step M (per status recommendation)
   ```

**Common resume scenarios:**
| State found | What happened | Action |
|-------------|---------------|--------|
| `config.json` + `knowledge/` + no `topics.json` | Crashed during or after extraction | Resume from Step 3 (topics) |
| Everything through `grader.js` + no `evaluations/` | Crashed before eval | Resume from Step 7b (create eval) |
| `evaluations/` has results + no readiness-pass checkpoint | Eval completed, no readiness gate run | Run `readiness-check` on latest eval (Step 7c) |
| Readiness gate FAIL + no fixes applied | Crashed during fix step | Read readiness output, apply fixes (Step 9a), re-eval |
| Readiness gate PASS + no `training-jobs/` | Crashed before training start | Create training job (Step 7e) |
| `training-jobs/` has a job file with status `running` | Training was in progress | Poll the existing job, don't create a new one |
| `training-jobs/` has a job file with status `cancelled` | Job was cancelled (from UI or another agent) | Skip it. Analyze eval results. Start new job if needed (Step 9) |
| `training-jobs/` has a job with `source: synced_from_gateway` | Job was created from the UI, not by this agent | Treat it like your own — poll it, analyze results when done |
| `iterations.md` exists with iteration results | Previous iteration completed | Read findings, apply fixes (Step 9), continue iterating |

### Step 1: Define the Objective

Ask the user what behaviors the model should learn. Produce two things:
- An **objective statement** describing desired behaviors and constraints
- A **system prompt** ("You are...") that will be used in Step 4 (record generation) to prefix every training conversation

> **Note:** The system prompt is NOT stored on the workflow. It's composed at record generation time (Step 4) from a root persona + per-topic segments, and embedded in each record's `messages[0]`. Save it locally for use in Step 4.

**Create a new workflow** — only if `config.json` doesn't already exist. Do NOT search the gateway API for existing workflows by name:
```bash
if [ -f finetune-project/config.json ]; then
  WORKFLOW_ID=$(python3 -c "import json; print(json.load(open('finetune-project/config.json'))['workflow_id'])")
  echo "Using existing workflow: $WORKFLOW_ID"
else
  WORKFLOW_ID=$(uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-workflow \
    --name "My Project" \
    --objective "Train a model to..." | tail -1)
  echo "Workflow created: $WORKFLOW_ID"
fi
```
Save `$WORKFLOW_ID` — every subsequent step uses it to upload data incrementally.

**Persist the workflow ID** to a config file and checkpoint immediately:
```bash
mkdir -p finetune-project
cat > finetune-project/config.json << EOF
{"workflow_id": "$WORKFLOW_ID", "gateway_url": "http://localhost:9090", "use_nemo": false}
EOF
```

Then check if the user has a `finetune-defaults.json` in the project root — if so, merge those settings into `config.json`:
```bash
if [ -f finetune-defaults.json ]; then
  python3 -c "
import json
config = json.load(open('finetune-project/config.json'))
defaults = json.load(open('finetune-defaults.json'))
config.update(defaults)
json.dump(config, open('finetune-project/config.json', 'w'))
print(f'Merged defaults: {defaults}')
"
fi
```

> **`use_nemo` flag**: Controls record generation at Step 4. `false` (default) → `generate_records.py`. `true` → NeMo Data Designer (requires server at `localhost:8000`).
>
> **To set defaults**, create `finetune-defaults.json` in the project root before running the skill:
> ```json
> {"use_nemo": true}
> ```

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step create-workflow --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 2: Extract Documents

> **PREREQUISITES:** Step 1 complete (workflow created, objective defined).

Extract knowledge from all documents. Each document is processed independently by a `knowledge-extractor` subagent.

**Outputs:** `knowledge/{slug}/knowledge_parts.json`, `knowledge/{slug}/parts-index.json` (per document), `knowledge/all-parts-index.json` (merged)

> **Deterministic extraction rule**: Subagents MUST use `build_knowledge_parts.py` as the default extraction script. This ensures the same PDF always produces the same knowledge parts. Agents must NOT write custom extract.py scripts unless the user explicitly requests custom extraction for a specific document via CUSTOM_INSTRUCTIONS, or `build_knowledge_parts.py` produces 0 parts.

**2a. Check Docling** — `curl -sS --connect-timeout 5 http://127.0.0.1:5001/health`. If unavailable, the `knowledge-extractor` subagent handles fallback automatically.

**2b. Submit & extract** — Submit all PDFs to Docling with `--skip-existing` (reuses existing `docling-result.json`). Spawn one `knowledge-extractor` subagent per document (up to 4-5 parallel). Wait for ALL to complete before proceeding.

> **⚠️ Upload ownership**: Subagents upload to the gateway after validating their extraction. Do NOT re-upload sources yourself — this creates duplicates (4 sources instead of 2). If you need to fix extraction quality after subagents finish, update the local `knowledge_parts.json` and use `upload-knowledge --force` which **overwrites** the existing source instead of creating a new one.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/docling_extract.py --submit-only --skip-existing \
  "pdfs/doc1.pdf:finetune-project/knowledge/doc1-slug/docling-result.json" ...
```

> See [reference/extraction-guide.md](reference/extraction-guide.md) for subagent parameters, retry logic, and merge script.

**2c. Merge indexes** — Merge all per-document `parts-index.json` into `knowledge/all-parts-index.json`. Verify all expected documents are present. Do NOT proceed to Step 3 until merge completes.

**2d. Validate — MUST PASS before continuing:**

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

**This is a hard gate.** If validation reports FAIL or WARN after `--fix`:
1. Read the specific failure reasons (short parts, low title diversity, **table quality issues**, etc.)
2. Re-run `consolidate_parts.py` with adjusted thresholds on the failing documents
3. **If table quality FAIL** (inconsistent columns, mixed content, missing metadata) — **read the PDF pages directly and fix the tables yourself:**

   You are a vision-capable LLM. Use the `Read` tool to view the problematic PDF pages (it supports `pages` parameter for PDFs). You will see the actual table with correct headers, columns, values, and footnotes. Then write corrected table parts to `knowledge_parts.json`.

   **Step-by-step:**
   ```
   # 1. Read the PDF pages that contain the broken table
   Read the PDF file with pages parameter, e.g.: pages "9-20"

   # 2. You can now SEE the table — extract the correct headers and data

   # 3. Write the corrected table part to knowledge_parts.json with:
   #    - "type": "table"
   #    - "content": markdown pipe-delimited table (| header1 | header2 | ... |)
   #    - "content_metadata": {"headers": [...], "num_rows": N, "num_cols": M}
   #    - Remove the old broken table fragments (same title, wrong data)
   ```

   This is the best approach because:
   - **Free** — no extra API cost, you're already running
   - **Accurate** — you see the actual table visually, no parsing errors
   - **Handles complexity** — footnotes, superscripts, spanning headers, multi-page tables
   - **No dependencies** — no Camelot, opencv, or other packages to install

   > **Fallback only**: If you cannot read the PDF (e.g., running in a text-only environment), use `camelot_extract_tables.py --pages <table-pages>` instead.

4. Re-validate after fixing. If still FAIL, present the failure details to the user and ask whether to proceed or re-extract.
5. Do NOT silently proceed to Step 3 with FAIL status — bad extraction poisons topics, records, and training.

**2e. Verify gateway upload** — `uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID`. Confirm source count matches the number of PDFs (not more, not fewer), parts count per source > 0, and source names match local data.

> **⚠️ Duplicate check**: If source count > number of PDFs, subagents and orchestrator both uploaded — duplicates exist. Delete the extras via `DELETE /finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID` before proceeding. If you need to fix extraction quality and re-upload, ALWAYS use `upload-knowledge --force` which overwrites the existing source. NEVER create a second source for the same PDF.

**Review with user.** Present per-document summary (name, parts count, sample titles). Ask about focus areas for training. If user wants re-extraction of specific documents, spawn new subagent with `CUSTOM_INSTRUCTIONS`.

**Checkpoint:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step extract --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

---

### Step 3: Build Topic Hierarchy

> **PREREQUISITES:** Step 2 fully complete (all subagents returned, `all-parts-index.json` merged, validation passed). Do NOT start while extraction is running.

Filter extracted parts by relevance, design a skill-based topic hierarchy, build topic-part relations, and write behavioral system prompt segments. Topics define WHAT training data gets generated — getting this right avoids regenerating data later.

**Outputs:** `topics.json`, `relations.json`, updated `all-parts-index.json` (with relevance labels)

**⚠️ Topic consistency: reuse existing structure when available.** Topic design is the largest source of run-to-run variance — the same PDF can produce 8 or 13 leaf topics depending on LLM judgment calls about granularity. This changes record counts by 30%+ and hides per-item difficulty from GRPO. To prevent this:

1. **If `topics.json` already exists** in the project directory (from a prior run or manual design), treat it as the authoritative topic structure. Do NOT redesign from scratch. Instead: read the existing topics, verify they still cover the extracted content, and only add/remove topics if the source material has materially changed (new documents added, objective changed). Log "Reusing existing topic structure" in execution-log.md.
2. **If no `topics.json` exists**, design topics per 3a-3e below, then save the result. This becomes the stable structure for future iterations on the same documents.
3. **When iterating** (Step 9 — fixing data/grader after eval), NEVER redesign the topic hierarchy unless the user explicitly requests it. Topic changes cascade to records, relations, and grader — they are expensive.

> **Why this matters for GRPO**: Topic structure determines difficulty-diagnostic granularity. If "Milk" and "Egg" are separate topics, you can see that the model scores 0.8 on Milk but 0.3 on Egg and target more Egg records. If they're merged into "Dairy+Egg," that signal is lost. Consistent topics across runs also make eval comparisons meaningful — comparing eval scores across runs requires the same topic structure. (Ref: arXiv:2508.14094 — difficulty targeting requires per-item granularity; DataDreamer arXiv:2402.10379 — reproducible pipelines cache taxonomy artifacts.)

**3a. Filter parts by relevance to the objective.**

Not all extracted content is relevant to the finetune goal. Read `knowledge/all-parts-index.json` and at least 2-3 per-document `knowledge_parts.json` files. For each part, ask: "does this content teach a skill the model needs for the stated objective?"

Write the label back to `all-parts-index.json` — set `"relevant": true` for parts that contribute to the objective, `"relevant": false` for parts that don't. This persists the filtering decision so anyone looking at the index can see which parts were used. Log the summary (total/relevant/excluded + sample excluded titles) in `execution-log.md`.

**Example** — IRS Pub 596 (120 parts) + Pub 501 (80 parts) for objective "EIC tax credit calculator":
- Pub 596 parts about EIC rules, tables, worksheets → **relevant** (keep)
- Pub 596 parts about "How to get tax help", "Privacy Act notice" → **irrelevant** (exclude)
- Pub 501 parts about dependent tests, filing status → **relevant** (affect EIC eligibility)
- Pub 501 parts about standard deduction amounts → **irrelevant** (exclude)
- Result: ~60 relevant parts out of 200 → topics built from those 60 only

**3b. Design skill-based topics from relevant parts.**

From the relevant parts only, identify distinct skills the content teaches. Organize by **skill** (what the model learns to DO), not by document structure.

```
❌ Bad (mirrors document headings): "Filing Status" → "Income Limits" → "Qualifying Child Tests"
✅ Good (organized by skill): "Eligibility Determination" → "Credit Calculation" → "Multi-Factor Edge Cases"
```

Each topic is a task the model must perform. Multiple document sections feed into each skill topic. A single skill topic may draw from multiple chapters and multiple documents. When multiple documents cover overlapping content, merge into single topics.

**Two-level hierarchy:** Domain (broad capability area) → Skill (specific competency). Difficulty is metadata on each leaf topic (`"expected_difficulty": "easy"|"medium"|"hard"`), not a structural level — this avoids doubling leaf count (TAGS arXiv:2601.13995). Target 15-25 records per leaf topic, 5-40 leaf topics depending on dataset size. See `reference/topic-hierarchy.md` for full guidelines.

**Granularity rule for enumerable items:** When the source material defines a list of distinct items that the model must handle individually (e.g., 9 FDA allergens, 14 tax forms, 12 compliance rules), **prefer one leaf topic per item** rather than merging items into groups. Merging hides per-item difficulty from GRPO — you can't target "the model fails on Sesame" if Sesame is merged into "Tree Nut, Peanut, and Sesame." This rule applies when:
- The source explicitly enumerates items (a list, table, or set of categories)
- Each item has distinct detection/handling characteristics (different hidden names, different rules)
- The total leaf count stays within 5-40 (if >40 items, group by shared characteristics)

When multiple documents discuss the same enumerable item (e.g., two PDFs both cover milk allergens), merge those documents' content into the SAME per-item topic — not into a broader group. The merging is across documents for the same item, not across items.

```
❌ Bad (merges items): "Hidden Dairy and Egg Sources" (hides per-allergen difficulty)
✅ Good (per-item): "Hidden Milk/Dairy Sources" + "Hidden Egg Sources" (GRPO can target each)
❌ Bad (per-document): "PDF-1 Milk" + "PDF-2 Milk" (duplicates across documents)
✅ Good (merged per-item): "Hidden Milk/Dairy Sources" (draws from both PDFs)
```

> **Research basis**: GRPO learning signal is strongest on hard items (arXiv:2508.14094 — 47% gains from hardest 10%). Per-item topics enable difficulty-weighted record generation. Merged topics mask which items the model struggles with, preventing targeted improvement. The synthetic diversity study (arXiv:2410.15226) confirms more granular topics reduce redundancy up to 20-30 records/topic.

**3c. Write behavioral system prompt segments.**

The `system_prompt` on each topic is a **segment** composed with ancestors into one flowing instruction: `[Root persona]. [Domain context]. [Leaf focus].`

- **Root** (Step 1): the only "You are..." statement. Sets persona + behavior.
- **Domain** (parent_id=null): narrows the field. Do NOT repeat the root.
- **Leaf**: specific skill focus with action verbs.

Each level adds ONLY what the parent doesn't already say. Write as behavioral instructions (When/For/Given + action verbs like assess, recommend, identify, compare), NOT keyword lists.

```
❌ Bad: "Specialize in: oxygen targets, nebulized salbutamol, IV magnesium, ICU criteria..."
✅ Good: "When managing acute severe asthma, assess severity using BTS/SIGN criteria,
         recommend stepwise bronchodilator escalation, identify ICU triggers, and plan discharge."
```

**Self-check** before proceeding — for each leaf topic verify: (1) starts with situational trigger, (2) contains action verbs, (3) doesn't repeat root/parent, (4) composed result reads as one natural instruction.

Save to `topics.json` as a flat array with `parent_id` for hierarchy. See `reference/topic-hierarchy.md` for JSON format and examples.

**3d. Build topic-part relations.** Delegate to `relation-builder` subagent — links relevant parts to leaf topics (max 15 per topic). Writes `relations.json`.

**Upload** topics, relations, and relevance labels:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics --workflow-id $WORKFLOW_ID --file topics.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-relations --workflow-id $WORKFLOW_ID --file relations.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-part-relevance --workflow-id $WORKFLOW_ID --parts-index knowledge/all-parts-index.json
```

> **⚠️** If you redesigned topics (changed IDs), re-upload before uploading records — stale gateway topics cause FK violations.

**3e. Agent quality check — read and verify topics yourself.**

Before presenting to the user, verify the topic hierarchy by reading the source material:
- **Coverage**: Read `all-parts-index.json` titles. Is every major section of the source covered by at least one topic? Any obvious gaps?
- **Overlap**: Do any two leaf topics cover the same content? Overlapping topics produce duplicate records that waste training signal.
- **Balance**: Are topics roughly equal in scope? A topic covering 100 pages vs one covering 2 pages will produce very different record quality.
- **Relations**: For each leaf topic, read its linked parts. Do they actually contain relevant content for that topic? Wrong relations → wrong records → wrong GTs.

This takes ~2 minutes and catches issues that automated checks miss.

**Review with the user.** Present topic hierarchy (name, parent, linked parts count, planned records-per-topic). Ask: are these the right skills? Any missing? How many records per topic?

---

### Step 3.5: Categorize Existing Records

If the user provides existing training data, assign each record to a leaf topic before generating new data:

```jsonl
{"messages": [...], "id": "record-1", "topic": "billing/refunds"}
```

Skip this step if generating all data from scratch.

### Step 4: Generate Training Data

> **PREREQUISITES:** Step 3 complete (topics uploaded, relations built).

**Check `config.json` for `use_nemo` flag:**
```bash
USE_NEMO=$(python3 -c "import json; print(json.load(open('finetune-project/config.json')).get('use_nemo', False))" 2>/dev/null || echo "False")
```

If `use_nemo` is `True`, skip to **Step 4B** below. Otherwise continue with the default path.

---

#### Step 4A: Default — `generate_records.py`

Generate training prompts grounded in the knowledge parts linked to each topic via relations (Step 3d). Each record is a system + user message pair — no assistant messages (GRPO generates its own responses).

**Outputs:** `training.jsonl`

Each record includes per-record `source_parts` — the 1-3 specific parts the LLM tagged as used when generating that question (traced via relations from Step 3d):

```jsonl
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "..."}], "id": "record-1", "topic": "billing/refunds", "source_parts": ["p-001", "p-003"]}
```

Use `generate_records.py` to generate user prompts via LLM, grounded in the knowledge chunks linked to each topic:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are an expert chess tutor..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 25 \
  --parallel 4 \
  --workflow-id $WORKFLOW_ID \
  --upload-incremental \
  --enrich-sources
```

Key flags: `--enrich-sources` (recommended: enriches source_parts traceability), `--append` (retry failed topics without overwriting), `--upload-incremental` (records appear in UI as each topic completes). Generate **200+ total records**, 15-25 per leaf topic.

**`--ground-truth-format`** (recommended for structured-output tasks): Forces scenario-based prompts with specific answer format. **⚠️ Include exact valid vocabulary** — don't use placeholders:
- ✗ Bad: `--ground-truth-format 'allergen1, allergen2 OR none'`
- ✓ Good: `--ground-truth-format 'Comma-separated from ONLY: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame. If none: none'`

**⚠️ ALWAYS deduplicate** after generation:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/deduplicate_records.py finetune-project/training.jsonl --threshold 0.85
```

> See [reference/data-format.md](reference/data-format.md) for full `generate_records.py` options, weighting modes, RAG mode, and upload details.

**Review with user.** Present per-topic breakdown (name, count, sample prompts). Point user to UI at `localhost:5173/finetune`.

#### Step 4B: NeMo Data Designer (OPTIONAL — only when `use_nemo: true` in config.json)

> **Skip this section unless the user explicitly set `"use_nemo": true`.** The default path is Step 4A above.

Spawn `nemo-data-generator` subagent with `PROJECT_DIR`, `WORKFLOW_ID`, `SYSTEM_PROMPT`, `RECORDS_PER_TOPIC`. It handles the full NeMo pipeline. If NeMo unavailable, fall back to Step 4A.

---

**4e. Agent quality check — read and verify records yourself.**

After generation, **read records from every topic** (at least 3-5 per topic, mix of easy and hard prompts) and check:
- **GT self-consistency**: Does the answer/verdict match the reasoning/evidence within the same GT? (e.g., "COMPLIANT" but explanation says "exceeds limit" = contradiction)
- **GT factual accuracy**: Cross-reference 5-10 numeric values in GTs against the source parts. Do the numbers match? (e.g., if GT says "MCL for benzene is 0.005 mg/L", verify this appears in the source table)
- **Prompt-GT alignment**: Does the GT actually answer the question asked? Does it use the correct format specified in the system prompt?
- **Vocabulary consistency**: Are GTs using the exact vocabulary from `--ground-truth-format`? Any synonyms, abbreviations, or variants that would confuse the grader?
- **Duplicate patterns**: Are different prompts producing identical GTs? (>5 identical GTs = low diversity, wasted GRPO signal)

If >10% of sampled records have issues, **fix before proceeding** — re-generate the bad records with `generate_records.py --append` (skips completed topics) or `filter-records` + regenerate.

**Checkpoint** after data generation (applies to both Step 4 and Step 4B):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step generate-data --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 4.5: Generate Variants for Augmentation (OPTIONAL)

If some topics are under-represented, use `chat_completion.py` to create variants:

1. Select seed records from under-represented topics
2. Call the LLM with the seed prompt + instructions to vary scenario, specifics, tone, complexity
3. Keep system prompt and prior turns unchanged — vary only the final user message
4. Track lineage: `"source_record_id"` pointing to the original
5. Generate 3-5 variants per source record, append to `training.jsonl`
6. **Run the Step 4e quality check on the new variants too** — generated variants can drift from the original's quality

### Step 5: Write the Grader

> **PREREQUISITES:** Steps 2 + 3 complete. Grader *writing* can start in parallel with Step 4, but the **live dry-run** (Step 5.1 Test 2) requires records on the gateway — wait until Step 4 has uploaded at least some records before running `--live`.

Write a JavaScript grader function to `grader.js`. Scores model responses 0-1, runs server-side during evaluation and training.

**Before writing the grader, analyze the extracted knowledge and design a checklist rubric:**
1. Read the extracted knowledge parts (`knowledge/all-parts-index.json` and 2-3 per-document `knowledge_parts.json` files) to understand the domain's specific rules, terminology, formulas, tables, and edge cases
2. Read `topics.json` to understand the skill areas the model will be tested on
3. For each topic, think about what a perfect vs. mediocre vs. bad response looks like — grounded in what the source documents actually say, not your general knowledge
4. **Design a checklist rubric of 7-20 binary criteria** (Rubrics as Rewards, arXiv:2507.17746 — up to 31% signal improvement). Categorize each criterion as Essential (weight 1.0), Important (weight 0.7), or Optional (weight 0.3). These MUST reflect the actual domain content (e.g., specific IRS rules, exact formulas, threshold values from the documents)
5. **Validate rubric quality** — check for 4 failure modes (RRD, arXiv:2602.05125): coverage gaps, conflated dimensions, misaligned direction, redundant criteria (correlation >0.7 → merge)
6. **Use stratified scoring** — if a binary correctness check exists (even partial), use it as a gate: correct answers score 0.5-1.0, wrong answers score 0.02-0.5 (HERO, arXiv:2510.07242 — +9-11 points). This prevents "wrong but well-written" from outscoring "correct but terse"
7. Then write the JS grader informed by this analysis. See [reference/grader-writing.md](reference/grader-writing.md) for the full rubric design guide.
8. If `training.jsonl` already exists (Step 4 finished first), also read 10-15 sample rows to validate your criteria against real prompts

The grader function signature: `function evaluate(input) { ... return { score, reason }; }` where score is 0.0-1.0. The function can use `__langdb_call_llm_as_judge_obj(config, input)` for subjective quality assessment — `config` has `prompt_template` (message array with `{{history}}`/`{{response}}` template vars), `output_schema` (JSON Schema), and `completion_params` (`{model_name, temperature, max_tokens}`). Set `input.history` and `input.response` before calling. **Synchronous only** — no async/await.

See [reference/grader-writing.md](reference/grader-writing.md) for 3 patterns (pure programmatic, LLM-as-judge, hybrid), design guidelines, and common mistakes.

**⚠️ COPY a template file — do NOT write a grader from scratch.** Literally copy the closest template file to `grader.js`, then customize ONLY the domain-specific parts (criteria names, weights, system prompt, domain terms). Keep the template's architecture intact — especially the LLM-as-judge scoring, LLM extraction fallback, and error handling. Do NOT cherry-pick individual features from a template into a hand-written grader — this loses the template's scoring granularity and produces coarse scores that GRPO can't learn from. If no template matches exactly, use `grader-template.js` as the base.

**⚠️ NEVER return score 0.0 for a parsing/extraction failure.** A score of 0 must mean the response is genuinely wrong or empty — not that the grader couldn't parse the format. Use LLM-based extraction as fallback when regex fails (see `grader-mcq.js` and `grader-classification.js` for the pattern).

**⚠️ GRPO CRITICAL: Wrong answers MUST get nonzero scores (0.01-0.10).** This is the #1 grader mistake. GRPO learns by comparing K completions per prompt. If all wrong answers score 0.0, the model gets zero gradient from those prompts — they're dead weight. A score of 0.01-0.10 for "wrong but attempted" gives GRPO the contrast it needs (0.01 vs 0.8 = useful gradient, 0.0 vs 0.8 = wasted prompt). This applies to:
- Model says "none" when answer exists → score 0.02 (not 0.0)
- Model gives wrong answer but correct format → score 0.05 (not 0.0)
- Model partially correct (1 of 3 items) → score proportional to partial correctness

**Only these should score exactly 0.0**: genuinely empty response, prompt copy/repetition, or complete refusal ("I cannot help"). Everything else gets at least 0.01.

**⚠️ When fixing the grader in iteration (Step 9a), NEVER remove partial credit.** If the current grader gives 0.03 for wrong answers, do NOT change it to 0.0 — that makes the score distribution MORE binary and kills GRPO gradient. The fix for "too many wrong answers" is better records or a better model, NOT harsher scoring. Harsher scoring = more zeros = less gradient = worse training.

**⚠️ MANDATORY: Prevent length exploitation.** GRPO's #1 failure mode is the model learning verbose responses because longer = more content = higher scores. This happens in almost every training run. Four defenses (all active or recommended):

**Defense 1 (algorithm — ACTIVE by default):** The vLLora cloud uses `loss_type="dr_grpo"` + `mask_truncated_completions=True` + `repetition_penalty=1.1` by default. Dr. GRPO (arXiv:2503.20783) removes the algorithmic root cause (per-sequence `1/|o_i|` normalization). Truncation masking (DAPO, arXiv:2503.14476) ensures truncated completions contribute zero gradient. Repetition penalty (1.1) discourages repetitive padding at generation time. **If length exploitation occurs despite these, the cause is reward-correlated (the grader rewards verbosity)** — focus on Defenses 2-4.

**Defense 2 (max_output_tokens — set tight):** Set `max_output_tokens` close to expected output length (see Step 7a-i). Allergen list → 128, compliance verdict → 256. This is a natural constraint — the model can't be verbose if there's no room.

**Defense 3 (grader — penalize verbosity as a quality issue):** Make the grader score "correct but padded" lower than "correct and concise." Two approaches, both valid:
- **Add a conciseness criterion to LLM-as-judge** (recommended for judge-based graders): Include "Penalize responses that pad correct information with unnecessary repetition or explanation" in the judge prompt. Weight it 10-15%. This is the safest approach — semantic evaluation avoids the pitfalls of programmatic length measurement.
- **Soft multiplicative threshold penalty** (acceptable for programmatic graders): No penalty below expected length, then gradual **multiplicative** penalty above it (`score *= (1 - penalty)`). Set threshold from GT P95 word count + 50% headroom. Cap max penalty at 15-25%. **NEVER use additive penalties** (`score -= λ * length`) — GR3 (arXiv:2603.10535) proves these cause "length collapse" for any λ because the length term creates an optimization shortcut independent of task performance.

> **⚠️ DRPO ANTI-PATTERN — CRITICAL (arXiv:2510.04474):** When adding a word-count penalty to a grader, **NEVER apply it uniformly to both correct and wrong answers.** GRPO computes advantages relative to the group mean. If a correct-but-verbose answer gets penalized (e.g., 0.8 × 0.75 = 0.60) and the group includes wrong answers at 0.0-0.10, the penalized correct answer may fall below the group mean — GRPO then assigns it **negative** advantage and actively discourages it. The model learns "verbose + correct is worse than wrong." **Safe patterns:**
> - Apply word-count penalties **only to wrong/partial answers** (correct answers rely on the LLM conciseness criterion)
> - Add a small **brevity bonus** (+0.03-0.05) for correct+concise answers (creates positive gradient toward brevity without risking score inversion)
> - All 6 grader templates already implement this DRPO-safe pattern

> **Research basis**: Dr. GRPO (arXiv:2503.20783) identifies the algorithmic root cause (per-token `1/|o_i|` normalization). DAPO (arXiv:2503.14476) adds overlong filtering + soft punishment at the training level. GR3 (arXiv:2603.10535) proves additive length penalties collapse and endorses multiplicative rescaling. GRPO-LEAD (arXiv:2504.09696) couples length control to task correctness via exponential decay. DRPO (arXiv:2510.04474) proves that uniform length penalties on correct answers can invert their GRPO advantage. OpenAI RFT cookbook documents verbosity as a grader design failure mode and recommends rubric refinement (not explicit penalty terms).

**⚠️ NEVER use programmatic checks (char count, keyword matching) as the primary scoring mechanism.** Programmatic checks are useful for fast guards (empty response, refusal detection, format compliance) but NOT for scoring quality. Use LLM-as-judge for quality assessment — it produces continuous scores that give GRPO smooth gradients. A programmatic check like `response.length > 150 → score 1.0` will produce coarse scores where gpt-4o-mini always gets 1.0 (it always writes long responses).

| Template | Best for | Key criteria |
|----------|----------|-------------|
| `templates/grader-template.js` | General-purpose (default) | accuracy, helpfulness, clarity, completeness, tone |
| `templates/grader-mcq.js` | Multiple-choice / short-answer QA | answer correctness (LLM extraction fallback), reasoning quality, distractor analysis |
| `templates/grader-classification.js` | Label assignment / categorization | label match (exact/partial/wrong), evidence, reasoning quality |
| `templates/grader-extraction.js` | Structured data extraction (10-K metrics, medical coding) | field accuracy, hallucination rate, format compliance |
| `templates/grader-compliance.js` | Rule application (FDA, tax, legal) | rule recall, false positives, citation accuracy |
| `templates/grader-readability.js` | Simplification (contract→English, ELI5) | readability + Flesch-Kincaid, jargon elimination, accuracy preservation |

Copy the closest template, then customize the criteria weights and programmatic checks for your domain.

#### Step 5.1: Mandatory Dry-Run (two tests)

**You MUST dry-run the grader before uploading.** Run TWO tests — a hand-crafted test AND a live test against real model outputs.

**Test 1: Hand-crafted row** — catches syntax errors and basic scoring logic:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID \
  --script grader.js \
  --row '{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "What is X?"}, {"role": "assistant", "content": "X is..."}]}'
```

**Test 2: Live model response (CRITICAL)** — catches graders that work on synthetic inputs but fail on real model outputs. This is the most common grader bug: the grader assumes a specific response format (e.g., "Answer: A") but the model responds differently (e.g., "Based on the guidelines..."):

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID \
  --script grader.js \
  --live
```

The `--live` flag picks 3 random training records, sends each prompt to the LLM, and grades the real responses. If all live samples score 0.0, the grader is broken — fix the extraction/parsing logic to handle real model output formats before proceeding.

**Both tests must pass.** If Test 1 passes but Test 2 scores 0.0, the grader has format assumptions that real models don't satisfy. Fix and re-test. Do NOT proceed to upload until both pass. The sandbox does NOT support `console.log` — use the `reason` field for debug output.

**Test 3: Adversarial robustness (agent thinks through edge cases).** Before uploading, **read your grader code and think about how it handles these adversarial model behaviors** — because GRPO WILL find these if they score higher:

- **Over-prediction**: Model lists all possible answers (e.g., all 9 allergens, all contaminants). Does your grader penalize false positives hard enough, or does high recall + low precision still get a decent score?
- **Under-prediction**: Model says "none" or gives empty/minimal response. Does your grader give 0.0, or does it give partial credit that rewards saying nothing?
- **Length exploitation (MOST COMMON GRPO FAILURE)**: Model generates increasingly verbose responses because longer = more content = higher scores on F1/LLM-judge graders. GRPO reinforces this until completions hit max_output_tokens, causing clipping and training collapse. Check: if a correct 10-word answer and a correct 200-word answer both exist, does the grader score them the same? If yes, the model WILL learn to always write 200 words. Your grader must score "correct and concise" higher than "correct but padded" — see the 4 defenses in Step 5 above. Note: the algorithmic root cause (Dr. GRPO length bias) is already mitigated by the default training config. If length exploitation occurs, it's because the grader rewards verbosity. Also verify max_output_tokens is tight (Step 7a-i).
- **Format gaming**: Model outputs the exact format template without correct content (e.g., "COMPLIANT. Per 40 CFR 141.XX: MCL for [contaminant] is [value]" with placeholders). Does your grader check actual values or just format?
- **Copying the prompt**: Model repeats back the question or system prompt. Does your grader detect this?

For each case, mentally trace through your grader logic. If any adversarial response would score >0.3, the grader has an exploitable weakness that GRPO will find during training. Fix it now — adding a hard gate or penalty is much cheaper than discovering the exploit after a failed training run.

**Test 4: Grader Validation Protocol (3 checks — MANDATORY before training).** These catch grader problems that waste GPU time. Run after Test 1-3 pass, using the dry-run script.

- **Consistency check**: Pick 1 training record. Write 5 paraphrased correct answers (same facts, different wording). Run each through the grader. Score variance should be < ±0.15. If higher, the grader is too sensitive to surface wording — fix the judge prompt to focus on factual content, or use temperature averaging (Noise-Corrected GRPO, arXiv:2510.18924).

- **Discrimination check**: Score 5 clearly correct answers and 5 clearly wrong answers. Mean score difference should be > 0.4 (e.g., correct mean 0.75, wrong mean 0.15 → difference 0.60, OK). If difference < 0.4, the grader can't tell good from bad — GRPO gets almost no useful gradient. Fix criteria.

- **Exploitation check**: Score 3 adversarial responses: (1) correct answer + massive padding/repetition, (2) lists ALL possible answers to maximize recall, (3) copies the question back with minor additions. All should score < 0.4. If any scores > 0.4, add a hard gate or penalty for that pattern.

Log the results: `Consistency: var=X.XX, Discrimination: diff=X.XX, Exploitation: max_adversarial=X.XX`. If any check fails, fix the grader and re-run before proceeding.

See [reference/grader-writing.md](reference/grader-writing.md) "Pre-Training Grader Validation Protocol" for details.

**Upload + verify + checkpoint** — run ALL THREE commands. Do NOT checkpoint the grader without uploading and verifying first. If the verify fails, the upload silently failed — re-run `upload-grader`.

```bash
# 1. Upload
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js

# 2. Verify it landed on gateway (MANDATORY — do not skip)
curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wf = data.get('workflow', data)  # API may return object directly or nested under 'workflow'
evaluator = wf.get('eval_script') or wf.get('evaluator')
if not evaluator or evaluator == 'null' or len(str(evaluator)) < 10:
    print('FATAL: Evaluator NOT on gateway — upload-grader failed')
    sys.exit(1)
print(f'Evaluator verified on gateway: OK ({len(str(evaluator))} chars)')
"

# 3. Only checkpoint AFTER verify passes
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step grader --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

**⚠️ If the verify step prints FATAL, do NOT run the checkpoint.** Re-run `upload-grader` and try again.

### Step 5.5: Final Dataset Validation

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

Checks: valid JSON, required fields, message structure, no assistant messages (RFT), duplicate IDs, record count (minimum 50, recommend 100-200+), and short user messages (< 10 chars). The `--topics` and `--parts` flags cross-reference `topic` and `source_parts` fields against the actual topic hierarchy and parts index — flagging any orphaned references. Fix errors before proceeding.

### Step 5.5b: Data Quality Gate (MANDATORY — do NOT skip)

**⚠️ This step is REQUIRED before evaluation.** Do NOT skip it even if Step 5.5 (validate) passed. `validate_dataset.py` checks format; this gate checks **data quality** — duplicates, diversity, ground truth quality, prompt alignment. Eval costs ~45 min and LLM calls. Training costs hours of GPU time. Fixing data here is 10-100x cheaper than discovering the problem after training.

**Quick gate (free — always run):**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --knowledge-dir finetune-project/knowledge
```

This runs structural, diversity, and **source accuracy** gates — no API calls, instant results. Checks: duplicate IDs, prompt length, ground truth presence/quality, topic balance, near-duplicate detection, semantic diversity, and **whether ground truth numeric values exist in the linked source parts** (catches extraction quality issues like shifted table columns before they cascade into wrong training data).

**Full gate (with LLM scoring — run on first pipeline pass or after regeneration):**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --all-gates \
  --sample 30 \
  --save finetune-project/data-quality-report.json
```

This adds:
- **GT factual verification** (LLM-based) — asks an LLM "is this ground truth factually correct?" for a sample of records. Catches semantic errors like confusing MCL with Treatment Technique, missing allergens in multi-value answers, incorrect domain mappings. Flags records with >20% error rate as FAIL.
- **Ground truth quality** — LLM scores each GT for specificity and completeness.
- **Alignment** — LLM checks if GT actually answers the prompt.

Samples 30 records by default to keep cost low. The GT verification gate is the most important — it catches errors that string matching (source_accuracy) cannot detect.

**Or via `finetune.py`:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py data-quality-gate \
  --file finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --all-gates --save finetune-project/data-quality-report.json
```

**Decision:** Exit 0 = PASS (proceed), exit 1 = FAIL (must fix), exit 2 = WARN (review priorities).

**5 gates**: Structural (free), Diversity (free), Completion Length (free), GT Quality ($), Alignment ($). See [reference/data-quality-gate.md](reference/data-quality-gate.md) for gate details, thresholds, common failure patterns, and research citations.

**Step 5.5c: GT Self-Consistency Check (MANDATORY — agent performs this directly)**

After the automated gates pass, **read records from every topic** and check: does each GT contradict itself? Specifically:
- Does the **conclusion** (verdict, answer, classification) match the **evidence** (numbers, reasoning, citations) in the same GT?
- Examples of contradictions: "COMPLIANT" but explanation says "exceeds the limit"; answer says "none" but explanation lists an item; classification says "positive" but reasoning says "no evidence found."
- If >10% of sampled records have internal contradictions, **stop and fix the records** before proceeding. Contradictory GTs corrupt training — the model can't learn consistent behavior from inconsistent examples.

This check catches issues that automated gates miss because it requires understanding the relationship between different parts of the same GT.

**Checkpoint** after data quality gate passes:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step data-quality-gate --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

> See [reference/data-quality-gate.md](reference/data-quality-gate.md) for threshold details and research citations.

### Step 6: Verify & Hand Off

Since each step uploaded data immediately, the gateway already has the full workflow. Verify everything landed correctly before handing off to the UI.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

**Expected**: All counts > 0 and evaluator = YES. If any are missing, re-run the upload for that step.

**Checkpoint** after verify:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step validate --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

Tell the user the data is visible at `http://localhost:5173/finetune`, then **proceed immediately to Step 7** (evaluation).

### Step 7: Evaluate & Validate Before Training

**Eval first, train later.** Eval is fast (~45 min) and cheap. Training is slow (hours) and expensive. Run eval iterations to validate data quality, grader correctness, and score distribution BEFORE committing to training.

| Phase | What runs | What it answers | Duration | Cost |
|-------|-----------|----------------|----------|------|
| **Eval iterations** | Base model + your data + your grader | Is my data good? Grader fair? Score spread? | ~45 min/iter | Low |
| **Training** | Finetuned model with GRPO | Is the model learning? Hyperparams right? | Hours | High |

**The flow:**
```
Eval → Readiness Gate → [FAIL] → Fix data/grader → Re-eval → ... → [PASS] → Train
```
**Max 5 eval-only iterations** before training. If readiness gate never passes, escalate to user.

#### 7a. Pre-training validation (RFT-specific — do NOT skip)

**⚠️ These checks are specific to RFT/GRPO training.** GRPO learns by comparing multiple completions per prompt — if all completions score the same, the gradient is zero and the model learns nothing. Validate BEFORE committing to an expensive training run.

**7a-i. Set max_output_tokens using the data quality gate (MANDATORY).**

**⚠️ Do NOT default to 512 or 1024.** Set max_output_tokens based on ACTUAL expected output length:
- Allergen list (3-15 tokens) → **128**
- Compliance verdict (30-60 tokens) → **256**
- Short answer (50-100 tokens) → **256-512**
- Explanation/reasoning (200+ tokens) → **512-1024**

**Too high = length exploitation.** If expected output is 15 tokens but max_output_tokens is 512, GRPO has 500 tokens of "room" to pad. The model WILL fill it because longer responses often score better on F1/LLM-judge graders. Setting max_output_tokens close to expected length acts as a natural length constraint — the model can't be verbose if there's no room.

**Too low = truncation.** If the model can't finish its response, the grader scores garbage.

**Run the completion_length gate BEFORE training and apply its `recommended_min`:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py training.jsonl \
  --gate completion_length --max-output-tokens 512 --json
```
If the gate returns a `recommended_min` value, **use it** as `max_output_tokens` in training config. The gate estimates required length from ground truth token lengths × task complexity multiplier, with 30% headroom above P95 (heuristic inspired by DAPO's overlong handling, arXiv:2503.14476 — not a direct DAPO parameter).

**Do NOT skip this step.** Training with insufficient `max_output_tokens` causes 100% completion truncation — the grader scores incomplete responses, producing noise instead of gradient signal. This can waste 9-13+ hours of GPU time. Higher `max_output_tokens` increases cost per step (8 completions × N tokens each), but truncated training is far more expensive (all compute wasted).

**7a-ii. Validate grader score distribution (CRITICAL for GRPO).**
Dry-run the grader on 3-5 sample records with varying quality responses. Scores should spread across 0.2-0.9 — if all cluster at one value, GRPO gets zero gradient. See [reference/grader-writing.md](reference/grader-writing.md) for scoring patterns and red flags.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role":"system","content":"..."}, {"role":"user","content":"..."}, {"role":"assistant","content":"Good detailed response..."}]}'
```

**7a-iii. Create a validation set (80/20 split) for reward hacking detection.**
Split `training.jsonl` locally — train on 80%, keep 20% for post-training validation. After training, if `train_reward_mean` is high but validation performance is poor → reward hacking.

#### 7b. Create eval job (eval-only — NO training yet)

**⚠️ Before creating eval, verify records exist on the gateway:**
```bash
RECORD_COUNT=$(curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))")
echo "Records on gateway: $RECORD_COUNT"
if [ "$RECORD_COUNT" -lt 1 ]; then
  echo "ERROR: No records on gateway — upload records first (Step 4)"
  exit 1
fi
```

Create eval job only — do NOT create a training job yet:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations
```

> **Note on eval IDs**: The `POST /finetune/evaluations` response returns `evaluation_run_id` — use this for polling. The workflow's `eval_job_ids` field may show a different internal ID that returns 404. Always use the ID from the create response.

**Poll eval in foreground** (diagnose-first early cancel):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval \
  --file evaluations/eval-001.json
```

The poller monitors partial scores and triggers a **diagnose-then-decide** check if either:
- **avg score < 0.05** after 20 rows — grader may be scoring zero on everything
- **>30% of scores are 0.0** after 20 rows — grader may not be able to parse model responses
- **>50% of scores are 1.0** after 20 rows — warns that grader may be too lenient (does NOT cancel)

When triggered, the poller **diagnoses before deciding**:
1. Classifies zero-score reasons: parsing failures vs wrong answers vs refusals
2. **If grader is broken** (mostly parsing failures) → cancels eval, prints fix → exit code 2
3. **If zeros are legitimate** (mostly wrong answers + score variance exists) → **continues polling** — base models scoring 0 on 15-50% of prompts is normal (DeepSeek R1-Zero, arXiv:2501.12948)

This means the poller never wastes an eval on a false alarm, and never lets a broken grader run to completion.

**If the eval IS cancelled** (exit code 2), the output tells you exactly what to fix. Apply that fix before creating a new eval. Use `--no-early-cancel` to disable.

When eval completes, **immediately log the iteration** before doing anything else:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project \
  --eval-file evaluations/eval-NNN.json \
  --changes "describe what changed since last eval" \
  --change-type baseline|grader|records \
  --verdict PENDING
```

> **⚠️ This is MANDATORY — do NOT skip.** Log every eval, even cancelled ones. The iteration tracker is how you (and future runs) know what was tried and what worked. Update the verdict to PASS/FAIL after the readiness check. If you don't log iterations, you lose track of what changed and can't tell if fixes helped or regressed.

Then proceed to **Step 7c (Readiness Gate)** — do NOT start training.

#### 7c. Pre-Training Readiness Gate

After eval completes, check if data and grader are ready for training:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file evaluations/eval-001.json
```

The readiness gate runs **4 hard checks** (sample_count, score_std, avg_score, zero_score_frac < 10%) and **soft checks** (quality signals). Hard checks ask "is the grader working?", NOT "is the base model good?" — GRPO can learn from low base model scores (DeepSeek R1-Zero: 15.6% → 71%). `score_concentration` is dynamically hard (> 85% in one bucket) or soft.

**Hard checks** (must ALL pass): sample count >= 50, score std > 0.10, average score > 0.05, **zero-score fraction < 10%**.

> **Two different zero-score thresholds** — don't confuse them:
> - **Readiness gate** (`readiness-check`): `zero_score_frac < 10%` — "is the data quality good enough to train?" Stricter because zeros produce zero GRPO gradient.
> - **Early-cancel** (`poll-eval`): `zero_rate > 30%` — "is the grader completely broken?" More lenient because base models legitimately score 0 on 15-50% of prompts.
>
> The readiness gate's 10% threshold matches the UI (`compute-readiness-gate.ts`). If readiness fails on `zero_score_frac`, improve the grader to give partial credit for wrong-but-informed answers instead of flat 0.0.

**Decision:**
- **Exit code 0 (PASS)** → proceed to **Step 7e (Start Training)**
- **Exit code 1 (FAIL)** → fix issues → return to **Step 7b (Re-eval)**
- **Exit code 2 (WARN)** → **first eval: fix ALL warnings before training. Subsequent evals: only fix critical warnings.**

**⚠️ First eval rule:** On the FIRST evaluation (no previous training has run), treat ALL soft warnings as must-fix — this is your one chance to validate grader design before hours of GPU time. Subsequent evals: only fix `score_concentration` > 70%. If non-interactive: auto-fix `score_concentration` > 70% and `perfect_score_frac` > 50% on first eval.

**Max 5 eval-only iterations.** If readiness gate never passes after 5 evals, escalate to user with diagnosis.

**After every readiness check**, log the iteration so changes and results are tracked:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project \
  --eval-file evaluations/eval-001.json \
  --changes "Initial eval with default grader" \
  --change-type baseline \
  --verdict FAIL
```

This creates `finetune-project/iterations.json` with structured metrics per iteration. On subsequent iterations, it prints a **delta comparison** showing what improved/regressed:
```
=== Iteration 2 vs 1 ===
Changes: [grader] Added partial credit for wrong answers (0.01-0.05)

  avg_score           : 0.4052 → 0.4033 (↓ 0.0019) =
  zero_rate           : 39.7%  → 8.9%   (↓ 30.8%)  ✓
  perfect_rate        : 20.9%  → 20.6%  (↓  0.3%)  =
  distinct_buckets    : 7      → 9      (↑ 2)       ✓

  Readiness: PASS
```

**Read `iterations.json` before making changes** — check if the previous change helped before piling on more fixes. If a change made things worse, revert it.

> See [reference/readiness-gate.md](reference/readiness-gate.md) for the full check tables, which warnings must be fixed vs safe to train through, WARN safety guide, and research citations.

#### 7c+. Difficulty Probe (after readiness gate passes, before training)

**⚠️ Run this after the readiness gate passes and before starting training.** Checks **per-prompt signal strength** — catches data that looks good in aggregate but produces zero gradient at the prompt level.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py difficulty-probe \
  --file evaluations/eval-001.json \
  --save finetune-project/difficulty-report.json
```

**Decision:** Exit 0 = PASS (>= 30% learnable, proceed to training), exit 1 = FAIL (< 15% learnable, fix first), exit 2 = WARN (15-30%, review recommendations).

> See [reference/readiness-gate.md](reference/readiness-gate.md) for difficulty probe details, fix recommendations, and research citations.

**Checkpoint** after difficulty probe passes:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step difficulty-probe --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

#### 7d. Base Model Baseline Eval (after readiness passes, before training)

**Default to Qwen3.5-4B.** The 4B model is the recommended starting point for all tasks. Do NOT try to predict base model performance from GPT-4o-mini eval scores — they are different models with different capabilities and do not correlate reliably on specific tasks. (Ref: emergent abilities research, arXiv:2206.07682 — capabilities appear at different scale thresholds per model family.)

**Run the baseline eval** on Qwen3.5-4B:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID \
  --model "Qwen3.5-4B" \
  --output-dir finetune-project/evaluations

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval \
  --file finetune-project/evaluations/eval-NNN.json
```

**Why this matters:**
- GPT-4o-mini eval avg=0.85 does NOT mean Qwen-4B will score 0.85 — base models typically score much lower
- The base model baseline is the "before" in before/after comparison
- Without it, you can't measure if training actually improved the model

**Do NOT run the readiness gate on this eval.** The base model may fail readiness checks — that's expected. Just log the baseline.

**⚠️ CRITICAL: Analyze the base model score before proceeding to training.**

| Base model avg score | What it means | Action |
|---------------------|---------------|--------|
| **< 0.10** | Model can't do the task at all | ✓ Ideal for GRPO — maximum room to improve. Proceed. (DeepSeek-R1: 15.6%→71%, arXiv:2501.12948) |
| **0.10 - 0.50** | Model has some knowledge but struggles | ✓ Good for GRPO — strong learning signal expected. Proceed. |
| **0.50 - 0.75** | Model is mediocre to decent | ✓ GRPO can improve this. Proceed. |
| **0.75 - 0.85** | Model is already good | ⚠️ **GRPO efficiency drops dramatically.** "Hard Examples Are All You Need" (arXiv:2508.14094) found easy prompts (>0.80 success rate) maintain learnable variance for only 3.7% of training steps — 96.3% of compute is wasted. Improvement IS possible but typically small (2-7%, e.g., AlphaMaze: 86%→93%, arXiv:2502.14669). Consider: (1) **Make the grader stricter** — add criteria so base model scores lower, creating more headroom. (2) **Proceed but set expectations** — improvement will be marginal. (3) **Don't train** if the base model already meets requirements. |
| **> 0.85** | Model already excels | ⚠️ **GRPO will produce near-zero improvement for most prompts.** Options: (1) **Don't train** — base model may be good enough. (2) **Make grader much stricter** to create artificial headroom. (3) **Report to user** — the task may not benefit from GRPO training at this model size. |

**Why this happens**: GRPO computes advantages by contrasting K completions per prompt. When the base model scores high, all completions score similarly → advantage ≈ 0 → no gradient. With continuous graders, even nonzero variance produces tiny advantages that drive negligible learning.

**Research basis**: DeepSeek-R1 (arXiv:2501.12948) started at 15.6% and reached 71% — canonical GRPO success from a low base. "Hard Examples" (arXiv:2508.14094): easy prompts yield 3.49% improvement vs 34.19% for hard prompts — a 10x difference. AlphaMaze (arXiv:2502.14669): GRPO improved 86%→93% — proving improvement IS possible from high baselines, just small.

**Note**: The "use a smaller base model" strategy is NOT well supported — DeepSeek found distillation from larger models outperforms direct RL on smaller models (arXiv:2501.12948 §4). Consider distillation instead if you need a smaller model.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project \
  --eval-file finetune-project/evaluations/eval-NNN.json \
  --changes "Base model (Qwen3.5-4B) baseline eval — pre-training" \
  --change-type baseline --verdict PASS
```

After training completes, run another eval on the **trained** model and compare with this baseline using `log-iteration`.

#### 7e. Start Training (only after readiness gate passes)

Training starts here — only reached when the readiness gate indicates data and grader are solid.

**Base model**: Default to **Qwen3.5-4B**. Only change after the base model eval (Step 7d) gives a concrete reason to.

| Model | When to use | Max records (K=8) | OOM risk |
|-------|-------------|-------------------|----------|
| `Qwen3.5-0.8B` | Only after 4B training showed no improvement AND you want to test if a smaller model learns better on this narrow task | ~1000 | Very low |
| `Qwen3.5-2B` | After 4B training showed no improvement, as intermediate test | ~800 | Low |
| `Qwen3.5-4B` | **Always start here.** Best balance of capacity and speed. | ~500 | Low |
| `Qwen3.5-9B` | Only if 4B training plateaued and task requires complex reasoning | ~100 | High with >100 records |

> **⚠️ Start with 4B.** The 9B model OOMs with >100 records and K=8 on standard GPU allocations. Use 9B only for small, complex datasets (<100 records). Use 0.8B/2B for quick prototyping or when training keeps failing on larger models. The `create-training` script warns if the model/dataset combination risks OOM.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "Qwen3.5-4B" \
  --output-model "project-v1" \
  --output-dir training-jobs

# To override defaults (e.g., after diagnosing issues from previous iterations):
# uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
#   --workflow-id $WORKFLOW_ID \
#   --base-model "Qwen3.5-4B" \
#   --output-model "project-v2" \
#   --config '{"learning_rate": 0.0000005, "epochs": 5, "lora_rank": 16}' \
#   --inference-params '{"response_candidates_count": 16, "max_output_tokens": 1024}' \
#   --output-dir training-jobs
```

**GRPO training defaults** (research-validated — see `reference/analysis-strategy.md` Part 6):

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `learning_rate` | **5e-6** | Between DeepSeek-R1's 3e-6 (arXiv:2501.12948) and gateway default 1e-5. Food-label E2E test showed 1e-6 too slow to converge. Do NOT use SFT rates (2e-5 to 5e-5). |
| `response_candidates_count` | **8** (minimum) | GRPO needs multiple candidates for advantage estimation. Published work uses G=8 (Dr. GRPO, TRL) to G=64 (DeepSeekMath). |
| `warmup_ratio` | **configurable** | Uses `warmup_ratio` (not `warmup_steps`). The cloud applies cosine LR scheduler — LR decays after warmup, not constant. |

> **Actual cloud training config** (set by the cloud worker, not user-configurable):
>
> | Parameter | Value | What it does |
> |-----------|-------|-------------|
> | `loss_type` | `"dr_grpo"` | Removes per-token `1/|o_i|` normalization — eliminates algorithmic length bias (Dr. GRPO, arXiv:2503.20783) |
> | `mask_truncated_completions` | `True` | Truncated completions contribute zero gradient (DAPO, arXiv:2503.14476). Prevents NaN from all-truncated batches — but see `max_output_tokens` sizing |
> | `repetition_penalty` | `1.1` | Generation-time penalty against repetitive tokens — discourages padding via repetition |
> | `importance_sampling_level` | `"sequence"` | Sequence-level importance sampling (GSPO/Qwen approach) |
> | `epsilon` / `epsilon_high` | `3e-4` / `4e-4` | Tight asymmetric clipping — very conservative policy updates per step |
> | `lr_scheduler_type` | `"cosine"` | Cosine annealing after warmup — LR decays through training |
> | `optim` | `"adamw_8bit"` | 8-bit AdamW for VRAM savings |
> | `max_grad_norm` | `1.0` | Gradient clipping — prevents explosion |
> | `weight_decay` | `0.01` | Standard regularization |
>
> **Implications for analysis**: (1) If length exploitation occurs, it's grader-side, not algorithmic — fix the grader. (2) The tight epsilon values mean `clip_ratio` should stay very low; high `clip_ratio` is a stronger signal than usual. (3) Cosine LR means reward may plateau in late training as LR approaches zero — this is expected, not a bug. (4) `mask_truncated_completions=True` means truncated completions are excluded from loss — if `clipped_ratio` is high, those samples are wasted compute.

> **⚠️ RFT epochs ≠ SFT epochs.** In RFT/GRPO, the model generates **fresh responses each epoch** — there's no repetition risk. More epochs = more exploration. Published work uses high epoch counts: "Tricks or Traps" uses 50 epochs; OpenAI says RFT does "hundreds or thousands of epochs." Start conservatively and increase if reward is still improving.

> **Adaptive epochs:** `finetune.py` automatically adjusts epochs based on dataset size when using defaults (no `--config`). The script fetches the record count from the workflow and applies the table below. Override with `--config '{"epochs": N}'` if needed.

| Situation | Adjustment |
|-----------|------------|
| < 50 records | `epochs: 15` (small dataset needs more passes — OpenAI: "hundreds of epochs over the same few data points") |
| 50-200 records | `epochs: 8` |
| 200-500 records | `epochs: 5` |
| > 500 records | `epochs: 3` (DeepSeek-R1 used ~50k records with ~2 epochs) |
| Complex task | `lora_rank: 16` |
| High KL but training otherwise healthy | **Do NOT lower LR just for KL.** With β=0 (our backend default), KL divergence values are un-normalized and purely informational. Do NOT use KL values to make training decisions. |
| Unstable training (NaN loss, reward collapse) | Lower `learning_rate` to 1e-6. Check for 100% completion truncation first. |

#### 7f. Monitor training

**Spawn training monitor.** Delegate to the `training-monitor` subagent (`.claude/agents/training-monitor.md`) — provide `GATEWAY_URL=http://localhost:9090`, `WORKFLOW_ID`, `JOB_ID` (from the training job file), and `OUTPUT_DIR=training-jobs`. The subagent launches a detached Python script that runs autonomously.

**Poll training in foreground:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training-jobs/train-001.json \
  --max-wait 7200
```

> **⚠️ NEVER use `sleep 300` or `sleep 600` in a Bash tool call to wait for training.** Always use `poll-training`.

**Early stopping** is enabled by default — detects completion clipping, score plateau, score degradation, and length exploitation. Add `--no-early-stop` to disable. See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) for signal details and thresholds.

When training completes (or is early-stopped), **immediately log the training iteration** before doing anything else:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --phase training \
  --training-file training-jobs/train-NNN.json \
  --changes "Training run: lr=5e-6, epochs=8, K=8, base=Qwen3.5-4B" \
  --change-type baseline --verdict PASS
```

> **⚠️ MANDATORY — do NOT skip.** This captures the training config, reward trajectory, KL, clipping ratio, and early-stop reason into `iterations.json`. Without this, you cannot compare training runs during iteration (Step 9b). If training was early-stopped, note the reason in `--changes` and set `--verdict WARN`. If training failed, set `--verdict FAIL`.

If early-stopped, the best checkpoint is noted in the output — use that epoch's model. Proceed to **Step 8b (Post-Training Eval)**.

### Step 8: Analyze Results

**Before analyzing, sync jobs** to catch status changes from the UI:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project
```

**Handle cancelled jobs**: Skip analysis for cancelled jobs. Log it in execution-log.md. If ALL jobs were cancelled, proceed to Step 9.

> **Read [reference/analysis-strategy.md](reference/analysis-strategy.md)** for decision trees and presentation format.
> **Read [reference/training-metrics-guide.md](reference/training-metrics-guide.md)** for GRPO metric interpretation.

#### 8a. Analyze eval results (after each eval — before training)

This runs during the eval-first loop (Step 7b→7c). Compute overall scores, per-topic breakdown (weakest first), low-scoring record reasons, and score concentration. Low topic scores are expected for base models — focus on whether the grader differentiates quality, not absolute scores. See [reference/analysis-strategy.md](reference/analysis-strategy.md) Part 1a for the full metrics table and formulas.

**8a-agent. Read the actual model responses yourself.** After computing scores, **read the eval results thoroughly** — all low-scoring records, a sample of mid-range, and some high-scoring records across every topic. The eval result contains the grader's `reason` field which includes the parsed model output. Check:

- **Low-scoring records**: Read both the model's response AND the grader's reason. Is the model's response a reasonable attempt that the grader scored harshly, or genuinely bad? Does the reason explain the score correctly? If the reason says "parsing failed" or "could not extract" → grader bug (can't parse the response format). If the reason says "wrong answer" but the response looks correct → grader logic bug.
- **High-scoring records**: Read the reason — what criteria did the grader use? Is the model genuinely good, or is the grader too lenient? If the reason just says "matches" without checking important criteria → grader needs more checks.
- **Reason patterns**: Do many records share the same reason text? (e.g., 30 records all say "Model said 'none'" or all say "F1=0.10, R=1.00, FP=8") → systematic issue. The reason tells you the exact failure mode — use it to decide whether to fix the grader, the records, or the prompts.
- **Response patterns**: Are many model outputs identical? (e.g., always says "none", always lists all options, always gives the same template) → dominant strategy that may exploit the grader.
- **Format compliance**: Does the model follow the output format from the system prompt? If not, does the reason show the grader handled it (e.g., LLM fallback extraction) or failed?

The reason field is the most diagnostic — it tells you exactly what the grader checked and why it gave the score it did.

**8a-research. Reason through unexpected patterns — don't just report numbers.** When eval scores are surprising (too high, too low, or clustered), think through why:
- "Why would the model give this response?" — Consider what the model knows from its system prompt and training data. Is the prompt clear enough?
- "Why would the grader give this score?" — Trace through the grader logic with the actual response. Is the grader testing what matters?
- "What would GRPO learn from this score distribution?" — If 64% score 1.0 and 17% score 0.0, GRPO gets strong signal from the 0→1 boundary but nothing from the 1.0 records. Is that what we want?

This reasoning often reveals the fix before training even starts.

**Then run the readiness gate** (Step 7c) to decide: fix + re-eval, or proceed to training.

#### 8a+. Filter Dead-Weight Records & Regenerate Replacements

**Why this matters:** GRPO **cannot learn from negative-only rewards**. When every sampled response scores 0, the gradient is zero. Dead-weight records destabilize training.

**After eval completes:**
1. Find records where max score < 0.1 — these are dead weight
2. Diagnose WHY (grader hard gate? wrong premise? model too weak?)
3. Remove dead-weight records from `training.jsonl`
4. Regenerate replacements if needed (`generate_records.py --append`)
5. Re-validate and re-upload with `--force`:
   ```bash
   uv run ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl --topics finetune-project/topics.json
   uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl
   ```

**When to skip regeneration:** If only 1-2 records out of 200+ scored 0, removing without replacement is fine.

#### 8b. Post-Training Eval (compare with baseline)

After training completes, run an eval on the **trained model** to measure improvement.

**Resuming a partially-completed flow:** If you're restarting and find training completed but no post-training eval result exists (eval was cancelled, failed, or never created), you MUST create a new eval on the trained model before proceeding. Check `iterations.json` and the evaluations folder — if there's no completed eval on the trained model (the model name will be the job ID or the `fine_tuned_model` from the training job status), create one now. Do NOT skip this step or jump to iteration/retraining.

**Get the trained model name** from the training job file: read `training-jobs/train-NNN.json` → field `fine_tuned_model` (or `provider_job_id` if `fine_tuned_model` is null — some providers use the job ID as the model name).

```bash
# Eval on the trained model
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID \
  --model "TRAINED_MODEL_NAME" \
  --output-dir finetune-project/evaluations

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval \
  --file finetune-project/evaluations/eval-NNN.json

# Log and compare with base model baseline (Step 7d)
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project \
  --eval-file finetune-project/evaluations/eval-NNN.json \
  --changes "Post-training eval on trained model" \
  --change-type baseline --verdict PASS
```

**Read the post-training eval responses** — apply the same 8a-agent analysis to this eval. Compare the trained model's responses with the base model's responses (from Step 7d eval). What changed? Is the trained model better, or did it learn an exploit? This comparison is more valuable than the score delta alone.

The `log-iteration` delta will show the improvement. Interpret the result:

| Improvement (Δ) | Verdict | Action |
|-----------------|---------|--------|
| **> +0.15** | ✓ Strong improvement | Deploy. GRPO worked well. |
| **+0.05 to +0.15** | ~ Moderate improvement | Deploy if acceptable. Consider more epochs or harder data for next iteration. |
| **+0.02 to +0.05** | ⚠ Marginal improvement | Check: was base model already >0.75? If so, this is expected — GRPO has limited headroom (arXiv:2508.14094: only 3.7% of steps learnable for easy prompts). Deploy if acceptable, or make grader stricter for next iteration. |
| **-0.02 to +0.02** | ⚠ No meaningful improvement | Training didn't help. Likely cause: base model already too good (>0.75) or grader not differentiating. See Step 7d guidance. |
| **< -0.02** | ❌ Regression | Training made the model worse. Deploy the base model, not the trained one. **But first**: run Step 8c analysis to understand WHY — if there's an exploitable grader pattern, fix the grader and retrain (don't just give up). |

**⚠️ MANDATORY CHECKPOINT — answer these before proceeding:**

```
1. What was the base model eval score (Step 7d)?          → ___
2. What is the trained model eval score (Step 8b)?        → ___
3. Improvement (Δ = trained - base):                      → ___
4. Was base model score > 0.75?                           → yes/no
5. Run Step 8c (analyze_training.py) BEFORE deciding.     → Done? yes/no
6. Did Step 8c find epoch-level patterns?                 → yes/no
   (epoch_collapse, over_prediction, output_collapse)
7. Decision — use the FIRST matching rule:
   a) If Step 8c found exploitable grader pattern (over_prediction, output_collapse)
      → FIX GRADER FIRST (return to Step 5, fix the exploit), then retrain.
        Do NOT accept the base model when there's a fixable grader issue — the
        regression means the grader has a weakness GRPO found, not that training
        can't help. Fixing the grader closes the exploit.
   b) If Step 8c found epoch_collapse but no grader exploit
      → RETRY with fewer epochs (stop before the collapse epoch), same grader.
   c) If Step 8c found no patterns AND base model > 0.75 AND Δ < 0.05
      → ACCEPT base model (already good enough) or make grader stricter.
   d) If none of the above apply
      → REPORT to user with full analysis from Step 8c.
8. Log the post-training analysis decision (training metrics already logged in Step 7f):
   uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
     --project-dir finetune-project --phase eval \
     --eval-file evaluations/eval-NNN.json \
     --changes "Post-training analysis: Δ=___, decision: ___" \
     --change-type baseline --verdict ___
```

**Do NOT start another training job without completing this checkpoint.** If you decide to try a smaller model (option c), run a base model eval on it first:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-0.8B" --output-dir finetune-project/evaluations
```
If the smaller model scores <0.50, proceed with GRPO training on it. If it also scores >0.75, the task is fundamentally easy — accept the base model and report to the user that GRPO training is unlikely to help.

#### 8c. Analyze training metrics (after Step 8b)

Run this **after** the post-training eval (Step 8b) so you can cross-reference training health with eval scores:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
  --workflow-id $WORKFLOW_ID --job-id $JOB_ID --save
```

Or from saved files: `--metrics-file training-jobs/$JOB_ID-metrics.json --epoch-evals-file training-jobs/$JOB_ID-epoch-evals.json`

The script computes:
- **Reward trend** — improving/flat/declining based on first→last delta (Ref: DeepSeekMath §3.2)
- **Clipping ratio** — completion truncation rate, trend detection (empirical thresholds: healthy <0.1, critical >0.5)
- **Signal strength** — reward_std (diversity between completions) and frac_reward_zero_std (wasted prompts). Zero-std alerts are conditional on reward being flat — 30-99% zero-std is normal in GRPO when reward is still improving (Ref: arXiv:2509.21880)
- **Reward hacking detection** — reward improving but reward_std collapsing 50%+ (heuristic: diversity collapse suggests model found exploitable pattern)
- **NaN/catastrophic detection** — loss or grad_norm NaN/Inf, loss stuck at zero
- **Per-topic trajectories** — from epoch evaluations, shows which topics improved/stagnated/degraded
- **Top regressions & improvements** — the 5 records with the biggest score drops and gains, including their input, model output, and grader reason. Regressions tell you what training broke; improvements tell you what's working.

> **Note on loss, KL, grad_norm**: Our backend reports un-normalized values that oscillate by 6 orders of magnitude step-to-step. The script only flags NaN/Inf and stuck-at-zero for these metrics. For training health, rely on **reward metrics** which are on the correct 0-1 grader scale.

Exits with code 1 if critical alerts found.

**Per-record epoch analysis — what to look for:** Read the top regressions carefully. The grader `reason` field is the most diagnostic — it tells you exactly WHY the score dropped. Common patterns:

| Pattern in top regressions | What it means | Fix |
|---------------------------|--------------|-----|
| High recall (R=1.00) but low precision (P=0.1-0.2), many false positives (FP=5-8) | **Over-prediction exploit**: model learned "list everything" to maximize recall. GRPO found this is easier than being precise. | Add hard penalty for false positives in grader (not just F1). Reduce epochs — check trajectories, the collapse often happens at a specific epoch (e.g., fine through epoch 3, crashed at epoch 4). |
| All regressed records have identical or near-identical outputs | **Collapsed to single strategy**: model converged on one response pattern regardless of input. | Grader has exploitable shortcut. Inspect what the repeated output is, then penalize it explicitly. Reduce epochs. |
| Scores fine through epoch N, then sudden crash at epoch N+1 | **Overfitting cliff**: model overfit to training distribution and lost generalization. | Use fewer epochs (stop at epoch N). This is the most common fix — many tasks need 2-3 epochs, not 5. |
| Regressed records are all single-answer prompts, improved records are multi-answer | **Asymmetric reward**: grader rewards complex outputs more (more things to match → more partial credit). Model learns to always give complex answers. | Normalize grader scores so single-answer and multi-answer prompts have similar score distributions. |
| Format penalty dominates the reason (e.g., "Format penalty: -0.25 (94 words)") | **Length exploitation then penalty**: model generates longer outputs to include more content but gets penalized for format. Conflicting signals. | Simplify format requirements, or make format checking binary (pass/fail) instead of a penalty scale. |
| Trajectories oscillate wildly per record (e.g., [1.0, 0.4, 1.0, 0.2, 0.8]) | **Grader instability**: grader gives different scores for similar outputs. Training signal is noisy. | Inspect grader — is it using regex that's sensitive to minor formatting? Is it an LLM-judge with high variance? Make grader more deterministic. |

> These patterns are from observed training runs, not paper-backed. They are diagnostic heuristics — always verify by reading the actual model outputs.

**8c-agent. Read the epoch records yourself.** After running the script, **read the epoch evaluation data thoroughly** — all records the script flagged (regressions, improvements), plus samples from stagnant records and each topic. For each:

- **Compare the model's response across epochs**: Read `rollout_content` at epoch 0 vs the last epoch. How did the response change? Did it get longer/shorter? More/less specific? Did it switch from correct to incorrect, or from one wrong pattern to another?
- **Read the grader reason at each epoch**: Does the reason explain why the score changed? Look for patterns like "R=1.00 P=0.11 FP=8" (over-prediction), "parsing failed" (format drift), or "Model said 'none'" (under-prediction). The reason tells you exactly what the grader saw.
- **Cross-reference regressions with improvements**: Are the records that improved the opposite pattern of those that regressed? (e.g., regressions are single-answer prompts that the model now over-predicts, improvements are multi-answer prompts that benefit from over-prediction) → this reveals the exploit strategy.
- **Check the collapse epoch**: If the script reported `epoch_collapse`, read 5 records at the collapse boundary. What changed in the model's behavior between epoch N-1 (good) and epoch N (bad)?

This is the most diagnostic step in the entire analysis. Score numbers tell you "something went wrong." Reading the actual responses tells you "the model started listing all 9 allergens at epoch 4" — which directly tells you the fix (add FP penalty, reduce epochs).

**8c-research. Reason through the problem — don't just match patterns.** The diagnosis tables below are starting points, not answers. When you see unexpected metrics or epoch behavior, **think through it like a researcher**:

1. **Observe**: What exactly happened? State the facts from the data — scores, trajectories, model outputs, grader reasons. No interpretation yet.

2. **Hypothesize**: What could cause this? Generate 2-3 possible explanations. Think about what GRPO is actually doing — it generates K completions, scores them, and reinforces the better ones. Ask yourself:
   - "What strategy would maximize the grader score with minimal effort?"
   - "If I were the model, what shortcut would I learn from this grader?"
   - "Which records give the strongest gradient signal, and what do they teach?"

3. **Verify**: Test each hypothesis against the data. Read specific records that should confirm or reject each hypothesis. For example:
   - If you hypothesize "model learned to over-predict" → check: do high-scoring records have more items in the output? Do low-scoring records have fewer?
   - If you hypothesize "grader is too lenient on topic X" → check: read the grader reason for high-scoring records in topic X — is the grader actually checking quality?
   - If you hypothesize "epoch collapse from overfitting" → check: read the same record at epoch N-1 (good) and epoch N (bad) — did the output quality actually change, or did the grader become inconsistent?

4. **Root cause**: Which hypothesis survived verification? The root cause is always one of three things:
   - **Grader weakness** — the grader rewards a shortcut the model found. Fix the grader.
   - **Data issue** — records are wrong, contradictory, or too homogeneous. Fix the records.
   - **Training config** — too many epochs, wrong LR, insufficient max_output_tokens. Fix the config.

5. **Fix and predict**: Before implementing the fix, predict what will change. "If I add a false-positive penalty to the grader, the over-prediction strategy will score lower, forcing the model to be more precise." If you can't predict the effect, you don't understand the root cause yet — go back to step 3.

**Don't just follow the table below.** Use it as a starting point, then reason through the specific situation. Every task is different — the table can't cover every case.

**Training metrics → diagnosis (starting points):** Cross-reference the script output with post-training eval scores (Step 8b). The following signals may indicate data or grader fixes are needed — not just hyperparams.

> **Disclaimer**: These are heuristics inferred from GRPO mechanics, not paper-backed rules. Always investigate the specific cause before acting.

| Training metric signal | Possible causes (check in order) | Fix |
|----------------------|--------------------------------|-----|
| Per-topic: some topics **stagnant** while others improve | **1) Topic already saturated** — base model scores >0.8 on that topic (check Step 7d per-topic scores). No headroom for GRPO. **2) Records too vague or GTs incorrect** — zero-variance from all-wrong or all-right. | 1) Make grader stricter for that topic, or accept base model performance. 2) `filter-records` + `generate_records.py --append` to regenerate. |
| Per-topic: some topics **degraded** | **1) Grader criteria inconsistency** — grader rewards behavior in topic A that it penalizes in topic B. This is the most likely cause (Ref: MO-GRPO, arXiv:2509.22047 — high-variance objectives dominate gradient). **2) System prompt conflict** — less likely, only matters if prompts directly contradict what grader rewards. | 1) Review grader rubric — ensure criteria are compatible across all topics. Check reward_std per-topic if available: high-variance topics dominate. 2) Review system prompts for direct contradictions. |
| `frac_reward_zero_std` high + reward flat | **1) Easy-saturation** — per-topic base scores >0.8, all completions score similarly. **2) Hard-impossible** — per-topic base scores ~0, base model can't bootstrap. **3) Insufficient epochs** — training hasn't converged yet. | 1) Make grader stricter to create headroom. Do NOT just remove easy records — arXiv:2509.21880 shows they can still provide signal. 2) Larger base model, or simplify prompts. 3) Run more epochs before concluding data is the problem. |
| `reward_std` near zero + grader verified OK | **1) Model saturation** — if mean reward ~1.0, the model has learned the task. This is success, not a problem. **2) Task is narrow** — legitimate ceiling. **3) Prompts lack diversity** — all test the same pattern. | 1) Deploy — training is complete. 2) Accept the result. 3) Add diverse prompts: vary question types, input formats, edge cases. |
| Reward hacking (reward up, std collapsing) | **Primary: Grader has exploitable weakness** — model found a pattern (format, length, keywords) that scores high without genuine quality. This is fundamentally a grader problem, not a data problem (Ref: Weng 2024 reward hacking survey). | **Primary fix**: Inspect model outputs manually to identify the exploit. Tighten grader to penalize the specific exploit. Enable/increase beta to slow divergence while diagnosing. **Secondary** (after grader is fixed): add targeted adversarial records that expose the now-closed exploit. |

**If any signal points to grader or data fixes**: go to **Step 9b item 2-3**, NOT item 1 (hyperparams only). Fixing hyperparams alone won't help if the grader or training data is the problem.

#### 8d. Quick diagnosis patterns

> See [reference/analysis-strategy.md](reference/analysis-strategy.md) for the full diagnosis table and decision trees. Key patterns:
> - All scores ~0 → grader broken. All scores ~1 → grader too lenient. >50% at one value → grader too coarse (most common: add early-exit for non-responses, remove score snapping).
> - KL very high but reward improving → **normal for GRPO** (beta=0 default), no action needed.
> - train_reward up, valid_reward flat → reward hacking, improve grader.

#### 8e. Update Iteration Tracker

**Verify all iterations are logged.** At this point, `iterations.json` should contain entries for:
- Every eval run (`--phase eval`) — logged at Step 7b after each eval completes
- Every training run (`--phase training`) — logged at Step 7f after training completes
- The post-training eval (`--phase eval`) — logged at Step 8b

If any are missing, log them now. The iteration tracker is how you compare across runs during Step 9.

```bash
# Example: log a missed eval iteration
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --phase eval \
  --eval-file evaluations/eval-002.json \
  --changes "Added partial credit for wrong answers" \
  --change-type grader --verdict PASS
```

`iterations.json` tracks per-iteration metrics. For eval: avg_score, zero_rate, distinct_buckets. For training: final_reward, reward_delta, KL, clipping. Each iteration shows a delta comparison vs the previous same-phase iteration.

**Read `iterations.json` before making changes** — if the last change regressed metrics, revert before trying something new.

**Checkpoint** after analysis:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step analyze --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 9: Iterate (If Needed)

Three iteration loops with different speeds and costs:

> **For full iteration diagnosis and escalation strategy**, read [reference/iteration-strategy.md](reference/iteration-strategy.md).

#### 9a. Eval-only iteration (readiness gate failed — fast, cheap)

Apply fixes and re-eval. Do NOT create a training job.

**Step 1: Diagnose** — determines whether to fix the grader, the records, or both:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py diagnose-grader \
  --file evaluations/eval-001.json --workflow-id $WORKFLOW_ID
```

The diagnosis classifies zero-score records and tells you **what to fix**:

| Diagnosis says | Root cause | Fix |
|---------------|------------|-----|
| `FIX GRADER: parsing failures` | Grader can't extract answers from model responses | Broaden regex, add LLM fallback in grader.js |
| `FIX GRADER (partial credit)` | Wrong answers get flat 0.0 — kills GRPO gradient | Add partial credit (0.01-0.1) for wrong-but-informed answers |
| `FIX RECORDS: refusals` | Prompts are too vague for structured output | Regenerate with `--ground-truth-format`, or remove vague prompts |
| Score clustering (>70% one value) | Grader doesn't differentiate quality levels | Use LLM-as-judge template with continuous scoring |

**Step 2a: Fix the grader** (if diagnosis says `FIX GRADER`):

**⚠️ GRPO grader fix rules — read before editing:**
- **NEVER remove partial credit.** If wrong answers currently score 0.03, do NOT change them to 0.0. More zeros = less gradient = worse training. This is the opposite of SFT intuition.
- **NEVER make the grader more binary.** If the fix increases the percentage of 0.0 or 1.0 scores, it's the wrong fix. GRPO needs scores spread across 0.0-1.0.
- **The goal is MORE granularity, not stricter scoring.** Add intermediate scores (0.1, 0.3, 0.5) instead of collapsing everything to 0 or 1.

```bash
# Edit grader.js, then upload + dry-run
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script grader.js --live
```

**Step 2b: Fix the records** (if diagnosis says `FIX RECORDS`):
```bash
# Option A: Filter out bad records + regenerate replacements (PREFERRED)
# 1. Remove records that scored 0 due to refusals
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py filter-records \
  --file evaluations/eval-001.json \
  --training-file finetune-project/training.jsonl \
  --max-score 0.0 --reason-pattern "refused" \
  --workflow-id $WORKFLOW_ID --sync-gateway --verbose

# 2. Regenerate replacements for removed records (--append skips existing topics)
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge --system-prompt "..." \
  --output finetune-project/training.jsonl --append \
  --ground-truth-format 'the expected output format' \
  --records-per-topic 25 --parallel 4

# 3. Re-upload
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl

# Option B: Full regeneration (if most records are bad)
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge --system-prompt "..." \
  --output finetune-project/training.jsonl \
  --ground-truth-format 'the expected output format' \
  --records-per-topic 25 --parallel 4
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl
```

**⚠️ Don't default to "fix the grader" for every issue.** Read the diagnosis carefully — refusals and vague prompts are record problems, not grader problems. Fixing the grader to tolerate bad prompts just masks the issue.

**Before re-running eval — verify your fix.** Read the changed files and confirm the fix actually addresses the diagnosed issue:
- If you fixed the grader: re-run Test 3 (adversarial robustness) mentally. Does the fix close the specific exploit found in Step 8a-agent? Trace through the grader with the exact model response pattern that caused the problem.
- If you fixed records: read 5-10 of the new/changed records. Are the GTs correct and consistent? Do they avoid the pattern that caused low scores?
- If you fixed both: verify they're aligned — the grader's new criteria match what the new records produce.

Don't burn another 45-min eval cycle on a fix that doesn't address the root cause.

**Return to Step 7b** — create a new eval and re-run the readiness gate. This is the fast loop (~45 min per iteration).

#### 9b. Post-training iteration (training completed but results unsatisfactory)

After training analysis (Step 8c), use the **training metrics → topics/records diagnosis table** (Step 8c) to determine the right fix. **Check that table first** — if any signal points to records/topics, do NOT default to hyperparams-only (item 1).

1. **If ONLY hyperparams need adjusting** (reward flat but per-topic trajectories all improving, clipping too high, etc.) — skip pre-training eval, go directly to **Step 7e** with new training config. After training completes, **always run Step 8b** (post-training eval) to measure improvement.
2. **If specific topics are underperforming** (per-topic trajectories show stagnant/degraded, or training signals from Step 8c diagnosis table) — for each problematic topic:
   - **Check topic records**: Are the prompts clear? Are ground truths correct? Use `filter-records` to remove bad records, `generate_records.py --append` to regenerate.
   - **Check topic relations**: Are the right source parts linked? Does the topic have enough context? Re-run relation-builder if needed.
   - **Check topic system prompt**: Does it include the domain rules the model needs? Update and re-generate records.
   - After fixing, return to **Step 7b** (re-eval with updated records, then retrain)
3. **If grader needs fixing** (all topics score similarly, or grader too lenient/strict) — fix grader, return to **Step 7b**
4. **If model is too weak** — try a larger base model (2B → 4B → 9B)
5. **If base model scored too high (>0.75) and training showed no improvement** — the task is too easy for this model. GRPO has limited headroom (see Step 7d analysis table). Options in priority order:
   - **Accept the base model** — if it already meets requirements, deploy without training. This is the simplest and often best option.
   - **Make grader stricter** → return to Step 5 (rewrite grader with harder criteria to lower base model scores), then re-eval + retrain
   - **Report to user** — explain that the base model already performs well and GRPO has limited headroom. The user may decide the base model is good enough, or may want to adjust the grader/task requirements.
   - **Try a smaller base model** (4B → 2B → 0.8B) — **use with caution**. Smaller models have less capacity (0.8B→4B is a 26-point benchmark gap). The smaller model may lack knowledge to learn the task at all. Run Step 7d base model eval first — if 0.8B scores near zero, it can't learn this task. Only works for very narrow, well-defined tasks. Research note: DeepSeek found distillation from larger models outperforms direct RL on smaller models (arXiv:2501.12948 §4).

```bash
# New eval after fixes
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations

# Only after readiness gate passes:
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "Qwen3.5-4B" \
  --output-model "project-v2" \
  --output-dir training-jobs
```

**Max iterations:** 5 eval-only (Step 9a) + 3 training (Step 9b) before escalating to user.

**If training failed**: Check the error message first. Common failure: `kl=nan` at an early step — this means `max_output_tokens` is too high for the task (the base model fills the budget, all completions get truncated, mask becomes all-zeros). The `create-training` command auto-adjusts `max_output_tokens` based on GT length, but if you overrode it with `--inference-params`, remove the override and let auto-adjustment work. For other failures: retry once (transient). If it fails again, see [reference/iteration-strategy.md](reference/iteration-strategy.md) for the full diagnosis table and escalation ladder (lower LR → lower max_output_tokens → smaller model → stop and report).

**"cancelled" is a TERMINAL state — do NOT retry cancelled jobs.** Only retry on "failed" states. To cancel a running job: `uv run scripts/finetune.py cancel-training --workflow-id WF_ID --job-id JOB_ID`.

#### 9c. Topic-level iteration (stalled topics after 2+ evals)

**When to trigger:** After 2+ eval iterations, check `iterations.json` for per-topic metrics. If any topic shows no improvement across consecutive evals, it may be a topic problem — not a grader or record problem.

**Step 1: Diagnose topics**

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py diagnose-grader \
  --file evaluations/eval-NNN.json --workflow-id $WORKFLOW_ID
```

The `per_topic` section in the output classifies each topic based on **score variance** (not just average). GRPO learns from variance — a hard topic with spread is the strongest training signal.

| Classification | Pattern | Meaning | Action |
|---|---|---|---|
| `DEAD_WEIGHT` | >80% zeros, std<0.05 | No useful gradient — model can't produce anything scoreable | Remove or radically simplify |
| `AMBIGUOUS` | high variance (std>0.3), low avg | Topic is too broad — records don't agree on what "good" looks like | Split into subtopics |
| `WEAK` | low avg, >50% zeros, std<0.08 | Model is stuck, almost no variance | Check records; simplify or remove if records are fine |
| `HARD_BUT_LEARNING` | low avg but std>=0.05 | Hard topic where model sometimes gets partial credit | **Keep — best training signal for GRPO** |
| `OK` | Reasonable scores | No topic-level issue | Keep |

**Important:** `HARD_BUT_LEARNING` topics look bad by average score but are the most valuable for training. GRPO needs variance within prompt groups to compute gradients. A topic with avg=0.15 but std=0.2 is gold. Do NOT remove or "fix" these.

Cross-reference with `iterations.json` — if a topic was `DEAD_WEIGHT` in both the current and previous eval, it's a persistent topic problem, not a transient one.

**Step 2: Fix topics** (only for topics classified `DEAD_WEIGHT` or `AMBIGUOUS` across 2+ evals)

| Diagnosis | Action |
|---|---|
| `DEAD_WEIGHT` + records look reasonable | Topic is too hard for base model → **remove** the topic and its records |
| `DEAD_WEIGHT` + records have wrong premise | **Regenerate** records for this topic with better grounding |
| `AMBIGUOUS` + broad topic name | **Split** into 2-3 narrower subtopics in `topics.json` |
| `AMBIGUOUS` + narrow topic but mixed records | Records mix different skills → **regenerate** with tighter prompt focus |

**Step 3: Apply topic changes**

```bash
# Edit topics.json (split/remove/rename), then re-upload
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics --force \
  --workflow-id $WORKFLOW_ID --file finetune-project/topics.json

# Remove records for deleted/changed topics from training.jsonl, regenerate
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge --system-prompt "..." \
  --output finetune-project/training.jsonl --append \
  --records-per-topic 25 --parallel 4

# Re-upload all records
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl
```

**Return to Step 7b** — re-eval to verify the topic fix improved things.

**⚠️ Topic changes are expensive** (re-upload + regenerate + re-eval). Only trigger when a topic has been `DEAD_WEIGHT` or `AMBIGUOUS` for **2+ consecutive evals**, not on the first bad result. A topic with `WEAK` classification should be fixed via grader/record changes first (Step 9a). **Never remove `HARD_BUT_LEARNING` topics** — they are the strongest training signal.

#### 9d. Iteration limits and escalation

- **Max 5 iterations.** After 5, stop and report full diagnosis.
- **Base model escalation:** After 2 failed iterations: `Qwen3.5-4B` → `Qwen3.5-9B`. If training keeps failing (OOM/NaN), try smaller: `4B` → `2B` → `0.8B`.
- **When to stop:** User satisfied, OR avg score > 0.8 AND training reward > 0.7, OR 3+ iterations with no improvement.

### Using the vLLora UI

The vLLora UI at **http://localhost:5173** provides score distributions, training metrics charts, and interactive grader editing. Tell the user to open it after Step 6.

## Reference Files

Read on demand when you need deeper detail. The most important ones are called out in the steps above.

| File | When to read |
|------|-------------|
| `reference/api-reference.md` | Making API calls — all gateway endpoints |
| `reference/data-format.md` | Generating JSONL — format, options, upload |
| `reference/extraction-guide.md` | Extraction details — Docling, subagent params, merge script |
| `reference/grader-writing.md` | Writing graders — patterns, guidelines, mistakes |
| `reference/topic-hierarchy.md` | Designing topics — structure, JSON format, balance |
| `reference/readiness-gate.md` | Interpreting readiness gate results |
| `reference/iteration-strategy.md` | Diagnosing stalls, escalation ladder |
| `reference/analysis-strategy.md` | **Read at Step 8** — decision trees, per-record analysis |
| `reference/training-metrics-guide.md` | **Read at Step 8** — GRPO metric interpretation |

## Helper Scripts

Run with `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>`. Key ones: `finetune.py` (gateway API wrapper — 25 subcommands), `generate_records.py`, `analyze_training.py`, `validate_extraction.py`, `dry_run_grader.py`, `data_quality_gate.py`. Run any script with `--help` for usage.
