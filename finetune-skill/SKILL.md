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
                                    │      └── Fix data/grader ─────┘        Iterate (back to Eval)
                                    └──────────────────────────────┘
```

**Each step uploads to the gateway immediately** — the vLLora UI shows progress in real time.

**Execute ALL steps (1-9).** Steps 1-6 prepare the dataset. Step 7 runs eval iterations until data/grader are validated. Only then does training start. Do NOT stop at Step 6 — always run evaluation at minimum.

**Eval first, train later.** Do NOT start training on the first iteration. Run eval, check the readiness gate, fix issues, re-eval. Only start training after the readiness gate passes (Step 7c→7d). This avoids wasting hours of GPU time on bad data or a broken grader.

**Wait for training to complete.** Once training starts (Step 7d), poll until it finishes. Analyze results (Step 8b) and iterate (Step 9b) if needed.

**Auto-iterate when running non-interactively.** If the user is not responding (e.g., running via `claude -p`), make your own judgment: if readiness gate fails, apply the top-priority fix and re-eval automatically. Max 5 eval-only auto-iterations, max 3 training auto-iterations.

**Checkpoint after each step** — so the pipeline can resume after crashes:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step <STEP_NAME> --project-dir finetune-project --workflow-id $WORKFLOW_ID
```
Step names: `create-workflow`, `extract`, `topics`, `relations`, `generate-data`, `grader`, `validate`, `data-quality-gate`, `upload-records`, `upload-grader`, `eval-N` (e.g. `eval-1`, `eval-2`), `readiness-pass`, `difficulty-probe`, `training`, `analyze`.

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
2. **Run `status` to see the full picture** — this is the single source of truth:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py status --workflow-id $WORKFLOW_ID
```
This shows gateway data (records, topics, sources, grader), all job statuses, local checkpoint state, and recommends the next step. **Follow its recommendation.**

3. **Sync jobs from gateway** to pick up jobs created by the UI or other agents:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project
```
This creates local tracking files for any jobs you don't already have and updates statuses for existing jobs (e.g., a job you created that was later cancelled from the UI).

4. **Pick up from the recommended step** — do NOT re-run completed steps
5. Append to `execution-log.md` (never overwrite) with a "Resumed" entry:
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
| Readiness gate PASS + no `training-jobs/` | Crashed before training start | Create training job (Step 7d) |
| `training-jobs/` has a job file with status `running` | Training was in progress | Poll the existing job, don't create a new one |
| `training-jobs/` has a job file with status `cancelled` | Job was cancelled (from UI or another agent) | Skip it. Analyze eval results. Start new job if needed (Step 9) |
| `training-jobs/` has a job with `source: synced_from_gateway` | Job was created from the UI, not by this agent | Treat it like your own — poll it, analyze results when done |
| `iterations.md` exists with iteration results | Previous iteration completed | Read findings, apply fixes (Step 9), continue iterating |

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

Extract all documents in parallel — **spawn one `knowledge-extractor` subagent per document**. Each agent handles its own PDF independently (Docling extraction, deterministic `build_knowledge_parts.py`, post-processing, gateway upload).

> **Deterministic extraction rule**: Subagents MUST use `build_knowledge_parts.py` as the default extraction script. This ensures the same PDF always produces the same knowledge parts. Agents must NOT write custom extract.py scripts unless the user explicitly requests custom extraction for a specific document via CUSTOM_INSTRUCTIONS, or `build_knowledge_parts.py` produces 0 parts.

**2a. Check Docling availability and submit all PDFs:**

```bash
curl -sS --connect-timeout 5 http://127.0.0.1:5001/health 2>/dev/null && echo "DOCLING_OK" || echo "DOCLING_UNAVAILABLE"
```

**If Docling is unavailable**, use the fallback text extractor instead:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/pdftotext_extract.py <pdf-path> -o <output-dir>/docling-result.json
```
This produces a simpler extraction (text-only, no table detection) but is sufficient for most documents. The `knowledge-extractor` subagent will work with either Docling or pdftotext output.

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

**Retry on failure**: If a subagent fails:
1. Check if `<DOC_DIR>/docling-result.json` exists (Docling succeeded but extraction failed).
   - If yes: re-run `build_knowledge_parts.py` on the existing result.
   - If no: re-submit to Docling and spawn the subagent again.
2. If second attempt also fails: **warn the user** with the document name and error, then continue with remaining documents. Do NOT silently skip failed documents.

**2c. After ALL agents return — merge indexes with completeness check:**

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
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

**This is a hard gate.** If validation reports FAIL after `--fix`:
1. Read the specific failure reasons (short parts, low title diversity, etc.)
2. Re-run `consolidate_parts.py` with adjusted thresholds on the failing documents
3. Re-validate. If still FAIL, present the failure details to the user and ask whether to proceed or re-extract.
4. Do NOT silently proceed to Step 3 with FAIL status — bad extraction poisons topics, records, and training.

> **For full extraction workflow details** (if you need to understand or debug), read [reference/extraction-guide.md](reference/extraction-guide.md).

If there are no documents (objective-only pipeline), skip this step.

**Review extraction with the user.** Present a per-document summary of what was extracted (document name, section count, parts count, sample section titles). Ask:
- Do these look like the right sections from each document?
- Any documents where the extraction missed important content or grouped things incorrectly?
- Which areas should we focus training on?

**If the user wants to re-extract a specific document** (e.g., "the fee schedule in Contract-A got merged into one big part — split those into individual items"), spawn a new `knowledge-extractor` for just that document with `CUSTOM_INSTRUCTIONS` set to the user's request. Then re-merge indexes and re-validate. Only re-extract the specific documents the user flagged — not all of them.

Use the user's focus areas to guide topic design in Step 3. All content is already on disk; topics control what gets used for training.

### Step 3: Build Topic Hierarchy

**A topic = a skill the model needs to learn.** Each leaf topic answers the question: "what specific capability should the model practice?" The hierarchy groups related skills together so you can balance coverage, control difficulty distribution, and spot gaps.

**Organize by SKILL, not by document structure.** Do NOT mirror chapter headings or section titles. Instead, analyze what skills the source material teaches and group by capability domain (arXiv:2601.03676: skill taxonomies outperform content-based organization).

Decide what topics to create based on:
- **The objective** — what behaviors/skills does the model need? Each distinct skill becomes a topic.
- **The documents** (if available) — what skills does the content teach? Read `knowledge/all-parts-index.json` and identify the capabilities it covers. A single chapter may feed multiple skill topics; a single skill topic may draw from multiple chapters.
- **Difficulty dimension** — for each skill, consider splitting into difficulty tiers (basic vs complex). GRPO requires outcome variance — the model must get some right and some wrong for learning to happen (arXiv:2508.14094: hard examples yield 47% gains vs 3-15% for easy ones).

**Three-level hierarchy**: Domain (broad capability area) → Skill (specific competency) → Difficulty tier (based on base model performance).

Save to `topics.json` as a **flat array** — every topic at the same level, hierarchy expressed via `parent_id`. Each topic has a `system_prompt` that describes its specialization:

```json
[
  {"id": "billing", "name": "Billing & Payments", "parent_id": null, "system_prompt": "Specialize in: payment processing, subscription management, and billing troubleshooting."},
  {"id": "refund-processing", "name": "Refund Processing", "parent_id": "billing", "system_prompt": "Specialize in: handling refund requests, explaining eligibility, and processing different refund types."},
  {"id": "refund-edge-cases", "name": "Refund Edge Cases", "parent_id": "refund-processing", "system_prompt": "Focus on: partial refunds, pro-rated calculations, exceptions to standard policy, and dispute resolution."}
]
```

**Topic count**: Scale with dataset size — 5-10 leaf topics for 100-200 records, 20-40 for 500-1,000, 40-80 for 1,000-3,000. Target ~20 records per leaf topic (arXiv:2410.15226: more topics with fewer examples outperforms fewer topics with more examples). See `reference/topic-hierarchy.md` for full guidelines and research citations.

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
- Are these the right **skills** for the model to learn?
- Any skills missing, or topics to split by difficulty?
- How many records per topic? (default: 25 per leaf, target ~20 for optimal diversity)

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
  --records-per-topic 25 \
  --parallel 4 \
  --upload-incremental --workflow-id $WORKFLOW_ID
```

The script makes **multiple LLM calls per topic** (one per prompt type: explain, scenario, compare/analyze, edge-case, application) for better diversity. By default, every leaf topic gets an equal number of records. Use `--weight-by-difficulty` to distribute based on base model eval scores — hard topics (0-30% success) get 40-50% of records, medium (30-70%) get 30-40%, easy (70-100%) get 10-20%. This is the recommended mode after the first evaluation, because GRPO learning signal is strongest on hard topics (arXiv:2508.14094: 47% gains from hard examples vs 3-15% from easy). Use `--weight-by-source` to distribute proportionally to linked source parts instead (max 3:1 imbalance ratio). Inner parallelism runs all prompt-type calls concurrently within each topic.

If some topics fail, use `--append` to retry without overwriting. Adapt `--records-per-topic` (default 25), `--min-per-topic` (default 10), `--max-per-topic` (default 50) to the project. **Generate at least 200+ total records.**

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

### Step 5.5: Final Dataset Validation

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

Checks: valid JSON, required fields, message structure, no assistant messages (RFT), duplicate IDs, record count (minimum 50, recommend 100-200+), and short user messages (< 10 chars). The `--topics` and `--parts` flags cross-reference `topic` and `source_parts` fields against the actual topic hierarchy and parts index — flagging any orphaned references. Fix errors before proceeding.

### Step 5.5b: Data Quality Gate (pre-eval — do NOT skip)

**⚠️ Run this BEFORE evaluation.** Eval costs ~45 min and LLM calls. Training costs hours of GPU time. This gate catches data issues that waste those resources — vague ground truths, prompt-answer misalignment, near-duplicate prompts, and low diversity. Fixing data here is 10-100x cheaper than discovering the problem after training.

**Quick gate (free — always run):**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json
```

This runs Gate 1 (structural) and Gate 2 (diversity) — no API calls, instant results. Checks: duplicate IDs, prompt length, ground truth presence/quality, topic balance, near-duplicate detection, and semantic diversity.

**Full gate (with LLM scoring — run on first pipeline pass or after regeneration):**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --all-gates \
  --sample 30 \
  --save finetune-project/data-quality-report.json
```

This adds Gate 3 (ground truth quality — LLM scores each GT for specificity) and Gate 4 (alignment — LLM checks if GT answers the prompt). Samples 30 records by default to keep cost low.

**Or via `finetune.py`:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py data-quality-gate \
  --file finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --all-gates --save finetune-project/data-quality-report.json
```

**Decision:** Exit 0 = PASS (proceed), exit 1 = FAIL (must fix), exit 2 = WARN (review priorities).

**5 gates**: Structural (free), Diversity (free), Completion Length (free), GT Quality ($), Alignment ($). See [reference/data-quality-gate.md](reference/data-quality-gate.md) for gate details, thresholds, common failure patterns, and research citations.

**Checkpoint** after data quality gate passes:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step data-quality-gate --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

> See [reference/data-quality-gate.md](reference/data-quality-gate.md) for threshold details and research citations.

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

**7a-i. Validate max_output_tokens.**
The default is **512** — higher values increase cost per step (8 completions × N tokens each). Only increase if you see >50% clipping in training metrics.

**7a-ii. Validate grader score distribution (CRITICAL for GRPO).**
Dry-run the grader on 3-5 sample records with varying quality responses. Scores should spread across 0.2-0.9 — if all cluster at one value, GRPO gets zero gradient. See [reference/grader-writing.md](reference/grader-writing.md) for scoring patterns and red flags.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
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
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations
```

> **Note on eval IDs**: The `POST /finetune/evaluations` response returns `evaluation_run_id` — use this for polling. The workflow's `eval_job_ids` field may show a different internal ID that returns 404. Always use the ID from the create response.

**Poll eval in foreground:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval \
  --file evaluations/eval-001.json
```

When eval completes, proceed to **Step 7c (Readiness Gate)** — do NOT start training.

#### 7c. Pre-Training Readiness Gate

After eval completes, check if data and grader are ready for training:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file evaluations/eval-001.json
```

The readiness gate runs **3 hard checks** (grader quality) and **8 soft checks** (quality signals). Hard checks ask "is the grader working?", NOT "is the base model good?" — GRPO can learn from low base model scores (DeepSeek R1-Zero: 15.6% → 71%).

**Hard checks** (must ALL pass): sample count >= 50, score std > 0.10, average score > 0.05.

**Decision:**
- **Exit code 0 (PASS)** → proceed to **Step 7d (Start Training)**
- **Exit code 1 (FAIL)** → fix issues → return to **Step 7b (Re-eval)**
- **Exit code 2 (WARN)** → check which soft checks failed before deciding

**⚠️ Critical WARN distinction:** `score_concentration` > 70% means the grader is broken — **fix before training**. Other soft warnings (`pass_rate`, `binary_frac`, `dead_weight`, `topic_balance`) are safe to train through.

**If non-interactive** (running via `claude -p`): auto-fix if `score_concentration` > 70%, otherwise proceed to training.

**Max 5 eval-only iterations.** If readiness gate never passes after 5 evals, escalate to user with diagnosis.

> See [reference/readiness-gate.md](reference/readiness-gate.md) for the full check tables, WARN safety guide, and research citations.

#### 7c+. Difficulty Probe (after readiness gate passes, before training)

**⚠️ Run this after the readiness gate passes and before starting training.** Checks **per-prompt signal strength** — catches data that looks good in aggregate but produces zero gradient at the prompt level.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py difficulty-probe \
  --file evaluations/eval-001.json \
  --save finetune-project/difficulty-report.json
```

**Decision:** Exit 0 = PASS (>= 30% learnable, proceed to training), exit 1 = FAIL (< 15% learnable, fix first), exit 2 = WARN (15-30%, review recommendations).

> See [reference/readiness-gate.md](reference/readiness-gate.md) for difficulty probe details, fix recommendations, and research citations.

**Checkpoint** after difficulty probe passes:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step difficulty-probe --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

#### 7d. Start Training (only after readiness gate passes)

Training starts here — only reached when the readiness gate indicates data and grader are solid.

**Base model selection** (choose based on task complexity AND dataset size):
| Model | Best for | Max records (K=8) | OOM risk |
|-------|----------|-------------------|----------|
| `unsloth/Qwen3.5-0.8B` | Quick iteration, prototyping, very narrow tasks | ~1000 | Very low |
| `unsloth/Qwen3.5-2B` | Simple tasks, fast experiments | ~800 | Low |
| `unsloth/Qwen3.5-4B` | **Default choice.** Good balance of quality and speed | ~500 | Low |
| `unsloth/Qwen3.5-9B` | Complex reasoning, broad domains | ~100 | High with >100 records |

> **⚠️ Start with 4B.** The 9B model OOMs with >100 records and K=8 on standard GPU allocations. Use 9B only for small, complex datasets (<100 records). Use 0.8B/2B for quick prototyping or when training keeps failing on larger models. The `create-training` script warns if the model/dataset combination risks OOM.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "unsloth/Qwen3.5-4B" \
  --output-model "project-v1" \
  --output-dir training-jobs

# To override defaults (e.g., after diagnosing issues from previous iterations):
# python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
#   --workflow-id $WORKFLOW_ID \
#   --base-model "unsloth/Qwen3.5-4B" \
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
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training-jobs/train-001.json \
  --max-wait 7200
```

> **⚠️ NEVER use `sleep 300` or `sleep 600` in a Bash tool call to wait for training.** Always use `poll-training`.

**Early stopping** is enabled by default. The poll script uses multi-signal detection based on GRPO/RFT research:

1. **Score plateau** — EMA-smoothed scores (alpha=0.3) with linear regression slope over 5 epochs. Triggers when slope < 0.005/epoch after a 2-epoch warm-up. Distinguishes "converged" (score ≥0.5, deploy) vs "stuck" (score <0.3, investigate grader/data). Ref: arXiv:2507.18014 (3-phase GRPO training), arXiv:2503.06639 (absorbing states).
2. **Score degradation** — Negative EMA slope (scores declining) indicates overfitting or policy collapse.
3. **Length exploitation** — Response length growing >30% while reward is flat. Ref: Dr. GRPO (arXiv:2503.20783) — GRPO's normalization can cause degenerate lengthening.

To disable: add `--no-early-stop`.

When training completes (or is early-stopped), proceed to **Step 8b (Post-Training Analysis)**. If early-stopped, the best checkpoint is noted in the output — use that epoch's model.

### Step 8: Analyze Results

**Before analyzing, sync jobs** to catch status changes from the UI:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project
```

**Handle cancelled jobs**: Skip analysis for cancelled jobs. Log it in execution-log.md. If ALL jobs were cancelled, proceed to Step 9.

> **Read [reference/analysis-strategy.md](reference/analysis-strategy.md)** for decision trees and presentation format.
> **Read [reference/training-metrics-guide.md](reference/training-metrics-guide.md)** for GRPO metric interpretation.

#### 8a. Analyze eval results (after each eval — before training)

This runs during the eval-first loop (Step 7b→7c). Compute:

1. **Overall**: average score, pass rate (>0.7 threshold), score range
2. **Per-topic breakdown**: group scores by topic, sort by average (weakest first). Low topic scores are expected for base models — focus on whether the grader differentiates quality within each topic, not absolute scores.
3. **Low-scoring records**: list records <0.7 with their `reason` fields
4. **Score concentration**: are scores spread out (good) or clustered at one value (grader too coarse)? If >50% are the same value, the grader needs more granular criteria — GRPO gets zero gradient when K=8 completions all score identically (DAPO arXiv:2503.14476).
5. **Readiness gate output**: from `readiness-check` command — which criteria passed/failed. Pay special attention to `score_concentration` — it catches grader issues that `score_std` misses when outliers inflate the overall std.

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
   python3 ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl --topics finetune-project/topics.json
   python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl
   ```

**When to skip regeneration:** If only 1-2 records out of 200+ scored 0, removing without replacement is fine.

#### 8b. Analyze training results (after training completes)

This runs after Step 7e. Training is expensive — analyze thoroughly:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
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

**After every eval/training cycle**, append a summary to `iterations.md` (create if it doesn't exist). Include: config, eval results (per-topic breakdown), training results (reward/KL/clipping), what changed, and next action. See [reference/analysis-strategy.md](reference/analysis-strategy.md) for the full template.

**Checkpoint** after analysis:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step analyze --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 9: Iterate (If Needed)

Two iteration loops with different speeds and costs:

> **For full iteration diagnosis and escalation strategy**, read [reference/iteration-strategy.md](reference/iteration-strategy.md).

#### 9a. Eval-only iteration (readiness gate failed — fast, cheap)

Apply fixes and re-eval. Do NOT create a training job.

**Fixing the grader** — first diagnose, then fix:

**Step 1: Diagnose.** Run `diagnose-grader` to understand WHY scores cluster and WHAT to change:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py diagnose-grader \
  --file evaluations/eval-001.json --workflow-id $WORKFLOW_ID
```
This shows: score distribution by bucket, sample `reason` fields, auto-diagnosis, fix suggestions, and grader source code. **Read this output carefully — the root cause might be DATA, not grader.**

**The most common cause of score clustering is a grader-prompt mismatch** — the grader expects something the model can't do given the prompt format (e.g., page citations without documents). Fix the grader to match the prompts, NOT the data.

> See [reference/iteration-strategy.md](reference/iteration-strategy.md) for the full diagnosis table (grader-prompt mismatch, score snapping, coarse scoring).

**Step 2: Fix.** Edit `grader.js` based on the diagnosis, then upload:
```bash
# Edit grader.js, then update:
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader \
  --workflow-id $WORKFLOW_ID --file grader.js
```

**Step 3: Dry-run.** Verify the fix before re-eval:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role":"system","content":"..."}, {"role":"user","content":"..."}, {"role":"assistant","content":"I cannot provide specific figures without the filing."}]}'
```
Check that a "model refused" response now scores 0 (not 0.3).

**Fixing the data** (requires re-upload):
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file training.jsonl
```

**Return to Step 7b** — create a new eval and re-run the readiness gate. This is the fast loop (~45 min per iteration).

#### 9b. Post-training iteration (training completed but results unsatisfactory)

After training analysis (Step 8b), if results are unsatisfactory:

1. **If only hyperparams need adjusting** (reward flat, clipping too high, etc.) — skip eval, go directly to **Step 7d** with new training config
2. **If data or grader needs fixing** — apply fixes, return to **Step 7b** (re-eval first, then training)
3. **If model is too weak** — try a larger base model (2B → 4B → 9B)

```bash
# New eval after fixes
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations

# Only after readiness gate passes:
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID \
  --base-model "unsloth/Qwen3.5-4B" \
  --output-model "project-v2" \
  --output-dir training-jobs
```

**Max iterations:** 5 eval-only (Step 9a) + 3 training (Step 9b) before escalating to user.

**If training failed**: Retry once (transient failure). If it fails again, see [reference/iteration-strategy.md](reference/iteration-strategy.md) for the full diagnosis table and escalation ladder (lower LR → lower max_output_tokens → smaller model → stop and report).

**"cancelled" is a TERMINAL state — do NOT retry cancelled jobs.** Only retry on "failed" states. To cancel a running job: `uv run scripts/finetune.py cancel-training --workflow-id WF_ID --job-id JOB_ID`.

#### 9c. Iteration limits and escalation

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
| `reference/extraction-guide.md` | When extracting documents — Docling API, response structure, knowledge_parts.json schema |
| `reference/grader-writing.md` | When writing the grader — 3 patterns, design guidelines, common mistakes |
| `reference/topic-hierarchy.md` | When designing topics — structure, coverage analysis, balance scoring |
| `reference/readiness-gate.md` | When interpreting readiness gate or difficulty probe results — full check tables, WARN safety guide |
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
