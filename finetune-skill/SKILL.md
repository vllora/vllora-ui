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
- **Update section analysis after each step** (shared with the UI — user sees exactly what you think):
  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
    --project-dir finetune-project --section <section> --status <status> \
    --summary "One-line insight" --assessment "What it means" \
    --metrics '{"key": value}' --blockers '[]' --next-action "What to do next"
  ```
  Sections: `sources`, `trace-analysis`, `training-data`, `evaluator`, `evaluation`, `training`. This writes to `analysis.json` — the UI displays it, and you read it back when resuming. Both you and the user see the same insight.
- **Checkpoint after each step:**
  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/checkpoint.py done --step <STEP_NAME> --project-dir finetune-project --workflow-id $WORKFLOW_ID
  ```
  Step names: `create-workflow`, `extract`, `topics`, `relations`, `generate-data`, `grader`, `validate`, `data-quality-gate`, `eval-N`, `readiness-pass`, `difficulty-probe`, `training`, `analyze`.

### Working Directory

```
finetune-project/
├── training.jsonl, topics.json, relations.json, config.json
├── execution-log.md, iterations.md, pipeline-journal.json
├── knowledge/                  # Per-document subdirs
│   ├── {doc-slug}/             # {slug}.md, extract.py, knowledge_parts.json, parts-index.json
│   └── all-parts-index.json   # Merged index across ALL documents
├── trace-analysis/             # (combined mode) Insights from OTel traces
│   ├── priority.json           #   Per-topic frequency + failure + priority score
│   ├── topics.json             #   Coverage gaps vs PDF topics
│   ├── prompts.json            #   Production system prompt + seed queries
│   └── grader-hints.json       #   Failure dimensions + grader criteria
├── quality-checker/            # Grader scripts
│   ├── grader.js               #   Active grader
│   └── grader-draft.js         #   (combined mode) Auto-generated from traces
├── test-runs/                  # Per-eval subfolders: eval-001/, eval-002/, ...
└── training/              # train-001.json, {JOB_ID}-metrics.json, ...
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
3. **MANDATORY: Write a decision card** at every completed step using `--observation`, `--analysis`, `--decision`, `--evidence`
4. Include **numbers** in every summary — never "Processing PDFs...", always "Processing 1 PDF (FDA-FALCPA.pdf) via OpenDataLoader..."

**Decision cards** capture your reasoning at each step. This is mandatory because:
- It helps the user understand WHY you made each choice (transparency)
- It helps YOU make better decisions — structured reflection improves agent reasoning (arXiv:2405.06682)
- It produces data for the UI's Pipeline Analysis view

**Decision card fields:**
- `--observation` — What you saw (metrics, data state, results). Be specific with numbers.
- `--analysis` — What it means (comparison, pattern detection, diagnosis). Connect observations to implications.
- `--decision` — What you chose to do and WHY. Reference the analysis.
- `--evidence` — JSON with before/after data or key metrics supporting the decision.

**Example: Step 4 (Generation) with decision card:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_4_generation --action generate_records --status completed \
  --summary "Generated 401 trace-weighted records with 76 seed queries (19%)" \
  --observation "12 topics, trace priority range 0.0000-0.0848. modify-pending-order-items: 20% freq, 42% failure. modify-pending-order-payment: 0.9% freq, 0% failure." \
  --analysis "Equal allocation (25/topic) wastes budget on rarely-used procedures. 110x frequency difference between highest and lowest topics." \
  --decision "Trace-weighted allocation: proportional to priority_score. 20% seed queries from real traces." \
  --evidence '{"before": {"strategy": "equal", "per_topic": 25}, "after": {"strategy": "trace-weighted", "highest": 50, "lowest": 3, "seeds": 76, "total": 401}}'
```

**Example: Step 7 (Readiness iteration) with decision card:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_7_eval --action readiness_iteration --status completed \
  --summary "Readiness FAIL → fixed grader (added conciseness) → re-eval → PASS. Chose 0.8B." \
  --observation "4B: avg=0.731, learnable=16%. 0.8B: avg=0.429, learnable=34%. length_drift_risk fired on both." \
  --analysis "4B too easy (avg>0.7, only 16% learnable). 0.8B has better training signal (34% learnable, good variance). length_drift was from missing conciseness penalty in grader." \
  --decision "Chose 0.8B (2x more learnable). Fixed grader with DRPO-safe conciseness criterion. Set objective_target_tokens=300 for conversational agent." \
  --evidence '{"model_comparison": {"4B": {"avg": 0.731, "learnable": "16%"}, "0.8B": {"avg": 0.429, "learnable": "34%"}}, "grader_fix": "added conciseness criterion", "iterations": 2}'
```

**Older example format (still valid but add decision card fields):**
```bash
# 2a. Submit to extraction
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_2_extraction --action extraction_start --status in_progress \
  --summary "Extracting 1 PDF (FDA-FALCPA.pdf) via OpenDataLoader"

# 2b. Extraction result
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-step \
  --project-dir finetune-project \
  --step step_2_extraction --action extraction_complete --status completed \
  --summary "Extracted 142 elements from FDA-FALCPA.pdf via ODL (digital PDF)"

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
| Step 2: Extract | route_and_extract (backend per doc), build_parts, consolidate, upload_knowledge |
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

**Reusing extractions across workflows:** Existing `knowledge/{slug}/extraction-result.json` files (ODL or ODL Hybrid) can be reused even with a new workflow. Do NOT delete `knowledge/` when starting fresh from the same documents. If an older project only has pre-ODL extraction outputs, re-run extraction with the current ODL router.

| State found | Action |
|-------------|--------|
| `config.json` + `knowledge/` + no `topics.json` | Resume from Step 3 |
| Everything through `quality-checker/grader.js` + no `test-runs/` | Resume from Step 7b |
| `test-runs/` + no readiness-pass checkpoint | Run `readiness-check` (Step 7c) |
| Readiness gate PASS + no `training/` | Create training job (Step 7e) |
| `training/` with status `running` | Poll the existing job |
| `training/` with early_stop + base model avg >0.75 | Run Step 7d headroom diagnostic. See [reference/readiness-gate.md](reference/readiness-gate.md) |

---

### Step 1: Define the Objective & Detect Inputs

Ask the user what behaviors the model should learn. Produce an **objective statement** and a **system prompt** ("You are...") for Step 4.

**Combined mode — trace-informed objective:** In Step 1, use a placeholder objective (e.g., "Train a retail CS agent"). After Step 2C (trace analysis), **UPDATE the objective** with trace findings by reading `trace-analysis/priority.json` and running:
```bash
# Update objective with trace insights (after Step 2C)
TOP_FAILURES=$(python3 -c "import json; p=json.load(open('finetune-project/trace-analysis/priority.json')); items=sorted(p.items(),key=lambda x:x[1].get('failure_rate',0),reverse=True)[:3]; print(', '.join(f'{t} ({int(v[\"failure_rate\"]*100)}% failure)' for t,v in items))")
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-workflow \
  --workflow-id $WORKFLOW_ID \
  --objective "Train a model focusing on high-failure areas: $TOP_FAILURES — the highest-failure actions in production traces."
```
The objective should reference: (1) what actions users actually perform, (2) which actions fail most, (3) what the model needs to improve.

**Auto-detect input mode:** Check the user's project folder for available inputs:

```bash
# Detect inputs (uses find to avoid zsh nomatch errors with globs)
HAS_PDFS=false
HAS_TRACES=false
[ -d pdfs ] && find pdfs -maxdepth 1 \( -name "*.pdf" -o -name "*.md" \) 2>/dev/null | grep -q . && HAS_PDFS=true
find . -maxdepth 1 \( -name "source_traces_semconv.json" -o -name "*.traces.json" \) 2>/dev/null | grep -q . && HAS_TRACES=true

if [ "$HAS_PDFS" = true ] && [ "$HAS_TRACES" = true ]; then
  echo "Combined mode: PDFs + traces detected → trace-informed pipeline"
elif [ "$HAS_PDFS" = true ]; then
  echo "PDF-only mode: standard knowledge pipeline"
elif [ "$HAS_TRACES" = true ]; then
  echo "Trace-only mode: OTel tool-routing pipeline"
fi
```

| Input detected | Mode | Behavior |
|---|---|---|
| `pdfs/` only | PDF-only | Standard knowledge pipeline (existing) |
| `*.traces.json` only | Trace-only | OTel tool-routing pipeline (see `finetune-skill-otel/`) |
| **Both PDFs + traces** | **Combined** | Run trace analysis (Step 2C) → enrich topics, weight records, auto-generate grader |

Save the detected mode to `config.json`:
```bash
if [ -f finetune-project/config.json ]; then
  WORKFLOW_ID=$(python3 -c "import json; print(json.load(open('finetune-project/config.json'))['workflow_id'])")
else
  WORKFLOW_ID=$(uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-workflow \
    --name "My Project" --objective "Train a model to..." | tail -1)
  mkdir -p finetune-project
  cat > finetune-project/config.json << EOF
{"workflow_id": "$WORKFLOW_ID", "gateway_url": "http://localhost:9090", "use_nemo": false, "input_mode": "combined"}
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

- **2A. Documents (PDFs, markdown, images)** — extract via `extract_router.py` / `build_knowledge_parts.py`. The document path below.
- **2B. OTel GenAI traces (LLM call logs)** — extract via `otel_extract.py`. Mirrors 2A but reads OpenTelemetry GenAI spans (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.*`) and writes the same `knowledge_parts.json` format. See [reference/otel-trace-ingestion.md](reference/otel-trace-ingestion.md). Use this when the user wants to clone the behavior of an existing LLM app rather than teach the model new knowledge.

  ```bash
  uv run ${CLAUDE_SKILL_DIR}/scripts/otel_extract.py traces.json \
      --out-dir finetune-project/knowledge
  ```

#### 2A. Documents

Extract knowledge from all documents. Each document processed by a `knowledge-extractor` subagent.

**Outputs:** `knowledge/{slug}/knowledge_parts.json`, `knowledge/{slug}/parts-index.json`, `knowledge/all-parts-index.json` (merged)

**2a. Check prerequisites** — `java -version` must report 11+ (for ODL). Ensure `opendataloader-pdf[hybrid]` is installed (`pip install -U "opendataloader-pdf[hybrid]"`). Hybrid mode uses the `opendataloader-pdf-hybrid` backend server. The router auto-manages a local backend on `http://127.0.0.1:5002` for scanned PDFs unless `--hybrid-url` points to an existing server.

**2b. Extract via the router** — Run `extract_router.py` with `--skip-existing`. It auto-dispatches each PDF to ODL (digital, fast Java-only) or ODL Hybrid (scanned, server-backed OCR + table recognition) and writes `extraction-result.json` plus a sibling `extraction-status.json` recording the backend used. Spawn one `knowledge-extractor` subagent per document to build parts. Wait for ALL to complete.

> Subagents MUST use `build_knowledge_parts.py` as the default extraction script. All extractions produce ODL `kids[]` format, which the script handles via the ODL branch. Tables are preserved as structured table parts, lists remain markdown text parts, and captions remain separate linked text parts. Do NOT write custom extract.py unless explicitly requested or `build_knowledge_parts.py` produces 0 parts.

> Subagents upload to the gateway. Do NOT re-upload yourself — creates duplicates.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/extract_router.py --batch --skip-existing \
  "pdfs/doc1.pdf:finetune-project/knowledge/doc1-slug/extraction-result.json" ...
```

> See [reference/extraction-guide.md](reference/extraction-guide.md) for subagent parameters and router flags.

**2c. Merge indexes** — Merge all `parts-index.json` into `knowledge/all-parts-index.json`.

**2d. Validate — MUST PASS:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

**Hard gate.** If validation fails after `--fix`: fix the specific issues (you can read PDF pages directly with the `Read` tool to fix broken tables), re-validate. Do NOT silently proceed with FAIL status.

**2e. Verify gateway upload** — `verify --workflow-id $WORKFLOW_ID --no-journal`. Confirm source count matches PDFs. Delete duplicates if found. Use `--no-journal` here — this is a diagnostic check, not Step 6.

#### 2C. Trace Analysis (Combined Mode Only)

> **Only runs when BOTH PDFs and traces are detected in Step 1.**
> This step analyzes OTel traces to inform the rest of the pipeline — topics, record allocation, seed queries, and grader design.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/trace_analyze.py \
  source_traces_semconv.json \
  --output-dir finetune-project/
```

**Produces 4 artifacts** (all visible to the user in `finetune-project/`):

| Artifact | What it contains | Consumed by |
|---|---|---|
| `trace-analysis/priority.json` | Per-topic frequency + failure rate + priority score | Step 4 (record allocation) |
| `trace-analysis/topics.json` | Topics found in traces, coverage gaps vs PDF topics | Step 3 (topic enrichment) |
| `trace-analysis/prompts.json` | Production system prompt (simplified) + real user queries | Step 4 (seed prompts) |
| `trace-analysis/grader-hints.json` | Failure dimensions + prompt rules + calibration pairs | Step 5 (grader draft) |

**Upload trace data to gateway** (so the UI can display it):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/upload_trace_analysis.py \
  --workflow-id $WORKFLOW_ID \
  --traces source_traces_semconv.json \
  --project-dir finetune-project/ \
  --name "OTel Traces"
```
This uploads: (1) the trace bundle as a knowledge source (appears in UI Sources view), (2) the 4 trace analysis artifacts to the trace-analysis endpoint (appears in UI Topics/Grader views).

**MANDATORY: Write trace influence summary to analysis.json** (users see this in the Training Impact view). Do NOT skip this step — the UI shows empty Training Impact without it:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
  --project-dir finetune-project --section trace-influence --status ready \
  --summary "Production traces shaped your training in 5 ways." \
  --assessment "1. System prompt: using the actual production prompt (not a custom one). 2. Topics: N topics from traces, M from documents. 3. Record allocation: high-failure topics get more examples (e.g., address-modify gets 50 vs payment-modify gets 25). 4. Seed queries: N real customer questions injected. 5. Grader: N failure dimensions from production errors." \
  --metrics '{"trace_count": N, "system_prompt_source": "trace", "topics_from_traces": N, "seed_queries": N, "grader_dimensions_from_traces": N, "high_failure_topics": ["topic1", "topic2"]}'
```

**Update the workflow objective** with trace findings (Step 1 used a placeholder):
```bash
TOP_FAILURES=$(python3 -c "import json; p=json.load(open('finetune-project/trace-analysis/priority.json')); items=sorted(p.items(),key=lambda x:x[1].get('failure_rate',0),reverse=True)[:3]; print(', '.join(f'{t} ({int(v[\"failure_rate\"]*100)}% failure)' for t,v in items))")
echo "High-failure areas: $TOP_FAILURES"
```

**Present the trace analysis summary to the user** before proceeding:
- Show the priority table (top 5 high-priority and bottom 3 low-priority topics)
- Flag any coverage gaps (topics in traces but not in PDFs)
- Show the simplified production system prompt
- Ask if the user wants to adjust priorities before proceeding

**Step 2C completion checklist** (all must be done before Step 3):
- [ ] 4 trace analysis artifacts in `trace-analysis/`
- [ ] Trace data uploaded to gateway
- [ ] `analysis.json` has `trace-influence` section (MANDATORY)
- [ ] Objective updated with trace failure rates
- [ ] Summary presented to user

---

### Step 3: Build Topic Hierarchy

> **PREREQUISITES:** Step 2 fully complete. Do NOT start while extraction is running.

**Outputs:** `topics.json`, `relations.json`, updated `all-parts-index.json`

**Combined mode — trace topic enrichment:** If `finetune-project/trace-analysis/topics.json` exists (from Step 2C):
1. Start with PDF-derived topics (comprehensive domain coverage)
2. Check `trace-analysis/topics.json` for coverage gaps — topics that appear in traces but not in PDF topics
3. **ADD** trace-discovered topics as new leaf topics (flag with `"source": "trace"` in metadata)
4. **NEVER REMOVE** PDF-derived topics even if they have low trace frequency — rare topics may be critical
5. Show the user which topics were added from traces vs which came from PDFs

**Reuse existing topics:** If `topics.json` exists from a prior run, treat it as authoritative. Only add/remove topics if source material materially changed.

**3a. Filter parts by relevance.** Read content of each part — do NOT pattern-match on titles alone. Label `"relevant": true/false` in `all-parts-index.json`.

**3b. Design skill-based topics.** Organize by **skill** (what the model learns to DO), not document structure. Two-level hierarchy: Domain → Skill. Target 15-25 records per leaf topic, 5-40 leaf topics. Do NOT use `/` in topic names (breaks UI routing).

**Topic ID format: human-readable slugs.** Use the slug as the `"id"` field in `topics.json` (e.g., `"cancel-pending-order"`, `"fork-detection"`). Do NOT generate UUIDs — the gateway assigns UUIDs at upload time. All local files (`topics.json`, `relations.json`, `training.jsonl`, `priority.json`) use the same slug as the topic identifier. This keeps files self-consistent and human-debuggable. The slug must be unique within a workflow.

**MANDATORY: declare `category` on every leaf topic.** Each topic in `topics.json` must have a `"category"` field declaring the expected GT pattern. Valid values: `"none"` (GT should be "none"/empty), `"single:<label>"` (GT should contain this label), `"multi"` (GT should have 2+ labels). This is used by `reconcile-topics` to detect records whose derived GT contradicts the topic intent. Without it, the reconciler falls back to brittle name heuristics and may miss mismatches. You designed the topics — you know the intent — write it down.

**Granularity rule:** When source material enumerates distinct items (9 allergens, 14 tax forms), prefer one leaf topic per item to expose per-item difficulty to GRPO.

> See [reference/topic-hierarchy.md](reference/topic-hierarchy.md) for full guidelines, JSON format, and examples.

**3c. Write behavioral system prompt segments.** Root persona → Domain context → Leaf focus. Each level adds ONLY what the parent doesn't say. Use action verbs (assess, recommend, identify), not keyword lists.

**Combined mode — trace-informed topic prompts:** In combined mode, per-topic system prompts MUST incorporate trace failure patterns. Read `trace-analysis/priority.json` for each topic's failure rate. For high-failure topics (>30%), the system prompt segment should specifically address the failure patterns — emphasize the exact procedures that fail in production. For example, if `modify-pending-order-address` has 59% failure rate, its prompt should explicitly state the validation steps, required fields, and common error conditions that cause failures. Read `trace-analysis/grader-hints.json` for specific failure dimensions to address.

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
  --workflow-id $WORKFLOW_ID --enrich-sources

# Upload records SEPARATELY after generation
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl --force
```

**Combined mode — trace-informed generation:** If trace artifacts exist from Step 2C, add these flags.

**CRITICAL: System prompt MUST match production.** In combined mode, the `--system-prompt` MUST be the `simplified_prompt` from `trace-analysis/prompts.json` — this is the actual production prompt the model will see at inference time. Do NOT write your own prompt. Using a different prompt creates distribution shift: the model learns behaviors keyed to training-time instructions that won't match inference. In PDF-only mode (no traces), write a concise prompt (100-300 chars).

```bash
# Read the simplified prompt from trace analysis
SIMPLIFIED=$(python3 -c "import json; print(json.load(open('finetune-project/trace-analysis/prompts.json')).get('simplified_prompt','You are a customer service agent.'))")

uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "$SIMPLIFIED" \
  --output finetune-project/training.jsonl \
  --records-per-topic 30 --parallel 4 \
  --weight-by-trace-priority \
  --trace-priority-file finetune-project/trace-analysis/priority.json \
  --trace-prompts-file finetune-project/trace-analysis/prompts.json \
  --seed-query-ratio 0.20 \
  --workflow-id $WORKFLOW_ID --enrich-sources

# Upload records SEPARATELY (more reliable than --upload-incremental which can fail on topic ID mismatch)
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl --force
```

This changes two things:
1. **`--weight-by-trace-priority`**: Allocates more records to high-priority topics (frequent + high failure in traces). Low-priority topics get a minimum floor (3 records). Same total budget, distributed by real usage patterns.
2. **`--trace-prompts-file` + `--seed-query-ratio`**: 20% of records per topic use real user queries from traces (as-is, no paraphrasing). Remaining 80% are LLM-generated. Real queries anchor the training distribution to production phrasing (DCLM arXiv:2406.11794).

> **WARNING: If regenerating records**, delete gateway records first to avoid duplicates:
> ```bash
> uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force --workflow-id $WORKFLOW_ID --file /dev/null 2>/dev/null || true
> ```
> `--upload-incremental` appends to gateway. Running generate twice without clearing = duplicate records on gateway.

Generate **200+ total records**, minimum 25 per leaf topic.

**Difficulty control** (reduces trivial records at generation time):
- `--difficulty normal` (default): balanced prompt types for initial generation
- `--difficulty hard`: Evol-Instruct operators — multi-step reasoning, indirect info, complex inputs, edge cases. Use when prior eval showed >40% trivial records.
- `--difficulty adaptive --eval-scores test-runs/eval-001.json`: per-topic difficulty from eval scores — easy topics (>0.70) get hard mode, hard topics (<0.30) get normal mode.
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
#
# MANDATORY: after reconcile, verify results:
# 1. Check the output for "unknown" topic categories — these mean the reconciler
#    could not determine the topic's intent. Fix by adding "category" to topics.json.
# 2. Spot-check contradiction: for each "none"-intent topic, verify no records
#    have non-"none" GTs. For each "single:<label>" topic, verify GTs contain
#    that label. The reconciler should have moved contradictions, but if the
#    category was "unknown" it would have skipped them.
```

> See [reference/data-format.md](reference/data-format.md) for full options, weighting modes, RAG mode, and upload details.

**ALWAYS deduplicate** after generation:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/deduplicate_records.py finetune-project/training.jsonl --threshold 0.85
```

#### Step 4B: NeMo Data Designer (only when `use_nemo: true`)

Spawn `nemo-data-generator` subagent. If NeMo unavailable, fall back to Step 4A.

NeMo is retrieval-backed by default: the `rag-retrieval` columns call the gateway search API at generation time and now preserve exact retrieved part IDs alongside the text context. After fetching the NeMo dataset, convert it with:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/convert_nemo_rows.py \
  --input finetune-project/nemo-job-dataset.json \
  --output finetune-project/training.jsonl \
  --workflow-id $WORKFLOW_ID \
  --relations-output finetune-project/relations.json
```

This uses exact NeMo retrieval metadata for `source_parts` when available and writes `relations.json` directly from topic-level retrieval hits (`retrieved_chunks_*`). The gateway search fallback is only for older NeMo datasets that predate these metadata columns.

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

Write a JavaScript grader to `quality-checker/grader.js`. Scores model responses 0-1.

**Before writing:** (1) Read knowledge parts + topics to understand the domain, (2) Design a checklist rubric of 7-20 binary criteria (arXiv:2507.17746), (3) **Read 10-15 sample records** from `training.jsonl` to calibrate.

**Combined mode — trace-informed grader:** If `finetune-project/trace-analysis/grader-hints.json` exists (from Step 2C), generate a grader draft first:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/grader_from_traces.py \
  --hints finetune-project/trace-analysis/grader-hints.json \
  --output finetune-project/quality-checker/grader-draft.js
```
This auto-generates grader dimensions from:
- **Trace failure patterns** (e.g., "15% of traces failed because auth was skipped" → Essential criterion)
- **Production prompt rules** (e.g., "must authenticate before action" → Important criterion)

**Review the draft with the user** — it's a starting point, not final. Adjust criteria, weights, and descriptions as needed. Then copy to `quality-checker/grader.js`.

**Copy a template — do NOT write from scratch:**

| Template | Best for |
|----------|----------|
| `grader-draft.js` (trace-generated) | **Combined mode: trace-informed (when available)** |
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
  --workflow-id $WORKFLOW_ID --script quality-checker/grader.js \
  --row '{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}'
```

**Test 2: Live model response (CRITICAL)** — catches format-assumption bugs:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py \
  --workflow-id $WORKFLOW_ID --script quality-checker/grader.js --live --live-samples 5
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
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file quality-checker/grader.js

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

**What the gate checks** (key checks that catch data quality issues before wasting GPU hours):
- **Seed topic alignment**: Do seed queries' surface intent match their assigned topic? <60% alignment = FAIL. This catches misassigned real user queries that would teach the model wrong behavior.
- **GT coverage**: Are >90% of records with ground truth? Seeds without GT become zero-variance prompts in GRPO (arXiv:2509.21880).
- **GT duplication**: Are ground truths unique per record? >3 copies of identical GT cause reward collapse (DRA-GRPO, arXiv:2505.09655).
- **Topic balance, diversity, thin topics**: Standard structural checks.

**After the gate, write results to analysis.json** so users see the quality insights in the UI:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
  --project-dir finetune-project --section data-quality --status <pass|warn|fail> \
  --summary "<user-friendly summary of quality check results>" \
  --metrics '{"seed_alignment_pct": N, "gt_coverage_pct": N, "duplicated_gt_records": N}'
```

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
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-4B" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-001.json

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-0.8B" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-002.json
```

**Estimate training cost** (optional but recommended — helps model selection):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py estimate-training \
  --workflow-id $WORKFLOW_ID --models "Qwen3.5-4B,Qwen3.5-0.8B" --max-output-tokens 128
```

**Run readiness-check on BOTH** to get signal density. **Always pass `--training-file` and `--objective-target-tokens`** — these enable the proactive length-drift checks (`spec_mismatch` + `length_drift_risk`) that catch grader-rewards-verbosity and spec-mismatch problems BEFORE training. Skipping them means clipping problems only get caught reactively during training, after compute is wasted.

**Choosing `--objective-target-tokens`** — set this to the expected P95 response length for your task:

| Task type | Typical target | Why |
|---|---|---|
| Classification / extraction | 50-100 | Short structured output |
| QA / factual lookup | 80-150 | Concise answers |
| **Conversational agent** | **200-400** | Multi-turn requires explaining steps, confirming details, listing actions |
| Summarization / analysis | 200-500 | Long-form output |

**Do NOT use low values (< 100) for conversational agents.** Customer service, chatbots, and tool-routing agents naturally produce longer responses. Using `--objective-target-tokens 80` for a conversational agent will trigger false `length_drift_risk` failures because eval responses are longer than 80 tokens by design.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file finetune-project/test-runs/eval-001.json \
  --training-file finetune-project/training.jsonl \
  --objective-target-tokens <see table above>

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file finetune-project/test-runs/eval-002.json \
  --training-file finetune-project/training.jsonl \
  --objective-target-tokens <see table above>
```

**If 0.8B avg < 0.05 (no capability), also eval 2B** as middle ground:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "Qwen3.5-2B" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-003.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check --file finetune-project/test-runs/eval-003.json
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
  --project-dir finetune-project --eval-file finetune-project/test-runs/eval-NNN.json \
  --changes "Chosen MODEL_NAME (avg=X.XX, learnable=XX%)" --change-type baseline --verdict PASS
```

> See [reference/readiness-gate.md](reference/readiness-gate.md) "Headroom Gate" for diagnostic trees when both models fail.

#### 7c. Readiness Gate (on chosen model)

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --file finetune-project/test-runs/eval-NNN.json \
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
  --file finetune-project/test-runs/eval-NNN.json --save finetune-project/difficulty-report.json
```

**Decision:** Exit 0 = PASS (>= 30% learnable), exit 2 = WARN (15-30%), exit 1 = FAIL (< 15%).

#### 7c++. Harden Trivial Records (if signal density low on CHOSEN model)

**Hardening trigger** (engineering heuristic inspired by arXiv:2508.14094 — not a direct paper threshold):
- `trivial > 40% AND learnable < 35%` on the **chosen model's** eval → HARDEN
- `dead > 30%` on chosen model → ADVISORY (DAPO filters dead records from gradients, but they waste inference compute)
- Apply to the chosen model only — a rejected model's trivial% is irrelevant after model selection

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py harden-records \
  --eval-file finetune-project/test-runs/eval-NNN.json \
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

**Do NOT pass `--no-early-stop` to `create-training`.** `create-training` only creates the cloud job; early stopping is controlled by `poll-training`.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id $WORKFLOW_ID --base-model "Qwen3.5-4B" \
  --output-model "project-v1" --output-dir finetune-project/training
```

> See [reference/training-metrics-guide.md](reference/training-metrics-guide.md) "GRPO Training Defaults" for all parameters, rationale, and advanced config.

#### 7f. Monitor Training

Spawn `training-monitor` subagent, then poll:
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training/train-001.json --max-wait 7200
```

By default, `poll-training` may auto-cancel a running job for completion clipping, EMA score plateau/degradation, or length exploitation.

If you intentionally want the cloud job to continue even when rewards plateau, pass `--no-early-stop` to `poll-training`:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --file training/train-001.json --max-wait 7200 \
  --no-early-stop
```

Do not restart `create-training` just to change this behavior; restart the local `poll-training` command with the same `train-NNN.json` file.

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
  --job-file training/train-NNN.json \
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
  --file test-runs/eval-001.json --training-file finetune-project/training.jsonl \
  --max-score 0.0 --workflow-id $WORKFLOW_ID --verbose --dry-run

# Only filter confirmed model refusals
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py filter-records \
  --file test-runs/eval-001.json --training-file finetune-project/training.jsonl \
  --max-score 0.0 --reason-pattern "refused" --workflow-id $WORKFLOW_ID --sync-gateway --verbose
```

#### 8b. Post-Training Eval

Use the provider/cloud job ID from the completed training job and add the `finetuned/` prefix. Do **not** pass raw `fine_tuned_model` or raw `provider_job_id` to eval — those produce "Model not found" errors.

```bash
PROVIDER_JOB_ID=$(python3 -c "import json; print(json.load(open('training/train-001.json'))['provider_job_id'])")
TRAINED_MODEL="finetuned/${PROVIDER_JOB_ID}"
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "$TRAINED_MODEL" --output-dir finetune-project/test-runs
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-eval --file finetune-project/test-runs/eval-NNN.json
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py log-iteration \
  --project-dir finetune-project --eval-file test-runs/eval-NNN.json \
  --changes "Post-training eval" --change-type baseline --verdict PASS
```

If `provider_job_id` is missing from the local file, run `sync-jobs --workflow-id $WORKFLOW_ID --output-dir finetune-project` or fetch the completed training job status, then retry with `finetuned/<provider_job_id>`.

Read improved AND degraded records per topic. Check if gains come from genuine skill or grader exploitation.

**MANDATORY Grader Sanity Checks** — run this command after EVERY eval AND after every training epoch checkpoint. It hard-fails (exit 1) if any check trips. You MUST NOT proceed if this fails.

```bash
# After each standalone eval
uv run .claude/skills/finetune-skill/scripts/finetune.py grader-sanity-check \
  --eval-file finetune-project/test-runs/eval-NNN.json

# After each training epoch (training-monitor MUST run this on every poll
# that produces a new epoch in the epoch-evals file)
uv run .claude/skills/finetune-skill/scripts/finetune.py grader-sanity-check \
  --eval-file finetune-project/training/<job-id>-epoch-evals.json
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
  --file test-runs/eval-001.json --workflow-id $WORKFLOW_ID
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
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file quality-checker/grader.js
uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py --workflow-id $WORKFLOW_ID --script quality-checker/grader.js --live
```

**Fix records (only for diagnosed data issues, NOT for zero-score filtering):**
```bash
# Only filter records with confirmed data issues (refusals, wrong GT, malformed input)
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py filter-records \
  --file test-runs/eval-001.json --training-file finetune-project/training.jsonl \
  --max-score 0.0 --reason-pattern "refused" --workflow-id $WORKFLOW_ID --sync-gateway --verbose

uv run ${CLAUDE_SKILL_DIR}/scripts/generate_records.py \
  --topics ... --relations ... --knowledge-dir ... --system-prompt "..." \
  --output finetune-project/training.jsonl --append --records-per-topic 25

uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --force \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl
```

**Before re-running eval — cancel any running evals first** (they use the old grader/records):
```bash
# Cancel any running evals before re-evaluating with the fixed grader/records
for eval_file in finetune-project/test-runs/eval-*.json; do
  EVAL_ID=$(python3 -c "import json; print(json.load(open('$eval_file')).get('id',''))" 2>/dev/null)
  EVAL_STATUS=$(python3 -c "import json; print(json.load(open('$eval_file')).get('status',''))" 2>/dev/null)
  if [ "$EVAL_STATUS" = "running" ] && [ -n "$EVAL_ID" ]; then
    uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py cancel-eval \
      --workflow-id $WORKFLOW_ID --eval-id $EVAL_ID
  fi
done
```

**Then verify your fix** addresses the diagnosed root cause.

**Return to Step 7b.**

#### 9b. Post-training iteration

**Before starting a new training job — cancel any running training/eval jobs first** (they use the old config):
```bash
# Cancel running training jobs
for train_file in finetune-project/training/train-*.json; do
  JOB_ID=$(python3 -c "import json; print(json.load(open('$train_file')).get('id',''))" 2>/dev/null)
  JOB_STATUS=$(python3 -c "import json; print(json.load(open('$train_file')).get('status',''))" 2>/dev/null)
  if [ "$JOB_STATUS" = "running" ] || [ "$JOB_STATUS" = "queued" ]; then
    [ -n "$JOB_ID" ] && uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py cancel-training \
      --workflow-id $WORKFLOW_ID --job-id $JOB_ID
  fi
done
```

Use the **training metrics → diagnosis table** in [reference/analysis-strategy.md](reference/analysis-strategy.md) Part 2d to determine whether to fix hyperparams, grader, or data.

1. **Hyperparams only** → skip pre-training eval, go to Step 7e with new config
2. **Topics underperforming** → fix records/relations/prompts → Step 7b
3. **Grader needs fixing** → fix grader → Step 7b
4. **Model too weak** → try larger base model
5. **Base model > 0.75 + no improvement** → accept base model, make grader stricter, or report to user

> See [reference/iteration-strategy.md](reference/iteration-strategy.md) Part 10 for the full hyperparameter iteration ladder and post-training diagnosis.

**Max iterations:** 5 eval-only + 3 training before escalating to user.

**CRITICAL: When `length_drift_risk` fires repeatedly, do NOT keep reducing `max_output_tokens`.**

The `length_drift_risk` check compares eval responses against GT and `objective_target_tokens`. Before iterating:

1. **Check if `objective_target_tokens` is appropriate for your task type** (see table in Step 7c). Conversational agents need 200-400, not 80-100. If too low, fix the target and re-check — do NOT reduce max_tokens.
2. **Distinguish eval model verbosity from base model verbosity.** The readiness check uses the eval model (gpt-4o-mini) responses, NOT the base model. If eval model is verbose but the task is conversational, the drift may be expected — raise the objective target.
3. **Do NOT create more than 2 training jobs for the same readiness issue.** If the same check fails after 2 training iterations, **escalate to the user** with the specific failure, your diagnosis, and ask whether the target is appropriate.

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
| `reference/extraction-guide.md` | Extraction details — ODL/ODL Hybrid, subagent params, merge script |
| `reference/grader-writing.md` | Writing graders — patterns, guidelines, length exploitation defenses |
| `reference/topic-hierarchy.md` | Designing topics — structure, JSON format, balance |
| `reference/readiness-gate.md` | Readiness gate, difficulty probe, headroom gate, coverage audit |
| `reference/iteration-strategy.md` | Diagnosing stalls, escalation ladder, post-training iteration |
| `reference/analysis-strategy.md` | **Read at Step 8** — decision trees, per-record analysis, training diagnosis |
| `reference/training-metrics-guide.md` | **Read at Step 8** — GRPO metrics, training defaults, research context |

## Helper Scripts

Run with `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>`. Key ones: `finetune.py` (25 subcommands), `generate_records.py`, `analyze_training.py`, `validate_extraction.py`, `dry_run_grader.py`, `data_quality_gate.py`. Run any script with `--help` for usage.

**Trace-informed scripts (combined mode only):**
- `trace_analyze.py` — Analyze OTel traces → 4 artifacts (priority, topics, prompts, grader hints). Run in Step 2C.
- `grader_from_traces.py` — Auto-generate grader draft from `trace-analysis/grader-hints.json`. Run in Step 5.

**Section analysis** (`update-analysis`) — update after each step. The `--summary` and `--assessment` fields are displayed directly to the user in the UI sidebar — **write them in plain language that a non-ML-expert can understand.** Use `--metrics` for the technical data you need for your own decisions.

**Language rules for summaries:**
- Never use: GRPO, learnable%, zero-variance, drift_ratio, K=8, epochs
- Instead of "401 records, 12 topics, 76 seeds (19%)" → "401 teaching examples across 12 skills. 76 based on real customer conversations."
- Instead of "FAIL: length_drift_risk" → "Not ready yet — responses are getting too long. Fixing automatically."
- Instead of "Chose 0.8B (34% learnable)" → "Using the smaller model — it has more room to learn from your data."
- Frame metrics as "so what": not "failure_rate: 42%" but "customers struggled with exchanges 42% of the time"

**Examples:**

```bash
# After Step 2 (extraction):
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
  --project-dir finetune-project --section sources --status ready \
  --summary "Loaded your policy document (8 sections) and 460 real customer conversations." \
  --assessment "We can see what customers actually ask about. Exchanges and returns are where they struggle most (42% failure). Payment changes are rarely needed (0.9%)." \
  --metrics '{"pdf_count": 1, "trace_count": 460, "parts": 8, "failure_rate": 0.396}' \
  --next-action "Create the skills your model needs to learn."

# After Step 4 (generation):
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
  --project-dir finetune-project --section training-data --status ready \
  --summary "Created 401 teaching examples across 12 skills. 76 are based on real customer conversations." \
  --assessment "More examples for skills customers use most (exchanges: 50 examples) and fewer for rarely-used ones (payment changes: 3). This focuses training where it matters." \
  --metrics '{"total": 401, "topics": 12, "seeds": 76, "seed_ratio": 0.19, "highest": 50, "lowest": 3}' \
  --next-action "Set up the quality checker to score model responses."

# After Step 7 (eval):
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py update-analysis \
  --project-dir finetune-project --section evaluation --status ready \
  --summary "Test run complete. Using the smaller model — it has more room to learn from your data." \
  --assessment "The larger model already knows too much (scores 73%) — not enough room to improve. The smaller model scores 43% with good room to grow on 34% of examples." \
  --metrics '{"iterations": 2, "chosen_model": "0.8B", "learnable": 0.34, "avg_score": 0.43}' \
  --next-action "Start training your model."
```
