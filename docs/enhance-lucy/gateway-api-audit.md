# Gateway API Audit — Finetune Endpoints

> **Audited**: 2026-03-11
> **Source**: `gateway/src/http.rs`, `gateway/src/handlers/workflows.rs`, `gateway/src/handlers/finetune.rs`
> **Next**: [Migration Plan](./gateway-migration-plan.md) — implementation phases, testing, timeline

---

## Context & Motivation

### Why this migration exists

vLLora's finetune feature currently stores all user data (datasets, records, topics, knowledge sources, evaluation jobs) in **IndexedDB** — a browser-local database. This works for the web UI but creates a fundamental problem:

- **CLI cannot access UI data**: vLLora also has a CLI tool (skill package) that needs to read/write the same workflow data. IndexedDB is inaccessible from a terminal.
- **No cross-device sharing**: Data is locked to a single browser on a single machine.
- **No backup/export**: If the browser storage is cleared, all data is lost.

The solution: move mutable data from IndexedDB to the **vLLora gateway** (a Rust HTTP server backed by local SQLite). Both the browser UI and CLI talk to the same gateway API, sharing the same SQLite database.

### System architecture (3 repos)

```
┌─────────────────────────────────────────────────────────────────────┐
│  vllora/ui  (this repo)                                             │
│  React/TypeScript frontend                                          │
│  Currently: IndexedDB for all data                                  │
│  Target: Gateway API calls instead of IndexedDB                     │
│  Key dirs: src/services/, src/contexts/, src/lib/distri-finetune-tools/ │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ HTTP (localhost:9090)
┌──────────────────▼──────────────────────────────────────────────────┐
│  vllora/gateway  (sibling repo)                                     │
│  Rust (Actix-web) HTTP server                                       │
│  Local SQLite for mutable data (workflows, finetune_jobs)           │
│  Proxies to cloud for immutable operations (eval, training, deploy) │
│  Key files: src/handlers/workflows.rs, src/handlers/finetune.rs     │
│  DB layer: vllora/core/src/metadata/ (models, services, schema)     │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ HTTPS (api.langdb.cloud)
┌──────────────────▼──────────────────────────────────────────────────┐
│  Cloud API (api.langdb.cloud)                                       │
│  Immutable operations: JSONL upload, eval runs, training jobs,      │
│  model deployment, metrics, weights download                        │
│  Client: vllora/finetune/src/client.rs (LangdbCloudFinetuneClient) │
└─────────────────────────────────────────────────────────────────────┘
```

### The 7-step finetune pipeline

```
Topics Config → Categorization → Coverage & Generation → Grader Config → Evaluation → Training → Deployment
```

Each step produces data that the next step consumes. This audit ensures the gateway API supports every step's read/write needs.

### Current state vs target state

| Aspect | Current (IndexedDB) | Target (Gateway API) |
|--------|-------------------|---------------------|
| Storage | Browser-only IndexedDB | Local SQLite via gateway |
| Access | UI only | UI + CLI + any HTTP client |
| Records CRUD | `src/services/dataset-record-service.ts` | `GET/POST/PUT/PATCH/DELETE /workflows/{id}/records` |
| Topics | Stored on dataset object in IDB | `workflow_topics` table |
| Knowledge sources | `knowledge_sources` IDB store | `knowledge_sources` SQLite table |
| Eval jobs | `dry_run_jobs` IDB store | `eval_jobs` SQLite table |
| Evaluator script | Stored on dataset object in IDB | `workflows.eval_script` column |

### Migration approach: Adapter pattern

The UI uses service interfaces (`src/services/`). The migration plan swaps IndexedDB adapters for API adapters in a single registration point (`service-registry.ts`). No component code changes needed — only the adapter layer changes.

### Related files across repos

| Repo | File | Why it matters |
|------|------|---------------|
| `vllora/ui` | `src/types/dataset-types.ts` | TypeScript types for records, topics, knowledge sources, evaluations |
| `vllora/ui` | `src/services/` | Service interfaces (27 modules) — swap point for adapters |
| `vllora/ui` | `src/lib/distri-finetune-tools/` | 53 tool implementations that read/write data |
| `vllora/gateway` | `src/handlers/workflows.rs` | Workflow CRUD handlers (4 working + 12 placeholder) |
| `vllora/gateway` | `src/handlers/finetune.rs` | Cloud proxy handlers |
| `vllora/core` | `src/metadata/services/workflow.rs` | Existing workflow service (create, list, update, soft_delete) |
| `vllora/core` | `src/metadata/models/workflow.rs` | Diesel models for workflows table |
| `vllora/core` | `src/metadata/schema.rs` | Diesel schema definitions |
| `vllora/core` | `src/metadata/test_utils.rs` | Test helpers (setup_test_database, cleanup_test_database) |
| `vllora/finetune` | `src/client.rs` | `LangdbCloudFinetuneClient` — 17 async methods for cloud API |

---

## 1. Existing Endpoints (59 total: 51 working, 8 placeholders)

**Status:**
- **Working** — fully implemented, returns real data
- **Placeholder** — route registered but returns HTTP 501

| # | Method | Endpoint | Status | Data Source |
|---|--------|----------|--------|-------------|
| | | **Workflow CRUD** | | |
| 1 | `GET` | `/finetune/workflows` | Working | Local SQLite |
| 2 | `POST` | `/finetune/workflows` | Working | Local SQLite |
| 3 | `PUT` | `/finetune/workflows/{id}` | Working | Local SQLite |
| 4 | `DELETE` | `/finetune/workflows/{id}` | Working | Local SQLite (soft delete) |
| | | **Knowledge Sources** | | |
| 5 | `POST` | `/finetune/workflows/{id}/knowledge` | Working | Local SQLite, knowledge_sources table |
| 6 | `GET` | `/finetune/workflows/{id}/knowledge` | Working | Local SQLite |
| 7 | `GET` | `/finetune/workflows/{id}/knowledge/{ksId}` | Working | Local SQLite |
| 8 | `GET` | `/finetune/workflows/{id}/knowledge/count` | Working | Local SQLite |
| 9 | `PATCH` | `/finetune/workflows/{id}/knowledge/{ksId}/status` | Working | Local SQLite |
| 10 | `PATCH` | `/finetune/workflows/{id}/knowledge/{ksId}/chunks` | Working | Local SQLite |
| 11 | `DELETE` | `/finetune/workflows/{id}/knowledge/{ksId}` | Working | Local SQLite (soft delete) |
| 12 | `DELETE` | `/finetune/workflows/{id}/knowledge` | Working | Local SQLite (soft delete all) |
| 13 | `POST` | `/finetune/workflows/{id}/knowledge/chunk` | Placeholder | — |
| 14 | `POST` | `/finetune/workflows/{id}/knowledge/trace` | Placeholder | — |
| 15 | `DELETE` | `/finetune/workflows/{id}/knowledge/trace/{trace_id}` | Placeholder | — |
| | | **Topics** | | |
| 16 | `GET` | `/finetune/workflows/{id}/topics` | Working | Local SQLite |
| 17 | `POST` | `/finetune/workflows/{id}/topics` | Working | Local SQLite |
| 18 | `DELETE` | `/finetune/workflows/{id}/topics` | Working | Local SQLite |
| 19 | `POST` | `/finetune/workflows/{id}/topics/generate` | Placeholder | — |
| | | **Records** | | |
| 20 | `GET` | `/finetune/workflows/{id}/records` | Working | Local SQLite |
| 21 | `POST` | `/finetune/workflows/{id}/records` | Working | Local SQLite |
| 22 | `PUT` | `/finetune/workflows/{id}/records` | Working | Local SQLite |
| 23 | `DELETE` | `/finetune/workflows/{id}/records` | Working | Local SQLite |
| 24 | `PATCH` | `/finetune/workflows/{id}/records/{recordId}` | Working | Local SQLite |
| 25 | `PATCH` | `/finetune/workflows/{id}/records/topics` | Working | Local SQLite |
| 26 | `PATCH` | `/finetune/workflows/{id}/records/{recordId}/data` | Working | Local SQLite |
| 27 | `PATCH` | `/finetune/workflows/{id}/records/{recordId}/scores` | Working | Local SQLite |
| 28 | `DELETE` | `/finetune/workflows/{id}/records/{recordId}` | Working | Local SQLite |
| 29 | `DELETE` | `/finetune/workflows/{id}/records/topics` | Working | Local SQLite |
| 30 | `PATCH` | `/finetune/workflows/{id}/records/rename-topic` | Working | Local SQLite |
| 31 | `DELETE` | `/finetune/workflows/{id}/records/topics/{topicName}` | Working | Local SQLite |
| | | **Eval Jobs** | | |
| 32 | `POST` | `/finetune/workflows/{id}/eval-jobs` | Working | Local SQLite |
| 33 | `GET` | `/finetune/workflows/{id}/eval-jobs` | Working | Local SQLite |
| 34 | `GET` | `/finetune/workflows/{id}/eval-jobs/{jobId}` | Working | Local SQLite |
| 35 | `PATCH` | `/finetune/workflows/{id}/eval-jobs/{jobId}` | Working | Local SQLite |
| 36 | `DELETE` | `/finetune/workflows/{id}/eval-jobs/{jobId}` | Working | Local SQLite |
| 37 | `DELETE` | `/finetune/workflows/{id}/eval-jobs` | Working | Local SQLite |
| 38 | `GET` | `/finetune/eval-jobs?status=X` | Working | Local SQLite |
| | | **Evaluator Run** | | |
| 39 | `POST` | `/finetune/workflows/{id}/evaluator/run` | Placeholder | — |
| 40 | `GET` | `/finetune/workflows/{id}/evaluator/run/status` | Placeholder | — |
| | | **Evaluator Config** | | |
| 41 | `PATCH` | `/finetune/workflows/{id}/evaluator` | Working | Local SQLite (cloud sync at upload) |
| 42 | `GET` | `/finetune/workflows/{id}/evaluator/versions` | Working | Cloud proxy |
| | | **Training Jobs** | | |
| 43 | `POST` | `/finetune/workflows/{id}/jobs` | Working | Cloud + Local SQLite |
| 44 | `GET` | `/finetune/workflows/{id}/jobs` | Working | Local SQLite |
| 45 | `GET` | `/finetune/workflows/{id}/jobs/{job_id}/status` | Working | Local SQLite (cloud fallback) |
| 46 | `GET` | `/finetune/workflows/{id}/jobs/{job_id}/metrics` | Working | Cloud proxy |
| 47 | `POST` | `/finetune/workflows/{id}/jobs/{job_id}/cancel` | Working | Cloud + Local SQLite |
| 48 | `POST` | `/finetune/workflows/{id}/jobs/{job_id}/resume` | Working | Cloud + Local SQLite |
| 49 | `GET` | `/finetune/workflows/{id}/jobs/{job_id}/weights/url` | Working | Cloud proxy |
| | | **Dataset (cloud JSONL snapshot)** | | |
| 50 | `POST` | `/finetune/workflows/{id}/dataset/upload` | Working | Cloud proxy |
| 51 | `POST` | `/finetune/workflows/{id}/dataset/analytics/dry-run` | Working | Cloud proxy |
| 52 | `GET` | `/finetune/workflows/{id}/dataset/analytics` | Working | Cloud proxy |
| 53 | `GET` | `/finetune/workflows/{id}/dataset/finetune-evaluations` | Working | Cloud proxy |
| | | **Evaluations** | | |
| 54 | `POST` | `/finetune/evaluations` | Working | Cloud proxy |
| 55 | `GET` | `/finetune/evaluations/{run_id}` | Working | Cloud proxy |
| | | **Deployments** | | |
| 56 | `POST` | `/finetune/deployments` | Working | Cloud proxy |
| 57 | `DELETE` | `/finetune/deployments/{id}` | Working | Cloud proxy |
| | | **Topic Hierarchy (LLM)** | | |
| 58 | `POST` | `/finetune/topic-hierarchy/generate` | Working | Local LLM |
| 59 | `POST` | `/finetune/topic-hierarchy/adjust` | Working | Local LLM |

---

## 2. Data Sources

| Category | Endpoints | Where data lives |
|----------|-----------|-----------------|
| **Cloud proxy** | Evaluations, dataset upload/analytics, evaluator versions, training metrics/weights, deployments | `api.langdb.cloud` via `LangdbCloudFinetuneClient` |
| **Hybrid** | Create/cancel/resume training job, get job status | Cloud call + local `finetune_jobs` table |
| **Local SQLite** | Workflow CRUD, list jobs, evaluator config | Gateway SQLite |
| **Local LLM** | Topic hierarchy generate/adjust | LLM via `ExecutorContext` |

### Naming Convention

| Term | Meaning | Where |
|------|---------|-------|
| **Records** | Individual training examples (mutable, CRUD) | Local SQLite `workflow_records` |
| **Dataset** | Packaged JSONL snapshot for eval/training (immutable) | Cloud `api.langdb.cloud` |

- `/workflows/{id}/records/*` — local record CRUD
- `/workflows/{id}/dataset/*` — cloud JSONL upload + analytics
- Record generation endpoints are planned but not yet registered in gateway routes (see [Missing Endpoints](#5-missing-endpoints))

---

## 3. Database Schema

### Tables

```
┌─────────────────────────┐
│     workflows           │  ← exists (eval_script added)
│─────────────────────────│
│ id (PK)                 │
│ name                    │
│ objective               │
│ eval_script             │  ← to add
│ created_at              │
│ updated_at              │
│ deleted_at              │
└────────┬────────────────┘
         │ 1:N
    ┌────┼──────────────────────────────────────────┐
    │    │                                          │
    ▼    ▼                                          ▼
┌────────────────────────┐            ┌──────────────────────────┐
│  finetune_jobs         │ ← exists  │  workflow_records        │ ← created
│────────────────────────│            │──────────────────────────│
│ id (PK)                │            │ id (PK)                  │
│ project_id (FK)        │            │ workflow_id (FK)         │
│ workflow_id             │            │ data (JSON)              │
│ state                  │            │ topic                    │
│ provider               │            │ span_id                  │
│ provider_job_id        │            │ is_generated             │
│ base_model             │            │ source_record_id         │
│ fine_tuned_model       │            │ dry_run_score            │
│ error_message          │            │ finetune_score           │
│ training_config (JSON) │            │ metadata (JSON)          │
│ training_file_id       │            │ created_at               │
│ validation_file_id     │            └──────────────────────────┘
│ evaluator_version      │
│ created_at             │            ┌──────────────────────────┐
│ updated_at             │            │  workflow_topics         │ ← created
│ completed_at           │            │──────────────────────────│
└────────────────────────┘            │ id (PK)                  │
                                      │ workflow_id (FK)         │
┌────────────────────────┐            │ name                     │
│  eval_jobs             │ ← created │ parent_id (FK→self)      │
│────────────────────────│            │ selected                 │
│ id (PK)                │            │ source_chunk_refs (JSON) │
│ workflow_id (FK)       │            │ created_at               │
│ cloud_run_id           │            └──────────────────────────┘
│ status                 │
│ sample_size            │            ┌──────────────────────────┐
│ rollout_model          │            │  knowledge_sources       │ ← created
│ error                  │            │──────────────────────────│
│ created_at             │            │ id (PK)                  │
│ updated_at             │            │ workflow_id (FK)         │
└────────────────────────┘            │ name                     │
                                      │ type                     │
                                      │ content                  │
                                      │ extracted_content (JSON) │
                                      │ status                   │
                                      │ progress (JSON)          │
                                      │ created_at               │
                                      │ deleted_at               │
                                      └──────────────────────────┘
```

### Relationships

| Parent | Child | Key | Notes |
|--------|-------|-----|-------|
| `workflows` | `finetune_jobs` | `workflow_id` | Exists |
| `workflows` | `workflow_records` | `workflow_id` | Created |
| `workflows` | `workflow_topics` | `workflow_id` | Created |
| `workflows` | `eval_jobs` | `workflow_id` | Created |
| `workflows` | `knowledge_sources` | `workflow_id` | Created |
| `workflow_topics` | `workflow_topics` | `parent_id` | Self-ref tree |

### Knowledge → Topic → Record Chain

```
1. INDIRECT (via topic path)

   knowledge_sources          workflow_topics              workflow_records
   ┌────────────────┐         ┌──────────────────┐         ┌─────────────────┐
   │ id: "ks1"      │◄────────│ source_chunk_refs │◄────────│ topic           │
   │ extracted_     │ "ks1:c1"│ ["ks1:c1","ks1:c2"]│ path   │ "ML/NLP/Trans." │
   │  content (JSON)│         └──────────────────┘ match   └─────────────────┘
   │  .chunks[]     │
   └────────────────┘

2. DIRECT (per-record lineage)

   knowledge_sources                                       workflow_records
   ┌────────────────┐                                      ┌─────────────────┐
   │ id: "ks1"      │◄─────────────────────────────────────│ metadata (JSON)  │
   │ extracted_     │    metadata.sourceChunkRefs           │  .sourceChunkRefs│
   │  content (JSON)│    = ["ks1:c1"]                       │  ["ks1:c1"]      │
   └────────────────┘                                      └─────────────────┘
```

- **Client owns chunk IDs** — client extracts content, assigns stable chunk IDs, sends to gateway as-is
- **No separate chunk table** — chunks live inside `extracted_content` JSON
- **Composite ref** — `"sourceId:chunkId"` (e.g., `"ks1:c_a3f2"`)
- **Coverage analysis** checks direct refs first, falls back to topic path

### Implied Step Derivation

No `current_step` column. Check top-to-bottom, first match wins:

| # | Condition | Step | Action |
|---|-----------|------|--------|
| 1 | No topics | **Topics** | Generate topic hierarchy |
| 2 | No records | **Generation** | Generate records |
| 3 | Records without topic | **Categorization** | Categorize records |
| 4 | Topic coverage gaps | **Coverage** | Generate more records |
| 5 | No evaluator config | **Grader** | Configure evaluator |
| 6 | No eval jobs | **Evaluation** | Run evaluation |
| 7 | No training jobs | **Training** | Start training |
| 8 | No deployment | **Deployment** | Deploy model |
| 9 | All satisfied | **Done** | Complete |

---

## 4. Design Decisions

### Records in local SQLite

Cloud has no record-level CRUD — only bulk JSONL upload. Records live in `workflow_records` for mutable CRUD. Re-upload before every eval/training:

```
Local SQLite (mutable CRUD)  →  Package as JSONL  →  POST /dataset/upload  →  Cloud snapshot
```

### Evaluator script: local is source of truth

`eval_script` on `workflows` table. Both CLI and UI write to same gateway → same SQLite. Cloud gets copy at upload time.

### Knowledge sources: soft delete

`DELETE` sets `deleted_at`. Refs in topics/records remain valid but resolve to deleted source. UI shows "deleted" badge.

### No dataset versioning

Always re-upload before eval/training. Compare jobs by metrics. `finetune_jobs.created_at` + `evaluator_version` provides enough context.

### Minimal extra columns on `workflows`

Only `eval_script` added. Everything else derived:
- `current_step` → from related tables
- `dataset_id` → `workflow_id` IS the dataset ID on cloud
- `topic_hierarchy` → `workflow_topics` table
- Job/deployment IDs → latest row in respective tables
- Stats → computed from `workflow_records`

---

## 5. Missing Endpoints

### Records

| Method | Endpoint | Notes |
|--------|----------|-------|
| `POST` | `/workflows/{id}/records/from-spans` | Import from traces |

### Knowledge Sources

| Method | Endpoint | Notes |
|--------|----------|-------|
| `POST` | `/workflows/{id}/knowledge/search` | Search extracted_content chunks |

### Lower Priority

**Snapshots (P2)**

| Method | Endpoint |
|--------|----------|
| `POST` | `/workflows/{id}/snapshots` |
| `GET` | `/workflows/{id}/snapshots` |
| `POST` | `/workflows/{id}/snapshots/{snapshotId}/rollback` |

**Job Eval Cache (P3)**

| Method | Endpoint |
|--------|----------|
| `GET` | `/workflows/{id}/jobs/{jobId}/evaluations/cache` |
| `PUT` | `/workflows/{id}/jobs/{jobId}/evaluations/cache` |
| `DELETE` | `/workflows/{id}/jobs/{jobId}/evaluations/cache` |
| `DELETE` | `/workflows/{id}/evaluations/cache?max_age_ms={ms}` |
| `GET` | `/workflows/{id}/jobs/{jobId}/scores-persisted` |
| `POST` | `/workflows/{id}/jobs/{jobId}/scores-persisted` |

**Iteration State (P3)**

| Method | Endpoint |
|--------|----------|
| `GET` | `/workflows/{id}/iteration` |
| `PUT` | `/workflows/{id}/iteration` |
| `POST` | `/workflows/{id}/iteration` |
| `POST` | `/workflows/{id}/iteration/history` |
| `GET` | `/workflows/{id}/iteration/history` |
| `PATCH` | `/workflows/{id}/iteration/phase` |
| `DELETE` | `/workflows/{id}/iteration` |

---

## 6. Flow Diagrams

Every user flow mapped to API calls and DB operations.

**Legend:** `→ LOCAL` = local SQLite | `→ CLOUD` = `api.langdb.cloud` | `→ LLM` = local LLM | `[table]` = SQLite table

---

### A. Full Pipeline (knowledge sources → training)

```
POST /workflows                              → LOCAL  [workflows] create
  │
  ▼
POST /workflows/{id}/knowledge               → LOCAL  [knowledge_sources] create
  │  client sends extracted_content with client-generated chunk IDs
  ▼
POST /finetune/topic-hierarchy/generate       → LLM   returns TopicHierarchyNode[]
POST /workflows/{id}/topics                   → LOCAL  [workflow_topics] create tree
  │
  ▼
POST /finetune/records/generate               → LLM   returns records (stateless, no DB write)
POST /workflows/{id}/records                  → LOCAL  [workflow_records] bulk add
  │
  ▼
PATCH /workflows/{id}/evaluator               → LOCAL  [workflows].eval_script
  │
  ▼
POST /workflows/{id}/dataset/upload           → CLOUD  packages [workflow_records] + [workflow_topics]
  │                                                     + [workflows].eval_script → JSONL → cloud
  ▼
POST /finetune/evaluations                    → CLOUD  creates eval run
POST /workflows/{id}/eval-jobs                → LOCAL  [eval_jobs] create
  │
  ▼  (poll every 6s)
GET /finetune/evaluations/{run_id}            → CLOUD  returns progress/results
PATCH /workflows/{id}/eval-jobs/{id}          → LOCAL  [eval_jobs] update status
PATCH /workflows/{id}/records/{id}/scores     → LOCAL  [workflow_records] update scores
  │
  ▼
POST /workflows/{id}/dataset/upload           → CLOUD  re-upload (in case records changed)
POST /workflows/{id}/jobs                     → CLOUD  create training job
                                              → LOCAL  [finetune_jobs] create
  │
  ▼  (poll)
GET /workflows/{id}/jobs/{id}/status          → LOCAL  [finetune_jobs] (cloud fallback)
GET /workflows/{id}/jobs/{id}/metrics         → CLOUD  loss curves, eval metrics
  │
  ▼
POST /finetune/deployments                    → CLOUD  deploy model
```

### B. Import Traces (no knowledge sources)

```
POST /workflows                               → LOCAL  [workflows] create
POST /workflows/{id}/records/from-spans       → LOCAL  [workflow_records] import from traces
POST /workflows/{id}/topics                   → LOCAL  [workflow_topics] create
PATCH /workflows/{id}/records/topics          → LOCAL  [workflow_records] batch categorize
  │
  ▼  ... continues: grader → upload → eval → training (same as A)
```

### C. Record CRUD

```
POST   /workflows/{id}/records                → LOCAL  [workflow_records] bulk add
PUT    /workflows/{id}/records                → LOCAL  [workflow_records] replace all (atomic)
PATCH  /workflows/{id}/records/{id}/data      → LOCAL  [workflow_records] update data
PATCH  /workflows/{id}/records/{id}           → LOCAL  [workflow_records] update topic
DELETE /workflows/{id}/records/{id}           → LOCAL  [workflow_records] delete one
DELETE /workflows/{id}/records                → LOCAL  [workflow_records] delete all
GET    /workflows/{id}/records                → LOCAL  [workflow_records] list + stats
```

> After any record change, next eval/training must re-upload via `POST /dataset/upload`.

### D. Topic Management

```
PATCH  /workflows/{id}/records/rename-topic   → LOCAL  [workflow_topics] + [workflow_records]
DELETE /workflows/{id}/records/topics/{name}  → LOCAL  [workflow_records] clear topic
DELETE /workflows/{id}/records/topics         → LOCAL  [workflow_records] clear all topics
DELETE /workflows/{id}/topics                 → LOCAL  [workflow_topics] delete tree
                                                       (records keep topic strings)

REGENERATE:
  DELETE /workflows/{id}/topics               → LOCAL  delete old tree
  POST /finetune/topic-hierarchy/generate     → LLM   generate new
  POST /workflows/{id}/topics                 → LOCAL  save new tree
  PATCH /workflows/{id}/records/topics        → LOCAL  re-categorize records
```

### E. Knowledge Source Lifecycle

```
POST   /workflows/{id}/knowledge              → LOCAL  [knowledge_sources] create
GET    /workflows/{id}/knowledge              → LOCAL  [knowledge_sources] list (WHERE deleted_at IS NULL)
POST   /workflows/{id}/knowledge/search       → LOCAL  search extracted_content chunks
DELETE /workflows/{id}/knowledge/{ksId}       → LOCAL  [knowledge_sources] soft delete (SET deleted_at)
                                                       refs in topics/records remain valid

ADD mid-workflow:
  POST /workflows/{id}/knowledge              → LOCAL  add new source
  POST /finetune/topic-hierarchy/generate     → LLM   regenerate topics
  POST /workflows/{id}/topics                 → LOCAL  save updated tree
  POST /finetune/records/generate             → LLM   generate for new topics
  POST /workflows/{id}/records                → LOCAL  save new records
```

### F. Evaluation Iteration (grader tuning)

```
RUN 1 (score low):
  POST /workflows/{id}/dataset/upload         → CLOUD  upload
  POST /finetune/evaluations                  → CLOUD  run eval → mean=0.3

EDIT grader:
  PATCH /workflows/{id}/evaluator             → LOCAL  [workflows].eval_script

RUN 2 (re-upload + re-eval):
  POST /workflows/{id}/dataset/upload         → CLOUD  re-upload with new eval_script
  POST /finetune/evaluations                  → CLOUD  run eval → mean=0.7 ✓

COMPARE:
  GET /workflows/{id}/eval-jobs               → LOCAL  [eval_jobs] 2 rows, different cloud_run_id
```

### G. Training Iteration (improve dataset)

```
JOB 1 (overfitting):
  GET /workflows/{id}/jobs/{job1}/metrics     → CLOUD  loss curve diverges

EDIT records:
  POST   /workflows/{id}/records              → LOCAL  add more
  PATCH  /workflows/{id}/records/{id}/data    → LOCAL  fix bad examples
  DELETE /workflows/{id}/records/{id}         → LOCAL  remove bad ones
  — OR —
  PUT /workflows/{id}/records                 → LOCAL  replace all (atomic)

RE-EVAL:
  POST /workflows/{id}/dataset/upload         → CLOUD  re-upload
  POST /finetune/evaluations                  → CLOUD  eval

JOB 2:
  POST /workflows/{id}/dataset/upload         → CLOUD  re-upload latest
  POST /workflows/{id}/jobs                   → CLOUD + LOCAL  [finetune_jobs] new row

COMPARE:
  GET /workflows/{id}/jobs                    → LOCAL  [finetune_jobs] both jobs
  GET /workflows/{id}/jobs/{job1}/metrics     → CLOUD
  GET /workflows/{id}/jobs/{job2}/metrics     → CLOUD
```

### H. Cancel / Resume Training

```
POST /workflows/{id}/jobs/{id}/cancel         → CLOUD + LOCAL  [finetune_jobs] → cancelled
POST /workflows/{id}/jobs/{id}/resume         → CLOUD + LOCAL  [finetune_jobs] → pending
```

### I. Deployment

```
POST   /finetune/deployments                  → CLOUD  deploy (model_id from finetune_jobs)
DELETE /finetune/deployments/{id}             → CLOUD  undeploy
```

### J. Cross-Workflow

```
GET    /finetune/workflows                    → LOCAL  [workflows] WHERE deleted_at IS NULL
DELETE /workflows/{id}                        → LOCAL  [workflows] soft delete
                                                       child tables NOT cascade-deleted
GET    /eval-jobs?status=running              → LOCAL  [eval_jobs] cross-workflow
GET    /workflows/{id}/jobs                   → LOCAL  [finetune_jobs] per-workflow
```

### K. Cloud Analytics (read-only)

```
POST /workflows/{id}/dataset/analytics/dry-run  → CLOUD  score distribution, topic breakdown
GET  /workflows/{id}/dataset/analytics          → CLOUD  record count, token stats
GET  /workflows/{id}/dataset/finetune-evaluations → CLOUD  per-job eval scores
GET  /workflows/{id}/jobs/{id}/metrics          → CLOUD  loss curve, reward metrics
GET  /workflows/{id}/jobs/{id}/weights/url      → CLOUD  signed download URL
```

---

### Table Access Summary

| Table | Read by | Written by |
|-------|---------|------------|
| `workflows` | All flows | A (create), F (eval_script), J (soft delete) |
| `workflow_records` | A, B, C, D, F, G | A, B, C, D, G (CRUD + categorize) |
| `workflow_topics` | A, B, D | A, B, D (create, rename, delete) |
| `knowledge_sources` | A, E | A, E (create, soft delete) |
| `eval_jobs` | A, F, J | A, F (create, update status) |
| `finetune_jobs` | A, G, H, J, K | A, G, H (create, cancel, resume) |

### Cloud-Only Operations

| Operation | Endpoint |
|-----------|----------|
| Upload JSONL | `POST /workflows/{id}/dataset/upload` |
| Run evaluation | `POST /finetune/evaluations` |
| Poll evaluation | `GET /finetune/evaluations/{run_id}` |
| Evaluator versions | `GET /workflows/{id}/evaluator/versions` |
| Dataset analytics | `GET /workflows/{id}/dataset/analytics` |
| Training metrics | `GET /workflows/{id}/jobs/{id}/metrics` |
| Weights URL | `GET /workflows/{id}/jobs/{id}/weights/url` |
| Deploy / Undeploy | `POST /finetune/deployments`, `DELETE /finetune/deployments/{id}` |

---

## 7. Implementation Priority

| Priority | Work | Effort | Status |
|----------|------|--------|--------|
| **P0** | `GET /workflows/{id}` + add `eval_script` column | Tiny | DONE |
| **P1** | `workflow_records` table + 13 endpoints | Large | DONE (12 of 13; `from-spans` still TODO) |
| **P1** | `workflow_topics` table + 3 endpoints | Small | DONE |
| **P1** | `eval_jobs` table + 8 endpoints | Medium | DONE (7 endpoints + background poller) |
| **P1** | `knowledge_sources` table + 12 endpoints | Medium | DONE (9 of 12; `search` still TODO) |
| **P2** | Snapshots table + 3 endpoints | Medium | — |
| **P2** | Record generation placeholders (2) | Medium | — |
| **P2** | Evaluator run placeholders (2) | Medium | — |
| **P3** | Iteration state table + 7 endpoints | Medium | — |
| **P3** | Job eval cache — 6 endpoints | Small | — |
