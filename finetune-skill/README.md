# vLLora Finetune Skill

A Claude Code skill that teaches AI agents to prepare vLLora fine-tuning datasets — from reading documents, through data generation and grader writing, to pushing everything to the gateway for handoff to the vLLora UI.

This README is the full context for anyone (human or AI) working on this skill: why it exists, how it works, what's planned, and how everything connects.

---

## Table of Contents

- [Why This Skill Exists](#why-this-skill-exists)
- [Architecture](#architecture)
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

The intelligence-heavy part of fine-tuning — reading documents, designing topics, generating diverse training prompts, writing graders — is exactly what AI agents excel at. The interactive part — evaluation, iteration, training monitoring — is better in a visual UI.

```
Agent (with this skill)                    vLLora UI (Lucy)
─────────────────────                      ─────────────────
Read docs, extract knowledge               Evaluate with visual score breakdown
Design topic hierarchy                     Iterate: tune grader, fix records
Generate 100-200+ training prompts         Monitor training metrics in real-time
Write hybrid grader function               Deploy and test the model
Push to gateway via API ──────────────────→ Lucy picks up where agent left off
```

The skill gives the agent **knowledge of the APIs and fine-tuning concepts**. The agent prepares everything, pushes to the gateway, and hands off to the UI for the interactive loop.

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
│   └── workflow-guide.md       # ~305 lines — per-step deep dive
│
├── scripts/                    # PEP 723 helper scripts (run with `uv run`)
│   ├── finetune.py             # Gateway API wrapper (create workflow, upload, verify)
│   ├── generate_records.py     # LLM-based training record generation per leaf topic
│   ├── chat_completion.py      # LLM chat completions (validates JSON output)
│   ├── dry_run_grader.py       # Test grader on one record via gateway sandbox
│   ├── validate_dataset.py     # Validate JSONL (format, fields, cross-ref topics/parts)
│   ├── upload_dataset.py       # Upload dataset + grader to gateway (standalone)
│   ├── run_evaluation.py       # Create eval, poll until complete (~30 min timeout)
│   ├── start_training.py       # Start training, poll until complete
│   ├── analyze_training.py    # Fetch + analyze training metrics, per-epoch evals, alerts
│   ├── extract_tables.py      # Upgrade text parts to table parts from Docling table data
│   ├── consolidate_parts.py   # Merge adjacent parts, drop fragments, fix Unicode
│   ├── validate_extraction.py # Cross-document extraction quality gate
│   ├── docling_extract.py     # Docling Serve async extraction (Docker required)
│   └── pdftotext_extract.py   # Fallback extraction via pdftotext (no Docker)
│
├── templates/                  # Starter files
│   └── grader-template.js         # Hybrid grader template
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
   → "Open vLLora UI → Lucy takes over"
```

**Requires**: Gateway running at localhost:9090.

The `reference/api-reference.md` documents all 64 gateway endpoints for completeness (including evaluation, training, and deployment). These are available if an advanced user wants to do everything from CLI, but SKILL.md focuses on the data prep pipeline only.

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
| `api-reference.md` | ~950 | All 64 vLLora REST endpoints: cloud (datasets, eval, training, deployments) + local CRUD (workflows, records, topics, knowledge, eval-jobs) + dataset/upload + record scores + topic management + training metrics + Mode A/B pipeline examples |
| `data-format.md` | ~100 | JSONL format — prompts only (no assistant messages, since RFT) |
| `extraction-guide.md` | ~670 | Docling Serve setup, hybrid chunk API, knowledge_parts.json schema, image extraction, troubleshooting |
| `grader-writing.md` | ~290 | 3 grader patterns, smooth scoring, reward hacking prevention |
| `topic-hierarchy.md` | ~290 | Topic structure, source tracing, coverage analysis, per-topic scores |
| `iteration-strategy.md` | ~710 | 9 parts: eval analysis, training, topics, variety, diagnosis, fixes, tracking, stalls, escalation |
| `workflow-guide.md` | ~416 | Deep dive on each pipeline step (including categorization, variants, grader testing, evaluator versioning, training metrics, dataset/upload, eval-job tracking) |

### Helper Scripts (PEP 723)

All scripts use inline dependency declarations — run with `uv run script.py` (no separate install needed).

| Script | Purpose |
|--------|---------|
| `scripts/finetune.py` | Gateway API wrapper — create workflow, upload knowledge/topics/records/grader, verify |
| `scripts/generate_records.py` | Generate training records from topics + knowledge — calls LLM per leaf topic |
| `scripts/chat_completion.py` | Call LLM via gateway — validates JSON output when `response_format` is `json_object` |
| `scripts/dry_run_grader.py` | Dry-run grader on a single row — instant syntax/logic check via gateway sandbox |
| `scripts/validate_dataset.py` | Validate JSONL: format, fields, RFT compliance, cross-reference topics/parts |
| `scripts/upload_dataset.py` | Upload dataset + grader to gateway (standalone, not used in pipeline) |
| `scripts/run_evaluation.py` | Create eval job, poll until complete (~30 min timeout), save response |
| `scripts/start_training.py` | Start training job, poll until complete, save response |
| `scripts/consolidate_parts.py` | Merge adjacent text parts, drop short fragments, fix Unicode, regenerate parts-index |
| `scripts/validate_extraction.py` | Cross-document extraction quality gate (parts/page, title diversity, avg length) |
| `scripts/docling_extract.py` | Submit PDF(s) to Docling Serve async API, poll until done, supports batch mode |
| `scripts/pdftotext_extract.py` | Fallback PDF extraction via pdftotext (no Docker required), same output schema |

These scripts solve the #1 testing issue (agents creating shell scripts instead of executing API calls) by providing ready-to-run commands.

### Templates

- `grader-template.js` — Hybrid grader with programmatic checks + LLM-as-judge

Total: ~8,200 lines across 22 files.

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

**Fix applied**: Added pdftotext fallback in Step 2 with full path `/opt/homebrew/bin/pdftotext`.

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
| PDF extracted | `ls /tmp/*extracted*.txt` | File exists with text content |
| Knowledge saved | `cat */reference/document-extraction.md` | Structured sections with page numbers |
| Topics valid | `cat */topics.json \| python3 -m json.tool` | Flat format with parent_id, valid JSON |
| Enough records | `wc -l */training.jsonl` | 100+ lines |
| No .sh files | `find . -name "*.sh"` | No results |
| Full timestamps | `grep -E "\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]" */execution-log.md` | All log entries match |
| Dataset uploaded | grep "POST /finetune/datasets" in log | 200 OK with backend_dataset_id |
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

1. Check dataset_id format — must be UUID
2. Check file paths in curl — must use `@` prefix for file uploads
3. Check evaluator JSON — must include `completion_params` with `model`
4. Test manually: `curl -s http://localhost:9090/finetune/datasets | head`

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
| Gateway local CRUD (58 endpoints) | ✅ Done |
| Skill → gateway push (create workflow + populate) | ✅ Done |
| UI reads from gateway | ✅ Done |

---

## TODO & Future Work

### Testing

- [x] Test PDF extraction via pdftotext
- [x] Test dataset upload with UUID
- [x] Test evaluation job creation and polling
- [ ] **Test full Mode A handoff** (create workflow → push data → open UI → verify Lucy sees it)
- [ ] Test Docling Serve extraction (Docker required)
- [ ] Test with different document types (not just chess PDF)
- [ ] Test without any document (objective-only, no PDF)
- [ ] Test fallback when Docling is not available

### Skill improvements

- [x] Add Mode A pipeline (handoff to Lucy) via gateway workflow API
- [x] Update api-reference.md with all 64 gateway endpoints
- [x] Fix training job endpoints (now scoped under workflows)
- [x] Simplify SKILL.md to focus on data prep + handoff (removed Mode B complexity)
- [ ] Add guidance for multi-turn conversation training data
- [ ] Add guidance for structured output fine-tuning (JSON schema enforcement)
- [ ] Test on Cowork (no local filesystem — may need adaptations)

### Known weaknesses

- Agent sometimes writes output to unexpected directories (ignores specified output path)
- Agent may not update execution-log.md after every single step (sometimes batches)
- No guidance on what to do if backend is down or returns unexpected errors
