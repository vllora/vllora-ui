# vLLora Finetune Skill

A Claude Code skill that teaches AI agents how to execute the complete vLLora fine-tuning pipeline — from reading documents, through data generation and grader writing, to API execution and iterative improvement.

This README is the full context for anyone (human or AI) working on this skill: why it exists, how it works, what's planned, and how everything connects.

---

## Table of Contents

- [Why This Skill Exists](#why-this-skill-exists)
- [Architecture](#architecture)
- [Two Operating Modes](#two-operating-modes)
- [What We've Built](#what-weve-built)
- [Key Design Decisions](#key-design-decisions)
- [Testing History](#testing-history)
- [Known Issues & Fixes Applied](#known-issues--fixes-applied)
- [How to Test](#how-to-test)
- [How to Debug](#how-to-debug)
- [Relationship to Lucy UI](#relationship-to-lucy-ui)
- [Migration Plan: Shared Data via Gateway API](#migration-plan-shared-data-via-gateway-api)
- [TODO & Future Work](#todo--future-work)

---

## Why This Skill Exists

The vLLora UI has Lucy — an AI assistant that orchestrates 50+ browser-side tools via a chat completion API to guide users through fine-tuning. It works, but any capable AI agent (Claude Code, Cowork, etc.) already has the intelligence to do this directly. It doesn't need another LLM in the loop.

```
Before:  User → Lucy UI → Chat Completion API → Tool Calls → vLLora Backend APIs
After:   User → Agent (with this skill) → vLLora Backend APIs
```

The skill gives the agent **knowledge of the APIs and fine-tuning concepts**. The agent handles everything else: reading documents, generating training data, writing graders, analyzing results, iterating.

### Who uses this skill

- **Claude Code users** who want to fine-tune a model from the CLI
- **Any AI agent** that has Bash access and can call HTTP APIs
- **Cowork sessions** running fine-tuning pipelines

### What the skill teaches

1. How vLLora fine-tuning works (grader = training objective, RFT, smooth scoring)
2. The pipeline (objective → knowledge → topics → data → grader → evaluate → iterate → train)
3. All vLLora API endpoints with curl examples
4. How to write effective graders (hybrid, partial credit, reward hacking prevention)
5. How to analyze evaluation results and iterate
6. When to escalate (10 stall patterns, 6-level escalation ladder)

---

## Architecture

### Skill Structure

```
finetune-skill/
├── SKILL.md                    # Main entry point (~300 lines)
│   ├── YAML frontmatter        # name + description (auto-triggering)
│   ├── Core concepts           # How RFT works, prerequisites
│   ├── Working directory spec  # What files the agent creates
│   ├── Execution log spec      # Timestamped log requirements
│   └── Pipeline steps          # Inline examples + curl commands
│
├── reference/                  # Deep-dive reference files (read on demand)
│   ├── api-reference.md        # ~380 lines — all REST endpoints with curl examples
│   ├── data-format.md          # ~100 lines — JSONL format spec
│   ├── extraction-guide.md     # ~200 lines — Docling Serve setup, API calls, section extraction
│   ├── grader-writing.md       # ~290 lines — grader patterns + anti-patterns
│   ├── topic-hierarchy.md      # ~270 lines — topic design + coverage analysis
│   ├── iteration-strategy.md   # ~710 lines — analysis, diagnosis, escalation
│   └── workflow-guide.md       # ~270 lines — per-step deep dive
│
├── scripts/                    # PEP 723 helper scripts (run with `uv run`)
│   ├── validate_dataset.py     # Validate JSONL before upload
│   ├── upload_dataset.py       # Upload dataset + grader to gateway
│   ├── run_evaluation.py       # Create eval, poll until complete
│   └── start_training.py       # Start training, poll until complete
│
├── templates/                  # Starter files
│   ├── sample-conversation.jsonl  # 4 example prompts (system + user only)
│   ├── grader-template.js         # Hybrid grader template
│   ├── extract-sections.py        # Generic markdown → sections.json extractor
│   └── project-config.json        # Configuration reference
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
├── reference/                  # Extracted domain knowledge from user documents
│   └── document-extraction.md  # Structured extraction: sections, page numbers, key concepts
├── topics.json                 # Topic hierarchy with sourceChunkRefs
├── training.jsonl              # 100-200+ prompts (system + user messages only)
├── grader.js                   # Hybrid grader (programmatic + LLM-as-judge)
├── evaluations/                # API responses from evaluation runs
│   ├── eval-v1.json
│   └── eval-v2.json
├── training-jobs/              # API responses from training submissions
│   └── job-v1.json
├── execution-log.md            # Timestamped log of every step
└── iteration-log.md            # What changed each iteration and why
```

---

## Two Operating Modes

The skill supports two modes, controlled by whether the user wants to hand off to the vLLora UI or run the full pipeline in the CLI.

### Mode A: Data Prep + Handoff to Lucy (UI)

The agent prepares all data, then creates a workflow in the gateway so the vLLora UI can pick it up. Lucy takes over for evaluation, training, and iteration.

```
1. Define objective
2. Read documents, extract knowledge
3. Build topic hierarchy
4. Generate JSONL training data
5. Write grader
6. Create workflow via API:  POST /finetune/workflows
7. Upload records via API:   POST /finetune/workflows/{id}/records
8. Upload topics + grader:   PUT  /finetune/workflows/{id}/topics
                              PUT  /finetune/workflows/{id}/grader
9. Print: "Open vLLora UI → select '{workflow_name}' → Lucy will take over"
```

**When to use**: User wants the visual UI experience for evaluation/training, or wants Lucy's guided workflow for the iteration loop.

**Requires**: Gateway local API endpoints for workflows + records (see [Migration Plan](#migration-plan-shared-data-via-gateway-api)).

### Mode B: Full CLI Pipeline (current, working)

The agent handles everything end-to-end via API calls, with no UI dependency.

```
1. Define objective
2. Read documents, extract knowledge
3. Build topic hierarchy
4. Generate JSONL training data
5. Write grader
6. Upload dataset to cloud:  POST /finetune/datasets
7. Create evaluation:        POST /finetune/evaluations
8. Poll results, analyze, iterate
9. Start training:           POST /finetune/reinforcement-jobs
10. At any point: "Open vLLora UI to see progress"
```

**When to use**: User wants maximum autonomy and CLI-first workflow, or doesn't have the vLLora UI running.

**This is the currently working mode** — tested through v9 with live backend.

---

## What We've Built

### SKILL.md (~300 lines)

- YAML frontmatter with pushy description for auto-triggering
- Prerequisites check (base model capability, task clarity, smooth scoring)
- Pipeline with inline examples and curl commands
- Working directory structure with evaluation/training job tracking
- Execution log specification with full timestamps (`YYYY-MM-DD HH:MM:SS`)
- Explicit directives: "execute curl directly, never create .sh files"
- UUID requirement for dataset_id (backend rejects plain strings)
- PDF reading fallback via pdftotext

### Knowledge Files

| File | Lines | What it covers |
|------|-------|---------------|
| `api-reference.md` | ~450 | All vLLora REST endpoints: cloud (datasets, eval, training) + local workflow API |
| `data-format.md` | ~100 | JSONL format — prompts only (no assistant messages, since RFT) |
| `extraction-guide.md` | ~200 | Docling Serve setup, convert/chunk API calls, section extraction, troubleshooting |
| `grader-writing.md` | ~290 | 3 grader patterns, smooth scoring, reward hacking prevention |
| `topic-hierarchy.md` | ~270 | Topic structure, source tracing, coverage analysis, per-topic scores |
| `iteration-strategy.md` | ~710 | 9 parts: eval analysis, training, topics, variety, diagnosis, fixes, tracking, stalls, escalation |
| `workflow-guide.md` | ~270 | Deep dive on each pipeline step |

### Helper Scripts (PEP 723)

All scripts use inline dependency declarations — run with `uv run script.py` (no separate install needed).

| Script | Purpose |
|--------|---------|
| `scripts/validate_dataset.py` | Validate JSONL: format, fields, RFT compliance, duplicate IDs, record count |
| `scripts/upload_dataset.py` | Upload dataset + grader to gateway — auto-generates UUID, handles errors |
| `scripts/run_evaluation.py` | Create eval job, poll until complete, print summary, save response |
| `scripts/start_training.py` | Start training job, poll until complete, save response |

These scripts solve the #1 testing issue (agents creating shell scripts instead of executing API calls) by providing ready-to-run commands.

### Templates

- `sample-conversation.jsonl` — 4 example prompts (system + user only, no assistant)
- `grader-template.js` — Hybrid grader with programmatic checks + LLM-as-judge
- `extract-sections.py` — Generic markdown section extractor (splits on `##` headings, outputs `{document_title, sections}` JSON)
- `project-config.json` — Configuration reference

Total: ~2,500 lines across 15 files. SKILL.md is ~300 lines (under the 500-line guideline).

---

## Key Design Decisions

### Prompts only, no assistant messages
vLLora uses reinforcement fine-tuning (RFT). The model generates its own responses during training and the grader scores them. Training data only needs system + user messages. We don't call it "RFT" in the skill — just "fine-tuning" to keep it simple.

### Agent generates data directly
No LLM API calls needed for data generation. The agent (Claude, GPT, etc.) writes JSONL prompts itself using its own intelligence. The skill doesn't call any external LLM for data — only the backend uses LLMs for evaluation.

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
Topics link back to document sections via `sourceChunkRefs`. Records encode topic in their ID (e.g., `pins-003`). Just enough breadcrumbs to trace back when scores are low, without a formal tracking system.

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
2. Agents fabricated `sourceChunkRefs` for documents they never read
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
- Topic hierarchy with real sourceChunkRefs: **working**
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
- Mode A (handoff to UI): **not yet tested** (requires local workflow API)

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

### Issue 2: Fabricated sourceChunkRefs

**Symptom**: Agent creates topic nodes with `sourceChunkRefs` like `"hr-manual:ch1-leave-policies"` for documents it never read.

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
3. Build topics with REAL sourceChunkRefs
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
| Topics valid | `cat */topics.json \| python3 -m json.tool` | Real sourceChunkRefs matching extraction |
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

This skill and the Lucy finetune agent are **two interfaces to the same backend**. They share the same vLLora gateway API endpoints, the same evaluation engine, and the same training infrastructure.

### Shared Backend

```
                    ┌─────────────────────────────┐
                    │   vLLora Gateway (:9090)     │
                    │                             │
                    │  POST /finetune/datasets    │
                    │  POST /finetune/evaluations  │
                    │  POST /finetune/reinforcement-jobs │
                    │  GET  /finetune/workflows (local)  │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐  ┌─────▼──────┐  ┌──────▼─────┐
    │  Lucy Agent     │  │  This Skill │  │  Direct    │
    │  (Browser UI)   │  │  (Claude    │  │  curl      │
    │                 │  │   Code CLI) │  │  (manual)  │
    └─────────────────┘  └────────────┘  └────────────┘
```

### How They Differ

| Aspect | Lucy Agent (Browser UI) | This Skill (Claude Code CLI) |
|--------|------------------------|------------------------------|
| **Where it runs** | Browser (React app) | Terminal (Claude Code) |
| **AI orchestration** | Distri server → 3 sub-agents | Single agent reads skill + knowledge files |
| **Tool execution** | 50+ browser-side tools via @distri/react | Direct API calls via curl in Bash |
| **Data storage** | IndexedDB (browser-local) → migrating to gateway API | Local filesystem (JSONL, JSON, JS files) |
| **State machine** | Formal workflow state machine with validation rules | execution-log.md + iteration-log.md (informal) |
| **Workflow flexibility** | Fixed 7-step pipeline | Agent decides step order, can skip/repeat/branch |

### Why Both Exist

**Lucy** is for users who want a **guided, visual experience** — plan approval, progress tracking, visual feedback. Good for routine fine-tuning.

**This skill** is for users who want **maximum autonomy and intelligence** — the agent reads documents deeply, writes custom graders, diagnoses failures per-record. Good for complex or novel fine-tuning tasks.

---

## Migration Plan: Shared Data via Gateway API

### The Problem (current state)

The UI stores all finetune data in browser IndexedDB. The skill stores data in local files. These are two isolated worlds — data created by the skill is invisible to the UI, and vice versa.

```
Current:
  Skill (CLI) → gateway API → cloud (datasets, eval, training)
  UI (browser) → IndexedDB (datasets, records, workflows, jobs)
  ❌ No shared state between skill and UI
```

### The Solution (planned)

Both the skill and the UI read/write through the same gateway local API. The gateway's local SQLite becomes the single source of truth.

```
Target:
  Skill (CLI) ──┐
                 ├→ gateway API (localhost:9090) → local SQLite (workspace data)
  UI (browser) ──┘                               → cloud API (eval, training)
```

### What This Enables

1. **CLI → UI handoff**: Agent prepares data via skill → creates workflow in gateway → user opens vLLora UI → Lucy picks up where the agent left off
2. **Shared visibility**: Datasets and workflows created by either tool are visible in both
3. **Single source of truth**: No more IndexedDB ↔ API data isolation

### Implementation Status

| Component | Status | Details |
|-----------|--------|---------|
| UI abstraction layer (service interfaces) | ✅ Done | 6 interfaces in `src/services/interfaces/` |
| Gateway workflows table | ✅ Started | Basic CRUD in commit `e199769` |
| Gateway records table | ❌ Not started | Needed for records storage |
| Gateway expanded workflow fields | ❌ Not started | topics, grader, stats, etc. |
| UI API adapters | ❌ Not started | Swap IndexedDB → API calls |
| Skill Mode A (handoff) | ❌ Not started | Needs gateway workflow + records endpoints |
| IndexedDB removal | ❌ Not started | Final step after full migration |

### Spec Doc

Full migration spec: `docs/enhance-lucy/skill-and-local-api-spec.md`

Covers: gateway API design (SQL schemas, endpoint specs), UI abstraction layer, 5-phase migration plan, skill rewrite plan, and open decisions (event system, offline support, data migration, real-time updates).

---

## TODO & Future Work

### Testing

- [x] Test PDF extraction via pdftotext
- [x] Test dataset upload with UUID
- [x] Test evaluation job creation and polling
- [ ] Test evaluation results analysis (agent reads results and diagnoses)
- [ ] Test iteration loop (agent fixes issues and re-evaluates)
- [ ] Test training job submission (after good eval scores)
- [ ] Test Mode A (handoff to UI via workflow API)
- [ ] Test Docling Serve extraction (Docker required)
- [ ] Test extract-sections.py on non-chess documents
- [ ] Test fallback when Docling is not available
- [ ] Test with different document types (not just chess PDF)
- [ ] Test without any document (objective-only, no PDF)

### Skill improvements

- [ ] Add Mode A pipeline (handoff to Lucy) once gateway workflow API is ready
- [ ] Update api-reference.md with local workflow endpoints when finalized
- [ ] Add guidance for multi-turn conversation training data
- [ ] Add guidance for structured output fine-tuning (JSON schema enforcement)
- [ ] Test on Cowork (no local filesystem — may need adaptations)

### Known weaknesses

- Agent sometimes writes output to unexpected directories (ignores specified output path)
- Agent may not update execution-log.md after every single step (sometimes batches)
- Polling loop timeout — if eval takes > 5 minutes, agent's poll loop may expire
- No guidance on what to do if backend is down or returns unexpected errors
- Skill doesn't cover multi-dataset experiments (A/B testing different data strategies)
- Mode A not yet available (blocked on gateway local API implementation)
