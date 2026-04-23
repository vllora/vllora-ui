# Gap Analysis — what exists in `vllora/` vs what we're building

**Created:** 2026-04-23
**Parent design:** [`finetune-skill-command-redesign.md`](./finetune-skill-command-redesign.md)
**Implementation plan:** [`implementation-plan.md`](./implementation-plan.md)
**Per-feature specs:** `finetune-workflow-speckit/specs/001-006/`

Previous iterations of the plan over-scoped the work because I didn't check what already exists in the `vllora/` Rust repo. This document grounds the work in reality: **most of the infrastructure is already built.** Our work is mostly adding a **CLI surface + plugin** over it, plus genuinely new client-side pieces (`claude -p` workers, local state files, URI adapters).

---

## 1. What already exists in `vllora/`

### 1.1 `finetune/` crate (`vllora_finetune` v0.1.23)

Full cloud client with **29 async methods** — wraps the langdb cloud finetune API. `src/client.rs`, `src/types.rs`.

**Client methods (existing):**
- `upload_dataset`, `upload_dataset_chunked`
- `create_job`, `estimate_job`, `get_job_status`
- `create_evaluation`, `get_finetune_evaluations`, `get_finetune_evaluations_metrics`
- `create_finetune_job`, `get_finetune_job_status`, `cancel_finetune_job`, `resume_finetune_job`
- `get_finetune_job_metrics`, `get_finetune_job_infra_metrics`, `report_finetune_job_checkpoint_step`
- `get_finetune_job_models`, `list_finetune_jobs`
- `get_evaluation_result`, `get_workflow_evaluation_metrics`
- `get_workflow_evaluator_versions`, `update_workflow_evaluator`
- `get_dataset_analytics`, `dry_run_dataset_analytics`, `dry_run_workflow_evaluator`
- `deploy_model`, `delete_deployment`, `get_weights_download_url`

**Types (existing, 50+):** `CreateJobRequest`, `CreateFinetuneJobRequest`, `FinetuneTrainingConfig`, `FinetuneInferenceParameters`, `BaseModel`, `JobType`, `GrpoLossType`, `ImportanceSamplingLevel`, `ScaleRewards`, `UnifiedJobStatusResponse`, `EvaluationSummary`, `EvaluationResultResponse`, `UploadDatasetResponse`, `DatasetAnalyticsResponse`, `FinetuningJobResponse`, `DeploymentResponse`, `WeightsDownloadUrlResponse`, `Evaluator<T>`, `LlmAsJudgeConfig<T>`, `JsConfig`, etc.

### 1.2 Gateway HTTP routes (`gateway/src/handlers/*`)

Mounted under `/finetune/workflows`. **Routes that already exist** (per `gateway/src/http.rs`):

```
/finetune/workflows                    GET, POST              (list, create)
/finetune/workflows/{wf_id}            GET, PUT, DELETE       (get, update, soft-delete)
/finetune/workflows/{wf_id}/records    GET, POST, PUT, DELETE (list, add, replace, delete-all)
  + /records/count, /counts-by-topic, /summary, /exists
  + /records/topics (batch-update, clear, rename-topic)
  + /records/topics/{topic_id} (clear one topic)
  + /records/{record_id} (update/delete/update-data)
  + /records/scores
/finetune/workflows/{wf_id}/logs       GET, POST               (workflow logs)
/finetune/workflows/{wf_id}/journal    GET, POST               (workflow journal — ALREADY EXISTS)
/finetune/workflows/{wf_id}/topics     GET, POST, PUT, DELETE
  + /topics/relations (GET, POST, PUT, DELETE)
/finetune/workflows/{wf_id}/knowledge  GET, POST, PUT, DELETE  (knowledge sources)
  + /knowledge/count, /search, /chunk, /trace, /trace/{trace_id}, /{ks_id}, /{ks_id}/file
```

**Handler file sizes:**
- `handlers/finetune.rs` — 1561 lines, 28 public async fns
- `handlers/workflows.rs` — 395 lines, 15 public async fns
- `handlers/workflow_records.rs`, `handlers/workflow_topics.rs`, `handlers/workflow_logs.rs`, `handlers/knowledge_sources.rs`, `handlers/eval_jobs.rs`, `handlers/trace_analysis.rs`, `handlers/trace_bundles.rs`, `handlers/agents.rs`, `handlers/threads.rs`, `handlers/session.rs`, `handlers/projects.rs`, `handlers/debug.rs`, `handlers/models.rs` — all present

**State trackers:**
- `gateway/src/finetune_state_tracker.rs` — 275 lines
- `gateway/src/eval_state_tracker.rs` — 239 lines
- `gateway/src/agents.rs` — 819 lines (agent orchestration)

### 1.3 Gateway CLI (`gateway/src/cli/*`)

Existing clap-based CLI. Binary name: `vllora`.

**Existing subcommands** (per `cli/mod.rs` `Commands` enum):
- `Serve(ServeArgs)` — default; starts API server
- `List` — list models from DB
- `Sync { models, providers }` — sync models/providers
- `Traces(TracesCommands)` — nested subcommand tree (`list`, `call-info`, `overview`, `run-info`)
- `GenerateModelsJson { output }` — hidden

**No finetune subcommand exists yet.** `vllora finetune <verb>` is the genuinely new surface.

### 1.4 Python pipeline scripts (`ui/finetune-skill/scripts/`)

**34 scripts** implementing current pipeline logic:

`analyze_training.py`, `build_knowledge_parts.py`, `camelot_extract_tables.py`, `chat_completion.py`, `checkpoint.py`, `consolidate_parts.py`, `convert_nemo_rows.py`, `convert_pdf_to_markdown.py`, `data_quality_gate.py`, `deduplicate_records.py`, `derive_ground_truth.py`, `dry_run_grader.py`, `extract_router.py`, `finetune.py`, `generate_records.py`, `grader_discriminate.py`, `grader_from_traces.py`, `odl_extract.py`, `odl_hybrid_backend.py`, `otel_extract.py`, `paraphrase_rare_topics.py`, `pdftotext_extract.py`, `pipeline_journal.py`, `print_metrics_table.py`, `probe_difficulty.py`, `prune_trivial_families.py`, `reward_calibrate.py`, `run_evaluation.py`, `start_training.py`, `trace_analyze.py`, `upload_trace_analysis.py`, `validate_dataset.py`, `validate_extraction.py`

These implement the current monolithic pipeline. Will be invoked by our new CLI verbs as subprocess targets for deterministic ML/data ops (PDF OCR, GRPO invocation, quality gates, etc.) — we don't rewrite them.

### 1.5 UI components (`ui/src/components/finetune/`)

**Existing:** `PipelineCanvas.tsx`, `PipelineStepCard.tsx`, `FinetuneJobsPanel.tsx`, `FinetuneJobStatusBadge.tsx`, `FinetuneMetricsChart.tsx`, `TrainingMetricsChart.tsx`, `ClippingAlertBanner.tsx`, `HealthIndicator.tsx`, `training-metrics-insights.ts`, plus `content/` subdirectory.

### 1.6 Existing plugin / skill

`ui/finetune-skill/` — **the monolithic SKILL.md** (443 lines) + agent definitions + reference docs. This is the current Claude Code integration point.

---

## 2. Per-feature gap analysis

For each of the 6 features in the spec-kit repo, what's already there and what's genuinely new.

### Feature 001 — `job-based-cli-api`

**Existing (substantial):**
- Workflow-scoped routes under `/finetune/workflows/*` already mounted.
- Journal endpoints already exist (`POST /finetune/workflows/{wf_id}/journal`).
- Finetune job lifecycle endpoints already exist (via `gateway/src/handlers/finetune.rs`).
- `vllora_finetune::LangdbCloudFinetuneClient::create_job`, `get_job_status`, `cancel_finetune_job` already implemented.
- State trackers running: `finetune_state_tracker.rs`, `eval_state_tracker.rs`.

**Genuinely new:**
- **Generic `jobs` abstraction** — the spec promises a unified `jobs status --job-id`, `eval run/stop`, `train run/stop` CLI surface. Today, there are separate cloud-specific methods; we need a thin unification layer.
- **`idempotency_key` support on all create_job endpoints** — spec requires it; not sure if backends already honor an `Idempotency-Key` header. **Verify.**
- **`only_tracking` mode** — create-without-streaming flag. May need backend support or CLI-side workaround.
- **Error contract normalization** — spec requires `INVALID_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` response codes. Existing handlers may already emit these via `GatewayApiError`; verify consistency.
- **Workflow-scoped job routes** — spec says `/v1/finetune/workflows/{id}/jobs` + `.../jobs/{id}/status` + `.../jobs/{id}/cancel`. Currently there are direct finetune-job routes; we may need to alias or reshape to match the spec contract.

**Refactors:**
- Possibly add `analysis_json TEXT` + `trace_meta_json TEXT` columns to `workflows` table (for UI consumption per Feature 006 + parent design §4.2).
- Possibly add `origin_uri` + `origin_source_id` columns to `records` table (per parent §4.5 remote source provenance).

**Delta estimate:** moderate. Most endpoints exist; we're standardizing a thin job-unification layer on top.

---

### Feature 002 — `state-and-gateway-client`

**Existing (substantial):**
- `vllora_finetune::LangdbCloudFinetuneClient` IS the gateway client — covers all cloud operations.
- Journal endpoints exist server-side (`/finetune/workflows/{wf_id}/journal`).
- Metadata services: `FinetuneJobService`, `EvalJobService`, `ProjectService`, `ModelService`, `TraceServiceImpl`, etc. — all in `vllora_core::metadata::services`.

**Genuinely new:**
- **Local state files in `finetune-project/` on the user's machine.** The journal endpoint exists server-side, but our design (§4 Artifacts & State) also calls for local JSON files (`pipeline-journal.json`, `analysis.json`, `change-log.md`, `iterations.md`, `execution-log.md`). These are client-side artifacts for local inspection + crash recovery + run-replay. **Currently, `ui/finetune-skill/scripts/pipeline_journal.py` is the existing implementation.** We need Rust equivalents (or keep Python via subprocess — simpler short-term).
- **Atomic-write / single-writer helpers** for the local files (parent §4.7). Not present.
- **JSON schemas** (`journal.schema.json`, `analysis.schema.json`) — not present as formal schemas.
- **Idempotency key + `only_tracking` plumbing** in the HTTP client if not already there.

**Refactors:**
- Consider whether local state helpers live in the existing `finetune/` crate or a new `finetune-state/` crate. Leaning: extend `finetune/` crate since it's the natural home for finetune-related primitives.
- The HTTP client may already cover 95% of Layer B — add small shims for the new `idempotency_key` + `only_tracking` surface.

**Delta estimate:** small to moderate. Main new work: local state file helpers + schemas. Most of the "gateway client" already exists.

---

### Feature 003 — `cli-pipeline-verbs`

**Existing (substantial):**
- **All 34 pipeline scripts** in `ui/finetune-skill/scripts/` — the pipeline logic IS already written in Python.
- The existing monolithic `SKILL.md` orchestrates these scripts via Claude Code.
- `vllora_finetune` client provides all cloud ops (upload, jobs, eval, training).
- Workflow / records / topics / knowledge routes exist on the gateway.

**Genuinely new:**
- **CLI subcommand tree** — `vllora finetune <verb>` doesn't exist. Needs clap `Subcommand` + handler functions following the existing `traces/` pattern.
- **`claude -p` worker orchestration** — currently the pipeline is orchestrated by the monolithic SKILL.md (one Claude Code session). Spec §6 calls for short-lived `claude -p` subprocesses per phase. This is genuinely new; today no Rust code spawns `claude -p`.
- **Worker system prompts** — need to be extracted from today's monolithic SKILL.md + agent definitions into per-worker `.md` prompts per parent §6.3 template.
- **URI adapters** (local / hf / s3 / gs / azblob / https) — not present; all current inputs are local paths. The scripts (e.g., `extract_router.py`) dispatch on local paths only.
- **stream-JSON event emission** from verbs — for the plugin to parse. New protocol.
- **Orchestrator-aware phase composition** — each verb composes existing Python scripts + new workers + existing gateway endpoints.

**Refactors:**
- Likely don't rewrite the 34 Python scripts in Rust — call them as subprocesses (`tokio::process::Command`) from the Rust CLI verbs. The scripts already work; the verb just orchestrates.
- The monolithic SKILL.md's playbook semantics become split across per-verb prompts + the orchestrator plugin command.

**Delta estimate:** **largest track.** New subcommand tree + new workers + new URI adapters + new stream-JSON. But no rewriting of the 34 existing scripts.

---

### Feature 004 — `claude-code-plugin`

**Existing:**
- The monolithic `ui/finetune-skill/SKILL.md` (443 lines) + agent definitions + reference docs under `ui/finetune-skill/reference/`.
- This is NOT a plugin — it's a single skill file. Claude Code plugin format is different.

**Genuinely new (entire feature):**
- **`plugin/` directory bundle** with `plugin.json`, `commands/*.md`, `skills/*/SKILL.md`, `resources/`.
- **1 orchestrator command** (`finetune.md`) that replaces the monolithic SKILL.md.
- **9 thin verb commands** (`finetune-<verb>.md`) — one per pipeline phase.
- **5 reference skills** (`skills/pipeline-context/`, `skills/grader-writing/`, etc.) — migrated from existing `reference/*.md` docs with frontmatter descriptions for auto-load.
- **Plugin manifest schema** — need to verify Claude Code's actual expected format (parent §11 Q3).

**Refactors:**
- Migrate content from `ui/finetune-skill/reference/*.md` to `plugin/skills/*/SKILL.md` — prose mostly preserved, frontmatter added.
- Retire or archive the monolithic SKILL.md after the new plugin ships.

**Delta estimate:** pure file creation; medium volume but no new logic.

---

### Feature 005 — `install-flow`

**Existing:**
- `vllora` binary already exists (gateway binary from `cargo build`).
- `vllora serve` already starts the gateway.
- `vllora list`, `vllora sync`, `vllora traces` already work against the existing DB.

**Genuinely new:**
- **`vllora init`** — one-command setup: prereq checks + gateway start + plugin symlink + (optional) UI start. Today there is no `init` command; users run `cargo build` + `vllora serve` manually.
- **`vllora doctor`** — structured diagnostic. Today no doctor command exists.
- **`vllora uninstall`** — not present.
- **`vllora upgrade`** — not present.
- **`vllora config get/set`** — not present.
- **`vllora gateway start/stop/status/logs/reset`** subcommand tree. Today `serve` is a single command; splitting into lifecycle subcommands is new.
- **`vllora ui start/stop/open`** — not present (UI is served by gateway, not started separately).
- **pip wheel packaging** — bundling the Rust binary into a pip wheel (maturin / cargo-dist). Currently distribution is source-build (`cargo build`).

**Refactors:**
- `vllora serve` stays as-is (backwards compat) but becomes redundant with `vllora gateway start`.
- The existing `ServeArgs` struct can be reused by `gateway start`.

**Delta estimate:** moderate. Mostly new commands added to the existing `Commands` enum + a lot of pip-packaging work for distribution.

---

### Feature 006 — `ui-analysis-integration`

**Existing (substantial):**
- `ui/src/components/finetune/` — **9 existing components** including `PipelineCanvas`, `PipelineStepCard`, `FinetuneJobsPanel`, `FinetuneMetricsChart`, `TrainingMetricsChart`, `ClippingAlertBanner`, `HealthIndicator`.
- Gateway routes already expose workflow data (records, topics, knowledge, journal, logs).
- Existing ahooks-based polling patterns in the UI repo.

**Genuinely new:**
- **`workflows.analysis_json` column** in gateway DB + endpoint that returns it — parent design §4.2 says UI reads this.
- **Grader version history + per-iteration diff** UI — if `graders` table doesn't already version graders with `change_reason` + `is_active`, needs backend addition. **Verify.**
- **Per-iteration eval display with per-model scores** — may need new UI component to surface readiness gate + root cause + grader-refine diff link.
- **Monitor report renderer** — render `monitor-report-{N}.md` Markdown from the training_monitor worker's output. New.

**Refactors:**
- Existing components (`PipelineCanvas`, `PipelineStepCard`) likely need updates to consume new `analysis.json` structure rather than the current data model.
- Polling cadence may need adjustment based on active-workflow detection.

**Delta estimate:** small to moderate. Existing components cover a lot; main additions are grader-history + eval-iteration + monitor-report views.

---

## 3. Delta summary by type

### 3.1 CLI surface

**New subcommand tree to add in `gateway/src/cli/mod.rs`:**

```rust
Commands::Finetune(commands::finetune::FinetuneCommand)  // add variant
Commands::Init(...)                                       // new
Commands::Doctor                                          // new
Commands::Uninstall                                       // new
Commands::Upgrade                                         // new
Commands::Config(...)                                     // new
Commands::Gateway(commands::gateway_lifecycle::GatewayCommand)  // new (wraps existing Serve)
Commands::Ui(commands::ui::UiCommand)                     // new
```

**New module tree to add in `gateway/src/cli/commands/`:**

```
commands/
├── finetune/            NEW — Track B, Feature 003
│   ├── mod.rs           (FinetuneCommand enum + dispatch)
│   ├── init.rs          handle_init
│   ├── sources.rs
│   ├── import_dataset.rs
│   ├── plan.rs
│   ├── generate.rs
│   ├── eval.rs
│   ├── train.rs
│   ├── status.rs
│   ├── quickstart.rs
│   ├── auto.rs
│   ├── jobs/            Layer B wrappers (Feature 001 catalog)
│   │   └── ...
│   └── workers/         claude -p subprocess orchestration
│       └── ...
├── init.rs              NEW — Track C, Feature 005
├── doctor.rs            NEW — Track C, Feature 005
├── uninstall.rs         NEW — Track C, Feature 005
├── upgrade.rs           NEW
├── config.rs            NEW
├── gateway_lifecycle/   NEW (or single file gateway.rs with sub-enum)
└── ui/                  NEW (start/stop/open)
```

### 3.2 Crate-level additions

**In `finetune/` crate (extend `vllora_finetune`):**
- `src/state/` — local state file helpers (journal, analysis, change_log, execution_log) with JSON schemas.
- `src/sources_adapters/` — URI resolution per scheme.
- `src/prompts/` — worker system prompts (Markdown, embedded via `include_str!`).
- Possibly `src/workers/` — `claude -p` subprocess wrapper + per-worker types. (Alternatively, workers live in `gateway/src/cli/commands/finetune/workers/` since they're CLI-side.)

**Possible refactors to existing `finetune/src/client.rs`:**
- Add optional `idempotency_key` + `only_tracking` parameters to `create_job` / `create_finetune_job` if not already supported by the backend.

### 3.3 Gateway-side refactors

- **`workflows` table columns:** add `analysis_json TEXT` + `trace_meta_json TEXT` if not present. Update corresponding `DbWorkflow` + `DbUpdateWorkflow` models + workflows handler GET response.
- **`records` table columns:** add `origin_uri TEXT` + `origin_source_id TEXT` for remote-source provenance if not present.
- **`graders` table versioning:** verify if graders are versioned with `change_reason` + `is_active`; if not, add.
- **Error contract consistency:** audit `GatewayApiError` variants + HTTP status codes to ensure `INVALID_REQUEST` / `NOT_FOUND` / `UNAUTHORIZED` / `FORBIDDEN` / `CONFLICT` emit correctly across all finetune routes.
- **Workflow-scoped job routes alias:** if Feature 001's spec requires `/v1/finetune/workflows/{id}/jobs` etc. specifically, add that alias layer over existing finetune-job routes.

### 3.4 Plugin (Feature 004)

**Completely new files** under `plugin/` (location TBD — likely top-level in `vllora/` or in `finetune/` crate's resources):
- `plugin.json` (manifest)
- `commands/finetune.md` (orchestrator)
- `commands/finetune-<verb>.md` × 9
- `skills/*/SKILL.md` × 5 (content migrated from `ui/finetune-skill/reference/*.md`)
- `resources/templates/`, `resources/reference/`

### 3.5 UI (Feature 006)

**New components** under `ui/src/components/finetune/`:
- `GraderHistoryPanel.tsx` — grader versions with change-log + diffs
- `EvalIterationList.tsx` — per-iteration per-model scores
- `MonitorReportRenderer.tsx` — Markdown render of training monitor report
- `RemediationMessage.tsx` — friendly error display
- New hooks: `useWorkflowPolling`, `useGraderHistory`, `useTrainingMetricsStream`

**Updates to existing components:** `PipelineCanvas`, `PipelineStepCard`, `FinetuneJobsPanel` may need to consume new `workflows.analysis_json`.

---

## 4. Uncertainties that need code-reading verification

Marked **[VERIFY]** where I can't confirm from the file structure alone:

1. **[VERIFY]** Do any existing create-job endpoints accept `idempotency_key`? Check `gateway/src/handlers/finetune.rs` and `gateway/src/handlers/workflows.rs` request structs.
2. **[VERIFY]** Does the existing `GatewayApiError` enum map to the exact 5 error codes the Feature 001 spec requires?
3. **[VERIFY]** Is there already a `graders` / `evaluators` table with versioning + change-reason tracking? Check `vllora_core::metadata::services::evaluator_version` and related.
4. **[VERIFY]** Does the existing `workflows` table schema have room for `analysis_json` / `trace_meta_json` or do we need a migration?
5. **[VERIFY]** Does the existing journal endpoint (`/finetune/workflows/{wf_id}/journal`) schema match what our `pipeline-journal.json` needs?
6. **[VERIFY]** Does `records` table already carry `origin_uri` + `origin_source_id` fields?
7. **[VERIFY]** How are the Python scripts in `ui/finetune-skill/scripts/` invoked today? Directly by Claude Code's Bash tool in the monolithic SKILL.md? Understanding this tells us how CLI verbs should invoke them.
8. **[VERIFY]** Plugin location — does it belong at `vllora/plugin/` (shipped with pip wheel) or inside `finetune/crate/resources/` (crate resource)?

Each Track owner's Week-1 job includes resolving the verify items for their area.

---

## 5. Revised effort estimate per track

| Track | Feature(s) | Existing leverage | Net new code |
|---|---|---|---|
| **A** | 001 + 002 | HIGH — gateway routes + `vllora_finetune` client mostly done | **Small:** local state helpers + JSON schemas + idempotency/only-tracking shims + possible column additions |
| **B** | 003 | MEDIUM — 34 Python scripts stay as-is; client methods exist | **Large:** new CLI subcommand tree + 7 workers + 6 URI adapters + prompt migration + stream-JSON protocol |
| **C** | 004 + 005 + 006 | MEDIUM — UI has 9 components; gateway has all routes | **Medium:** plugin bundle (~16 files), install/doctor/uninstall CLI commands, pip wheel packaging (maturin), UI additions (~5 new components) |

**Track B is still the biggest, but smaller than I thought before** — 34 Python scripts mean the pipeline logic is already written.

---

## 6. Revised next steps

### Week 1 — Verify + freeze contracts

All three tracks jointly, in one ~2-hour session:

1. **Verify the 8 [VERIFY] items** in §4 — spend 30 minutes inspecting each. This converts uncertainties into either "already exists" or "we need to add it."
2. **Lock the JSON schemas** (`journal.schema.json`, `analysis.schema.json`) — these become the client-side state file contracts.
3. **Decide plugin location** — bundle in pip wheel vs embed in `finetune/` crate as resource. Affects how `vllora init` symlinks it.
4. **Agree on worker prompt migration strategy** — take existing agent prompts from `ui/finetune-skill/`, break into per-worker `.md` files under `finetune/src/prompts/` (or wherever plugin location settles).
5. **Decide Python-script invocation interface** — do CLI verbs call scripts via `tokio::process::Command` directly, or via a thin wrapper? Bonus: define the stdout format (JSON?) so verbs can parse script output.

### Week 2 onwards

Per `implementation-plan.md` §8 milestones. But with the corrected mental model: you're **extending existing infrastructure, not building parallel systems.**

---

## 7. What I got wrong (so it's not repeated)

- I assumed we needed to build a Python pip package from scratch. Wrong — `vllora` is Rust, already pip-distributable via maturin pattern.
- I scaffolded `GatewayClient`, `CreateJobRequest`, `cancel_finetune_job` as new types. Wrong — all exist in `vllora_finetune` crate.
- I scaffolded `gateway/src/finetune/routes/*.rs` as new routes. Wrong — the workflow-scoped routes exist under `/finetune/workflows/*` already.
- I treated the finetune pipeline as non-existent. Wrong — 34 Python scripts + monolithic SKILL.md + 9 UI components + full client crate + extensive handlers are all present.

The product is ~70% built. Our work is a **CLI + plugin + state-file layer** on top, plus small backend refactors for idempotency + versioning + schema additions.
