# End-to-End Flow: FE → Gateway → Cloud API → Distri

How Lucy and the finetune pipeline connect across 4 systems.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser (localhost:5173)                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  React UI                                                        │       │
│  │  ├── Lucy Sidebar (chat, catch-up cards, auto-trigger)          │       │
│  │  ├── Dataset workspace (7-step pipeline UI)                     │       │
│  │  ├── IndexedDB (datasets, workflows, jobs, iterations)          │       │
│  │  └── 53 finetune tools (execute locally in browser)             │       │
│  └──────────┬──────────────────────────────────┬───────────────────┘       │
│             │ HTTP REST                         │ WebSocket (A2A)           │
└─────────────┼──────────────────────────────────┼───────────────────────────┘
              │                                   │
              ▼                                   ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  vLLora Gateway (Rust)      │   │  Distri Server (Rust)       │
│  localhost:9090              │   │  localhost:8081              │
│  ├── REST API (60+ routes)  │   │  ├── Agent orchestrator     │
│  ├── SSE event streaming    │   │  ├── LLM ↔ tool loop       │
│  ├── Finetune state tracker │   │  ├── A2A protocol handler   │
│  ├── SQLite (local state)   │   │  └── WebSocket streaming    │
│  └── Cloud API proxy        │   └─────────────────────────────┘
│             │                │
└─────────────┼────────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LangDB Cloud API (https://api.langdb.cloud)                    │
│  ├── PostgreSQL (datasets, evaluations, jobs, deployments)      │
│  ├── Evaluator engine (LLM-as-Judge + JavaScript)               │
│  └── Provider abstraction                                       │
│             │                                                    │
└─────────────┼────────────────────────────────────────────────────┘
              │ Provider API
              ▼
┌─────────────────────────────┐
│  Finetune Providers          │
│  ├── Fireworks.ai (default)  │
│  ├── OpenAI                  │
│  ├── GCP                     │
│  └── Vertex AI               │
└─────────────────────────────┘
```

---

## Port Map

| Service | Default Port | Env Override | Protocol |
|---------|-------------|--------------|----------|
| React UI (Vite) | 5173 | — | HTTP |
| vLLora Gateway | 9090 | `VITE_BACKEND_PORT` | HTTP REST + SSE |
| Distri Server | 8081 | `VITE_DISTRI_PORT` | HTTP + WebSocket |
| OTEL Collector | 4317 | `VITE_OTEL_PORT` | gRPC |
| LangDB Cloud | — | `LANGDB_API_URL` | HTTPS |

---

## Connection Types

### 1. FE → Gateway (HTTP REST)

All API calls go through `src/services/finetune-api.ts` and other service files. Base URL resolved from `VITE_BACKEND_PORT` (default 9090). Requests include `x-project-id` header for project scoping.

### 2. FE → Distri (WebSocket / A2A)

Lucy chat uses the vendored `@distri/react` and `@distri/core` packages. WebSocket connection to `localhost:8081/v1`. The A2A (Agent-to-Agent) protocol handles message streaming, tool execution requests, and plan state.

### 3. Gateway → Cloud API (HTTPS proxy)

The gateway's `LangdbCloudFinetuneClient` (in `vllora/finetune/src/client.rs`) forwards finetune requests to `https://api.langdb.cloud`. Auth via `LANGDB_API_KEY` (Bearer token). All `/finetune/*` endpoints are proxied.

### 4. Gateway → Distri (managed process)

The gateway downloads and manages the Distri binary (`~/.vllora/distri/`). Auto-downloads from GitHub releases, starts with `./distri serve --headless --port=8081`, health-checks via `GET /v1/agents`.

---

## Flow by Pipeline Step

### Step 1: Topics Config

```
User types in Lucy chat
  → FE: WebSocket message to Distri (A2A protocol)
  → Distri: LLM generates topic hierarchy
  → Distri: Sends tool call `configure_topics` back to browser
  → FE: Tool executes locally, saves to IndexedDB
  → FE: Updates workflow state in IndexedDB
```

No cloud API call. Topics are local-only.

### Step 2: Categorization

```
Lucy proposes categorization
  → Distri: LLM calls `categorize_records` tool
  → FE: Tool executes locally, assigns topics to records in IndexedDB
```

No cloud API call. Pure local operation.

### Step 3: Coverage & Generation

```
Lucy calls `generate_initial_data` tool
  → FE: Tool executes locally, calls LLM via Gateway for data generation
  → FE: Gateway proxies chat/completions to LLM provider
  → FE: Generated records saved to IndexedDB
```

Uses Gateway's `POST /v1/chat/completions` for LLM calls (not the finetune cloud API).

### Step 4: Grader Config

```
Lucy calls `configure_grader` tool
  → FE: Tool executes locally, builds grader script
  → FE: Optionally calls `test_grader_sample` (auto_test)
      → FE: POST /finetune/datasets (upload temp dataset to cloud)
      → Gateway: Proxies to Cloud API
      → Cloud: Stores dataset, runs evaluator on sample
      → FE: Receives test scores, displays in Lucy chat
```

First cloud API touchpoint (if auto_test enabled).

### Step 5: Evaluation (Dry Run)

```
Lucy calls `run_evaluation` tool
  → FE: Tool uploads dataset + grader to cloud
      1. POST /finetune/datasets                    (upload JSONL + grader)
         → Gateway → Cloud API → stores in PostgreSQL
      2. POST /finetune/evaluations                 (start eval run)
         → Gateway → Cloud API → creates evaluation_run record
         → Cloud: Evaluator engine scores each row (LLM-as-Judge or JS)
  → FE: Saves job to IndexedDB, starts DryRunPollingManager

DryRunPollingManager (6s interval):
  → FE: GET /finetune/evaluations/{run_id}
  → Gateway → Cloud API → returns { status, completed_rows, total_rows, results }
  → FE: Updates IndexedDB, emits vllora_dry_run_job_update events
  → FE: LucyEvalProgressCard shows live progress

On completion:
  → FE: Persists per-record scores to dataset records in IndexedDB
  → FE: Emits vllora_dry_run_job_completed event
  → FE: LucySidebar catches event, auto-sends Lucy analysis message
  → Distri: Lucy calls analyze_evaluation tool
  → FE: Tool runs RFT decision tree locally (score health, topics, stalls)
  → FE: LucyAnalyzeEvalRenderer shows results card
```

### Step 6: Training (Finetune)

```
Lucy calls `start_training` tool
  → FE: POST /finetune/reinforcement-jobs
      → Gateway → Cloud API → creates finetune_job record
      → Cloud: Forwards to provider (Fireworks/OpenAI/GCP/Vertex)
      → Provider: Starts RFT training job

Gateway State Tracker (30s interval, background):
  → Gateway: GET /reinforcement-jobs/{job_id}/status from Cloud API
  → Gateway: Updates local SQLite if state changed
  → Gateway: Broadcasts FinetuneJobUpdate via SSE

FE SSE listener:
  → FE: GET /events (SSE stream from Gateway)
  → FE: Receives FinetuneJobUpdate events
  → FE: Updates FinetuneJobsContext

FE also polls training metrics:
  → FE: GET /finetune/reinforcement-jobs/{job_id}/metrics
  → Gateway → Cloud API → returns { metrics: [...] }

On completion:
  → FE: Emits vllora_finetune_job_completed event
  → FE: LucySidebar auto-sends Lucy analysis message
  → Distri: Lucy calls analyze_training + get_training_metrics
  → FE: Tools run locally (per-epoch analysis, overfitting detection)
  → FE: LucyAnalyzeTrainingRenderer shows results card

Training eval results (per-epoch scores):
  → FE: GET /finetune/datasets/{id}/finetune-evaluations
  → Gateway → Cloud API → returns per-record per-epoch scores
```

### Step 7: Deployment

```
Lucy calls deployment tool
  → FE: POST /finetune/deployments
      → Gateway → Cloud API → creates deployment record
      → Cloud: Registers model in global_model_info
      → Cloud: Forwards to provider for model hosting
  → FE: Model becomes available for inference
```

---

## Finetune Endpoint Table

All endpoints used in the finetune flow. Gateway base: `localhost:9090/lucy/v1`. Cloud base: `https://api.langdb.cloud/projects/{pid}`.

> **Pipeline step** column shows which step(s) in the 7-step pipeline use this endpoint.

| # | Method | Gateway Route | FE Function (`finetune-api.ts`) | Cloud Proxy Path | Pipeline Step | Purpose |
|---|--------|--------------|--------------------------------|------------------|---------------|---------|
| 1 | POST | `/finetune/datasets` | `uploadDataset()` | `POST /finetune/datasets` | Evaluation, Training | Upload JSONL dataset + grader script (multipart) |
| 2 | GET | `/finetune/datasets/{id}/analytics` | `getDatasetAnalytics()` | `GET /finetune/datasets/{id}/analytics` | Evaluation | Dataset quality metrics |
| 3 | POST | `/finetune/datasets/analytics/dry-run` | `getDryRunAnalytics()` | `POST /finetune/datasets/analytics/dry-run` | Evaluation | Preview analytics without persisting |
| 4 | PATCH | `/finetune/datasets/{id}/evaluator` | `updateDatasetEvalScript()` | `PATCH /finetune/datasets/{id}/evaluator` | Grader | Update grader config (creates new version) |
| 5 | GET | `/finetune/datasets/{id}/evaluator/versions` | `getEvaluatorVersions()` | `GET /finetune/datasets/{id}/evaluator/versions` | Grader | Evaluator version history with diffs |
| 6 | POST | `/finetune/evaluations` | `createEvaluation()` | `POST /finetune/datasets/evaluations` | Evaluation | Start evaluation (dry run) |
| 7 | GET | `/finetune/evaluations/{run_id}` | `getEvaluationResult()` | `GET /finetune/datasets/evaluations/{run_id}` | Evaluation (polling) | Poll eval status + per-row results (6s interval) |
| 8 | GET | `/finetune/datasets/{id}/finetune-evaluations` | `getFinetuneEvaluations()` | `GET /finetune/datasets/{id}/finetune-evaluations` | Training (analysis) | Per-record per-epoch training scores |
| 9 | POST | `/finetune/reinforcement-jobs` | `createReinforcementJob()` | `POST /finetune/reinforcement-jobs` | Training | Start RFT job (also saves to gateway SQLite) |
| 10 | GET | `/finetune/reinforcement-jobs` | `listReinforcementJobs()` | — (local SQLite only) | Training | List cached jobs (no cloud call) |
| 11 | GET | `/finetune/reinforcement-jobs/{id}/status` | `getReinforcementJobStatus()` | Fallback: `GET /finetune/reinforcement-jobs/{id}/status` | Training (polling) | Job status (local first, cloud fallback) |
| 12 | GET | `/finetune/reinforcement-jobs/{id}/metrics` | `getReinforcementJobMetrics()` | `GET /finetune/reinforcement-jobs/{id}/metrics` | Training (analysis) | GRPO/GSPO reinforcement metrics |
| 13 | POST | `/finetune/reinforcement-jobs/{id}/cancel` | `cancelReinforcementJob()` | `POST /finetune/reinforcement-jobs/{id}/cancel` | Training | Cancel running job |
| 14 | POST | `/finetune/reinforcement-jobs/{id}/resume` | `resumeReinforcementJob()` | `POST /finetune/reinforcement-jobs/{id}/resume` | Training | Resume cancelled job |
| 15 | GET | `/finetune/reinforcement-jobs/{id}/weights/url` | `getWeightsDownloadUrl()` | `GET /finetune/reinforcement-jobs/{id}/weights/url` | Deployment | Signed URL for trained weights |
| 16 | POST | `/finetune/deployments` | `deployModel()` | `POST /finetune/deployments` | Deployment | Deploy fine-tuned model |
| 17 | DELETE | `/finetune/deployments/{id}` | `deleteDeployment()` | `DELETE /finetune/deployments/{id}` | Deployment | Delete deployment |
| 18 | POST | `/finetune/topic-hierarchy/generate` | — (via Distri) | — (local LLM) | Topics | Generate topic hierarchy |
| 19 | POST | `/finetune/topic-hierarchy/adjust` | — (via Distri) | — (local LLM) | Topics | Adjust topic hierarchy |
| 20 | POST | `/v1/chat/completions` | — (via tools) | — (routes to LLM provider) | Coverage & Generation | LLM inference for synthetic data generation |
| 21 | GET | `/events` | SSE in `FinetuneJobsContext` | — (gateway broadcasts) | Training (polling) | Real-time job status updates via SSE |

### Summary

| | Count | Notes |
|---|-------|-------|
| **Total finetune endpoints** | 21 | |
| **Proxied to Cloud API** | 15 | All `/finetune/datasets/*`, `/finetune/evaluations/*`, `/finetune/reinforcement-jobs/*`, `/finetune/deployments/*` |
| **Local only (gateway)** | 4 | List jobs (#10), topic hierarchy (#18-19), chat completions (#20) |
| **Hybrid** | 1 | Job status (#11) — local first, cloud fallback |
| **SSE (real-time)** | 1 | Events stream (#21) — gateway broadcasts from its own polling |

---

## Cloud API Internals

### Tech Stack
- **Language**: Rust (Actix-web)
- **Database**: PostgreSQL (Diesel ORM)
- **Evaluator**: LLM-as-Judge (ChatCompletion) + JavaScript (with configurable timeout)

### Provider Abstraction

The cloud API uses a trait-based `FinetuningProvider` to support multiple backends:

| Provider | Env Key | Default |
|----------|---------|---------|
| Fireworks.ai | `VLLORA_FIREWORKSAI_API_KEY` | Yes |
| OpenAI | `VLLORA_OPENAI_API_KEY` | No |
| GCP | `VLLORA_GCP_FINETUNE_URL` + `_API_KEY` | No |
| Vertex AI | `VERTEX_PROJECT_ID` + `_LOCATION` + `_CONTAINER_IMAGE` + `_GCS_BUCKET` | No |

Selected via `FINETUNE_PROVIDER_NAME` env var (default: `"fireworksai"`).

### Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `datasets` | Dataset metadata (id, external_id, provider, project_id, topic_hierarchy) |
| `dataset_rows` | Individual JSONL rows (id, dataset_id, row_data, row_index) |
| `evaluators` | Evaluator configs versioned (id, dataset_id, version, config) |
| `evaluation_runs` | Evaluation batch (id, dataset_id, status, total_rows, completed_rows) |
| `evaluation_results` | Per-row eval (id, run_id, row_id, score, reason, logs) |
| `finetune_jobs` | Training jobs (id, external_id, provider, dataset_id, status, request) |
| `finetune_job_metrics` | Metrics history (id, job_id, metrics, created_at) |
| `deployments` | Deployments (id, project_id, model_id, provider, external_id, state) |

### Evaluation Flow (inside Cloud)

```
POST /evaluations (with dataset_id + evaluator config)
  → Cloud creates evaluation_run record (status: pending)
  → For each row in dataset:
      → If LLM-as-Judge: sends ChatCompletion to LLM with grader prompt + row
      → If JavaScript: runs JS evaluator with row data (15s timeout)
      → Stores score + reason + logs in evaluation_results
      → Increments completed_rows
  → Sets status to completed/failed
```

### Training Flow (inside Cloud)

```
POST /reinforcement-jobs (with dataset_id, base_model, training_config)
  → Cloud creates finetune_job record
  → Uploads dataset to provider (Fireworks/OpenAI/etc.)
  → Calls provider.create_reinforcement_job()
  → Provider runs RFT training (minutes to hours)
  → Gateway state tracker polls status every 30s
  → On completion: fine_tuned_model ID available
  → Metrics accumulated via provider polling or POST /metrics callback
```

---

## Data Residency

| Data | Where it lives | Persistence |
|------|---------------|-------------|
| Datasets (records, topics, metadata) | Browser IndexedDB | Permanent (local-first) |
| Workflow state (7-step progress) | Browser IndexedDB | Permanent |
| Evaluation jobs (status, results) | Browser IndexedDB + Cloud PostgreSQL | Both |
| Per-record scores | Browser IndexedDB (copied from cloud on completion) | Permanent locally |
| Training jobs | Cloud PostgreSQL + Gateway SQLite (cache) | Cloud is source of truth |
| Training metrics (GRPO/GSPO) | Cloud PostgreSQL | Cloud is source of truth |
| Iteration state (proposals, history) | Browser IndexedDB | Permanent |
| Chat messages | Not persisted (fresh thread per session) | Ephemeral |
| Trained model weights | Provider storage (Fireworks/OpenAI) | Provider-managed |
| Deployed models | Cloud PostgreSQL (global_model_info) | Cloud is source of truth |

---

## Event & Polling Architecture

### Evaluation Polling (FE-driven)

```
DryRunPollingManager (singleton, survives page refresh via IndexedDB)
  │
  ├── Poll: GET /finetune/evaluations/{run_id} every 6s
  │   → Gateway → Cloud API → returns status + partial results
  │
  ├── Emit: vllora_dry_run_job_update (progress events)
  │   → LucyEvalProgressCard shows live progress
  │
  ├── On complete: vllora_dry_run_job_completed
  │   → LucySidebar auto-triggers Lucy analysis
  │   → Scores persisted to IndexedDB records
  │
  └── Timeout: 92 minutes max
```

### Training Polling (Gateway-driven + FE SSE)

```
Gateway State Tracker (background task)
  │
  ├── Poll: GET /reinforcement-jobs/{id}/status every 30s
  │   → Cloud API → returns status from provider
  │
  ├── On state change: broadcast FinetuneJobUpdate via SSE
  │   → FE: GET /events (SSE stream)
  │   → FE: FinetuneJobsContext updates React state
  │
  └── On terminal state: sets completed_at, stops polling

FE also directly polls metrics:
  └── GET /reinforcement-jobs/{id}/metrics (on-demand, not interval)
```

### Lucy Auto-Trigger (FE event chain)

```
Job completes (eval or training)
  → Event: vllora_dry_run_job_completed / vllora_finetune_job_completed
  → LucySidebar listener catches event
  → Emits: vllora_lucy_prompt (with analysis request)
  → Lucy chat sends message to Distri via WebSocket
  → Distri: LLM decides to call analyze_evaluation / analyze_training
  → Tool executes locally in browser
  → Result rendered as UI card in chat
```

---

## Session Resumption (Catch-Up Flow)

When user reopens a dataset after being away:

```
1. FE creates fresh thread (no message history restored)
2. buildCatchUpContext() runs:
   ├── Reads unreviewed dry-run jobs from IndexedDB
   ├── Reads iteration state from IndexedDB
   ├── Reads workflow state from IndexedDB
   ├── Resolves training status (cross-references stale workflow state vs cloud API)
   ├── For completed training: fetches epoch scores via getFinetuneEvaluations()
   └── Returns { text: string, cards: CatchUpCardData }

3. LucyCatchUpCard renders as landing view:
   ├── Completed steps (green checkmarks)
   ├── Score matrix (eval + training rows)
   ├── Per-topic breakdown (color-coded scores)
   ├── Proposed changes (if any)
   └── Action buttons (Accept & Apply, Modify, etc.)

4. Text context injected into first Lucy message:
   → Distri receives full catch-up context
   → Lucy knows what happened while user was away
   → Lucy can propose next actions
```

---

## Non-Finetune Gateway Routes

The gateway also handles routes unrelated to finetune that the FE uses:

| Area | Key Routes | Purpose |
|------|-----------|---------|
| **Chat** | `POST /v1/chat/completions` | LLM inference (used by data generation) |
| **Models** | `GET /v1/models`, `GET /v1/pricing` | Available models list |
| **Projects** | `GET/POST/PUT/DELETE /projects` | Project management |
| **Providers** | `GET/POST/PUT/DELETE /providers` | API key management |
| **Agents** | `POST /agents/register`, `GET /agents/config` | Lucy agent setup |
| **Threads** | `GET/POST/PUT /threads` | Chat thread management |
| **Traces** | `GET /runs`, `GET /spans`, `GET /traces` | Observability |
| **Debug** | `POST /debug/continue`, `GET /debug/breakpoints` | Agent debugging |
| **MCP** | gRPC scope at `/mcp` | MCP protocol |
| **Events** | `GET /events` (SSE) | Real-time event streaming |

---

## Key Files Reference

### Frontend (this repo)
| File | Purpose |
|------|---------|
| `src/services/finetune-api.ts` | All cloud-proxied API calls (963 lines) |
| `src/services/dry-run-polling-manager.ts` | Evaluation polling (538 lines) |
| `src/hooks/useFineTuneAgentChat.ts` | Chat hook with catch-up logic |
| `src/lib/distri-finetune-tools/steps/` | 53 tool implementations (local execution) |
| `src/contexts/FinetuneJobsContext.tsx` | Training job state + SSE listener |

### Gateway (`vllora/gateway`)
| File | Purpose |
|------|---------|
| `src/http.rs` | All HTTP route definitions |
| `src/distri.rs` | Distri binary management |
| `src/finetune_state_tracker.rs` | Background job polling + SSE broadcast |
| `src/config.rs` | Port and URL configuration |

### Finetune Client (`vllora/finetune`)
| File | Purpose |
|------|---------|
| `src/client.rs` | `LangdbCloudFinetuneClient` — all cloud API calls |

### Cloud API (`langdb-cloud`)
| File | Purpose |
|------|---------|
| `cloud/src/server/handler/finetune/dataset.rs` | Dataset endpoints (501 lines) |
| `cloud/src/server/handler/finetune/eval.rs` | Evaluation endpoints (579 lines) |
| `cloud/src/server/handler/finetune/job.rs` | Training job endpoints (492 lines) |
| `cloud/src/server/handler/finetune/deployment.rs` | Deployment endpoints (238 lines) |
| `cloud/src/finetune/provider.rs` | Provider trait abstraction |
| `cloud/src/finetune/provider/fireworks.rs` | Fireworks.ai implementation |
| `cloud/src/data/schema.rs` | PostgreSQL schema (Diesel) |

### Distri Server (`distri`)
| File | Purpose |
|------|---------|
| `server/distri-core/src/agent/orchestrator.rs` | Agent lifecycle management |
| `server/distri-core/src/agent/agent_loop.rs` | LLM ↔ tool execution loop |
| `server/distri-core/src/a2a/handler.rs` | A2A protocol handler |
| `server/distri-core/src/tools/mod.rs` | Tool execution framework |

### Agent Definitions (`vllora/gateway/agents/finetune/`)
| File | Purpose |
|------|---------|
| `vllora-finetune-agent.md` | Orchestrator agent (plan-first routing) |
| `finetune-workflow-agent.md` | Workflow execution + iteration loops |
| `finetune-topics-agent.md` | Topic hierarchy sub-agent |
| `data-generation-agent.md` | Synthetic data generation sub-agent |
