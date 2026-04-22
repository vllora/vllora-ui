# Finetune Plugin — Command & Architecture Design

**Status:** Locked decisions (v5 — flow-clarified).
**Author:** Claude + @duonganhthu43.
**Date:** 2026-04-22.

Spec for the `vllora-finetune` Claude Code plugin and its backing CLI. This document describes *what gets built*.

---

## 1. Overview

`vllora` is a local fine-tuning platform. Users fine-tune small LLMs (Qwen 3.5 0.8B / 2B / 4B) from **PDFs**, **OTel traces**, or **pre-built datasets**. Training uses **GRPO** (reinforcement learning), so the pipeline includes grader authoring — not just dataset prep.

### 1.1 The whole system

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                          USER                                        │
 │                                                                      │
 │   Types commands in one of two surfaces (same verbs, same result):   │
 │     (A) Claude Code chat       →   /finetune-<verb>                  │
 │     (B) Terminal / CI / script →   vllora finetune <verb>            │
 └─────────────────────────┬────────────────────────────────────────────┘
                           │ both surfaces trigger the same code
                           ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                      vllora PYTHON CLI                               │
 │                       (the real API)                                 │
 │                                                                      │
 │   Each pipeline verb:                                                │
 │      1. reads pipeline-journal.json (where are we?)                  │
 │      2. spawns workers for LLM-heavy work (claude -p subprocess)     │
 │      3. calls deterministic scripts (validation, quality gates)      │
 │      4. uploads artifacts via gateway HTTP API                       │
 │      5. writes local files + journal                                 │
 │      6. prints "Next: /finetune-<verb>"                              │
 └─────────┬──────────────────┬──────────────────────────┬──────────────┘
           │                  │                          │
           │  reads/writes    │  HTTP upload/query       │  spawns
           ▼                  ▼                          ▼
 ┌──────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐
 │ PROJECT FILES        │  │ GATEWAY (Rust :9090)│  │ WORKERS          │
 │ (user's cwd)         │  │ + SQLite            │  │ claude -p procs  │
 │                      │  │   ~/.vllora/        │  │ inherits claude  │
 │ finetune-project/    │  │   vllora.db         │  │ login OR         │
 │ ├─ config.json       │  │                     │  │ ANTHROPIC_API_KEY│
 │ ├─ journal.json      │  │ workflows, topics,  │  │                  │
 │ ├─ knowledge/        │  │ records, graders,   │  │ do the "thinking"│
 │ ├─ training.jsonl    │  │ evaluation_runs,    │  │ part of each     │
 │ ├─ grader.js         │  │ training_jobs, ...  │  │ phase (extract,  │
 │ ├─ test-runs/        │  │                     │  │ plan, generate,  │
 │ └─ training/         │  │ also: runs inference│  │ grader drafting, │
 │                      │  │ for eval + GRPO     │  │ train monitoring)│
 └──────────────────────┘  └──────────┬──────────┘  └──────────────────┘
                                      │
                                      │  read-only HTTP
                                      ▼
                           ┌──────────────────────┐
                           │ vllora UI            │
                           │ React @ :5173        │
                           │ (visualization only) │
                           └──────────────────────┘

                                      ALSO:
 ┌──────────────────────────────────────────────────────────────────────┐
 │ CACHE  —  ~/.vllora/cache/sources/                                   │
 │ For remote source URIs (hf://, s3://, gs://, azblob://, https://).   │
 │ Content-addressed, LRU, shared across projects.                      │
 └──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Cardinal rules

1. **CLI is the only API.** Both surfaces (plugin in Claude Code, terminal CLI) run the same Python code.
2. **Plugin commands are thin narrators** — they shell out to `vllora finetune <verb>`, stream stdout, add zero logic.
3. **Workers shell out to `claude -p`** for LLM work. Auth is inherited from `claude login` (Claude subscription) or `ANTHROPIC_API_KEY` (CI). **No separate API key required for Claude subscribers.**
4. **Gateway never tracks local file paths.** `vllora.db` has zero references to cwd. A user can delete `finetune-project/` — workflow records survive in DB.
5. **Single authoritative source per artifact.** Local files and DB never both claim ownership — one is authoritative, the other is mirror/cache (see §4.1).
6. **Idempotent commands.** Re-running any command reads `pipeline-journal.json` and skips completed sub-steps.

---

## 2. Surfaces — Plugin ↔ CLI Mapping

Two surfaces, one code path. **Same verb on both. Same result on both.**

### 2.1 How a command actually executes

```
  USER types /finetune-plan in Claude Code
       │
       ▼
  PLUGIN reads ~/.claude/plugins/vllora-finetune/commands/finetune-plan.md
    (thin narrator — contains "shell out to `vllora finetune plan`,
     pipe stdout back, present plan.md to user")
       │
       ▼
  PLUGIN shells out:  vllora finetune plan
       │
       ▼
  CLI (Python) does real work:
    - spawns relation_builder worker → claude -p
    - spawns grader_drafter(init) worker → claude -p
    - renders plan.md
    - uploads topics + relations → gateway HTTP
    - updates analysis.json + journal
       │
       ▼
  CLI streams progress to stdout (stream-json + human text)
  PLUGIN pipes stdout back to Claude Code
       │
       ▼
  USER sees: progress narrated by plugin + final "Next: /finetune-generate"
```

### 2.2 User-facing verbs (both surfaces)

| Verb | Purpose | Duration |
|---|---|---|
| `quickstart` | Guided first-run wizard; chains init→sources with defaults | 2 min |
| `init` | Scaffold `finetune-project/`, create gateway workflow | <10s |
| `sources` | Ingest PDFs and/or OTel traces (from local paths or remote URIs); extract knowledge + trace-analysis | 1–30 min |
| `import-dataset` | Alternative to `sources → plan → generate`: import a pre-built training dataset from local path or URI | 1–10 min |
| `plan` | Build topic hierarchy + relations + grader draft; emit `plan.md` | 1–3 min |
| `generate` | Generate training records, finalize grader, validate, quality-gate | 3–10 min |
| `eval` | Dry-run on 4B + 0.8B; readiness gate; re-run to iterate | 5–15 min/iter |
| `train` | GRPO training + monitor + analyze; re-run for next round | 30 min – 3 hr |
| `status` | Print current step + suggest next command (pure, no-op read) | instant |

### 2.3 CLI-only utilities (not in plugin)

Invoked internally by pipeline verbs; available to power users. `vllora finetune <util>`.

| Utility | Purpose |
|---|---|
| `auto [--scenario X] [--max-iter N]` | Autonomous loop: `status → next-command` until done/blocked |
| `cancel-eval --id <ID>` | Cancel running eval |
| `cancel-training --id <ID>` | Cancel running training job |
| `log-step` | Append structured checkpoint to `pipeline-journal.json` |
| `update-analysis --section X --status Y …` | Update `analysis.json` (user-facing summary) |
| `validate` | Schema-validate `training.jsonl`, topics, relations, grader |
| `reconcile-topics [--apply]` | Reconcile topic IDs vs. derived ground truth |
| `grader-sanity-check` | Run grader against known-good/bad fixtures |
| `probe-difficulty` | K=1 pre-training probe; estimate learnable fraction |
| `diagnose-clipping` | Diagnose auto-cancelled training due to output clipping |
| `dry-run-grader --records X` | Local grader eval without gateway |
| `topics list/add/edit/remove` | Low-level topic mutations |
| `export --adapter` | Export trained adapter for deployment |

### 2.4 Lifecycle commands (CLI only)

| Group | Verbs |
|---|---|
| Lifecycle | `vllora init`, `vllora doctor`, `vllora uninstall`, `vllora upgrade`, `vllora version`, `vllora config get/set` |
| Gateway | `vllora gateway start/stop/status/logs/reset` |
| UI | `vllora ui start/stop/open` (optional pip extra) |

### 2.5 CLI shortcut

`vft <verb>` is an alias for `vllora finetune <verb>`. Same Python code, different entrypoint in `pyproject.toml`. Canonical form in docs; short form for daily terminal use.

### 2.6 Authentication

One setup for all LLM-backed commands, inherited by every `claude -p` subprocess:

```bash
claude login                         # subscription users (recommended — no extra cost)
# OR
export ANTHROPIC_API_KEY=sk-ant-...  # CI / scripted users
```

Precedence: `ANTHROPIC_API_KEY` > `apiKeyHelper` > `CLAUDE_CODE_OAUTH_TOKEN` > `claude login` subscription.

For external source URIs (hf://, s3://, gs://, ...), use provider-standard env vars (`HF_TOKEN`, `AWS_ACCESS_KEY_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, ...). See §4.6.

`vllora doctor` reports what's configured.

---

## 3. End-to-End Flow

### 3.1 Actors

Six roles participate in the flow. Understanding who does what makes the diagrams readable.

| Actor | Role | Lives in |
|---|---|---|
| **USER** | Types commands in chat or terminal. Reviews `plan.md`, decides when to proceed. | — |
| **PLUGIN** | Thin narrator. Reads `plugin/commands/*.md`, shells out to CLI, pipes stdout back to Claude Code. | `~/.claude/plugins/vllora-finetune/` |
| **CLI** | Python process. Coordinates workers + scripts + gateway. Writes local files, uploads to DB. | `vllora/cli/finetune/` |
| **WORKERS** | `claude -p` subprocesses for LLM-heavy work. Inherit user's auth. | Spawned by CLI; prompts in `vllora/cli/finetune/prompts/` |
| **GATEWAY+DB** | Rust HTTP server @ `:9090` + SQLite at `~/.vllora/vllora.db`. Runs model inference for eval + GRPO training. | `~/.vllora/bin/vllora-gateway` |
| **UI** | React app @ `:5173`. Read-only view. Polls gateway for updates. | `vllora ui start` |

### 3.2 Two entry paths (high-level)

```
                (User has PDFs / traces / task / pre-built dataset)
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │  /finetune-init     │
                              └──────────┬──────────┘
                                         │
                       ┌─────────────────┴──────────────────┐
                       ▼                                    ▼
                  RAW MATERIALS PATH              PRE-BUILT DATASET PATH
                       │                                    │
                       ▼                                    ▼
              ┌────────────────┐                  ┌────────────────────┐
              │ /finetune-     │                  │ /finetune-         │
              │   sources      │                  │   import-dataset   │
              │ (PDFs/traces)  │                  │ (skips plan+gen)   │
              └────────┬───────┘                  └─────────┬──────────┘
                       ▼                                    │
              ┌────────────────┐                            │
              │ /finetune-plan │◀── iterate                 │
              └────────┬───────┘                            │
                       ▼                                    │
              ┌────────────────┐                            │
              │ /finetune-     │◀── quality FAIL            │
              │   generate     │                            │
              └────────┬───────┘                            │
                       │                                    │
                       └──────────────┬─────────────────────┘
                                      ▼
                            ┌─────────────────────┐
                            │   /finetune-eval    │◀── readiness FAIL (<5 iter)
                            └──────────┬──────────┘    FAIL × 5: abort
                                       ▼  PASS
                            ┌─────────────────────┐
                            │   /finetune-train   │◀── not converged (<3 rounds)
                            └──────────┬──────────┘
                                       ▼  converged
                                 (Adapter ready)

  /finetune-status — callable anytime; pure; reads journal, suggests next.
```

### 3.3 Per-phase actor flow

Each phase below is a step-by-step trace. **Every line starts with the acting actor in brackets** so there's zero ambiguity about who does what.

Conventions:
- `[USER] …` means the user performs this action.
- `[PLUGIN] …` the Claude Code plugin (thin narrator).
- `[CLI] …` the `vllora` Python CLI.
- `[WORKER:<name>] …` a `claude -p` subprocess spawned by the CLI.
- `[GATEWAY] …` the Rust gateway + SQLite DB.
- `[UI] …` the React frontend.
- `→` indicates a cross-actor message/call.

---

#### PHASE 0 — Install (one-time, before pipeline)

Workflow:

```
   [USER]  $ pip install vllora
      │
      ▼
   [USER]  $ vllora init
      │
      ▼
   [CLI]   prereq checks (Python, `claude` CLI, auth, port 9090)
      │
      ├──  download gateway binary  →  ~/.vllora/bin/
      │
      ├──  start gateway  ────────────▶  [GATEWAY]  up on :9090
      │
      ├──  symlink plugin/  →  ~/.claude/plugins/vllora-finetune/
      │
      ├──  (optional) start UI  ──────▶  [UI]  up on :5173
      │
      └──  prints: "Open Claude Code, type /finetune-quickstart"
```

Detailed steps:

```
 (1) [USER]     runs:   pip install vllora
 (2) [USER]     runs:   vllora init
 (3) [CLI]      checks: Python, `claude` CLI on PATH, Claude auth configured, port 9090 free
 (4) [CLI]      downloads gateway binary → ~/.vllora/bin/vllora-gateway
 (5) [CLI]      starts gateway         → [GATEWAY] listens on :9090
 (6) [CLI]      symlinks plugin/       → ~/.claude/plugins/vllora-finetune/
 (7) [CLI]      (optional) starts UI   → [UI] listens on :5173
 (8) [CLI]      prints "Open Claude Code, type /finetune-quickstart"
```

---

#### PHASE 1 — Init

Workflow:

```
   [USER]  /finetune-init "<objective>"
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune init "<obj>"
                                  │
                                  ├─  parse objective
                                  │
                                  ├─  POST /workflows  ─────▶  [GATEWAY]
                                  │                              INSERT workflows
                                  │                              (id=<uuid>, status=draft)
                                  │
                                  ├─  write local:
                                  │     finetune-project/config.json
                                  │     finetune-project/pipeline-journal.json  (init=done)
                                  │     finetune-project/analysis.json
                                  │     finetune-project/execution-log.md
                                  │
                                  └─  prints stdout
      ▲                              │
      └─  [PLUGIN] pipes back  ──────┘
         "Scaffolded wf <uuid>. Next: /finetune-sources"

   (async)  [UI] polls gateway  →  renders new workflow
```

Detailed steps:

```
 (1) [USER]     types in Claude Code:   /finetune-init "<objective>"
 (2) [PLUGIN]   reads commands/finetune-init.md
 (3) [PLUGIN]   shells out            → [CLI] vllora finetune init "<objective>"
 (4) [CLI]      parses objective
 (5) [CLI]      POST /workflows       → [GATEWAY]  INSERT workflows (id=<uuid>, status=draft)
 (6) [CLI]      writes local:
                  finetune-project/config.json
                  finetune-project/pipeline-journal.json    (init=done)
                  finetune-project/analysis.json
                  finetune-project/execution-log.md
 (7) [CLI]      prints "Scaffolded wf <uuid>. Next: /finetune-sources"   → [PLUGIN] (stdout)
 (8) [PLUGIN]   pipes stdout back     → [USER] sees summary
 (9) [UI]       polls gateway         → renders new workflow
```

---

#### PHASE 2 — Sources (raw-materials path)

Workflow:

```
   [USER]  /finetune-sources ./pdfs hf://org/extra-docs
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune sources ...
                                  │
                                  ├─  URI adapters resolve each arg:
                                  │     ./pdfs              → local (as-is)
                                  │     hf://org/extra-docs → HF client
                                  │                           → ~/.vllora/cache/sources/hf/<hash>/
                                  │
                                  ├─  classify files: PDFs vs OTel traces
                                  │
                                  ├─  spawn N parallel  ───▶  [WORKER: knowledge_extractor × N]
                                  │                             claude -p (max-turns=15,
                                  │                              tools: Read, Write, Bash)
                                  │                             reads one PDF → writes
                                  │                             knowledge/{slug}/*
                                  │
                                  ├─  spawn 1  ────────────▶  [WORKER: trace_analyzer]
                                  │                             claude -p (max-turns=20,
                                  │                              tools: Read, Write)
                                  │                             reads OTel spans → writes
                                  │                             trace-analysis/*
                                  │
                                  ├─  workers stream events  ◀──  [WORKERS]
                                  │
                                  ├─  merge  →  all-parts-index.json
                                  │
                                  ├─  POST /knowledge, /traces  ─▶  [GATEWAY]
                                  │                                   INSERT source_documents (origin_uri)
                                  │                                   INSERT otel_traces       (origin_uri)
                                  │                                   INSERT knowledge_parts
                                  │                                   UPDATE workflows
                                  │                                     SET trace_meta_json,
                                  │                                         status=extracting
                                  │
                                  ├─  journal: sources=done
                                  │
                                  └─  prints stdout
      ▲                              │
      └─  [PLUGIN] pipes back  ──────┘
         "Extracted N PDFs, M traces. Next: /finetune-plan"

   (async)  [UI] polls  →  renders sources tab (with origin URIs)
```

Detailed steps:

```
 (1) [USER]     types:                 /finetune-sources ./pdfs hf://org/extra-docs
 (2) [PLUGIN]   shells out            → [CLI] vllora finetune sources ./pdfs hf://...
 (3) [CLI]      URI adapters resolve each arg:
                  ./pdfs               → use as-is (local)
                  hf://org/extra-docs  → HF client downloads to
                                         ~/.vllora/cache/sources/hf/<hash>/
 (4) [CLI]      classifies files: PDFs vs OTel traces
 (5) [CLI]      spawns N in parallel  → [WORKER:knowledge_extractor × N]
                                          claude -p (max-turns=15, tools: Read, Write, Bash)
                                          reads one PDF; writes knowledge/{slug}/*
 (6) [CLI]      spawns 1             → [WORKER:trace_analyzer]
                                          claude -p (max-turns=20, tools: Read, Write)
                                          reads OTel spans; writes trace-analysis/*
 (7) [WORKERS]  stream progress back  → [CLI]  (each event interpreted, forwarded to stdout)
 (8) [CLI]      merges → all-parts-index.json
 (9) [CLI]      POSTs knowledge/traces → [GATEWAY]  INSERT source_documents (origin_uri)
                                                    INSERT otel_traces       (origin_uri)
                                                    INSERT knowledge_parts
                                                    UPDATE workflows
                                                         SET trace_meta_json,
                                                             analysis_json,
                                                             status=extracting
(10) [CLI]      journal: sources=done
(11) [CLI]      prints "Extracted N PDFs, M traces. Next: /finetune-plan"  → [PLUGIN] → [USER]
(12) [UI]       polls gateway          → renders sources tab with origin URIs
```

---

#### PHASE 2' — Import-dataset (alternative to phases 2–4)

Workflow:

```
   [USER]  /finetune-import-dataset hf://org/my-dataset
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune import-dataset ...
                                  │
                                  ├─  URI adapter resolves  →  local .jsonl / .parquet
                                  │
                                  ├─  auto-detect schema (openai-chat | custom)
                                  │
                                  ├─  validate_dataset.py       (deterministic)
                                  │
                                  ├─  write training.jsonl (with per-record origin_uri)
                                  │
                                  ├─  POST /records  ──▶  [GATEWAY]
                                  │                         INSERT records
                                  │                         (origin_uri, origin_dataset_id)
                                  │
                                  ├─  journal:
                                  │     plan     = skipped (reason: imported)
                                  │     generate = done    (imported: true)
                                  │
                                  └─  prints stdout
      ▲                              │
      └─  [PLUGIN] pipes back  ──────┘
         "Imported N records. Next: /finetune-eval"        →  jumps to PHASE 5
```

Detailed steps:

```
 (1) [USER]     types:                 /finetune-import-dataset hf://org/my-dataset
 (2) [PLUGIN]   shells out            → [CLI] vllora finetune import-dataset hf://...
 (3) [CLI]      URI adapter resolves   → local .jsonl / .parquet
 (4) [CLI]      auto-detects schema (openai-chat | custom)
 (5) [CLI]      runs validate_dataset.py (deterministic)
 (6) [CLI]      writes training.jsonl (with per-record origin_uri)
 (7) [CLI]      POSTs records          → [GATEWAY]  INSERT records (origin_uri, origin_dataset_id)
 (8) [CLI]      journal: plan=skipped, generate=done (imported)
 (9) [CLI]      prints "Imported N records. Next: /finetune-eval"          → [PLUGIN] → [USER]
                                                                 → jumps to PHASE 5
```

---

#### PHASE 3 — Plan

Workflow:

```
   [USER]  /finetune-plan
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune plan
                                  │
                                  ├─  spawn 1  ───▶  [WORKER: relation_builder]
                                  │                    claude -p (max-turns=15)
                                  │                    reads knowledge/, trace-analysis/
                                  │                    writes topics.json, relations.json
                                  │
                                  ├─  spawn 1  ───▶  [WORKER: grader_drafter init mode]
                                  │                    claude -p (max-turns=10)
                                  │                    reads topics + trace hints
                                  │                    writes quality-checker/grader-draft.js
                                  │
                                  ├─  render plan.md (human-readable summary)
                                  │
                                  ├─  POST /topics, /relations  ─▶  [GATEWAY]
                                  │                                   INSERT topics, relations
                                  │                                   UPDATE workflows
                                  │                                     SET status=planning
                                  │
                                  ├─  journal: plan=done
                                  │
                                  └─  prints stdout
      ▲                              │
      └─  [PLUGIN] pipes back  ──────┘
         "Drafted N topics, plan.md. Review. Next: /finetune-generate"

   [USER]   reviews plan.md; optionally edits topics.json
   (async)  [UI] polls  →  renders topic hierarchy
```

Detailed steps:

```
 (1) [USER]     types:                 /finetune-plan
 (2) [PLUGIN]   shells out            → [CLI] vllora finetune plan
 (3) [CLI]      spawns 1              → [WORKER:relation_builder]
                                          claude -p (max-turns=15)
                                          reads knowledge/, trace-analysis/
                                          writes topics.json, relations.json
 (4) [CLI]      spawns 1              → [WORKER:grader_drafter init mode]
                                          claude -p (max-turns=10)
                                          reads topics + trace hints
                                          writes quality-checker/grader-draft.js
 (5) [CLI]      renders plan.md (human-readable summary)
 (6) [CLI]      POSTs topics/relations → [GATEWAY]  INSERT topics, relations
                                                    UPDATE workflows SET status=planning
 (7) [CLI]      journal: plan=done
 (8) [CLI]      prints "Drafted N topics, plan.md. Review. Next: /finetune-generate"
                                        → [PLUGIN] → [USER]
 (9) [USER]     reads plan.md; optionally edits topics.json
(10) [UI]       polls gateway          → renders topic hierarchy
```

---

#### PHASE 4 — Generate

Workflow:

```
   [USER]  /finetune-generate
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune generate
                                  │
                                  ├─  spawn N parallel  ──▶  [WORKER: record_generator × N topics]
                                  │                            claude -p (max-turns=10)
                                  │                            reads topic + knowledge
                                  │                            emits training records
                                  │
                                  ├─  merge  →  training.jsonl
                                  ├─  derive_ground_truth.py      (deterministic)
                                  ├─  reconcile-topics --apply    (deterministic)
                                  │
                                  ├─  spawn 1  ───▶  [WORKER: grader_drafter finalize mode]
                                  │                    claude -p (max-turns=15,
                                  │                     tools: Read, Write, Bash(dry_run_grader *))
                                  │                    agent loop:
                                  │                      dry-run → adjust → dry-run → verify
                                  │                    writes quality-checker/grader.js,
                                  │                      quality-checker/change-log.md
                                  │
                                  ├─  validate_dataset.py     (deterministic)
                                  ├─  data_quality_gate.py    (deterministic)
                                  │
                                  └─  branch on gate result:
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                              ▼
                       PASS                          FAIL
                         │                              │
                         ├─  POST /records, /graders    ├─  journal: generate=done
                         │       ──▶ [GATEWAY]          │     (quality_gate=fail)
                         │    INSERT records            │
                         │    INSERT graders v1, v2     └─  prints "Quality gate FAIL.
                         │      (v2 is_active=true)         Re-run /plan --fix."
                         │    UPDATE topics (UUIDs)         → exit
                         │    UPDATE workflows
                         │      SET status=evaluating
                         │
                         ├─  journal: generate=done
                         │     (quality_gate=pass)
                         │
                         └─  prints stdout
      ▲                        │
      └─  [PLUGIN] pipes back ─┘
         "Generated N records. Quality gate PASS. Next: /finetune-eval"

   (async)  [UI] polls  →  renders records + active grader version
```

Detailed steps:

```
 (1) [USER]     types:                 /finetune-generate
 (2) [PLUGIN]   shells out            → [CLI] vllora finetune generate
 (3) [CLI]      spawns N in parallel  → [WORKER:record_generator × N topics]
                                          claude -p (max-turns=10)
                                          reads topic + knowledge
                                          emits training records
 (4) [CLI]      merges → training.jsonl
 (5) [CLI]      runs derive_ground_truth.py       (deterministic)
 (6) [CLI]      runs reconcile-topics --apply     (deterministic; updates topics.json)
 (7) [CLI]      spawns 1              → [WORKER:grader_drafter finalize mode]
                                          claude -p (max-turns=15,
                                          tools: Read, Write, Bash(dry_run_grader *))
                                          agent loop:
                                            dry-run → adjust → dry-run → verify
                                          writes quality-checker/grader.js,
                                                 quality-checker/change-log.md
 (8) [CLI]      runs validate_dataset.py          (deterministic)
 (9) [CLI]      runs data_quality_gate.py         (deterministic)
(10) [CLI]      IF quality_gate=FAIL:
                  journal: generate=done (quality_gate=fail)
                  prints "Quality gate FAIL. Re-run /finetune-plan --fix."  → exit
                ELSE:
                  POSTs records + grader          → [GATEWAY]  INSERT records
                                                                INSERT graders v1, v2
                                                                  (v2: is_active=true)
                                                                UPDATE topics (UUIDs)
                                                                UPDATE workflows
                                                                  SET status=evaluating
                  journal: generate=done (quality_gate=pass)
                  prints "Generated N records. Quality gate PASS. Next: /finetune-eval"
(11) [UI]       polls gateway          → renders records + active grader version
```

---

#### PHASE 5 — Eval (iteration N of 5)

Workflow:

```
   [USER]  /finetune-eval
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune eval
                                  │
                                  ├─  run_evaluation.py  ──▶  [GATEWAY]
                                  │                             INSERT evaluation_runs (pending)
                                  │                             runs inference on 4B + 0.8B
                                  │                             scores each record
                                  │                             INSERT evaluation_record_scores
                                  │                             UPDATE evaluation_runs
                                  │                               SET status=completed,
                                  │                                   avg_score, learnable_frac,
                                  │                                   trivial_frac, ...
                                  │
                                  ├─  polls until complete  ◀─  [GATEWAY]
                                  │
                                  ├─  cache test-runs/eval-{N}.json
                                  │
                                  ├─  grader_sanity_check.py
                                  ├─  compute readiness gate
                                  │
                                  └─  branch on gate result:
                                        │
                 ┌────────────────────┬─┴────────────────────┬─────────────────────┐
                 ▼                    ▼                      ▼                     │
               PASS            FAIL (grader issue)     FAIL (data/topic issue)     │
                 │                    │                      │                     │
                 │                    ├─  spawn 1 ──▶        │                     │
                 │                    │    [WORKER:          │                     │
                 │                    │     grader_drafter   │                     │
                 │                    │      refine mode]    │                     │
                 │                    │    claude -p (20)    │                     │
                 │                    │    Bash(dry_run_     │                     │
                 │                    │      grader *)       │                     │
                 │                    │    loop: diagnose    │                     │
                 │                    │     → fix → verify   │                     │
                 │                    │    writes            │                     │
                 │                    │     grader.js (new), │                     │
                 │                    │     eval-{N}-grader- │                     │
                 │                    │      diff.md         │                     │
                 │                    │                      │                     │
                 │                    ├─  POST /graders v+1  ├─  writes fix        │
                 │                    │     ──▶ [GATEWAY]    │    suggestion to    │
                 │                    │       INSERT graders │    analysis.json    │
                 │                    │       (is_active=t)  │                     │
                 │                    │                      │                     │
                 ▼                    ▼                      ▼                     │
            journal:              journal:                journal:                 │
             eval=done,            eval=iter N,            eval=iter N,            │
             selected_             last_fix=grader-        last_fix=await-         │
             model=X               refine                  {data|topic}-fix        │
                 │                    │                      │                     │
            UPDATE                 exit                    exit                    │
            workflows              print "Auto-fixed       print "Fix: <...>.      │
            SET selected_           grader. Re-run          Re-run /plan [+        │
            model=X,                /eval."                 /generate]."           │
            status=training          │                      │                     │
                 │                    │                      │                     │
                 ▼                    ▼                      ▼                     │
      "Readiness PASS.                                                             │
       Next: /finetune-train"                                                      │
                                                                                   │
   (async)  [UI] polls  →  renders per-model scores + distributions               │
```

Detailed steps:

```
 (1) [USER]     types:                 /finetune-eval
 (2) [PLUGIN]   shells out            → [CLI] vllora finetune eval
 (3) [CLI]      runs run_evaluation.py → [GATEWAY]  INSERT evaluation_runs (pending)
                                                   runs inference on 4B + 0.8B
                                                   scores each record
                                                   INSERT evaluation_record_scores
                                                   UPDATE evaluation_runs
                                                     SET status=completed, avg_score,
                                                         learnable_frac, trivial_frac,
                                                         zero_variance_frac
 (4) [CLI]      polls completion      ← [GATEWAY]
 (5) [CLI]      caches test-runs/eval-{N}.json
 (6) [CLI]      runs grader_sanity_check.py
 (7) [CLI]      computes readiness gate
 (8) [CLI]      branches on result:

  IF readiness=PASS:
      journal: eval=done, selected_model=X
      UPDATE workflows SET selected_model=X, status=training   → [GATEWAY]
      prints "Readiness PASS. Selected: <X>. Next: /finetune-train"

  IF readiness=FAIL (grader issue — collapse / gaming / gap / OOV / dup / inference):
      [CLI] spawns 1    → [WORKER:grader_drafter refine mode]
                            claude -p (max-turns=20,
                            tools: Read, Write, Bash(dry_run_grader *))
                            agent loop: diagnose → fix → dry-run verify → iterate
                            writes quality-checker/grader.js (new),
                                   test-runs/eval-{N}-grader-diff.md
      [CLI] POST graders v+1 → [GATEWAY]  INSERT graders (is_active=true)
      [CLI] journal: eval=iter N, last_fix=grader-refine
      [CLI] prints "Auto-fixed grader (see eval-{N}-grader-diff.md). Re-run /finetune-eval."

  IF readiness=FAIL (data issue — trivial% high, imbalance, default-mode collapse):
      [CLI] writes fix suggestion to analysis.json
      [CLI] journal: eval=iter N, last_fix=await-data-fix
      [CLI] prints "Fix: <suggestion>. Re-run /finetune-plan + /finetune-generate."

  IF readiness=FAIL (topic issue — hierarchy wrong, stalled 2+ iterations):
      [CLI] writes fix suggestion to analysis.json
      [CLI] journal: eval=iter N, last_fix=await-topic-fix
      [CLI] prints "Fix: <suggestion>. Re-run /finetune-plan."

 (9) [UI]       polls gateway          → renders per-model eval scores + distributions
```

---

#### PHASE 6 — Train (round N of 3)

Workflow:

```
   [USER]  /finetune-train
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune train
                                  │
                                  ├─  probe_difficulty.py  (first round only)
                                  │     POST K=1 eval  ──▶  [GATEWAY]  quick learnable% probe
                                  │
                                  ├─  start_training.py
                                  │     POST /training_jobs  ──▶  [GATEWAY]
                                  │                                  INSERT training_jobs (queued)
                                  │                                  starts GRPO job
                                  │                                  UPDATE status=running
                                  │
                                  ├─  spawn 1 long-running  ──▶  [WORKER: training_monitor]
                                  │                                claude -p (max-turns=50,
                                  │                                 tools: Read, Write,
                                  │                                  Bash(curl gateway/v1/training/*))
                                  │                                every 30s:
                                  │                                  curls metrics ──▶ [GATEWAY]
                                  │                                                      SELECT metrics,
                                  │                                                        job status
                                  │                                  classify window:
                                  │                                    healthy | clipping |
                                  │                                    collapse | plateau
                                  │                                  writes training/{JOB}-
                                  │                                    metrics.json,
                                  │                                    monitor-report-{N}.md
                                  │
                                  │     (meanwhile)  [GATEWAY] streams training metrics
                                  │                              INSERT training_metrics
                                  │                              (step, metric, value)
                                  │
                                  │     [WORKER] exits on job completion  ──▶  [CLI]  final report
                                  │
                                  ├─  analyze_training.py  (deterministic)
                                  │
                                  └─  branch on converged?
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                              ▼
                      converged                     not converged
                         │                              │
                      journal:                       journal:
                       train=done,                    train=iter N,
                       adapter_id=X                   root_cause=<reason>
                         │                              │
                      UPDATE training_jobs            exit
                       SET adapter_id=X,              print "Not converged.
                           status=completed            Root cause: <reason>.
                        ──▶ [GATEWAY]                  Re-run /eval then /train."
                      UPDATE workflows
                       SET status=done
                        ──▶ [GATEWAY]
                         │
                         ▼
                      "Training complete.
                       Adapter: <id>. Converged: yes."

   (async)  [UI] polls  →  renders training charts, adapter metadata
```

Detailed steps:

```
 (1) [USER]     types:                 /finetune-train
 (2) [PLUGIN]   shells out            → [CLI] vllora finetune train
 (3) [CLI]      runs probe_difficulty.py (first round only)
                                       → [GATEWAY]  quick K=1 eval (learnable% probe)
 (4) [CLI]      runs start_training.py → [GATEWAY]  INSERT training_jobs (queued)
                                                    starts GRPO job
                                                    UPDATE training_jobs SET status=running
 (5) [CLI]      spawns 1 long-running → [WORKER:training_monitor]
                                          claude -p (max-turns=50,
                                          tools: Read, Write, Bash(curl gateway/v1/training/*))
                                          every 30s:
                                            curls metrics  → [GATEWAY]  SELECT from
                                                                         training_metrics
                                                                         + training_jobs
                                            classifies window:
                                              healthy | clipping | collapse | plateau | failure
                                            writes training/{JOB_ID}-metrics.json,
                                                   training/monitor-report-N.md
 (6) [GATEWAY]  streams training metrics into DB    → INSERT training_metrics (step, name, value)
 (7) [WORKER]   exits when job reaches terminal state → [CLI]  (final report)
 (8) [CLI]      runs analyze_training.py (deterministic)
 (9) [CLI]      branches on result:

  IF converged:
      journal: train=done, adapter_id=X
      UPDATE training_jobs SET adapter_id=X, status=completed  → [GATEWAY]
      UPDATE workflows SET status=done                          → [GATEWAY]
      prints "Training complete. Adapter: <id>. Converged: yes."

  IF not converged:
      journal: train=iter N, root_cause=<collapse|clipping|plateau>
      prints "Not converged. Root cause: <reason>. Re-run /finetune-eval then /finetune-train."

(10) [UI]       polls gateway          → renders training charts, adapter metadata
```

---

#### Cross-phase summary (who triggers what)

| Phase | Triggered by | Main work happens in | Writes to local | Writes to DB |
|---|---|---|---|---|
| 0. install | [USER] (`vllora init`) | [CLI] | `~/.vllora/` | — |
| 1. init | [USER] (`/finetune-init`) | [CLI] | config, journal | workflows |
| 2. sources | [USER] (`/finetune-sources`) | [WORKERS] + [CLI] | knowledge/, trace-analysis/ | source_documents, otel_traces, knowledge_parts |
| 2'. import | [USER] (`/finetune-import-dataset`) | [CLI] | training.jsonl | records |
| 3. plan | [USER] (`/finetune-plan`) | [WORKERS] + [CLI] | topics, relations, plan.md, grader-draft | topics, relations |
| 4. generate | [USER] (`/finetune-generate`) | [WORKERS] + [CLI] | training.jsonl, grader.js | records, graders |
| 5. eval | [USER] (`/finetune-eval`) | [GATEWAY] (inference) + [CLI] + [WORKERS] (refine) | test-runs/, grader.js (if refined) | evaluation_runs, evaluation_record_scores, graders |
| 6. train | [USER] (`/finetune-train`) | [GATEWAY] (GRPO) + [WORKER:training_monitor] | training/, monitor-report-N.md | training_jobs, training_metrics |

**Every phase is user-triggered.** Nothing runs autonomously. The only long-running background actor is `training_monitor` (phase 6), which observes GRPO training — it doesn't initiate anything.

### 3.4 Phase I/O contract (quick reference)

| Phase | Reads (local) | Reads (DB / external) | Writes (local) | Writes (DB) |
|---|---|---|---|---|
| init | — | — | config.json, journal, analysis.json | `workflows` |
| sources | local paths | URIs → cache | knowledge/, trace-analysis/ | `source_documents`, `otel_traces`, `knowledge_parts`, `workflows.trace_meta_json` |
| import-dataset | — | URI → cache | training.jsonl | `records` |
| plan | knowledge/, trace-analysis/ | — | topics.json, relations.json, grader-draft.js, plan.md | `topics`, `relations` |
| generate | topics/, knowledge/, grader-draft.js | — | training.jsonl, grader.js, change-log.md | `records`, `graders` v1→v2 |
| eval | training.jsonl, grader.js | gateway runs inference | test-runs/eval-{N}.json, grader.js (if refined), grader-diff.md | `evaluation_runs`, `evaluation_record_scores`, `graders` v3+ |
| train | training.jsonl, grader.js | gateway runs GRPO | training/metrics.json, monitor-report-N.md | `training_jobs`, `training_metrics`, `workflows.selected_model`, `workflows.status` |

All phases also write `analysis.json` (local) → mirror to `workflows.analysis_json` (DB) for UI consumption.

### 3.5 State machine + control flow

`pipeline-journal.json` is the single source of truth for "where am I."

```
  init → sources → plan → generate → eval*(1..5) → train*(1..3) → done
                                  OR
         → import-dataset → [plan=skipped, generate=done] → eval → train
```

Re-running any command:
- If last step `status: done` → advance (or no-op with message).
- If last step `status: iterating` → continue next iteration.
- If last step `status: failed` → resume from last good sub-step.
- `--force` starts that step over.

### 3.6 Interaction modes

- **Interactive (chat or terminal).** User types commands one at a time. Each command prints `Next: /finetune-<verb>`.
- **Autonomous (CI / scripted).** `vllora finetune auto --scenario X` loops `status → next-command` until done or blocked.

---

## 4. Artifacts & State

Two stores. **Single authoritative source per artifact** — never "both are source of truth."

### Storage principle

- **User cwd (`finetune-project/` in whatever dir user ran `vllora finetune init`)** — edit surface, git-friendly, user-owned. Not managed by the gateway.
- **Gateway SQLite (`~/.vllora/vllora.db`)** — authoritative for anything the gateway compute or the UI consumes.
- **`~/.vllora/`** — machine-level: gateway binary, DB, user config. Not per-project.

The gateway **does not track local file paths.** If the user deletes `finetune-project/`, the DB still has every workflow record. A future `vllora finetune sync --from-db <workflow-id>` can rebuild local files. This matches Supabase / Vercel / Prisma / git convention (user data in cwd, tool state in `~/.<tool>/`).

### Per-artifact authoritative source

| Artifact | Authoritative source | Other tier | Sync point |
|---|---|---|---|
| `config.json` | Local (user-editable) | — | Read by CLI on every command |
| `pipeline-journal.json` | Local (per-workspace) | — | Never uploaded |
| `analysis.json` | Both (local + DB mirror) | UI reads DB mirror | Every command updates both |
| `execution-log.md`, `iterations.md`, `change-log.md` | Local (append-only notes) | — | Never uploaded |
| `plan.md` | Local (human review) | — | Never uploaded |
| `knowledge/` extraction output | Local (per-doc, large) | DB `source_documents` + `knowledge_parts` mirror parts for UI | End of `sources` |
| `trace-analysis/` | Local | DB `otel_traces` has raw spans; trace-analysis outputs upload as meta on workflows | End of `sources` |
| `topics.json`, `relations.json` | **Local until upload, then DB** | Before `plan` upload: local only. After: DB authoritative (gateway eval uses it). User edits → re-uploaded via `reconcile-topics`. | End of `plan`; re-synced in `generate` |
| `training.jsonl` | **Local until upload, then DB `records`** | Local file remains as snapshot | End of `generate` |
| `quality-checker/grader-draft.js`, `grader.js` | **Local head + DB versioned history** | Each worker write appends a new `graders` row (version+1); local `grader.js` is the head | Every `grader_drafter` write |
| `test-runs/eval-{N}.json` | **DB `evaluation_runs` + `evaluation_record_scores`** | Local file is a cached snapshot for offline inspection | Gateway writes DB; CLI caches local on completion |
| `training/{JOB_ID}-metrics.json` | **DB `training_metrics`** | Local streaming cache | Gateway streams DB; CLI tails into local |
| `training/monitor-report-{N}.md` | Local (human-readable narrative) | — | Written by `training_monitor` worker |

### 4.1 `finetune-project/` — local, per-project

Plain files in the user's chosen directory (wherever they ran `vllora finetune init`). User can inspect, edit, `git init`, `git commit`, share, move.

**Not** managed by the gateway. **Not** stored in `~/.vllora/`. The user owns the directory. `vllora finetune init --project-dir <path>` optionally allows an explicit path, defaulting to `./finetune-project` in cwd.

```
finetune-project/
├── config.json                  # workflow_id, objective, base_model, model candidates
├── pipeline-journal.json        # step checkpoints, iteration counters
├── analysis.json                # user-facing summary (drives UI widgets)
├── execution-log.md             # per-step decision cards (observation, analysis, decision, evidence)
├── iterations.md                # iteration reasoning log
├── plan.md                      # human-readable plan (reviewed between plan → generate)
├── topics.json                  # topic hierarchy (slug IDs locally, UUIDs assigned at upload)
├── relations.json               # topic-to-topic relations
├── training.jsonl               # generated training records
├── knowledge/                   # PDF extraction output
│   ├── {doc-slug}/
│   │   ├── extraction-result.json
│   │   ├── knowledge_parts.json
│   │   └── parts-index.json
│   └── all-parts-index.json     # merged index across all docs
├── trace-analysis/              # OTel-mode (combined mode) output
│   ├── priority.json            # per-topic frequency + failure + priority score
│   ├── topics.json              # coverage gaps vs PDF topics
│   ├── prompts.json             # production system prompt + seed queries
│   ├── grader-hints.json        # failure dimensions + grader criteria
│   ├── tool-schemas.json        # (tool-calling) OpenAI-format tool definitions
│   └── decision-points.jsonl    # (tool-calling) multi-turn training records
├── quality-checker/
│   ├── grader-draft.js          # plan writes (from trace hints)
│   ├── grader.js                # generate finalizes; eval refines
│   └── change-log.md            # append-only: every write's rationale + diff
├── test-runs/                   # eval iterations
│   ├── eval-001.json
│   ├── eval-001-grader-diff.md  # only if eval iter N refined grader
│   └── eval-002.json
└── training/                    # training rounds
    ├── train-001.json
    ├── {JOB_ID}-metrics.json
    └── monitor-report-{N}.md
```

### 4.2 Gateway SQLite — `~/.vllora/vllora.db`

Uploaded for UI rendering and cross-session persistence. Gateway is a **side-effect store**, not the orchestrator.

> Local-file IDs use slugs (e.g., `"cancel-pending-order"`). Gateway assigns UUIDs at upload time. `reconcile-topics` keeps them in sync.

#### Schema (v1 — proposed)

```sql
-- ─── workflows ──────────────────────────────────────────────────
CREATE TABLE workflows (
  id              TEXT PRIMARY KEY,          -- UUID
  name            TEXT NOT NULL,
  objective       TEXT NOT NULL,
  base_model      TEXT,                      -- user-picked candidate (e.g., qwen3.5-0.8b)
  selected_model  TEXT,                      -- chosen after eval
  status          TEXT NOT NULL,             -- draft|extracting|planning|generating|evaluating|training|done|failed
  analysis_json   TEXT,                      -- mirror of local analysis.json (drives UI widgets)
  trace_meta_json TEXT,                      -- OTel-mode: priority/grader-hints summary (mirror of trace-analysis/)
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP NOT NULL
);

-- ─── source_documents (PDFs) ────────────────────────────────────
CREATE TABLE source_documents (
  id                  TEXT PRIMARY KEY,
  workflow_id         TEXT NOT NULL REFERENCES workflows(id),
  slug                TEXT NOT NULL,
  filename            TEXT NOT NULL,
  content_hash        TEXT,
  page_count          INTEGER,
  extraction_status   TEXT NOT NULL,         -- pending|running|done|failed
  extracted_at        TIMESTAMP,
  UNIQUE(workflow_id, slug)
);

-- ─── otel_traces (combined mode) ────────────────────────────────
CREATE TABLE otel_traces (
  id              TEXT PRIMARY KEY,
  workflow_id     TEXT NOT NULL REFERENCES workflows(id),
  trace_id        TEXT NOT NULL,
  span_json       TEXT NOT NULL,             -- full span tree
  parsed_json     TEXT,                      -- normalized conversation turns
  ingested_at     TIMESTAMP NOT NULL,
  UNIQUE(workflow_id, trace_id)
);

-- ─── knowledge_parts ────────────────────────────────────────────
CREATE TABLE knowledge_parts (
  id              TEXT PRIMARY KEY,
  workflow_id     TEXT NOT NULL REFERENCES workflows(id),
  document_id     TEXT REFERENCES source_documents(id),
  trace_id        TEXT REFERENCES otel_traces(id),
  topic_id        TEXT REFERENCES topics(id),  -- assigned later by plan/generate
  kind            TEXT NOT NULL,             -- fact|procedure|schema|synthesis
  content         TEXT NOT NULL,
  meta_json       TEXT
);

-- ─── topics ─────────────────────────────────────────────────────
CREATE TABLE topics (
  id              TEXT PRIMARY KEY,          -- UUID assigned on upload
  workflow_id     TEXT NOT NULL REFERENCES workflows(id),
  slug            TEXT NOT NULL,             -- local-file ID (e.g., "cancel-pending-order")
  name            TEXT NOT NULL,
  parent_id       TEXT REFERENCES topics(id),
  depth           INTEGER NOT NULL,
  system_prompt   TEXT,                      -- per-topic LLM system prompt (used in eval)
  description     TEXT,
  UNIQUE(workflow_id, slug)
);

-- ─── relations ──────────────────────────────────────────────────
CREATE TABLE relations (
  id              TEXT PRIMARY KEY,
  workflow_id     TEXT NOT NULL REFERENCES workflows(id),
  from_topic_id   TEXT NOT NULL REFERENCES topics(id),
  to_topic_id     TEXT NOT NULL REFERENCES topics(id),
  kind            TEXT NOT NULL              -- prerequisite|similar|builds-on|contrasts
);

-- ─── records (training records) ─────────────────────────────────
CREATE TABLE records (
  id                  TEXT PRIMARY KEY,
  workflow_id         TEXT NOT NULL REFERENCES workflows(id),
  topic_id            TEXT REFERENCES topics(id),
  messages_json       TEXT NOT NULL,         -- OpenAI chat format
  ground_truth_json   TEXT,                  -- structured expected output
  tools_json          TEXT,                  -- (tool-calling agents only)
  source_json         TEXT,                  -- refs to knowledge_parts / otel_traces used
  created_at          TIMESTAMP NOT NULL
);

-- ─── graders (versioned) ────────────────────────────────────────
CREATE TABLE graders (
  id              TEXT PRIMARY KEY,
  workflow_id     TEXT NOT NULL REFERENCES workflows(id),
  version         INTEGER NOT NULL,          -- 1 = initial, 2 = finalize, 3+ = eval refine N
  source_js       TEXT NOT NULL,             -- full grader.js content
  change_reason   TEXT,                      -- "initial"|"finalize"|"refine:<diagnosis>"
  is_active       BOOLEAN NOT NULL,          -- only one active per workflow
  created_at      TIMESTAMP NOT NULL,
  UNIQUE(workflow_id, version)
);

-- ─── evaluation_runs ────────────────────────────────────────────
CREATE TABLE evaluation_runs (
  id                      TEXT PRIMARY KEY,
  workflow_id             TEXT NOT NULL REFERENCES workflows(id),
  model                   TEXT NOT NULL,
  grader_version          INTEGER NOT NULL,  -- snapshot of grader used
  iteration               INTEGER NOT NULL,  -- N of 5
  status                  TEXT NOT NULL,     -- pending|running|completed|cancelled|failed
  total_records           INTEGER,
  scored_count            INTEGER,
  zero_score_count        INTEGER,
  perfect_score_count     INTEGER,
  avg_score               REAL,
  learnable_frac          REAL,
  trivial_frac            REAL,
  zero_variance_frac      REAL,
  error_json              TEXT,              -- populated on failure
  started_at              TIMESTAMP,
  completed_at            TIMESTAMP
);

-- ─── evaluation_record_scores (per-record detail) ───────────────
CREATE TABLE evaluation_record_scores (
  eval_run_id     TEXT NOT NULL REFERENCES evaluation_runs(id),
  record_id       TEXT NOT NULL REFERENCES records(id),
  score           REAL NOT NULL,
  details_json    TEXT,                      -- grader output (breakdown, reasoning)
  PRIMARY KEY (eval_run_id, record_id)
);

-- ─── training_jobs ──────────────────────────────────────────────
CREATE TABLE training_jobs (
  id              TEXT PRIMARY KEY,
  workflow_id     TEXT NOT NULL REFERENCES workflows(id),
  model           TEXT NOT NULL,
  grader_version  INTEGER NOT NULL,
  round           INTEGER NOT NULL,          -- N of 3
  status          TEXT NOT NULL,             -- queued|running|completed|failed|cancelled
  config_json     TEXT NOT NULL,             -- GRPO hyperparameters
  adapter_id      TEXT,                      -- populated on success
  root_cause      TEXT,                      -- populated on !converged: collapse|clipping|plateau|...
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP
);

-- ─── training_metrics (streaming) ───────────────────────────────
CREATE TABLE training_metrics (
  job_id          TEXT NOT NULL REFERENCES training_jobs(id),
  step            INTEGER NOT NULL,
  metric_name     TEXT NOT NULL,             -- reward_mean, reward_std, kl_div, clip_frac, ...
  value           REAL NOT NULL,
  logged_at       TIMESTAMP NOT NULL,
  PRIMARY KEY (job_id, step, metric_name)
);
```

#### Which command writes what

Every command writes `analysis_json` on `workflows` (single "user-facing summary" column), so that's omitted from the matrix below.

| Table | init | sources | import-dataset | plan | generate | eval | train |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `workflows` (row) | ✍ create | ✍ status, trace_meta | ✍ status | ✍ status | ✍ status | ✍ status, selected_model | ✍ status |
| `source_documents` | | ✍ (+origin_uri) | | | | | |
| `otel_traces` | | ✍ (+origin_uri) | | | | | |
| `knowledge_parts` | | ✍ | | | ✍ topic_id | | |
| `topics` | | | | ✍ create | ✍ reconcile | | |
| `relations` | | | | ✍ | | | |
| `records` | | | ✍ (+origin_uri, +origin_dataset_id) | | ✍ | | |
| `graders` | | | | | ✍ v1→v2 | ✍ v3+ (refine) | |
| `evaluation_runs` | | | | | | ✍ | |
| `evaluation_record_scores` | | | | | | ✍ | |
| `training_jobs` | | | | | | | ✍ |
| `training_metrics` | | | | | | | ✍ (stream) |

### 4.3 Machine-level state — `~/.vllora/`

Not per-project. One copy per user. Installed and managed by `vllora init`. Does **not** contain project files.

```
~/.vllora/
├── bin/vllora-gateway           # gateway binary
├── vllora.db                    # SQLite store (see 4.2) — authoritative for all workflows
├── config.yaml                  # port, model defaults, telemetry opt-in
└── cache/
    └── sources/                 # content-addressed cache of fetched remote sources
        ├── hf/<dataset-hash>/
        ├── s3/<content-hash>/
        ├── gs/<content-hash>/
        └── https/<content-hash>/
```

Deliberately **not** here:
- No `projects/` directory. Project files live in user's cwd.
- No registry mapping `workflow_id → local_path`. Gateway doesn't know where local files live.
- No per-workflow state beyond what's in `vllora.db`.

**Cache policy:** LRU; cap configured via `vllora config set cache.max_gb N` (default 20). `vllora cache clear` wipes. Same HF dataset across projects downloads once.

### 4.4 `pipeline-journal.json` schema

Single source of truth for "where am I." `status` walks this file in order.

```jsonc
{
  "$schema_version": 1,
  "workflow_id": "wf-0a3b2...",
  "created_at": "2026-04-22T10:00:00Z",
  "updated_at": "2026-04-22T14:23:00Z",
  "steps": {
    "init": {
      "status": "done",                     // done | running | failed
      "started_at":   "2026-04-22T10:00:00Z",
      "completed_at": "2026-04-22T10:00:04Z",
      "artifacts": ["config.json"]
    },
    "sources": {
      "status": "done",
      "pdf_count": 3,
      "trace_count": 120,
      "extraction_errors": []
    },
    "plan": {
      "status": "done",
      "topic_count": 8,
      "relation_count": 14,
      "plan_md_hash": "sha256:..."
    },
    "generate": {
      "status": "done",
      "record_count": 240,
      "quality_gate": "pass",              // pass | fail
      "quality_gate_reason": null
    },
    "eval": {
      "status": "iterating",                // iterating | done | failed
      "iteration": 2,
      "max": 5,
      "selected_model": null,               // populated on done
      "iterations": [
        {
          "iteration": 1,
          "eval_run_ids": ["er-...", "er-..."],
          "readiness": false,
          "root_cause": "grader:zero_variance_too_high",
          "action_taken": "grader-refine",  // grader-refine | await-data-fix | await-topic-fix
          "grader_version_before": 2,
          "grader_version_after":  3
        },
        {
          "iteration": 2,
          "eval_run_ids": ["er-...", "er-..."],
          "readiness": false,
          "root_cause": "data:trivial_frac_too_high",
          "action_taken": "await-data-fix"
        }
      ]
    },
    "train": {
      "status": "pending",                  // pending | iterating | done | failed
      "round": 0,
      "max": 3,
      "adapter_id": null,
      "rounds": []
    }
  }
}
```

**Rules:**
- Append-only within a step (iterations array grows; previous iterations never mutated).
- `status: "done"` is terminal only for non-iterating steps. For iterating steps, `status: "done"` means the gate passed.
- A failed step writes `{ status: "failed", error: "..." }` but does NOT clear prior progress — re-running resumes from last good sub-step.
- Consumers (UI, `/finetune-status`) should tolerate unknown fields (forward-compat).

### 4.5 External source URIs

Both `sources` and `import-dataset` accept local paths **or** URIs from external storage. URI resolution happens in `vllora/cli/finetune/sources/` adapters — one per scheme.

#### Supported schemes

| Scheme | Example | Used for |
|---|---|---|
| `file://` (or bare path) | `./pdfs`, `/abs/path` | Local files |
| `hf://` | `hf://anthropic/hh-rlhf`, `hf://org/dataset@branch` | HuggingFace Hub datasets / files |
| `s3://` | `s3://my-bucket/corpus/`, `s3://bucket/file.jsonl` | AWS S3 |
| `gs://` | `gs://my-bucket/traces/` | Google Cloud Storage |
| `azblob://` | `azblob://container/path/` | Azure Blob Storage |
| `https://` | `https://my-domain/corpus.tar.gz` | Arbitrary HTTPS (supports `.tar.gz`, `.zip` auto-extract) |

#### Adapter contract

```python
class SourceAdapter:
    scheme: str                          # "hf", "s3", "gs", ...

    def resolve(self, uri: str) -> Path:
        """
        1. Authenticate (via provider env vars)
        2. Compute content hash for URI
        3. If cached at ~/.vllora/cache/sources/<scheme>/<hash>/, return path
        4. Else, download/stream into cache dir
        5. Return local path — pipeline sees normal files after this
        """
```

**Workers never know about URIs** — they always receive local paths. URI handling is strictly at the `sources` / `import-dataset` boundary.

#### Provenance in DB

Every uploaded artifact records where it came from:

```sql
ALTER TABLE source_documents ADD COLUMN origin_uri TEXT;
ALTER TABLE otel_traces      ADD COLUMN origin_uri TEXT;
ALTER TABLE records          ADD COLUMN origin_uri TEXT;         -- populated by import-dataset
ALTER TABLE records          ADD COLUMN origin_dataset_id TEXT;  -- HF dataset ID or similar
```

This supports: audit ("where did this record come from?"), reproducibility, and a future `vllora finetune refresh --from-origin <workflow-id>` utility to re-fetch updated source data.

#### Mixed sources

A single command can mix schemes:

```bash
vllora finetune sources \
  ./local-pdfs/ \
  hf://my-org/additional-docs \
  s3://my-bucket/otel-traces/ \
  gs://shared-bucket/corpus.zip
```

Adapters run in parallel; all outputs land in `finetune-project/knowledge/` and `finetune-project/trace-analysis/` with `origin_uri` preserved per document/trace.

### 4.6 Auth for remote sources

No separate `vllora auth` commands. Reuse the standard env vars each provider defines.

| Provider | Primary | Fallbacks |
|---|---|---|
| HuggingFace | `HF_TOKEN` | `~/.cache/huggingface/token` |
| AWS S3 | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | `~/.aws/credentials`, IAM role, instance profile |
| Google Cloud Storage | `GOOGLE_APPLICATION_CREDENTIALS` (path to service-account JSON) | `gcloud auth application-default login` |
| Azure Blob | `AZURE_STORAGE_CONNECTION_STRING` | `DefaultAzureCredential` (CLI, managed identity) |
| HTTPS | — | `--auth-header "Authorization: Bearer ..."` at the command line |

`vllora doctor` reports which providers are configured. `vllora finetune sources hf://...` fails fast with a friendly error if the URI requires an unset provider:

```
✗ hf://anthropic/private-dataset requires HuggingFace auth.
  Set HF_TOKEN in your environment, or run `huggingface-cli login`.
  Docs: https://vllora.dev/auth#huggingface
```

---

## 5. Per-Command Specs

Each row: **inputs** → command → **files written** + **DB writes** + **user-facing output**.

### 5.1 `init <objective>`

| Aspect | Value |
|---|---|
| Preconditions | None |
| Inputs | `<objective>` string |
| Files written | `config.json`, `analysis.json` (skeleton), `pipeline-journal.json` (init → done), `execution-log.md` (empty) |
| DB writes | `workflows` row created |
| Journal entry | `{ init: { status: done, workflow_id: <uuid> } }` |
| Output | `Scaffolded. Workflow: <uuid>. Next: /finetune-sources` |

```
 <objective> + cwd
       │
       ▼
 ┌─ deterministic ────────────────────────────────────┐
 │  1. parse objective                                │
 │  2. POST /workflows → DB: workflows row <uuid>     │
 │  3. mkdir finetune-project/                        │
 │  4. write: config.json                             │
 │           pipeline-journal.json (init→done)        │
 │           analysis.json (skeleton)                 │
 │           execution-log.md                         │
 └────────────────────────────────────────────────────┘
       │
       ▼
 "Scaffolded. Workflow: <uuid>. Next: /finetune-sources"
```

### 5.2 `sources [paths-or-uris...]`

| Aspect | Value |
|---|---|
| Preconditions | `init` done |
| Inputs | Local paths and/or URIs (`hf://`, `s3://`, `gs://`, `azblob://`, `https://`); auto-detect PDFs + traces |
| Files written | `knowledge/{doc-slug}/*`, `trace-analysis/*` (if traces), `all-parts-index.json`, `analysis.json` (sources section) |
| DB writes | `source_documents` (with `origin_uri`), `otel_traces` (with `origin_uri`), `knowledge_parts` |
| Workers used | `knowledge_extractor` (per PDF, parallel), `trace_analyzer` (once) |
| Adapters used | Whichever URI schemes present (see §4.5) |
| Cache | Remote content cached under `~/.vllora/cache/sources/<scheme>/<hash>/` |
| Journal entry | `{ sources: { status: done, pdf_count: N, trace_count: M, origin_uris: [...] } }` |
| Output | `Extracted N PDFs, M traces (from <K> sources). Next: /finetune-plan` |

```
 arguments = paths and/or URIs (any mix)
       │
       ▼
 ┌─ URI resolution (parallel across args) ──────────────────┐
 │  for each arg:                                           │
 │    select adapter by scheme (file://, hf://, s3://, ...) │
 │    authenticate (env vars per provider)                  │
 │    resolve → local path                                  │
 │      if remote: stream to ~/.vllora/cache/sources/...    │
 │    classify content: PDF | trace | mixed archive         │
 └──────────────────────────┬───────────────────────────────┘
                            │  (now all inputs are local paths)
                            ▼
       ├─ PDFs detected? ──yes──▶ spawn N parallel knowledge_extractor
       │                          │  claude -p (max-turns=15)
       │                          │  tools: Read, Write, Bash
       │                          │  → writes knowledge/{doc-slug}/*
       │                          ▼
       │                          DB: source_documents (origin_uri),
       │                              knowledge_parts
       │
       └─ traces detected? ─yes──▶ spawn 1 trace_analyzer
                                   │  claude -p (max-turns=20)
                                   │  tools: Read, Write
                                   │  → writes trace-analysis/*
                                   ▼
                                   DB: otel_traces (origin_uri)
       │
       ▼
 merge knowledge → all-parts-index.json
 update analysis.json (sources section)
 journal: sources → done (with origin_uris list)
       │
       ▼
 "Extracted N PDFs, M traces (from <K> sources). Next: /finetune-plan"
```

### 5.3 `plan`

| Aspect | Value |
|---|---|
| Preconditions | `sources` done |
| Inputs | `knowledge/`, `trace-analysis/` |
| Files written | `topics.json`, `relations.json`, `quality-checker/grader-draft.js`, `plan.md`, `analysis.json` (plan section) |
| DB writes | `topics` (initial), `relations` |
| Workers used | `relation_builder`, `grader_drafter` |
| Journal entry | `{ plan: { status: done, topic_count: N } }` |
| Output | `Drafted N topics, grader-draft.js, plan.md. Review plan.md. Next: /finetune-generate` |

```
 knowledge/, trace-analysis/, config.json
       │
       ▼
 spawn relation_builder
   claude -p (max-turns=15)
   tools: Read, Write
   → writes topics.json
             relations.json
       │
       ▼
 spawn grader_drafter (init mode)
   claude -p (max-turns=10)
   tools: Read, Write
   reads: topics + trace hints + knowledge summary
   → writes quality-checker/grader-draft.js
       │
       ▼
 render plan.md (human-readable summary)
 upload topics + relations → DB
 update analysis.json (plan section)
 journal: plan → done
       │
       ▼
 "Drafted N topics, grader-draft.js, plan.md.
  Review plan.md. Next: /finetune-generate"
```

### 5.4 `generate`

| Aspect | Value |
|---|---|
| Preconditions | `plan` done |
| Inputs | `topics.json`, `relations.json`, `knowledge/`, `trace-analysis/`, `grader-draft.js` |
| Files written | `training.jsonl`, `quality-checker/grader.js` (finalized), `quality-checker/change-log.md`, updated `topics.json` (post-reconcile), `analysis.json` (generate section + quality-gate result) |
| DB writes | `records`, `graders` (active), `topics` (reconciled UUIDs) |
| Workers used | `record_generator` (per topic, parallel), `grader_drafter` (finalize mode — tests draft against records, adjusts) |
| Scripts used | `derive_ground_truth.py`, `reconcile-topics --apply`, `validate_dataset.py`, `data_quality_gate.py`, `dry_run_grader.py` |
| Journal entry | `{ generate: { status: done, record_count: N, quality_gate: pass|fail } }` |
| Output (pass) | `Generated N records. Quality gate: PASS. Next: /finetune-eval` |
| Output (fail) | `Quality gate: FAIL (reason). Re-run /finetune-plan --fix, then /finetune-generate.` |

```
 topics.json, relations.json, knowledge/, trace-analysis/,
 grader-draft.js
       │
       ▼
 spawn N parallel record_generator (one per topic)
   claude -p (max-turns=10)
   tools: Read, Write
   → each emits records for its topic
       │
       ▼
 merge → training.jsonl
       │
       ▼
 derive_ground_truth.py              (deterministic)
 reconcile-topics --apply            (deterministic; updates topics.json)
       │
       ▼
 spawn grader_drafter (finalize mode)
   claude -p (max-turns=15)
   tools: Read, Write, Bash(dry_run_grader *)
   agent loop:
     1. load grader-draft.js
     2. dry-run against 20 sample records
     3. adjust (tpFloor, OOV, dedup, format)
     4. dry-run again → verify smooth distribution
   → writes quality-checker/grader.js
             quality-checker/change-log.md
       │
       ▼
 validate_dataset.py                 (deterministic)
 data_quality_gate.py                (deterministic)
       │
   ┌───┴────┐
  PASS    FAIL
   │        │
   │        └─▶ journal: generate → done (quality_gate: fail)
   │            exit. "Quality gate: FAIL (<reason>).
   │             Re-run /finetune-plan --fix, then /generate."
   │
   ▼
 upload records + grader → DB
 update analysis.json (generate section)
 journal: generate → done (quality_gate: pass)
       │
       ▼
 "Generated N records. Quality gate: PASS. Next: /finetune-eval"
```

### 5.5 `eval`

| Aspect | Value |
|---|---|
| Preconditions | `generate` done with `quality_gate: pass` |
| Inputs | `training.jsonl`, `quality-checker/grader.js`, `config.json` (model candidates) |
| Files written | `test-runs/eval-{iter:03d}.json`, `test-runs/eval-{iter}-grader-diff.md` (if grader refined), `quality-checker/grader.js` (new version if refined), `quality-checker/change-log.md` (append), `analysis.json` (eval section) |
| DB writes | `evaluation_runs` (one per iteration, per model), `graders` (new active version if refined) |
| Workers used | `grader_drafter` (refine mode — only when readiness fails due to grader issue) |
| Scripts used | `run_evaluation.py` (4B + 0.8B), `grader_sanity_check.py`, `dry_run_grader.py` |
| Journal entry | `{ eval: { status: iterating, iteration: N, max: 5, last_fix: "grader-refine"|"await-data-fix"|"await-topic-fix" } }` or `{ eval: { status: done, readiness: pass, selected_model: "..." } }` |
| Output (pass) | `Readiness gate PASS (iter N/5). Selected model: <X>. Next: /finetune-train` |
| Output (grader-refined) | `Readiness FAIL (iter N/5). Root cause: grader <issue>. Applied auto-fix → new grader.js (see eval-{N}-grader-diff.md). Re-run /finetune-eval to verify.` |
| Output (needs user) | `Readiness FAIL (iter N/5). Root cause: <data|topic>. Fix: <suggestion>. Re-run /finetune-plan + /finetune-generate.` |

```
 Iteration N of max 5
 training.jsonl, grader.js, config.json (candidate models)
       │
       ▼
 run_evaluation.py on 4B + 0.8B       (async, via gateway)
       │
       ▼
 wait for completion → test-runs/eval-{N}.json
       │
       ▼
 grader_sanity_check.py
 compute learnable%, trivial%, zero-variance%
       │
       ▼
 ┌─ readiness gate ────────────────────────────────────────────┐
 │                                                             │
 │  PASS      grader issue              data / topic issue    │
 │   │          │                          │                   │
 │   │          ▼                          ▼                   │
 │   │  spawn grader_drafter         write fix suggestion      │
 │   │  (refine mode)                to analysis.json          │
 │   │  claude -p (max-turns=20)     journal: eval → iter N,   │
 │   │  tools: Read, Write,            last_fix = await-       │
 │   │    Bash(dry_run_grader *)       data-fix | await-topic- │
 │   │  agent loop:                    fix                      │
 │   │    diagnose cause              "Readiness FAIL.          │
 │   │    → fix → dry-run verify      Root cause: <data|topic>.│
 │   │    (iterate until stable)      Re-run /plan + /generate."│
 │   │  → writes grader.js (new)                                │
 │   │           eval-{N}-grader-                               │
 │   │            diff.md                                       │
 │   │           change-log.md (append)                         │
 │   │  DB: graders (new version)                               │
 │   │  journal: eval → iter N,                                 │
 │   │    last_fix = grader-refine                              │
 │   │  "Readiness FAIL. Applied                                │
 │   │   auto-fix. Re-run /eval."                               │
 │   ▼                                                          │
 │ upload eval runs → DB (per model)                           │
 │ journal: eval → done,                                        │
 │   readiness = pass,                                          │
 │   selected_model = X                                         │
 │ "Readiness PASS (iter N/5).                                  │
 │  Selected: <X>. Next: /finetune-train"                       │
 └─────────────────────────────────────────────────────────────┘
```

### 5.6 `train`

| Aspect | Value |
|---|---|
| Preconditions | `eval` done with `readiness: pass` |
| Inputs | `training.jsonl`, `quality-checker/grader.js`, `config.json` (selected_model) |
| Files written | `training/train-{iter:03d}.json`, `training/{JOB_ID}-metrics.json`, `training/monitor-report-{iter}.md`, `analysis.json` (train section) |
| DB writes | `training_jobs`, streaming metrics |
| Workers used | `training_monitor` (long-running; diagnoses clipping/collapse/plateau) |
| Scripts used | `probe_difficulty.py`, `start_training.py`, `analyze_training.py` |
| Journal entry | `{ train: { status: iterating, round: N, max: 3 } }` or `{ train: { status: done, adapter_id: "..." } }` |
| Output (ok) | `Training round N complete. Adapter: <id>. Converged: yes.` |
| Output (needs iter) | `Training round N complete. Converged: no. Root cause: <reason>. Re-run /finetune-eval to adjust, then /finetune-train.` |

```
 Round N of max 3
 training.jsonl, grader.js, config.json (selected_model)
       │
       ▼
 probe_difficulty.py      (only on first round)
   K=1 eval → learnable% probe
       │
       ▼
 start_training.py → GRPO job submitted to gateway
   DB: training_jobs (status=running)
       │
       ▼
 spawn training_monitor (long-running)
   claude -p (max-turns=50)
   tools: Read, Write, Bash(curl gateway/v1/training/* *)
   polls metrics, detects clipping / collapse / plateau
   → writes training/{JOB_ID}-metrics.json (streaming)
             training/monitor-report-{N}.md
   → DB: training_jobs (streaming updates)
       │
       ▼  (monitor exits on job completion)
 analyze_training.py      (deterministic)
       │
   ┌───┴──────┐
  converged   not converged
   │            │
   │            └─▶ journal: train → iter N (needs-iter, root_cause=X)
   │                "Round N complete. Converged: no.
   │                 Root cause: <reason>.
   │                 Re-run /eval (to adjust) then /train."
   ▼
 journal: train → done, adapter_id=X
       │
       ▼
 "Training complete. Adapter: <id>. Converged: yes."
```

### 5.7 `status`

| Aspect | Value |
|---|---|
| Preconditions | Any (or none — fresh dir) |
| Inputs | `pipeline-journal.json`, `analysis.json` |
| Files written | None (pure) |
| DB writes | None |
| Output | Current step + summary + `Next: /finetune-<verb>` |

```
 (pure read; no side effects)
       │
       ▼
 read pipeline-journal.json
 read analysis.json (latest summaries per section)
       │
       ▼
 walk journal in order — compute current step + state
       │
       ▼
 print:
   "Workflow:     <uuid>"
   "Current step: <step>"
   "State:        <done|iterating|failed>"
   "Last action:  <ts + summary from analysis.json>"
   "Next:         /finetune-<verb>"
```

### 5.8 `quickstart`

| Aspect | Value |
|---|---|
| Preconditions | None |
| Inputs | Conversational — user tells wizard what they have |
| Files written | Same as `init` + `sources` (chained) |
| DB writes | Same as `init` + `sources` |
| Output | `Set up <scenario>. Extracted sources. Next: /finetune-plan` |

```
 (conversational wizard — the one command that prompts)
       │
       ▼
 explain pipeline (3 sentences)
       │
       ▼
 ┌─ "what do you have?" ─────────────────────────────┐
 │                                                   │
 │   PDFs only     traces only   both     nothing   │
 │      │             │            │         │       │
 │      │             │            │         ▼       │
 │      │             │            │   offer demo:   │
 │      │             │            │     tau-retail  │
 │      │             │            │     medical-qa  │
 │      │             │            │   clone fixture │
 │      │             │            │   → cwd         │
 │      │             │            │   (then falls   │
 │      │             │            │    into "both") │
 │      ▼             ▼            ▼                 │
 │   pdf mode    trace mode   combined mode         │
 └──────┴─────────────┴────────────┴────────────────┘
       │
       ▼
 chain:  /finetune-init <derived objective>
         /finetune-sources
       │
       ▼
 "Scaffolded <scenario>, extracted sources.
  Next: /finetune-plan"
```

### 5.9 `import-dataset <path-or-uri> [--schema X]`

Alternative entry path to `sources → plan → generate`. Skips record generation for users who already have a training dataset.

| Aspect | Value |
|---|---|
| Preconditions | `init` done |
| Inputs | Local path or URI to a `.jsonl`/`.parquet`/HF-dataset; optional `--schema` hint |
| Files written | `training.jsonl`, `analysis.json` (generate section with `imported: true`) |
| DB writes | `records` (each with `origin_uri` + `origin_dataset_id`) |
| Adapters used | Whichever URI scheme present |
| Cache | `~/.vllora/cache/sources/...` (same cache as `sources`) |
| Scripts used | `validate_dataset.py` (schema check), `data_quality_gate.py` (optional) |
| Journal entry | `{ plan: { status: skipped, reason: imported }, generate: { status: done, imported: true, record_count: N } }` |
| Output (ok) | `Imported N records from <uri>. Next: /finetune-eval` |
| Output (fail) | `Invalid dataset: <reason>. Supported schemas: openai-chat, ...` |

```
 arguments = path or URI + optional --schema
       │
       ▼
 resolve via URI adapter (same as sources)
       │
       ▼
 auto-detect schema:
   openai-chat (messages + optional tools + optional ground_truth)
   custom (use --schema to map fields)
       │
       ▼
 validate_dataset.py (schema + required fields)
       │
   ┌───┴────┐
  OK     INVALID
   │        │
   │        └─▶ exit. "Invalid dataset: <reason>."
   ▼
 optional: data_quality_gate.py (warn, not block)
       │
       ▼
 write training.jsonl (with origin_uri per record)
 upload → DB records (with origin_uri, origin_dataset_id)
 journal:
   plan     → skipped (reason: imported)
   generate → done (imported: true)
       │
       ▼
 "Imported N records from <uri>. Next: /finetune-eval"
```

> Users with both raw materials AND an existing dataset can run `sources → plan → generate` then `import-dataset --augment` to merge records. (Deferred to a later version — v0 treats the two paths as mutually exclusive.)

### 5.10 Grader authoring lifecycle (cross-command)

Grader authoring is the most LLM-heavy part of the pipeline. It spans three commands and uses one worker (`grader_drafter`) in **three modes** — same `claude -p` subprocess, different prompts + inputs.

```
 plan        →  grader_drafter(init)       →  grader-draft.js
 generate    →  grader_drafter(finalize)   →  grader.js        (tested vs records)
 eval*(N)    →  grader_drafter(refine)     →  grader.js        (refined vs model scores)
```

#### Mode 1 — init (called by `plan`)

| | |
|---|---|
| When | No grader exists yet |
| Inputs | Objective, knowledge summary, trace-analysis hints, topic hierarchy |
| `claude -p` flags | `--max-turns 10 --allowedTools "Read,Write"` |
| System prompt | Loads `pipeline/skills/grader-writing/SKILL.md` — templates + rules |
| Output | `quality-checker/grader-draft.js` |
| Dry-run? | No — records don't exist yet |

#### Mode 2 — finalize (called by `generate`)

| | |
|---|---|
| When | Draft exists + records just generated |
| Inputs | `grader-draft.js`, `training.jsonl` (sample) |
| `claude -p` flags | `--max-turns 15 --allowedTools "Read,Write,Bash(uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py *)"` |
| System prompt | Finalize mode — validate + adjust for real records |
| Agent loop | 1. Read draft → 2. Dry-run on 20 random records → 3. Check distribution (trivial%, variance) → 4. Adjust (tpFloor, OOV, dedup, format) → 5. Dry-run again → 6. Write finalized grader |
| Output | `quality-checker/grader.js`, `quality-checker/change-log.md` (change reasoning) |

#### Mode 3 — refine (called by `eval` on readiness fail)

| | |
|---|---|
| When | Eval readiness gate fails and root cause = grader (not data / not topics) |
| Inputs | Current `grader.js`, `test-runs/eval-{N}.json` (full scores + failure examples), distribution stats (learnable%, trivial%, zero-variance%), `grader_sanity_check` output |
| `claude -p` flags | `--max-turns 20 --allowedTools "Read,Write,Bash(uv run ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py *)"` |
| System prompt | Refine mode — diagnostic-driven |
| Agent loop | 1. Read current grader + eval results + failures → 2. Diagnose (collapse? gaming? reward gap?) → 3. Propose change → 4. Apply + dry-run to verify → 5. If still broken, iterate → 6. Write new grader + diff report |
| Output | `quality-checker/grader.js` (replaced), `test-runs/eval-{N}-grader-diff.md` (what changed + why) |

#### Root-cause routing (eval iteration N)

```
readiness FAIL
      │
      ├──▶ diagnose via grader_sanity_check + distribution analysis
      │
      ▼
┌─ grader issue? ─────────────────────────▶ refine mode (auto-fix, exit)
│   (collapse, gaming, gap, OOV, dup,
│    inference, hard-gate-zero, etc.)
│
├─ data issue? ──────────────────────────▶ write fix suggestion to
│   (trivial% too high, topic imbalance,     analysis.json; exit.
│    default-mode collapse, zero tool         User: /finetune-plan +
│    calls in ground truth)                   /finetune-generate.
│
└─ topic issue? ─────────────────────────▶ write fix suggestion to
    (stalled 2+ iterations on same              analysis.json; exit.
     topic, hierarchy wrong, drift)              User: /finetune-plan.
```

**Invariants:**
- Grader **never** regresses silently — every refine writes `change-log.md` and a diff report.
- Every new `grader.js` must pass `grader_sanity_check` and `dry_run_grader` before being written.
- Grader refinement happens **only** inside `eval`; `generate` never refines based on model scores.
- The LLM **never proposes arbitrary grader rewrites** — refine mode's system prompt constrains changes to documented failure patterns (see feedback memories: no zero hard-gate, TP-tiered floor, OOV as FP, duplicate emissions as FP, etc.).

**Artifacts across the lifecycle:**

```
finetune-project/quality-checker/
├── grader-draft.js              ← plan writes
├── grader.js                    ← generate finalizes; eval refines
└── change-log.md                ← append-only; every worker write logs
                                   rationale, date, diff summary

finetune-project/test-runs/
└── eval-{N}-grader-diff.md      ← refine mode only; per-iteration diff
```

---

## 6. Worker Protocol

Workers are Python classes in `vllora/cli/finetune/workers/*.py` that wrap `claude -p` subprocess calls. This section specifies the contract: how pipeline verbs invoke workers, what the prompt structure is, and what output each worker produces.

### 6.1 Invocation contract

Every worker exposes this Python API:

```python
class Worker:
    def __init__(self, work_dir: Path, cancel_token: CancelToken):
        self.claude = ClaudeClient(
            cwd=work_dir,
            allowed_tools=[...],            # worker-specific
            max_turns=N,                    # worker-specific
            output_format="stream-json",
            include_partial_messages=True,
            cancel_token=cancel_token,
        )

    async def run(self, input: WorkerInput) -> WorkerResult:
        """Yields progress events; returns structured result."""
        ...
```

Every worker **returns a typed result object** — not just stdout text. This is the concrete contract pipeline verbs rely on.

### 6.2 `claude -p` invocation

The shared `claude_client.py` wrapper emits:

```bash
claude -p \
  --output-format stream-json \
  --include-partial-messages \
  --max-turns <N> \
  --allowedTools "<tool1>" "<tool2>" ... \
  --add-dir "<work_dir>" \
  < system-prompt-and-user-prompt.txt
```

The prompt is piped via stdin (not CLI arg) to avoid shell-escaping issues with large context.

Output is line-delimited JSON, one event per line. The wrapper parses events in real-time:

```jsonc
{"type": "message_start", "role": "assistant"}
{"type": "content_block_delta", "delta": {"text": "..."}}
{"type": "tool_use", "name": "Read", "input": {...}}
{"type": "tool_result", "tool_use_id": "...", "content": "..."}
{"type": "message_stop"}
{"type": "result", "subtype": "success", "result": "..."}  // final
```

The final `result` block contains the worker's output (plain text or JSON, per worker contract).

### 6.3 Prompt structure

All worker system prompts follow this template, stored in `vllora/cli/finetune/prompts/<worker>.md`:

```markdown
# Worker: <worker-name>

<role statement — 1-2 sentences>

## Your task
<concrete goal; what "done" looks like>

## Context provided
- <input1>: <what it is, where to find it>
- <input2>: ...

## Tools you may use
- Read: <scoped paths>
- Write: <scoped paths>
- Bash: <allowed command patterns>

## Rules
- <rule 1 — e.g., never modify input files>
- <rule 2 — e.g., produce output under work_dir only>

## Output contract
Emit your final message as a JSON object matching this schema:

```json
{ ...worker-specific schema... }
```

## Constraints
- Max N turns. Complete the task within budget.
- If you cannot complete, return `{ "status": "incomplete", "reason": "..." }` — do not hallucinate.
```

### 6.4 Cancellation & lifecycle

Every worker subprocess supports clean cancellation:

1. **User triggers cancel** (e.g., `vllora finetune cancel-training --id X` or SIGINT).
2. Pipeline verb sets `cancel_token` flag.
3. `claude_client.py` sends SIGTERM to the `claude -p` subprocess.
4. `claude -p` cleans up in-flight tool uses (subprocess tree killed together).
5. Worker's `run()` raises `CancelledError`.
6. Pipeline verb logs cancellation to journal (`{ status: "cancelled" }`), exits non-zero.

Workers should:
- Respect `cancel_token` between tool calls (long-running tools return partial results).
- **Never swallow `CancelledError`.** Let it propagate.
- Checkpoint frequently (write-ahead) so restart from SIGTERM loses minimal work.

### 6.5 Per-worker specs

#### 6.5.1 `knowledge_extractor`

| | |
|---|---|
| Called by | `sources` (one instance per PDF, run in parallel) |
| `max-turns` | 15 |
| `allowedTools` | `Read`, `Write`, `Bash(pdftotext *)`, `Bash(camelot *)` |
| Inputs | `{ pdf_path, out_dir, doc_slug }` |
| Output JSON | `{ "doc_slug": "...", "parts": [{"id","kind","content","meta"}], "page_count": N, "errors": [] }` |
| Writes | `knowledge/{doc-slug}/{extraction-result.json, knowledge_parts.json, parts-index.json}` |
| Cancellation | Respects token between pages |

#### 6.5.2 `relation_builder`

| | |
|---|---|
| Called by | `plan` (once) |
| `max-turns` | 15 |
| `allowedTools` | `Read`, `Write` |
| Inputs | `{ knowledge_dir, trace_analysis_dir, objective }` |
| Output JSON | `{ "topics": [{"slug","name","parent_slug","depth","description"}], "relations": [{"from_slug","to_slug","kind"}], "coverage_notes": [...] }` |
| Writes | `topics.json`, `relations.json` |

#### 6.5.3 `trace_analyzer`

| | |
|---|---|
| Called by | `sources` (once, only when traces present) |
| `max-turns` | 20 |
| `allowedTools` | `Read`, `Write` |
| Inputs | `{ trace_dir, objective }` |
| Output JSON | `{ "priority": [...], "topics": [...], "prompts": {...}, "grader_hints": [...], "tool_schemas": [...] (optional), "decision_points": [...] (tool-calling only) }` |
| Writes | `trace-analysis/{priority.json, topics.json, prompts.json, grader-hints.json, tool-schemas.json, decision-points.jsonl}` |

#### 6.5.4 `record_generator`

| | |
|---|---|
| Called by | `generate` (one instance per topic, run in parallel) |
| `max-turns` | 10 |
| `allowedTools` | `Read`, `Write` |
| Inputs | `{ topic, knowledge_parts_for_topic, trace_hints_for_topic, record_count, objective }` |
| Output JSON | `{ "topic_slug": "...", "records": [...], "rejected": [{"reason", "candidate"}] }` |
| Writes | appends to `training.jsonl` (via return path — not direct file write) |

#### 6.5.5 `grader_drafter`

Three modes — see §5.9 for the lifecycle.

| Mode | `max-turns` | `allowedTools` | Typical agent loop |
|---|---|---|---|
| init | 10 | `Read`, `Write` | Pick template, emit draft |
| finalize | 15 | `Read`, `Write`, `Bash(uv run ...dry_run_grader *)` | Draft → dry-run → adjust → dry-run |
| refine | 20 | `Read`, `Write`, `Bash(uv run ...dry_run_grader *)` | Diagnose → fix → dry-run verify → iterate |

| | |
|---|---|
| Output JSON (all modes) | `{ "grader_js": "...", "version": N, "change_reason": "...", "diff_from_prev": "...", "dry_run_stats": {...} }` |
| Writes | `quality-checker/{grader-draft.js|grader.js, change-log.md}`; `test-runs/eval-{N}-grader-diff.md` (refine only) |

#### 6.5.6 `training_monitor`

Long-running. Only worker that polls external state continuously.

| | |
|---|---|
| Called by | `train` (spawned right after `start_training.py`) |
| `max-turns` | 50 |
| `allowedTools` | `Read`, `Write`, `Bash(curl http://localhost:9090/v1/training/*)` |
| Inputs | `{ job_id, poll_interval_sec, max_duration_sec }` |
| Poll cadence | **30s default** (configurable via `--poll-interval`); monitor uses a turn only when something notable happens |
| Exit conditions | job status ∈ {completed, failed, cancelled}; OR `max_duration_sec` reached; OR SIGTERM |
| Writes | `training/{JOB_ID}-metrics.json` (streaming, every poll); `training/monitor-report-{N}.md` (on exit); updates `training_jobs.root_cause` on diagnosed failure |
| Output JSON | `{ "job_id": "...", "final_status": "...", "root_cause": null \| "collapse"\|"clipping"\|"plateau"\|..., "events": [...], "verdict": "converged"\|"needs-iter" }` |

**Monitor agent loop (per poll):**

```
1. Bash: curl gateway /v1/training/{job_id}/metrics  → latest N steps
2. Compare metrics vs previous poll (step delta, reward trend, clip_frac, kl_div)
3. Classify window:
     healthy → no turn spent; next poll
     clipping → emit event, note in report
     collapse (zero-variance >X windows) → emit event, root_cause
     plateau (no improvement >N steps) → emit event, root_cause
     failure/completion → emit final event + report, exit
4. Write streaming metrics JSON
5. Sleep poll_interval_sec
```

**Cancellation:** the monitor receives SIGTERM → emits "cancelled" event → writes final report → exits. The actual training job on the gateway is NOT auto-cancelled (user must call `vllora finetune cancel-training --id X` separately). This is deliberate — the monitor is an observer, not an executor.

**Turn budget:** at 30s poll cadence over a 3-hour training run, that's ~360 polls. Most polls don't spend a turn (the monitor's inner loop is mostly Bash tool calls without LLM reasoning). Significant events (collapse detection, final report) spend turns. `max-turns=50` gives headroom.

---

## 7. File Layout

### 7.1 In the `vllora` pip package

```
vllora/
├── pyproject.toml                   # [project.scripts]: vllora, vft
├── cli/
│   ├── __main__.py                  # `vllora` entry
│   ├── finetune_main.py             # `vft` entry (scoped to `finetune` group)
│   ├── lifecycle/                   # init, doctor, uninstall, upgrade, config
│   ├── gateway/                     # start, stop, status, logs, reset
│   ├── ui/                          # start, stop, open
│   └── finetune/
│       ├── init.py, sources.py, plan.py, generate.py, eval.py,
│       │   train.py, status.py, quickstart.py, auto.py
│       ├── utilities/               # cancel-eval, grader-sanity-check, ...
│       ├── workers/                 # AI workers — shell out to `claude -p`
│       │   ├── claude_client.py     # subprocess wrapper, stream-json parser
│       │   ├── knowledge_extractor.py
│       │   ├── relation_builder.py
│       │   ├── trace_analyzer.py
│       │   ├── record_generator.py
│       │   ├── grader_drafter.py
│       │   └── training_monitor.py
│       └── prompts/                 # system prompts loaded by workers
├── scripts/                         # deterministic pipeline scripts (unchanged)
└── plugin/                          # Claude Code plugin bundle
    ├── plugin.json
    ├── commands/                    # 8 slash commands
    ├── skills/                      # reference skills (pipeline-context, grader-writing, ...)
    └── resources/                   # templates, reference docs
```

### 7.2 On the user's machine (after `vllora init`)

```
~/.vllora/
├── bin/vllora-gateway
├── vllora.db
└── config.yaml

~/.claude/plugins/vllora-finetune/   # symlinked from pip package's plugin/
├── plugin.json
├── commands/
├── skills/
└── resources/
```

### 7.3 Per-project (cwd)

```
finetune-project/                    # see §4.1 for full tree
```

---

## 8. Invariants

- **Idempotent.** Re-running a command reads the journal and skips completed sub-steps. `--force` to redo.
- **Journal is source of truth.** `pipeline-journal.json` is the only store for "where am I."
- **Status is pure.** No mutations. No network calls (reads cached analysis).
- **Implicit approval.** Running `generate` after `plan` = approval. No `--approve` flag.
- **Same verb, same behavior.** `vllora finetune eval` and `/finetune-eval` produce identical artifacts.
- **Plugin is thin.** No Python, no pipeline logic, no direct gateway calls. Only narrates CLI output.
- **CLI inherits auth.** `claude -p` uses whatever `claude login` or `ANTHROPIC_API_KEY` has configured. No separate key management in `vllora`.
- **Slug IDs local, UUIDs at boundary.** Local files use slugs; gateway assigns UUIDs on upload. `reconcile-topics` keeps them mapped.
- **UI is read-only.** React FE queries gateway. Never mutates pipeline state.
- **Single authoritative source per artifact.** See §4 storage principle. Files and DB never both claim ownership. The "authoritative source" column is the contract.
- **Gateway never tracks local paths.** `vllora.db` has zero references to cwd paths. The user can move, rename, or delete `finetune-project/` without affecting workflow records. (Rebuild-from-DB is a future utility, not a day-one feature.)
- **Project files live in user's cwd.** Never in `~/.vllora/`. Matches git / Supabase / Vercel / Prisma convention.

---

## 9. Install

### 9.1 One-time setup

```bash
claude login                         # or set ANTHROPIC_API_KEY
pip install vllora
vllora init
```

`vllora init` does: prereq checks (Claude auth, Python, `claude` CLI, port 9090) → downloads gateway binary → starts gateway → symlinks `plugin/` → `~/.claude/plugins/vllora-finetune/` → optionally starts UI. Rolls back on error.

### 9.2 Upgrade / uninstall

```bash
pip install -U vllora && vllora init --repair     # upgrade
vllora uninstall && pip uninstall vllora          # clean removal
```

### 9.3 CI / headless

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
steps:
  - run: npm i -g @anthropic-ai/claude-code
  - run: pip install vllora && vllora init --non-interactive
  - run: vllora finetune auto --scenario tau-retail
```

---

## 10. Open Questions

1. `plugin.json` manifest schema — confirm exact fields, glob patterns, command/skill enumeration against current Claude Code plugin loader.
2. Plugin auto-reload — does Claude Code re-read `~/.claude/plugins/*` on file change, or is a restart required?
3. `claude -p` stream-JSON schema stability — marked beta; mitigation is pinning a minimum Claude Code CLI version in `vllora init` prereq.
4. `claude -p` parallelism — verify ≥4 concurrent subprocesses work cleanly on Claude Pro / Team tiers.
5. Gateway binary distribution — pre-built wheels per-platform, or download on `vllora init`? (Leaning: download.)
6. Demo fixtures — ship tau-retail/medical-qa in pip package, or fetch on quickstart? (Leaning: fetch.)
7. UI distribution — bundle in main pip package, or separate `vllora[ui]` extra? (Leaning: extra.)
8. Worker tool scoping — audit `--allowedTools` list per worker (e.g., `training-monitor` only needs `Read`, `Write`, `Bash(curl *)`).
9. Token cost disclosure — should `/finetune-status` track cumulative token usage per workflow?
10. Dev plugin split — should `/finetune-run <scenario>`, `/finetune-analyze`, `/finetune-kill`, `/finetune-test-loop` move to a separate `vllora[dev]` plugin?

---

## 11. Non-Goals

- Changing the pipeline itself (GRPO, grader, readiness, scripts — unchanged).
- Replacing `pipeline-journal.json` (formalized, not replaced).
- Full rewrite (incremental; existing skill keeps working during the transition).
- REST API for driving the pipeline (CLI is the only API).
- Publishing plugin to Claude Code marketplace in v0 (pip is sole install path).

---

## 12. Success Criteria

- `pip install vllora` → scaffolded project in under 5 minutes.
- New user completes one end-to-end run without docs, following `Next:` hints.
- Any command `.md` file ≤ 150 lines.
- `/finetune-status` on fresh project prints `Next: /finetune-init`. Mid-pipeline: exact next command.
- `vllora finetune auto --scenario X` produces same end state as today's monolithic run, as an observable command sequence.
- Re-running any command on a completed step is a no-op.
- CLI + plugin versions never diverge (single pip package).
- Claude subscribers never configure an API key — `claude login` is the only auth step.
