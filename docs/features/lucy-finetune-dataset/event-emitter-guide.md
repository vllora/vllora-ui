# Lucy Finetune Dataset — Event Emitter Guide

> Last updated: 2026-02-11

## Why Events?

The Lucy Finetune feature uses an event emitter (`src/utils/eventEmitter.ts`) for communication between **tool handlers** (plain TypeScript in `src/lib/distri-finetune-tools/`) and **React components**. Tool handlers execute outside React's component tree — they can't access Context or setState — so events are the bridge.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  React Component Tree                                    │
│                                                          │
│  DatasetDetailContentV2 ←─ listens ── events ──┐        │
│  PlanSection            ←─ listens ── events ──┤        │
│  LucyDatasetAssistant   ←─ listens ── events ──┤        │
│  KnowledgeSourcesPanel  ←─ listens ── events ──┤        │
│  EmptyRecordsState      ←─ listens ── events ──┤        │
│  ExecutionProgressCard  ←─ listens ── events ──┤        │
│                                                 │        │
│  PlanEmptyState         ── emits ──► events ───┤        │
│  RecordRow              ── emits ──► events ───┤        │
│  DocsProcessingState    ── emits ──► events ───┤        │
│                                                 │        │
└─────────────────────────────────────────────────┤────────┘
                                                  │
┌─────────────────────────────────────────────────┤────────┐
│  Tool Handlers (outside React)                  │        │
│                                                 │        │
│  propose-setup-plan     ── emits ──► events ───┤        │
│  execute-setup-plan     ── emits ──► events ───┤        │
│  generate-initial-data  ── emits ──► events ───┤        │
│  knowledge-sources      ── emits ──► events ───┘        │
│  execution-state-store  ←─ listens ── events            │
│                                                          │
└──────────────────────────────────────────────────────────┘
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

**Emitters (10 locations):**
| File | When |
|------|------|
| `PlanEmptyState.tsx` | User clicks "Generate Setup Plan" |
| `PlanSection.tsx` | User approves plan → sends execute prompt |
| `PlanCompletedState.tsx` | User clicks "Generate New Plan" |
| `DatasetDetailContentV2.tsx` | Auto-plan trigger after docs finish processing |
| `DatasetDetailContentV2.tsx` | "Generate for topic" / "Generate subtopics" |
| `EmptyRecordsState.tsx` | User clicks "Ask Lucy" |
| `RecordRow.tsx` | User clicks "Generate variants" on a record |
| `SourcesProcessingMessage.tsx` | Docs finish processing in chat → auto-trigger plan |
| `DocsProcessingState.tsx` | (removed — now handled by event-driven auto-plan) |

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
| `DatasetDetailContentV2.tsx` | Updates knowledge sources count + docs processing state |
| `DatasetDetailContentV2.tsx` | Checks if all docs finished → triggers auto-plan |
| `PlanSection.tsx` | Checks if docs still processing → shows DocsProcessingState |
| `LucyDatasetAssistant.tsx` | Updates knowledge sources count |
| `KnowledgeSourcesPanel.tsx` | Refreshes sources list or updates progress inline |
| `SourcesProcessingMessage.tsx` | Checks if processing complete → triggers plan |

---

### 3. `vllora_setup_plan_generating`

**Purpose:** Signal that plan generation has started (show loading UI).

| | Details |
|---|---|
| **Data** | `{ datasetId: string; switchToReadme?: boolean }` |
| **Direction** | Tool handler → React + React → React |

**Emitters:**
| File | When |
|------|------|
| `propose-setup-plan/handler.ts` (tool) | LLM starts generating plan |
| `propose-setup-plan/adjust-plan.ts` (tool) | LLM starts adjusting existing plan |
| `empty-dataset-state/index.tsx` | Immediately when creating dataset with files |

**Listeners:**
| File | What it does |
|------|-------------|
| `DatasetDetailContentV2.tsx` | Sets `isGeneratingPlan=true`, auto-switches to Plan tab |
| `PlanEmptyState.tsx` | Clears "Waiting for Lucy..." loading state |

---

### 4. `vllora_setup_plan_proposed`

**Purpose:** A setup plan is ready for user review.

| | Details |
|---|---|
| **Data** | `{ datasetId: string; plan: SetupPlan }` |
| **Direction** | Tool handler → React |

**Emitters:**
| File | When |
|------|------|
| `propose-setup-plan/handler.ts` (tool) | Plan generated successfully |
| `propose-setup-plan/adjust-plan.ts` (tool) | Adjusted plan ready |

**Listeners:**
| File | What it does |
|------|-------------|
| `DatasetDetailContentV2.tsx` | Clears loading state, sets `hasPlanProposed=true` |
| `PlanSection.tsx` | Displays SetupPlanEditor with the plan |

---

### 5. `vllora_setup_plan_dismissed`

**Purpose:** Plan was dismissed (user discarded or docs not ready).

| | Details |
|---|---|
| **Data** | `{ datasetId: string }` |
| **Direction** | React → React + Tool → React |

**Emitters:**
| File | When |
|------|------|
| `PlanSection.tsx` | User clicks "Discard Plan" |
| `propose-setup-plan/handler.ts` (tool) | Docs still processing, can't generate yet |

**Listeners:**
| File | What it does |
|------|-------------|
| `DatasetDetailContentV2.tsx` | Clears generating/proposed state |
| `PlanSection.tsx` | Clears proposed plan, resets UI |

---

### 6. `vllora_setup_plan_approved`

**Purpose:** User approved the plan, trigger execution.

| | Details |
|---|---|
| **Data** | `{ datasetId: string; plan: SetupPlan }` |
| **Direction** | React → Tool handler |

**Emitters:**
| File | When |
|------|------|
| `PlanSection.tsx` | User clicks "Approve & Execute" |

**Listeners:**
| File | What it does |
|------|-------------|
| `execute-setup-plan.ts` (tool) | Stores plan, waits for Lucy to call execute tool |
| `execution-state-store.ts` (tool) | Stores plan in execution state |

---

### 7. `vllora_setup_plan_progress`

**Purpose:** Real-time execution progress updates.

| | Details |
|---|---|
| **Data** | `{ progress: ExecutionProgress }` |
| **Direction** | Tool handler → React |

**Emitters:**
| File | When |
|------|------|
| `execute-setup-plan.ts` (tool) | After each step completes/fails |

**Listeners:**
| File | What it does |
|------|-------------|
| `PlanSection.tsx` | Updates execution UI, transitions to completed |
| `ExecutionProgressCard.tsx` | Renders step-by-step progress |
| `execution-state-store.ts` (tool) | Persists progress in memory |

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
| `execute-setup-plan.ts` (tool) | After generating data → records, after grader → evaluator, after job → jobs |
| `DocsProcessingState.tsx` | User clicks "View Reference Docs" |
| `SourcesProcessingMessage.tsx` | Auto-switch to docs/plan during processing |

**Listener:**
| File | What it does |
|------|-------------|
| `DatasetDetailContentV2.tsx` | Calls `setActiveSection(tab)` |

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
| `execute-setup-plan.ts` (tool) | Plan execution completes |

**Listeners:**
| File | What it does |
|------|-------------|
| `DatasetDetailContentV2.tsx` | Resets plan generation state |
| `PlanSection.tsx` | Clears execution if complete |
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
| `RecordsSectionHeader.tsx` | Shows progress bar in header |
| `DatasetDetailContext.tsx` | Tracks generation state for UI indicators |

---

### 11. `vllora_finetune_job_created`

**Purpose:** A finetune training job was created.

| | Details |
|---|---|
| **Data** | `{ jobId?: string; backendDatasetId: string }` |
| **Direction** | Tool handler → React |

**Emitter:** `execute-setup-plan.ts` — after creating finetune job
**Listener:** `FinetuneJobsContext.tsx` — refreshes jobs list

---

### 12. `vllora_dry_run_job_update`

**Purpose:** Dry run job status changed (polling update).

| | Details |
|---|---|
| **Data** | `{ jobId: string; job: DryRunJob }` |
| **Direction** | External → React |

**Listener:** `DryRunJobsContext.tsx` — updates job in list, refreshes dataset on completion
**Listener:** `DatasetDetailContext.tsx` — refreshes records when scores update

---

## Contexts (Single Source of Truth)

Two contexts consolidate duplicated state that was previously tracked independently by multiple components:

### `KnowledgeSourcesContext` (`src/contexts/KnowledgeSourcesContext.tsx`)

**Listens to:** `vllora_knowledge_source_updated`
**Provides:** `sources[]`, `count`, `processingCount`, `isProcessing`, `processingSources[]`, `refreshSources()`
**Consumers:** `DatasetDetailContentV2`, `PlanSection`, `LucyDatasetAssistant`
**Provider:** `KnowledgeSourcesProvider` wraps `DatasetDetailContentV2` in `DatasetDetailView.tsx`

Previously 3 components independently called `knowledgeDB.getKnowledgeSourcesByDataset()` on every event. Now the context fetches once and shares the result.

### `SetupPlanContext` (`src/contexts/SetupPlanContext.tsx`)

**Listens to:** `vllora_setup_plan_generating`, `proposed`, `dismissed`, `workflow_updated`
**Provides:** `isGeneratingPlan`, `hasPlanProposed`
**Consumers:** `DatasetDetailContentV2`
**Provider:** `SetupPlanProvider` wraps `DatasetDetailContentV2` in `DatasetDetailView.tsx`

Previously `DatasetDetailContentV2` tracked `isGeneratingPlan`/`hasPlanProposed` from events. Now the context owns this state. `PlanSection` still manages its own internal state (`proposedPlan`, `isExecuting`, `executionProgress`) since those are UI-specific.

---

## What Should Stay as Events

Events are the **correct pattern** when:
- **Emitter is a tool handler** (outside React tree) → can't use Context
- **Many-to-one fire-and-forget** (e.g., `vllora_lucy_prompt` from 10+ places → 1 listener)

These should remain events:
- `vllora_lucy_prompt` — 10 emitters, 1 listener, fire-and-forget
- `vllora_setup_plan_generating/proposed/dismissed/progress` — tool handlers emit these (contexts listen to them)
- `vllora_data_generation_progress` — tool handler → multiple React listeners
- `vllora_workflow_updated` — tool handler notification
- `vllora_finetune_job_created` / `vllora_dry_run_job_update` — external sources
- `vllora_setup_plan_approved` — React → tool handler (reverse direction)

## What to Leave Alone (Low ROI)

- `vllora_data_generation_progress` — listened by 4 scattered components, each needs different slices. Context would over-centralize.
- `vllora_dry_run_job_update` — already handled properly in `DryRunJobsContext`.
- `vllora_finetune_job_created` — already handled in `FinetuneJobsContext`.
