# Lucy Finetune Dataset — Event Emitter Guide

> Last updated: 2026-02-12

## Why Events?

The Lucy Finetune feature uses an event emitter (`src/utils/eventEmitter.ts`) for communication between **tool handlers** (plain TypeScript in `src/lib/distri-finetune-tools/`) and **React components**. Tool handlers execute outside React's component tree — they can't access Context or setState — so events are the bridge.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  React Contexts (centralized state)                          │
│                                                              │
│  DatasetsContext          ←─ listens ── events ──┐           │
│  DatasetsUIContext        ←─ listens ── events ──┤           │
│  DatasetDetailContext     ←─ listens ── events ──┤           │
│  KnowledgeSourcesContext  ←─ listens ── events ──┤           │
│  PlanContext         ←─ listens ── events ──┤           │
│  DryRunJobsContext        ←─ listens ── events ──┤           │
│  FinetuneJobsContext      ←─ listens ── events ──┤           │
│                                                  │           │
├──────────────────────────────────────────────────┤───────────┤
│  React Components                                │           │
│                                                  │           │
│  DatasetDetailContentV2   ←─ listens ── events ──┤           │
│  PlanSection              ←─ listens ── events ──┤           │
│  LucyDatasetAssistant     ←─ listens ── events ──┤           │
│  KnowledgeSourcesPanel    ←─ listens ── events ──┤           │
│  EmptyRecordsState        ←─ listens ── events ──┤           │
│  ExecutionProgressCard    ←─ listens ── events ──┤           │
│  ExecutionProgressCard    ── emits ──► events ───┤           │
│  TopicRecordTree          ←─ listens ── events ──┤           │
│  TopicCanvasContext       ←─ listens ── events ──┤           │
│                                                  │           │
│  PlanEmptyState           ── emits ──► events ───┤           │
│  PlanSection              ── emits ──► events ───┤           │
│  RecordRow                ── emits ──► events ───┤           │
│  DocsProcessingState      ── emits ──► events ───┤           │
│  DryRunActivityView       ── emits ──► events ───┤           │
│  PerRowDetailsSection     ── emits ──► events ───┤           │
│                                                  │           │
└──────────────────────────────────────────────────┤───────────┘
                                                   │
┌──────────────────────────────────────────────────┤───────────┐
│  Tool Handlers & Services (outside React)        │           │
│                                                  │           │
│  propose-plan       ── emits ──► events ───┤           │
│  execute-plan       ── emits ──► events ───┤           │
│  generate-initial-data    ── emits ──► events ───┤           │
│  knowledge-sources        ── emits ──► events ───┤           │
│  categorize-records       ── emits ──► events ───┤           │
│  datasets-db (service)    ── emits ──► events ───┘           │
│  dry-run-jobs-db          ── emits ──► events                │
│  execution-state-store    ←─ listens ── events               │
│  execute-plan       ←─ listens ── events               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Event Reference

### 1. `vllora_lucy_prompt`

**Purpose:** Trigger Lucy to process a user prompt (expand sidebar if collapsed + inject message).

| | Details |
|---|---|
| **Data** | `{ prompt: string }` |
| **Direction** | React → React (many-to-one) |
| **Listener** | `LucyDatasetAssistant.tsx` — expands sidebar, injects prompt into chat |

**Emitters (~10 emit sites across 7 files):**
| File | When |
|------|------|
| `PlanEmptyState.tsx` | User clicks "Generate Plan" |
| `PlanPreview.tsx` | User approves plan → sends execute prompt |
| `PlanCompletedState.tsx` | User clicks "Generate New Plan" |
| `DatasetDetailContentV2.tsx` | Auto-plan trigger after docs finish processing |
| `DatasetDetailContentV2.tsx` | Timeout fallback if docs processing takes >60s |
| `DatasetDetailContentV2.tsx` | "Generate for topic" / "Generate subtopics" |
| `EmptyRecordsState.tsx` | User clicks "Ask Lucy" |
| `RecordRow.tsx` | User clicks "Generate variants" on a record |
| `SourcesProcessingMessage.tsx` | Docs finish processing in chat → auto-trigger plan |

---

### 2. `vllora_knowledge_source_updated`

**Purpose:** Notify that a knowledge source changed (created, processing progress, ready, failed, deleted).

| | Details |
|---|---|
| **Data** | `{ datasetId: string; sourceId?: string; progress?: { step, current?, total?, percent? } }` |
| **Direction** | Tool handler → React + React → React |

**Emitters:**
| File | When |
|------|------|
| `knowledge-sources.ts` (tool) | During extraction: progress updates, completion, failure |
| `LucyDatasetAssistant.tsx` | After user uploads files via chat |
| `empty-dataset-state/index.tsx` | After creating dataset with uploaded files |
| `KnowledgeSourcesPanel.tsx` | After user deletes a source |

**Listeners:**
| File | What it does |
|------|-------------|
| `KnowledgeSourcesContext.tsx` | Centralized listener — refreshes sources list, updates count/processing state |
| `KnowledgeSourcesPanel.tsx` | Refreshes sources list or updates progress inline |
| `SourcesProcessingMessage.tsx` | Checks if processing complete → triggers plan |

> **Note:** Previously `DatasetDetailContentV2`, `PlanSection`, and `LucyDatasetAssistant` each listened directly. These were consolidated into `KnowledgeSourcesContext` (see Contexts section below).

---

### 3. `vllora_plan_generating`

**Purpose:** Signal that plan generation has started (show loading UI).

| | Details |
|---|---|
| **Data** | `{ datasetId: string; switchToReadme?: boolean }` |
| **Direction** | Tool handler → React + React → React |

**Emitters:**
| File | When |
|------|------|
| `propose-plan/handler.ts` (tool) | LLM starts generating plan |
| `propose-plan/adjust-plan.ts` (tool) | LLM starts adjusting existing plan |
| `empty-dataset-state/index.tsx` | Immediately when creating dataset with files |

**Listeners:**
| File | What it does |
|------|-------------|
| `PlanContext.tsx` | Sets `isGeneratingPlan=true` |
| `PlanEmptyState.tsx` | Clears "Waiting for Lucy..." loading state |

> **Note:** `DatasetDetailContentV2.tsx` only EMITS this event (lines 361, 377 — auto-plan trigger). It does NOT listen to it. The auto-switch to the Plan tab happens via `PlanContext.isPlanPreviewActive`, which is set when `vllora_plan_proposed` fires.

---

### 4. `vllora_plan_proposed`

**Purpose:** A plan is ready for user review.

| | Details |
|---|---|
| **Data** | `{ datasetId: string; plan: Plan }` |
| **Direction** | Tool handler → React |

**Emitters:**
| File | When |
|------|------|
| `propose-plan/handler.ts` (tool) | Plan generated successfully |
| `propose-plan/adjust-plan.ts` (tool) | Adjusted plan ready |
| `update-plan-markdown.ts` (tool) | Agent updated plan markdown (e.g. checked off a step) |

**Listeners:**
| File | What it does |
|------|-------------|
| `PlanContext.tsx` | Clears loading state, sets `hasPlanProposed=true` |
| `PlanPreview.tsx` | Displays PlanEditor with the plan |

---

### 5. `vllora_plan_dismissed`

**Purpose:** Plan was dismissed (user discarded or docs not ready).

| | Details |
|---|---|
| **Data** | `{ datasetId: string }` |
| **Direction** | React → React + Tool → React |

**Emitters:**
| File | When |
|------|------|
| `PlanPreview.tsx` | User clicks "Discard Plan" |
| `propose-plan/handler.ts` (tool) | Docs still processing, can't generate yet |

**Listeners:**
| File | What it does |
|------|-------------|
| `PlanContext.tsx` | Clears generating/proposed state |
| `PlanPreview.tsx` | Clears proposed plan, resets UI |

---

### 6. `vllora_plan_approved`

**Purpose:** User approved the plan, trigger execution.

| | Details |
|---|---|
| **Data** | `{ datasetId: string; plan: Plan }` |
| **Direction** | React → Tool handler |

**Emitters:**
| File | When |
|------|------|
| `PlanPreview.tsx` | User clicks "Approve & Execute" |

**Listeners:**
| File | What it does |
|------|-------------|
| `execute-plan.ts` (tool) | Stores plan in memory, waits for Lucy to call execute tool |
| `execution-state-store.ts` (tool) | Stores plan in execution state + persists `'approved'` status to IndexedDB |
| `PlanContext.tsx` | Updates `planStatus` to `'approved'` + persists to IndexedDB |

---

### 7. `vllora_plan_progress`

**Purpose:** Real-time execution progress updates. Each progress event is written through to IndexedDB for refresh survival.

| | Details |
|---|---|
| **Data** | `{ progress: ExecutionProgress }` |
| **Direction** | Tool handler → React + IndexedDB |

**Emitters:**
| File | When |
|------|------|
| `execute-plan.ts` (tool) | After each step completes/fails |

**Listeners:**
| File | What it does |
|------|-------------|
| `PlanContext.tsx` | Updates execution state + persists progress to IndexedDB. On completion, calls `completePlan()`/`failPlan()` |
| `ExecutionProgressCard.tsx` | Renders step-by-step progress |
| `execution-state-store.ts` (tool) | In-memory cache + write-through to IndexedDB via `updatePlanExecution()`/`completePlan()`/`failPlan()` |

---

### 8. `vllora_switch_tab`

**Purpose:** Programmatically switch the active tab.

| | Details |
|---|---|
| **Data** | `{ datasetId: string; tab: 'records' \| 'evaluator' \| 'jobs' \| 'readme' \| 'docs' \| 'plan' }` |
| **Direction** | Tool handler → React + React → React |

**Emitters:**
| File | When |
|------|------|
| `execute-plan.ts` (tool) | After generating data → records, after grader → evaluator, after job → jobs |
| `ExecutionProgressCard.tsx` | User clicks "Start Fine-tuning" → jobs, or "Review Data" → records in completion footer |
| `DocsProcessingState.tsx` | User clicks "View Reference Docs" |
| `SourcesProcessingMessage.tsx` | Auto-switch to docs/plan during processing |
| `RecordRow.tsx` | User clicks evaluation/finetune link on a record |
| `DryRunActivityView.tsx` | User clicks "View Record" from dry run results |
| `PerRowDetailsSection.tsx` | User clicks "View in Dataset" from finetune job details |

**Listener:**
| File | What it does |
|------|-------------|
| `DatasetDetailContentV2.tsx` | Maps legacy tab names to explorer paths and opens workspace tabs via `openTab()` |

---

### 9. `vllora_workflow_updated`

**Purpose:** Workflow state changed (execution completed).

| | Details |
|---|---|
| **Data** | `{ datasetId: string }` |
| **Direction** | Tool handler → React |

**Emitters:**
| File | When |
|------|------|
| `execute-plan.ts` (tool) | Plan execution completes |

**Listeners:**
| File | What it does |
|------|-------------|
| `PlanContext.tsx` | Resets plan generation state |
| `PlanPreview.tsx` | Clears execution if complete |
| `useFineTuneAgentChat.ts` | Refreshes workflow data |
| `execution-state-store.ts` (tool) | Handles state cleanup |

---

### 10. `vllora_data_generation_progress`

**Purpose:** Track synthetic data generation progress.

| | Details |
|---|---|
| **Data** | `{ datasetId, status, total, completed, currentBatch?, totalBatches?, currentTopic?, topicCompleted?, topicTotal?, error? }` |
| **Direction** | Tool handler → React |

**Emitters:**
| File | When |
|------|------|
| `generate-initial-data.ts` (tool) | Start, per-batch progress, per-topic progress, completion, failure |

**Listeners:**
| File | What it does |
|------|-------------|
| `EmptyRecordsState.tsx` | Shows generation loading state |
| `TopicRecordTree.tsx` | Highlights generating topic |
| `TopicCanvasContext.tsx` | Highlights generating topic in canvas view |
| `RecordsSectionHeader.tsx` | Shows progress bar in header |
| `DatasetDetailContext.tsx` | Tracks generation state for UI indicators |

---

### 11. `vllora_finetune_job_created`

**Purpose:** A finetune training job was created.

| | Details |
|---|---|
| **Data** | `{ jobId?: string; backendDatasetId: string }` |
| **Direction** | Tool handler → React |

**Emitters:**
| File | When |
|------|------|
| `execute-plan.ts` (tool) | After creating finetune job via plan execution |
| `quick-finetune.ts` (service) | After creating finetune job via quick-finetune flow |

**Listener:** `FinetuneJobsContext.tsx` — refreshes jobs list

---

### 12. `vllora_dry_run_job_update`

**Purpose:** Dry run job status changed (polling update).

| | Details |
|---|---|
| **Data** | `{ jobId: string; job: DryRunJob }` |
| **Direction** | Service → React |

**Emitter:** `dry-run-jobs-db.ts` — after polling backend and updating job in IndexedDB

**Listeners:**
| File | What it does |
|------|-------------|
| `DryRunJobsContext.tsx` | Updates job in list, refreshes dataset on completion |
| `DatasetDetailContext.tsx` | Refreshes records when scores update |

---

### 13. `vllora_dataset_refresh`

**Purpose:** Signal that a dataset's data changed in IndexedDB (records added/updated/deleted, metadata changed). This is the **primary refresh mechanism** that keeps React contexts in sync with IndexedDB.

| | Details |
|---|---|
| **Data** | `{ datasetId?: string }` |
| **Direction** | Service/Tool → React |

**Emitters:**
| File | When |
|------|------|
| `datasets-db.ts` (service) | After any record CRUD operation (add, update, delete, bulk import, clear) |
| `generate-initial-data.ts` (tool) | After each batch of generated records is saved |
| `categorize-records.ts` (tool) | After records are assigned topics |
| `DryRunJobsContext.tsx` | When a dry run job completes (triggers dataset reload) |
| `FinetuneJobsContext.tsx` | When a finetune job status changes (triggers dataset reload) |

**Listeners:**
| File | What it does |
|------|-------------|
| `DatasetsContext.tsx` | Reloads the full datasets list from IndexedDB |
| `DatasetsUIContext.tsx` | Refreshes UI state (e.g., selected dataset metadata) |
| `DatasetDetailContext.tsx` | Reloads records and stats for the current dataset |

> **Why this matters for DatasetsGrid:** `DatasetsGrid` does NOT need its own event listeners. It re-renders when `DatasetsContext` reloads datasets (triggered by this event), and its `useEffect` recomputes stats (record counts, workflows, dry run jobs) whenever `datasets` changes.

---

### 14. `vllora_docs_awaiting_plan`

**Purpose:** Signal that docs are still processing when a plan was requested — UI should auto-prompt Lucy when processing completes.

| | Details |
|---|---|
| **Data** | `{ datasetId: string }` |
| **Direction** | Tool handler → React |

**Emitter:**
| File | When |
|------|------|
| `analyze-knowledge-sources.ts` (tool) | Knowledge sources are still processing when plan generation is requested |

**Listener:**
| File | What it does |
|------|-------------|
| `LucyDatasetAssistant.tsx` | Sets `pendingDocsPlanTriggerRef` so Lucy auto-triggers plan proposal when docs finish processing |

---

## Contexts (Single Source of Truth)

Contexts consolidate duplicated state that was previously tracked independently by multiple components:

### `KnowledgeSourcesContext` (`src/contexts/KnowledgeSourcesContext.tsx`)

**Listens to:** `vllora_knowledge_source_updated`
**Provides:** `sources[]`, `count`, `processingCount`, `isProcessing`, `processingSources[]`, `refreshSources()`
**Consumers:** `DatasetDetailContentV2`, `PlanSection`, `LucyDatasetAssistant`
**Provider:** `KnowledgeSourcesProvider` wraps `DatasetDetailContentV2` in `DatasetDetailView.tsx`

Previously 3 components independently called `knowledgeDB.getKnowledgeSourcesByDataset()` on every event. Now the context fetches once and shares the result.

### `PlanContext` (`src/contexts/PlanContext.tsx`)

**Listens to:** `vllora_plan_generating`, `vllora_plan_proposed`, `vllora_plan_dismissed`, `vllora_workflow_updated`, `vllora_plan_progress`
**Provides:** `isGeneratingPlan`, `hasPlanProposed`
**Consumers:** `DatasetDetailContentV2`
**Provider:** `PlanProvider` wraps `DatasetDetailContentV2` in `DatasetDetailView.tsx`

Single source of truth for the plan lifecycle. Exposes `planStatus: PlanStatus | null` alongside boolean convenience properties (`isGeneratingPlan`, `hasPlanProposed`, `isExecuting`). On mount, hydrates from `getStoredPlan()` in IndexedDB. On approval, persists `'approved'` status (plan is NOT deleted). During execution, writes progress to IndexedDB on each step. On completion/failure, persists terminal status with final progress. The agent also receives `plan_status` and `has_active_plan` in its context injection.

> **Note:** `DatasetDetailContentV2` only emits `vllora_plan_generating` (for auto-plan triggers). It does NOT listen to it. Plan state tracking is entirely in `PlanContext`, and the auto-switch to the Plan tab happens via `PlanContext.isPlanPreviewActive` (set on `vllora_plan_proposed`).

### `DatasetsContext` (`src/contexts/DatasetsContext.tsx`)

**Listens to:** `vllora_dataset_created`, `vllora_dataset_deleted`, `vllora_dataset_renamed`, `vllora_dataset_refresh`
**Provides:** `datasets[]`, `isLoading`, `error`, CRUD operations, record operations
**Consumers:** `DatasetsGrid`, `DatasetDetailView`, `IngestDataDialog`, many others
**Provider:** `DatasetsProvider` wraps the datasets page

This is the **top-level context** for all dataset data. When `vllora_dataset_refresh` fires (from `datasets-db.ts`, job contexts, tool handlers), this context reloads from IndexedDB. Components consuming this context automatically re-render with fresh data — they do NOT need their own event listeners.

### `DryRunJobsContext` (`src/contexts/DryRunJobsContext.tsx`)

**Listens to:** `vllora_dry_run_job_update`
**Provides:** Per-dataset dry run job lists, active/completed counts
**Emits:** `vllora_dataset_refresh` when a job completes (triggers DatasetsContext reload)

### `FinetuneJobsContext` (`src/contexts/FinetuneJobsContext.tsx`)

**Listens to:** `vllora_finetune_job_created`
**Provides:** Per-dataset finetune job lists
**Emits:** `vllora_dataset_refresh` when a job status changes (triggers DatasetsContext reload)

---

## What Should Stay as Events

Events are the **correct pattern** when:
- **Emitter is a tool handler** (outside React tree) → can't use Context
- **Many-to-one fire-and-forget** (e.g., `vllora_lucy_prompt` from 10+ places → 1 listener)

These should remain events:
- `vllora_lucy_prompt` — ~10 emitters, 1 listener, fire-and-forget
- `vllora_plan_generating/proposed/dismissed/progress` — tool handlers emit these (contexts listen to them)
- `vllora_docs_awaiting_plan` — tool handler → React (deferred auto-prompt)
- `vllora_data_generation_progress` — tool handler → multiple React listeners
- `vllora_workflow_updated` — tool handler notification
- `vllora_finetune_job_created` / `vllora_dry_run_job_update` — external sources
- `vllora_plan_approved` — React → tool handler (reverse direction)
- `vllora_dataset_refresh` — service layer → contexts (bridges IndexedDB writes to React state)

## What to Leave Alone (Low ROI)

- `vllora_data_generation_progress` — listened by 5 scattered components, each needs different slices. Context would over-centralize.
- `vllora_dry_run_job_update` — already handled properly in `DryRunJobsContext`.
- `vllora_finetune_job_created` — already handled in `FinetuneJobsContext`.
