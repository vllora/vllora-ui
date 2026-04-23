# Implementation Plan — vllora finetune (three-track split)

**Status:** Ready to start.
**Parent spec:** [finetune-skill-command-redesign.md](./finetune-skill-command-redesign.md)
**Related:** [openclaw-integration.md](./openclaw-integration.md)
**Date:** 2026-04-23
**Team:** 3 engineers

This doc divides the implementation across three parallel tracks with explicit interface contracts so each engineer can work independently.

---

## 1. Where detailed specs live

**Per-feature detailed specs live in the `finetune-workflow-speckit` repo** (spec-kit framework, GitHub's spec-driven development toolkit). This document is for **cross-feature coordination** — track assignment, milestones, interface contracts between tracks. For a specific feature's acceptance criteria, data model, contracts, and tasks, see `specs/NNN-<feature-name>/` in the spec-kit repo.

**Repo:** `finetune-workflow-speckit/` (sibling of this UI repo)

**Authoritative sources of truth:**

| What | Where |
|---|---|
| Project principles (constitution) | `finetune-workflow-speckit/.specify/memory/constitution.md` — 5 core principles aligned with §9 invariants of the parent spec |
| Per-feature specs (`spec.md`, `plan.md`, `data-model.md`, `contracts/*`, `tasks.md`) | `finetune-workflow-speckit/specs/NNN-<feature>/` |
| Cross-feature coordination (this doc) | `vllora/ui/docs/workflow-skill-first-approach/implementation-plan.md` |
| Design decisions + architectural rationale | `vllora/ui/docs/workflow-skill-first-approach/finetune-skill-command-redesign.md` |

**Feature pipeline:**

| # | Feature | Track | Status |
|---|---|---|---|
| 001 | `job-based-cli-api` — gateway job lifecycle, workflow-scoped routes, Layer B command catalog | A | **Spec + plan drafted** (tasks pending). Cross-refs to Features 002–006 added. |
| 002 | `state-and-gateway-client` — Python state helpers (atomic writes, journal, analysis append-only, change-log) + typed gateway HTTP client + Layer B CLI wrappers | A | **Spec + plan drafted**. |
| 003 | `cli-pipeline-verbs` — Python `vllora finetune <verb>` verbs + 7 workers + 6 URI adapters + power-user utilities | B | **Spec + plan drafted**. |
| 004 | `claude-code-plugin` — plugin bundle (orchestrator `/finetune` + 9 thin verb commands + 5 reference skills + resources) | C | **Spec + plan drafted**. |
| 005 | `install-flow` — `vllora init` / `doctor` / `uninstall` / `upgrade` + gateway + UI lifecycle | C | **Spec + plan drafted**. |
| 006 | `ui-analysis-integration` — React UI consumers of new `analysis.json` + grader-diff + eval iterations + training metrics | C | **Spec + plan drafted**. |

**Workflow for each feature:**

```
1.  /speckit.specify      → specs/NNN-<name>/spec.md          (user stories, FRs)
2.  /speckit.clarify      → appends clarifications
3.  /speckit.plan         → plan.md + data-model.md + contracts/ + research.md
4.  /speckit.tasks        → tasks.md (ordered, dependency-respecting)
5.  /speckit.taskstoissues → GitHub issues linked to the feature
6.  (implementation)      → track owner works through issues
```

**What this doc owns that spec-kit doesn't:**
- Track assignment (who does A/B/C).
- Milestone sequencing across features (§7 below).
- Interface contracts **between tracks** (shared code ownership, handoff points — §7).
- Coordination rituals (standups, weekly demos — §8).
- MVP/shipping strategy (§11).

**What spec-kit owns that this doc doesn't:**
- Detailed functional requirements per feature.
- Acceptance criteria + success metrics per feature.
- Data models + API contracts (OpenAPI specs).
- Task breakdowns within a feature.
- Constitution — enforced via spec-kit's constitution check during `/speckit.plan`.

---

## 2. Three tracks

| Track | Owner | Theme | Deliverables |
|---|---|---|---|
| **A — Artifacts & Storage** | *(assigned coworker 1)* | Storage + state files + gateway DB + contract tests | State-file helpers, SQLite schemas + migrations, gateway API routes, journal/analysis schemas, contract tests |
| **B — CLI + Workers** | *(assigned: TBD)* | Pipeline logic + Claude workers + URI adapters | `vllora finetune <verb>` implementations, worker subprocess layer, prompt files, Layer B job ops, scripts integration |
| **C — Plugin + Install + UI** | *(assigned: TBD)* | User-facing surfaces + distribution | Claude Code plugin (orchestrator + thin commands + skills), `vllora init`/`doctor`, UI updates for new `analysis.json` fields |

**Balance:** Track B is the largest (the core pipeline). Tracks A and C are roughly equal. Any of the 3 of you can take any track; assignments below are a suggestion.

---

## 3. Full file tree (skeleton)

Target layout mapped to the actual Rust workspace at `vllora/`. The `vllora` binary comes from the `gateway` crate; the reusable `finetune` crate owns state, source adapters, and worker prompt templates. The plugin bundle lives at `vllora/plugin/` and is symlinked into `~/.claude/plugins/` at install time.

```
vllora/                                            (Rust workspace root)
│
├── Cargo.toml                                     [A] workspace manifest (existing)
├── README.md
│
├── gateway/                                       → bin crate compiled as `vllora`
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                                [C] CLI dispatch anchor (existing; +Finetune/Doctor/Version/Config wired)
│       │
│       ├── cli/
│       │   ├── mod.rs                             [C] clap Commands enum (Serve, List, Sync, Traces,
│       │   │                                       Finetune, Doctor, Version, Config, …)
│       │   └── commands/
│       │       ├── mod.rs                         [C] module registry
│       │       ├── serve.rs, list.rs, sync.rs,    existing server commands
│       │       │   traces.rs, generate_models_json.rs
│       │       ├── doctor.rs                      [C] `vllora doctor` (Feature 005)
│       │       ├── version.rs                     [C] `vllora version` (Feature 005)
│       │       ├── config.rs                      [C] `vllora config get/set` (Feature 005)
│       │       │
│       │       └── finetune/                      [B] pipeline subcommand tree (Features 002/003)
│       │           ├── mod.rs                     [B] FinetuneCommand enum + dispatcher
│       │           ├── init.rs                    [B] scaffold workflow, create DB row
│       │           ├── sources.rs                 [B] URI resolve + spawn extractors
│       │           ├── import_records.rs          [B] import pre-built records
│       │           ├── plan.rs                    [B] spawn relation_builder + grader_drafter(init)
│       │           ├── generate.rs                [B] spawn record_generator + grader_drafter(finalize)
│       │           ├── eval.rs                    [B] run gateway eval; spawn grader_drafter(refine) on fail
│       │           ├── train.rs                   [B] start GRPO + spawn training_monitor
│       │           ├── status.rs                  [B] read journal; print next command
│       │           ├── quickstart.rs              [B] wizard
│       │           ├── auto.rs                    [B] autonomous loop
│       │           │
│       │           ├── jobs/                      [A] Layer B `jobs <verb>` wrappers over gateway routes
│       │           │   ├── mod.rs                 [A] JobsCommand enum + dispatcher
│       │           │   ├── status.rs              [A] `jobs status`
│       │           │   ├── knowledge.rs           [A] `jobs knowledge add`
│       │           │   ├── records.rs             [A] `jobs records import/generate`
│       │           │   ├── grader.rs              [A] `jobs grader import/generate/dryrun`
│       │           │   ├── eval.rs                [A] `jobs eval run/stop`
│       │           │   ├── train.rs               [A] `jobs train run/stop`
│       │           │   └── test_job.rs            [A] `jobs test-job`
│       │           │
│       │           └── workers/                   [B] claude -p subprocess orchestrators
│       │               ├── mod.rs
│       │               ├── claude_client.rs       [B] shared subprocess + stream-JSON parser
│       │               ├── knowledge_extractor.rs [B]
│       │               ├── relation_builder.rs    [B]
│       │               ├── trace_analyzer.rs      [B]
│       │               ├── record_generator.rs    [B]
│       │               ├── grader_drafter.rs      [B] three modes: init / finalize / refine
│       │               └── training_monitor.rs    [B] long-running; polls gateway
│       │
│       └── setup/                                 [C] Feature 005 idempotent machine setup (invoked from main.rs)
│           ├── mod.rs                             [C] SetupStatus, ensure_plugin_symlink(), claude_readiness()
│           ├── plugin_symlink.rs                  [C] idempotent symlink ~/.claude/plugins/vllora-finetune
│           └── claude_readiness.rs                [C] non-fatal `claude` CLI + auth readiness probe
│
├── finetune/                                      → reusable crate (state + adapters + prompt assets)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                                 [A] re-exports: state, sources_adapters, prompts
│       ├── client.rs, types.rs                    existing LangdbCloudFinetuneClient
│       │
│       ├── state/                                 [A] Feature 002 artifact state machine
│       │   ├── mod.rs                             [A] Journal / Analysis / ChangeLog / ExecutionLog traits
│       │   ├── journal.rs                         [A] pipeline-journal.json read/write
│       │   ├── analysis.rs                        [A] analysis.json append-only
│       │   ├── change_log.rs                      [A] change-log.md append-only
│       │   ├── execution_log.rs                   [A] execution-log.md decision cards
│       │   ├── atomic_write.rs                    [A] write-tmp + fsync + rename helper
│       │   ├── lock.rs                            [A] single-writer advisory lock
│       │   └── schemas/
│       │       ├── journal.schema.json            [A] JSON Schema for pipeline-journal.json
│       │       └── analysis.schema.json           [A] JSON Schema for analysis.json
│       │
│       ├── sources_adapters/                      [B] URI resolvers (workers only see local paths)
│       │   ├── mod.rs                             [B] SourceAdapter trait
│       │   ├── local.rs                           [B] file:// and bare paths
│       │   ├── hf.rs                              [B] hf://
│       │   ├── s3.rs                              [B] s3://
│       │   ├── gs.rs                              [B] gs://
│       │   ├── azblob.rs                          [B] azblob://
│       │   └── https.rs                           [B] https://
│       │
│       └── prompts/                               [B] claude -p system-prompt templates
│           ├── knowledge-extractor.md             [B]
│           ├── relation-builder.md                [B]
│           ├── trace-analyzer.md                  [B]
│           ├── record-generator.md                [B]
│           ├── grader-drafter-init.md             [B]
│           ├── grader-drafter-finalize.md         [B]
│           ├── grader-drafter-refine.md           [B]
│           └── training-monitor.md                [B]
│
├── core/, guardrails/, llm/, telemetry/           other workspace crates (existing)
│
├── finetune-skill/scripts/                        deterministic Python helpers the Rust CLI shells out to
│   ├── validate_records.py                        [B] records schema/shape validation
│   ├── data_quality_gate.py                       [B] composition / diversity gate
│   ├── derive_ground_truth.py                     [B] GT derivation from traces
│   ├── probe_difficulty.py                        [B] K=1 zero-variance probe
│   ├── analyze_training.py                        [B] post-train analysis
│   └── (existing files, unchanged in scope)
│
├── plugin/                                        [C] Claude Code plugin bundle
│   ├── plugin.json                                [C] `vllora-finetune` manifest
│   ├── README.md                                  [C]
│   │
│   ├── commands/
│   │   ├── finetune.md                            [C] ORCHESTRATOR (§2.3.1, §7.3.1)
│   │   ├── finetune-init.md                       [C] thin
│   │   ├── finetune-sources.md                    [C] thin
│   │   ├── finetune-import-records.md             [C] thin
│   │   ├── finetune-plan.md                       [C] thin
│   │   ├── finetune-generate.md                   [C] thin
│   │   ├── finetune-eval.md                       [C] thin
│   │   ├── finetune-train.md                      [C] thin
│   │   ├── finetune-status.md                     [C] thin
│   │   └── finetune-quickstart.md                 [C] thin
│   │
│   ├── skills/                                    [C] auto-loaded reference skills
│   │   ├── pipeline-context/SKILL.md              [C]
│   │   ├── grader-writing/SKILL.md                [C] migrate from reference/grader-writing.md
│   │   ├── topic-hierarchy/SKILL.md               [C]
│   │   ├── readiness-gate/SKILL.md                [C]
│   │   └── nemo-guide/SKILL.md                    [C]
│   │
│   └── resources/
│       ├── templates/                             [C] markdown templates
│       └── reference/                             [C] long-form docs
│
├── ui/                                            [C] React/TypeScript UI (existing)
│   └── src/components/finetune/                   [C] Feature 006 consumers of analysis.json
│
└── tests/
    ├── contract/                                  [A] state-file precision tests + gateway route contract tests
    ├── integration/                               [B] pipeline integration tests
    └── unit/                                      per-track unit tests
```

**Distribution.** The Rust workspace produces a single `vllora` binary. End users install via a maturin-built pip wheel (like `ruff` / `uv`): `pip install vllora` and `pip install vllora[finetune]`. `vft` is an optional thin wrapper that execs `vllora finetune …`.

---

## 4. Track A — Artifacts & Storage (detail)

**Theme:** own everything about state — where it lives, how it's written, how it's queried. Be the "storage layer" the other tracks depend on.

### 3.1 Scope

- **State-file helpers** (§4.7): atomic writes, single-writer discipline, append-only semantics, schema validation, crash recovery.
- **Schemas**: `pipeline-journal.json`, `analysis.json`, `change-log.md` entry format.
- **Gateway SQLite**: all table definitions (§4.2), migrations, indices.
- **Gateway API**: workflow-scoped job routes (§2.7) — POST /workflows, POST /jobs, GET /jobs/{id}/status, POST /jobs/{id}/cancel.
- **Gateway HTTP client**: Python client used by Track B's CLI verbs.
- **Layer B job ops** (§2.4): implement `jobs knowledge add`, `jobs records import/generate`, etc. — these are thin CLI wrappers over the gateway routes.
- **Contract tests**: atomic-write, single-writer, append-only, schema validity, crash recovery (§4.7.5).

### 3.2 Interface contracts this track EXPOSES

Track B depends on these being implemented and stable:

```rust
// finetune/src/state/mod.rs — traits re-exported at crate root
pub trait Journal {
    fn read(&self) -> Result<JournalSnapshot>;
    fn write_step_start(&self, step: &str, pid: u32) -> Result<()>;
    fn write_step_done(&self, step: &str, fields: serde_json::Value) -> Result<()>;
    fn write_step_failed(&self, step: &str, error: &str) -> Result<()>;
    fn write_step_iteration(&self, step: &str, i: u32, fields: serde_json::Value) -> Result<()>;
    fn is_phase_done(&self, step: &str) -> Result<bool>;
    fn current_step(&self) -> Result<Option<String>>;
    fn schema_version(&self) -> u32;
}

pub trait Analysis {
    fn append_phase(&self, phase: &str, content: serde_json::Value) -> Result<()>; // additive-only
    fn augment_phase(&self, phase: &str, additions: serde_json::Value) -> Result<()>;
    fn read_phase(&self, phase: &str) -> Result<Option<serde_json::Value>>;
    fn read_full(&self) -> Result<serde_json::Value>;
}

pub trait ChangeLog {
    fn append(&self, author: &str, rationale: &str, diff: &str) -> Result<()>;
}

pub trait ExecutionLog {
    fn append(&self, observation: &str, analysis: &str, decision: &str, evidence: &str) -> Result<()>;
}

// gateway-client lives in vllora_finetune::client (existing crate).
// LangdbCloudFinetuneClient already exposes ~29 async methods covering:
//   create_workflow, upload_source_documents, upload_knowledge_parts,
//   upload_topics, upload_records, upload_grader,
//   create_eval_run, poll_eval_run, cancel_eval,
//   create_training_job, poll_training_metrics, cancel_training,
//   …
// Feature 002 extends it with `origin_uri` + `change_reason` fields per parent §4.2.
```

### 3.3 Track A deliverables checklist

- [ ] `finetune/src/state/atomic_write.rs` + tests
- [ ] `finetune/src/state/lock.rs` (single-writer advisory lock) + tests
- [ ] `finetune/src/state/journal.rs` + tests
- [ ] `finetune/src/state/analysis.rs` + tests
- [ ] `finetune/src/state/change_log.rs` + tests
- [ ] `finetune/src/state/execution_log.rs` + tests
- [ ] `finetune/src/state/schemas/journal.schema.json`
- [ ] `finetune/src/state/schemas/analysis.schema.json`
- [ ] `finetune/src/lib.rs` — re-export `state`, `sources_adapters`, `prompts`
- [ ] `finetune/src/client.rs` — extend `LangdbCloudFinetuneClient` for `origin_uri` / `change_reason` (existing crate)
- [ ] Gateway route: `POST /v1/finetune/workflows` (workflow-scoped, reuse existing `workflows.rs`)
- [ ] Gateway route: `POST /v1/finetune/workflows/{id}/jobs`
- [ ] Gateway route: `GET /v1/finetune/workflows/{id}/jobs/{id}/status`
- [ ] Gateway route: `POST /v1/finetune/workflows/{id}/jobs/{id}/cancel`
- [ ] Gateway SQL migration with all 12 tables (§4.2) — ADD `origin_uri`, `origin_source_id`, `idempotency_key` columns
- [ ] `gateway/src/cli/commands/finetune/jobs/*.rs` — Layer B CLI wrappers (stubs exist; wire to client)
- [ ] Contract tests (§4.7.5 all 5 properties)
- [ ] Documentation in crate-level rustdoc + per-module `//!` headers

---

## 5. Track B — CLI + Workers (detail)

**Theme:** the pipeline. Implement every `vllora finetune <verb>` + the workers that do the LLM-heavy lifting. This is the biggest track.

### 4.1 Scope

- **Pipeline verbs** (§5): init, sources, import-records, plan, generate, eval, train, status, quickstart, auto.
- **Workers** (§6.5): 6 worker modules + shared `claude_client.rs`.
- **Prompts** (§6.3): per-worker system prompts in `finetune/src/prompts/*.md`.
- **URI adapters** (§4.5): 6 scheme handlers.
- **Power-user utilities** (§2.3): cancel, log-step, grader-sanity-check, probe-difficulty, etc.
- **Existing scripts integration**: today's `finetune-skill/scripts/*.py` keep working; Rust verbs shell out to them.

### 4.2 Interface contracts this track DEPENDS ON (from Track A)

- All of `vllora_finetune::state::*` (journal, analysis, change_log, execution_log).
- `vllora_finetune::client::LangdbCloudFinetuneClient` (existing) extended with the new fields.
- JSON schemas for runtime validation.

### 4.3 Interface contracts this track EXPOSES (to Track C)

Stable CLI surface — plugin commands shell out to these. Contract:

| Verb | Args | stdout format | Exit codes |
|---|---|---|---|
| `vllora finetune init <obj>` | objective (positional) | stream-JSON + "Scaffolded. Workflow: <uuid>. Next: /finetune-sources" | 0 OK, 2 precondition |
| `vllora finetune sources <paths-or-uris...>` | paths or URIs (positional, variadic) | stream-JSON progress + "Extracted N PDFs, M traces. Next: /finetune-plan" | 0, 1, 2 |
| ... | ... | ... | ... |

(Full matrix in §5 of parent spec.)

**stream-JSON format** (for plugin parsing):
```jsonl
{"type":"progress","phase":"sources","message":"Extracted PDF 3/12","pct":25}
{"type":"worker_start","worker":"knowledge_extractor","doc":"refund-policy.pdf"}
{"type":"worker_done","worker":"knowledge_extractor","doc":"refund-policy.pdf","parts":14}
{"type":"phase_done","phase":"sources","next":"/finetune-plan"}
```

### 4.4 Track B deliverables checklist

- [ ] `gateway/src/cli/commands/finetune/workers/claude_client.rs` + tests
- [ ] `gateway/src/cli/commands/finetune/workers/*.rs` — 7 worker modules + tests each
- [ ] `finetune/src/prompts/*.md` — 8 prompt files with §6.3 template
- [ ] `finetune/src/sources_adapters/*.rs` — 6 adapters + tests
- [ ] `gateway/src/cli/commands/finetune/init.rs` + integration test
- [ ] `gateway/src/cli/commands/finetune/sources.rs` + integration test
- [ ] `gateway/src/cli/commands/finetune/import_records.rs` + integration test
- [ ] `gateway/src/cli/commands/finetune/plan.rs` + integration test
- [ ] `gateway/src/cli/commands/finetune/generate.rs` + integration test
- [ ] `gateway/src/cli/commands/finetune/eval.rs` + integration test
- [ ] `gateway/src/cli/commands/finetune/train.rs` + integration test
- [ ] `gateway/src/cli/commands/finetune/status.rs` + tests
- [ ] `gateway/src/cli/commands/finetune/quickstart.rs` + tests
- [ ] `gateway/src/cli/commands/finetune/auto.rs` + tests
- [ ] Power-user utilities — shell out to existing `finetune-skill/scripts/*.py` for v0
- [ ] stream-JSON output emission in every verb
- [ ] E2E integration test: run `quickstart` on fixture → adapter produced

---

## 6. Track C — Plugin + Install + UI (detail)

**Theme:** everything the user directly interacts with — chat surfaces, setup, UI.

### 5.1 Scope

- **Claude Code plugin** (§7): orchestrator + 9 thin commands + 5 reference skills + resources.
- **Install flow** (§2.8, §10): `vllora init`, `vllora doctor`, `vllora uninstall`, `vllora upgrade`.
- **Gateway / UI ops** (§2.8): `vllora gateway start/stop/...`, `vllora ui start/...`.
- **UI updates**: consume new `analysis.json` structure, surface grader-refine diffs, eval iteration UI, training metrics.
- **Top-level CLI entrypoints**: `vllora` and `vft`.

### 5.2 Interface contracts this track DEPENDS ON

**From Track A:**
- `analysis.json` schema — UI reads this.
- Gateway DB fields in `workflows.analysis_json`, `workflows.trace_meta_json` — UI reads via gateway API.
- Gateway API routes (for UI polling).

**From Track B:**
- stable CLI verb args + stream-JSON output format.
- exit code semantics (so plugin commands can interpret success/fail).

### 5.3 Interface contracts this track EXPOSES

**To user:** every `/finetune-*` plugin command + the orchestrator.

**To other tracks:** `pyproject.toml` entrypoints (`vllora`, `vft`). This is how all the Track B CLI code becomes executable.

### 5.4 Track C deliverables checklist

**Plugin:**
- [ ] `plugin/plugin.json` manifest
- [ ] `plugin/commands/finetune.md` — orchestrator (use §7.3.1 template)
- [ ] `plugin/commands/finetune-<verb>.md` × 9 — thin wrappers (use §7.3.2 template)
- [ ] `plugin/skills/pipeline-context/SKILL.md`
- [ ] `plugin/skills/grader-writing/SKILL.md` (migrate existing `reference/grader-writing.md`)
- [ ] `plugin/skills/topic-hierarchy/SKILL.md` (migrate existing)
- [ ] `plugin/skills/readiness-gate/SKILL.md` (migrate existing)
- [ ] `plugin/skills/nemo-guide/SKILL.md` (migrate existing)
- [ ] `plugin/resources/templates/*` — templates
- [ ] `plugin/resources/reference/*` — long-form docs

**CLI lifecycle:**
- [ ] `gateway/src/main.rs` — CLI dispatch (done; keep in sync when adding verbs)
- [ ] `gateway/src/cli/mod.rs` — clap `Commands` enum (done; extend as needed)
- [ ] `gateway/src/setup/plugin_symlink.rs` — idempotent `~/.claude/plugins/vllora-finetune` symlink
- [ ] `gateway/src/setup/claude_readiness.rs` — non-fatal probe: `claude` CLI on PATH + auth configured
- [ ] `gateway/src/cli/commands/doctor.rs` — diagnostic report aggregating `SetupStatus`
- [ ] `gateway/src/cli/commands/version.rs` — print `vllora` version + build info
- [ ] `gateway/src/cli/commands/config.rs` — `vllora config get/set`
- [ ] Gateway start/stop/logs — reuse existing `serve` command + systemd / launchctl wrappers in the pip wheel
- [ ] `vft` optional thin wrapper script in the pip wheel
- [ ] `pyproject.toml` with `[project.scripts]` entries pointing to the maturin-built binary

**UI (in `src/`):**
- [ ] Consume new `analysis.json` fields (workflow.analysis_json from gateway)
- [ ] Surface grader `change-log.md` + per-iteration diffs
- [ ] Show training_monitor report
- [ ] Show per-phase status from journal
- [ ] (See existing ui repo for component patterns)

**Distribution:**
- [ ] `pyproject.toml` packages + dependencies
- [ ] Gateway binary download logic (`vllora init`)
- [ ] Plugin symlink logic (`vllora init`)
- [ ] Doctor checklist (Claude auth, Python version, port 9090, claude CLI, etc.)

---

## 7. Shared contracts (write these FIRST, before anyone else codes)

These are the files all three tracks depend on. Land them **before** diverging so the signatures are stable:

1. **`finetune/src/state/schemas/journal.schema.json`** — Track A writes; B + C consume.
2. **`finetune/src/state/schemas/analysis.schema.json`** — Track A writes; B + C consume.
3. **`finetune/src/state/mod.rs`** — public trait surface (`Journal`, `Analysis`, `ChangeLog`, `ExecutionLog`); Track B imports.
4. **`finetune/src/lib.rs` re-exports** — makes `state`, `sources_adapters`, `prompts` reachable at crate root; Track B imports.
5. **Extensions to `vllora_finetune::client::LangdbCloudFinetuneClient`** — add `origin_uri`, `origin_source_id`, `idempotency_key`, `change_reason` fields; Track B consumes.
6. **CLI verb contract matrix** — Track B defines args + stdout format per verb; Track C's plugin `.md` files reference it.
7. **stream-JSON event taxonomy** — Track B emits; Track C's plugin parses.

Each of these should land as a trait / schema / stub on day 1 with `unimplemented!()` bodies or `TODO` markers. Once the contracts compile, all three tracks can proceed independently. Freezing them later risks costly merges.

---

## 8. Dependency-ordered work

Work is ordered by **what must exist before what can start**, not by calendar. Each block lists prerequisites; anything without prerequisites can start immediately and proceed in parallel with other independent blocks.

### Block 0 — Shared contracts (blocks everything else)

**Prereq:** none.
**Gates:** all other blocks below.

All three tracks jointly land §7 contracts:
- `finetune/src/state/schemas/journal.schema.json` + `analysis.schema.json`
- Trait signatures in `finetune/src/state/mod.rs`
- `GatewayClient` trait (whether new or extending `vllora_finetune::LangdbCloudFinetuneClient`)
- CLI verb contract matrix (args, stdout format, exit codes per verb)
- stream-JSON event taxonomy

**Done = definitions exist, signatures compile, all three engineers sign off.** After this, changes require all-hands approval; parallel work starts.

---

### Track A — Storage + gateway-side

#### A.1 Local state helpers  
**Prereq:** Block 0 schemas.  
`atomic_write`, `Journal`, `Analysis`, `ChangeLog`, `ExecutionLog` impls in `finetune/src/state/`. Contract tests pass (atomic-write, single-writer, append-only, schema, crash-recovery).

#### A.2 Gateway schema extensions  
**Prereq:** none (parallel with A.1).  
- Add `idempotency_key: Option<String>` to `CreateJobRequest` / `CreateFinetuneJobRequest` in `finetune/src/types.rs`.
- Add `origin_uri` + `origin_source_id` columns to records table + migration.
- Audit `GatewayApiError` variants for the 5 error codes (INVALID_REQUEST / NOT_FOUND / UNAUTHORIZED / FORBIDDEN / CONFLICT).

#### A.3 Layer B CLI wrappers  
**Prereq:** A.1 (for state mirror) + A.2 (idempotency) + Track B Block B.1 worker client stub (doesn't need to be fleshed out, just exist).  
Implement `gateway/src/cli/commands/finetune/jobs/*.rs` — thin wrappers over `vllora_finetune::LangdbCloudFinetuneClient` methods with new idempotency_key / only_tracking flags.

---

### Track B — CLI pipeline verbs + workers

#### B.1 `claude_client` subprocess wrapper  
**Prereq:** Block 0 stream-JSON taxonomy.  
`gateway/src/cli/commands/finetune/workers/claude_client.rs` — spawn `claude -p`, parse stream-JSON, enforce max-turns + allowed-tools. Single reference worker (`knowledge_extractor`) implemented as the template.

**Gates:** every other worker + every pipeline verb.

#### B.2 Remaining workers  
**Prereq:** B.1.  
`relation_builder`, `trace_analyzer`, `record_generator`, `grader_drafter` (3 modes), `training_monitor`. Each uses the shared client. Workers independent of each other — implement in parallel.

#### B.3 URI adapters  
**Prereq:** none (parallel with B.1, B.2).  
`finetune/src/sources_adapters/*` — 6 schemes. Local first (no auth); hf + s3 next; gs/azblob/https as follow-on.

#### B.4 Pipeline verbs  
**Prereq:** A.1 state + A.3 Layer B wrappers + B.1 claude_client (B.2 fleshed out ≥ 1 worker).  
`gateway/src/cli/commands/finetune/<verb>.rs`:
- **`init`, `status`, `quickstart`** — no workers, pure orchestration. Can land early.
- **`sources`** — needs knowledge_extractor + trace_analyzer + at least local URI adapter.
- **`plan`** — needs relation_builder + grader_drafter(init).
- **`generate`** — needs record_generator + grader_drafter(finalize) + existing Python quality-gate script.
- **`eval`** — needs existing Python eval script + grader_drafter(refine) on fail.
- **`train`** — needs training_monitor + existing Python training-invocation script.
- **`import-records`** — no workers.
- **`auto`** — wraps `status` + dispatches to next verb; ship last.

#### B.5 Wire into CLI root  
**Prereq:** B.4 at least has `status` + `init` working.  
Add `Commands::Finetune(FinetuneCommand)` variant in `gateway/src/cli/mod.rs`; add dispatch arm in `gateway/src/main.rs`. **One-line change per file.** Do it as soon as any verb is testable.

---

### Track C — Plugin + install + UI

#### C.1 `setup/` module  
**Prereq:** none (parallel with everything).  
`gateway/src/setup/plugin_symlink.rs` + `claude_readiness.rs`. Idempotent; called from `main.rs` right after `get_db_pool()`. Trivially independent of other tracks.

#### C.2 `doctor`, `version`, `config` commands  
**Prereq:** C.1 (doctor consumes `claude_readiness()`).  
`gateway/src/cli/commands/doctor.rs` + `version.rs` + `config.rs` + wire into `Commands` enum.

#### C.3 Plugin thin verb commands  
**Prereq:** Track B's CLI verbs minimally exist (enough for plugin to shell out and get a reasonable response).  
Flesh out `plugin/commands/finetune-<verb>.md` — each is ~30–80 lines of markdown, ships per-verb as its CLI counterpart lands.

#### C.4 Reference skills  
**Prereq:** none (parallel with everything).  
Migrate content from `ui/finetune-skill/reference/grader-writing.md`, `topic-hierarchy.md`, `readiness-gate.md`, `nemo-guide.md` to `plugin/skills/<name>/SKILL.md` with frontmatter. Content preserved; format adjusted.

#### C.5 Orchestrator command  
**Prereq:** C.3 thin commands exist (orchestrator invokes CLI directly but design references thin commands).  
`plugin/commands/finetune.md` — ~100–150 lines of agent playbook per §7.3.1 template.

#### C.6 pip-wheel packaging  
**Prereq:** at least one end-to-end run works (any verb, any worker).  
`pyproject.toml` + maturin CI + per-platform wheel builds.

#### C.7 UI components  
**Prereq:** A.2 columns (`origin_uri`) + any new endpoints that surface `workflows.iteration_state` to UI.  
New: `GraderHistoryPanel`, `EvalIterationList`, `MonitorReportRenderer`, `RemediationMessage` in `ui/src/components/finetune/`. Update existing `PipelineCanvas`, `FinetuneJobsPanel` to consume `analysis.json` mirror.

---

### Critical path (longest dependency chain)

```
Block 0 (contracts)
   │
   ├──▶ A.1 state helpers ──▶ A.3 Layer B wrappers ─┐
   │                                                 │
   ├──▶ B.1 claude_client ──▶ B.2 workers ─────────┐│
   │                                                ││
   └──▶ B.3 URI adapters ──────────────────────────┤│
                                                    ││
                                                    ▼▼
                              B.4 pipeline verbs ──▶ B.5 wire into CLI ──▶ end-to-end usable
                                    │
                                    ▼
                              C.3 plugin thin cmds ──▶ C.5 orchestrator ──▶ chat UX complete
```

Track C items **C.1, C.2, C.4** have zero upstream dependencies — they can land immediately.

### Done conditions (what "done" looks like, not when)

- **Gate 1 — First verb works end-to-end:** Block 0 + A.1 + A.3 (minimal) + B.1 + one B.2 worker + B.4 `status` + `init` + B.5. User can run `vllora finetune init "..."` → `vllora finetune status` and see workflow created in DB.
- **Gate 2 — First full pipeline run:** + remaining B.2 workers + B.3 local adapter + B.4 `sources`/`plan`/`generate`/`eval`/`train`. User can run the full chain end-to-end on tau-retail fixture.
- **Gate 3 — Chat UX complete:** + Gate 2 + C.3 thin commands + C.5 orchestrator + C.1/C.2 setup+doctor. User can type `/finetune` in Claude Code and the orchestrator drives it.
- **Gate 4 — Shippable:** + Gate 3 + C.6 pip wheel + C.7 UI updates + all contract tests green. `pip install vllora` on a fresh machine leads to a trained adapter.

---

## 9. Coordination

- **Daily sync (10 min, optional):** blockers + cross-track handoffs. Skip if nothing crosses track boundaries that day.
- **Contract change review:** any change to Block 0 artifacts (schemas, trait signatures, stream-JSON taxonomy) after they're landed requires all-hands approval.
- **Demo when a gate lands:** Gate 1, 2, 3, 4 above. Announce + demo. Not weekly; gate-driven.
- **Shared issue tracker:** label issues by track. Cross-track blockers get priority.

---

## 10. How to handle blocked state

If Track B needs `Journal.write_step_done()` and Track A hasn't implemented it yet:

1. Track B imports from the stub (`NotImplementedError` is fine for now).
2. Track B writes its code against the declared signature.
3. Track B mocks Track A's module in its tests.
4. When Track A lands the real implementation, Track B's tests verify the integration works.

This is the **design-by-contract** pattern. Stubs + signatures on day 1 mean no track ever truly blocks on another.

---

## 11. Open questions to resolve before/during implementation

Not blocking but worth agreeing early:

1. **Plugin source repo location** — move `finetune-skill/` from `vllora/ui/` to `vllora/vllora/plugin/` in the vllora repo (see parent §11 Q1). Track C resolves this before packaging.
2. **Gateway binary distribution** — pre-built wheels vs download-on-init? Track C decides.
3. **Claude Code plugin manifest schema** — verify `plugin.json` fields against current Claude Code plugin loader. Track C verifies in week 1.
4. **`claude -p` prompt caching** — measure cache hit rate under real pipeline load. Track B measures in week 2 (§11 Q11).
5. **Run-replay contract test** — build fixture from existing monolithic-SKILL run; Track A + Track B coordinate in week 3.

---

## 12. Minimum viable deliverable

If time is tight, ship this subset first:

- Track A: state helpers + gateway routes (DB can be a simpler schema at first; add fields as needed).
- Track B: `init`, `sources` (local paths only), `plan`, `generate`, `eval`, `train`, `status`. Skip `import-records`, `quickstart`, `auto`, URI adapters beyond local.
- Track C: `vllora init` + thin verb plugin commands only. Skip orchestrator (`/finetune`). Skip UI updates.

This gives a working pipeline on the command line, with Claude Code thin-verb integration, and no fancy features. Orchestrator + URI adapters + UI polish come in iteration 2.

---

## 13. Next step for the team

1. **Read this doc + the parent spec + the spec-kit constitution** — everyone on the same page on architecture and principles.
2. **Pick tracks** — assign owners. If Track B's size is intimidating, split `finetune/` vs `workers/` into two subtracks inside Track B.
3. **Write the shared contracts (§7)** — 2–3 hours of joint work. Creates the stubs that spec-kit features then flesh out.
4. **Run `/speckit.tasks` on Feature 001** — coworker's already drafted spec + plan. Generate tasks.md + GitHub issues via `/speckit.taskstoissues`.
5. **Draft stub specs for Features 002–005** in the spec-kit repo — one per remaining track chunk. Each track owner runs `/speckit.specify` on their feature, then `/speckit.clarify → /speckit.plan → /speckit.tasks`.
6. **Start parallel work** on the resulting GitHub issues.

Ping me when contracts are frozen and I can review the first round of stubs + call out any interface mismatches.
