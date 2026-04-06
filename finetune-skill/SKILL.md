---
name: vllora-finetune
description: |
  Guide for fine-tuning LLMs using the vLLora platform. Use this skill whenever the user mentions fine-tuning, finetuning, training a custom model, creating training datasets, writing evaluation/grader functions, or improving model quality through iteration. Also use it when users have documents (PDFs, manuals, knowledge bases) they want to convert into training data, or when they ask about evaluating model outputs with scoring functions. This skill applies even if users don't explicitly say "vLLora" — any request to fine-tune or build training data for an LLM should trigger it.
---

# vLLora Finetune Skill

Run the full fine-tuning pipeline on the vLLora platform. You handle the entire workflow — reading documents, designing topics, generating training data, writing graders, running evaluations, analyzing results, and iterating until the model is ready. Each step uploads to the gateway immediately so the vLLora UI shows progress in real time.

> **CRITICAL:** Execute all API calls directly via Bash. **NEVER create shell scripts (.sh files).**

## How vLLora Fine-Tuning Works

vLLora uses **GRPO (Group Relative Policy Optimization)** — a reinforcement learning method, NOT supervised fine-tuning. The model generates K=8 completions per prompt, your grader scores each (0-1), and GRPO reinforces better completions while suppressing worse ones.

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

**Use `log-step` ONLY — do NOT write to the log manually.** Call at TWO points for each step:

1. **When a step STARTS** (long-running steps):
   ```bash
   uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
     --project-dir finetune-project \
     --step step_2_extraction --action extract_documents --status in_progress \
     --summary "Processing 1 PDF with Docling..."
   ```

2. **When the step COMPLETES** — with results, analysis, decision, `--duration`, and `--agent`:
   ```bash
   uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
     --project-dir finetune-project \
     --step step_2_extraction --action extract_documents --status completed \
     --summary "Extracted 68 knowledge parts" \
     --analysis "68 parts: 67 text, 1 table" \
     --decision "Proceed to topic hierarchy" \
     --duration "2 min" --agent "knowledge-extractor" \
     --triggered-by 1
   ```

**Each step gets its own `log-step` call.** Steps 4, 5, and 5.5 are SEPARATE entries.

Agent names: `orchestrator`, `knowledge-extractor`, `relation-builder`, `training-monitor`, `nemo-data-generator`.

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
Follow its recommendation. (3) Sync jobs: `sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project`. (4) Cancel broken eval jobs if `status` shows ~0.0 scores. (5) Resume from recommended step. (6) Backfill missing data in execution log.

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

Merge `finetune-defaults.json` if it exists in the project root. The `use_nemo` flag controls Step 4 (default=false → `generate_records.py`; true → NeMo Data Designer).

### Step 2: Extract Documents

> **PREREQUISITES:** Step 1 complete.

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

**2e. Verify gateway upload** — `verify --workflow-id $WORKFLOW_ID`. Confirm source count matches PDFs. Delete duplicates if found.

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
  --records-per-topic 25 --parallel 4 \
  --workflow-id $WORKFLOW_ID --upload-incremental --enrich-sources
```

Generate **200+ total records**, 15-25 per leaf topic.

**`--ground-truth-format` (MANDATORY for structured-output tasks):** Forces scenario-based prompts with specific answer format. Include BOTH the answer format AND the prompt format.

**Multi-label GT completeness (critical for set-output tasks):** Use two-stage generation to prevent single-label suppression (arXiv:2505.17510):
```bash
# Stage 1: Generate inputs per-topic (no GT)
uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics ... --relations ... --knowledge-dir ... --no-ground-truth \
  --ground-truth-format "The user message MUST present a concrete [input]..." \
  --output finetune-project/training.jsonl --records-per-topic 25

# Stage 2: Derive complete GTs topic-agnostically
uv run ${CLAUDE_SKILL_DIR}/scripts/derive_ground_truth.py finetune-project/training.jsonl \
  --gt-prompt "List ALL [items]..." --overwrite
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

If >10% of sampled records have issues, fix before proceeding.

### Step 4.5: Topic Balance Check

**MANDATORY after record generation.** If any topic has <50% of target records-per-topic, regenerate for that topic using `generate_records.py --append`. Use `chat_completion.py` for variants if needed.

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
- **Wrong answers MUST get nonzero scores (0.01-0.10).** Zero scores = zero GRPO gradient = wasted prompts.
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

**Test 3: Adversarial robustness** — mentally trace through grader logic for: over-prediction, under-prediction, length exploitation, format gaming, prompt copying. If any adversarial response scores >0.3, fix the grader.

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

**Eval first, train later.** Eval is ~45 min and cheap. Training is hours and expensive.

```
Eval → Readiness Gate → [FAIL] → Fix → Re-eval → ... → [PASS] → Train
```

Max 5 eval-only iterations before training.

#### 7a. Pre-training validation

**7a-i. Set max_output_tokens** based on ACTUAL expected output length. Do NOT default to 512.

| Expected output | max_output_tokens |
|----------------|-------------------|
| Allergen list (3-15 tokens) | 128 |
| Compliance verdict (30-60 tokens) | 256 |
| Short answer (50-100 tokens) | 256-512 |
| Explanation/reasoning (200+ tokens) | 512-1024 |

Run the `completion_length` gate to get the recommended value:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py training.jsonl \
  --gate completion_length --max-output-tokens 512 --json
```

**7a-ii. Validate grader score distribution** — dry-run on 3-5 samples, scores should spread across 0.2-0.9.

**7a-iii. Create validation set** — 80/20 split for reward hacking detection.

#### 7b. Create eval job

Eval directly on the base model (Qwen3.5-4B) — do NOT run gpt-4o-mini eval first.

```bash
RECORD_COUNT=$(curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))")
echo "Records on gateway: $RECORD_COUNT"

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-4B" --output-dir evaluations

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file evaluations/eval-001.json
```

The poller auto-diagnoses before deciding to cancel: parsing failures → cancel, legitimate wrong answers → continue.

When eval completes, **immediately log the iteration:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --eval-file evaluations/eval-NNN.json \
  --changes "describe what changed" --change-type baseline --verdict PENDING
```

#### 7c. Pre-Training Readiness Gate

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check --file evaluations/eval-001.json
```

**Hard checks** (must ALL pass): sample count >= 50, score std > 0.10, avg score > 0.05, zero_score_frac < 10%.

**Decision:** Exit 0 = PASS → Step 7e. Exit 1 = FAIL → fix → Step 7b. Exit 2 = WARN → first eval: fix ALL warnings; subsequent: only fix `score_concentration` > 70%.

Log iteration verdict after every readiness check. Read `iterations.json` before making changes to check if the previous change helped.

> See [reference/readiness-gate.md](reference/readiness-gate.md) for full check tables, WARN safety guide, and research citations.

#### 7c+. Difficulty Probe

**Run after readiness gate passes, before training.**

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py difficulty-probe \
  --file evaluations/eval-001.json --save finetune-project/difficulty-report.json
```

**Decision:** Exit 0 = PASS (>= 30% learnable), exit 1 = FAIL (< 15%), exit 2 = WARN (15-30%).

If `SIGNAL DENSITY LOW`, harden trivial records:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py harden-records \
  --eval-file evaluations/eval-001.json --training-file finetune-project/training.jsonl --min-score 0.85
```

> See [reference/readiness-gate.md](reference/readiness-gate.md) for difficulty probe details and harden-records.

#### 7d. Base Model Selection via Eval

**Step 1:** Use the 4B eval from Step 7b.

**Step 2: Run source-part coverage audit (MANDATORY).** Verify training records cover ALL knowledge parts, not just easy ones.

> See [reference/readiness-gate.md](reference/readiness-gate.md) "Source-Part Coverage Audit" for the audit code and interpretation tables.

**Step 3: Check headroom and decide:**

| 4B avg score | Action |
|-------------|--------|
| **< 0.75** | Proceed to training with 4B. |
| **0.75 - 0.80** | Do NOT train 4B. Eval 0.8B. |
| **> 0.80** | Do NOT train 4B. Eval 0.8B. |

If 4B > 0.75, eval 0.8B:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-0.8B" --output-dir finetune-project/evaluations
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/evaluations/eval-NNN.json
```

| 0.8B avg | Action |
|----------|--------|
| **< 0.10** | Too hard. Try 2B, or accept 4B. |
| **0.10 - 0.75** | **Train 0.8B.** |
| **> 0.75** | Task too easy. Accept base model or make grader stricter. |

> See [reference/readiness-gate.md](reference/readiness-gate.md) "Headroom Gate" for full diagnostic trees when the gate fails.

**HEADROOM GATE (MANDATORY):** Base model avg must be between 0.05 and 0.75 before training.

Log the chosen model's baseline:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --eval-file evaluations/eval-NNN.json \
  --changes "Base model (MODEL_NAME) baseline eval. Chosen because [reason]." \
  --change-type baseline --verdict PASS
```

#### 7e. Start Training

**Only after readiness gate AND headroom gate pass.**

| Model | When to use | Max records (K=8) |
|-------|-------------|-------------------|
| `Qwen3.5-4B` | **Default**. 4B scores <0.75 | ~500 |
| `Qwen3.5-2B` | 4B >0.75, 0.8B <0.05 | ~800 |
| `Qwen3.5-0.8B` | 4B >0.75, 0.8B 0.05-0.75 | ~1000 |

These are the **only 3 base models** supported.

**Do NOT pass `--config` on the first training run.** Defaults are research-optimized (lr=1e-6, β=0.01, adaptive epochs, K=8). Only override after a diagnosed failure. Use `--inference-params` for `max_output_tokens` only.

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

**Monitor epoch evals during training.** Build a progression table comparing each epoch with the pre-training baseline. Write to `execution-log.md` immediately after each epoch eval — do NOT wait until training completes.

```
| Metric       | Baseline | Epoch 0 | Epoch 1 | Epoch 2 | Trend |
|--------------|----------|---------|---------|---------|-------|
| Avg score    | 0.540    | 0.647   | 0.790   | 0.841   | ↑     |
| Perfect rate | 39%      | 47%     | 62%     | 61%     | ↑     |
```

**Check triggers EVERY epoch eval fetch:** reward flat, score declining, perfect rate spike, length change, zero-std rising. If any trigger fires, read 5-10 individual records.

> See [reference/analysis-strategy.md](reference/analysis-strategy.md) Step 2b for trigger details.

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

#### 8a+. Filter Dead-Weight Records

Find records where max score < 0.1, diagnose why, remove, and regenerate replacements if needed:
```bash
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

**Fix records:**
```bash
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
