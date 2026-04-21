---
name: vllora-finetune
description: |
  Guide for fine-tuning LLMs using the vLLora platform. Use this skill whenever the user mentions fine-tuning, finetuning, training a custom model, creating training datasets, writing evaluation/grader functions, or improving model quality through iteration. Also use it when users have documents (PDFs, manuals, knowledge bases) they want to convert into training data, or when they ask about evaluating model outputs with scoring functions. This skill applies even if users don't explicitly say "vLLora" — any request to fine-tune or build training data for an LLM should trigger it.
---

# vLLora Finetune Skill

Run the full fine-tuning pipeline on the vLLora platform. Each step uploads to the gateway immediately so the UI shows progress in real time.

> **CRITICAL:** Execute all API calls directly via Bash. **NEVER create shell scripts (.sh files).**

## How vLLora Fine-Tuning Works

vLLora uses **GRPO** — reinforcement learning, NOT supervised fine-tuning. The model generates K completions per prompt (K=8), your grader scores each (0-1), and GRPO reinforces better completions. **The grader IS your training objective.** Score variance within the group drives learning — identical scores = zero gradient.

**Prerequisites (validate before starting):**
1. Base model must already have some capability on the task (GRPO amplifies, cannot create)
2. Task must be unambiguous — not binary yes/no (guess-proof)
3. Grader must produce smooth, varied scores (not pass/fail)

## The Pipeline

```
Define Objective → Extract Docs → Build Topics → Generate Data → Write Grader → Validate
     ↓ upload         ↓ upload        ↓ upload       ↓ upload       ↓ upload
   (workflow)      (knowledge)      (topics)       (records)      (grader)

                   ┌──────────────────────────────────────────────────────────┐
                   │                                                          │
Validate → Quality Gate → Verify → Eval BOTH (4B + 0.8B)                      │
               ↓ FAIL                     ↓                                   │
          Fix data (cheap)       Compare learnable% → Choose best model        │
               ↓                 ┌────────────────────────────────────┐        │
          Re-validate            │  Readiness on chosen model          │        │
                                 │  → Signal density check             │        │
                                 │  → Harden if trivial% high          │── PASS ──→ Train → Analyze → Done
                                 │  → Re-eval both if hardened         │              ↓ bad
                                 │       ↑         ↓ FAIL              │          Iterate (back to Eval)
                                 │       ├── Fix data/grader ──────────┘
                                 │       └── Fix topics (if stalled 2+ evals)
                                 └────────────────────────────────────┘
```

**Hard rules:**
- **Respect step dependencies.** Step 4 (records) MUST finish before Step 5 (grader).
- **Execute ALL steps (1-9).** Do NOT stop at Step 6.
- **Eval first, train later.** Only train after readiness gate passes.
- **Auto-iterate when non-interactive.** Max 5 eval-only, max 3 training iterations.
- **Update analysis after each step** (UI displays it):
  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
    --project-dir finetune-project --section <section> --status <status> \
    --summary "Plain language insight" --assessment "What it means" \
    --metrics '{"key": value}' --next-action "What to do next"
  ```
  Sections: `sources`, `trace-analysis`, `training-data`, `evaluator`, `evaluation`, `training`.
- **Cancel running jobs before re-eval/re-train** (they use old grader/records):
  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py cancel-eval --workflow-id $WORKFLOW_ID --eval-id <ID>
  uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py cancel-training --workflow-id $WORKFLOW_ID --job-id <ID>
  ```
- **Checkpoint after each step:**
  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step <STEP_NAME> --project-dir finetune-project --workflow-id $WORKFLOW_ID
  ```
  Step names: `create-workflow`, `extract`, `topics`, `relations`, `generate-data`, `grader`, `validate`, `data-quality-gate`, `eval-N`, `readiness-pass`, `difficulty-probe`, `training`, `analyze`.
- **NEVER modify skill files.** `.claude/skills/` and `.claude/agents/` are read-only.

### Working Directory

```
finetune-project/
├── training.jsonl, topics.json, relations.json, config.json
├── execution-log.md, iterations.md, pipeline-journal.json, analysis.json
├── distilabel/                # (distilabel backend only) Step 4 intermediates
│   ├── text-candidates.jsonl
│   ├── text-selected.jsonl
│   ├── text-selection-report.json
│   ├── apigen-candidates.jsonl
│   ├── apigen-selected.jsonl
│   ├── apigen-merge-report.json
│   └── pipeline-metadata.json
├── knowledge/                  # Per-document subdirs
│   ├── {doc-slug}/             # extraction-result.json, knowledge_parts.json, parts-index.json
│   └── all-parts-index.json    # Merged index across ALL documents
├── trace-analysis/             # (combined mode only)
│   ├── priority.json           #   Per-topic frequency + failure + priority score
│   ├── topics.json             #   Coverage gaps vs PDF topics
│   ├── prompts.json            #   Production system prompt + seed queries
│   ├── grader-hints.json       #   Failure dimensions + grader criteria
│   ├── tool-schemas.json       #   (tool-calling) OpenAI-format tool definitions
│   └── decision-points.jsonl   #   (tool-calling) Multi-turn training records from traces
├── quality-checker/            # grader.js (active), grader-draft.js (trace-generated)
├── test-runs/                  # eval-001.json, eval-002.json, ...
└── training/                   # train-001.json, {JOB_ID}-metrics.json, monitor reports
```

**Workflow ID comes from `config.json` ONLY.** Do NOT search the gateway API for workflows by name.

**Table-heavy documents**: Write a "synthesis part" — a prose summary of key facts from tables.

### Execution Log

Use `log-step` ONLY — do NOT write manually. Log at sub-step granularity with numbers. MANDATORY decision card at every completed step: `--observation`, `--analysis`, `--decision`, `--evidence`.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project --step step_4_generation --action generate_records --status completed \
  --summary "Generated 401 records with 76 seed queries (19%)" \
  --observation "12 topics, priority range 0.00-0.08" \
  --decision "Trace-weighted allocation" \
  --evidence '{"total": 401, "seeds": 76}'
```

**Canonical step names** (use these exact strings in `--step`): `step_1_objective`, `step_2_extraction`, `step_3_topics`, `step_4_generation`, `step_5_grader`, `step_5_5_validate`, `step_6_verify`, `step_7_eval`, `step_8_training`.

**Sub-step milestones to log:**

| Step | Milestones |
|------|-----------|
| Step 2 | route_and_extract, build_parts, consolidate, upload_knowledge |
| Step 3 | design_topics, upload_topics, build_relations, upload_relations |
| Step 4 | generate_records/distilabel/apigen (count per topic), derive_gt, dedup, upload_records |
| Step 5 | write_grader, test_grader (adversarial results), upload_grader |
| Step 7 | create_eval, poll_eval, readiness_check, model_selection |
| Step 8 | create_training, poll_training, post_training_eval |

> See [reference/pipeline-journal-schema.md](reference/pipeline-journal-schema.md) for full schema and examples.

---

### Prerequisites

```bash
curl -s http://localhost:9090/finetune/workflows | head -c 100 && echo " OK" || echo "ERROR: Gateway not running"
uv --version 2>/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Resume from Previous Run

```bash
if [ -f finetune-project/config.json ]; then
  WORKFLOW_ID=$(python3 -c "import json; print(json.load(open('finetune-project/config.json'))['workflow_id'])")
  uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py status --workflow-id $WORKFLOW_ID
fi
```

Follow the status command's recommendation. Sync jobs: `sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project`.

---

### Step 1: Define the Objective & Detect Inputs

Ask the user what behaviors the model should learn. Auto-detect input mode:

```bash
HAS_PDFS=false; HAS_TRACES=false
[ -d pdfs ] && find pdfs -maxdepth 1 \( -name "*.pdf" -o -name "*.md" \) 2>/dev/null | grep -q . && HAS_PDFS=true
find . -maxdepth 1 \( -name "source_traces_semconv.json" -o -name "*.traces.json" \) 2>/dev/null | grep -q . && HAS_TRACES=true
```

| Input detected | Mode | Behavior |
|---|---|---|
| `pdfs/` only | PDF-only | Standard knowledge pipeline |
| `*.traces.json` only | Trace-only | OTel tool-routing pipeline |
| **Both** | **Combined** | Trace analysis → enrich topics, weight records, auto-generate grader |

Create workflow: `finetune.py create-workflow --name "..." --objective "..."` (these are the **only** accepted flags; do NOT pass `--input-mode`, `--output-dir`, or `--project-dir`). After the call returns a workflow_id, write `config.json` yourself with `{workflow_id, input_mode, ...}`. In combined mode use a placeholder objective — update after Step 2C with trace failure rates.

### Step 2: Extract Inputs

Run whichever applies — or both in parallel:

**2A. Documents** — Spawn `knowledge-extractor` subagent per PDF. Uses `extract_router.py` → `build_knowledge_parts.py`. Validate with `validate_extraction.py --fix`. See [reference/extraction-guide.md](reference/extraction-guide.md).

**2B. OTel traces** — skip directly to **2C**. The `source_traces_semconv.json` file itself is the pipeline input; there is no separate "extract" step for traces (the obsolete `otel_extract.py` is deprecated and its output is unused). `trace_analyze.py` in 2C reads the raw traces directly; `upload_trace_analysis.py` registers the trace bundle as a `kind=otel-trace` knowledge source for UI display.

**2C. Trace Analysis (combined mode only)** — Run `trace_analyze.py`, upload results, write `trace-influence` to `analysis.json`. See [reference/trace-combined-mode.md](reference/trace-combined-mode.md) for full checklist.

**Gate:** All extractions validated + uploaded to gateway before Step 3.

### Step 3: Build Topic Hierarchy

**Outputs:** `topics.json`, `relations.json`

Design by **skill** (what model learns to DO), not document structure. Use nested JSON with `"children"` arrays. Target 15-25 records per leaf, 5-40 leaves. IDs are human-readable slugs (not UUIDs). MANDATORY: `"category"` on every leaf.

**Tool-calling mode (tool-schemas.json exists):** `trace-analysis/topics.json` already has the correct leaf topics (one per tool, slugs match decision-points.jsonl). Use those as leaves — DO NOT invent abstract category-only roots (e.g. "customer-service-actions") that have no leaves. Records must reference leaf slugs that exist in topics.json, otherwise cross-reference validation fails.

Delegate `relation-builder` subagent for topic-part linking. Upload:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-topics --workflow-id $WORKFLOW_ID --file topics.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-relations --workflow-id $WORKFLOW_ID --file relations.json
```

> See [reference/topic-hierarchy.md](reference/topic-hierarchy.md) for guidelines, JSON format, and examples.

### Step 4: Generate Training Data

Resolve the Step 4 backend from `config.json`:
- If `generation_backend` is present, use it exactly: `native`, `distilabel`, or `nemo`
- Else if `use_nemo: true`, resolve to `nemo`
- Else resolve to `native`

Backend routing:
- **`generation_backend: "nemo"`**: spawn `nemo-data-generator` subagent (see [reference/nemo-guide.md](reference/nemo-guide.md))
- **`generation_backend: "distilabel"`**: spawn `distilabel-data-generator` subagent (see [reference/distilabel-guide.md](reference/distilabel-guide.md))
- **`generation_backend: "native"`** or unset: use the native flow below

**Auto-detect agent type:**
- **Tool-calling + native backend** (tool-schemas.json exists): `cp trace-analysis/decision-points.jsonl training.jsonl` — that is the ENTIRE step. Multi-turn decision points already have the correct `messages`/`tools`/`ground_truth` shape. Do NOT use single-turn synthetics.
- **Text-only**: `generate_records.py --records-per-topic 30 --parallel 4 --enrich-sources`. Combined mode: add trace flags per [reference/trace-combined-mode.md](reference/trace-combined-mode.md) § Step 4.

**Distilabel backend contract:**
- **Text-only**: run `run_distilabel_text_backend.py` → `apply_deita_selection.py` → `training.jsonl`
- **Combined text-only**: same as above, but consume `trace-analysis/priority.json` and `trace-analysis/prompts.json` for topic weighting and seed queries
- **Tool-calling** (tool-schemas.json exists): keep `trace-analysis/decision-points.jsonl` as the canonical base, run `run_distilabel_apigen_backend.py` only to add rare-topic/edge-case augmentations, then merge into `training.jsonl`
- **Never rewrite canonical decision-point rows.** APIGen is augmentation-only around the canonical dataset
- **Never flatten tool-calling records into plain text** and never stringify structured tool `ground_truth`

**CRITICAL — tool-calling records MUST stay multi-turn.** Do NOT rewrite `training.jsonl` with inline Python. Specifically banned anti-patterns (these break tool-calling GRPO):
- `flatten_record(...)` / concatenating turns into one user message with `USER:`/`ASSISTANT:`/`TOOL RESULT:` prefixes
- Adding `"GT|"` prefix to `ground_truth` or otherwise converting it to a string — GT MUST stay as a `{name, arguments}` dict
- Appending response-format instructions (`<tool_call>{...}</tool_call>`) to the user message — the model learns native `tool_calls`, not text-embedded calls
- Stripping the `tools` field or the leading `system` message

`cp` is literally the whole operation for tool-calling. `upload-records` handles gateway serialization. If you think the data "needs transformation", STOP and re-read this section.

**Distilabel config shape** (merged from `finetune-defaults.json` into `config.json` the same way as other workflow settings):

```json
{
  "generation_backend": "distilabel",
  "distilabel": {
    "model": "gpt-4o-mini",
    "base_url": "http://localhost:9090/v1",
    "keep_intermediate": true,
    "text_recipe": "instruction_backtranslation_deita",
    "tool_recipe": "apigen",
    "apigen_tool_module": null,
    "min_records_per_topic": 25,
    "target_records_per_topic": 30
  }
}
```

**Balance rare topics via paraphrase (tool-calling only):** Real traces are unbalanced — rare tools (e.g. `modify_pending_order_payment`) may have only 4 records. Run the paraphrase generator to bring each topic to the minimum count. It rewrites ONLY the final user turn (user voice, same intent, same factual values) and preserves full prior context, tool list, and ground truth — the Trajectory2Task approach (arXiv:2601.20144). This is NOT the banned single-turn synthesis.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/paraphrase_rare_topics.py \
  --file finetune-project/training.jsonl --min-per-topic 25
```

Upload: `upload-records --workflow-id $WORKFLOW_ID --file training.jsonl --force`

**ALWAYS deduplicate:** `deduplicate_records.py training.jsonl --threshold 0.85`

**Quality check:** Read 3-5 records per topic. Check GT vocabulary, factual accuracy, format.

> See [reference/data-format.md](reference/data-format.md) for all options, multi-label GT, difficulty control, and `--ground-truth-format`.

### Step 4.5: Topic Balance Check

**MANDATORY: minimum 25 records per leaf topic.** Generate with `--records-per-topic 30` (buffer for reconciliation drift). If any topic below 25: diagnose root cause → fix → regenerate with `--append`.

### Step 5: Write the Grader

Write `quality-checker/grader.js`. Combined mode: generate draft from `grader_from_traces.py`, review with user.

**Hard rules:** NEVER return 0.0 for parsing failures (use LLM fallback). NEVER add HARD GATE=0.0. Wrong answers MUST get 0.02-0.10. NEVER remove partial credit.

**Mandatory dry-run (4 tests):** hand-crafted row, live model response (5 samples), adversarial leniency test (`test-grader --samples 10`), validation protocol.

**MANDATORY discrimination check (tool-calling mode):** before upload, verify the grader can distinguish correct tool calls from systematically corrupted ones:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py grader-discriminate \
  --workflow-id $WORKFLOW_ID \
  --records finetune-project/training.jsonl \
  --grader finetune-project/quality-checker/grader.js
```
Hard-fails (exit 1) if any corruption class (wrong_name / missing_required_arg / arg_value_mutation / arg_key_rename) fails mean-gap ≥ 0.30 OR pairwise-winrate ≥ 0.80. If it fails, the grader has a stub name-check, a naive `String()` compare, or a dropped-required-field silent-pass — fix the grader, rerun. Do NOT upload a grader that can't discriminate.

Upload + verify + checkpoint:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file quality-checker/grader.js
```

> See [reference/grader-writing.md](reference/grader-writing.md) for patterns, rubric design, and length exploitation defenses.

### Step 5.5: Validate + Quality Gate

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl --topics topics.json
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl --topics topics.json --all-gates --sample 30
```

Exit 0=PASS, 1=FAIL (fix), 2=WARN. Write results to `analysis.json`. See [reference/data-quality-gate.md](reference/data-quality-gate.md).

### Step 6: Verify & Hand Off

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py verify --workflow-id $WORKFLOW_ID
```

All counts > 0 and evaluator = YES. **Proceed to Step 7.**

### Step 7: Evaluate & Validate Before Training

**Eval first, train later.** Max 5 eval-only iterations.

#### 7a-b. Eval + Choose Best

**Tool-calling mode (tool-schemas.json exists): eval 4B ONLY.** The 0.8B and 2B models cannot reliably emit native `tool_calls` — running them wastes cloud compute. Skip both entirely; the readiness gate applies to 4B.

**Text-only mode: eval both 4B and 0.8B; fall back to 2B only if 0.8B avg < 0.05.**

Tool-calling flow — ONE eval:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval --workflow-id $WORKFLOW_ID --model "Qwen3.5-4B" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-001.json
```

Text-only flow — two evals, one readiness-check per model:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval --workflow-id $WORKFLOW_ID --model "Qwen3.5-4B" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-001.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval --workflow-id $WORKFLOW_ID --model "Qwen3.5-0.8B" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-002.json
```

Run `readiness-check` with `--training-file` and `--objective-target-tokens` (classification: 50-100, QA: 80-150, **conversational: 200-400**, analysis: 200-500).

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file finetune-project/test-runs/eval-001.json \
  --training-file finetune-project/training.jsonl --objective-target-tokens <target>
```

**Text-only only: choose model with highest learnable%.** GATES: chosen avg between 0.05 and 0.75. Do NOT create additional evals in tool-calling mode.

> See [reference/readiness-gate.md](reference/readiness-gate.md) for model selection table, headroom gate, and diagnostic trees.

**MANDATORY after EVERY eval:** `grader-sanity-check --eval-file test-runs/eval-NNN.json`. Hard-fails if any check trips (LLM fallback >10%, dump-all gaming, default-mode collapse). Do NOT proceed if it fails.

**Do NOT filter zero-scoring records before training.** K=1 score of 0 ≠ K=8 all-zeros. Hard examples yield 47% gains. Only filter confirmed refusals (`--reason-pattern "refused"`).

**`length_drift_risk`** — if it fires: (1) check `objective_target_tokens` is correct for task type (conversational=200-400, not 80), (2) distinguish eval model verbosity from base model, (3) max 2 iterations for same issue then escalate.

#### 7c. Readiness Gate

Exit 0=PASS → 7c+. Exit 1=FAIL → fix data/grader → 7b. Exit 2=WARN → fix `score_concentration` > 70%.

Hard checks: sample >= 50, std > 0.10, avg > 0.05, zeros < 10%, no `spec_mismatch`, no `length_drift_risk`.

#### 7c+. Difficulty Probe

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py difficulty-probe --file test-runs/eval-NNN.json --save difficulty-report.json
```

If trivial > 40% AND learnable < 35%: `harden-records` → re-upload → re-eval BOTH → re-choose.

#### 7d. Coverage Audit

Verify training records cover ALL knowledge parts. See [reference/readiness-gate.md](reference/readiness-gate.md).

#### 7e. Start Training

Only 3 base models: Qwen3.5-4B, 2B, 0.8B. Do NOT pass `--config` on first run — defaults are model-size-aware:

| Model | LR | Beta | scale_rewards | K |
|-------|-----|------|---------------|---|
| 0.8B | 5e-6 | 0 | group | 16 |
| 2B | 3e-6 | 0 | group | 16 |
| 4B | 2e-6 | 0.01 | none | 8 |

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID --base-model "Qwen3.5-4B" --output-model "project-v1" --output-dir finetune-project/training
```

> See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) for defaults, K selection, and advanced config.

#### 7f. Monitor Training

Spawn `training-monitor` subagent, then poll (**--max-wait 7200**, never less):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training --file training/train-001.json --max-wait 7200
```

If auto-cancelled for clipping: run `diagnose-clipping` FIRST, then apply the recommended fix. See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) §Clipping.

### Step 8: Analyze Results

Sync jobs first: `sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project`

> **Read [reference/analysis-strategy.md](reference/analysis-strategy.md)** for decision trees and presentation format.

#### 8a. Analyze eval — read BOTH low-scoring and high-scoring responses. Check for grader shortcuts.

#### 8b. Post-Training Eval

```bash
PROVIDER_JOB_ID=$(python3 -c "import json; print(json.load(open('training/train-001.json'))['provider_job_id'])")
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "finetuned/${PROVIDER_JOB_ID}" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-NNN.json
```

**MANDATORY:** Run `grader-sanity-check --eval-file test-runs/eval-NNN.json` after EVERY eval.

| Improvement (Δ) | Verdict | Action |
|---|---|---|
| > +0.15 | Strong | Deploy |
| +0.05 to +0.15 | Moderate | Deploy if acceptable |
| < +0.05 | Marginal/None | Run 8c first |
| < -0.02 | Regression | Deploy base model |

#### 8c. Analyze training metrics

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py --workflow-id $WORKFLOW_ID --job-id $JOB_ID --save
```

> See [reference/analysis-strategy.md](reference/analysis-strategy.md) Part 2 for diagnosis tables.

### Step 9: Iterate (If Needed)

> **Read [reference/iteration-strategy.md](reference/iteration-strategy.md)** for full diagnosis and escalation.

**9a. Eval-only** (readiness failed):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py diagnose-grader --file test-runs/eval-001.json --workflow-id $WORKFLOW_ID
```

| Diagnosis | Fix |
|-----------|-----|
| `FIX GRADER: parsing failures` | Broaden regex, add LLM fallback |
| `FIX GRADER (partial credit)` | Add partial credit (0.01-0.1) |
| `FIX RECORDS: refusals` | Regenerate with `--ground-truth-format` |
| Score clustering >70% | Use LLM-as-judge template |

NEVER remove partial credit. NEVER make grader more binary. Cancel running evals first → fix → return to 7b.

**9b. Post-training**: Use diagnosis table in [reference/analysis-strategy.md](reference/analysis-strategy.md) Part 2d. Cancel running jobs first.

**9c. Topic-level** (stalled 2+ evals): `diagnose-grader` per-topic → split/remove dead topics → return to 7b.

**Limits:** Max 5 eval-only + 3 training. Base model ladder: 0.8B → 2B → 4B.

---

## Reference Files

| File | When to read |
|------|-------------|
| [reference/api-reference.md](reference/api-reference.md) | Making API calls — all gateway endpoints |
| [reference/data-format.md](reference/data-format.md) | Generating JSONL — format, options, multi-label GT |
| [reference/extraction-guide.md](reference/extraction-guide.md) | Extraction details — ODL, subagent params |
| [reference/grader-writing.md](reference/grader-writing.md) | Writing graders — patterns, length exploitation |
| [reference/topic-hierarchy.md](reference/topic-hierarchy.md) | Designing topics — structure, JSON format |
| [reference/readiness-gate.md](reference/readiness-gate.md) | Readiness gate, difficulty probe, model selection |
| [reference/iteration-strategy.md](reference/iteration-strategy.md) | Diagnosing stalls, escalation ladder |
| [reference/analysis-strategy.md](reference/analysis-strategy.md) | **Step 8** — decision trees, training diagnosis |
| [reference/training-metrics-guide.md](reference/training-metrics-guide.md) | **Step 8** — GRPO metrics, defaults |
| [reference/trace-combined-mode.md](reference/trace-combined-mode.md) | Combined mode — trace analysis, enrichment |
| [reference/data-quality-gate.md](reference/data-quality-gate.md) | Quality gate thresholds |

## Helper Scripts

Run with `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>`. Key ones: `finetune.py` (25 subcommands), `generate_records.py`, `analyze_training.py`, `dry_run_grader.py`, `data_quality_gate.py`. Run `--help` for usage.

**Section analysis summaries** must be in plain language — the UI displays them to non-ML users. Never use: GRPO, learnable%, zero-variance, K=8. Frame as "so what": not "failure_rate: 42%" but "customers struggled with exchanges 42% of the time."
