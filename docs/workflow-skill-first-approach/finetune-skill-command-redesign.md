# Finetune Plugin — Command & Architecture Design

**Status:** Locked decisions (v5 — flow-clarified).
**Author:** Claude + @duonganhthu43.
**Date:** 2026-04-22.

Spec for the `vllora-finetune` Claude Code plugin and its backing CLI. This document describes *what gets built* and *why*.

## Related docs

| Doc | Purpose |
|---|---|
| **[implementation-plan.md](./implementation-plan.md)** | Cross-feature coordination: track assignments (A/B/C), milestones, interface contracts between tracks. |
| **[openclaw-integration.md](./openclaw-integration.md)** | v2 roadmap for OpenClaw-host plugin wrapping the same CLI. |
| **spec-kit repo: `finetune-workflow-speckit/`** | Per-feature specs (001–006) with acceptance criteria, FRs, data models, task breakdowns. See `.specify/memory/constitution.md` for project principles (informs §9 invariants below). |

**Feature mapping:**

| Feature | spec-kit dir | Track | What |
|---|---|---|---|
| 001 | `specs/001-job-based-cli-api/` | A | Gateway job API + Layer B catalog (§2.4) |
| 002 | `specs/002-state-and-gateway-client/` | A | Python state helpers (§4.7) + typed gateway client |
| 003 | `specs/003-cli-pipeline-verbs/` | B | Pipeline verbs (§5) + workers (§6.5) + URI adapters (§4.5) |
| 004 | `specs/004-claude-code-plugin/` | C | Plugin bundle (§7) — orchestrator + thin commands + skills |
| 005 | `specs/005-install-flow/` | C | `vllora init/doctor/uninstall` (§10) |
| 006 | `specs/006-ui-analysis-integration/` | C | React UI consumers of `analysis.json` + grader diffs + training metrics |

---

## 1. Overview

`vllora` is a local fine-tuning platform. Users fine-tune small LLMs (Qwen 3.5 0.8B / 2B / 4B) from **PDFs**, **OTel traces**, or **pre-built records**. Training uses **GRPO** (reinforcement learning), so the pipeline includes grader authoring — not just training-data prep.

### 1.1 The whole system

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                          USER                                        │
 │                                                                      │
 │   Picks one of three surfaces (all call the same CLI underneath):    │
 │     (A) Claude Code — orchestrator mode    →  /finetune              │
 │         (thick agent; holds context, engages dialogue, drives the    │
 │          whole pipeline in one session — §2.3.1)                     │
 │     (B) Claude Code — direct verb mode     →  /finetune-<verb>       │
 │         (thin narrator per phase — §2.3.2)                           │
 │     (C) Terminal / CI / script             →  vllora finetune <verb> │
 │         (headless, same verbs — §2.3.2)                              │
 └─────────────────────────┬────────────────────────────────────────────┘
                           │ all three surfaces trigger the same CLI
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

1. **CLI is the only API.** All pipeline logic lives in the Python CLI. Every user-facing surface (orchestrator, thin verbs, direct terminal, CI) calls into the same CLI code path.
2. **Plugin has two modes over the same CLI** (§2.3):
   - **Orchestrator** (`/finetune`) — thick, stateful; holds context across phases, dialogues with user.
   - **Thin verb commands** (`/finetune-<verb>`) — one per phase; narrator only, no state.
   Orchestrator uses thin verbs (or the CLI) as its tools. Both surfaces ship in the plugin; users pick.
3. **Workers shell out to `claude -p`** for LLM work. Auth is inherited from `claude login` (Claude subscription) or `ANTHROPIC_API_KEY` (CI). **No separate API key required for Claude subscribers.**
4. **Gateway never tracks local file paths.** `vllora.db` has zero references to cwd. A user can delete `finetune-project/` — workflow records survive in DB.
5. **Single authoritative source per artifact.** Local files and DB never both claim ownership — one is authoritative, the other is mirror/cache (see §4.1).
6. **Idempotent commands.** Re-running any command reads `pipeline-journal.json` and skips completed sub-steps.
7. **Artifacts are context carriers.** `analysis.json`, `plan.md`, `change-log.md`, `iterations.md` carry reasoning between phases, not just status. Short-lived workers and fresh orchestrator sessions both depend on them (§14.9).

---

## 2. Surfaces — Plugin ↔ CLI Mapping

Three surfaces, one code path. The CLI is the real API; surfaces differ only in how the user drives it.

### 2.1 How a command actually executes

Two flows, same CLI underneath. Pick the flow that matches the surface the user chose.

#### Flow A — Thin verb command (direct control)

```
  USER types /finetune-plan in Claude Code
       │
       ▼
  PLUGIN reads ~/.claude/plugins/vllora-finetune/commands/finetune-plan.md
    (thin narrator — "shell out to `vllora finetune plan`,
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

One command, one pipeline step. User drives each phase by typing the next verb.

#### Flow B — Orchestrator command (guided / dialogue-driven)

```
  USER types /finetune in Claude Code
       │
       ▼
  PLUGIN reads commands/finetune.md  (thick orchestrator playbook)
    Claude Code enters an agent loop, continuously:
       │
       ▼
  ORCHESTRATOR (Claude, in-session):
    - reads pipeline-journal.json + analysis.json
    - decides next action (run phase / ask user / diagnose)
    - uses tools:
        Bash      → `vllora finetune <verb>`  (calls CLI for pipeline work)
        Read/Write→  inspects + edits artifacts
        Task      →  focused subagent if parallel work helps
    - receives CLI output, incorporates into running narrative
    - dialogues with user when input is needed
       │
       ▼   (CLI invocation — same as Flow A's CLI path)
  CLI does real work (spawns workers, uploads, writes journal)
       │
       ▼
  ORCHESTRATOR reads resulting artifacts, plans next phase,
  or pauses to ask user. Loops until pipeline complete.
       │
       ▼
  USER experiences: ongoing conversation, same Claude Code session,
  from "let's fine-tune a model" all the way to "adapter ready"
```

Many CLI invocations, one user conversation. The orchestrator holds context across phases and engages the user naturally.

#### Flow C — CLI direct (terminal / CI)

```
  USER types `vllora finetune plan` in terminal (or in CI)
       │
       ▼
  CLI (Python) does real work:
    (identical to Flow A's CLI path)
       │
       ▼
  stdout → terminal
```

No plugin layer. Useful for scripts, Makefiles, GitHub Actions.

**Key observation:** all three flows converge on the same CLI code path. The difference is purely in who drives the sequence — user's typed verb (A), Claude-as-orchestrator (B), or external script (C).
```

### 2.2 Two-layer command model

The CLI exposes **two layers** of commands:

- **Layer A — Pipeline verbs** (user-facing). Map 1:1 to plugin slash commands. Pipeline-position-aware (`init → sources → plan → …`). Each verb composes one or more Layer B operations plus local scripting + file I/O.
- **Layer B — Job operations** (backend contract). Job-based primitives with idempotency, polling, cancellation. Mirror the workflow-scoped API. Usable directly for CI / API-first users.

Plugin commands shell out to Layer A. Layer A internally calls Layer B. Layer B commands are also first-class — power users, CI pipelines, and SDK clients invoke them directly.

```
  Claude Code chat          Terminal CLI (Layer A)        Terminal CLI (Layer B)
  ─────────────────         ──────────────────────        ──────────────────────
  /finetune-sources   ──▶   vllora finetune sources  ──▶  vllora finetune knowledge add
                                                          vllora finetune records generate
                                                           (Layer A composes one or more B ops)
```

### 2.3 Layer A — Pipeline commands (user-facing)

Layer A has **two flavors**, both backed by the same CLI underneath. Users pick the flavor that matches how they want to work.

#### 2.3.1 Orchestrator command — `/finetune` (thick)

A **single stateful command** that drives the entire pipeline in one Claude Code session. Holds running context across phases, engages the user in dialogue, makes decisions, handles surprises. Under the hood, it calls the same verb CLI as the thin commands below — but wraps them in a continuous agent loop.

| Plugin | Kind | When to use |
|---|---|---|
| `/finetune` | `ORCHESTRATOR` | First-time users; exploratory ML research; deep iteration; anyone wanting dialogue, cross-step reasoning, and guided recovery from failures |

**What the orchestrator does:**

1. Reads pipeline state (`pipeline-journal.json` + `analysis.json`) on startup.
2. Decides next action — run a phase, ask the user, diagnose a failure, iterate on the grader.
3. Executes via tools: `Bash` to call CLI verbs, `Read`/`Write` to inspect + edit artifacts, optionally `Task` to spawn focused subagents for parallel work.
4. Incorporates results into its running narrative.
5. **Dialogues with the user when input is needed** — topic ambiguity, grader strategy, iteration decisions.
6. Loops until pipeline done, blocked, or user exits.

**What it does NOT do:**
- Duplicate CLI logic — it *calls* the CLI; the CLI still owns pipeline logic, determinism, and state.
- Hold raw artifacts (PDFs, full training.jsonl) in its context window — delegates heavy-context work to CLI-spawned workers and only reads summaries.

**Why this mode exists:** see §14.10 — solves cross-step implicit reasoning, exploratory research workflows, expert deep dives, and rich mid-pipeline dialogue. These are the four dimensions where thin-only mode loses to the old monolithic SKILL.md.

#### 2.3.2 Direct verb commands (thin)

One slash command per pipeline phase. Each is a thin narrator that shells out to a single CLI verb. Pipeline-position-aware; reads `pipeline-journal.json` to pick up where last run left off. `Kind` column per §2.11.

| Plugin | CLI (Layer A) | CLI short alias | Purpose | Duration | Kind |
|---|---|---|---|---|---|
| `/finetune-quickstart` | `vllora finetune quickstart` | `vft quickstart` | Guided first-run wizard; chains init→sources with defaults | 2 min | `WIZARD → LLM` |
| `/finetune-init` | `vllora finetune init <obj>` | `vft init <obj>` | Scaffold `finetune-project/`, create gateway workflow | <10s | `DET` |
| `/finetune-sources` | `vllora finetune sources <paths/URIs>` | `vft sources …` | Ingest PDFs / OTel traces from local paths or remote URIs | 1–30 min | `LLM` |
| `/finetune-import-records` | `vllora finetune import-records <path/URI>` | `vft import-records …` | Alternative to sources+plan+generate: import pre-built records | 1–10 min | `DET` |
| `/finetune-plan` | `vllora finetune plan` | `vft plan` | Build topic hierarchy + relations + grader draft; emit `plan.md` | 1–3 min | `LLM` |
| `/finetune-generate` | `vllora finetune generate` | `vft generate` | Generate training records, finalize grader, validate, quality-gate | 3–10 min | `MIXED` |
| `/finetune-eval` | `vllora finetune eval` | `vft eval` | Dry-run on 4B + 0.8B; readiness gate; re-run to iterate | 5–15 min/iter | `DET+COMPUTE` (on FAIL → `LLM`) |
| `/finetune-train` | `vllora finetune train` | `vft train` | GRPO training + monitor + analyze; re-run for next round | 30 min–3 hr | `DET+COMPUTE + LLM` (monitor) |
| `/finetune-status` | `vllora finetune status` | `vft status` | Print pipeline-level current step + suggest next command | instant | `PURE` |

**When to use thin mode:** power users who know exactly which step they want; re-running specific steps; scripted workflows inside Claude Code; users who prefer explicit control over agent improvisation.

#### 2.3.3 Three user-facing modes, same CLI underneath

```
  User intent                        →  Uses                          →  Underneath
  ──────────                            ────                             ──────────
  
  "Drive the whole pipeline for me,    /finetune            ────────┐
   engage me, reason, handle           (orchestrator, thick,        │
   surprises."                          stateful, dialogue)         │
                                                                    ▼
  "I know the step I want — run it."   /finetune-<verb>     ──▶  vllora finetune
                                       (thin wrapper)              <verb>
                                                                    ▲
  "CI / automation, no chat."          vllora finetune <verb>──────┘
                                       (CLI direct)
```

All three call into the **same CLI code path**. The orchestrator adds a reasoning + dialogue layer on top of the thin verbs; the thin verbs add a narration layer on top of the CLI; the CLI is the real pipeline.

### 2.4 Layer B — Job operations (backend contract)

Job-based primitives. Each command creates, polls, or cancels a **job** identified by `job_id`. CLI ↔ API parity is enforced: every Layer B command maps to a workflow-scoped HTTP route. Useful directly for CI, SDK, and advanced workflows.

#### Generic job status

| Command | Purpose | Duration | Required flags | Kind |
|---|---|---|---|---|
| `vllora finetune jobs status` | Retrieve current state for an existing job (read-only) | instant | `--job-id <id>` | `PURE` |

Output: `state`, timestamps, progress, terminal outcome (when available). Sourced from persisted DB records.

#### Task operations

| Command | Purpose | Duration | Kind | Artifacts (persisted outputs) |
|---|---|---|---|---|
| `vllora finetune knowledge add` | Ingest knowledge sources into the workflow | 1–30 min | `LLM` | Document blobs in object storage + SQLite references to those documents |
| `vllora finetune records import` | Import pre-built records into the workflow | 1–10 min | `DET` | Records rows in SQLite (with `origin_uri`, `origin_source_id`) |
| `vllora finetune records generate` | Generate training records from workflow knowledge + topics | 3–10 min | `LLM` | Task output + records rows in SQLite + topics in SQLite + relationships in SQLite |
| `vllora finetune grader import` | Import an externally-authored grader.js | <1 min | `DET` | Grader version in SQLite (with `change_reason`) |
| `vllora finetune grader generate` | Generate or revise grader (init / finalize / refine mode) | 1–5 min | `LLM` | Task output + grader version in SQLite |
| `vllora finetune grader dryrun` | Dry-run grader on sample records for validation | 1–5 min | `DET` | Task output + dry-run result in SQLite |
| `vllora finetune eval run` | Run evaluation job for readiness + quality signals | 5–15 min | `DET+COMPUTE` | Task output + eval result in SQLite |
| `vllora finetune eval stop` | Cancel a running eval job | instant | `DET` | Task output + eval result state update in SQLite |
| `vllora finetune train run` | Submit GRPO training job | 30 min–3 hr | `DET+COMPUTE` | Task output + train metrics in SQLite + trained weights in object storage |
| `vllora finetune train stop` | Cancel a running training job | instant | `DET` | Task output + train metrics/state update in SQLite + checkpoint weights in object storage |

#### Shared flags (Layer B task commands)

**Optional:**
- `--idempotency-key <key>` — if omitted, server generates and returns one. Same key + equivalent payload returns the existing `job_id`.
- `--only-tracking` — return after create ack; subsequent polls via `jobs status`.
- `--input <json>` — structured input (provisional; currently accepted but not semantically processed).

**Required for `stop` commands:** `--job-id <id>`.

#### Shared output contract

- Immediate `job_id` and `operation` echo.
- Response includes `idempotency_key` (provided or server-generated).
- `run` commands (default, no `--only-tracking`): stream lifecycle updates until terminal state.
- `run` commands (`--only-tracking`): acknowledge create and return; track later via `jobs status`.
- `stop` commands: request backend cancellation and return resulting lifecycle state.
- Job state is persisted (DB-backed). Status retrieval is polling-only in this iteration — no push/stream transport contract.

### 2.5 Error contract (both layers)

| Condition | Code |
|---|---|
| Invalid input | `INVALID_REQUEST` |
| Unknown job / workflow | `NOT_FOUND` |
| Auth failure | `UNAUTHORIZED` |
| Authz failure | `FORBIDDEN` |
| Stop request for terminal or non-cancellable job | `CONFLICT` (with idempotent cancellation details) |

### 2.6 Layer A → Layer B composition

Each Layer A pipeline verb composes one or more Layer B operations plus deterministic scripting. Layer A is **not** just "alias for Layer B": it also owns `pipeline-journal.json` advancement, local file I/O, plan.md rendering, and user-facing summaries.

| Layer A verb | Layer B operations it invokes (in order) |
|---|---|
| `init` | (no Layer B call) — creates workflow via `POST /workflows` directly |
| `sources` | `knowledge add` (one job per batch of sources) |
| `import-records` | `records import` |
| `plan` | `records generate --only-tracking` (topics/relations sub-op) + `grader generate` (init mode) |
| `generate` | `records generate` (records sub-op) + `grader generate` (finalize mode) + `grader dryrun` |
| `eval` | `eval run`; on FAIL-with-grader-issue, also `grader generate` (refine mode) |
| `train` | `train run` |
| `status` | `jobs status` for the most recent job per domain, merged with journal state |
| `quickstart` | `init` + `sources` (chained) |

Plugin slash commands map to Layer A verbs (name-for-name). Layer B remains terminal-only — not exposed in the plugin surface, since the plugin audience is step-by-step interactive users who benefit from pipeline-position awareness.

#### 2.6.1 Artifact references inside pipeline flows

When a flow step in Section 3 says "run `sources`/`generate`/`eval`/`train`", interpret the persisted side effects through the Layer B artifact contract above:

- `sources` phase persists via `knowledge add` (object storage documents + SQLite references).
- `import-dataset` persists via `records import` (SQLite rows).
- `plan`/`generate` phases persist via `records generate` + `grader generate` (task output + SQLite topics/relationships/records/grader versions).
- `eval` phase persists via `eval run` or `eval stop` (task output + SQLite eval results/state).
- `train` phase persists via `train run` or `train stop` (task output + SQLite training metrics/state + object-storage weights/checkpoints).

### 2.7 Consistency requirements

- CLI lifecycle semantics match API lifecycle semantics.
- Layer B `run` / `stop` / `jobs status` flows map to workflow-scoped API routes:
  - `POST  /v1/finetune/workflows/{workflowId}/jobs`
  - `GET   /v1/finetune/workflows/{workflowId}/jobs/{jobId}/status`
  - `POST  /v1/finetune/workflows/{workflowId}/jobs/{jobId}/cancel`
- Status retrieval is polling-only (no push-stream transport) in this iteration.
- Layer A ↔ Layer B composition (§2.6 table) is deterministic and covered by contract tests.
- CLI status output is sourced from persisted DB records — never transient in-memory state.

### 2.8 Lifecycle commands (CLI only, not layered)

Machine / install ops — one surface (terminal only).

| Group | Verbs |
|---|---|
| Lifecycle | `vllora init`, `vllora doctor`, `vllora uninstall`, `vllora upgrade`, `vllora version`, `vllora config get/set` |
| Gateway | `vllora gateway start/stop/status/logs/reset` |
| UI | `vllora ui start/stop/open` (optional pip extra) |

### 2.9 CLI shortcut

`vft <verb>` is an alias for `vllora finetune <verb>`. Same Python code, different entrypoint in `pyproject.toml`. Canonical form in docs; short form for daily terminal use. Works for Layer A and Layer B equivalently (`vft knowledge add`, `vft plan`, …).

### 2.10 Authentication

#### Complete auth surface

| Requirement | Why | How to configure |
|---|---|---|
| **Claude** (required for every LLM-backed verb) | All LLM work — record generation, trace analysis, topic derivation, grader drafting, training monitoring — runs through `claude -p` worker subprocesses. | `claude login` (subscription — recommended, no extra cost) **OR** `export ANTHROPIC_API_KEY=sk-ant-...` (CI / scripted) |
| **Remote source URIs** (optional — only if using `hf://` / `s3://` / `gs://` / `azblob://` URIs) | `sources` and `import-records` download from external storage | Provider env vars: `HF_TOKEN`, `AWS_ACCESS_KEY_ID`+`AWS_SECRET_ACCESS_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `AZURE_STORAGE_CONNECTION_STRING`. See §4.6. |

#### What you do NOT need to configure

- **No OpenAI API key.** Record generation uses Claude, not GPT. See §6.5.4 direct-generation mode.
- **No Google / Mistral / Cohere / any other LLM provider.** All pipeline LLM work is Claude-only.
- **No gateway-level provider credentials.** The gateway runs local Qwen models for eval + training; no external LLM routing required in the default path.

The one-time setup is just:

```bash
claude login                         # subscription users (recommended — no extra cost)
# OR
export ANTHROPIC_API_KEY=sk-ant-...  # CI / scripted users
```

`claude -p` precedence: `ANTHROPIC_API_KEY` > `apiKeyHelper` > `CLAUDE_CODE_OAUTH_TOKEN` > `claude login` subscription.

`vllora doctor` reports what's configured and flags missing pieces.

#### 2.10.1 ToS compliance — the `claude -p` subprocess pattern

**The `claude -p` subprocess pattern is Anthropic's documented use for CI/scripts** (ref: [CLAUDE_CODE_OAUTH_TOKEN docs](https://code.claude.com/docs/en/authentication)). vllora spawning the `claude` binary from Python is the same shape as a Makefile, GitHub Action, or shell script invoking it — the pattern `setup-token` was explicitly designed for.

**What the Jan–Feb 2026 Anthropic ban wave actually targeted:** third-party harnesses that **extract OAuth tokens and call the Messages API directly**, bypassing the Claude Code binary entirely. Examples: OpenClaw, OpenCode, Cline, raw Agent SDK wrappers reading `~/.claude/.credentials.json`. The distinguishing feature was *Claude binary bypassed → token arbitrage*.

vllora's pattern is distinct:

```
 ✓ ALLOWED (our pattern)                 ✗ BANNED (what got harnesses cut off)
 ──────────────────────                   ────────────────────────────────────

 vllora (Python)                          third-party harness
    │  subprocess.run(                       │  reads ~/.claude/.credentials.json
    │    ["claude", "-p", ...])              │  calls anthropic.messages.create(…)
    ▼                                        ▼
 claude binary                            api.anthropic.com (directly)
    │  (Claude Code is the client             (Claude binary bypassed)
    │   Anthropic sees)
    ▼
 api.anthropic.com
```

**Red lines vllora will not cross** (codified as §9 invariants):

- Never read `~/.claude/.credentials.json` or OS keychain for tokens.
- Never use subscription credentials with `@anthropic-ai/sdk` or raw Messages API calls.
- Never run as a multi-user hosted service dispatching workers on behalf of other users.

#### 2.10.2 Rate-limit reality

Anthropic enforces weekly Sonnet/Opus caps on Claude Pro ($20) and Max ($100/$200) since July 2025. A typical vllora run spawns ~20–30 `claude -p` workers, each with max-turns 10–50. Heavy users running multiple full pipelines per week can hit Pro's weekly ceiling.

- **Throttling ≠ banning.** Hitting the cap causes temporary rate-limit responses, not account action.
- **Cumulative token tracking** (future, §11 Q9) — `/finetune-status` to surface weekly usage estimate so users can pace pipelines.
- **Pro vs Max advice** — heavy users should consider Max or fall back to `ANTHROPIC_API_KEY` (metered API billing) for unrestricted throughput.
- **CI-friendly path** — `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) gives one-year headless credentials designed for exactly this pattern.

> **Doc consistency:** §3–§12 describe Layer A verbs (`sources`, `plan`, `generate`, `eval`, `train`, …) as the user-facing surface. Where they say "CLI runs X," read it as "Layer A verb runs, which internally invokes Layer B operations per §2.6." Plugin slash commands always map to Layer A verbs.

### 2.11 Execution kinds

Every command is classified by how it executes. This affects testing strategy, cost expectations, reproducibility, and offline capability.

| Kind | Definition | Deterministic? | LLM tokens? | Gateway compute? | Offline? |
|---|---|---|---|---|---|
| `PURE` | Read-only; no file/DB writes, no network writes. Safe to call any time. | yes | no | no | yes (reads local files only) |
| `DET` | Deterministic: writes state, runs scripts, may call gateway HTTP. Same inputs → same outputs. No LLM. | yes | no | lightweight (CRUD only) | partial (needs gateway) |
| `DET+COMPUTE` | Deterministic CLI orchestration, but submits heavy ML compute to the gateway (model inference for eval, GRPO training). CLI view is just POST + poll; wall-clock time + resource cost are high. | yes (from CLI) | no (CLI-side) | **heavy** (ML workload) | no |
| `LLM` | Invokes `claude -p` worker(s). Non-deterministic (model sampling), consumes Claude tokens, requires `claude login` / `ANTHROPIC_API_KEY`. | no | **yes** | no | no |
| `MIXED` | Combines DET scripts with LLM workers in a single verb. | partial | **yes** | maybe | no |
| `WIZARD` | Interactive wizard that prompts the user; typically chains into `LLM` or `DET` verbs. | no (user-driven) | depends on chained verbs | — | — |

**Implications:**

- **Testing** — `DET` and `PURE` commands get full unit tests with expected outputs. `LLM` commands get integration tests against fixture-recorded `claude -p` transcripts. `DET+COMPUTE` uses mocked gateway responses.
- **Caching** — `PURE` outputs can be memoized aggressively. `DET` outputs cached by input hash. `LLM` outputs never cached (runs may produce different valid answers).
- **Cost/quotas** — Only `LLM` and `MIXED` consume Claude tokens. Only `DET+COMPUTE` consumes gateway GPU time. `status`, `stop`, all lifecycle ops are free.
- **Reproducibility** — `DET` re-runs are identical. `LLM` re-runs may differ; `--seed` flags and prompt-temperature controls may be added later.
- **Offline** — `PURE` works offline against local files. Everything else needs gateway (and `LLM` also needs Claude auth).
- **Observability** — `LLM` and `MIXED` should emit per-worker token counts in stream-JSON; `/finetune-status` may surface cumulative tokens per workflow (open question, §10).

**Quick reference — commands by kind:**

| Kind | Commands |
|---|---|
| `PURE` | Layer A: `status`. Layer B: `jobs status`. Lifecycle: `version`, `doctor` (mostly). |
| `DET` | Layer A: `init`, `import-records`. Layer B: `records import`, `grader import`, `grader dryrun`, `eval stop`, `train stop`. Lifecycle: all. Utilities: `cancel-*`, `log-step`, `update-analysis`, `validate`, `reconcile-topics`, `grader-sanity-check`, `diagnose-clipping`, `dry-run-grader`, `topics *`, `export`. |
| `DET+COMPUTE` | Layer A: `eval` (base path), parts of `train`. Layer B: `eval run`, `train run`. Utilities: `probe-difficulty`. |
| `LLM` | Layer A: `sources`, `plan`. Layer B: `knowledge add`, `records generate`, `grader generate`. Long-running LLM worker within `train`: `training_monitor`. |
| `MIXED` | Layer A: `generate` (LLM workers + deterministic scripts + gate), `train` (deterministic orchestration + `training_monitor` LLM worker), `eval` when grader refinement triggers. |
| `WIZARD` | Layer A: `quickstart`. |

### 2.12 User journey — how someone uses the plugin

Chat-centric view. Users pick between **orchestrator mode** (thick agent drives everything) or **thin-verb mode** (type each phase explicitly). Both use the same CLI underneath.

#### 2.12.1a Happy-path chat — orchestrator mode (recommended default)

```
 [ TERMINAL — one-time setup ]
 
  $ pip install vllora
  $ claude login                         # Claude Pro/Team subscriber
  $ vllora init
    ✓ Claude Code detected, plugin installed
    ✓ Gateway started on :9090
    ✓ Done. Open Claude Code and type /finetune to start.
 
 
 [ CLAUDE CODE CHAT — one session, orchestrator drives the whole pipeline ]
 
  USER   ▸  /finetune
  AGENT  ▸  "Let's fine-tune a model. What do you have and what's the goal?"
 
  USER   ▸  "PDFs of our refund policy. Want a support agent that
             answers questions about refunds and order changes."
  AGENT  ▸  [calls `vllora finetune init "..."`] "Workflow wf-abc12 created."
            [calls `vllora finetune sources ./pdfs`] "Extracted 12 PDFs."
            [calls `vllora finetune plan`]
            "I drafted 8 topics. Two of them — 'partial-refund' and
             'refund-exceptions' — have significant overlap (~70% shared
             knowledge). Want me to merge them?"
 
  USER   ▸  "yes, merge"
  AGENT  ▸  [edits topics.json, re-runs plan]
            [calls `vllora finetune generate`]
            "Quality gate PASS (240 records). Grader draft tests cleanly."
            [calls `vllora finetune eval`]
            "Readiness PASS on iter 1. Selected: qwen-4b. Training now?"
 
  USER   ▸  "go"
  AGENT  ▸  [calls `vllora finetune train`, monitors 2 hrs]
            [pings user when done]
            "Training complete. Adapter: adapter-xyz. Converged cleanly.
             Final grader reward: 0.83 avg. Full report in training/monitor-report-1.md."
 
  USER   ▸  🎉
```

Notice: **one conversation, one `/finetune` command**, orchestrator handles everything. User engaged only at decision points (topic merge, go-ahead for training). Compare this with §2.12.1b (thin-verb mode) which requires 5–7 explicit slash commands.

#### 2.12.1b Happy-path chat — thin-verb mode (explicit control)

```
 [ CLAUDE CODE CHAT — user drives each phase ]
 
  USER   ▸  /finetune-quickstart
  AGENT  ▸  "6 steps: init → sources → plan → generate → eval → train.
             What do you have?
               [a] PDFs only
               [b] OTel traces only
               [c] Both
               [d] Nothing — try the tau-retail demo"
 
  USER   ▸  "a — PDFs. I want to fine-tune a customer support agent
             for refund + order questions."
  AGENT  ▸  [auto-runs /finetune-init] "Workflow wf-abc12 created."
            [auto-runs /finetune-sources ./pdfs] "Extracted 12 PDFs.
             Next: /finetune-plan"
 
  USER   ▸  /finetune-plan
  AGENT  ▸  [spawns workers; streams progress]
            "Drafted 8 topics: order-cancel, refund-policy, exchange-
             rules, … Wrote plan.md. Review it.
             Next: /finetune-generate (or edit topics.json first)."
 
  USER   ▸  [opens plan.md, reviews, happy]  /finetune-generate
  AGENT  ▸  [spawns record_generator × 8 + grader_drafter(finalize)]
            "Generated 240 records. Quality gate PASS.
             Next: /finetune-eval"
 
  USER   ▸  /finetune-eval
  AGENT  ▸  [runs gateway eval on 4B + 0.8B]
            "Readiness PASS (iter 1/5). Selected: qwen-4b.
             Next: /finetune-train"
 
  USER   ▸  /finetune-train
  AGENT  ▸  [submits GRPO + monitors 2 hrs]
            "Training complete. Adapter: adapter-xyz. Converged: yes."
 
  USER   ▸  🎉
```

Same pipeline outcome; user drives each phase explicitly. Preferred when user wants control over *when* each phase runs (e.g., kicking off training before walking away from the laptop).

#### 2.12.2 Decision points & iteration loops

```
                  /finetune-quickstart
                         │
                         ▼
                 pick inputs + objective
                         │
                         ▼
               /finetune-init  (auto-chained)
                         │
                         ▼
             /finetune-sources  (auto-chained)
                         │
                         ▼
                /finetune-plan  ◀─────────┐
                         │                │ user edits topics.json,
                         ▼                │ re-runs /plan
                  review plan.md          │
                         │                │
                ┌────────┴────────┐       │
                ▼                  ▼      │
           plan OK              edit     │
                │                   │    │
                │                   └────┘
                ▼
          /finetune-generate  ◀────────────┐
                │                          │ fix topics, re-run
                ▼                          │
         quality gate?                     │
                │                          │
        ┌───────┴────────┐                 │
        ▼                ▼                 │
      PASS             FAIL ───────────────┘
        │
        ▼
          /finetune-eval  ◀──────────────────────┐
                │                                │ re-run
                ▼                                │ (up to 5×)
        readiness gate?                          │
                │                                │
   ┌────────┬───┴────┬──────────┬────────────┐  │
   ▼        ▼        ▼          ▼            ▼  │
  PASS   grader    data-fix   topic-fix   FAIL  │
   │    auto-fix   needed     needed      × 5   │
   │        │        │          │          │    │
   │        └────────┼──────────┼──────────┼────┘
   │                 │          │          │
   │                 ▼          ▼          ▼
   │            re-run       re-run     ABORT
   │           /plan +      /plan only  (report
   │           /generate                 blockers)
   │
   ▼
          /finetune-train  ◀──────────────────┐
                │                              │ re-run
                ▼                              │ (up to 3 rounds
         converged?                            │  — first run /eval
                │                              │  to adjust grader
        ┌───────┴────────┐                     │  / data)
        ▼                ▼                     │
    converged        not converged ────────────┘
        │
        ▼
   🎉 adapter ready
```

#### 2.12.3 Alternative entry: pre-built records

```
  USER   ▸  "I already have a training record set on HuggingFace."
  AGENT  ▸  [runs /finetune-init]
            [runs /finetune-import-records hf://org/my-dataset]
                        │
                        ▼
             (skips sources + plan + generate — records already exist)
                        │
                        ▼
            /finetune-eval  →  /finetune-train   (same as happy path)
```

#### 2.12.4 What happens across sessions

All commands are idempotent and state-driven. The user isn't locked into one session:

- **Tomorrow, in a new chat:**
  `USER ▸ /finetune-status`
  `AGENT ▸ "Workflow wf-abc12 — current step: eval (iter 2/5, last_fix=grader-refine). Next: /finetune-eval"`

- **Training is long (2–3 hr):** user closes Claude Code, training continues on gateway. Comes back, runs `/finetune-status` → agent reports job state from DB.

- **User deletes `finetune-project/`:** workflow record still in gateway DB. Can rebuild local files via `vllora finetune sync --from-db wf-abc12` (future utility).

- **User loses the Claude Code session:** journal is local; re-opening any terminal and running `vllora finetune status` picks up exactly where they left off.

#### 2.12.5 Terminal-only variant (no chat needed)

Power users and CI skip the plugin entirely — same verbs, terminal surface:

```bash
# One-shot interactive:
vllora finetune quickstart \
  --objective "customer support agent" \
  --sources ./pdfs \
  --non-interactive

# Manual chain (e.g., in a Makefile):
vft init "..."
vft sources ./pdfs
vft plan
vft generate
vft eval
vft train

# Autonomous loop (CI):
vft auto --scenario tau-retail --max-iterations 5
```

#### 2.12.6 Error & recovery paths

| What went wrong | What the agent does | What the user does |
|---|---|---|
| Quality gate FAIL (generate) | Agent reports reason, suggests plan fix | Edit `topics.json` or objective; re-run `/finetune-plan` then `/finetune-generate` |
| Readiness FAIL — grader issue (eval) | Agent auto-refines grader, writes diff | Re-run `/finetune-eval` to verify fix |
| Readiness FAIL — data issue (eval) | Agent writes fix suggestion to `analysis.json` | Follow suggestion (rebalance topics); re-run `/finetune-plan` + `/finetune-generate` |
| Readiness FAIL × 5 iterations | Agent aborts with blocker report | Manual intervention: edit grader, objective, or sources |
| Training not converged | Agent reports root cause (collapse / clipping / plateau) | Re-run `/finetune-eval` to adjust, then `/finetune-train` |
| Training round × 3 without convergence | Agent aborts | Reconsider scope: objective, base model, or source materials |
| User closes chat mid-command | Command continues in background (for long LLM work) or pauses at next checkpoint | Re-open; `/finetune-status` shows state |
| Gateway offline | Agent reports connection error | `vllora gateway start` (terminal); re-run command |
| Claude auth expired | Agent reports 401 from `claude -p` | `claude login` (terminal); re-run command |

### 2.13 How our UX compares to peer platforms

Context for the design choices above. vllora's journey is unusual in two specific ways: **Claude Code plugin as primary surface**, and **LLM-driven pipeline orchestration**.

#### 2.13.1 At-a-glance comparison

| Platform | Install / surface | Grader authoring | Data auto-gen | LLM drives pipeline | Observability | Target user |
|---|---|---|---|---|---|---|
| **vllora (us)** | **Claude Code plugin + CLI** | **Auto (LLM from traces / PDFs)** | **Yes (LLM workers)** | **Yes** | Journal + UI | App dev / PM |
| OpenPipe (RFT) | SDK + Web UI | Manual (Python) | Partial (Mixture of Agents) | No | Dashboard (best-in-class rollout inspector) | App dev |
| OpenAI Fine-tuning (RFT) | API + Dashboard | Manual (Python / LLM-judge) | No | No | Dashboard + W&B | App dev |
| HuggingFace AutoTrain | Spaces UI + CLI | None (SFT / DPO) | No | No | HF Spaces UI | ML engineer / hobbyist |
| Axolotl | YAML CLI | Manual Python reward fn | No | No | W&B / logs | ML engineer |
| LlamaFactory | CLI + Gradio UI | Manual Python reward fn | No | No | Gradio + W&B | ML engineer |
| Together AI | API + CLI | Manual (GRPO in preview) | No | No | Dashboard | App dev |
| Modal | Python code + serverless GPU | User-defined | User-defined | No | Modal dashboard | Platform engineer |
| DSPy / TextGrad | Python library | Metric fn | Yes (bootstrap) | **Yes (optimizes prompts only)** | Console | Researcher |
| Unsloth | Colab notebook | Manual Python reward fn | No | No | Notebook + W&B | Hobbyist |

#### 2.13.2 Representative first-run commands

```
OpenAI:        openai.fine_tuning.jobs.create(training_file="file-xyz", model="...")
OpenPipe:      SDK proxy records → UI workflow → YAML RFT config
AutoTrain:     autotrain --config config.yml  (or web UI)
Axolotl:       axolotl train config.yml
LlamaFactory:  llamafactory-cli train --config_file train.yaml
Together:      together fine-tuning create --training-file file-xxx --model ...
Modal:         modal run finetune.py                    (user writes everything)
DSPy:          teleprompter.compile(module, trainset=...)
Unsloth:       open Colab notebook → click "Run All"

vllora:        /finetune-quickstart                     (in Claude Code chat)
         or:   vllora finetune quickstart
```

Everyone else: **code / config → train → result.** We: **chat → agent drives it.**

#### 2.13.3 What we do that nobody else does

1. **Claude Code plugin as primary surface.** No competitor ships slash-command UX. Closest analog is DSPy (a Python library). Pro: agentic UX for non-ML users. Con: hard dependency on Anthropic's product + niche install base.
2. **LLM-driven pipeline orchestration via `claude -p` workers.** DSPy/TextGrad use LLMs to optimize prompts; we use LLMs to **author the grader, derive topics, reconcile ground truth, diagnose clipping** — broader agentic scope.
3. **PDFs + OTel traces as first-class inputs.** OpenPipe records traces via its proprietary SDK proxy; nobody ingests open OTel. Nobody ingests PDFs for grader synthesis.
4. **Grader auto-generated from source materials.** Every other GRPO platform requires the user to write the reward in Python. This is our single biggest differentiator for non-ML users.

#### 2.13.4 Where competitors are ahead

1. **Hosted deployment endpoint.** OpenPipe / OpenAI / Together give an OpenAI-compatible API endpoint at the end. We return weights + an adapter ID; user self-serves.
2. **Live dashboard quality.** OpenPipe's reward curves + rollout inspector is best-in-class. Our UI is catching up (Training Impact, pagination) but behind on live training telemetry.
3. **Low-friction first experience.** Unsloth's "open Colab → click Run All" is hard to beat. Requiring Claude Code + gateway + plugin + distri is heavier lift.
4. **Ecosystem integrations.** W&B / MLflow / TensorBoard are table stakes for ML engineers. Our JSONL journal doesn't plug into their existing tools.

#### 2.13.5 Where we're on par

- **GRPO method sophistication** — adaptive epochs, clipping diagnosis, TP-tiered floor, topic/GT reconciliation are competitive with OpenPipe RFT and ahead of Axolotl / LlamaFactory / Unsloth defaults.
- **OSS CLI surface** — `vllora finetune` is comparable to `axolotl train` or `llamafactory-cli`.
- **Base model coverage** — Qwen 3.5 0.8B / 2B / 4B matches what Unsloth / Axolotl users pick for local GRPO.

#### 2.13.6 Design implications

- **Keep "Claude Code first."** It's our moat. But preserve a real terminal-only path (`vft` + `auto`) so skeptics can try before adopting the plugin — §2.12.5 covers this.
- **Don't skimp on the live dashboard.** If we win non-ML users with agentic UX, we also need OpenPipe-quality rollout inspection — otherwise they hit a wall when troubleshooting.
- **Hosted inference is a gap worth closing.** Even a basic "load adapter into gateway, serve at `/v1/chat/completions`" closes the deploy-story gap with OpenPipe / OpenAI / Together.
- **Ecosystem integration is optional but valuable.** Emit W&B events as an extra signal for ML engineers evaluating us.
- **Quickstart fixtures matter.** Ship the tau-retail demo + target 5-minute happy-path equivalent to "click Run All."

> **Methodology note.** Platform descriptions are based on docs and public flows as of early 2026. GRPO/RFT coverage on OpenPipe, OpenAI, and Together has been evolving rapidly — verify current feature sets before external claims.

### 2.14 Multi-harness plugin strategy

Claude Code is the primary surface for v0. The architecture is **host-agnostic at the CLI + thin-verb layer** — additional hosts ship as separate per-host plugins that wrap the same CLI.

**What ports across hosts:** CLI (`vllora finetune <verb>`) + thin verb commands (one per phase).
**What does NOT port:** the orchestrator command (`/finetune`). It's a Claude-Code-specific agent pattern; each host can build its own equivalent or users fall back to thin verbs on non-Claude-Code hosts. The pipeline stays accessible on every host — only the orchestration shape differs.

**Invariant:** The CLI is the integration point. Plugins are per-host, thin wrappers that shell out. Zero pipeline logic lives in any plugin.

**User journey through OpenClaw** (illustrative — captures how the same verbs reach a mobile chat surface):

```
  USER (WhatsApp / Telegram / Slack / iMessage)
      │
      │  "fine-tune a support agent from these PDFs"  + attach 3 PDFs
      ▼
  OPENCLAW
      │  saves PDFs to local dir, dispatches to @vllora/openclaw-plugin
      ▼
  @vllora/openclaw-plugin
      │  spawn  vllora finetune quickstart --sources <dir> --non-interactive
      ▼
  vllora CLI                        (same path as Claude Code plugin)
      │  init → sources → plan → generate → eval → train
      │  each LLM step spawns workers (claude -p)
      │  all artifacts uploaded → GATEWAY + DB
      ▼
  stdout stream  ──▶  OPENCLAW  ──▶  USER's chat (formatted per surface)

   ⋮
   "Extracting 3 PDFs… done."
   "Draft: 8 topics. View plan.md: <link>."
   "Generated 240 records. Quality gate PASS."
   "Eval iter 1/5: readiness PASS. Selected: qwen-4b."
   "Training started. I'll ping when done (~2 hrs)."
        …  [user closes chat]  …
   "Training complete! Adapter: adapter-xyz."
```

**Key point:** the `vllora finetune *` invocation is identical regardless of host. OpenClaw adds one relay actor at the front (user's chat → plugin) and one at the back (async ping when long work completes). The pipeline, gateway writes, journal, and auth all stay unchanged.

**Full integration spec:** see [openclaw-integration.md](./openclaw-integration.md) — plugin shape + TypeScript example, full end-to-end pipeline diagram, value-add analysis, shipping criteria, and generalization to other hosts (OpenCode, Cline, Aider, …).

---

## 3. End-to-End Flow

### 3.1 Actors

Six roles participate in the flow. Understanding who does what makes the diagrams readable.

| Actor | Role | Lives in |
|---|---|---|
| **USER** | Types commands in chat or terminal. Reviews `plan.md`, decides when to proceed. | — |
| **ORCHESTRATOR** | (Optional, plugin-only) Thick Claude Code agent driven by `/finetune`. Holds pipeline context across phases, dialogues with user, calls CLI via Bash. Only present when user chose orchestrator mode (§2.3.1). | `~/.claude/plugins/vllora-finetune/commands/finetune.md` |
| **PLUGIN (thin)** | Thin narrators per phase. Each `/finetune-<verb>` reads a `.md` file, shells out to one CLI verb, pipes stdout back. | `~/.claude/plugins/vllora-finetune/commands/finetune-<verb>.md` |
| **CLI** | Rust binary (`vllora`). Coordinates workers + scripts + gateway. Writes local files, uploads to DB. | `vllora/gateway/src/cli/commands/finetune/` (verb handlers) |
| **WORKERS** | `claude -p` subprocesses for LLM-heavy work. Inherit user's auth. | Spawned by CLI; workers in `vllora/gateway/src/cli/commands/finetune/workers/`; prompts in `vllora/finetune/src/prompts/` |
| **GATEWAY+DB** | Rust HTTP server @ `:9090` + SQLite at `~/.vllora/vllora.db`. Runs model inference for eval + GRPO training. | `~/.vllora/bin/vllora-gateway` |
| **UI** | React app @ `:5173`. Read-only view. Polls gateway for updates. | `vllora ui start` |

> **Orchestrator vs Plugin (thin):** both live in the plugin directory. Orchestrator is one command (`/finetune`); thin plugins are the 9 verb commands. The orchestrator *calls* the thin commands (or the CLI directly) as its tools — they compose, not compete.

### 3.2 Two entry paths (high-level)

Three entry commands, two pipeline paths.

```
                (User has PDFs / traces / task / pre-built records)
                                        │
                           ┌────────────┼────────────┐
                           ▼            ▼            ▼
                       /finetune    /finetune-  vllora finetune
                       (orches-       init       init <obj>
                        trator;      (thin)      (CLI direct)
                        asks user,
                        picks path)
                           │            │            │
                           └────────────┼────────────┘
                                        ▼
                              ┌─────────────────────┐
                              │ workflow created    │
                              └──────────┬──────────┘
                                         │
                       ┌─────────────────┴──────────────────┐
                       ▼                                    ▼
                  RAW MATERIALS PATH              PRE-BUILT DATASET PATH
                       │                                    │
                       ▼                                    ▼
              ┌────────────────┐                  ┌────────────────────┐
              │ /finetune-     │                  │ /finetune-         │
              │   sources      │                  │   import-records   │
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

  When the user started in orchestrator mode (/finetune), each phase above
  is still a CLI invocation — just driven by the orchestrator-agent rather
  than a typed slash command. The pipeline shape is identical.
```

### 3.3 Per-phase actor flow

Each phase below is a step-by-step trace. **Every line starts with the acting actor in brackets** so there's zero ambiguity about who does what.

The flows below show **thin-verb mode** (user types each slash command). In orchestrator mode (`/finetune`), the `[USER]` and `[PLUGIN]` lines at the top of each phase are replaced by `[ORCHESTRATOR]` issuing the same `vllora finetune <verb>` call autonomously — but everything from `[CLI]` downward is identical. See §3.3.0 for the orchestrator variant.

Conventions:
- `[USER] …` the user performs this action.
- `[ORCHESTRATOR] …` the `/finetune` agent, only in orchestrator mode.
- `[PLUGIN] …` a thin verb command (`finetune-<verb>.md`) in the Claude Code plugin.
- `[CLI] …` the `vllora` Python CLI.
- `[WORKER:<name>] …` a `claude -p` subprocess spawned by the CLI.
- `[GATEWAY] …` the Rust gateway + SQLite DB.
- `[UI] …` the React frontend.
- `→` indicates a cross-actor message/call.

---

#### PHASE 3.3.0 — Orchestrator variant (applies to all phases)

In orchestrator mode, the `[USER]`/`[PLUGIN]` prefix for each phase below becomes:

```
 (1) [USER]          types /finetune in Claude Code (once, at session start)
 (2) [ORCHESTRATOR]  loads commands/finetune.md, reads journal + analysis,
                     decides to run the next phase, OR asks user for input
 (3) [ORCHESTRATOR]  invokes: Bash("vllora finetune <verb>")
                        ─── equivalent to [PLUGIN] shells out to [CLI] below ───
 (4) [CLI]           (unchanged — executes the phase; see phase trace below)
 (5) [ORCHESTRATOR]  receives CLI output, reads resulting artifacts (plan.md,
                     analysis.json updates), incorporates into running narrative
 (6) [ORCHESTRATOR]  decides: run next phase, or pause to dialogue with user
 (7) [USER]          (optional) dialogues with orchestrator about topics,
                     grader decisions, fix suggestions — no new slash commands
                     needed; conversation continues
```

Steps (1)–(3) and (5)–(7) are the orchestrator's loop. Step (4) — the actual CLI execution — is **identical** to thin-verb mode. That's the load-bearing property of the hybrid: one pipeline, two orchestration shapes.

---

#### PHASE 0 — Install (one-time, before pipeline)

Artifacts: local machine/runtime setup only (`~/.vllora/bin/`, gateway process state, plugin symlink). No Layer B job artifact.

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

Artifacts: workflow metadata in SQLite (`workflows`) + local scaffold files (`config.json`, `pipeline-journal.json`, `analysis.json`, `execution-log.md`).

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

Artifacts: command maps to Layer B `knowledge add` semantics: document payloads in object storage and document/knowledge references in SQLite; plus local extraction outputs.

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

#### PHASE 2' — Import-records (alternative to phases 2–4)

Artifacts: command maps to Layer B `records import`: records rows in SQLite; plus local `training.jsonl` snapshot.

Workflow:

```
   [USER]  /finetune-import-records hf://org/my-dataset
      │
      ▼
   [PLUGIN]  shells out  ───▶  [CLI]  vllora finetune import-records ...
                                  │
                                  ├─  URI adapter resolves  →  local .jsonl / .parquet
                                  │
                                  ├─  auto-detect schema (openai-chat | custom)
                                  │
                                  ├─  validate_records.py       (deterministic)
                                  │
                                  ├─  write training.jsonl (with per-record origin_uri)
                                  │
                                  ├─  POST /records  ──▶  [GATEWAY]
                                  │                         INSERT records
                                  │                         (origin_uri, origin_source_id)
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
 (1) [USER]     types:                 /finetune-import-records hf://org/my-dataset
 (2) [PLUGIN]   shells out            → [CLI] vllora finetune import-records hf://...
 (3) [CLI]      URI adapter resolves   → local .jsonl / .parquet
 (4) [CLI]      auto-detects schema (openai-chat | custom)
 (5) [CLI]      runs validate_records.py (deterministic)
 (6) [CLI]      writes training.jsonl (with per-record origin_uri)
 (7) [CLI]      POSTs records          → [GATEWAY]  INSERT records (origin_uri, origin_source_id)
 (8) [CLI]      journal: plan=skipped, generate=done (imported)
 (9) [CLI]      prints "Imported N records. Next: /finetune-eval"          → [PLUGIN] → [USER]
                                                                 → jumps to PHASE 5
```

---

#### PHASE 3 — Plan

Artifacts: command composes Layer B `records generate` (topics/relationships side) + `grader generate` (init mode): task output plus topics/relationships and grader version persisted in SQLite.

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

Artifacts: command composes Layer B `records generate` + `grader generate` + `grader dryrun`: task output plus records rows/topics/relationships, grader version, and dry-run result persisted in SQLite.

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
                                  ├─  validate_records.py     (deterministic)
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
 (8) [CLI]      runs validate_records.py          (deterministic)
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

Artifacts: command maps to Layer B `eval run` (and `eval stop` when cancelled): task output plus eval result/state persisted in SQLite.

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

Artifacts: command maps to Layer B `train run` (and `train stop` when cancelled): task output plus train metrics/state in SQLite and model weights/checkpoints in object storage.

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
| 2'. import | [USER] (`/finetune-import-records`) | [CLI] | training.jsonl | records |
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
| import-records | — | URI → cache | training.jsonl | `records` |
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
         → import-records → [plan=skipped, generate=done] → eval → train
```

Re-running any command:
- If last step `status: done` → advance (or no-op with message).
- If last step `status: iterating` → continue next iteration.
- If last step `status: failed` → resume from last good sub-step.
- `--force` starts that step over.

### 3.6 Interaction modes

Three modes, same pipeline underneath (see §2.3 for the command surface, §2.1 for execution flow):

- **Orchestrator (chat, guided).** User types `/finetune` once. A Claude Code agent drives all phases, engages in dialogue, carries context across steps. Best for first-time users, exploratory runs, expert deep dives. See §2.3.1 + §14.10.
- **Thin verbs (chat, precise).** User types `/finetune-<verb>` one phase at a time. Each command prints `Next: /finetune-<verb>`. Best for power users who know exactly which step they want. See §2.3.2.
- **Autonomous (CI / scripted).** `vllora finetune auto --scenario X` loops `status → next-command` until done or blocked. No Claude Code session needed. See §2.3.2 CLI + §10.3 CI.

All three share `pipeline-journal.json`, so a user can switch modes between sessions — start in orchestrator on day one, resume with a direct verb command on day two.

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

| Table | init | sources | import-records | plan | generate | eval | train |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `workflows` (row) | ✍ create | ✍ status, trace_meta | ✍ status | ✍ status | ✍ status | ✍ status, selected_model | ✍ status |
| `source_documents` | | ✍ (+origin_uri) | | | | | |
| `otel_traces` | | ✍ (+origin_uri) | | | | | |
| `knowledge_parts` | | ✍ | | | ✍ topic_id | | |
| `topics` | | | | ✍ create | ✍ reconcile | | |
| `relations` | | | | ✍ | | | |
| `records` | | | ✍ (+origin_uri, +origin_source_id) | | ✍ | | |
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

Both `sources` and `import-records` accept local paths **or** URIs from external storage. URI resolution happens in `vllora/finetune/src/sources_adapters/` — one adapter per scheme.

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

**Workers never know about URIs** — they always receive local paths. URI handling is strictly at the `sources` / `import-records` boundary.

#### Provenance in DB

Every uploaded artifact records where it came from:

```sql
ALTER TABLE source_documents ADD COLUMN origin_uri TEXT;
ALTER TABLE otel_traces      ADD COLUMN origin_uri TEXT;
ALTER TABLE records          ADD COLUMN origin_uri TEXT;         -- populated by import-records
ALTER TABLE records          ADD COLUMN origin_source_id TEXT;  -- HF dataset ID or similar
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

### 4.7 Precision requirements for state files

In the monolithic SKILL.md architecture, Claude's conversation buffer was the memory; state files were optional status markers. In the new architecture, **the files ARE the memory.** Short-lived workers, the orchestrator, and cross-session users all depend on these files being exact. Sloppiness causes silent corruption, races, and lost reasoning.

Two layers of precision:
- **Semantic precision** — rich reasoning in artifacts (§9 invariant; §14.9). Covers *what* gets written.
- **Operational precision** — atomic, ordered, validated, recoverable writes. Covers *how* writes happen. This subsection.

#### 4.7.1 Per-file operational requirements

| File | Requirement | Failure if violated |
|---|---|---|
| `pipeline-journal.json` | **Atomic writes** (write to `.tmp`, fsync, rename) — never partial | Re-run after crash reads half-written state; wrong step counts |
| `pipeline-journal.json` | **Single-writer discipline** — only the CLI writes; never two CLI processes concurrently | Race condition; corrupt journal; orchestrator + thin verb both writing = chaos |
| `pipeline-journal.json` | **Schema validation** on every write | Malformed journal silently breaks `/finetune-status` and re-run logic |
| `pipeline-journal.json` | **Monotonic timestamps** — `updated_at` always ≥ prior value | UI sees out-of-order events; orchestrator confused about phase ordering |
| `pipeline-journal.json` | **Explicit state transitions** — `pending → running → done`/`failed`; no jumps | Re-run can't decide whether to skip completed or resume in-flight |
| `pipeline-journal.json` | **`iterations` array append-only** | Iteration history lost; can't audit which refine-mode attempts were tried |
| `pipeline-journal.json` | **Crash-recovery status** — `running` written at phase start, `done`/`failed` at end. Re-run finding `running` with no live PID = known-crashed | Zombie state; re-run can't tell if phase is mid-flight or dead |
| `analysis.json` | **Append-only per-phase section** — never overwrite prior phase entries | Prior reasoning lost; orchestrator + workers can't reference earlier decisions |
| `analysis.json` | **Preserve rationale on update** — new reasoning augments old, never replaces | Workers re-derive decisions inconsistently across phases |
| `analysis.json` | **Schema versioning** (`schema_version` field) | Old projects can't be migrated forward |
| `analysis.json` | **Atomic writes + single writer** (same rules as journal) | Concurrent worker writes corrupt UI mirror |
| `change-log.md` | **Append-only** — entries never edited or removed | Grader-evolution audit trail broken |
| `change-log.md` | **Timestamp + author (worker name) + rationale + diff summary per entry** | "Who changed this and why?" becomes unanswerable |
| `iterations.md` | **Append-only per iteration** | Eval/train loop history lost |
| `execution-log.md` | **Append-only decision cards** — observation / analysis / decision / evidence | Cross-session debugging becomes guesswork |
| All state files | **UTF-8, LF line endings, trailing newline** — no BOM, no CRLF | Cross-platform diff noise; git churn |

#### 4.7.2 Single-writer discipline

Only the CLI writes state files. **Not the plugin. Not the orchestrator. Not workers directly.**

- Orchestrator calls `vllora finetune <verb>` via Bash; CLI writes journal.
- Workers produce output (JSON on stdout or files in a staging dir); CLI reads it and writes the authoritative journal/analysis update.
- Even `vllora finetune log-step` and `vllora finetune update-analysis` utilities funnel through the same state module.

Rationale: with orchestrator + thin verbs + direct CLI all potentially active, we'd hit races without this rule. One writer is the only safe bar.

#### 4.7.3 Atomic-write pattern

All state-file writes go through `vllora.cli.state.atomic_write`:

```python
def atomic_write(path: Path, content: str | bytes):
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "wb") as f:
        f.write(content if isinstance(content, bytes) else content.encode("utf-8"))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)   # atomic on POSIX; rename on Windows (best-effort)
```

No raw `json.dump()` to state files. No direct `open(path, "w")`. Every write must either go through `atomic_write` or be append-only with OS-level append semantics (opening in `"a"` mode).

#### 4.7.4 Crash-recovery semantics

CLI writes phase state explicitly:

```
1. phase start:   journal.steps[<phase>].status = "running" + pid = os.getpid()
2. phase success: journal.steps[<phase>].status = "done"
3. phase failure: journal.steps[<phase>].status = "failed" + error = "..."
```

Re-running a command:
- Journal says `done` → no-op, print "already done."
- Journal says `running` + PID alive → refuse to start; print "already running (pid N). Stop it first or wait."
- Journal says `running` + PID dead → **known crash**. Warn user, offer `--force` to restart from last sub-step.
- Journal says `failed` → resume from last sub-step or `--force` to restart.
- Journal says `iterating` → continue next iteration.
- Journal says `pending` or missing → fresh start.

#### 4.7.5 Contract tests (enforceable)

Test harness verifies these properties:

1. **Atomic-write property** — `kill -9` during a state write, re-open file, must be valid JSON + either pre-state or post-state. Never partial.
2. **Single-writer property** — spawn two CLI processes racing the same phase. Exactly one succeeds; the other exits with a clear "already running" error.
3. **Append-only property** — any update to `analysis.json` preserves all prior phase sections byte-for-byte.
4. **Schema validity property** — every written journal satisfies `pipeline-journal.schema.json`.
5. **Crash-recovery property** — crash mid-phase; re-run; pipeline resumes to correct terminal state.

These tests run in CI for every pull request touching the state module.

#### 4.7.6 Implementation discipline

Three patterns codified:

1. **All state-file writes go through `vllora.cli.state`.** Review rejects any PR with raw `json.dump` / `open(..., "w")` on state files.
2. **Lint rule / grep guard** in CI: `open\(.*\.json.*,\s*["']w["']\)` on state-file paths → fails the build.
3. **Documentation on every state-file module** points back to this subsection so future contributors know the rules.

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
| Scripts used | `derive_ground_truth.py`, `reconcile-topics --apply`, `validate_records.py`, `data_quality_gate.py`, `dry_run_grader.py` |
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
 validate_records.py                 (deterministic)
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

### 5.9 `import-records <path-or-uri> [--schema X]`

Alternative entry path to `sources → plan → generate`. Skips record generation for users who already have pre-built training records.

| Aspect | Value |
|---|---|
| Preconditions | `init` done |
| Inputs | Local path or URI to a `.jsonl`/`.parquet`/HF-dataset; optional `--schema` hint |
| Files written | `training.jsonl`, `analysis.json` (generate section with `imported: true`) |
| DB writes | `records` (each with `origin_uri` + `origin_source_id`) |
| Adapters used | Whichever URI scheme present |
| Cache | `~/.vllora/cache/sources/...` (same cache as `sources`) |
| Scripts used | `validate_records.py` (schema check), `data_quality_gate.py` (optional) |
| Journal entry | `{ plan: { status: skipped, reason: imported }, generate: { status: done, imported: true, record_count: N } }` |
| Output (ok) | `Imported N records from <uri>. Next: /finetune-eval` |
| Output (fail) | `Invalid records: <reason>. Supported schemas: openai-chat, ...` |

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
 validate_records.py (schema + required fields)
       │
   ┌───┴────┐
  OK     INVALID
   │        │
   │        └─▶ exit. "Invalid records: <reason>."
   ▼
 optional: data_quality_gate.py (warn, not block)
       │
       ▼
 write training.jsonl (with origin_uri per record)
 upload → DB records (with origin_uri, origin_source_id)
 journal:
   plan     → skipped (reason: imported)
   generate → done (imported: true)
       │
       ▼
 "Imported N records from <uri>. Next: /finetune-eval"
```

> Users with both raw materials AND pre-built records can run `sources → plan → generate` then `import-records --augment` to merge records. (Deferred to a later version — v0 treats the two paths as mutually exclusive.)

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

Workers are Rust modules in `vllora/gateway/src/cli/commands/finetune/workers/*.rs` that wrap `claude -p` subprocess calls. Prompt templates live alongside them in `vllora/finetune/src/prompts/*.md`. This section specifies the contract: how pipeline verbs invoke workers, what the prompt structure is, and what output each worker produces.

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

The shared `claude_client.rs` wrapper emits:

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

All worker system prompts follow this template, stored in `vllora/finetune/src/prompts/<worker>.md`:

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
3. `claude_client.rs` sends SIGTERM to the `claude -p` subprocess.
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

**Direct-generation mode (default).** Training records are produced by the worker's own Claude reasoning, not by a separate teacher-model call routed through the gateway. The worker reads the topic + knowledge + objective, thinks through multiple prompt types within its agent loop (max-turns=10 is enough for 5+ diverse styles), and emits records directly.

**This means the `generate` phase requires ZERO external LLM API keys beyond Claude auth.** No `OPENAI_API_KEY`, no teacher-model config, no gateway-level provider credentials. Just `claude login` or `ANTHROPIC_API_KEY` — the same auth the rest of the pipeline already uses.

**Deferred: `--teacher-model` flag.** For advanced users who want records generated by a different LLM family (e.g., GPT-4o-mini for cost optimization, or a local model via the gateway for fully offline operation), a future `vllora finetune generate --teacher-model <name>` flag routes record generation through the gateway. Not v0.

**Diversity note.** Today's `generate_records.py` makes 5 separate LLM calls per topic for prompt-type diversity (fact-recall / multi-step / evol-instruct / etc.). In the new design, the `record_generator` worker produces all prompt types within a single agent loop — max-turns=10 gives budget for 5–7 distinct styles + validation passes. Same diversity, one subprocess per topic.

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

## 7. Claude Code Plugin Structure

§6 covered the CLI workers. This section covers the **plugin** — what ships inside `~/.claude/plugins/vllora-finetune/`, what each file contains, and what logic the plugin itself owns vs delegates to the CLI.

### 7.1 Directory tree (detailed)

```
~/.claude/plugins/vllora-finetune/         (symlinked from pip package's plugin/ dir)
│
├── plugin.json                            (manifest — §7.2)
├── README.md                              (plugin overview; visible in Claude Code marketplace)
│
├── commands/                              (1 orchestrator + 9 thin verb commands)
│   ├── finetune.md                        (ORCHESTRATOR — thick, stateful — §7.3.1)
│   ├── finetune-quickstart.md             (guided wizard — §7.3.2)
│   ├── finetune-init.md                   (scaffold workflow)
│   ├── finetune-sources.md                (ingest PDFs / traces / URIs)
│   ├── finetune-import-records.md         (pre-built records entry)
│   ├── finetune-plan.md                   (topics + grader draft)
│   ├── finetune-generate.md               (records + finalize grader)
│   ├── finetune-eval.md                   (readiness gate + iterate)
│   ├── finetune-train.md                  (GRPO + monitor)
│   └── finetune-status.md                 (pure read, suggest next)
│
├── skills/                                (auto-loaded reference context)
│   ├── pipeline-context/SKILL.md          (architecture overview — loads on any /finetune-*)
│   ├── grader-writing/SKILL.md            (grader templates + failure patterns)
│   ├── topic-hierarchy/SKILL.md           (topic design guidance)
│   ├── readiness-gate/SKILL.md            (gate-failure interpretation)
│   └── nemo-guide/SKILL.md                (training config reference)
│
└── resources/                             (static files referenced by commands)
    ├── templates/                         (markdown templates for rendered artifacts)
    ├── prompts/                           (canonical prompts included by commands)
    └── examples/                          (reference grader.js files, topic examples)
```

### 7.2 `plugin.json` manifest

```json
{
  "$schema": "https://claude.com/schemas/plugin.json",
  "name": "vllora-finetune",
  "version": "0.6.0",
  "description": "Fine-tune small LLMs from PDFs, OTel traces, or pre-built records using GRPO.",
  "author": { "name": "vllora", "url": "https://vllora.dev" },
  "homepage": "https://vllora.dev",
  "commands": ["commands/*.md"],
  "skills":   ["skills/*/SKILL.md"],
  "requires": {
    "cli":         "vllora >= 0.6.0",
    "claude-code": ">= 1.2.0"
  }
}
```

The manifest tells Claude Code how to load the plugin. **Exact schema TBD** — §11 Q3 tracks verification against Claude Code's actual plugin loader.

### 7.3 Command file structure

Every command is a markdown file with YAML frontmatter + body. The frontmatter defines the trigger surface (Claude Code's matcher); the body is the agent's playbook for executing the command.

#### Template

```markdown
---
description: |
  <one-paragraph description; include trigger phrases so Claude Code matches
   natural-language intent, not just the exact slash command>
allowed-tools: Bash
---

# /finetune-<verb>

<role statement — what this command does in one sentence>

## Preconditions
- <journal state required>
- Validate via `vllora finetune status` before running

## Steps
1. Confirm <inputs> with user if ambiguous
2. Shell out: `vllora finetune <verb> [args]`
3. Stream stdout back to user (includes CLI worker progress events)
4. Interpret final output:
   - On success: echo "Next: /finetune-<next-verb>"
   - On failure: explain fix, suggest next action

## Error handling
- CLI exits non-zero → relay stderr to user, suggest `/finetune-status`
- Missing preconditions → tell user the required prior command

## Related skills
- <list of auto-loaded skills relevant when this command runs>
```

#### 7.3.1 Orchestrator command — `finetune.md`

Unlike thin verb commands, the orchestrator is a **stateful agent command**. Its file contains:

- Frontmatter with `allowed-tools: Bash, Read, Write, Edit, Task`
- A playbook telling Claude Code: *"You are the vllora fine-tune orchestrator. Read pipeline state, plan next actions, call CLI verbs, talk to the user, loop until done."*
- Decision rules: when to run a verb vs ask the user vs diagnose
- Handoff conventions: how to read artifact state to bootstrap mid-pipeline

Template:

```markdown
---
description: |
  Drive the entire vllora fine-tune pipeline from start to finish in one session.
  Holds context across phases, makes decisions, engages the user in dialogue.
  Best for first-time users, exploratory runs, and expert deep dives.
  Triggers: "fine-tune a model", "help me fine-tune", "drive the pipeline",
            "I want to train a model from these PDFs".
allowed-tools: Bash, Read, Write, Edit, Task
---

# /finetune — Pipeline Orchestrator

You are the vllora fine-tune orchestrator. Drive the pipeline end-to-end,
carrying context across phases. Delegate deterministic + LLM-heavy work to
the CLI; handle reasoning + dialogue yourself.

## Startup
1. Run `vllora finetune status` to determine current pipeline state.
2. Read `finetune-project/analysis.json` and `pipeline-journal.json` if they exist.
3. Read the reference skills (pipeline-context, grader-writing, topic-hierarchy,
   readiness-gate) — they're auto-loaded; use them.
4. Greet the user + summarize where we are (fresh project vs mid-pipeline).

## Phase loop
For each phase (init → sources → plan → generate → eval → train):
1. Check preconditions via journal + `vllora finetune status`.
2. Decide: run the phase now, or ask the user first?
3. If running: `vllora finetune <verb>` via Bash; stream output to user.
4. Read the resulting artifacts (plan.md, analysis.json updates, change-log.md).
5. Incorporate reasoning into your running narrative (for future phases).
6. On quality-gate / readiness failures: diagnose from artifacts; propose fix;
   ask user; apply fix; re-run the affected verb.
7. After each phase: suggest next action, optionally pause for user input.

## When to engage the user
- Ambiguous topic boundaries — ask whether to merge/split.
- Grader strategy trade-offs — explain options, let user pick.
- Iteration budget exhausted — explain root cause, ask how to proceed.
- User wants to steer ("try a different base model", "focus on X topic").

## What NOT to do
- Do not duplicate CLI logic. Always `vllora finetune <verb>` for pipeline work.
- Do not hold raw PDFs or full training.jsonl in context — read summaries only.
- Do not silently retry failures. Diagnose first, explain to user, act on user input.
- Do not advance journal manually. CLI owns journal writes.

## Loading reference skills
- `grader-writing` — loaded automatically. Use for grader decisions.
- `pipeline-context` — loaded automatically. Use for architecture questions.
- `topic-hierarchy` — loaded automatically. Use for topic design.
- `readiness-gate` — loaded automatically. Use when eval fails.
- `nemo-guide` — loaded automatically. Use for training config questions.

## Exit conditions
- Pipeline complete (train=done, adapter_id returned) — summarize, congratulate.
- User says stop — record state, suggest `/finetune-status` for resume later.
- Unrecoverable failure — explain, preserve artifacts, suggest escalation path.
```

#### 7.3.2 Example — `finetune-plan.md` (full, thin verb)

```markdown
---
description: |
  Build the topic hierarchy, relations, and an initial grader draft for the current
  fine-tune workflow. Requires /finetune-sources to have completed.
  Triggers: "plan my fine-tune", "build topics", "draft the grader",
  "proceed with plan", "next step after sources".
allowed-tools: Bash
---

# /finetune-plan

Build the workflow's topic hierarchy + grader draft. Requires `sources` completed.

## Preconditions
- `finetune-project/pipeline-journal.json` shows `sources: { status: done }`
- If not, tell user: "Run /finetune-sources first" and exit.

## Steps
1. Run `vllora finetune status` to verify preconditions.
2. Shell out: `vllora finetune plan`
3. Stream stdout. The CLI will emit progress events from `relation_builder` and
   `grader_drafter` workers; pass them through so the user sees real-time updates.
4. On completion:
   - Read `finetune-project/plan.md`
   - Summarize for user: topic count, grader template picked
   - Suggest: "Review plan.md. Next: /finetune-generate (or edit topics.json first)."
5. If user edits `topics.json` and re-runs `/finetune-plan`, the CLI handles idempotency —
   no special logic needed here.

## Error handling
- CLI exits non-zero → relay stderr; suggest `/finetune-status` to diagnose.
- `plan.md` missing → something went wrong; suggest `vllora finetune plan --force`.

## Related skills
- `pipeline-context` (auto-loaded)
- `topic-hierarchy` (if user asks about topic design)
- `grader-writing` (if user wants the grader draft explained)
```

### 7.4 Reference skills structure

Each reference skill is a directory with `SKILL.md` (auto-loaded on match) plus optional companion files. Skills encode domain knowledge that the agent uses when executing commands.

#### Template

```markdown
---
name: <skill-id>
description: |
  <when Claude Code should auto-load this skill — trigger phrases matter>
---

# <Skill Title>

<Expert content: templates, rules, failure patterns, examples, gotchas>
```

#### Example — `grader-writing/SKILL.md` (abbreviated)

```markdown
---
name: grader-writing
description: |
  Auto-load when writing, reviewing, or diagnosing a grader.js. Triggers:
  grader failing, reward function tuning, label-set vs ranking choice,
  tpFloor / OOV / duplicate handling questions.
---

# Grader Writing Guide

## Pick the template

| Task type                 | Template       | Example                   |
| ------------------------- | -------------- | ------------------------- |
| Multi-label classification| label-set      | topic tagging             |
| Ranking / ordering        | rank           | search result ordering    |
| Free-text generation      | completion     | summarization             |
| Tool-calling agents       | tool-match     | function-call accuracy    |

## Common failure patterns

### Pattern: hard-gate zero
**Symptom:** grader returns exactly 0.0 for most attempts; zero_variance_frac > 0.8.
**Cause:** grader gates valid-but-imperfect answers to 0 too aggressively.
**Fix:** apply tpFloor = 0.22 + (tp/gt) * 0.10 when tp > 0.

### Pattern: OOV gaming
**Symptom:** high trivial_frac; model emits garbage tokens and still scores.
**Cause:** parseLabels silently drops out-of-vocab segments.
**Fix:** countOOVSegments and add to fp.

### Pattern: duplicate emissions
**Symptom:** model repeats the same label; multiset semantics needed.
**Fix:** countDuplicateEmissions; add to fp.

(etc. — full content migrated from existing reference/grader-writing.md)
```

### 7.5 What the plugin DOES

The plugin's job is narrow and well-defined:

- ✓ **Interpret user intent** from natural language or slash command.
- ✓ **Validate preconditions** via `vllora finetune status` before acting.
- ✓ **Shell out** to `vllora finetune <verb>` with CLI args derived from context.
- ✓ **Stream progress** from CLI stdout back to the user's chat.
- ✓ **Interpret final output** — summarize success, explain failures.
- ✓ **Suggest next steps** by relaying `Next: /finetune-<verb>` hints from the CLI.
- ✓ **Load reference skills** when user asks meta-questions (about graders, topics, etc.).

### 7.6 What the plugin does NOT do

If a plugin command is doing any of the following in prose, it's wrong:

- ✗ Parsing PDFs, extracting knowledge, or generating training records — CLI workers do this.
- ✗ Writing files in `finetune-project/` — CLI does this.
- ✗ Talking to the gateway directly — CLI does this.
- ✗ Advancing `pipeline-journal.json` — CLI does this.
- ✗ Deciding eval readiness, grader refinement triggers, or training convergence — CLI does this.
- ✗ Running any Python / shell scripts other than `vllora finetune ...`.
- ✗ Maintaining state between sessions — journal + DB are the state stores.
- ✗ Auto-chaining commands (except `/finetune-quickstart` which is explicitly a wizard).

### 7.7 Composition rule — every phase is user-triggered

Plugin commands **never auto-invoke other plugin commands**. Chaining happens only via the suggested "Next: /finetune-<verb>" hint:

```
 CLI prints → "Next: /finetune-eval"   (last line of stdout)
 Plugin    → relays to user
 User      → decides; types /finetune-eval
```

Exception: `/finetune-quickstart` is explicitly a wizard and chains `init` + `sources` after the user answers wizard prompts. All other commands are single-step.

This matches §8 invariant: "every phase is user-triggered — nothing runs autonomously."

### 7.8 Keeping the plugin in sync with the CLI

Both ship from the same pip package (§3 Distribution Architecture). Rules:

- Command frontmatter mentions trigger phrases → keep aligned with CLI verb names.
- When a CLI verb changes (flag added, semantics shift), update the matching command `.md`.
- Reference skills are versioned with the CLI — when grader patterns change, `grader-writing/SKILL.md` updates.
- `requires` in `plugin.json` pins `cli >= <version>` — prevents running plugin against too-old CLI.
- Contract tests verify: for each CLI verb, a matching `commands/<verb>.md` exists, with correct preconditions listed.

---

## 8. File Layout

### 7.1 In the `vllora` Rust workspace

> The workspace ships as a single `vllora` binary. End users install it via a maturin-built pip wheel (like `ruff` / `uv`) — `pip install vllora` and `pip install vllora[finetune]` still work. `vft` is an optional thin wrapper that execs `vllora finetune …`.



```
vllora/                                             # Rust workspace root
├── Cargo.toml                                      # workspace manifest
├── gateway/                                        # bin crate = `vllora`
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                                 # CLI dispatch anchor
│       ├── cli/
│       │   ├── mod.rs                              # clap Commands enum (Serve, List, Sync,
│       │   │                                       #   Traces, Finetune, Doctor, Version, Config, …)
│       │   └── commands/
│       │       ├── mod.rs                          # module registry
│       │       ├── serve.rs, list.rs, sync.rs,     # existing server commands
│       │       │   traces.rs, generate_models_json.rs
│       │       ├── doctor.rs, version.rs, config.rs  # Feature 005 lifecycle
│       │       └── finetune/                       # pipeline subcommand tree
│       │           ├── mod.rs                      # FinetuneCommand enum + dispatcher
│       │           ├── init.rs, sources.rs,
│       │           │   import_records.rs,
│       │           │   plan.rs, generate.rs,
│       │           │   eval.rs, train.rs,
│       │           │   status.rs, quickstart.rs,
│       │           │   auto.rs                     # Layer A verbs
│       │           ├── jobs/                       # Layer B `jobs <verb>` wrappers
│       │           │   ├── mod.rs
│       │           │   ├── status.rs, knowledge.rs,
│       │           │   │   records.rs, grader.rs,
│       │           │   │   eval.rs, train.rs,
│       │           │   │   test_job.rs
│       │           └── workers/                    # claude -p subprocess orchestrators
│       │               ├── mod.rs
│       │               ├── claude_client.rs        # subprocess wrapper, stream-JSON parser
│       │               ├── knowledge_extractor.rs,
│       │               │   relation_builder.rs,
│       │               │   trace_analyzer.rs,
│       │               │   record_generator.rs,
│       │               │   grader_drafter.rs,     # 3 modes: init / finalize / refine
│       │               │   training_monitor.rs
│       └── setup/                                  # Feature 005 idempotent machine setup
│           ├── mod.rs                              # SetupStatus, ensure_plugin_symlink(),
│           │                                       #   claude_readiness()
│           ├── plugin_symlink.rs
│           └── claude_readiness.rs
├── finetune/                                       # reusable crate (state + adapters + prompts)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                                  # re-exports state, sources_adapters, prompts
│       ├── client.rs, types.rs                     # existing cloud client
│       ├── state/                                  # Feature 002 artifact state machine
│       │   ├── mod.rs                              # Journal / Analysis / ChangeLog / ExecutionLog
│       │   ├── journal.rs                          # pipeline-journal.json read/write
│       │   ├── analysis.rs                         # analysis.json append-only
│       │   ├── change_log.rs, execution_log.rs
│       │   ├── atomic_write.rs                     # write-tmp + fsync + rename
│       │   ├── lock.rs                             # single-writer advisory lock
│       │   └── schemas/
│       │       ├── journal.schema.json
│       │       └── analysis.schema.json
│       ├── sources_adapters/                       # URI resolvers (workers never see URIs)
│       │   ├── mod.rs                              # SourceAdapter trait
│       │   ├── local.rs, hf.rs, s3.rs,
│       │   │   gs.rs, azblob.rs, https.rs
│       └── prompts/                                # claude -p system-prompt templates
│           ├── knowledge-extractor.md,
│           │   relation-builder.md,
│           │   trace-analyzer.md,
│           │   record-generator.md,
│           │   training-monitor.md
│           └── grader-drafter-init.md,
│               grader-drafter-finalize.md,
│               grader-drafter-refine.md
├── core/, guardrails/, llm/, telemetry/            # other workspace crates
├── finetune-skill/scripts/                         # deterministic Python helpers (existing)
│                                                   #   validate_records.py, data_quality_gate.py,
│                                                   #   derive_ground_truth.py, probe_difficulty.py,
│                                                   #   analyze_training.py, …
│                                                   # Rust CLI verbs shell out to these.
└── plugin/                                         # Claude Code plugin bundle (symlinked on install)
    ├── plugin.json                                 # `vllora-finetune` manifest
    ├── commands/                                   # 1 orchestrator + 9 thin verbs
    │   ├── finetune.md                             # orchestrator
    │   └── finetune-{quickstart,init,sources,
    │       import-records,plan,generate,eval,
    │       train,status}.md                        # thin verbs
    ├── skills/                                     # reference skills
    │   ├── pipeline-context/SKILL.md
    │   ├── grader-writing/SKILL.md
    │   ├── topic-hierarchy/SKILL.md
    │   ├── readiness-gate/SKILL.md
    │   └── nemo-guide/SKILL.md
    └── resources/                                  # templates, reference docs
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

## 9. Invariants

- **Idempotent.** Re-running a command reads the journal and skips completed sub-steps. `--force` to redo.
- **Journal is source of truth.** `pipeline-journal.json` is the only store for "where am I."
- **Status is pure.** No mutations. No network calls (reads cached analysis).
- **Implicit approval.** Running `generate` after `plan` = approval. No `--approve` flag.
- **Same verb, same behavior.** `vllora finetune eval` and `/finetune-eval` produce identical artifacts.
- **Plugin has no pipeline logic.** No Python in plugin files; no direct gateway calls; no file writes outside what a CLI call triggers. Applies to both thin verb commands (which only narrate) and the orchestrator (which reasons + dialogues but always calls CLI for pipeline work).
- **CLI inherits auth.** `claude -p` uses whatever `claude login` or `ANTHROPIC_API_KEY` has configured. No separate key management in `vllora`.
- **Claude is the only LLM dependency.** No other LLM provider (OpenAI, Google, Mistral, etc.) is required for any pipeline phase. Record generation, trace analysis, topic derivation, grader drafting, and training monitoring all run through Claude workers. Eval and training use local Qwen models via the gateway. `vllora doctor` reports zero missing LLM auth beyond Claude in the default configuration.
- **vllora never reads credential files directly.** Only `claude -p` resolves auth; vllora treats Anthropic credentials as opaque. The CLI inherits the Claude binary's own token handling via subprocess env. This keeps vllora on the intended-use side of Anthropic's ToS (ref §2.10.1) and distinguishes us from banned third-party harnesses that extract OAuth tokens to bypass the Claude Code binary.
- **Strictly single-user, local-execution.** vllora runs on the user's own machine, using the user's own auth. Never a multi-user hosted service dispatching Claude work for other users — that pattern is account sharing/reselling regardless of whether the Claude binary is in the middle. Enforced by pip-only distribution (§3) and the no-REST-API non-goal (§12).
- **Slug IDs local, UUIDs at boundary.** Local files use slugs; gateway assigns UUIDs on upload. `reconcile-topics` keeps them mapped.
- **UI is read-only.** React FE queries gateway. Never mutates pipeline state.
- **Single authoritative source per artifact.** See §4 storage principle. Files and DB never both claim ownership. The "authoritative source" column is the contract.
- **Gateway never tracks local paths.** `vllora.db` has zero references to cwd paths. The user can move, rename, or delete `finetune-project/` without affecting workflow records. (Rebuild-from-DB is a future utility, not a day-one feature.)
- **Project files live in user's cwd.** Never in `~/.vllora/`. Matches git / Supabase / Vercel / Prisma convention.
- **Artifacts are context carriers, not status flags.** `analysis.json`, `plan.md`, `change-log.md`, and `iterations.md` carry the *reasoning* between phases, not just outcomes. Because workers are short-lived `claude -p` subprocesses (no implicit memory across phases), these files are the handoff mechanism. Sparse or machine-only content breaks the pipeline's coherence. See §14 Architectural Tradeoffs for rationale.
- **`analysis.json` is the running diary.** Every phase appends structured reasoning — observations, decisions, fix hints, root-cause analysis — not just numbers. It's the single document that, if read in order, explains why the pipeline made every choice it made. Workers and the UI both consume it.
- **All state-file writes are atomic.** Write to `.tmp`, fsync, rename. Never partial writes. Applies to `pipeline-journal.json`, `analysis.json`, and any other JSON state file. See §4.7.3.
- **Single-writer discipline for state files.** Only the CLI writes `pipeline-journal.json`, `analysis.json`, `change-log.md`, `iterations.md`, `execution-log.md`. Never plugin commands, orchestrator, or workers directly. Workers emit structured output; the CLI owns the write. Prevents races when orchestrator + thin verbs + direct CLI are concurrently active. See §4.7.2.
- **Append-only history sections.** `analysis.json` phase sections, `iterations` arrays, `change-log.md`, `iterations.md`, `execution-log.md` are append-only — prior entries never mutated or removed. Enables audit, replay, and cross-session debugging. See §4.7.1.
- **Explicit crash-recovery state.** Phases write `status: running` + PID at start, `done`/`failed` at end. Re-run finding `running` with dead PID = known-crashed state; prompts user to resume or `--force`. See §4.7.4.

---

## 10. Install

### 10.1 One-time setup

```bash
claude login                         # or set ANTHROPIC_API_KEY
pip install vllora
vllora init
```

`vllora init` does: prereq checks (Claude auth, Python, `claude` CLI, port 9090) → downloads gateway binary → starts gateway → symlinks `plugin/` → `~/.claude/plugins/vllora-finetune/` → optionally starts UI. Rolls back on error.

### 10.2 Upgrade / uninstall

```bash
pip install -U vllora && vllora init --repair     # upgrade
vllora uninstall && pip uninstall vllora          # clean removal
```

### 10.3 CI / headless

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
steps:
  - run: npm i -g @anthropic-ai/claude-code
  - run: pip install vllora && vllora init --non-interactive
  - run: vllora finetune auto --scenario tau-retail
```

---

## 11. Open Questions

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
11. **Prompt caching behavior with `claude -p`.** Load-bearing for cost: §14.9 shows the new architecture is 4–5× more expensive than the monolithic approach **without** prompt caching. Need to verify: (a) does `claude -p` use prefix caching automatically across sequential subprocess invocations from the same machine? (b) what's the cache TTL? (c) how much does our shared prefix (objective + pipeline-context + accumulated handoff) benefit from it? Add a measurement harness before Feature 003 (`cli-pipeline-verbs`) implementation locks in.
12. **Run-replay contract test.** Goal: verify context-carrier artifacts preserve old-agent capability. Given a completed pipeline run's artifacts, can a fresh `claude -p` worker make the same decision at a given step? If not, artifacts are too sparse. See §14.9 for the test design.

---

## 12. Non-Goals

- Changing the pipeline itself (GRPO, grader, readiness, scripts — unchanged).
- Replacing `pipeline-journal.json` (formalized, not replaced).
- Full rewrite (incremental; existing skill keeps working during the transition).
- REST API for driving the pipeline (CLI is the only API).
- Publishing plugin to Claude Code marketplace in v0 (pip is sole install path).

---

## 13. Success Criteria

- `pip install vllora` → scaffolded project in under 5 minutes.
- New user completes one end-to-end run without docs, following `Next:` hints.
- Any command `.md` file ≤ 150 lines.
- `/finetune-status` on fresh project prints `Next: /finetune-init`. Mid-pipeline: exact next command.
- `vllora finetune auto --scenario X` produces same end state as today's monolithic run, as an observable command sequence.
- Re-running any command on a completed step is a no-op.
- CLI + plugin versions never diverge (single pip package).
- Claude subscribers never configure an API key — `claude login` is the only auth step.

---

## 14. Architectural Tradeoffs

The new architecture is a significant departure from today's monolithic `SKILL.md`. This section makes the tradeoff explicit, names what we gain, names what we lose, and documents the mitigations that keep the new approach workable.

### 14.1 Old approach — monolithic `SKILL.md` (what we have today)

```
  USER  →  CLAUDE CODE session
           ├── reads SKILL.md (443 lines — the full playbook)
           │
           ├── orchestrates entire pipeline IN ONE CONVERSATION
           │   ├── extracts PDFs         (sub-Task: knowledge_extractor)
           │   ├── analyzes traces       (inline reasoning)
           │   ├── builds topics         (inline + Task: relation_builder)
           │   ├── writes grader         (inline reasoning)
           │   ├── generates records     (inline)
           │   ├── runs eval             (interprets results inline)
           │   ├── diagnoses failures    (cross-references earlier decisions)
           │   └── iterates              (remembers why)
           │
           └── all context flows through ONE agent head
```

### 14.2 New approach — plugin + CLI + short-lived workers

```
  USER  →  PLUGIN (narrator)  →  CLI (Python)  →  N ISOLATED claude -p WORKERS
                                   │
                                   └── state lives in files + DB
                                       (journal, analysis.json, plan.md,
                                        change-log.md, iterations.md)
```

### 14.3 Head-to-head

Two axes to compare: **thin-only mode** (just thin verb commands + CLI, no orchestrator) vs **hybrid mode** (thin verbs + orchestrator + CLI — the chosen architecture, see §2.3). Both are compared against today's monolithic SKILL.md.

| Dimension | Monolithic SKILL.md | Thin-only mode | Hybrid mode ✓ (chosen) |
|---|---|---|---|
| Exploratory ML research (deep-dive, rich dialogue) | ✓ | gap | ✓ (via orchestrator) |
| Production / CI reproducibility | | ✓ | ✓ (via CLI direct) |
| Multi-host portability (OpenClaw, OpenCode, …) | | ✓ | ✓ (via thin commands + CLI) |
| Cross-step implicit reasoning | ✓ | 70% mitigated by artifacts | ✓ (orchestrator holds context) |
| Testability / audit | | ✓ | ✓ (pipeline logic still in CLI) |
| Long-running workloads (3-hr training) | | ✓ | ✓ |
| Novice-friendly (low patience / low ML background) | | ✓ | ✓ (orchestrator guides) |
| Expert-friendly (ML researcher doing deep iteration) | ✓ | gap | ✓ (via orchestrator) |
| Error recovery from mid-run crash | | ✓ | ✓ |
| Rich mid-pipeline dialogue with agent | ✓ | shifts around commands | ✓ (orchestrator dialogues natively) |
| Scales to 1000s of users with varied workflows | | ✓ | ✓ |
| Fast iteration on the pipeline code itself | | ✓ | ✓ |

**The hybrid mode closes every "old wins" gap** without sacrificing the clean-architecture gains of the new approach. See §14.10 for why.

### 14.4 The central concern

**Old approach:** ONE conversation, unified context, Claude remembers everything.
**New approach:** MANY short-lived workers, context reloaded from files at each step.

If the new architecture is naïvely implemented — workers just reading JSON status flags — we lose the cross-step reasoning that made the old approach powerful. The "why we picked this grader template" knowledge never makes it from `plan` to `eval refine` unless explicitly serialized.

### 14.5 Mitigations (first-class design choices, not afterthoughts)

These five patterns make the new architecture viable:

#### M1 — Artifacts-as-context, not artifacts-as-status

Every serialized file is designed to be a **context carrier** with prose reasoning, not just numeric state:

| Artifact | What it carries |
|---|---|
| `analysis.json` | **Running diary.** Each phase appends observations, decisions, fix hints, root-cause analysis. |
| `plan.md` | Human-readable plan with grader rationale + topic design reasoning (not just IDs). |
| `change-log.md` | Grader modifications with the diagnosis that triggered each change. |
| `iterations.md` | Per-iteration reasoning across eval rounds. |
| `monitor-report-N.md` | Training monitor's narrative: what it saw, what it diagnosed, what it recommends. |

Read in order, these files tell the full story of the pipeline's choices. A worker handed this bundle starts with roughly the same context Claude had 20 messages into the old approach.

> Enforced via §9 invariant: **"Artifacts are context carriers, not status flags."**

#### M2 — Rich system prompts inherit context

Each worker's `claude -p` system prompt includes:
- The objective.
- A curated summary of prior-phase decisions (from `analysis.json`).
- The full journal state.
- The relevant reference skill(s) auto-loaded.

Workers never start from zero. They start where a junior engineer would after project handoff.

#### M3 — The user is the continuity thread

In chat, the user is **persistent across all sub-conversations**. They:
- Read `plan.md` between `/finetune-plan` and `/finetune-generate`.
- Hold the "why we're doing this" anchor.
- Decide which fix suggestion to follow.
- Notice when an earlier choice was wrong.

Old approach: Claude holds continuity.
New approach: **user + explicit artifacts jointly hold it.** For non-ML users (our target), this is actually a better fit — they're not forced to re-read a 40-message transcript to understand state.

#### M4 — Reference skills auto-load per worker

Domain context (`grader-writing`, `pipeline-context`, `topic-hierarchy`, `readiness-gate`, `nemo-guide`) loads automatically when relevant. Accumulated best practices are inherited, not re-derived.

#### M5 — `quickstart` preserves old-style single-session orchestration for exploratory runs

`/finetune-quickstart` deliberately chains `init → sources` in ONE Claude Code session, not as separate subprocess spawns. For users who value the "Claude is with me the whole time" feel for first-run exploration, that path exists.

Future extension: a `/finetune-drive` or `/finetune-all` that keeps one Claude session active across the whole pipeline (old-style orchestration) while the CLI still persists state. Best of both worlds, at the cost of maintaining two orchestration modes.

### 14.6 When mitigations aren't enough

Cases where the new architecture is demonstrably worse than the old:

- **Deeply exploratory runs.** ML researcher wants to try 10 grader variants, each with nuanced reasoning about what to change and why. Old SKILL.md handles this as natural dialogue. New approach requires careful prompt engineering to avoid losing subtle intent.
- **Ambiguous mid-pipeline decisions.** "This topic boundary is fuzzy — should we merge, split, or keep?" works better as a conversation than as a command interaction.
- **Non-standard failure modes.** When something goes wrong in a way our diagnostic code didn't anticipate, the old agent can improvise. The new CLI has fixed behaviors.

For these cases, power users can always:
1. Run `vllora finetune` verbs manually with flags (`--force`, custom configs).
2. Edit artifacts (`topics.json`, `grader.js`) directly.
3. Use the old monolithic `finetune-skill/SKILL.md` path during the transition — existing users can keep it working until Feature 003 (`cli-pipeline-verbs`) is complete and Feature 004 (`claude-code-plugin`) ships the orchestrator.

### 14.7 Decision

**We commit to the new architecture, treating `analysis.json` + `plan.md` + `change-log.md` + `iterations.md` as first-class context carriers.** This is the load-bearing design choice for making it work. If those files become sparse or JSON-only status markers, the context-loss concern becomes real. If they're rich prose handoffs with reasoning, users won't notice the loss.

**Who this choice serves:**

- **App developers + PMs** fine-tuning small LLMs for their products → primary target, served well.
- **ML researchers** doing GRPO exploration → secondary, acknowledged gap; power-user flags mitigate.
- **CI / automation users** → primary target, served much better than old architecture.
- **Multi-host users** (OpenClaw, OpenCode) → only served by new architecture.

### 14.8 Success signals for the mitigations

We'll know the mitigations are working if:

- Users complete end-to-end runs without asking *"why did it pick this?"* questions the pipeline itself couldn't answer by reading artifacts.
- Workers spawned mid-pipeline cite specific prior-phase decisions by name (*"raising tpFloor to 0.22 as noted in change-log.md round 2"*), not generic ML reasoning.
- Users who inspect `analysis.json` find it useful, not just a debug dump.
- Bugs are reproduced by replaying artifacts, not by replaying chat transcripts.

We'll know they're failing if:

- `analysis.json` becomes write-only; workers ignore it.
- Each worker re-derives reasoning from scratch, inconsistently.
- Bug reports say *"I don't know why the pipeline did X"* — the artifacts don't explain it.
- Users ask for "a mode like the old SKILL.md" as a feature request.

### 14.9 Can rich handoffs match monolithic context?

The natural follow-up question: *if we feed each spawned `claude -p` worker the full history of prior decisions, can it match what the monolithic agent had in its head?*

**Short answer: ~90% yes. ~10% gap is real but bounded.**

#### What serializes losslessly (the 90%)

If handoff artifacts are prose-rich, every *named decision* carries over:

| Old agent had in-context | New worker gets from artifact |
|---|---|
| "Picked label-set template because trace analysis showed fixed vocab" | `analysis.json.plan.grader_template_rationale` |
| "Raised tpFloor to 0.22 because iter-1 had 78% zero-variance" | `change-log.md` entry v2→v3 |
| "Topic 'cancel-pending-order' is narrow; risk of collapse" | `plan.md` risk flags section |
| "User edited topics.json after plan to split 'refunds' topic" | journal + `topics.json` diff |
| "Eval iter 2 failed because trivial% too high" | `analysis.json.eval.iterations[1].root_cause` |
| "We already tried lowering max_turns; didn't help" | `iterations.md` |

Every technical sub-task (extract PDF, build topic hierarchy, refine grader from eval scores) has enough formal structure to serialize cleanly.

#### What doesn't serialize (the 10%)

Genuinely hard to capture:

1. **Tacit reasoning** — agent noticed "this topic description feels brittle" without writing it down.
2. **Cross-referential noticing** — emergent "wait, step 2 connects to this failure pattern" realizations don't happen across siloed workers.
3. **User state / mood** — tone, impatience, confidence — lost in subprocess boundaries.
4. **Conversational nuance** — "eh, up to you" vs "please do this" — flattened in serialized instructions.
5. **Internal monologue scaffolding** — old agent's "if X then Y otherwise Z" condensed into a final decision; reasoning chain not preserved.

#### The compensating advantage

Each `claude -p` worker has a **focused prompt**. The old agent sometimes carries too much context and gets distracted by 40 messages of unrelated history. Workers are laser-focused on the current step. For formal sub-tasks, **focus beats accumulated context**.

#### The real cost: tokens

| | Monolithic SKILL.md | New approach (naïve) | New approach (with prompt caching) |
|---|---|---|---|
| Total prompt tokens per pipeline run | ~100–200K | ~500–800K | ~150–250K |

Without prompt caching, new approach is 4–5× more expensive. With automatic prefix caching (the shared prefix — objective, pipeline-context skill, accumulated handoff — cached across sequential `claude -p` invocations), per-worker effective cost drops sharply. **Prompt caching is load-bearing** — §11 Q11 tracks verification.

#### The practical test: run-replay

Concrete contract test to verify artifacts preserve capability:

1. Take a completed pipeline run produced by the old monolithic SKILL.md.
2. From that run's raw state, generate the artifacts the new approach would produce (`analysis.json`, `plan.md`, `change-log.md`, `iterations.md`, …).
3. For each pipeline step, hand those artifacts + the step's task to a fresh `claude -p` worker.
4. Record the worker's decision at each step.
5. Compare against the old agent's decision.

If worker decisions match on ≥90% of steps, the context-carrier pattern works. If worker frequently asks *"why did we pick X?"* or makes different choices, artifacts are too sparse and need richer reasoning capture.

**This should be a contract test in CI** — catches regressions when someone writes a lazy JSON-only artifact that drops reasoning.

#### Five conditions for the new approach to match the old

1. **Artifacts are prose-rich, not JSON-sparse.** Enforced by §9 invariant.
2. **Rejected alternatives + known risks + user overrides are captured**, not just final decisions.
3. **Prompt caching verified and enabled** — without it, cost is 4–5× higher (§11 Q11).
4. **Workers include upstream artifacts in system prompts**, not just task-specific inputs.
5. **Run-replay contract tests** verify reproducibility — given artifacts, workers make consistent decisions (§11 Q12).

When all five hold: the new approach matches the old on technical capability, exceeds it on auditability, and loses only the exploratory / conversational ~10% that matters for ML researchers but not for our target users.

#### Practical guidance for implementers

When writing code that produces an artifact, ask: *"if a fresh Claude worker has only this file + my objective + the next task, can it make the same decision I'm about to make?"* If no, the artifact is missing reasoning. Common omissions:

- Decisions recorded as outcomes, not as rationale ("picked label-set" vs "picked label-set *because X*").
- Rejected alternatives not noted ("*tried rank template first; rejected because ordered scoring doesn't fit multi-label task*").
- Edge-case flags not captured ("topic `cancel-pending-order` has 3× prior observations from traces — risk of over-representation in training data").
- User overrides recorded without reasoning ("user edited topics.json" without *what they changed and why we think they changed it*).

Getting artifact richness right is the single biggest determinant of whether the new architecture feels as capable as the old.

### 14.10 Why the hybrid model closes every gap

§14.9 shows rich handoffs close the **context-loss** gap (~90%). But they don't close the **orchestration-shape** gap — some needs (exploratory dialogue, expert deep iteration) are fundamentally about dialogue structure, not context capacity.

**The hybrid model (§2.3) solves both** by offering two plugin modes over the same CLI:

```
                    ┌──────────────────────────────────────────────┐
                    │  /finetune           (ORCHESTRATOR, thick)   │
                    │  ─ holds context across phases               │  ← closes
                    │  ─ agent loop inside Claude Code session     │    orchestration-
                    │  ─ dialogues with user                       │    shape gap
                    │  ─ reasons across steps                      │
                    │  ─ reads + writes artifacts as it goes       │
                    └─────────────────────┬────────────────────────┘
                                          │  calls via Bash
                                          ▼
                    ┌──────────────────────────────────────────────┐
                    │  /finetune-<verb>    (THIN wrappers)         │
                    │  ─ one slash command per pipeline phase      │  ← closes
                    │  ─ reads journal for state                   │    context-loss
                    │  ─ shells out to CLI verb                    │    gap via
                    │  ─ rich artifacts carry reasoning forward    │    artifacts
                    └─────────────────────┬────────────────────────┘
                                          │  shells out
                                          ▼
                    ┌──────────────────────────────────────────────┐
                    │  vllora finetune <verb>       (CLI)          │
                    │  ─ pipeline logic + state + workers          │  ← portable,
                    │  ─ also used directly from terminal / CI     │    testable,
                    │                                              │    multi-host
                    └──────────────────────────────────────────────┘
```

#### Gap-by-gap accounting

| Gap from §14.3 | How hybrid closes it |
|---|---|
| Cross-step implicit reasoning | Orchestrator is a continuous agent — same in-context reasoning the old SKILL.md had. Thin mode mitigates via artifacts (~70%); orchestrator restores the full 100% when a user chooses it. |
| Exploratory ML research | Orchestrator natively supports the "try variant → observe → discuss → iterate" loop. User types `/finetune` once, stays in one conversation, iterates rapidly. |
| Expert deep dives | Same as above. Experts never hit the subprocess boundary unless they want to. |
| Rich mid-pipeline dialogue | Orchestrator *is* the dialogue. It pauses between phases, asks questions, responds to user steering, all within one Claude Code conversation. |

#### What we do NOT give up by adding the orchestrator

- **CI + automation** — untouched. `vllora finetune <verb>` works standalone; orchestrator is plugin-layer only.
- **Multi-host portability** — untouched. Thin commands + CLI still port to OpenClaw, OpenCode, Cline, etc. Orchestrator is Claude-Code-exclusive, which is fine: each host can have its own orchestrator or just use thin commands.
- **Testability** — unchanged. Pipeline logic lives in CLI; orchestrator only coordinates. LLM-driven parts (workers, orchestrator) get scenario evals, not unit tests. That was already the plan.
- **Determinism for skilled users** — they can still use thin verbs directly. The orchestrator doesn't force itself on anyone.

#### Costs we accept

1. **Context window under long orchestrator runs.** Mitigation: orchestrator delegates heavy-context work (PDF extraction, record generation) to CLI-spawned workers that have their own fresh context windows. Orchestrator sees summaries only.
2. **Higher token cost for orchestrator users.** Acceptable — they're choosing capability. Thin-mode users still get cheap runs. CI gets the cheapest.
3. **Two plugin modes to maintain.** Shared CLI beneath keeps duplication small — only the markdown files diverge. No logic duplicated.
4. **LLM-driven orchestration resists contract testing.** Compensated by scenario-based evals (*"given state X, did orchestrator pick reasonable next action?"*). Standard agent-testing practice.

#### Per-command defaults

| Use case | Default command | Why |
|---|---|---|
| First-time user, unclear what to do | `/finetune` orchestrator | Wizard-quality guided experience |
| User says *"I want to fine-tune a model from these PDFs"* | `/finetune` orchestrator | Natural-language entry |
| User types an explicit phase name | `/finetune-<verb>` thin | Respect user intent |
| User runs `vllora finetune …` from terminal | CLI direct | They chose terminal surface |
| CI workflow file | CLI `auto` or explicit verb chain | Non-interactive |

#### The net result

**Zero gaps vs monolithic SKILL.md** across §14.3. Hybrid matches or beats old approach on every dimension while inheriting the architectural gains (testability, portability, CI support, multi-host). The only real cost is maintenance of two plugin-level modes, which is negligible compared to the unified CLI beneath.

**This is the architecture.** §2.3 is authoritative.
