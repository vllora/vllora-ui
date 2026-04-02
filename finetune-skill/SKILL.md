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

**Minimum required fields per step** (see [reference/execution-log-template.md](reference/execution-log-template.md) for full template):
- **Step 2**: per-document part counts + types, reused existing: yes/no, validation: PASS/FAIL, gateway sources count
- **Step 3**: relevance filter counts (total/relevant/excluded), topic count + hierarchy, relation count + cross-doc balance
- **Step 4**: records count, per-topic counts, source_parts coverage
- **Step 5**: template used, dry-run scores (both tests), gateway verify: yes/no
- **Step 7**: eval job ID, avg/std/zero_frac scores, readiness verdict

**⚠️ Log EVERY step, not just Step 1.** If the execution log has only Step 1 when Step 5 is complete, the log is useless for debugging.

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

**2a. Check Docling availability:**

```bash
curl -sS --connect-timeout 5 http://127.0.0.1:5001/health 2>/dev/null && echo "DOCLING_OK" || echo "DOCLING_UNAVAILABLE"
```

**If Docling is unavailable**, the `knowledge-extractor` subagent handles the fallback automatically — it uses `convert_pdf_to_markdown.py` to produce a `.md` file, then feeds it to `build_knowledge_parts.py`. Do NOT run `pdftotext_extract.py` separately from the orchestrator — delegate entirely to the subagent, which has its own fallback logic.

If Docling is available, submit all PDFs at once. Use `--skip-existing` to reuse previous extractions — this avoids re-processing PDFs whose `docling-result.json` already exists (useful when creating a new workflow from the same documents):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/docling_extract.py --submit-only --skip-existing \
  "pdfs/doc1.pdf:finetune-project/knowledge/doc1-slug/docling-result.json" \
  "pdfs/doc2.pdf:finetune-project/knowledge/doc2-slug/docling-result.json" \
  ...
```

This returns a JSON manifest with entries per document. Each entry has `task_id`, `pdf`, `output`, and `status`. With `--skip-existing`, documents whose `docling-result.json` already has valid data get `status: "reused_existing"` and `task_id: null` — no Docling request is made for those.

**"Parallel" means multiple documents extract concurrently within Step 2 — it does NOT mean you can start Step 3 or later steps while extraction is running. You MUST wait for ALL extraction to finish before proceeding.**

**2b. Spawn one `knowledge-extractor` per document (parallel within this step):**

For each document in the manifest, spawn a subagent with:
- `SKILL_DIR=${CLAUDE_SKILL_DIR}`
- `WORKFLOW_ID`, `GATEWAY_URL=http://localhost:9090`
- `DOC_PATH` — the PDF path (from manifest `pdf` field)
- `DOC_SLUG` — the slug (lowercase, hyphens, e.g. `nist-csf-2-0`)
- `DOC_DIR` — e.g., `finetune-project/knowledge/<slug>`
- `TASK_ID` — the Docling task ID from the manifest `task_id` field (UUID only). If the manifest entry has `status: "reused_existing"` (task_id is null), pass empty string — the subagent will detect the existing `docling-result.json` and skip Docling.

Spawn up to 4-5 agents at once. If there are more documents, spawn in batches.

**Retry on failure**: If a subagent fails:
1. Check if `<DOC_DIR>/docling-result.json` exists (Docling succeeded but extraction failed).
   - If yes: re-run `build_knowledge_parts.py` on the existing result.
   - If no: re-submit to Docling and spawn the subagent again.
2. If second attempt also fails: **warn the user** with the document name and error, then continue with remaining documents. Do NOT silently skip failed documents.

**2c. WAIT here until ALL agents return — then merge indexes with completeness check. Do NOT proceed to Step 3 until this merge completes and 2d validation passes:**

```bash
python3 -c "
import json, glob, sys

# Expected documents (set this from your Step 1 document list)
expected_slugs = set()  # e.g., {'doc1-slug', 'doc2-slug'}
# Populate from your actual document list:
# expected_slugs = {'chess-tactics', 'opening-theory', 'endgame-manual'}

found_files = sorted(glob.glob('finetune-project/knowledge/*/parts-index.json'))
found_slugs = {f.split('/')[-2] for f in found_files}

# Completeness check
missing = expected_slugs - found_slugs if expected_slugs else set()
if missing:
    print(f'WARNING: {len(missing)} document(s) missing parts-index.json: {sorted(missing)}')
    print('These documents failed extraction. Check subagent logs and re-extract before proceeding.')

# Merge indexes
parts = []
for f in found_files:
    with open(f) as fh:
        data = json.load(fh)
        parts.extend(data.get('parts', data) if isinstance(data, dict) else data)
with open('finetune-project/knowledge/all-parts-index.json', 'w') as fh:
    json.dump({'parts': parts}, fh, indent=2)
print(f'Merged {len(parts)} parts from {len(found_files)} documents')

if missing:
    print(f'ACTION REQUIRED: Re-extract missing documents before proceeding to Step 3.')
    sys.exit(1)
"
```

If any documents are missing, re-extract them (see retry logic in 2b) before proceeding.

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

**2e. Verify gateway upload matches local data — MUST PASS:**

After all subagents complete and validation passes, verify that the gateway received ALL documents and parts correctly:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

Then manually confirm:
1. **Source count** — the number of knowledge sources on the gateway equals the number of documents you submitted
2. **Parts count per source** — each source has the expected number of parts (compare against local `parts-index.json` for each document)
3. **Source names** — each source is named after the PDF file (e.g., `IRS-Pub596-...pdf`), NOT after `knowledge_parts.json` or any other artifact file

If any source has 0 parts, or has a wrong name (like `knowledge_parts.json` instead of the PDF name), delete it and re-upload with the correct `--file <PDF_PATH>`. A mis-uploaded source will cause ALL downstream steps (topics, relations, records) to have broken references that silently pass validation but produce incorrect data in the UI.

> **For full extraction workflow details** (if you need to understand or debug), read [reference/extraction-guide.md](reference/extraction-guide.md).

If there are no documents (objective-only pipeline), skip this step.

**Review extraction with the user.** Present a per-document summary of what was extracted (document name, section count, parts count, sample section titles). Ask:
- Do these look like the right sections from each document?
- Any documents where the extraction missed important content or grouped things incorrectly?
- Which areas should we focus training on?

**If the user wants to re-extract a specific document** (e.g., "the fee schedule in Contract-A got merged into one big part — split those into individual items"), spawn a new `knowledge-extractor` for just that document with `CUSTOM_INSTRUCTIONS` set to the user's request. Then re-merge indexes and re-validate. Only re-extract the specific documents the user flagged — not all of them.

Use the user's focus areas to guide topic design in Step 3.

**Checkpoint:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step extract --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

---

### Step 3: Build Topic Hierarchy

> **PREREQUISITES:** Step 2 fully complete (all subagents returned, `all-parts-index.json` merged, validation passed). Do NOT start while extraction is running.

Filter extracted parts by relevance, design a skill-based topic hierarchy, build topic-part relations, and write behavioral system prompt segments. Topics define WHAT training data gets generated — getting this right avoids regenerating data later.

**Outputs:** `topics.json`, `relations.json`, updated `all-parts-index.json` (with relevance labels)

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

Save to `topics.json` as a flat array with `parent_id` for hierarchy:

```json
[
  {"id": "billing", "name": "Billing & Payments", "parent_id": null, "system_prompt": "For billing cases, apply payment processing rules, subscription policies, and troubleshooting procedures."},
  {"id": "refund-processing", "name": "Refund Processing", "parent_id": "billing", "system_prompt": "When handling refund requests, determine eligibility per policy and process standard, partial, or pro-rated refunds.", "expected_difficulty": "medium"},
  {"id": "payment-troubleshooting", "name": "Payment Troubleshooting", "parent_id": "billing", "system_prompt": "When diagnosing payment failures, check card expiry, international transaction rules, 3DS challenges, and fraud block resolution.", "expected_difficulty": "hard"}
]
```

**3d. Build topic-part relations.**

Delegate to the `relation-builder` subagent — provide `PROJECT_DIR` and `OBJECTIVE`. It reads `all-parts-index.json` and `topics.json`, links only `relevant: true` parts to leaf topics (max 15 per topic), and writes `relations.json`. These relations define which knowledge parts each topic's records will be grounded in, and they flow through to per-record `source_parts` traceability in Step 4.

> **ID format note:** Use human-readable slugs for topic `id` values (e.g., `"billing-refunds"`). `finetune.py upload-topics` auto-converts to UUIDs. Use the same slug as `topic_identifier` in `relations.json`.

If there are no documents (objective-only pipeline), skip relations.

**Checkpoint:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step topics --project-dir finetune-project --workflow-id $WORKFLOW_ID
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step relations --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

**Upload** topics, relations, and relevance labels. **⚠️ If you redesigned topics (changed IDs, added/removed topics), you MUST re-upload before uploading records.** Records reference topic IDs — stale gateway topics cause FK violations and records with `topic: null`.
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics \
  --workflow-id $WORKFLOW_ID --file topics.json

if [ -f relations.json ]; then
  uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-relations \
    --workflow-id $WORKFLOW_ID --file relations.json
fi

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-part-relevance \
  --workflow-id $WORKFLOW_ID --parts-index knowledge/all-parts-index.json
```

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

The script makes **multiple LLM calls per topic** (one per prompt type: explain, scenario, compare/analyze, edge-case, application) for better diversity. By default, every leaf topic gets an equal number of records. Use `--weight-by-difficulty` to distribute based on base model eval scores — hard topics (0-30% success) get 40-50% of records, medium (30-70%) get 30-40%, easy (70-100%) get 10-20%. This is the recommended mode after the first evaluation, because GRPO learning signal is strongest on hard topics (arXiv:2508.14094: 47% gains from hard examples vs 3-15% from easy). Use `--weight-by-source` to distribute proportionally to linked source parts instead (max 3:1 imbalance ratio). Inner parallelism runs all prompt-type calls concurrently within each topic.

**Context source:** Each topic's records are grounded in the parts linked via `relations.json` (built in Step 3d by the relation-builder). This is curated context — the relation-builder evaluated each part's relevance to each specific topic. Do NOT add `--use-rag` to augment this with uncurated semantic search results — it dilutes the curated context and undermines Step 3d.

**`--enrich-sources`** (recommended): After generating each question, re-queries the gateway with the question text to find additional matching parts. This enriches `source_parts` with question-specific matches without polluting the curated topic→parts context used for generation. Unlike `--use-rag` (which adds uncurated parts BEFORE generation), this only supplements traceability AFTER generation — the LLM never sees these extra parts.

**Alternative: `--rag-only` mode** — if you skipped Step 3d (no relations), use `--use-rag --rag-only` to retrieve context via gateway semantic search instead. This is faster (skip relation-building) but less precise. Requires embeddings on the gateway.

> **When to use `--rag-only`:** Quick iteration during early pipeline development, or when the relation-builder is unavailable. Once relations are built, use them — they are more precise than keyword-based semantic search.

If some topics fail, use `--append` to retry without overwriting. In append mode, topics already present in the output file are automatically skipped to prevent duplicates after crash+retry. Adapt `--records-per-topic` (default 25), `--min-per-topic` (default 10), `--max-per-topic` (default 50) to the project. **Generate at least 200+ total records.**

**`--ground-truth-format`** (recommended for structured-output tasks): When the project requires a specific answer format (e.g. `"Eligible. EIC: $[amount]"` or `"Answer: [letter]"`), pass this flag so:
1. Ground truths are generated in that format instead of verbose source excerpts
2. **All prompt types are forced into scenario-based questions** — open-ended prompts like "Explain...", "Compare..." are converted to concrete scenarios with specific inputs, since they can't be answered in a structured format. This prevents model refusals during training.

**⚠️ CRITICAL: Include the exact valid vocabulary in the format string.** If the answer must use specific category names, LIST THEM in the format. Do NOT use placeholders like "allergen1, allergen2" — the LLM will use ingredient names (casein, whey, ghee) instead of category names (milk). Bad vs good:
- ✗ Bad: `--ground-truth-format 'allergen1, allergen2 OR none'`
- ✓ Good: `--ground-truth-format 'Comma-separated from ONLY these values: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame. If no allergens: none. Use ONLY these exact names, never ingredient names like casein or whey.'`

Examples:
- Classification: `--ground-truth-format 'COMPLIANT. Per 40 CFR [section]: [limit type] for [contaminant] is [value]. Sample at [value] is within limits. OR NON-COMPLIANT with exceedance.'`
- Allergen detection: `--ground-truth-format 'Comma-separated from ONLY: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame. If none: none'`
- MCQ: `--ground-truth-format 'Single letter: A, B, C, or D'`

**⚠️ Every record's `topic` field MUST match a leaf topic ID in `topics.json`.** Do NOT invent ad-hoc topic IDs during generation. If you generate records with a custom script instead of `generate_records.py`, validate topic IDs before writing to `training.jsonl`. The `upload-records` command will reject records with topic IDs that don't exist on the gateway — mismatched topics cause FK violations and silent data loss.

**⚠️ ALWAYS deduplicate** after generation — overlapping topics (e.g., "Fork Detection" and "Combination Calculation" both referencing Chapter 3) produce similar questions. This is mandatory, not optional:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/deduplicate_records.py finetune-project/training.jsonl --threshold 0.85
```
This removes near-duplicate prompts (trigram similarity > 0.85). Expect 5-15% reduction. If duplicates exceed 20%, the topic hierarchy has too much overlap — consider merging topics.

With `--upload-incremental`, records appear in the UI as each topic completes — no separate upload step needed. If you ran without `--upload-incremental`, upload manually:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file training.jsonl
```

> **Note:** `upload-records` resolves topic slugs → UUIDs via the local SQLite database at `~/.vllora/vllora.db`. If your DB is at a different path, pass `--db /path/to/vllora.db`. If the DB is unreachable, records will fail to upload with "topic IDs not found" — this means the topic slug→UUID mapping is missing, not that topics weren't uploaded.

**Review generated data with the user.** Present a per-topic breakdown (topic name, record count, 2-3 sample prompts per topic). Ask:
- Do these prompts look like realistic user questions?
- Any topics with weak/repetitive prompts that need regeneration?
- Any gaps — scenarios the user expected but didn't see?

The UI at `http://localhost:5173/finetune` also shows all records grouped by topic — point the user there for a visual review.

#### Step 4B: NeMo Data Designer (when `use_nemo: true`)

> **Activated by:** `"use_nemo": true` in `finetune-project/config.json`. The user sets this flag — the agent does not decide. If the flag is `false` or missing, use Step 4A above.

**Spawn the `nemo-data-generator` subagent** with:
- `SKILL_DIR=${CLAUDE_SKILL_DIR}`
- `PROJECT_DIR` — absolute path to `finetune-project/`
- `WORKFLOW_ID`, `GATEWAY_URL=http://localhost:9090`
- `NEMO_URL=http://localhost:8000`
- `SYSTEM_PROMPT` — the root system prompt from Step 1
- `RECORDS_PER_TOPIC` — target records per leaf topic (default: 25)

The subagent handles everything: verify NeMo → materialize seed → design recipe → preview → full job → convert → validate → upload. It returns a summary with record counts and any issues.

If the subagent reports NeMo is not running, fall back to Step 4A (`generate_records.py`).

---

**Checkpoint** after data generation (applies to both Step 4 and Step 4B):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step generate-data --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 4.5: Generate Variants for Augmentation

If some topics are under-represented, use `chat_completion.py` to create variants:

1. Select seed records from under-represented topics
2. Call the LLM with the seed prompt + instructions to vary scenario, specifics, tone, complexity
3. Keep system prompt and prior turns unchanged — vary only the final user message
4. Track lineage: `"source_record_id"` pointing to the original
5. Generate 3-5 variants per source record, append to `training.jsonl`

### Step 5: Write the Grader

> **PREREQUISITES:** Steps 2 + 3 complete. Grader *writing* can start in parallel with Step 4, but the **live dry-run** (Step 5.1 Test 2) requires records on the gateway — wait until Step 4 has uploaded at least some records before running `--live`.

Write a JavaScript grader function to `grader.js`. Scores model responses 0-1, runs server-side during evaluation and training.

**Before writing the grader, analyze the extracted knowledge and topic structure:**
1. Read the extracted knowledge parts (`knowledge/all-parts-index.json` and 2-3 per-document `knowledge_parts.json` files) to understand the domain's specific rules, terminology, formulas, tables, and edge cases
2. Read `topics.json` to understand the skill areas the model will be tested on
3. For each topic, think about what a perfect vs. mediocre vs. bad response looks like — grounded in what the source documents actually say, not your general knowledge
4. Identify 3-5 domain-specific qualities that separate good from bad — these MUST reflect the actual content (e.g., specific IRS rules, exact formulas, threshold values from the documents)
5. Design criteria and weight allocation informed by the source material and topic structure
6. Then write the JS grader informed by this analysis
7. If `training.jsonl` already exists (Step 4 finished first), also read 10-15 sample rows to validate your criteria against real prompts

The grader function signature: `function evaluate(input) { ... return { score, reason }; }` where score is 0.0-1.0. The function can use `__langdb_call_llm_as_judge_obj(config, input)` for subjective quality assessment — `config` has `prompt_template` (message array with `{{history}}`/`{{response}}` template vars), `output_schema` (JSON Schema), and `completion_params` (`{model_name, temperature, max_tokens}`). Set `input.history` and `input.response` before calling. **Synchronous only** — no async/await.

See [reference/grader-writing.md](reference/grader-writing.md) for 3 patterns (pure programmatic, LLM-as-judge, hybrid), design guidelines, and common mistakes.

**⚠️ COPY a template file — do NOT write a grader from scratch.** Literally copy the closest template file to `grader.js`, then customize ONLY the domain-specific parts (criteria names, weights, system prompt, domain terms). Keep the template's architecture intact — especially the LLM-as-judge scoring, LLM extraction fallback, and error handling. Do NOT cherry-pick individual features from a template into a hand-written grader — this loses the template's scoring granularity and produces coarse scores that GRPO can't learn from. If no template matches exactly, use `grader-template.js` as the base.

**⚠️ NEVER return score 0.0 for a parsing/extraction failure.** A score of 0 must mean the response is genuinely wrong or empty — not that the grader couldn't parse the format. Use LLM-based extraction as fallback when regex fails (see `grader-mcq.js` and `grader-classification.js` for the pattern).

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
The default is **512** — but this is a starting point, NOT a universal value. Different tasks need different limits (classification ~128, MCQ reasoning ~1500, code gen ~2000+). A wrong value causes 100% completion truncation → grader scores garbage → zero useful gradient.

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

When eval completes, proceed to **Step 7c (Readiness Gate)** — do NOT start training.

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
| `unsloth/Qwen3.5-9B` | Only if 4B training plateaued and task requires complex reasoning | ~100 | High with >100 records |

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
| `warmup_steps` | **20-50** | DAPO (arXiv:2503.14476) uses 20, "Tricks or Traps" (arXiv:2508.08221) uses 50. Linear warmup then constant LR. |

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

#### 7e. Monitor training

**Spawn training monitor.** Delegate to the `training-monitor` subagent (`.claude/agents/training-monitor.md`) — provide `GATEWAY_URL=http://localhost:9090`, `WORKFLOW_ID`, `JOB_ID` (from the training job file), and `OUTPUT_DIR=training-jobs`. The subagent launches a detached Python script that runs autonomously.

**Poll training in foreground:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training-jobs/train-001.json \
  --max-wait 7200
```

> **⚠️ NEVER use `sleep 300` or `sleep 600` in a Bash tool call to wait for training.** Always use `poll-training`.

**Early stopping** is enabled by default — detects completion clipping, score plateau, score degradation, and length exploitation. Add `--no-early-stop` to disable. See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) for signal details and thresholds.

When training completes (or is early-stopped), proceed to **Step 8b (Post-Training Eval)**. If early-stopped, the best checkpoint is noted in the output — use that epoch's model.

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

After training completes, run an eval on the **trained model** to measure improvement:

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

The `log-iteration` delta will show the improvement. Interpret the result:

| Improvement (Δ) | Verdict | Action |
|-----------------|---------|--------|
| **> +0.15** | ✓ Strong improvement | Deploy. GRPO worked well. |
| **+0.05 to +0.15** | ~ Moderate improvement | Deploy if acceptable. Consider more epochs or harder data for next iteration. |
| **+0.02 to +0.05** | ⚠ Marginal improvement | Check: was base model already >0.75? If so, this is expected — GRPO has limited headroom (arXiv:2508.14094: only 3.7% of steps learnable for easy prompts). Deploy if acceptable, or make grader stricter for next iteration. |
| **-0.02 to +0.02** | ⚠ No meaningful improvement | Training didn't help. Likely cause: base model already too good (>0.75) or grader not differentiating. See Step 7d guidance. |
| **< -0.02** | ❌ Regression | Training made the model worse. Deploy the base model, not the trained one. Investigate: reward hacking, overfitting, or lr too high. |

**⚠️ MANDATORY CHECKPOINT — answer these before proceeding:**

```
1. What was the base model eval score (Step 7d)?          → ___
2. What is the trained model eval score (Step 8b)?        → ___
3. Improvement (Δ = trained - base):                      → ___
4. Was base model score > 0.75?                           → yes/no
5. If yes AND Δ < 0.05: GRPO had insufficient headroom.
   → Decision (pick one):
     a) ACCEPT base model (already good enough)
     b) RETRY with stricter grader (return to Step 5, make grader harder)
     c) RETRY with smaller base model (0.8B/2B) — use with caution, run Step 7d first
     d) REPORT to user — task may not benefit from GRPO at this model size
6. Log decision:
   uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
     --project-dir finetune-project \
     --training-file training-jobs/train-NNN.json \
     --changes "Training result: Δ=___, decision: ___" \
     --change-type baseline --verdict ___
```

**Do NOT start another training job without completing this checkpoint.** If you decide to try a smaller model (option c), run a base model eval on it first:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-0.8B" --output-dir finetune-project/evaluations
```
If the smaller model scores <0.50, proceed with GRPO training on it. If it also scores >0.75, the task is fundamentally easy — accept the base model and report to the user that GRPO training is unlikely to help.

#### 8c. Analyze training metrics (after training completes)

This runs after Step 7e. Training is expensive — analyze thoroughly:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
  --metrics-file training-jobs/$JOB_ID-metrics.json \
  --epoch-evals-file training-jobs/$JOB_ID-epoch-evals.json
```

The script computes reward trend, KL health, clipping ratio, loss stability, grad norm spikes, signal strength, and per-topic trajectories. Exits with code 1 if critical alerts found.

#### 8c. Cross-reference eval + training (when both available)

Combine eval scores with training metrics. Present per-topic eval scores alongside training health. Suggest prioritized actions.

#### 8d. Quick diagnosis patterns

> See [reference/analysis-strategy.md](reference/analysis-strategy.md) for the full diagnosis table and decision trees. Key patterns:
> - All scores ~0 → grader broken. All scores ~1 → grader too lenient. >50% at one value → grader too coarse (most common: add early-exit for non-responses, remove score snapping).
> - KL very high but reward improving → **normal for GRPO** (beta=0 default), no action needed.
> - train_reward up, valid_reward flat → reward hacking, improve grader.

#### 8e. Update Iteration Tracker

**After every eval or training cycle**, log the iteration with structured metrics:

```bash
# After eval + readiness check:
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --phase eval \
  --eval-file evaluations/eval-002.json \
  --changes "Added partial credit for wrong answers" \
  --change-type grader --verdict PASS

# After training + analysis:
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --phase training \
  --training-file training-jobs/train-001.json \
  --changes "First training run: lr=5e-6, epochs=8, K=8" \
  --change-type baseline --verdict PASS
```

This maintains `finetune-project/iterations.json` with per-iteration metrics. For eval: avg_score, zero_rate, distinct_buckets. For training: final_reward, reward_delta, KL, clipping. Each iteration shows a delta comparison vs the previous same-phase iteration.

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

**Return to Step 7b** — create a new eval and re-run the readiness gate. This is the fast loop (~45 min per iteration).

#### 9b. Post-training iteration (training completed but results unsatisfactory)

After training analysis (Step 8c), if results are unsatisfactory:

1. **If only hyperparams need adjusting** (reward flat, clipping too high, etc.) — skip eval, go directly to **Step 7e** with new training config
2. **If specific topics are underperforming** — analyze per-topic scores from the post-training eval. For each low-scoring topic:
   - **Check topic records**: Are the prompts clear? Are ground truths correct? Use `filter-records` to remove bad records, `generate_records.py --append` to regenerate.
   - **Check topic relations**: Are the right source parts linked? Does the topic have enough context? Re-run relation-builder if needed.
   - **Check topic system prompt**: Does it include the domain rules the model needs? Update and re-generate records.
   - After fixing, return to **Step 7b** (re-eval with updated records, then retrain)
3. **If grader needs fixing** (all topics score similarly, or grader too lenient/strict) — fix grader, return to **Step 7b**
4. **If model is too weak** — try a larger base model (2B → 4B → 9B)
4. **If base model scored too high (>0.75) and training showed no improvement** — the task is too easy for this model. GRPO has limited headroom (see Step 7d analysis table). Options in priority order:
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

**If training failed**: Retry once (transient failure). If it fails again, see [reference/iteration-strategy.md](reference/iteration-strategy.md) for the full diagnosis table and escalation ladder (lower LR → lower max_output_tokens → smaller model → stop and report).

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

## Reference Files (Deep Dives)

Read these when you need more detail on a specific step:

| File | When to read |
|------|-------------|
| `reference/api-reference.md` | When making API calls — all 76 gateway endpoints with curl examples |
| `reference/data-format.md` | When generating JSONL — format rules, validation, quality tips |
| `reference/extraction-guide.md` | When extracting documents — Docling Serve setup, hybrid chunk API, knowledge_parts.json schema, pdftotext fallback |
| `reference/grader-writing.md` | When writing the grader — 3 patterns, design guidelines, common mistakes |
| `reference/topic-hierarchy.md` | When designing topics — structure, coverage analysis, balance scoring |
| `reference/execution-log-template.md` | When writing the execution log — per-step fields, failure/resume patterns |
| `reference/readiness-gate.md` | When interpreting readiness gate or difficulty probe results — full check tables, WARN safety guide |
| `reference/iteration-strategy.md` | When analyzing results — diagnosis, stall patterns, escalation ladder |
| `reference/analysis-strategy.md` | **Read at Step 8** — data fields, decision trees, action templates, interactive presentation |
| `reference/workflow-guide.md` | For the full detailed walkthrough of every step |

## Helper Scripts

Run with `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>`. Key scripts:

- **`convert_pdf_to_markdown.py`** — PDF → Markdown via pymupdf4llm (utility, not primary extraction)
- **`finetune.py`** — Gateway API wrapper (create workflow, upload knowledge/topics/records/grader, verify, create-eval, create-training, poll-eval, poll-training, filter-records, diagnose-grader)
- **`generate_records.py`** — Generate training records from topics + knowledge via LLM
- **`validate_dataset.py`** — Validate JSONL (format, fields, RFT compliance, cross-reference topics/parts)
- **`analyze_training.py`** — Analyze training metrics (reward trend, KL, clipping, loss, per-epoch evals)
- **`print_metrics_table.py`** — Print training metrics table (per-epoch or per-step)
- **`dry_run_grader.py`** — Dry-run grader on a single row (instant syntax/logic check)
- **`consolidate_parts.py`** — Merge adjacent text parts, drop fragments, fix Unicode
- **`validate_extraction.py`** — Cross-document extraction quality gate (includes table quality checks)
- **`camelot_extract_tables.py`** — Camelot-based table extraction fallback for complex tables that Docling garbles (stream mode, multi-page stitching, 99%+ accuracy on regulatory tables)
- **`docling_extract.py`** — Docling extraction (fallback for scanned/complex PDFs; requires Docker)
- **`build_knowledge_parts.py`** / **`extract_tables.py`** — Docling fallback post-processing
- **`chat_completion.py`** — Low-level LLM call wrapper (used internally by `generate_records.py`)
- **`run_evaluation.py`** — Standalone eval script (legacy — prefer `finetune.py create-eval`)
- **`start_training.py`** — Standalone training script (legacy — prefer `finetune.py create-training`)
