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
Agent (with this skill) — runs the full 9-step pipeline:
─────────────────────────────────────────────────────────
1. Read docs, extract knowledge        6. Verify & hand off
2. Design topic hierarchy              7. Start eval + training (parallel)
3. Generate 100-200+ training prompts  8. Analyze results, filter dead-weight
4. Write hybrid grader function        9. Iterate (fix data/grader, retrain)
5. Validate dataset
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
5. How to extract documents via pymupdf4llm + langchain text splitters into structured knowledge parts (Docling available as fallback for scanned PDFs)
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
            ├── reference/             # 8 reference docs
            ├── scripts/               # 17 Python helpers
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
- **uv** for running Python scripts (`curl -LsSf https://astral.sh/uv/install.sh | sh`) — handles pymupdf4llm and langchain deps automatically
- **Claude Code** with Bash permissions — the skill and agents run shell commands extensively
- **Docker + Docling Serve** (optional — only needed for scanned PDFs or complex multi-column layouts)

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
├── SKILL.md                    # Main entry point (~760 lines)
│   ├── YAML frontmatter        # name + description (auto-triggering)
│   ├── Core concepts           # How RFT works, prerequisites
│   ├── Working directory spec  # What files the agent creates
│   ├── Execution log spec      # Timestamped log requirements
│   └── Pipeline steps          # 9-step pipeline with finetune.py commands
│
├── reference/                  # Deep-dive reference files (read on demand)
│   ├── api-reference.md        # All REST endpoints (cloud + local CRUD) with curl examples
│   ├── data-format.md          # ~100 lines — JSONL format spec
│   ├── extraction-guide.md     # ~670 lines — Docling Serve setup, API calls, knowledge_parts.json schema
│   ├── knowledge-parts-schema.json  # JSON schema for knowledge_parts.json
│   ├── grader-writing.md       # ~290 lines — grader patterns + anti-patterns
│   ├── topic-hierarchy.md      # ~290 lines — topic design + coverage analysis
│   ├── iteration-strategy.md   # ~710 lines — analysis, diagnosis, escalation
│   ├── workflow-guide.md       # ~305 lines — per-step deep dive
│   ├── nemo-guide.md           # ~340 lines — NeMo Data Designer integration (curated seed, rag-retrieval, RAGAS scoring)
│   └── nemo-columns-reference.md  # All 11 built-in column types + 2 custom plugins, with full field schemas
│
├── scripts/                    # Helper scripts (run with `uv run`, PEP 723 inline deps)
│   ├── finetune.py             # Gateway API wrapper (create workflow, upload, verify)
│   ├── generate_records.py     # LLM-based training record generation (--parallel, --upload-incremental)
│   ├── convert_pdf_to_markdown.py  # PDF → Markdown via pymupdf4llm (primary extraction — no Docker)
│   ├── convert_nemo_rows.py    # Convert NeMo DataDesigner output to training.jsonl + metadata sidecar
│   ├── chat_completion.py      # LLM chat completions (validates JSON output)
│   ├── dry_run_grader.py       # Test grader on one record via gateway sandbox
│   ├── validate_dataset.py     # Validate JSONL (format, fields, cross-ref topics/parts; --nemo flag)
│   ├── run_evaluation.py       # Create eval, poll until complete (~30 min timeout)
│   ├── start_training.py       # Start training, poll until complete
│   ├── analyze_training.py     # Fetch + analyze training metrics, per-epoch evals, alerts
│   ├── print_metrics_table.py  # Print training metrics table (per-epoch or per-step)
│   ├── build_knowledge_parts.py # Docling→knowledge_parts.json (used in Docling fallback path)
│   ├── checkpoint.py           # Pipeline checkpointing (save/check/reset step progress)
│   ├── deduplicate_records.py  # Remove near-duplicate prompts (trigram similarity)
│   ├── extract_tables.py       # Upgrade text parts with Docling cell structure (Docling fallback)
│   ├── consolidate_parts.py    # Merge adjacent parts, drop fragments, fix Unicode
│   ├── validate_extraction.py  # Cross-document extraction quality gate
│   ├── docling_extract.py      # Docling async extraction — fallback for scanned/complex PDFs
│   └── pdftotext_extract.py    # Last-resort extraction via pdftotext (no Python deps)
│
├── templates/                  # Grader templates + recipe starters
│   ├── grader-template.js      # General-purpose rubric (accuracy, helpfulness, clarity)
│   ├── grader-extraction.js    # Structured data extraction (field accuracy, hallucination)
│   ├── grader-compliance.js    # Rule application (rule recall, false positives, citations)
│   ├── grader-readability.js   # Simplification (readability + Flesch-Kincaid, jargon-free)
│   └── nemo-recipe-template.json  # NeMo Data Designer recipe starter (curated seed + rag-retrieval + RAGAS scoring)
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
│  │Haiku│ │Haiku│ │Haiku│ │Haiku│ │Haiku│  │Haiku│          │
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
│    │  Model: Haiku                        │             │
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
│  Step 6: Upload everything ─────► scripts/finetune.py   │
│                                                         │
│  Step 7: Start eval + training                          │
│    7a-b: Create both jobs ──────► scripts/finetune.py   │
│    7c: Poll eval (foreground) ──► scripts/finetune.py   │
│    7c: Monitor training (background)                    │
│           │                                             │
│           ▼                                             │
│    ┌──────────────────────────────────────┐             │
│    │  SUBAGENT: training-monitor          │             │
│    │  Model: Haiku | maxTurns: 10         │             │
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
│    Meanwhile, main agent polls eval (foreground):       │
│      - Analyze eval results when ready                  │
│      - Present findings to user                         │
│      - Check training report file when eval done        │
│               │                                         │
│               ▼  (training-monitor returns)             │
│                                                         │
│  Step 8: Analyze results ───────► scripts/analyze_*.py  │
│           │                                             │
│           ▼  🗣️ REVIEW WITH USER                        │
│    "Eval avg: 0.68. Training loss: 0.42.                │
│     Weak topics: Filing Status (0.35 avg)               │
│     Strong topics: Deductions (0.82 avg)                │
│     Options: A) Fix grader B) Regenerate weak topics    │
│              C) Add more data D) Ship it"               │
│           │                                             │
│           ▼                                             │
│  Step 9: Iterate (if needed) ──► Re-run Steps 4-8      │
└─────────────────────────────────────────────────────────┘
```

**Why subagents?**

| Subagent | Step | Model | Instances | Why delegate? | Benefit |
|----------|------|-------|-----------|--------------|---------|
| `knowledge-extractor` | 2 | Haiku | 1 per PDF | Each PDF needs a custom extract.py — that's N sequential LLM calls if done by 1 agent | N agents process N PDFs in parallel. Total time = slowest PDF, not sum of all |
| `relation-builder` | 3b | Haiku | 1 | Parts-index scanning is mechanical — keyword match + verify | Fresh context for index matching, main stays clean. Haiku handles this fine |
| `training-monitor` | 7c | Haiku | 1 | Training runs 30-120 min — polling is mechanical | Writes script, launches `nohup`, returns instantly. Script monitors autonomously |

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

## Operating Mode: Data Prep + Handoff

The skill focuses on one mode: **prepare data in the CLI, hand off to the UI**.

```
Agent (CLI)                                      UI (Lucy)
───────────                                      ─────────
1. Define objective                              7. Evaluate (visual scores)
2. Read documents, extract knowledge             8. Iterate (tune grader, fix records)
3. Build topic hierarchy                         9. Train (monitor metrics)
4. Generate JSONL training data                  10. Deploy & test
5. Write grader
6. Push to gateway via API:
   POST /finetune/workflows
   POST /finetune/workflows/{id}/knowledge
   POST /finetune/workflows/{id}/records
   POST /finetune/workflows/{id}/topics
   PATCH /finetune/workflows/{id}/evaluator
   → Agent continues with eval + training (Steps 7-9)
```

**Requires**: Gateway running at localhost:9090.

The `reference/api-reference.md` documents all 76 gateway endpoints for completeness (including evaluation, training, and deployment). These are available if an advanced user wants to do everything from CLI, but SKILL.md focuses on the data prep pipeline only.

---

## What We've Built

### SKILL.md (~760 lines)

- YAML frontmatter with pushy description for auto-triggering
- Prerequisites check (base model capability, task clarity, smooth scoring)
- 9-step pipeline: objective → extraction → topics → data generation → grader → verify → evaluation → iterate → training
- Working directory structure with multi-document knowledge layout
- Execution log specification with full timestamps (`YYYY-MM-DD HH:MM:SS`)
- Explicit directives: "execute commands directly, never create .sh files"
- All gateway API calls via `scripts/finetune.py` wrapper

### Knowledge Files

| File | Lines | What it covers |
|------|-------|---------------|
| `api-reference.md` | ~950 | All 76 vLLora REST endpoints: cloud (datasets, eval, training, deployments) + local CRUD (workflows, records, topics, knowledge, eval-jobs) + record scores + topic management + training metrics + pipeline examples |
| `data-format.md` | ~100 | JSONL format — prompts only (no assistant messages, since RFT) |
| `extraction-guide.md` | ~670 | Docling Serve setup, hybrid chunk API, knowledge_parts.json schema, image extraction, troubleshooting |
| `grader-writing.md` | ~290 | 3 grader patterns, smooth scoring, reward hacking prevention |
| `topic-hierarchy.md` | ~290 | Topic structure, source tracing, coverage analysis, per-topic scores |
| `iteration-strategy.md` | ~710 | 9 parts: eval analysis, training, topics, variety, diagnosis, fixes, tracking, stalls, escalation |
| `workflow-guide.md` | ~416 | Deep dive on each pipeline step (including categorization, variants, grader testing, evaluator versioning, training metrics, continuation runs, eval-job tracking) |
| `nemo-guide.md` | ~340 | NeMo Data Designer integration: curated seed (materialize_seed.py), rag-retrieval + rag-relevancy plugins, RAGAS-aligned scoring columns, preview/full job workflow, convert_nemo_rows.py usage |
| `nemo-columns-reference.md` | ~300 | All 11 built-in column types + 2 custom plugins: complete field schemas, sampler params, programmatic composition patterns |

### Helper Scripts (PEP 723)

All scripts use inline dependency declarations — run with `uv run script.py` (no separate install needed).

| Script | Purpose |
|--------|---------|
| `scripts/convert_pdf_to_markdown.py` | **Primary extraction** — PDF → Markdown via pymupdf4llm (no Docker); tables inline, headers preserved. `knowledge-extractor` subagent runs this first |
| `scripts/finetune.py` | Gateway API wrapper — create workflow, upload knowledge/topics/records/grader, verify |
| `scripts/generate_records.py` | Generate training records from topics + knowledge — calls LLM per leaf topic; supports `--use-rag`, `--rag-top-k`, `--rag-second-retrieval` |
| `scripts/convert_nemo_rows.py` | Convert NeMo DataDesigner output rows to vLLora training.jsonl; filters by judge scores; writes `nemo-metadata.jsonl` sidecar |
| `scripts/chat_completion.py` | Call LLM via gateway — validates JSON output when `response_format` is `json_object` |
| `scripts/dry_run_grader.py` | Dry-run grader on a single row — instant syntax/logic check via gateway sandbox |
| `scripts/validate_dataset.py` | Validate JSONL: format, fields, RFT compliance, cross-reference topics/parts; `--nemo` flag checks for metadata leakage |
| `scripts/run_evaluation.py` | Create eval job, poll until complete (~30 min timeout), save response |
| `scripts/start_training.py` | Start training job, poll until complete, save response |
| `scripts/consolidate_parts.py` | Merge adjacent text parts, drop short fragments, fix Unicode, regenerate parts-index |
| `scripts/validate_extraction.py` | Cross-document extraction quality gate (parts/page, title diversity, avg length) |
| `scripts/build_knowledge_parts.py` | Docling fallback — converts `docling-result.json` → `knowledge_parts.json` |
| `scripts/docling_extract.py` | Docling fallback — submit PDF to Docling Serve async API; for scanned/complex PDFs |
| `scripts/pdftotext_extract.py` | Last-resort extraction via pdftotext (no Python deps needed) |

These scripts solve the #1 testing issue (agents creating shell scripts instead of executing API calls) by providing ready-to-run commands.

### Templates

- `grader-template.js` — General-purpose rubric (accuracy, helpfulness, clarity, completeness, tone)
- `grader-extraction.js` — Structured data extraction (field accuracy, hallucination rate, format)
- `grader-compliance.js` — Rule/regulation application (rule recall, false positives, citations)
- `grader-readability.js` — Simplification/plain-language (readability + Flesch-Kincaid, jargon-free)
- `nemo-recipe-template.json` — NeMo Data Designer recipe starter (curated seed + rag-retrieval + 4 RAGAS scoring columns: AspectCritic, ResponseGroundedness, Tele-Specificity, ResponseRelevancy)

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

### Current Test Status (v9)

- PDF extraction via pdftotext: **working**
- Knowledge extraction to `reference/document-extraction.md`: **working**
- Topic hierarchy with real topic-source relations: **working**
- 131 training records across 20 topics: **working**
- Hybrid grader (programmatic + LLM-as-judge): **working**
- Full timestamps `[YYYY-MM-DD HH:MM:SS]`: **working**
- No .sh files created: **working**
- UUID for dataset_id: **working**
- Dataset uploaded via curl: **working**
- Evaluation job created and polling: **working**
- Evaluation results analysis: **pending** (eval still running on backend)
- Training job submission: **pending** (depends on eval results)
- Iteration loop (re-evaluate after fixes): **not yet tested**
- Mode A (handoff to UI): **not yet tested** (gateway API is ready, needs end-to-end test)

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

**Fix applied**: Primary extraction now uses pymupdf4llm (pure Python, no Docker/system deps). Run via `uv run` to get deps automatically. Docling and pdftotext remain as fallbacks.

### Issue 6: Too few training records

**Fix applied**: Added minimum volume requirement (100-200 total records, 10-20 per topic).

### Issue 7: Execution log not updated incrementally

**Fix applied**: Added rule: "Update the execution log after completing each step, before starting the next one."

---

## How to Test

### Prerequisites

1. vLLora backend running at `localhost:9090`
2. A test PDF or document
3. Claude Code CLI installed
4. `poppler` installed for pdftotext fallback (`brew install poppler` on macOS, `apt-get install poppler-utils` on Linux)
5. Docker installed for Docling Serve extraction (optional but recommended — `docker run -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest`)

### Setup test repo

```bash
mkdir -p /path/to/test-repo/.claude/skills/vllora-finetune
cp -r /path/to/finetune-skill/* /path/to/test-repo/.claude/skills/vllora-finetune/

cat > /path/to/test-repo/.claude/settings.json << 'EOF'
{
  "permissions": {
    "allow": ["Bash(*)"]
  }
}
EOF

cp chess-tactics.pdf /path/to/test-repo/
```

### Run the test

```bash
cd /path/to/test-repo
CLAUDECODE= claude -p "You are testing a finetune skill. Read the skill file at \
.claude/skills/vllora-finetune/SKILL.md FIRST, then read the knowledge files it \
references. Follow the skill instructions exactly.

TASK: I have a chess tactics PDF at ./chess-tactics.pdf. Fine-tune a model to be \
a chess tactics tutor. Use the vLLora backend at http://localhost:9090.

REQUIREMENTS:
1. Read the PDF using pdftotext via Bash
2. Save extracted content to reference/document-extraction.md
3. Build topics and link to source parts via relations API
4. Generate at least 100 training records
5. Write a hybrid grader
6. Execute ALL API calls directly via Bash curl — NEVER create .sh files
7. Use full YYYY-MM-DD HH:MM:SS timestamps in execution-log.md
8. Update execution-log.md after EVERY step

Start now." \
--allowedTools "Bash(*)" "Read(*)" "Write(*)" "Edit(*)" "Glob(*)" "Grep(*)" \
--max-turns 150 2>&1 | tee /tmp/test-output.log
```

### What to verify after the test

| Check | How | Pass Criteria |
|-------|-----|---------------|
| PDF converted | `ls */knowledge/*/*.md` | `.md` file exists with headers and content |
| Knowledge parts | `wc -l */knowledge/*/knowledge_parts.json` | Valid JSON with 10+ parts |
| Topics valid | `cat */topics.json \| python3 -m json.tool` | Flat format with parent_id, valid JSON |
| Enough records | `wc -l */training.jsonl` | 100+ lines |
| No .sh files | `find . -name "*.sh"` | No results |
| Full timestamps | `grep -E "\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]" */execution-log.md` | All log entries match |
| Records uploaded | grep "upload-records" in log | Records uploaded successfully |
| Eval created | grep "POST /finetune/evaluations" in log | 200 OK with evaluation_run_id |
| Grader is hybrid | `head -50 */grader.js` | Both programmatic checks AND `__langdb_call_llm_as_judge_obj` |

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
| Gateway API (76 endpoints) | ✅ Done |
| Skill → gateway push (create workflow + populate) | ✅ Done |
| UI reads from gateway | ✅ Done |

---

## TODO & Future Work

### Testing

- [x] Test PDF extraction via pdftotext
- [x] Test dataset upload with UUID
- [x] Test evaluation job creation and polling
- [ ] **Test full Mode A handoff** (create workflow → push data → open UI → verify Lucy sees it)
- [x] Switch primary extraction to pymupdf4llm + langchain text splitters (no Docker)
- [ ] Test pymupdf4llm extraction on scanned PDFs (verify --force-ocr path)
- [ ] Test with different document types (not just chess/NIST PDFs)
- [ ] Test without any document (objective-only, no PDF)
- [ ] Test Docling fallback path end-to-end

### Skill improvements

- [x] Add Mode A pipeline (handoff to Lucy) via gateway workflow API
- [x] Update api-reference.md with all 76 gateway endpoints
- [x] Fix training job endpoints (now scoped under workflows)
- [x] Simplify SKILL.md to focus on data prep + handoff (removed Mode B complexity)
- [x] Add NeMo Data Designer path (Step 4B) — curated seed + rag-retrieval plugin + RAGAS quality scoring (AspectCritic, ResponseGroundedness, Tele-Specificity, ResponseRelevancy)
- [x] Add `convert_nemo_rows.py` and `validate_dataset.py --nemo` for NeMo output handling
- [ ] Add guidance for multi-turn conversation training data
- [ ] Add guidance for structured output fine-tuning (JSON schema enforcement)
- [ ] Test on Cowork (no local filesystem — may need adaptations)

### Known weaknesses

- Agent sometimes writes output to unexpected directories (ignores specified output path)
- Agent may not update execution-log.md after every single step (sometimes batches)
- No guidance on what to do if backend is down or returns unexpected errors
