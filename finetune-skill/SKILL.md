---
name: vllora-finetune
description: |
  Guide for fine-tuning LLMs using the vLLora platform. Use this skill whenever the user mentions fine-tuning, finetuning, training a custom model, creating training datasets, writing evaluation/grader functions, or improving model quality through iteration. Also use it when users have documents (PDFs, manuals, knowledge bases) they want to convert into training data, or when they ask about evaluating model outputs with scoring functions. This skill applies even if users don't explicitly say "vLLora" — any request to fine-tune or build training data for an LLM should trigger it.
---

# vLLora Finetune Skill

Run the full fine-tuning pipeline on the vLLora platform. You handle the entire workflow — reading documents, designing topics, generating training data, writing graders, running evaluations, analyzing results, and iterating until the model is ready. Each step uploads to the gateway immediately so the vLLora UI shows progress in real time.

> **CRITICAL:** Execute all API calls directly via Bash. **NEVER create shell scripts (.sh files).**

## How vLLora Fine-Tuning Works

vLLora uses **GRPO (Group Relative Policy Optimization)** — a reinforcement learning method, NOT supervised fine-tuning. The model generates K completions per prompt (default K=8), your grader scores each (0-1), and GRPO reinforces better completions while suppressing worse ones. Learning happens from **score variance within the group** — if all K completions score identically, the gradient is zero and no learning occurs.

**The grader IS your training objective.** Whatever the grader rewards, the model learns to do.

**Prerequisites for Success:**
1. The base model must already have some capability on the task (GRPO amplifies existing ability, cannot create it)
2. The task must be unambiguous
3. The task should be guess-proof (not binary yes/no)
4. The grader must produce smooth, varied scores (not binary pass/fail)

> GRPO has counterintuitive properties that differ from SFT. See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) "GRPO Research Context" for common traps and how to research fixes.

## The Pipeline

```
Define Objective → Extract Docs → Build Topics → Generate Data → Write Grader → Validate
     ↓ upload         ↓ upload        ↓ upload       ↓ upload       ↓ upload
   (workflow)      (knowledge)      (topics)       (records)      (grader)

                   ┌──────────────────────────────────────────────────────────────┐
                   │                                                              │
Validate → Quality Gate → Verify → Eval BOTH (4B + 0.8B)                          │
               ↓ FAIL                     ↓                                       │
          Fix data (cheap)       Compare learnable% → Choose best model            │
               ↓                 ┌────────────────────────────────────┐            │
          Re-validate            │  Readiness on chosen model          │            │
                                 │  → Signal density check             │            │
                                 │  → Harden if trivial% high          │── PASS ──→ Train → Analyze → Done
                                 │  → Re-eval both if hardened         │              ↓ bad
                                 │       ↑         ↓ FAIL              │          Iterate (back to Eval)
                                 │       ├── Fix data/grader ──────────┘
                                 │       └── Fix topics (if stalled 2+ evals)
                                 └────────────────────────────────────┘
```

**Hard rules:**
- **Respect step dependencies.** Extract → Topics → Records + Grader → Validate. Step 4 (records) MUST finish before Step 5 (grader) is finalized — read 10-15 sample records to calibrate.
- **Execute ALL steps (1-9).** Do NOT stop at Step 6 — always run evaluation at minimum.
- **Eval first, train later.** Run eval, check readiness gate, fix issues, re-eval. Only train after readiness gate passes.
- **Wait for training to complete.** Poll until done, run post-training eval, compare with baseline.
- **Auto-iterate when non-interactive.** Max 5 eval-only auto-iterations, max 3 training auto-iterations.
- **Checkpoint after each step:**
  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step <STEP_NAME> --project-dir finetune-project --workflow-id $WORKFLOW_ID
  ```
  Step names: `create-workflow`, `extract`, `topics`, `relations`, `generate-data`, `grader`, `validate`, `data-quality-gate`, `eval-N`, `readiness-pass`, `difficulty-probe`, `training`, `analyze`.

### Working Directory

```
finetune-project/
├── training.jsonl, grader.js, topics.json, relations.json, config.json
├── execution-log.md, iterations.md, pipeline-journal.json
├── knowledge/                  # Per-document subdirs
│   ├── {doc-slug}/             # {slug}.md, extract.py, knowledge_parts.json, parts-index.json
│   └── all-parts-index.json   # Merged index across ALL documents
├── evaluations/                # eval-001.json, eval-002.json, ...
└── training-jobs/              # train-001.json, {JOB_ID}-metrics.json, ...
```

**Workflow ID comes from `config.json` ONLY.** If it exists, read `workflow_id` from it. If not, create a new workflow. Do NOT search the gateway API for workflows with the same name. Workflow names are not unique.

**Table-heavy documents**: Write a "synthesis part" — a prose summary of key facts from tables.

**NEVER modify skill files.** The `.claude/skills/` and `.claude/agents/` directories are read-only.

### Execution Log

Maintain `execution-log.md` as an **append-only** chronological record.

**Use `log-step` ONLY — do NOT write to the log manually.** Log at **sub-step granularity** — not just start/end of each major step, but every meaningful milestone within it. The journal should tell the story of what happened without reading the transcript.

**Logging rules:**
1. Log when a sub-task **starts** (status=in_progress)
2. Log when a sub-task **completes** with concrete results in `--summary` (status=completed)
3. Log **decisions** with rationale in `--analysis` and `--decision`
4. Include **numbers** in every summary — never "Processing PDFs...", always "Processing 1 PDF (FDA-FALCPA.pdf) with Docling..."

**Example: Step 2 (Extraction) should produce 4+ journal entries, not 2:**
```bash
# 2a. Submit to Docling
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_2_extraction --action docling_submit --status in_progress \
  --summary "Submitted 1 PDF (FDA-FALCPA.pdf) to Docling for extraction"

# 2b. Docling result
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_2_extraction --action docling_complete --status completed \
  --summary "Docling extracted 75 chunks from FDA-FALCPA.pdf"

# 2c. Build knowledge parts
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_2_extraction --action build_parts --status completed \
  --summary "Built 68 knowledge parts (67 text, 1 table). Consolidation: 75→68 (merged 7 fragments)"

# 2d. Upload + verify
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_2_extraction --action upload_knowledge --status completed \
  --summary "Uploaded 68 parts to gateway. Source ID: 079fe2a8. Validation: PASS" \
  --decision "Proceed to topic hierarchy" \
  --duration "2 min" --agent "knowledge-extractor"
```

**Use `--details` for structured data** (JSON string). This makes the journal machine-readable for the UI:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_7_eval --action model_selection --status completed \
  --summary "Chose 0.8B: learnable=37% vs 4B learnable=25%" \
  --analysis "4B avg=0.791 exceeds 0.75 headroom gate. 0.8B has 184 effective samples vs 105 for 4B." \
  --decision "Train 0.8B" \
  --details '{"4B": {"avg": 0.791, "learnable_frac": 0.25, "trivial_frac": 0.27, "zeros": 0.03}, "0.8B": {"avg": 0.509, "learnable_frac": 0.37, "trivial_frac": 0.10, "zeros": 0.13}, "chosen": "Qwen3.5-0.8B", "reason": "higher_learnable_frac"}'
```

**Sub-step milestones to log per major step:**

| Step | Milestones to log |
|------|-------------------|
| Step 2: Extract | docling_submit, docling_complete, build_parts, consolidate, upload_knowledge |
| Step 3: Topics | design_topics (with topic count + structure), upload_topics, build_relations, upload_relations |
| Step 4: Generate | generate_stage1 (record count per topic), derive_gt (success/error count), dedup, validate_gt, upload_records |
| Step 5: Grader | write_grader (scoring approach), test_grader (adversarial results), upload_grader |
| Step 5.5: Validate | validate_dataset (record count, issues), data_quality_gate (pass/warn/fail per gate) |
| Step 7: Eval | create_eval (model name), poll_eval (final scores), readiness_check (pass/fail with metrics), model_selection (comparison table + chosen model + rationale) |
| Step 8: Train | estimate_training (cost/duration), create_training (config used), poll_training (epoch progression), post_training_eval (improvement delta) |

**Each step gets its own `log-step` calls.** Steps 4, 5, and 5.5 are SEPARATE entries.

Agent names: `orchestrator`, `knowledge-extractor`, `relation-builder`, `training-monitor`, `nemo-data-generator`.

**Canonical step names** (use these exact strings in `--step`):

| Step | `--step` value |
|------|---------------|
| Step 1: Objective | `step_1_objective` |
| Step 2: Extraction | `step_2_extraction` |
| Step 3: Topics | `step_3_topics` |
| Step 4: Generation | `step_4_generation` |
| Step 5: Grader | `step_5_grader` |
| Step 5.5: Validate | `step_5_5_validate` |
| Step 6: Verify | `step_6_verify` |
| Step 7: Eval | `step_7_eval` |
| Step 8: Training | `step_8_training` |

See [reference/pipeline-journal-schema.md](reference/pipeline-journal-schema.md) for the full schema. Every eval or training job MUST have a `log-step` call with `--reason`.

---

### Prerequisites

```bash
curl -s http://localhost:9090/finetune/workflows | head -c 100 && echo " OK" || echo "ERROR: Gateway not running"
uv --version 2>/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Resume from Previous Run

**ALWAYS check for an existing `finetune-project/` directory first.** If found, this is a continuation.

```bash
if [ -f finetune-project/config.json ]; then
  WORKFLOW_ID=$(python3 -c "import json; print(json.load(open('finetune-project/config.json'))['workflow_id'])")
  echo "Existing project — resuming workflow: $WORKFLOW_ID"
else
  echo "No config.json — will create new workflow in Step 1"
fi
```

**If found:** (1) Read `config.json` for workflow_id, (2) Run `status` to see the full picture:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py status --workflow-id $WORKFLOW_ID
```
Follow its recommendation. (3) Sync jobs: `sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project`. (4) Cancel broken eval jobs if `status` shows ~0.0 scores (use `uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py cancel-eval --workflow-id $WORKFLOW_ID --eval-id <EVAL_ID>`). (5) Resume from recommended step. (6) Backfill missing data in execution log.

**Reusing extractions across workflows:** Existing `knowledge/{slug}/docling-result.json` files can be reused even with a new workflow. Do NOT delete `knowledge/` when starting fresh from the same documents.

| State found | Action |
|-------------|--------|
| `config.json` + `knowledge/` + no `topics.json` | Resume from Step 3 |
| Everything through `grader.js` + no `evaluations/` | Resume from Step 7b |
| `evaluations/` + no readiness-pass checkpoint | Run `readiness-check` (Step 7c) |
| Readiness gate PASS + no `training-jobs/` | Create training job (Step 7e) |
| `training-jobs/` with status `running` | Poll the existing job |
| `training-jobs/` with early_stop + base model avg >0.75 | Run Step 7d headroom diagnostic. See [reference/readiness-gate.md](reference/readiness-gate.md) |

---

### Step 1: Define the Objective

Ask the user what behaviors the model should learn. Produce an **objective statement** and a **system prompt** ("You are...") for Step 4.

```bash
if [ -f finetune-project/config.json ]; then
  WORKFLOW_ID=$(python3 -c "import json; print(json.load(open('finetune-project/config.json'))['workflow_id'])")
else
  WORKFLOW_ID=$(uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-workflow \
    --name "My Project" --objective "Train a model to..." | tail -1)
  mkdir -p finetune-project
  cat > finetune-project/config.json << EOF
{"workflow_id": "$WORKFLOW_ID", "gateway_url": "http://localhost:9090", "use_nemo": false}
EOF
fi
```

**If the user specifies budget or time constraints**, add them to config.json:
```json
{
  "workflow_id": "...",
  "constraints": {
    "max_cost_usd": 2.00,
    "max_duration_minutes": 60
  }
}
```
`estimate-training` and `create-training` read these constraints automatically — models exceeding limits are flagged, and a warning is shown before training starts.

Merge `finetune-defaults.json` if it exists in the project root. The `use_nemo` flag controls Step 4 (default=false → `generate_records.py`; true → NeMo Data Designer).

### Step 2: Extract Inputs

> **PREREQUISITES:** Step 1 complete.

The skill supports two parallel input ingredients. Run whichever applies — or both. Steps 3–7 don't care which extractor produced the parts.

- **2A. Documents (PDFs, markdown, images)** — extract via `docling_extract.py` / `build_knowledge_parts.py`. The document path below.
- **2B. OTel GenAI traces (LLM call logs)** — extract via `otel_extract.py`. Mirrors 2A but reads OpenTelemetry GenAI spans (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.*`) and writes the same `knowledge_parts.json` format. See [reference/otel-trace-ingestion.md](reference/otel-trace-ingestion.md). Use this when the user wants to clone the behavior of an existing LLM app rather than teach the model new knowledge.

  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/otel_extract.py traces.json \
      --out-dir finetune-project/knowledge
  ```

#### 2A. Documents

Extract knowledge from all documents. Each document processed by a `knowledge-extractor` subagent.

**Outputs:** `knowledge/{slug}/knowledge_parts.json`, `knowledge/{slug}/parts-index.json`, `knowledge/all-parts-index.json` (merged)

**2a. Check Docling** — `curl -sS --connect-timeout 5 http://127.0.0.1:5001/health`

**2b. Submit & extract** — Submit PDFs with `--skip-existing`. Spawn one `knowledge-extractor` subagent per document. Wait for ALL to complete.

> Subagents MUST use `build_knowledge_parts.py` as the default extraction script. Do NOT write custom extract.py unless explicitly requested or `build_knowledge_parts.py` produces 0 parts.

> Subagents upload to the gateway. Do NOT re-upload yourself — creates duplicates.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/docling_extract.py --submit-only --skip-existing \
  "pdfs/doc1.pdf:finetune-project/knowledge/doc1-slug/docling-result.json" ...
```

> See [reference/extraction-guide.md](reference/extraction-guide.md) for subagent parameters, retry logic, and merge script.

**2c. Merge indexes** — Merge all `parts-index.json` into `knowledge/all-parts-index.json`.

**2d. Validate — MUST PASS:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

**Hard gate.** If validation fails after `--fix`: fix the specific issues (you can read PDF pages directly with the `Read` tool to fix broken tables), re-validate. Do NOT silently proceed with FAIL status.

**2e. Verify gateway upload** — `verify --workflow-id $WORKFLOW_ID --no-journal`. Confirm source count matches PDFs. Delete duplicates if found. Use `--no-journal` here — this is a diagnostic check, not Step 6.

---

### Step 3: Build Topic Hierarchy

> **PREREQUISITES:** Step 2 fully complete. Do NOT start while extraction is running.

**Outputs:** `topics.json`, `relations.json`, updated `all-parts-index.json`

**Reuse existing topics:** If `topics.json` exists from a prior run, treat it as authoritative. Only add/remove topics if source material materially changed.

**3a. Filter parts by relevance.** Read content of each part — do NOT pattern-match on titles alone. Label `"relevant": true/false` in `all-parts-index.json`.

**3b. Design skill-based topics.** Organize by **skill** (what the model learns to DO), not document structure. Two-level hierarchy: Domain → Skill. Target 15-25 records per leaf topic, 5-40 leaf topics. Do NOT use `/` in topic names (breaks UI routing).

**Granularity rule:** When source material enumerates distinct items (9 allergens, 14 tax forms), prefer one leaf topic per item to expose per-item difficulty to GRPO.

> See [reference/topic-hierarchy.md](reference/topic-hierarchy.md) for full guidelines, JSON format, and examples.

**3c. Write behavioral system prompt segments.** Root persona → Domain context → Leaf focus. Each level adds ONLY what the parent doesn't say. Use action verbs (assess, recommend, identify), not keyword lists.

**3d. Build topic-part relations.** Delegate to `relation-builder` subagent. Upload:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics --workflow-id $WORKFLOW_ID --file topics.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-relations --workflow-id $WORKFLOW_ID --file relations.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-part-relevance --workflow-id $WORKFLOW_ID --parts-index knowledge/all-parts-index.json
```

**3e. Quality check** — verify coverage, overlap, balance, and relations yourself before presenting to user.

### Step 3.5: Categorize Existing Records

If the user provides existing training data, assign each record to a leaf topic. Skip if generating all data from scratch.

### Step 4: Generate Training Data

> **PREREQUISITES:** Step 3 complete.

Check `config.json` for `use_nemo` flag. If `true`, skip to Step 4B (NeMo). Otherwise:

#### Step 4A: Default — `generate_records.py`

**Outputs:** `training.jsonl`

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are an expert..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 30 --parallel 4 \
  --workflow-id $WORKFLOW_ID --upload-incremental --enrich-sources
```

> **WARNING: If regenerating records**, delete gateway records first to avoid duplicates:
> ```bash
> uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force --workflow-id $WORKFLOW_ID --file /dev/null 2>/dev/null || true
> ```
> `--upload-incremental` appends to gateway. Running generate twice without clearing = duplicate records on gateway.

Generate **200+ total records**, minimum 25 per leaf topic.

**Difficulty control** (reduces trivial records at generation time):
- `--difficulty normal` (default): balanced prompt types for initial generation
- `--difficulty hard`: Evol-Instruct operators — multi-step reasoning, indirect info, complex inputs, edge cases. Use when prior eval showed >40% trivial records.
- `--difficulty adaptive --eval-scores evaluations/eval-001.json`: per-topic difficulty from eval scores — easy topics (>0.70) get hard mode, hard topics (<0.30) get normal mode.
- `--probe-and-rewrite`: after generation, probes each record with Qwen3.5-4B (largest, conservative filter — if 4B aces it, trivial for all models). Rewrites trivials (>0.85) to be harder. Adds variants alongside originals. Override model with `--probe-model`. (arXiv:2505.17063: +2.6pp)

**`--ground-truth-format` (MANDATORY for structured-output tasks):** Forces scenario-based prompts with specific answer format. Include BOTH the answer format AND the prompt format.

**`--input-format` (MANDATORY):** Describes the SHAPE of the user message so the generator produces records that match your inference task. Without this, the generator defaults to question-shaped prompts ("what is X?") which can produce records where the user message asks the model to imagine/recall data instead of containing the literal data the model should extract from. Write it as natural language — phrasing diversity (question / statement / narrative) is fine as long as the actual data is present in the user message.

**Multi-label GT completeness (critical for set-output tasks):** Use two-stage generation to prevent single-label suppression (arXiv:2505.17510):
```bash
# Stage 1: Generate inputs per-topic (no GT)
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics ... --relations ... --knowledge-dir ... --no-ground-truth \
  --ground-truth-format "The user message MUST present a concrete [input]..." \
  --input-format "The user message MUST contain the literal data the model should process (e.g. the ingredient list / SQL schema / source text). The phrasing can be a raw dump, a question containing the data, or a narrative mentioning the data — any is fine. Do NOT produce records that reference the data indirectly or ask the model to recall it from world knowledge." \
  --output finetune-project/training.jsonl --records-per-topic 30

# Stage 2: Derive complete GTs topic-agnostically
uv run ${CLAUDE_SKILL_DIR}/scripts/derive_ground_truth.py finetune-project/training.jsonl \
  --gt-prompt "List ALL [items]..." --overwrite

# Stage 2b: MANDATORY topic↔GT reconciliation. Stage 1 sets a record's topic
# at generation time based on the prompt intent, but Stage 2 may derive a GT
# that contradicts that topic. Without reconciling, the topic field becomes
# stale — UI groups, topic-stratified eval analysis, and per-topic hardening
# all operate on incorrect assignments.
#
# --max-per-topic 30 trims overflow so reconciled-into topics don't bloat.
# --min-per-topic 25 hard-fails if any topic dropped below the floor; the
# error message includes exact regen commands for the gap.
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py reconcile-topics \
  --training-file finetune-project/training.jsonl \
  --apply --max-per-topic 30 --min-per-topic 25

# If reconcile exits non-zero, regenerate the gap topics (commands printed
# in the error), then re-run derive_ground_truth + reconcile-topics. At most
# 1-2 retry rounds in practice.
```

> See [reference/data-format.md](reference/data-format.md) for full options, weighting modes, RAG mode, and upload details.

**ALWAYS deduplicate** after generation:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/deduplicate_records.py finetune-project/training.jsonl --threshold 0.85
```

#### Step 4B: NeMo Data Designer (only when `use_nemo: true`)

Spawn `nemo-data-generator` subagent. If NeMo unavailable, fall back to Step 4A.

---

**4e. Quality check** — read records from every topic (3-5 per topic) and check:
- **GT vocabulary**: verify every GT uses ONLY the exact vocabulary from `--ground-truth-format`
- **GT self-consistency**: does the conclusion match the evidence within the same GT?
- **GT factual accuracy**: cross-reference 5-10 numeric values against source parts
- **GT completeness** (MANDATORY for multi-label): programmatically check ALL records, not just a sample
- **Prompt format**: does the user message match expected input format?
- **Duplicate patterns**: >5 identical GTs = low diversity

If >10% of sampled records have issues, fix the bad records (remove + regenerate replacements), then re-check.

### Step 4.5: Topic Balance Check

**MANDATORY: minimum 25 records per leaf topic AFTER reconciliation.** Generate with `--records-per-topic 30` (20% buffer) so that after `derive_ground_truth` + `reconcile-topics` move drift records between topics, every topic still ends ≥ 25. Drift typically removes 5-10% of records per topic; the buffer absorbs it. Do NOT generate at exactly 25 — reconciliation will drop several topics below the floor.

**After removing bad records, check topic counts:**
```bash
python3 -c "
import json
from collections import Counter
records = [json.loads(l) for l in open('finetune-project/training.jsonl')]
counts = Counter(r.get('topic','?') for r in records)
print(f'Total: {len(records)}')
for topic, count in sorted(counts.items()):
    flag = ' ⚠ BELOW MIN' if count < 25 else ''
    print(f'  {topic}: {count}{flag}')
"
```

**If any topic is below 25 records:**
1. **Diagnose first** — why were records removed? Bad prompt format? Wrong GT? Topic design issue?
2. **Fix the root cause** — tighten `--ground-truth-format`, fix topic system_prompt, adjust generation constraints
3. **Then regenerate** with `--append` using the improved prompt. Do NOT regenerate with the same prompt that produced bad records.
4. **Re-check quality** on the new records before proceeding.

**Do NOT proceed to Step 5 with any topic below 25 records.** The grader calibration and eval signal density depend on sufficient records per topic.

### Step 5: Write the Grader

> **PREREQUISITES:** Steps 2 + 3 + 4 complete. Wait for `training.jsonl` to exist before finalizing.

Write a JavaScript grader to `grader.js`. Scores model responses 0-1.

**Before writing:** (1) Read knowledge parts + topics to understand the domain, (2) Design a checklist rubric of 7-20 binary criteria (arXiv:2507.17746), (3) **Read 10-15 sample records** from `training.jsonl` to calibrate.

**Copy a template — do NOT write from scratch:**

| Template | Best for |
|----------|----------|
| `templates/grader-template.js` | General-purpose (default) |
| `templates/grader-mcq.js` | Multiple-choice / short-answer QA |
| `templates/grader-classification.js` | Single-label classification |
| `templates/grader-multilabel.js` | Multi-label set comparison |
| `templates/grader-extraction.js` | Structured data extraction |
| `templates/grader-compliance.js` | Rule application (FDA, tax, legal) |
| `templates/grader-readability.js` | Simplification (contract→English) |

**Hard rules:**
- **NEVER return score 0.0 for parsing failures.** Use LLM extraction fallback.
- **NEVER add "HARD GATE" rules that return 0.0** for any attempted answer (even very wrong ones). Use 0.02 minimum. When all K=8 completions return 0.0, GRPO has zero variance → zero gradient → no learning. Empirically validated: HARD GATE=0.0 caused 80% frac_reward_zero_std and flat training; same grader with HARD GATE=0.02 enabled +30% learning.
- **Wrong answers MUST get nonzero scores (0.02-0.10).** Zero scores = zero GRPO gradient = wasted prompts.
- **NEVER remove partial credit** when fixing the grader in iteration.
- **NEVER use programmatic checks as primary scoring.** Use LLM-as-judge for quality.
- **Prevent length exploitation.** See [reference/grader-writing.md](reference/grader-writing.md) "Preventing Length Exploitation" for 4 defenses and the DRPO anti-pattern.

> See [reference/grader-writing.md](reference/grader-writing.md) for full patterns, rubric design, scoring guidelines, and common mistakes.

#### Step 5.1: Mandatory Dry-Run (4 tests)

**Test 1: Hand-crafted row** — catches syntax errors:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}'
```

**Test 2: Live model response (CRITICAL)** — catches format-assumption bugs:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script grader.js --live --live-samples 5
```

Both tests must pass. If Test 1 passes but Test 2 scores 0.0, fix parsing logic.

**Test 3: Adversarial leniency test (MANDATORY)** — feeds wrong answers through the grader:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py test-grader \
  --workflow-id $WORKFLOW_ID --training-file finetune-project/training.jsonl --samples 10
```
Generates plausible-but-wrong answers for 10 records, scores them through the grader. If ANY wrong answer scores > 0.40, the grader is too lenient — fix it before eval. LLM judges have 35-66% false positive rates by default (arXiv:2510.00915).

**Why this matters:** If the grader is lenient, high trivial% at eval doesn't mean records are easy — it means the grader can't tell right from wrong. Fixing the grader is cheaper than regenerating data.

**Test 4: Grader Validation Protocol** — consistency (5 paraphrases, variance < ±0.15), discrimination (correct vs wrong mean diff > 0.4), exploitation (3 adversarial responses all < 0.4).

> See [reference/grader-writing.md](reference/grader-writing.md) "Pre-Training Grader Validation Protocol" for details.

**Upload + verify + checkpoint** — run ALL THREE:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file grader.js

curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wf = data.get('workflow', data)
evaluator = wf.get('eval_script') or wf.get('evaluator')
if not evaluator or evaluator == 'null' or len(str(evaluator)) < 10:
    print('FATAL: Evaluator NOT on gateway'); sys.exit(1)
print(f'Evaluator verified: OK ({len(str(evaluator))} chars)')
"

uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step grader --project-dir finetune-project --workflow-id $WORKFLOW_ID
```

### Step 5.5: Final Dataset Validation

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json \
  --parts finetune-project/knowledge/all-parts-index.json
```

### Step 5.5b: Data Quality Gate (MANDATORY)

**Quick gate (free — always run):**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json --knowledge-dir finetune-project/knowledge
```

**Full gate (with LLM scoring — run on first pass or after regeneration):**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl \
  --topics finetune-project/topics.json --all-gates --sample 30 \
  --save finetune-project/data-quality-report.json
```

**Decision:** Exit 0 = PASS, exit 1 = FAIL (must fix), exit 2 = WARN (review).

> See [reference/data-quality-gate.md](reference/data-quality-gate.md) for gate details and thresholds.

**Step 5.5c: GT Self-Consistency Check (agent performs directly)** — read records from every topic, check that conclusions match evidence within each GT. If >10% have contradictions, fix before proceeding.

### Step 6: Verify & Hand Off

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

All counts > 0 and evaluator = YES. Tell the user data is at `http://localhost:5173/finetune`, then **proceed to Step 7**.

### Step 7: Evaluate & Validate Before Training

**Eval first, train later.** Eval is ~10 min per model and cheap. Training is hours and expensive.

```
Eval BOTH (4B + 0.8B) → Compare learnable% → Choose best model
→ Readiness on chosen → Signal density → Harden if needed → Train
```

Max 5 eval-only iterations before training.

#### 7a. Pre-training validation

**Set max_output_tokens** based on ACTUAL expected output length. Do NOT default to 512.

| Expected output | max_output_tokens |
|----------------|-------------------|
| Short labels (3-15 tokens) | 128 |
| Short answer (30-100 tokens) | 256 |
| Explanation (200+ tokens) | 512-1024 |

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py training.jsonl \
  --gate completion_length --max-output-tokens 512 --json
```

#### 7b. Eval BOTH Models + Choose Best

**Always eval both 4B and 0.8B.** Evals are cheap (~10 min each). Choosing the wrong model wastes hours of training. A model passing the headroom gate (avg < 0.75) doesn't mean it will improve much — what matters is **learnable fraction** (how many records produce GRPO gradient).

```bash
# Eval 4B + 0.8B (always eval both extremes)
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-4B" --output-dir finetune-project/evaluations
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/evaluations/eval-001.json

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-0.8B" --output-dir finetune-project/evaluations
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/evaluations/eval-002.json
```

**Estimate training cost** (optional but recommended — helps model selection):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py estimate-training \
  --workflow-id $WORKFLOW_ID --models "Qwen3.5-4B,Qwen3.5-0.8B" --max-output-tokens 128
```

**Run readiness-check on BOTH** to get signal density. **Always pass `--training-file` and `--objective-target-tokens`** — these enable the proactive length-drift checks (`spec_mismatch` + `length_drift_risk`) that catch grader-rewards-verbosity and spec-mismatch problems BEFORE training. Skipping them means clipping problems only get caught reactively during training, after compute is wasted:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file finetune-project/evaluations/eval-001.json \
  --training-file finetune-project/training.jsonl \
  --objective-target-tokens <user spec, e.g. 80>

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file finetune-project/evaluations/eval-002.json \
  --training-file finetune-project/training.jsonl \
  --objective-target-tokens <user spec, e.g. 80>
```

**If 0.8B avg < 0.05 (no capability), also eval 2B** as middle ground:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-2B" --output-dir finetune-project/evaluations
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/evaluations/eval-003.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check --file finetune-project/evaluations/eval-003.json
```

The readiness summary shows `trivial% | learnable% | dead%` for each model. **Compare learnable_frac across all evaluated models and choose the best** (arXiv:2508.14094v3: R²=0.66 between learnable% and actual improvement across model sizes):

| Situation | Choose | Why |
|---|---|---|
| One model has **50%+ learnable** | That model | Strong signal. If tied, prefer larger model for capacity. |
| Both 30-50% learnable | Model with **higher learnable%** | More gradient signal outweighs capacity difference |
| 4B < 30%, 0.8B > 40% | **0.8B** | 4B has too many trivials, 0.8B has real headroom |
| All models < 30% learnable | **Harden first** (Step 7c++), then re-eval all |
| 0.8B < 5% learnable | Skip 0.8B. **Eval 2B** if not already done. Compare 4B vs 2B. |
| 0.8B < 5% AND 2B < 5% | **4B** (only viable model). Consider making grader stricter. |

**When to eval 2B:**
- 0.8B avg < 0.05 (no capability) — 2B is the middle ground
- 4B and 0.8B both have < 30% learnable — 2B might hit the sweet spot

**GATES (MANDATORY):** Chosen model avg must be between 0.05 and 0.75.

Log the chosen model:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --eval-file finetune-project/evaluations/eval-NNN.json \
  --changes "Chosen MODEL_NAME (avg=X.XX, learnable=XX%)" --change-type baseline --verdict PASS
```

> See [reference/readiness-gate.md](reference/readiness-gate.md) "Headroom Gate" for diagnostic trees when both models fail.

#### 7c. Readiness Gate (on chosen model)

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file finetune-project/evaluations/eval-NNN.json \
  --training-file finetune-project/training.jsonl \
  --objective-target-tokens <user spec>
```

**Hard checks** (must ALL pass): sample count >= 50, score std > 0.10, avg score > 0.05, zero_score_frac < 10%, **`spec_mismatch` not flagged**, **`length_drift_risk` not flagged**.

> **`spec_mismatch`** fails if `gt_p95 > objective_target × 2`. Means GT violates user's spec → regenerate GT or update objective. Do NOT train.
>
> **`length_drift_risk`** fails if `eval_response_p95 > gt_p95 × 2`. Means grader is rewarding verbosity at K=1 — training will amplify and trigger clipping. Add DRPO-safe conciseness penalty to grader BEFORE training.

**Decision:** Exit 0 = PASS → 7c+. Exit 1 = FAIL → fix → 7b. Exit 2 = WARN → fix warnings on first eval; subsequent: only fix `score_concentration` > 70%.

> See [reference/readiness-gate.md](reference/readiness-gate.md) for full check tables.

#### 7c+. Difficulty Probe + Signal Density (on chosen model)

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py difficulty-probe \
  --file finetune-project/evaluations/eval-NNN.json --save finetune-project/difficulty-report.json
```

**Decision:** Exit 0 = PASS (>= 30% learnable), exit 2 = WARN (15-30%), exit 1 = FAIL (< 15%).

#### 7c++. Harden Trivial Records (if signal density low on CHOSEN model)

**Hardening trigger** (engineering heuristic inspired by arXiv:2508.14094 — not a direct paper threshold):
- `trivial > 40% AND learnable < 35%` on the **chosen model's** eval → HARDEN
- `dead > 30%` on chosen model → ADVISORY (DAPO filters dead records from gradients, but they waste inference compute)
- Apply to the chosen model only — a rejected model's trivial% is irrelevant after model selection

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py harden-records \
  --eval-file finetune-project/evaluations/eval-NNN.json \
  --training-file finetune-project/training.jsonl --min-score 0.85
```

After hardening: **re-upload → re-eval BOTH models → re-compare learnable_frac → re-choose model.** Hardening changes the difficulty distribution, which may change which model is best.

> **Why chosen model only?** Trivial/learnable is per-model (arXiv:2508.14094). A record trivial for 4B may still produce variance for 0.8B. Cross-model trivial contamination is plausible but unverified by any paper.
>
> **Why not always harden?** With 50% learnable and 15% trivial, proactive hardening is not justified — no paper supports removing trivial records when learnable% is already strong. DAPO dynamic sampling (arXiv:2503.14476) handles the remaining trivials at batch time.

> See [reference/readiness-gate.md](reference/readiness-gate.md) for harden-records details.

#### 7d. Coverage Audit

**Run source-part coverage audit (MANDATORY).** Verify training records cover ALL knowledge parts.

> See [reference/readiness-gate.md](reference/readiness-gate.md) "Source-Part Coverage Audit" for the audit code.

#### 7e. Start Training

**Only after readiness gate AND headroom gate pass.**

Use the model chosen in Step 7b based on learnable_frac comparison.

| Model | When chosen | Max records (K=8) |
|-------|------------|-------------------|
| `Qwen3.5-4B` | Highest learnable%, or tied with smaller model (capacity tiebreaker) | ~500 |
| `Qwen3.5-2B` | Middle ground when 0.8B has no capability and 4B has too many trivials | ~800 |
| `Qwen3.5-0.8B` | Higher learnable% than 4B on the same dataset | ~1000 |

These are the **only 3 base models** supported.

**Do NOT pass `--config` on the first training run.** Defaults are model-size-aware and research-backed. Only override after a diagnosed failure. Use `--inference-params` for `max_output_tokens` only.

| Model | LR | Beta | scale_rewards | K | Rationale |
|-------|-----|------|---------------|---|-----------|
| 0.8B | 5e-6 | 0 | group | 16 | Small model needs fast updates, no KL drag, amplified signal, more exploration |
| 2B | 3e-6 | 0 | group | 16 | Middle ground |
| 4B | 2e-6 | 0.01 | none | 8 | Higher baseline capability, enough variance at K=8 |

> **K=8 is correct for most tasks.** K=4 is viable for short-output binary tasks; K=16 only for long-output hard tasks with dynamic sampling. Larger K does NOT reduce zero-variance collapse — it accelerates convergence then wastes compute. See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) "K (Group Size) Selection Guide".

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID --base-model "Qwen3.5-4B" \
  --output-model "project-v1" --output-dir training-jobs
```

> See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) "GRPO Training Defaults" for all parameters, rationale, and advanced config.

#### 7f. Monitor Training

Spawn `training-monitor` subagent, then poll:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training-jobs/train-001.json --max-wait 7200
```

**Never use `sleep 300`** — always use `poll-training`.

> **CRITICAL: --max-wait must be ≥ 1800s (30 min).** Training jobs queue on cloud GPU and may stay `pending` for several minutes before starting, then take 15-60 min to complete. If you pass `--max-wait 60`, the poll will timeout while the job is still pending and the script will exit with the wrong status. **Always use 7200 (2h)** unless you have a specific reason. The default is 7200.

**Monitor epoch evals during training.** Build a progression table comparing each epoch with the pre-training baseline. Write to `execution-log.md` immediately after each epoch eval — do NOT wait until training completes.

```
| Metric       | Baseline | Epoch 0 | Epoch 1 | Epoch 2 | Trend |
|--------------|----------|---------|---------|---------|-------|
| Avg score    | 0.540    | 0.647   | 0.790   | 0.841   | ↑     |
| Perfect rate | 39%      | 47%     | 62%     | 61%     | ↑     |
```

**Check triggers EVERY epoch eval fetch:** reward flat, score declining, perfect rate spike, length change, zero-std rising. If any trigger fires, read 5-10 individual records.

> See [reference/analysis-strategy.md](reference/analysis-strategy.md) Step 2b for trigger details.

**When training is auto-cancelled for completion clipping:**

Do NOT immediately recreate the job with a higher `max_output_tokens`. The skill auto-cancels when ≥50% of completions are truncated, but the *cause* of clipping has three flavors and only one is fixed by raising the cap. Reflex-raising guarantees length collapse (GR3 arXiv:2603.10535).

Run the diagnostic first:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py diagnose-clipping \
  --job-file training-jobs/train-NNN.json \
  --training-file finetune-project/training.jsonl \
  --objective-target-tokens <user spec, e.g. 80>
```

Then apply the fix the diagnosis recommends:

| Diagnosis | Fix |
|---|---|
| **A. Config too tight** (`gt_p95 > max_output_tokens`) | Raise `max_output_tokens` to `gt_p95 × 1.5`, recreate training |
| **B. Grader drift** (`gt_p95 <= cap` but model verbose) | Edit grader to add a DRPO-safe conciseness penalty (see `grader-writing.md` §DRPO Anti-Pattern), re-eval, recreate training with the **same** cap |
| **C. Spec mismatch** (`gt_p95 >> objective target`) | Regenerate GT to match the stated length OR update the objective. Do NOT proceed to training until resolved. |

> See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) §100% Completion Clipping for the full decision table.

When training completes: (1) Write FINAL progression table to execution log, (2) Run `log-iteration --phase training`, (3) Proceed to Step 8b.

### Step 8: Analyze Results

**Sync jobs first:** `sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project`

> **Read [reference/analysis-strategy.md](reference/analysis-strategy.md)** for decision trees and presentation format.
> **Read [reference/training-metrics-guide.md](reference/training-metrics-guide.md)** for GRPO metric interpretation.

#### 8a. Analyze eval results

Compute overall scores, per-topic breakdown, score concentration. Read actual model responses — **BOTH low-scoring AND high-scoring**:

- **Bottom 20%**: Is the response reasonable but scored harshly, or genuinely bad? "parsing failed" → grader bug.
- **Top 10-15%**: Did model score high for right reasons, or via a grader shortcut? (Ref: OpenAI RFT Cookbook)
- **Reason patterns**: Do many records share the same reason? Systematic issue.

Then run the readiness gate (Step 7c).

#### 8a+. Diagnose Zero-Scoring Records (Do NOT Remove Automatically)

> **CRITICAL: Do NOT filter zero-scoring records before training.** K=1 eval score of 0 does NOT mean K=8 training will also produce all zeros. With 8 attempts, the model may produce a correct answer, creating the variance GRPO needs. "Hard Examples Are All You Need" (arXiv:2508.14094): hard examples yield 47% gains vs 3-15% for easy ones. "No Prompt Left Behind" (arXiv:2509.21880): dead-weight prompts (30-99% per batch) are normal and handled by the algorithm.

**Only filter if:** `difficulty-probe` with K=8 confirms ALL completions score 0 for a record, OR the record has a data quality issue (wrong GT, malformed input, grader bug). Use `--reason-pattern "refused"` to filter model refusals only — those are genuinely broken.

```bash
# Diagnose zeros (DO NOT remove yet)
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py filter-records \
  --file evaluations/eval-001.json --training-file finetune-project/training.jsonl \
  --max-score 0.0 --workflow-id $WORKFLOW_ID --verbose --dry-run

# Only filter confirmed model refusals
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py filter-records \
  --file evaluations/eval-001.json --training-file finetune-project/training.jsonl \
  --max-score 0.0 --reason-pattern "refused" --workflow-id $WORKFLOW_ID --sync-gateway --verbose
```

#### 8b. Post-Training Eval

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "TRAINED_MODEL_NAME" --output-dir finetune-project/evaluations
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/evaluations/eval-NNN.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --eval-file evaluations/eval-NNN.json \
  --changes "Post-training eval" --change-type baseline --verdict PASS
```

Read improved AND degraded records per topic. Check if gains come from genuine skill or grader exploitation.

**MANDATORY Grader Sanity Checks** — run this command after EVERY eval AND after every training epoch checkpoint. It hard-fails (exit 1) if any check trips. You MUST NOT proceed if this fails.

```bash
# After each standalone eval
uv run .claude/skills/finetune-skill/scripts/finetune.py grader-sanity-check \
  --eval-file finetune-project/evaluations/eval-NNN.json

# After each training epoch (training-monitor MUST run this on every poll
# that produces a new epoch in the epoch-evals file)
uv run .claude/skills/finetune-skill/scripts/finetune.py grader-sanity-check \
  --eval-file finetune-project/training-jobs/<job-id>-epoch-evals.json
```

The check iterates ALL epochs present in the file and reports per-epoch pass/fail. If any epoch trips a check, the script exits non-zero — the training-monitor MUST stop polling and surface the failure to the orchestrator. Do not let training continue with a broken grader.

Checks performed:
- LLM fallback rate < 10% (else regex too narrow)
- Partial+FP collapse: TP>0 but score≤0.10 (ordinal collapse — usually length penalty bypassing `tpFloor`)
- Dump-all gaming: ≥7 labels in response with score >0.20 (over-prediction defense not firing)
- LLM inference: high LLM scores where GT label not literally in raw response (grader inferring labels)
- **Default-mode collapse**: top model response emitted ≥2x more than its GT frequency. Indicates the base model has a strong default prior (e.g., always answers "none") that GRPO will struggle to escape. **Reference: "Tricks or Traps" (arXiv:2508.08221) Section 4.2 entropy collapse.** When this fires you MUST: (1) rebalance training data to oversample non-default-mode records, AND (2) consider raising clip-higher epsilon_high to 0.28 if the backend supports it. Do NOT proceed to training without addressing the collapse — most K=8 groups will be all-default → zero variance → no gradient.

Manual deep checks (run if the automated check passes but you suspect a bug):

```bash
# Sanity check 1: LLM fallback usage rate (should be <10%)
# High rate = regex is missing normal outputs, or grader is too lenient
python3 -c "
import json, sys, requests
eval_id = '<EVAL_RUN_ID>'
r = requests.get(f'http://localhost:9090/finetune/evaluations/{eval_id}')
results = r.json().get('results', [])
llm_count = sum(1 for rec in results for e in rec.get('epochs',{}).get('0',[]) if 'llm' in e.get('reason','').lower())
total = sum(1 for rec in results for e in rec.get('epochs',{}).get('0',[]) if e.get('score') is not None)
print(f'LLM fallback: {llm_count}/{total} ({llm_count/max(total,1)*100:.1f}%)')
print('⚠ HIGH — grader leaking' if llm_count/max(total,1) > 0.10 else '✓ OK')
"

# Sanity check 2: High-score response/GT mismatch check
# Scan top 10 high-score records — does the RAW response literally contain the GT label?
# If the model said "anchovy extract" and scored 0.96 for "fish", that's a grader bug.
python3 -c "
import json, requests
eval_id = '<EVAL_RUN_ID>'
r = requests.get(f'http://localhost:9090/finetune/evaluations/{eval_id}')
results = r.json().get('results', [])
flagged = 0
for rec in results:
    row = rec.get('row', {})
    gt = (row.get('ground_truth') or '').lower()
    if not gt or gt == 'none': continue
    for ep in rec.get('epochs',{}).get('0',[]):
        score = ep.get('score', 0)
        if score < 0.8: continue
        resp = (ep.get('rollout_content') or '').lower()
        gt_labels = [x.strip() for x in gt.split(',')]
        missing = [lbl for lbl in gt_labels if lbl not in resp]
        if missing and flagged < 10:
            print(f'  ⚠ score={score:.2f} GT={gt} response=\"{resp[:80]}\" missing={missing}')
            flagged += 1
print(f'Flagged {flagged} high-score records with missing GT labels in response')
"

# Sanity check 3: Partial + FPs ordinal check
# Find records with 0 < score < 0.1 that have TP > 0 — bug indicator
# If partial matches score same as completely wrong, FP penalty is too aggressive.
# COMMON ROOT CAUSE: a length/verbosity penalty added to the grader that
# uses Math.max(0.05, baseScore - penalty) instead of Math.max(tpFloor, ...).
# Any post-floor penalty MUST clamp to tpFloor when tp > 0, otherwise it
# silently re-introduces the ordinal collapse the TP-tier floor exists to fix.

# Sanity check 3b: Dump-all-labels (gaming) check
# Count records where model emitted ≥7 labels (out of N valid). Should be capped
# at 0.15 by the over-prediction defense. If any score >0.20, the cap is broken.

# Sanity check 4: Manual inspection of 5-10 random records per score band
# Score 0.0-0.2: should be genuine failures
# Score 0.3-0.5: should be partial matches
# Score 0.8-1.0: raw response should literally contain every GT label
```

**If any sanity check fails:**
- Fix the grader BEFORE declaring training successful
- Re-eval after grader fix
- Document in iterations.json what was broken

| Improvement (Δ) | Verdict | Action |
|-----------------|---------|--------|
| **> +0.15** | Strong | Deploy |
| **+0.05 to +0.15** | Moderate | Deploy if acceptable |
| **+0.02 to +0.05** | Marginal | Check base model was >0.75? Expected if so |
| **-0.02 to +0.02** | None | Training didn't help |
| **< -0.02** | Regression | Deploy base model. Run Step 8c first. |

**MANDATORY CHECKPOINT:** Run Step 8c before deciding. If 8c finds grader exploit → fix grader + retrain. If epoch collapse → fewer epochs. If base >0.75 and Δ <0.05 → accept base model.

#### 8c. Analyze training metrics

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
  --workflow-id $WORKFLOW_ID --job-id $JOB_ID --save
```

Read the epoch records yourself — flagged regressions, improvements, stagnant records. Compare model responses across epochs. Cross-reference regressions with improvements to reveal exploit strategy.

> See [reference/analysis-strategy.md](reference/analysis-strategy.md) Part 2 for full diagnosis tables and per-record analysis patterns.

#### 8d-8e. Quick diagnosis + Update Iteration Tracker

> See [reference/analysis-strategy.md](reference/analysis-strategy.md) for quick diagnosis patterns and [reference/iteration-strategy.md](reference/iteration-strategy.md) for tracking progress.

Verify all iterations are logged in `iterations.json`. Read it before making changes.

### Step 9: Iterate (If Needed)

Three iteration loops with different speeds and costs.

> **For full iteration diagnosis and escalation strategy**, read [reference/iteration-strategy.md](reference/iteration-strategy.md).

#### 9a. Eval-only iteration (readiness gate failed — fast, cheap)

**Diagnose:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py diagnose-grader \
  --file evaluations/eval-001.json --workflow-id $WORKFLOW_ID
```

| Diagnosis | Fix |
|-----------|-----|
| `FIX GRADER: parsing failures` | Broaden regex, add LLM fallback |
| `FIX GRADER (partial credit)` | Add partial credit (0.01-0.1) for wrong answers |
| `FIX RECORDS: refusals` | Regenerate with `--ground-truth-format` |
| Score clustering (>70% one value) | Use LLM-as-judge template |

**Grader fix rules:** NEVER remove partial credit. NEVER make the grader more binary. Goal is MORE granularity.

**Fix grader:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file grader.js
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py --workflow-id $WORKFLOW_ID --script grader.js --live
```

**Fix records (only for diagnosed data issues, NOT for zero-score filtering):**
```bash
# Only filter records with confirmed data issues (refusals, wrong GT, malformed input)
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py filter-records \
  --file evaluations/eval-001.json --training-file finetune-project/training.jsonl \
  --max-score 0.0 --reason-pattern "refused" --workflow-id $WORKFLOW_ID --sync-gateway --verbose

uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics ... --relations ... --knowledge-dir ... --system-prompt "..." \
  --output finetune-project/training.jsonl --append --records-per-topic 25

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl
```

**Before re-running eval — verify your fix** addresses the diagnosed root cause.

**Return to Step 7b.**

#### 9b. Post-training iteration

Use the **training metrics → diagnosis table** in [reference/analysis-strategy.md](reference/analysis-strategy.md) Part 2d to determine whether to fix hyperparams, grader, or data.

1. **Hyperparams only** → skip pre-training eval, go to Step 7e with new config
2. **Topics underperforming** → fix records/relations/prompts → Step 7b
3. **Grader needs fixing** → fix grader → Step 7b
4. **Model too weak** → try larger base model
5. **Base model > 0.75 + no improvement** → accept base model, make grader stricter, or report to user

> See [reference/iteration-strategy.md](reference/iteration-strategy.md) Part 10 for the full hyperparameter iteration ladder and post-training diagnosis.

**Max iterations:** 5 eval-only + 3 training before escalating to user.

**If training early-stopped due to score degradation**, distinguish: (A) reward never rose → headroom issue (see Step 7d), (B) reward rose then declined → entropy collapse or reward hacking. See [reference/iteration-strategy.md](reference/iteration-strategy.md) Part 8 for detailed symptom-based diagnosis.

#### 9c. Topic-level iteration (stalled topics after 2+ evals)

Run `diagnose-grader` and check per-topic classifications:

| Classification | Meaning | Action |
|---|---|---|
| `DEAD_WEIGHT` | No useful gradient | Remove or simplify |
| `AMBIGUOUS` | Topic too broad | Split into subtopics |
| `HARD_BUT_LEARNING` | **Best training signal** | **Keep — do NOT remove** |

Only trigger topic changes when a topic has been `DEAD_WEIGHT` or `AMBIGUOUS` for **2+ consecutive evals**.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics --force \
  --workflow-id $WORKFLOW_ID --file finetune-project/topics.json
```

Return to Step 7b.

#### 9d. Iteration limits

- **Max 5 eval-only + 3 training iterations.** After that, escalate.
- **Base model ladder:** weak → `0.8B` → `2B` → `4B`. OOM → `4B` → `2B` → `0.8B`.
- **When to stop:** User satisfied, OR avg > 0.8 AND reward > 0.7, OR 3+ iterations with no improvement.

### Using the vLLora UI

The vLLora UI at **http://localhost:5173** provides score distributions, training metrics charts, and interactive grader editing. Tell the user to open it after Step 6.

## Reference Files

| File | When to read |
|------|-------------|
| `reference/api-reference.md` | Making API calls — all gateway endpoints |
| `reference/data-format.md` | Generating JSONL — format, options, upload |
| `reference/extraction-guide.md` | Extraction details — Docling, subagent params, merge script |
| `reference/grader-writing.md` | Writing graders — patterns, guidelines, length exploitation defenses |
| `reference/topic-hierarchy.md` | Designing topics — structure, JSON format, balance |
| `reference/readiness-gate.md` | Readiness gate, difficulty probe, headroom gate, coverage audit |
| `reference/iteration-strategy.md` | Diagnosing stalls, escalation ladder, post-training iteration |
| `reference/analysis-strategy.md` | **Read at Step 8** — decision trees, per-record analysis, training diagnosis |
| `reference/training-metrics-guide.md` | **Read at Step 8** — GRPO metrics, training defaults, research context |

## Helper Scripts

Run with `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>`. Key ones: `finetune.py` (25 subcommands), `generate_records.py`, `analyze_training.py`, `validate_extraction.py`, `dry_run_grader.py`, `data_quality_gate.py`. Run any script with `--help` for usage.
