# Eval & Finetune Job Workflow

End-to-end flow diagrams for evaluation jobs and finetune (training) jobs — from FE creation through cloud execution, polling, score writeback, and real-time UI updates.

---

## Table of Contents

1. [Workflow Detail Endpoint](#1-workflow-detail-endpoint)
2. [Eval Job Flow](#2-eval-job-flow)
3. [Finetune Job Flow](#3-finetune-job-flow)
4. [Score Writeback Flow](#4-score-writeback-flow)
5. [Real-Time UI Updates (SSE)](#5-real-time-ui-updates-sse)
6. [Data Model Reference](#6-data-model-reference)

---

## 1. Workflow Detail Endpoint

The single-workflow GET endpoint returns enriched data so the FE doesn't need
extra round-trips to discover associated records, eval jobs, or finetune jobs.

```
GET /finetune/workflows/{id}

Response (WorkflowDetailResponse):
{
  // --- flat DbWorkflow fields ---
  "id": "abc-123",
  "name": "My Dataset",
  "objective": "...",
  "eval_script": "...",
  "state": null,
  "iteration_state": null,
  "created_at": "2026-03-12T...",
  "updated_at": "2026-03-12T...",
  "deleted_at": null,

  // --- enriched fields ---
  "records_count": 142,
  "eval_job_ids": ["job-1", "job-2"],
  "finetune_job_ids": ["ft-1"]
}
```

**How it works (gateway):**
- `WorkflowService::get_by_id()` — workflow row
- `WorkflowRecordService::count()` — `SELECT COUNT(*)`
- `EvalJobService::list_ids_by_workflow()` — `SELECT id FROM eval_jobs`
- `FinetuneJobService::list_ids_by_workflow()` — `SELECT id FROM finetune_jobs`

**FE mapping** (`api-dataset-adapter.ts`):
- `DbWorkflowDetailResponse` → `Dataset` with `recordsCount`, `evalJobIds`, `finetuneJobIds`
- List endpoint (`GET /finetune/workflows`) still returns basic `DbWorkflowResponse[]` (no enrichment)

---

## 2. Eval Job Flow

### 2.1 Creation (FE → Gateway → Cloud)

```
User clicks "Run Evaluation" (or Lucy calls run_evaluation tool)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  FE: run-evaluation.ts (browser tool)                   │
│                                                         │
│  1. Calls recordService.getCount(workflowId)            │
│     → GET /records/count → { count: N }                 │
│     (lightweight — no records fetched)                  │
│  2. Computes sampleSize = count × (sample_percentage%)  │
│  3. Calls evalPollingManager.createAndStartEval({      │
│       workflowId, sampleSize, rolloutModel              │
│     })                                                  │
│  4. FE does NOT send rows/records to the gateway        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  FE: evalPollingManager.createEvalJob()                  │
│  (eval-polling-manager.ts)                              │
│                                                         │
│  1. POST /eval-jobs → creates eval job in gateway       │
│     SQLite (status: "pending")                          │
│  2. POST /finetune/evaluations → triggers cloud eval    │
│     Body: { dataset_id (=workflow_id),                  │
│             rollout_model_params, offset: 0,            │
│             limit: sampleSize }                         │
│  3. On success → PATCH /eval-jobs/{id}:                 │
│     saves evaluationRunId (cloud_run_id) from response, │
│     updates status to "running"                         │
│  4. Emits vllora_eval_job_update → EvalJobsContext       │
│     picks up running job and starts polling              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Gateway: POST /finetune/evaluations                    │
│  (handlers/finetune.rs → create_evaluation)             │
│                                                         │
│  1. ensure_dataset_uploaded(workflow_id):                │
│     a. Reads records from LOCAL SQLite                  │
│     b. Reads topics + eval_script from SQLite           │
│     c. Builds JSONL from records                        │
│     d. Uploads to cloud: POST /datasets (upsert)       │
│  2. POST cloud /evaluations                             │
│     Body: { dataset_id, rollout_model_params,           │
│             offset, limit }                             │
│  3. Receives { evaluation_run_id }                      │
│  4. Returns evaluation response to FE                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Cloud API: Runs evaluation asynchronously              │
│                                                         │
│  - Executes eval_script against each row                │
│  - Scores each row (0.0–1.0)                            │
│  - Results available via GET /evaluations/{id}          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Progress & Status Tracking

```
┌─────────────────────────────────────────────────────────┐
│  Gateway: EvalJobStateTracker (eval_state_tracker.rs)    │
│  Background task, polls cloud every 30s                 │
│  Purpose: status tracking + score writeback             │
│                                                         │
│  Loop (every 30s):                                      │
│    1. SELECT * FROM eval_jobs WHERE status IN            │
│       ('pending', 'running')                            │
│    2. For each job:                                     │
│       GET cloud /evaluations/{cloud_run_id}             │
│    3. On EVERY poll cycle (not just status change):     │
│       a. Serialize full cloud API response as           │
│          polling_snapshot in eval_jobs table             │
│          (completed_rows, results, summary —            │
│          always fresh, FE never needs its own           │
│          cloud API polling for progress data)           │
│       b. Write per-row scores → workflow_record_scores  │
│          (see Score Writeback §4)                       │
│       c. Broadcast SSE: RecordScoresUpdated             │
│          → enables incremental score updates while      │
│          running                                        │
│    4. If status changed:                                │
│       UPDATE eval_jobs SET status                       │
│       Broadcast SSE: EvalJobUpdate                      │
│       { job_id, workflow_id, status }                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FE: evalPollingManager (eval-polling-manager.ts)        │
│  Polls BE every 10s for PROGRESS (reads polling_snapshot)│
│  VIEW-SCOPED: only polls when EvalJobsProvider mounted  │
│                                                         │
│  1. Fetches job from gateway SQLite (which now has       │
│     fresh polling_snapshot from BE state tracker)       │
│  2. Emits vllora_eval_job_update for UI re-render       │
│  3. If terminal status → process results                │
│  4. Race condition guard (catch-up fetch):              │
│     If pollJob() detects terminal status AND the        │
│     pollingSnapshot has no results, the BE tracker      │
│     may have updated status before writing results.     │
│     In this case, pollJob() does one final fetch from   │
│     the cloud API (GET /finetune/evaluations/{run_id})  │
│     before stopping, ensuring results are never lost.   │
│  5. Stop conditions:                                    │
│     a. pollJob() checks job.status !== 'running'        │
│        (with catch-up fetch if results missing)         │
│     b. handleJobComplete() / handleSseStatusChange()    │
│        call stopPolling()                               │
│     c. EvalJobsContext cleanup stops all on unmount     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FE: EvalJobsContext (view lifecycle + SSE)               │
│  Mounted in DatasetDetailContentV2 — scoped to page     │
│                                                         │
│  On mount:                                              │
│  1. Initializes evalPollingManager (stale job cleanup)  │
│  2. Loads jobs from gateway SQLite                      │
│  3. Starts polling for any running jobs                 │
│                                                         │
│  On unmount (user navigates away):                      │
│  4. Stops all active polling intervals                  │
│                                                         │
│  SSE subscription:                                      │
│  5. On eval_job_update (completed/failed) → stops       │
│     polling + processes final results immediately       │
│  6. On SSE reconnect → re-fetches job list              │
│  7. On-demand: evalPollingManager.refreshJob(jobId)     │
└─────────────────────────────────────────────────────────┘

Why both polling + SSE?
- BE polls cloud: WRITEBACK scores to records table + saves full
  polling_snapshot to eval_jobs (progress data for FE) + status tracking.
  Single source of truth — FE reads from BE, not cloud directly.
- FE polls BE: reads polling_snapshot for PROGRESS (completed_rows,
  scores). No direct cloud calls — BE snapshot is always fresh (30s).
- SSE from BE: instant STATUS TRANSITIONS (running→completed)
  Avoids waiting up to 10s for the next FE poll to detect completion.
- Catch-up fetch: if FE sees terminal status but no results in
  snapshot (race condition), it does one direct cloud fetch to recover.
```

### 2.3 Eval Completion

```
FE: evalPollingManager.handleJobComplete()
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  1. Fetches records to build recordTopics mapping       │
│     (for per-topic analysis in eval results)            │
│  2. Calls analyzeEvalResults() → EvalStats              │
│  3. Saves evalStats to dataset via datasetService       │
│  4. Updates eval job status to "completed"              │
│  5. Updates workflow step data (dryRun scores/verdict)  │
│  6. Shows verdict toast: GO / WARNING / NO-GO           │
│  7. Emits 'vllora_eval_job_completed' event              │
│                                                         │
│  Note: per-record score persistence is handled by the   │
│  gateway (EvalJobStateTracker), NOT the FE              │
└─────────────────────────────────────────────────────────┘
```

### 2.4 Eval Job Detail UI

```
┌─────────────────────────────────────────────────────────┐
│  EvalJobDetail component                                │
│                                                         │
│  Data source: polling_snapshot from eval_jobs table      │
│                                                         │
│  Displays:                                              │
│  ┌───────────────────────────────────────────────┐      │
│  │ Status: Running ████████░░ 80%                │      │
│  │ Model: gpt-4o-mini  Sample: 50 rows           │      │
│  │                                               │      │
│  │ ┌─────────┬──────────┬────────┬─────────┐     │      │
│  │ │ Row     │ Score    │ Status │ Reason  │     │      │
│  │ ├─────────┼──────────┼────────┼─────────┤     │      │
│  │ │ row-001 │ 0.85     │ ✓      │ Meets.. │     │      │
│  │ │ row-002 │ 0.20     │ ✗      │ Does..  │     │      │
│  │ └─────────┴──────────┴────────┴─────────┘     │      │
│  │                                               │      │
│  │ Summary: Avg 0.72 | Pass 40 | Fail 10         │      │
│  └───────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 2.5 "Go to Record" Navigation (Eval Detail → Records Table)

When a user clicks a row in the eval job detail to navigate to it in the
records/data tab, the highlight handler scrolls the target record into view.

**Tree/grouped mode fix:** The highlight handler gates on `shouldVirtualize`:
- **Flat mode** (`shouldVirtualize === true`): uses `virtualizerRef.current.scrollToIndex()` as before.
- **Tree/grouped mode** (`shouldVirtualize === false`): `scrollToIndex()` silently fails because `TopicRecordTree` renders instead of the virtualizer. Falls back to DOM-based `scrollIntoView` with `requestAnimationFrame` to ensure the element is rendered before scrolling.

### 2.6 FlattenEvaluationResults — `workflow_row_id` Mapping

The cloud eval API returns `workflow_row_id` (not `dataset_row_id`) in epoch
entries. The `EpochEntry` interface now includes `workflow_row_id`, and the
row ID resolution uses a fallback chain:

```
entry.dataset_row_id ?? entry.workflow_row_id ?? row.row?.id ?? ""
```

This ensures correct record-to-score mapping regardless of which field the
cloud API populates.

---

## 3. Finetune Job Flow

### 3.1 Creation (FE → Gateway → Cloud)

```
User clicks "Start Training" (or Lucy calls start_training tool)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  FE: start-training.ts (browser tool)                   │
│                                                         │
│  1. Reads workflow state (base model, training config)  │
│  2. Calls POST /finetune/workflows/{wf_id}/jobs         │
│     Body: {                                             │
│       base_model, training_config,                      │
│       evaluator_version, evaluation_dataset             │
│     }                                                   │
│  3. FE does NOT send records — gateway reads them       │
│  4. Updates workflow step to "training: started"        │
│  5. No FE polling — SSE events drive UI updates         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Gateway: POST /finetune/workflows/{wf_id}/jobs         │
│  (handlers/finetune.rs → create_finetune_job)           │
│                                                         │
│  1. ensure_dataset_uploaded(workflow_id):                │
│     a. Reads records from LOCAL SQLite                  │
│     b. Reads topics + eval_script from SQLite           │
│     c. Builds JSONL from records                        │
│     d. Uploads to cloud: POST /datasets (upsert)       │
│  2. POST cloud /fine-tuning/jobs                        │
│     Body: {                                             │
│       training_file: dataset_id (=workflow_id),         │
│       model: base_model,                                │
│       training_config, evaluator_version                │
│     }                                                   │
│  3. Receives { id: provider_job_id, status, ... }       │
│  4. INSERT into finetune_jobs table (SQLite):           │
│     { id (uuid), workflow_id, provider_job_id,          │
│       base_model, status: "pending", ... }              │
│  5. Returns cloud response to FE                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Cloud API: Runs fine-tuning asynchronously             │
│                                                         │
│  - Trains model on uploaded dataset                     │
│  - Progress available via GET /fine-tuning/jobs/{id}    │
│  - Metrics: training_loss, validation_loss per step     │
│  - On completion: produces fine_tuned_model ID          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Progress & Status Tracking

```
┌─────────────────────────────────────────────────────────┐
│  Gateway: FinetuneJobStateTracker                       │
│  (finetune_state_tracker.rs)                            │
│  Background task, polls cloud every 30s                 │
│  Purpose: status tracking + score writeback             │
│                                                         │
│  Loop (every 30s):                                      │
│    1. SELECT * FROM finetune_jobs WHERE status IN        │
│       ('pending', 'running', 'validating_model')        │
│    2. For each job:                                     │
│       GET cloud /fine-tuning/jobs/{provider_job_id}     │
│    3. If status changed:                                │
│       UPDATE finetune_jobs SET status, model_id, etc.   │
│       Broadcast SSE: FinetuneJobUpdate                  │
│       { job_id, status }                                │
│    4. Every 3rd poll cycle (~90s), rate-limited:        │
│       Fetch finetune scores from cloud                  │
│       GET cloud /evaluations?job_id={provider_job_id}   │
│       → Write per-row scores → workflow_record_scores   │
│       → Broadcast SSE: RecordScoresUpdated              │
│       (rate-limited because finetune evals update less  │
│        frequently than eval jobs)                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FE: FinetuneJobsContext                                 │
│  Polls cloud-proxy every 20s for PROGRESS (evaluations) │
│  SSE for STATUS TRANSITIONS                             │
│  VIEW-SCOPED: only polls when FinetuneJobsProvider      │
│  is mounted (DatasetDetailView)                         │
│                                                         │
│  Polling (active jobs only):                            │
│  1. GET /finetune/workflows/{wf_id}/                    │
│     finetune-evaluations?finetune_job_id=...            │
│     (cloud-proxy — per-row scores across epochs)        │
│  2. Updates jobEvaluations state for UI                 │
│  3. Stop conditions:                                    │
│     a. Interval callback checks job status — stops      │
│        if no longer pending/running                     │
│     b. useEffect stops polling when job status changes  │
│     c. Cleanup effect stops all on unmount              │
│                                                         │
│  SSE subscription:                                      │
│  1. On "finetune_job_update" → updates job status       │
│  2. On terminal (succeeded/failed) → emits completion   │
│     event, useEffect stops eval polling                 │
│  3. On SSE reconnect → re-fetches job list              │
│                                                         │
│  On-demand: refreshJobEvaluations(jobId)                │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Finetune Job Detail UI

```
┌─────────────────────────────────────────────────────────┐
│  TrainingJobDetail component                            │
│                                                         │
│  Data source: finetune_jobs table via polling            │
│                                                         │
│  Displays:                                              │
│  ┌───────────────────────────────────────────────┐      │
│  │ Status: Running                               │      │
│  │ Base Model: unsloth/Qwen3.5-4B                │      │
│  │                                               │      │
│  │ Training Loss Chart:                          │      │
│  │   1.2 ┤╲                                      │      │
│  │   0.8 ┤  ╲___                                 │      │
│  │   0.4 ┤      ╲____                            │      │
│  │   0.2 ┤           ╲___________                │      │
│  │       └──────────────────────── steps          │      │
│  │                                               │      │
│  │ Tokens trained: 125,000                       │      │
│  │ Fine-tuned model: ft:qwen3.5-4b:abc123        │      │
│  └───────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 3.4 Post-Training Flows

```
Training completes (status: "succeeded")
        │
        ├──► Deploy: POST /finetune/deployments
        │    → Creates inference endpoint for fine-tuned model
        │
        ├──► Download Weights: GET /finetune/jobs/{id}/weights
        │    → Downloads LoRA adapter weights
        │
        └──► Run Post-Training Eval: same as §2 Eval Job Flow
             → Uses fine-tuned model as rollout_model
             → Scores written as "finetune" type in workflow_record_scores
```

---

## 4. Score Writeback Flow

### 4.1 Eval Score Writeback

Runs on **every poll cycle** (every 30s), not just on status change.
This means scores are written incrementally while the eval job is running,
so the FE can show partial scores before the job completes.

```
EvalJobStateTracker polls cloud → gets results
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  write_eval_scores(workflow_id, job_id, results)        │
│                                                         │
│  1. For each result row:                                │
│     - record_id = row.id (cloud row ID maps 1:1 to     │
│       workflow_records.id — set during dataset upload)  │
│     - score = latest epoch average from row.epochs      │
│  2. Build Vec<(record_id, score)>                       │
│  3. WorkflowRecordScoreService::batch_upsert(           │
│       workflow_id, job_id,                              │
│       score_type: "eval",                               │
│       scores: [(record_id, score), ...]                 │
│     )                                                   │
│  4. For each (record_id, score):                        │
│     - Try UPDATE WHERE record_id + job_id + score_type  │
│     - If 0 rows affected → INSERT new row               │
│  5. Broadcast SSE: RecordScoresUpdated {                │
│       workflow_id, score_type: "eval", updated_count    │
│     }                                                   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Finetune Score Writeback

Runs every **3rd poll cycle** (~90s), rate-limited because finetune
evaluations update less frequently than eval jobs. Like eval writeback,
scores are written incrementally during the running phase.

```
FinetuneJobStateTracker (every 3rd poll cycle, ~90s)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  write_finetune_scores(workflow_id, job_id)             │
│                                                         │
│  1. GET cloud /evaluations?job_id={provider_job_id}     │
│  2. For each result row:                                │
│     - record_id = row.id (same mapping as eval)         │
│     - score = latest epoch average from row.epochs      │
│  3. WorkflowRecordScoreService::batch_upsert(           │
│       workflow_id, job_id,                              │
│       score_type: "finetune",                           │
│       scores: [(record_id, score), ...]                 │
│     )                                                   │
│  4. Broadcast SSE: RecordScoresUpdated {                │
│       workflow_id, score_type: "finetune",              │
│       updated_count                                     │
│     }                                                   │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Database Schema

```
workflow_record_scores
┌──────────────┬────────┬──────────────────────────────────┐
│ Column       │ Type   │ Notes                            │
├──────────────┼────────┼──────────────────────────────────┤
│ id           │ TEXT   │ PK, UUID                         │
│ record_id    │ TEXT   │ FK → workflow_records.id          │
│ workflow_id  │ TEXT   │ FK → workflow_records.workflow_id │
│ job_id       │ TEXT   │ eval_job or finetune_job ID       │
│ score_type   │ TEXT   │ "eval" or "finetune"             │
│ score        │ FLOAT  │ 0.0–1.0                          │
│ created_at   │ TEXT   │ ISO timestamp                    │
└──────────────┴────────┴──────────────────────────────────┘
UNIQUE(record_id, job_id, score_type)
```

---

## 5. Real-Time UI Updates (SSE)

### 5.1 SSE Event Flow

```
Gateway broadcasts SSE event
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  FE: ProjectEventsConsumer (project-events/)             │
│                                                         │
│  Listens on EventSource connection to gateway            │
│  Dispatches to subscribers by event type                │
└────────┬───────────────────────┬────────────────────────┘
         │                       │
         ▼                       ▼
┌──────────────────────┐ ┌─────────────────────────────┐
│ EvalJobUpdate        │ │ RecordScoresUpdated          │
│ {job_id, wf_id,      │ │ {workflow_id, score_type,    │
│  status}             │ │  updated_count}              │
│                      │ │                             │
│ → EvalJobsContext    │ │ → DatasetDetailContext      │
│   On terminal status:│ │   refreshes records table   │
│   stops FE polling + │ │   (scores column updates)   │
│   processes results  │ │                             │
└──────────────────────┘ └─────────────────────────────┘

┌─────────────────────────────────┐
│ FinetuneJobUpdate               │
│ {job_id, status}                │
│                                 │
│ → FinetuneJobsContext           │
│   updates job status in state   │
│   if terminal → emits completion│
│   event, useEffect stops polling│
└─────────────────────────────────┘
```

### 5.2 Records Table View (Live Score Updates)

```
SSE: RecordScoresUpdated { workflow_id, score_type, updated_count }
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  DatasetDetailContext                                    │
│                                                         │
│  useEffect subscribes to "record_scores_updated":       │
│    if (event.workflow_id === currentWorkflowId)          │
│      → refreshDataset() (re-fetches records + scores)   │
│                                                         │
│  Records table re-renders with updated scores:          │
│  ┌──────────┬───────────┬──────────────┬──────────────┐ │
│  │ Record   │ Topic     │ Eval Score   │ FT Score     │ │
│  ├──────────┼───────────┼──────────────┼──────────────┤ │
│  │ row-001  │ Auth      │ 0.85         │ 0.92         │ │
│  │ row-002  │ Payments  │ 0.20         │ 0.45         │ │
│  │ row-003  │ Auth      │ 0.95         │ —            │ │
│  └──────────┴───────────┴──────────────┴──────────────┘ │
│                                                         │
│  Score display logic (api-record-adapter.ts):           │
│  - Records and scores are separate APIs, fetched in     │
│    parallel: GET /records + GET /records/scores          │
│  - Combined client-side in api-record-adapter.ts        │
│  - Groups scores by record_id                           │
│  - Shows latest eval score + latest finetune score      │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Data Model Reference

### 6.1 Key Tables (SQLite — Gateway)

| Table | Key Fields | Purpose |
|-------|-----------|---------|
| `workflows` | id, name, objective, eval_script, state | Dataset/workflow metadata |
| `workflow_records` | id, workflow_id, data, topic, is_generated | Dataset rows |
| `workflow_record_scores` | id, record_id, workflow_id, job_id, score_type, score | Per-row scores from eval/finetune |
| `eval_jobs` | id, workflow_id, cloud_run_id, status, polling_snapshot, result | Tracks eval job lifecycle |
| `finetune_jobs` | id, workflow_id, provider_job_id, base_model, status, metrics, model_id | Tracks training job lifecycle |

### 6.2 Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/finetune/workflows/{id}` | GET | Workflow detail + records_count, eval_job_ids, finetune_job_ids |
| `/finetune/workflows/{id}/records` | GET | List all records for a workflow |
| `/finetune/workflows/{id}/records/count` | GET | Record count only (`{ count: N }`) |
| `/finetune/workflows/{id}/records/scores` | GET | List all scores for a workflow |
| `/finetune/evaluations` | POST | Create eval job (triggers ensure_dataset_uploaded) |
| `/finetune/evaluations/{id}` | GET | Poll eval results from cloud |
| `/finetune/workflows/{id}/jobs` | POST | Create finetune job (triggers ensure_dataset_uploaded) |
| `/finetune/workflows/{id}/jobs/{job_id}` | GET | Get finetune job status |
| `/finetune/workflows/{id}/jobs/{job_id}/metrics` | GET | Get training metrics |

### 6.3 Key FE State

| Context | Manages | Data Source |
|---------|---------|-------------|
| `DatasetsContext` | Dataset list + CRUD | GET /finetune/workflows |
| `DatasetDetailContext` | Current dataset records + scores | GET /finetune/workflows/{id}/records + /scores |
| `EvalJobsContext` | Eval jobs + progress polling | Reads BE `polling_snapshot` (10s) + SSE for status transitions. Catch-up cloud fetch on race condition. |
| `FinetuneJobsContext` | Finetune jobs + eval polling | Polls cloud-proxy `GET /finetune-evaluations` (20s) + SSE for status transitions |

### 6.4 FE Dataset Type (enriched fields)

```typescript
interface Dataset {
  // ... base fields (id, name, createdAt, etc.)

  // Enriched from GET /workflows/:id (not present in list response)
  recordsCount?: number;     // from records_count
  evalJobIds?: string[];     // from eval_job_ids
  finetuneJobIds?: string[]; // from finetune_job_ids
}
```

### 6.5 SSE Event Types (CustomEventType variants)

| SSE Event | Payload | FE Consumer | FE Reaction |
|-----------|---------|-------------|-------------|
| `eval_job_update` | `{ job_id, workflow_id, status }` | `EvalJobsContext` | If terminal (completed/failed) → stop polling + process final results |
| `finetune_job_update` | `{ job_id, status }` | `FinetuneJobsContext` | Update status in local state; if terminal → emit completion event |
| `record_scores_updated` | `{ workflow_id, score_type, updated_count }` | `DatasetDetailContext` | Refresh records table (scores column updates) |

### 6.6 Polling Architecture

**FE polls cloud-proxy for progress + SSE for status transitions:**

| Component | Location | Interval | Purpose |
|-----------|----------|----------|---------|
| `EvalJobStateTracker` | Gateway (background) | 30s | Status tracking + score writeback + polling_snapshot persistence. Saves full cloud response as `polling_snapshot` on every poll cycle (FE reads this for progress). Writes scores on every poll cycle. Broadcasts `EvalJobUpdate` SSE on status change + `RecordScoresUpdated` SSE on every score write. |
| `FinetuneJobStateTracker` | Gateway (background) | 30s (scores every 3rd cycle, ~90s) | Status tracking + score writeback. Writes scores every 3rd poll (rate-limited). Broadcasts `FinetuneJobUpdate` SSE on status change + `RecordScoresUpdated` SSE on score write. |
| `evalPollingManager` | FE (foreground, view-scoped) | 10s | Reads polling_snapshot from BE (no direct cloud calls). Performs catch-up fetch from cloud API if terminal status detected with no results (race condition guard). Started/stopped by EvalJobsContext lifecycle. Stops on terminal status or unmount. |
| `FinetuneJobsContext` | FE (foreground, view-scoped) | 20s | Polls cloud-proxy `GET /finetune-evaluations` for training eval progress. Stops when job status is no longer active or on unmount. |

**Why each exists:**
- **BE polls cloud** → writes per-row scores to `workflow_record_scores` on every poll cycle (incremental updates while running), saves full cloud response as `polling_snapshot` in eval_jobs (FE progress source), tracks status in SQLite, broadcasts SSE on transitions + score updates
- **FE polls BE** → reads `polling_snapshot` from gateway SQLite for progress data (completed_rows, per-row scores). No direct cloud calls unless catch-up fetch needed (terminal status with missing results — race condition guard).
- **SSE** → instant notification of status transitions (completed/failed) so FE doesn't wait for next poll cycle; `RecordScoresUpdated` triggers FE to re-fetch scores

**Data flow:**
```
Cloud ← BE polls (30s) → SQLite (scores, status, polling_snapshot) → SSE (status transitions + score updates)
SQLite (polling_snapshot) ← FE polls (10s) → UI state (progress, per-row data)
Cloud ← FE catch-up fetch (only on race condition: terminal + no results)
```

### 6.7 Cascade Delete

```
Delete workflow_records
  └──► DELETE FROM workflow_record_scores WHERE record_id IN (...)
       (handled in WorkflowRecordService::delete, delete_all, replace_all)
```

### 6.8 Data Flow: What lives where

```
                  FE (Browser)                    Gateway (SQLite)              Cloud API
                  ────────────                    ────────────────              ─────────
Datasets          Dataset type (in-memory)        workflows table               /datasets (uploaded JSONL)
Records           DatasetRecord[] (fetched)       workflow_records table        (inside uploaded dataset)
Topics            TopicHierarchyConfig            workflow_topics table         (inside uploaded dataset)
Eval Jobs         In-memory (context state)       eval_jobs table               /evaluations/{id}
Finetune Jobs     FinetuneProcessContext          finetune_jobs table           /fine-tuning/jobs/{id}
Scores            Fetched separately via           workflow_record_scores table  (computed during eval/training)
                  GET /records/scores, combined   (per-job, per-row, with       Written incrementally by BE
                  client-side in adapter           score_type: eval/finetune)   state trackers on each poll
```
