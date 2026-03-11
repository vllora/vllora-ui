# vLLora Finetune Skill

A Claude Code skill that teaches AI agents how to execute the complete vLLora fine-tuning pipeline — from reading documents, through data generation and grader writing, to API execution and iterative improvement.

This README is the full context for anyone (human or AI) working on this skill: why it exists, how it works, what's been tested, what's broken, and how to fix it.

---

## Table of Contents

- [Why This Skill Exists](#why-this-skill-exists)
- [Architecture](#architecture)
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
2. The 7-step pipeline (objective → knowledge → topics → data → grader → evaluate → iterate)
3. All vLLora API endpoints with curl examples
4. How to write effective graders (hybrid, partial credit, reward hacking prevention)
5. How to analyze evaluation results and iterate
6. When to escalate (10 stall patterns, 6-level escalation ladder)

---

## Architecture

### Skill Structure

```
finetune-skill/
├── SKILL.md                    # Main entry point (~240 lines)
│   ├── YAML frontmatter        # name + description (auto-triggering)
│   ├── Core concepts           # How RFT works, prerequisites
│   ├── Working directory spec  # What files the agent creates
│   ├── Execution log spec      # Timestamped log requirements
│   └── 7-step pipeline         # Inline examples + curl commands
│
├── knowledge/                  # Deep-dive reference files (read on demand)
│   ├── api-reference.md        # ~380 lines — all REST endpoints
│   ├── data-format.md          # ~100 lines — JSONL format spec
│   ├── extraction-guide.md     # ~200 lines — Docling Serve setup, API calls, section extraction
│   ├── grader-writing.md       # ~290 lines — grader patterns + anti-patterns
│   ├── topic-hierarchy.md      # ~270 lines — topic design + coverage analysis
│   ├── iteration-strategy.md   # ~710 lines — analysis, diagnosis, escalation
│   └── workflow-guide.md       # ~270 lines — per-step deep dive
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
4. Agent follows the 7-step pipeline, writing files and executing API calls
5. Agent maintains an execution-log.md with full timestamps

### What the agent produces

```
finetune-project/               # Agent creates this working directory
├── knowledge/                  # Extracted domain knowledge from user documents
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

## What We've Built

### SKILL.md (~240 lines)

- YAML frontmatter with pushy description for auto-triggering
- Prerequisites check (base model capability, task clarity, smooth scoring)
- 7-step pipeline with inline examples and curl commands
- Working directory structure with evaluation/training job tracking
- Execution log specification with full timestamps (`YYYY-MM-DD HH:MM:SS`)
- Explicit directives: "execute curl directly, never create .sh files"
- UUID requirement for dataset_id (backend rejects plain strings)
- PDF reading fallback via pdftotext

### Knowledge Files

| File | Lines | What it covers |
|------|-------|---------------|
| `api-reference.md` | ~380 | All vLLora REST endpoints with curl examples and response schemas |
| `data-format.md` | ~100 | JSONL format — prompts only (no assistant messages, since RFT) |
| `extraction-guide.md` | ~200 | Docling Serve setup, convert/chunk API calls, section extraction, troubleshooting |
| `grader-writing.md` | ~290 | 3 grader patterns, smooth scoring, reward hacking prevention |
| `topic-hierarchy.md` | ~270 | Topic structure, source tracing, coverage analysis, per-topic scores |
| `iteration-strategy.md` | ~710 | 9 parts: eval analysis, training, topics, variety, diagnosis, fixes, tracking, stalls, escalation |
| `workflow-guide.md` | ~270 | Deep dive on each pipeline step |

### Templates

- `sample-conversation.jsonl` — 4 example prompts (system + user only, no assistant)
- `grader-template.js` — Hybrid grader with programmatic checks + LLM-as-judge
- `extract-sections.py` — Generic markdown section extractor (splits on `##` headings, outputs `{document_title, sections}` JSON)
- `project-config.json` — Configuration reference

Total: ~2,500 lines across 13 files. SKILL.md is ~280 lines (under the 500-line guideline).

---

## Key Design Decisions

### Prompts only, no assistant messages
vLLora uses reinforcement fine-tuning (RFT). The model generates its own responses during training and the grader scores them. Training data only needs system + user messages. We don't call it "RFT" in the skill — just "fine-tuning" to keep it simple.

### Agent generates data directly
No LLM API calls needed for data generation. The agent (Claude, GPT, etc.) writes JSONL prompts itself using its own intelligence. The skill doesn't call any external LLM for data — only the backend uses LLMs for evaluation.

### Only platform APIs documented
The skill only covers endpoints the agent can't replicate locally: dataset upload, evaluation, training, and model serving. No Lucy chat completion endpoint, no IndexedDB, no browser-side tools.

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
- Knowledge extraction to `knowledge/document-extraction.md`: **working**
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

**Verification**: Check for `.sh` files in the output directory.

### Issue 2: Fabricated sourceChunkRefs

**Symptom**: Agent creates topic nodes with `sourceChunkRefs` like `"hr-manual:ch1-leave-policies"` for documents it never read.

**Root cause**: The skill originally said "add sourceChunkRefs when documents exist." Agents interpreted this as "guess what the document might contain."

**Fix applied**: Changed to explicit instruction:
```
Only add sourceChunkRefs after you have actually read a document and
extracted content from it. The values must reference real sections you
read. Never fabricate sourceChunkRefs for documents you haven't read.
```

**Verification**: Cross-reference sourceChunkRefs with `knowledge/document-extraction.md` — every ref should match a real section heading or page number.

### Issue 3: dataset_id must be UUID

**Symptom**: Upload fails with `400 Bad Request: Invalid dataset_id: invalid character`.

**Root cause**: Backend requires UUID format (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`). Skill examples used plain strings like `my-dataset-v1`.

**Fix applied**: Updated SKILL.md Step 6 and api-reference.md to use `uuidgen`:
```bash
DATASET_UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
curl -X POST .../finetune/datasets -F "dataset_id=$DATASET_UUID" ...
```

**Verification**: Check execution-log.md for successful upload response with `backend_dataset_id`.

### Issue 4: Date-only timestamps in execution log

**Symptom**: Log entries show `[2026-03-06]` instead of `[2026-03-06 13:05:46]`.

**Root cause**: Agents default to simple date format unless explicitly told otherwise.

**Fix applied**: Added mandatory timestamp instruction:
```
Timestamps are mandatory. Every log entry MUST include a full timestamp
in YYYY-MM-DD HH:MM:SS format. Get the current time by running
date '+%Y-%m-%d %H:%M:%S' via Bash before each log entry.
```

**Verification**: Every line in execution-log.md should have `[YYYY-MM-DD HH:MM:SS]` format.

### Issue 5: PDF reading fails

**Symptom**: Read tool returns error on PDF files (pdftoppm not installed or not in PATH).

**Root cause**: Claude Code's Read tool may not support PDFs in all environments.

**Fix applied**: Added pdftotext fallback in Step 2:
```
Reading PDF files: Extract text using pdftotext via Bash:
/opt/homebrew/bin/pdftotext input.pdf output.txt
If pdftotext is not found, try the full path or install poppler-utils.
```

**Verification**: Check that `/tmp/chess-extracted.txt` (or similar) exists and contains text.

### Issue 6: Too few training records

**Symptom**: Agent generates 20-25 records and moves on.

**Root cause**: Without explicit guidance, agents generate a handful of examples and consider the task done.

**Fix applied**: Added minimum volume requirement:
```
A useful dataset needs at least 100-200 total records across all topics.
With 10 leaf topics, that's 10-20 per topic minimum.
```

**Verification**: `wc -l training.jsonl` should show 100+.

### Issue 7: Execution log not updated incrementally

**Symptom**: Log written once at the start, then never updated.

**Fix applied**: Added rule:
```
Rule: Update the execution log after completing each step, before
starting the next one. Don't batch log entries — write them incrementally.
```

---

## How to Test

### Prerequisites

1. vLLora backend running at `localhost:9090` (start via `npm run start:backend` or from gateway repo)
2. A test PDF or document (e.g., `chess-tactics-and-combinations-dave-regis-646.pdf`)
3. Claude Code CLI installed
4. `poppler` installed for pdftotext fallback (`brew install poppler` on macOS, `apt-get install poppler-utils` on Linux)
5. Docker installed for Docling Serve extraction (optional but recommended — `docker run -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest`)

### Setup test repo

```bash
# Create or clean test repo
mkdir -p /path/to/test-repo/.claude/skills/vllora-finetune
cp -r /path/to/finetune-skill/* /path/to/test-repo/.claude/skills/vllora-finetune/

# Allow Bash in test repo
cat > /path/to/test-repo/.claude/settings.json << 'EOF'
{
  "permissions": {
    "allow": ["Bash(*)"]
  }
}
EOF

# Copy test document
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
2. Save extracted content to knowledge/document-extraction.md
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
| Knowledge saved | `cat */knowledge/document-extraction.md` | Structured sections with page numbers |
| Topics valid | `cat */topics.json \| python3 -m json.tool` | Real sourceChunkRefs matching extraction |
| Enough records | `wc -l */training.jsonl` | 100+ lines |
| No .sh files | `find . -name "*.sh"` | No results |
| Full timestamps | `grep -E "\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]" */execution-log.md` | All log entries match |
| Dataset uploaded | grep "POST /finetune/datasets" in log | 200 OK with backend_dataset_id |
| Eval created | grep "POST /finetune/evaluations" in log | 200 OK with evaluation_run_id |
| Eval completed | grep "status.*completed" in log | avg_score and pass_rate visible |
| Grader is hybrid | `head -50 */grader.js` | Both programmatic checks AND `__langdb_call_llm_as_judge_obj` |

### Running from the skill-creator eval framework

If using the skill-creator's formal eval system:

1. Evals are in `evals/evals.json` (3 test prompts defined)
2. Spawn with-skill and without-skill agents per the skill-creator workflow
3. Grade assertions, aggregate into `benchmark.json`
4. Launch `eval-viewer/generate_review.py` for human review

See the skill-creator skill docs for the full framework.

---

## How to Debug

### Agent doesn't execute API calls

1. Check if agent created .sh files: `find . -name "*.sh"`
2. Read execution-log.md — does Step 6 have log entries?
3. If log stops at Step 5: agent probably hit a permission issue with Bash
4. If agent writes shell script: the "NEVER create .sh files" instruction isn't strong enough — make it more prominent in SKILL.md

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

### Agent fabricates sourceChunkRefs

1. Read `knowledge/document-extraction.md` — are real sections listed?
2. Cross-reference with `topics.json` sourceChunkRefs
3. If extraction file doesn't exist: agent didn't actually read the document
4. If extraction exists but refs don't match: agent guessed instead of referencing

### Execution log has date-only timestamps

1. Check if agent ran `date '+%Y-%m-%d %H:%M:%S'` — search execution log for time values
2. If using `[2026-03-06]` format: the timestamp instruction isn't strong enough
3. The example in SKILL.md should show full timestamps — verify it does

### Agent stops after generating data (doesn't call APIs)

1. This is the most common failure mode
2. Check if agent hit max_turns limit
3. Check if agent is waiting for user input
4. The skill needs to be very explicit that the agent should proceed through ALL steps without stopping

---

## Relationship to Lucy Finetune Agent

This skill and the Lucy finetune agent are **two interfaces to the same backend**. They share the same vLLora gateway API endpoints, the same evaluation engine, and the same training infrastructure. The difference is in how the AI orchestrates the pipeline.

### Shared Backend

Both systems call the same REST APIs on the vLLora gateway (`localhost:9090`):

```
                    ┌─────────────────────────────┐
                    │   vLLora Gateway (:9090)     │
                    │                             │
                    │  POST /finetune/datasets    │
                    │  POST /finetune/evaluations  │
                    │  POST /finetune/reinforcement-jobs │
                    │  GET  /finetune/evaluations/{id}   │
                    │  PATCH /finetune/datasets/{id}/evaluator │
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

The gateway doesn't know or care which client is calling it. A dataset uploaded by Lucy can be evaluated by an agent using this skill, and vice versa.

### How They Differ

| Aspect | Lucy Agent (Browser UI) | This Skill (Claude Code CLI) |
|--------|------------------------|------------------------------|
| **Where it runs** | Browser (React app) | Terminal (Claude Code) |
| **AI orchestration** | Distri server → 3 sub-agents (topics, workflow, data generation) | Single agent (Claude) reads skill + knowledge files |
| **Tool execution** | 50+ browser-side tools via @distri/react | Direct API calls via curl in Bash |
| **Data storage** | IndexedDB (browser-local) | Local filesystem (JSONL, JSON, JS files) |
| **State machine** | Formal workflow state machine with validation rules | execution-log.md + iteration-log.md (informal) |
| **User interaction** | Plan approval UI, progress cards, visual feedback | Agent runs autonomously, user reviews outputs |
| **Workflow flexibility** | Fixed 7-step pipeline, steps run from hardcoded registry | Agent decides step order, can skip/repeat/branch |
| **Analysis depth** | Summary stats (avg score, pass/fail count) | Full per-record scores with grader reasoning |
| **Iteration strategy** | Re-run same plan with minor tweaks | Targeted fixes: regenerate weak topics, rewrite grader, escalate |
| **Document handling** | Knowledge sources uploaded via UI, extracted by tools internally | Agent reads PDFs directly, extracts to knowledge/ dir |
| **Grader writing** | Template-based criteria → auto-generated JS | Agent writes full custom JavaScript |
| **Dependencies** | React UI + Distri server + vLLora Gateway | Only vLLora Gateway |

### Lucy's Architecture (6 layers, 3 repos)

```
User ↔ React UI (vllora/ui repo)
       ↕ useChat / @distri/react (vendored)
     Distri Client (@distri/core — A2A protocol)
       ↕ WebSocket/HTTP
     Rust Gateway (vllora/gateway repo)
       ↕ spawns
     Distri Server (distri repo)
       ├── Orchestrator Agent (vllora-finetune-agent.md)
       │   ├── finetune_topics sub-agent (max 10 iterations)
       │   ├── finetune_workflow sub-agent (max 20 iterations)
       │   └── data_generation sub-agent (max 30 iterations)
       └── Tools → sent back to browser for local execution
       ↕
     Browser-side tools (41 tools in src/lib/distri-finetune-tools/)
       ↕
     IndexedDB (datasets, workflows, records, evaluations)
```

### This Skill's Architecture (1 layer, 1 repo)

```
User ↔ Claude Code CLI
       ↕ Reads SKILL.md + knowledge/ files
     Claude (single agent, full autonomy)
       ├── Read/Write local files
       ├── Execute curl via Bash
       └── Parse responses, iterate
       ↕
     vLLora Gateway (localhost:9090)
```

### Why Both Exist

**Lucy** is for users who want a **guided, visual experience** — plan approval, progress tracking, visual feedback. It's good for routine fine-tuning where the steps are predictable.

**This skill** is for users who want **maximum autonomy and intelligence** — the agent reads documents deeply, writes custom graders, diagnoses failures per-record, and escalates when stuck. It's good for complex or novel fine-tuning tasks.

### Cross-Pollination

Insights from building and testing this skill have informed improvements to Lucy:
- The evaluation details gap (Lucy only sees summary stats) → proposed `get_evaluation_details` tool
- The iteration memory gap (Lucy doesn't compare iterations) → proposed iteration history store
- The fixed pipeline gap (Lucy can't branch after eval) → proposed `analyze_and_recommend` step
- Full analysis documented in `/Users/anhthuduong/Documents/GitHub/vllora/ui/docs/enhance-lucy/`

### Shared Concepts

Both systems use the same fine-tuning concepts:
- **Topic hierarchy** with sourceChunkRefs for document tracing
- **Hybrid graders** (programmatic checks + LLM-as-judge)
- **Prompts-only training data** (system + user messages, no assistant — RFT generates responses)
- **GO/NO-GO decision** after evaluation (avg > 0.6, pass rate > 70%)
- **Iteration loop** (evaluate → analyze → fix → re-evaluate)

The skill's knowledge files (`grader-writing.md`, `iteration-strategy.md`, `topic-hierarchy.md`) codify the same best practices that Lucy's agent markdown files encode. If you improve one, consider updating the other.

---

## Concepts & Research

### From research on RFT best practices (OpenAI, Fireworks, Predibase, GRPO)

1. **Base model must have some initial capability** — Can't bootstrap from 0% success rate. Need ~30-60% initial accuracy.
2. **Smooth scoring over binary** — Partial credit (0.0-1.0 range) creates better training gradients than pass/fail.
3. **Reward hacking prevention** — Model can learn shortcuts. Prevention: check outcomes not patterns, add negative criteria.
4. **Task must be unambiguous and guess-proof** — If experts disagree, training signal is noisy.
5. **Reward variability is essential** — If all scores cluster, gradients vanish. Need std 0.15-0.30.
6. **Data quality over compute** — Tighten the grader, clean noisy data, then scale.

### Analysis guidance in the skill

- **Evaluation result analysis** — Reading API responses, bucketing records, pattern-spotting
- **Per-epoch training progress** — Increasing = learning, flat = not learning, decreasing = overfitting
- **Topic distribution** — Balance score formula, under-represented topic detection
- **Per-topic score distribution** — 2x2 matrix (score quality x record count)
- **Data variety checklist** — Question types, complexity, personas, scenarios
- **10 stall patterns + 6-level escalation** — From quick fixes to "start over"

---

## TODO & Future Work

### Testing

- [x] Test PDF extraction via pdftotext
- [x] Test dataset upload with UUID
- [x] Test evaluation job creation and polling
- [ ] Test evaluation results analysis (agent reads results and diagnoses)
- [ ] Test iteration loop (agent fixes issues and re-evaluates)
- [ ] Test training job submission (after good eval scores)
- [ ] Test Docling Serve extraction (Docker required)
- [ ] Test extract-sections.py on non-chess documents
- [ ] Test fallback when Docling is not available
- [ ] Test with different document types (not just chess PDF)
- [ ] Test without any document (objective-only, no PDF)
- [ ] Run skill-creator formal eval (with/without skill comparison)
- [ ] Description optimization via skill-creator's `run_loop.py`

### Skill improvements

- [ ] Add guidance for multi-turn conversation training data
- [ ] Add guidance for structured output fine-tuning (JSON schema enforcement)
- [ ] Add example of a complete end-to-end iteration log from a real project
- [ ] Consider adding a "quick start" template that pre-fills the working directory
- [ ] Test on Cowork (no local filesystem — may need adaptations)
- [ ] Test with different base models (not just gpt-4o-mini)

### Known weaknesses

- Agent sometimes writes output to unexpected directories (ignores specified output path)
- Agent may not update execution-log.md after every single step (sometimes batches)
- Polling loop timeout — if eval takes > 5 minutes, agent's poll loop may expire
- No guidance on what to do if backend is down or returns unexpected errors
- Skill doesn't cover multi-dataset experiments (A/B testing different data strategies)
