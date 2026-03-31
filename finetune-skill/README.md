# vLLora Finetune Skill

A Claude Code skill that teaches AI agents to prepare vLLora fine-tuning datasets — from reading documents, through data generation and grader writing, to pushing everything to the gateway for handoff to the vLLora UI.

This README is the full context for anyone (human or AI) working on this skill: why it exists, how it works, what's planned, and how everything connects.

---

## Table of Contents

- [Why This Skill Exists](#why-this-skill-exists)
- [Installation](#installation)
- [Architecture](#architecture)
  - [Agent Delegation Flow](#agent-delegation-flow)
- [Operating Mode](#operating-mode-data-prep--handoff)
- [What We've Built](#what-weve-built)
- [Key Design Decisions](#key-design-decisions)
- [Testing History](#testing-history)
- [Known Issues & Fixes Applied](#known-issues--fixes-applied)
- [How to Test](#how-to-test)
- [How to Debug](#how-to-debug)
- [Relationship to Lucy UI](#relationship-to-lucy-ui)
- [TODO & Future Work](#todo--future-work)

---

## Why This Skill Exists

Fine-tuning involves reading documents, designing topics, generating diverse training prompts, writing graders, running evaluations, analyzing results, and iterating — all things AI agents excel at.

```
Agent (with this skill) — runs the full pipeline (eval-first):
───────────────────────────────────────────────────────────
1. Read docs, extract knowledge        6. Data Quality Gate (pre-eval)
2. Design topic hierarchy              7. Verify & hand off
3. Generate 100-200+ training prompts  8. Eval → Readiness Gate → [PASS] → Train
4. Write hybrid grader function        9. Analyze results (eval + training)
5. Validate dataset                   10. Iterate (fix data/grader, re-eval/retrain)
```

The vLLora UI at `localhost:5173` visualizes the workflow data in real time (topics, records, eval scores, training metrics). The agent drives the pipeline; the UI displays the results.

### Who uses this skill

- **Claude Code users** who want to fine-tune a model from the CLI
- **Any AI agent** that has Bash access and can call HTTP APIs
- **Cowork sessions** running fine-tuning pipelines

### What the skill teaches

1. How vLLora fine-tuning works (grader = training objective, RFT, smooth scoring)
2. The data prep pipeline (objective → knowledge → topics → data → grader → push to gateway)
3. All vLLora gateway API endpoints with curl examples
4. How to write effective graders (hybrid, partial credit, reward hacking prevention)
5. How to extract documents via Docling Serve into structured knowledge parts
6. How to push everything to the gateway for UI handoff

---

## Installation

The skill requires two things in your project's `.claude/` directory:

```bash
your-project/
└── .claude/
    ├── agents/                        # Companion agents (3 files)
    │   ├── knowledge-extractor.md     # Document extraction (Step 2)
    │   ├── relation-builder.md        # Topic-part matching (Step 3)
    │   └── training-monitor.md        # Training anomaly detection (Step 7)
    └── skills/
        └── finetune-skill/            # The skill itself
            ├── SKILL.md
            ├── reference/             # 11 reference docs (analysis-strategy, training-metrics-guide, data-quality-gate, etc.)
            ├── scripts/               # 19 Python helpers (finetune.py has 18 subcommands)
            └── templates/             # Starter files
```

### Quick setup

```bash
# From the vllora/ui repo — one command does everything:
./scripts/sync-finetune-skill.sh /path/to/your-project
```

The sync script copies the skill + all 3 agents, verifies the installation, and prints next steps. Safe to run multiple times — it overwrites with the latest versions.

**Manual setup** (if you prefer):
```bash
DEST="path/to/your-project"
mkdir -p "$DEST/.claude/skills" "$DEST/.claude/agents"
cp -r finetune-skill "$DEST/.claude/skills/"
cp agents/*.md "$DEST/.claude/agents/"
```

### Prerequisites

- **Gateway** running at `localhost:9090` (`npm run start:backend` from the gateway repo)
- **Python 3** with `requests` library (`pip install requests`)
- **Docling Serve** (optional, for PDF extraction — falls back to `pdftotext` if unavailable)
- **Claude Code** with Bash permissions — the skill and agents run shell commands extensively

### Verify installation

```bash
cd your-project
claude  # start Claude Code

# Claude should auto-detect the skill. Test with:
# "I want to finetune a model on my tax documents"
```

---

## Architecture

### Skill Structure

```
finetune-skill/
├── SKILL.md                    # Main entry point (~870 lines)
│   ├── YAML frontmatter        # name + description (auto-triggering)
│   ├── Core concepts           # How RFT works, prerequisites
│   ├── Working directory spec  # What files the agent creates
│   ├── Execution log spec      # Timestamped log requirements
│   └── Pipeline steps          # Eval-first pipeline with finetune.py commands
│
├── reference/                  # Deep-dive reference files (read on demand)
│   ├── api-reference.md        # ~930 lines — All REST endpoints (cloud + local CRUD) with curl examples
│   ├── analysis-strategy.md    # ~1050 lines — Decision trees, action templates, derived metrics, presentation format
│   ├── training-metrics-guide.md # ~240 lines — GRPO metric interpretation, paper-backed thresholds
│   ├── iteration-strategy.md   # ~1090 lines — Eval analysis, training analysis, diagnosis, fixes, escalation
│   ├── data-quality-gate.md    # ~170 lines — Pre-eval data quality gate: 4 gates, thresholds, research citations
│   ├── data-format.md          # ~110 lines — JSONL format spec
│   ├── extraction-guide.md     # ~985 lines — Docling Serve setup, API calls, knowledge_parts.json schema
│   ├── knowledge-parts-schema.json  # JSON schema for knowledge_parts.json
│   ├── grader-writing.md       # ~620 lines — grader patterns + anti-patterns
│   ├── topic-hierarchy.md      # ~290 lines — topic design + coverage analysis
│   └── workflow-guide.md       # ~470 lines — per-step deep dive
│
├── scripts/                    # Helper scripts (run with `python3`, requires `requests`)
│   ├── finetune.py             # Gateway API wrapper (create workflow, upload, verify)
│   ├── generate_records.py     # LLM-based training record generation (--parallel, --upload-incremental)
│   ├── chat_completion.py      # LLM chat completions (validates JSON output)
│   ├── dry_run_grader.py       # Test grader on one record via gateway sandbox
│   ├── validate_dataset.py     # Validate JSONL (format, fields, cross-ref topics/parts)
│   ├── run_evaluation.py       # Create eval, poll until complete (~30 min timeout)
│   ├── start_training.py       # Start training, poll until complete
│   ├── analyze_training.py     # Fetch + analyze training metrics, per-epoch evals, alerts
│   ├── print_metrics_table.py  # Print training metrics table (per-epoch or per-step)
│   ├── build_knowledge_parts.py # Generic Docling→knowledge_parts.json (no LLM needed)
│   ├── checkpoint.py           # Pipeline checkpointing (save/check/reset step progress)
│   ├── data_quality_gate.py    # Pre-eval data quality gate (structural, diversity, GT quality, alignment)
│   ├── probe_difficulty.py     # Post-eval difficulty probe (signal prediction, grader granularity)
│   ├── deduplicate_records.py  # Remove near-duplicate prompts (trigram similarity)
│   ├── extract_tables.py       # Upgrade text parts to table parts from Docling table data
│   ├── consolidate_parts.py    # Merge adjacent parts, drop fragments, fix Unicode
│   ├── validate_extraction.py  # Cross-document extraction quality gate
│   ├── docling_extract.py      # Docling async extraction (--batch, --submit-only, --poll-one)
│   └── pdftotext_extract.py    # Fallback extraction via pdftotext (no Docker)
│
├── templates/                  # Grader templates (pick closest, then customize)
│   ├── grader-template.js      # General-purpose rubric (accuracy, helpfulness, clarity)
│   ├── grader-extraction.js    # Structured data extraction (field accuracy, hallucination)
│   ├── grader-compliance.js    # Rule application (rule recall, false positives, citations)
│   └── grader-readability.js   # Simplification (readability + Flesch-Kincaid, jargon-free)
│
└── README.md                   # This file
```

### How the skill triggers

The YAML `description` field in SKILL.md is the primary trigger mechanism. It's written to be "pushy" — Claude Code will auto-invoke the skill when users mention fine-tuning, training data, graders, evaluation, or model improvement, even without saying "vLLora."

### How the agent uses it

1. Claude Code reads SKILL.md (always loaded when triggered)
2. SKILL.md references knowledge files with guidance on when to read each one
3. Agent reads specific knowledge files as needed (progressive disclosure)
4. Agent follows the pipeline, writing files and executing API calls
5. Agent maintains an execution-log.md with full timestamps

### What the agent produces

```
finetune-project/               # Agent creates this working directory
├── training.jsonl              # 100-200+ prompts (system + user messages only)
├── grader.js                   # Hybrid grader (programmatic + LLM-as-judge)
├── topics.json                 # Topic hierarchy (flat, with parent_id)
├── relations.json              # Topic → part mappings for data generation
├── knowledge/                  # Extracted domain knowledge
│   ├── chess-tactics/           # Per-document subdirectory (slugified filename)
│   │   ├── docling-result.json # Raw Docling response
│   │   ├── knowledge_parts.json# Typed parts (text, table, image)
│   │   └── parts-index.json    # Lightweight part index
│   ├── strategy-guide/          # Second document
│   │   └── ...
│   ├── all-parts-index.json    # Merged index across all documents
│   └── extraction-notes.md     # Extraction notes
├── evaluations/                # API responses from evaluation runs
│   └── eval-v1.json
├── training-jobs/              # API responses from training submissions
│   └── job-v1.json
└── execution-log.md            # Timestamped log of every step (append-only)
```

### Agent Delegation Flow

The main agent (Sonnet/Opus) acts as an **orchestrator** — it makes decisions and delegates heavy work to three specialist subagents. Each subagent starts with a fresh context, reads only the files it needs, and returns a structured summary. This keeps the main agent's context clean and costs low.

```
User: "finetune my tax deduction PDF"
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│          ORCHESTRATOR (Sonnet/Opus)                      │
│                                                         │
│  Claude Code loads .claude/skills/finetune-skill/       │
│  SKILL.md becomes part of the agent's context           │
│                                                         │
│  Step 1: Create workflow ──────► Bash: finetune.py      │
│                                                         │
│  Step 2: Extract documents (PARALLEL)                   │
│    2a: Submit all PDFs to Docling (non-blocking)        │
│    2b: Spawn 1 agent per document:                      │
│           │                                             │
│    ┌──────┼──────┬──────┬──────┬── ... ──┐             │
│    ▼      ▼      ▼      ▼      ▼         ▼             │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐  ┌────┐          │
│  │doc1│ │doc2│ │doc3│ │doc4│ │doc5│  │docN│          │
│  │Sonnet│ │Sonnet│ │Sonnet│ │Sonnet│ │Sonnet│  │Sonnet│          │
│  └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘  └──┬─┘          │
│     │      │      │      │      │       │              │
│     ▼      ▼      ▼      ▼      ▼       ▼              │
│   Each: poll Docling → extract.py → consolidate → upload│
│     │      │      │      │      │       │              │
│     └──────┴──────┴──────┴──────┴───────┘              │
│           │                                             │
│    2c: Merge all-parts-index.json + validate            │
│           │                                             │
│           ▼  🗣️ REVIEW WITH USER                        │
│    "Extracted 6 docs, 596 parts:                        │
│     Ch1: 45 parts (tax basics)                          │
│     Ch2: 92 parts (deductions) ...                      │
│     Which areas should we focus training on?"           │
│           │                                             │
│    User: "Focus on chapters 2, 4, 5"                    │
│           │                                             │
│           ▼                                             │
│  Step 3: Design topics (guided by user's focus)         │
│    Main agent creates topics covering Ch 2, 4, 5        │
│           │                                             │
│           ▼                                             │
│    ┌──────────────────────────────────────┐             │
│    │  SUBAGENT: relation-builder          │             │
│    │  Model: Sonnet | Max 15 per topic   │             │
│    │                                      │             │
│    │  Matches parts → leaf topics         │             │
│    │  Writes: relations.json              │             │
│    └──────────────────────────────────────┘             │
│           │                                             │
│           ▼  🗣️ REVIEW WITH USER                        │
│    "23 topics across 3 areas. Here's the hierarchy:     │
│     Deductions (8 topics, 64 records planned)           │
│     Credits (6 topics, 48 records planned) ...          │
│     Any topics to add/remove/rebalance?"                │
│           │                                             │
│    User: "Looks good, but add more on SALT deductions"  │
│           │                                             │
│           ▼                                             │
│  Step 4: Generate training data ► scripts/generate_*.py │
│           │                                             │
│           ▼  🗣️ REVIEW WITH USER                        │
│    "184 records generated. Per-topic breakdown:          │
│     Filing Status: 16 records (samples: ...)            │
│     Deductions: 32 records (samples: ...) ...           │
│     Do these look like realistic questions?"            │
│           │                                             │
│           ▼                                             │
│  Step 5: Write grader ──────────► Main agent (creative) │
│  Step 5.5b: Data Quality Gate ──► data_quality_gate.py  │
│  Step 6: Upload everything ─────► scripts/finetune.py   │
│                                                         │
│  Step 7: Eval-First Loop (eval before training)         │
│    7a: Pre-training validation ─► grader distribution   │
│    7b: Create eval-only ────────► finetune.py create-eval│
│    7c: Readiness gate ──────────► finetune.py readiness-check│
│           │                                             │
│           ├─ FAIL → fix data/grader → back to 7b        │
│           │   (max 5 eval-only iterations)              │
│           │                                             │
│           └─ PASS → 7d: Start training ─► create-training│
│           │                                             │
│    7e: Monitor training (background)                    │
│           │                                             │
│           ▼                                             │
│    ┌──────────────────────────────────────┐             │
│    │  SUBAGENT: training-monitor          │             │
│    │  Model: Sonnet | maxTurns: 15        │             │
│    │                                      │             │
│    │  Writes Python monitoring script     │             │
│    │  Launches via nohup (detached)       │             │
│    │  Returns IMMEDIATELY with:           │             │
│    │    report path + log path + PID      │             │
│    └──────────────────────────────────────┘             │
│           │                                             │
│    Script runs autonomously for 30-120 min:             │
│      Polls metrics every 30s                            │
│      Checks 6 anomaly rules                             │
│      Saves: {JOB_ID}-metrics.json                       │
│      Writes: {JOB_ID}-monitor-report.json on exit       │
│                                                         │
│    Meanwhile, main agent polls training (foreground):   │
│      - Analyze training results when done               │
│      - Present findings to user                         │
│               │                                         │
│               ▼                                         │
│                                                         │
│  Step 8: Analyze results ───────► scripts/analyze_*.py  │
│           │                                             │
│           ▼  🗣️ REVIEW WITH USER                        │
│    "Eval avg: 0.68. Training reward: 0.2→0.7.           │
│     Weak topics: Filing Status (0.35 avg)               │
│     Strong topics: Deductions (0.82 avg)                │
│     Options: A) Fix grader B) Regenerate weak topics    │
│              C) Adjust hyperparams D) Ship it"          │
│           │                                             │
│           ▼                                             │
│  Step 9: Iterate (if needed)                            │
│    9a: Eval-only iteration (readiness gate failed):     │
│        diagnose-grader → identify root cause            │
│        ├─ GRADER-PROMPT MISMATCH → adjust grader to     │
│        │   match what prompts can produce, re-eval      │
│        ├─ GRADER too coarse → remove snapping, add      │
│        │   early-exit for refusals, re-eval             │
│        └─ DATA issue → regenerate records, re-eval      │
│    9b: Post-training iter ───► fix → re-eval or retrain │
└─────────────────────────────────────────────────────────┘
```

**Why subagents?**

| Subagent | Step | Model | Instances | Why delegate? | Benefit |
|----------|------|-------|-----------|--------------|---------|
| `knowledge-extractor` | 2 | Sonnet | 1 per PDF | Each PDF needs Docling polling + custom extract.py — Sonnet handles complex document structure better than Haiku | N agents process N PDFs in parallel. Total time = slowest PDF, not sum of all |
| `relation-builder` | 3b | Sonnet | 1 | Parts-index scanning needs understanding of topic-part semantic relevance, not just keyword matching. Max 15 relations per leaf topic | Fresh context for index matching, main stays clean |
| `training-monitor` | 7c | Sonnet | 1 | Training runs 30-120 min — writes monitoring script with paper-backed thresholds from training-metrics-guide.md | Writes script, launches `nohup`, returns instantly. Distinguishes "no data yet" from actual NaN anomalies |

**User review checkpoints (🗣️):**

| After step | Orchestrator asks user | User's input shapes... |
|-----------|----------------------|----------------------|
| Step 2 (extraction) | "Which chapters/areas to focus on?" | Step 3 — topic design covers only those areas |
| Step 3 (topics) | "Any topics to add/remove/rebalance?" | Step 4 — records generated only for approved topics |
| Step 4 (data gen) | "Do these prompts look realistic?" | Step 5 — grader criteria reflect what matters |
| Step 8 (analysis) | "Here are results. What to fix?" | Step 9 — user drives iteration decisions |

Subagents do broad work → orchestrator presents summary → user filters at the next step. No re-running subagents when the user narrows focus.

**Design principles:**

1. **Handoff files, not conversations.** Each subagent writes output to files on disk. The next step reads only the files it needs. This keeps context clean across the pipeline.

2. **Extract everything, filter at the topic level.** Subagents do broad mechanical work (extract all chapters, generate all records). The orchestrator then reviews the output with the user and filters via topic design — not by re-running the subagent. This avoids wasted re-extraction when the user changes their mind.

3. **Subagents never interact with the user.** Claude Code subagents cannot ask clarifying questions (background agents fail silently on `AskUserQuestion`). All user interaction happens in the orchestrator. The flow is:

```
Subagent does broad work → returns summary
       │
       ▼
Orchestrator presents summary to user:
  "Here's what was extracted per chapter:
   Ch1: 45 parts (tax basics)
   Ch2: 92 parts (deductions)
   Ch3: 30 parts (credits)
   ...
   Which chapters should we focus training on?"
       │
       ▼
User: "Focus on chapters 2, 4, 5"
       │
       ▼
Orchestrator designs topics covering only those chapters
(no re-extraction needed — data is already on disk)
```

This pattern repeats at every decision point: extract → review with user → filter via next step.

4. **Auto-iterate in non-interactive mode.** When running via `claude -p` (no user input), the orchestrator doesn't ask "what would you like to do?" and stop. Instead, it auto-applies the highest-priority fix from the eval analysis and starts a new iteration. Max 3 auto-iterations. The pipeline waits for training to complete before analyzing and iterating — it does not exit after launching training.

5. **Checkpoint for crash recovery.** Each step writes to `.checkpoint.json` via `checkpoint.py`. On restart, the orchestrator reads checkpoints to skip completed steps. This is more reliable than inferring state from local file existence.

**Bundling:** All agent files ship in `.claude/agents/` alongside the skill in `.claude/skills/finetune-skill/`. SKILL.md references them by name and Claude Code discovers them automatically from the `.claude/agents/` directory.

---

## Operating Mode: Eval-First Pipeline

The skill runs the **entire finetune pipeline end-to-end** using an **eval-first flow**: eval iterations validate data quality and grader correctness before committing to expensive training. The UI provides visual feedback (score distributions, training metrics charts) while the skill drives the pipeline.

```
Agent (CLI) — Eval-First Pipeline
──────────────────────────────────
1. Define objective
2. Extract documents (parallel via knowledge-extractor subagents)
3. Build topic hierarchy + relations (via relation-builder subagent)
4. Generate JSONL training data
5. Write grader
6. Verify gateway state
7. Eval → Readiness Gate → [FAIL → fix → re-eval] → [PASS → Train]
8. Analyze results (eval + training metrics)
9. Iterate (fix data/grader, re-eval or retrain)
```

**Key insight:** Eval is fast (~45 min) and cheap. Training is slow (hours) and expensive. The readiness gate checks grader quality (score spread, binary fraction, leniency) before allowing training to start. Max 5 eval-only iterations before training, max 3 training iterations.

**Requires**: Gateway running at localhost:9090.

The `reference/api-reference.md` documents all gateway endpoints. Each step uploads to the gateway immediately — the UI shows progress in real time.

---

## What We've Built

### SKILL.md (~870 lines)

- YAML frontmatter with pushy description for auto-triggering
- Prerequisites check (base model capability, task clarity, smooth scoring)
- Eval-first pipeline: objective → extraction → topics → data generation → grader → verify → eval → readiness gate → train → analyze → iterate
- Working directory structure with multi-document knowledge layout
- Execution log specification with full timestamps (`YYYY-MM-DD HH:MM:SS`)
- Checkpoint calls after every major step (crash recovery via `checkpoint.py`)
- Pre-submission validation before eval/training (prevents empty eval results)
- Persistent training failure escalation ladder (retry → lower LR → smaller model → stop)
- Explicit directives: "execute commands directly, never create .sh files"
- All gateway API calls via `scripts/finetune.py` wrapper

### Knowledge Files

| File | Lines | What it covers |
|------|-------|---------------|
| `api-reference.md` | ~930 | vLLora REST endpoints: cloud (datasets, eval, training, deployments) + local CRUD (workflows, records, topics, knowledge, eval-jobs) + record scores + topic management + training metrics + pipeline examples |
| `analysis-strategy.md` | ~1050 | Decision trees, action templates, derived metrics, presentation format for Step 8 analysis |
| `training-metrics-guide.md` | ~240 | GRPO metric interpretation — healthy ranges, red flags, paper-backed thresholds (DeepSeekMath, DAPO, Dr. GRPO), quick decision table |
| `iteration-strategy.md` | ~1090 | Eval analysis, training analysis, diagnosis, fixes, tracking, stalls, escalation — the authoritative iteration guide |
| `data-format.md` | ~110 | JSONL format — prompts only (no assistant messages, since RFT) |
| `extraction-guide.md` | ~985 | Docling Serve setup, hybrid chunk API, knowledge_parts.json schema, image extraction, troubleshooting |
| `grader-writing.md` | ~620 | 3 grader patterns, smooth scoring, reward hacking prevention, LLM-as-judge API |
| `topic-hierarchy.md` | ~290 | Topic structure, source tracing, coverage analysis, per-topic scores |
| `workflow-guide.md` | ~470 | Deep dive on each pipeline step (including categorization, variants, grader testing, evaluator versioning, training metrics, eval-job tracking) |

### Helper Scripts (PEP 723)

All scripts use inline dependency declarations — run with `uv run script.py` (no separate install needed).

| Script | Purpose |
|--------|---------|
| `scripts/finetune.py` | Gateway API wrapper — 17 subcommands: create-workflow, upload-knowledge/topics/relations/records/grader, verify, status, readiness-check, diagnose-grader, create-eval, poll-eval, create-training, poll-training, sync-jobs, delete-knowledge, print-row-outputs |
| `scripts/generate_records.py` | Generate training records from topics + knowledge — calls LLM per leaf topic |
| `scripts/analyze_training.py` | Post-training analysis: reward trend, KL health, clipping, loss stability, grad norm, per-topic learning. Paper-backed thresholds with `# Ref:` comments |
| `scripts/print_metrics_table.py` | Print training metrics table (per-epoch or per-step) — human-readable format |
| `scripts/chat_completion.py` | Call LLM via gateway — validates JSON output when `response_format` is `json_object` |
| `scripts/dry_run_grader.py` | Dry-run grader on a single row — instant syntax/logic check via gateway sandbox |
| `scripts/validate_dataset.py` | Validate JSONL: format, fields, RFT compliance, cross-reference topics/parts |
| `scripts/checkpoint.py` | Pipeline checkpoint — save/check/reset step progress for crash recovery |
| `scripts/deduplicate_records.py` | Remove near-duplicate prompts via trigram similarity (threshold-based) |
| `scripts/build_knowledge_parts.py` | Generic Docling→knowledge_parts.json converter (no LLM needed) |
| `scripts/run_evaluation.py` | Create eval job, poll until complete (~30 min timeout) — legacy, prefer `finetune.py create-eval` |
| `scripts/start_training.py` | Start training job, poll until complete — legacy, prefer `finetune.py create-training` |
| `scripts/consolidate_parts.py` | Merge adjacent text parts, drop short fragments, fix Unicode, regenerate parts-index |
| `scripts/extract_tables.py` | Upgrade text parts to table parts using Docling table data |
| `scripts/validate_extraction.py` | Cross-document extraction quality gate (parts/page, title diversity, avg length) |
| `scripts/docling_extract.py` | Submit PDF(s) to Docling Serve async API, poll until done, supports batch + submit-only mode |
| `scripts/pdftotext_extract.py` | Fallback PDF extraction via pdftotext (no Docker required), same output schema |

These scripts solve the #1 testing issue (agents creating shell scripts instead of executing API calls) by providing ready-to-run commands.

### Templates

- `grader-template.js` — General-purpose rubric (accuracy, helpfulness, clarity, completeness, tone)
- `grader-extraction.js` — Structured data extraction (field accuracy, hallucination rate, format)
- `grader-compliance.js` — Rule/regulation application (rule recall, false positives, citations)
- `grader-readability.js` — Simplification/plain-language (readability + Flesch-Kincaid, jargon-free)

---

## Key Design Decisions

### Prompts only, no assistant messages
vLLora uses reinforcement fine-tuning (RFT). The model generates its own responses during training and the grader scores them. Training data only needs system + user messages. We don't call it "RFT" in the skill — just "fine-tuning" to keep it simple.

### LLM-assisted data generation
The skill uses `scripts/generate_records.py` to generate training records via LLM API calls (through `scripts/chat_completion.py`). For each leaf topic, the script gathers linked source material from knowledge parts, then calls the LLM to generate grounded user prompts. This produces more diverse, document-grounded prompts than the agent writing them directly.

### Only platform APIs documented
The skill only covers endpoints the agent can't replicate locally: dataset upload, evaluation, training, model serving, and local workflow management. No Lucy chat completion endpoint, no IndexedDB, no browser-side tools.

### Grader-first explanation
The skill leads with "the grader IS your training objective" because understanding this is essential. Whatever the grader rewards, the model learns. This is the #1 concept users and agents need to internalize.

### Execute everything, don't script it
The skill explicitly says "NEVER create shell scripts (.sh files)" and "execute every curl command directly." This is because early testing showed agents would generate `run-pipeline.sh` files instead of actually calling the APIs. The skill now uses forceful language to prevent this.

### UUID for dataset_id
The backend requires UUID-formatted dataset_id values. The skill includes `uuidgen` instructions because early tests showed agents using plain strings like `my-dataset-v1` which caused 400 errors.

### Full timestamps in execution log
The skill requires `YYYY-MM-DD HH:MM:SS` format (not just date) so step durations are visible. Early tests showed agents using date-only timestamps, making it impossible to see how long each step took.

### Lightweight source tracing
Topics link back to document parts via the topic-source relations API (`POST /topics/relations`). Records encode topic in their ID (e.g., `pins-003`). Just enough breadcrumbs to trace back when scores are low, using the formal relations endpoint instead of inline references.

### Skill only talks to localhost:9090
The skill ONLY communicates with the vLLora gateway at `localhost:9090`. It never calls cloud APIs directly. The gateway proxies cloud requests (eval, training, datasets) transparently. This simplifies the skill and keeps the gateway as the single integration point.

---

## Testing History

### Test Setup

- **Test repo**: `/Users/anhthuduong/Documents/GitHub/test-vllora-skill/`
- **Skill location**: `.claude/skills/vllora-finetune/` (inside test repo)
- **Backend**: vLLora gateway at `localhost:9090`
- **Test document**: `chess-tactics-and-combinations-dave-regis-646.pdf` (84-page chess tactics book)
- **Testing method**: `claude -p` with `--allowedTools "Bash(*)"` to spawn an independent agent

### Why `claude -p` instead of subagents

Claude Code subagents inherit the parent session's permission settings. The parent session (vllora/ui repo) only allows specific Bash commands (`gh`, `test`, `pnpm`, `grep`, `tree`). Subagents couldn't run `pdftotext`, `curl`, or `date`. Using `claude -p` in a separate process with `--allowedTools "Bash(*)"` bypasses this.

To allow nesting, you must unset the `CLAUDECODE` env var:
```bash
cd /path/to/test-repo && CLAUDECODE= claude -p "..." --allowedTools "Bash(*)" "Read(*)" "Write(*)" "Edit(*)" --max-turns 150
```

The test repo also needs a `.claude/settings.json` with `"allow": ["Bash(*)"]`.

### Iteration 1-2: Template-based tests (3 test prompts each)

Tested with 3 prompts (HR platform, bad eval diagnosis, medical grader) without PDF/live backend.

**Issues found**:
1. Agents generated `curl-commands.sh` instead of executing API calls
2. Agents fabricated topic-source references for documents they never read
3. No actual evaluation or training jobs created
4. Only 20-25 training records generated (not enough)
5. Execution log not maintained

### Iteration 3-9: Chess E2E tests (live backend + PDF)

Tested with real chess PDF and live backend at localhost:9090.

| Version | Key Change | Result |
|---------|-----------|--------|
| v1-v4 | Initial attempts | PDF reading failed, pdftotext not in PATH |
| v5 | Added pdftotext instructions | PDF extracted, but date-only timestamps |
| v6 | Added full timestamp requirement | Subagent blocked on Bash permissions |
| v7 | Used `claude -p` instead of subagent | API calls failed: `dataset_id` must be UUID |
| v8 | Strengthened "no .sh files" language | Still created `run-pipeline.sh` |
| v9 | Added UUID requirement + stronger language | All steps working: PDF extracted, 131 records, grader written, dataset uploaded, eval job created and polling |

### Current Test Status

**Test infrastructure**: `scripts/run-finetune-agent.sh` runs Claude Code in non-interactive mode, captures JSONL stream + formatted markdown transcript. See `docs/workflow-skill-first-approach/run-infrastructure.md` for details.

**Test projects** (in `/Users/anhthuduong/Documents/GitHub/test-samples/`):

| Project | PDFs | Status | Notes |
|---------|------|--------|-------|
| `contract-translator` | 9 legal PDFs | Eval 84%, training KL explosion | 4 training attempts, persistent KL >1M — needs LR reduction |
| `tax-deduction-analyzer` | 6 IRS publications | Extraction in progress | First multi-doc Docling test |
| `chess-tactics` (original) | 1 chess PDF | v9 complete | Original test — eval + training working |
| `financial-doc-analyzer` | TBD | Not started | Planned: 10-K extraction test |
| `medical-icd-coder` | TBD | Not started | Planned: structured output test |
| `food-label-compliance` | TBD | Not started | Planned: compliance grader test |

**Pipeline steps verified end-to-end:**

| Step | Status | Notes |
|------|--------|-------|
| PDF extraction (Docling) | ✅ Working | Parallel per-document via knowledge-extractor subagents |
| PDF extraction (pdftotext fallback) | ✅ Working | Automatic fallback when Docling unavailable |
| Topic hierarchy + relations | ✅ Working | relation-builder subagent, now capped at 15 per topic |
| Data generation (100-200+ records) | ✅ Working | generate_records.py with --upload-incremental |
| Grader writing + dry-run | ✅ Working | 4 templates: general, extraction, compliance, readability |
| Evaluation creation + polling | ✅ Working | finetune.py create-eval + poll-eval, avg 0.65-0.84 across tests |
| Readiness gate | ✅ Working | finetune.py readiness-check, 3 hard + 8 soft checks |
| Training creation + monitoring | ✅ Working | Monitor launches OK, false NaN fixed (10-poll grace period) |
| Training completion | ⚠️ Issues | KL explosion with contract data — persistent failure guidance added |
| Post-training analysis | ✅ Working | analyze_training.py with paper-backed thresholds |
| Iteration loop (eval-first) | ✅ Working | Eval-only iterations + post-training iterations tested |
| Job sync from gateway | ✅ Working | finetune.py sync-jobs picks up UI-created jobs |
| Checkpoint + resume | ⚠️ Partial | Checkpoints now at every step, but not all runs use them yet |
| iterations.md tracking | ⚠️ Added | Explicit creation instruction added — not yet verified in a run |

---

## Known Issues & Fixes Applied

### Issue 1: Agents create shell scripts instead of executing

**Symptom**: Agent writes `run-pipeline.sh` or `curl-commands.sh` with all the API calls, then tells the user to run it.

**Root cause**: LLMs are trained on documentation that shows curl commands as examples. They naturally want to "document" the commands rather than execute them.

**Fix applied**: Added forceful language at the top of SKILL.md:
```
NEVER create shell scripts (.sh files). Do not save curl commands to files,
do not create run-pipeline.sh or similar. Execute every curl command directly
using Bash, capture the response in a variable, parse the response, and use
those values in the next API call.
```

### Issue 2: Fabricated topic-source references

**Symptom**: Agent creates topic-source relations referencing parts from documents it never read.

**Fix applied**: Changed to explicit instruction requiring real section references from actually-read documents.

### Issue 3: dataset_id must be UUID

**Symptom**: Upload fails with `400 Bad Request: Invalid dataset_id: invalid character`.

**Fix applied**: Updated SKILL.md and api-reference.md to use `uuidgen`.

### Issue 4: Date-only timestamps in execution log

**Fix applied**: Added mandatory timestamp instruction with `date '+%Y-%m-%d %H:%M:%S'` via Bash.

### Issue 5: PDF reading fails

**Fix applied**: Added pdftotext fallback in Step 2 with full path `/opt/homebrew/bin/pdftotext`.

### Issue 6: Too few training records

**Fix applied**: Added minimum volume requirement (100-200 total records, 10-20 per topic).

### Issue 7: Execution log not updated incrementally

**Fix applied**: Added rule: "Update the execution log after completing each step, before starting the next one."

---

## How to Test

### Prerequisites

1. vLLora gateway running at `localhost:9090` (`npm run start:backend` from the gateway repo)
2. A test project with PDFs in a `pdfs/` directory
3. Claude Code CLI (`claude`) installed
4. `uv` installed (Python script runner — all scripts use inline deps)
5. Docling Serve for PDF extraction (recommended — `docker run -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest`). Falls back to `pdftotext` if unavailable.

### Setup test project

```bash
# Create a test project
mkdir -p ~/test-samples/my-test/pdfs
cp your-document.pdf ~/test-samples/my-test/pdfs/

# Write a prompt
cat > ~/test-samples/my-test/finetune-prompt.md << 'EOF'
Fine-tune a model on my document. Use the vLLora backend at localhost:9090.
Generate at least 100 training records, write a hybrid grader, run evaluation
and training. Iterate if eval pass rate < 80%.
EOF
```

### Run with the test harness

```bash
# One command — syncs skill + agents, launches claude, captures logs
./scripts/run-finetune-agent.sh ~/test-samples/my-test

# With custom model or turn limit
MAX_TURNS=100 CLAUDE_MODEL=sonnet ./scripts/run-finetune-agent.sh ~/test-samples/my-test
```

Output goes to `~/test-samples/my-test/finetune-runs/run-YYYYMMDD-HHMMSS/`:
- `transcript.md` — human-readable formatted log
- `stream.jsonl` — raw JSONL events for programmatic analysis
- `meta.json` — run metadata (timing, turn count, exit code)
- `subagents/` — collected subagent transcripts

See `docs/workflow-skill-first-approach/run-infrastructure.md` for full details on the run harness, log format, and debugging.

### What to verify after the test

| Check | How | Pass Criteria |
|-------|-----|---------------|
| Docling extraction | `ls finetune-project/knowledge/*/docling-result.json` | One per document |
| Knowledge parts | `python3 -c "import json,glob; [print(f) for f in glob.glob('finetune-project/knowledge/*/knowledge_parts.json')]"` | One per document |
| Topics valid | `cat finetune-project/topics.json \| python3 -m json.tool` | Flat format with parent_id |
| Relations capped | `python3 -c "import json; r=json.load(open('finetune-project/relations.json')); print(len(r))"` | ≤15 per leaf topic |
| Enough records | `wc -l finetune-project/training.jsonl` | 100+ lines |
| Grader dry-run passes | grep "Score:" in transcript.md | Non-zero score |
| Eval results | `cat finetune-project/evaluations/eval-001.json \| python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('summary',{}))"` | avg_score > 0, passed_count > 0 |
| Training started | `ls finetune-project/training-jobs/train-*.json` | At least one job file |
| Checkpoints saved | `python3 finetune-project/.claude/skills/finetune-skill/scripts/checkpoint.py status --project-dir finetune-project` | Shows completed steps |
| iterations.md exists | `cat finetune-project/iterations.md` | Created after first eval |
| No .sh files | `find finetune-project -name "*.sh"` | No results |

---

## How to Debug

### Agent doesn't execute API calls

1. Check if agent created .sh files: `find . -name "*.sh"`
2. Read execution-log.md — does Step 6 have log entries?
3. If log stops at Step 5: agent probably hit a permission issue with Bash
4. If agent writes shell script: the "NEVER create .sh files" instruction isn't strong enough

### API calls fail with 400

1. Check workflow_id format — must be UUID
2. Check records exist: `curl -s http://localhost:9090/finetune/workflows/$WF_ID/records/count`
3. Check evaluator exists: `curl -s http://localhost:9090/finetune/workflows/$WF_ID/evaluator/versions`
4. Check grader includes `completion_params` with `model`

### Evaluation never completes

1. Check backend is running: `lsof -i :9090`
2. Poll manually: `curl -s http://localhost:9090/finetune/evaluations/{id}`
3. Check if the eval model (gpt-4o-mini) has API access configured
4. Large datasets (130+ rows) can take 5-10 minutes to complete

### Agent stops after generating data (doesn't call APIs)

1. Most common failure mode
2. Check if agent hit max_turns limit
3. Check if agent is waiting for user input
4. The skill needs to be very explicit that the agent should proceed through ALL steps

---

## Relationship to Lucy UI

This skill and the vLLora UI (Lucy) are **complementary halves of the same workflow**, sharing the same gateway API and data.

### How They Work Together

```
  Skill (CLI)                                    Lucy (UI)
  ───────────                                    ─────────
  Read docs, extract knowledge                   Evaluate with visual scores
  Design topic hierarchy                         Iterate: tune grader, fix records
  Generate training prompts                      Monitor training metrics
  Write grader function                          Deploy and test model
       │                                              ▲
       └── Push to gateway (localhost:9090) ──────────┘
                     │
              Local SQLite (single source of truth)
```

### Why This Split

| What | Best done by | Why |
|------|-------------|-----|
| Reading 100-page PDFs and extracting structure | Agent (CLI) | Deep document comprehension, no UI needed |
| Designing topic hierarchy from domain knowledge | Agent (CLI) | Requires reasoning about document structure |
| Generating 100-200 diverse training prompts | Agent (CLI) | Bulk generation with quality control |
| Writing hybrid grader functions | Agent (CLI) | Code generation is the agent's strength |
| Viewing per-record score distributions | Lucy (UI) | Visual charts, clickable drilldown |
| Tuning grader iteratively | Lucy (UI) | Immediate visual feedback on score changes |
| Monitoring training loss curves | Lucy (UI) | Real-time charts, alert thresholds |
| Deploying and testing the model | Lucy (UI) | Interactive chat testing |

### Shared Data via Gateway API

Both write through the same gateway API → same SQLite database. Workflows, records, topics, knowledge sources, and eval jobs created by the skill are immediately visible in the UI.

| Component | Status |
|-----------|--------|
| Gateway API (all endpoints) | ✅ Done |
| Skill → gateway push (create workflow + populate) | ✅ Done |
| UI reads from gateway | ✅ Done |

---

## TODO & Future Work

### Testing

- [x] Test PDF extraction via pdftotext
- [x] Test PDF extraction via Docling Serve (knowledge-extractor subagent)
- [x] Test dataset upload with UUID
- [x] Test evaluation job creation and polling
- [x] Test training job creation and monitoring
- [x] Test multi-document extraction (9 PDFs, contract-translator)
- [x] Test iteration loop (auto-iterate in non-interactive mode)
- [x] Test resume from previous run (checkpoint-based)
- [ ] Test with very large documents (500+ pages)
- [ ] Test without any document (objective-only, no PDF)
- [ ] Test on Cowork (no local filesystem — may need adaptations)
- [ ] Test `food-label-compliance` (compliance grader template)
- [ ] Test `medical-icd-coder` (structured extraction grader template)

### Skill improvements

- [x] Full 9-step pipeline with eval + training + iteration
- [x] Parallel document extraction via knowledge-extractor subagents
- [x] Training monitor with paper-backed thresholds (training-metrics-guide.md)
- [x] Post-training analysis script (analyze_training.py)
- [x] Checkpoint per step for crash recovery
- [x] Pre-submission validation before eval
- [x] Persistent training failure escalation ladder
- [ ] Add guidance for multi-turn conversation training data
- [ ] Add guidance for structured output fine-tuning (JSON schema enforcement)
- [ ] Improve `finetune.py poll-training` to also save metrics incrementally
- [ ] Add `finetune.py analyze` command to wrap analyze_training.py

### Known weaknesses

**RFT/GRPO-specific (addressed but verify in practice):**
- **Validation set** — train/validation split (80/20) added in Step 7a-iii. Gateway doesn't support separate validation upload, so the split is local only. Verify finetuned model against held-out prompts manually.
- **Grader score distribution** — pre-training distribution check added in Step 7a-ii + readiness gate enforces spread. Verified working in eval-first flow.
- **Epoch defaults** — fixed: RFT uses 10-30 epochs for small datasets, 5-10 for large (not SFT-style 1-4). Published work uses even higher: "Tricks or Traps" uses 50; OpenAI says "hundreds or thousands." Fresh responses each pass, no repetition risk.
- **KL thresholds** — fixed: high KL is normal with beta=0 (GRPO default). KL alone is no longer diagnostic in training-metrics-guide.md.

**Infrastructure:**
- **Training monitor false NaN** when job not in list yet — fixed (10-poll grace period) but depends on LLM following instructions
- **Over-linking** in relation-builder — fixed (capped at 15 per topic)
- Agent sometimes writes output to unexpected directories
- Checkpoint usage is inconsistent — some runs don't call checkpoint.py at all
- `iterations.md` creation instruction added but not yet verified in a full run
