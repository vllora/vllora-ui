# IndexedDB → Gateway API Migration Plan

**Goal**: Completely remove IndexedDB dependency from the frontend. All data persistence goes through the gateway API (SQLite backend).

**Status**: IN PROGRESS

---

## Architecture Overview

```
BEFORE:  React Components → direct IndexedDB calls (datasets-db.ts, etc.)
AFTER:   React Components → service-registry.ts → API adapters → Gateway HTTP → SQLite
```

### Repositories
- **FE**: `/Users/anhthuduong/Documents/GitHub/vllora/ui/` (this repo)
- **Gateway**: `/Users/anhthuduong/Documents/GitHub/vllora/gateway/`
- **Core (Diesel ORM)**: `/Users/anhthuduong/Documents/GitHub/vllora/core/`

### Key Files
| File | Role |
|------|------|
| `src/services/service-registry.ts` | Central adapter swap point |
| `src/services/interfaces/*.ts` | Service interfaces (contracts) |
| `src/services/adapters/api-*.ts` | API adapters (NEW) |
| `src/services/adapters/indexeddb-*.ts` | IndexedDB adapters (TO DELETE) |
| `src/services/*-db.ts` | Raw IndexedDB modules (TO DELETE after migration) |
| `src/lib/api-client.ts` | HTTP client (`api.get/post/put/patch/delete`, `handleApiResponse`) |
| `gateway/src/handlers/*.rs` | Rust HTTP handlers |
| `gateway/test-api.sh` | E2E test script for all API endpoints |

---

## Completed Work

### Phase 1-2: Backend (DONE)
All CRUD endpoints are implemented and tested (73/73 tests pass via `gateway/test-api.sh`).

**Tables & Endpoints:**
| Table | Endpoints | Handler File |
|-------|-----------|-------------|
| `workflows` | 5 (CRUD + soft delete) | `handlers/workflows.rs` |
| `workflow_records` | 12 (CRUD + topic ops + scores) | `handlers/workflow_records.rs` |
| `workflow_topics` | 3 (list, create, delete) | `handlers/workflow_topics.rs` |
| `knowledge_sources` | 8 (CRUD + status + chunks) | `handlers/knowledge_sources.rs` |
| `eval_jobs` | 7 (CRUD + status query) | `handlers/eval_jobs.rs` |

**DB CHECK constraints (valid values):**
- `eval_jobs.status`: `pending`, `running`, `completed`, `failed`, `cancelled`
- `knowledge_sources.status`: `pending`, `processing`, `ready`, `failed`
- `knowledge_sources.type`: `pdf`, `image`, `url`, `text`, `markdown`

### Phase 3a: API Adapters (DONE - 4 of 6)
| Adapter | File | Status |
|---------|------|--------|
| `apiDatasetAdapter` | `src/services/adapters/api-dataset-adapter.ts` | DONE |
| `apiRecordAdapter` | `src/services/adapters/api-record-adapter.ts` | DONE |
| `apiEvalJobAdapter` | `src/services/adapters/api-eval-job-adapter.ts` | DONE |
| `apiKnowledgeSourceAdapter` | `src/services/adapters/api-knowledge-source-adapter.ts` | DONE |
| `apiWorkflowAdapter` | NOT CREATED | Needs BE `state` column |
| `apiIterationAdapter` | NOT CREATED | Needs BE `state` column |

### Service Registry (PARTIALLY DONE)
`service-registry.ts` swapped 4 services to API, 2 still IndexedDB:
```typescript
export const datasetService = apiDatasetAdapter;       // ✅ API
export const recordService = apiRecordAdapter;          // ✅ API
export const evalJobService = apiEvalJobAdapter;        // ✅ API
export const knowledgeSourceService = apiKnowledgeSourceAdapter; // ✅ API
export const workflowService = indexedDbWorkflowAdapter;  // ❌ Still IndexedDB
export const iterationStateService = indexedDbIterationAdapter; // ❌ Still IndexedDB
export const dryRunJobService = evalJobService;           // Alias (remove later)
```

---

## Remaining Work

### Task 1: Add `state` JSON column to `workflows` table (BE)

The FE `FinetuneWorkflowState` is a big JSON object tracking pipeline step progress, snapshots, generation history. Currently stored in IndexedDB. Needs a column on BE.

**Migration file**: Create `core/sqlite_migrations/2026-03-11-XXXXXX-0000_add_state_to_workflows/up.sql`:
```sql
ALTER TABLE workflows ADD COLUMN state TEXT;
```

**Update Diesel schema** in `core/src/metadata/schema.rs`:
```rust
// Add to workflows table definition:
state -> Nullable<Text>,
```

**Update models** in `core/src/metadata/models/workflow.rs`:
```rust
// DbWorkflow: add field
pub state: Option<String>,

// DbUpdateWorkflow: add field + builder method
pub state: Option<Option<String>>,

pub fn with_state(mut self, state: Option<String>) -> Self {
    self.state = Some(state);
    self
}
```

**Update handler** in `gateway/src/handlers/workflows.rs`:
- `UpdateWorkflowRequest`: add `pub state: Option<String>`
- `update_workflow`: pass `.with_state(payload.state)` to update builder

**Add new endpoints** for workflow state sub-resources:
- `GET /finetune/workflows/{id}/state` → returns workflow with state
- `PUT /finetune/workflows/{id}/state` → updates state JSON blob

**Similarly for iteration state**: Add an `iteration_state` column or a separate `workflow_iteration_state` table.

### Task 2: Create `apiWorkflowAdapter` (FE)

File: `src/services/adapters/api-workflow-adapter.ts`

Implement the `WorkflowService` interface using the gateway API. The `FinetuneWorkflowState` is stored as a JSON string in the `state` column.

**Interface** (from `src/services/interfaces/workflow-service.ts`):
```typescript
interface WorkflowService {
  // CRUD
  create(datasetId: string, trainingGoals: string): Promise<FinetuneWorkflowState>
  get(id: string): Promise<FinetuneWorkflowState | null>
  getByDataset(datasetId: string): Promise<FinetuneWorkflowState | null>
  getAll(): Promise<FinetuneWorkflowState[]>
  update(workflow: FinetuneWorkflowState): Promise<void>
  delete(id: string): Promise<void>

  // Step management
  advanceToStep(id: string, step: FinetuneStep): Promise<FinetuneWorkflowState | null>
  markStepFailed(id: string): Promise<FinetuneWorkflowState | null>
  updateStepData<K>(id: string, key: K, data: FinetuneWorkflowState[K]): Promise<FinetuneWorkflowState | null>

  // Snapshots
  createSnapshot(workflow: FinetuneWorkflowState): Promise<string>
  getSnapshots(workflowId: string): Promise<WorkflowSnapshotStore[]>
  rollbackToSnapshot(snapshotId: string): Promise<FinetuneWorkflowState | null>

  // Generation history
  recordGeneration(workflowId: string, data: GenerationData): Promise<string>
  getGenerationHistory(workflowId: string): Promise<GenerationHistoryStore[]>

  // Job evaluation cache
  getCachedJobEvaluations(jobId: string): Promise<CachedJobEvaluation | null>
  saveJobEvaluationsCache(jobId: string, data: FinetuneEvalResultsResponse): Promise<void>
  deleteCachedJobEvaluations(jobId: string): Promise<void>
  clearOldEvaluationsCache(maxAgeMs?: number): Promise<number>
  isJobScoresPersisted(jobId: string): Promise<boolean>
  markJobScoresPersisted(jobId: string): Promise<void>
}
```

**Strategy**: Store the entire `FinetuneWorkflowState` as JSON in `state` column. Step management methods (advanceToStep, markStepFailed, updateStepData) do read-modify-write on the JSON.

Snapshots, generation history, and evaluation cache can be stored as JSON arrays within the state, or as separate tables. Simplest approach: embed them in the state JSON blob.

**Type re-exports**: The `WorkflowService` interface imports types from `finetune-workflow-db.ts`. These types (`FinetuneWorkflowState`, `FinetuneStep`, `WorkflowSnapshotStore`, `GenerationHistoryStore`, `CachedJobEvaluation`, etc.) need to be moved to a standalone types file that doesn't depend on IndexedDB.

### Task 3: Create `apiIterationAdapter` (FE)

File: `src/services/adapters/api-iteration-adapter.ts`

**Interface** (from `src/services/interfaces/iteration-service.ts`):
```typescript
interface IterationStateService {
  get(datasetId: string): Promise<IterationState | null>
  save(state: IterationState): Promise<void>
  create(datasetId: string): Promise<IterationState>
  getOrCreate(datasetId: string): Promise<IterationState>
  addEntry(datasetId: string, entry: Omit<IterationHistoryEntry, 'iteration' | 'timestamp'>): Promise<IterationState>
  getHistory(datasetId: string): Promise<IterationHistoryEntry[]>
  updatePhase(datasetId: string, phase: IterationPhase): Promise<IterationState>
  delete(datasetId: string): Promise<void>
}
```

**Strategy**: Store as JSON in a column on the `workflows` table (e.g., `iteration_state` column), or use the existing `state` JSON blob with a nested key.

### Task 4: Rewire 52 files from direct IndexedDB imports → service registry

This is the biggest mechanical task. Files import directly from `*-db.ts` modules instead of from `service-registry.ts`.

#### 4a. Files importing `datasets-db` (44 files)

Most use `import * as datasetsDB from '@/services/datasets-db'` and call functions like:
- `datasetsDB.getDatasetById(id)` → `datasetService.getById(id)`
- `datasetsDB.getAllDatasets()` → `datasetService.getAll()`
- `datasetsDB.createDataset(name, obj)` → `datasetService.create(name, obj)`
- `datasetsDB.getRecordsByDatasetId(id)` → `recordService.getByDatasetId(id)`
- `datasetsDB.addRecordsToDataset(id, records)` → `recordService.add(id, records)`
- `datasetsDB.updateRecordTopic(id, rid, topic)` → `recordService.updateTopic(id, rid, topic)`
- `datasetsDB.updateRecordTopicsBatch(id, updates)` → `recordService.updateTopicsBatch(id, updates)`
- `datasetsDB.updateRecordData(id, rid, data)` → `recordService.updateData(id, rid, data)`
- `datasetsDB.updateRecordEvaluationScores(id, rid, update)` → `recordService.updateEvalScores(id, rid, update)`
- `datasetsDB.deleteRecord(id, rid)` → `recordService.delete(id, rid)`
- `datasetsDB.clearDatasetRecords(id)` → `recordService.clearAll(id)`
- `datasetsDB.renameDataset(id, name)` → `datasetService.rename(id, name)`
- `datasetsDB.deleteDataset(id)` → `datasetService.delete(id)`
- `datasetsDB.updateDatasetObjective(id, obj)` → `datasetService.updateObjective(id, obj)`
- `datasetsDB.updateDatasetBackendId(id, bid)` → `datasetService.updateBackendId(id, bid)`
- `datasetsDB.updateDatasetTopicHierarchy(id, topics)` → `datasetService.updateTopicHierarchy(id, topics)`
- `datasetsDB.updateDatasetEvalScript(id, script)` → `datasetService.updateEvalScript(id, script)`
- `datasetsDB.updateDatasetCoverageStats(id, stats)` → `datasetService.updateCoverageStats(id, stats)`
- `datasetsDB.updateDatasetKnowledgeCoverageStats(id, stats)` → `datasetService.updateKnowledgeCoverageStats(id, stats)`
- `datasetsDB.updateDatasetDryRunStats(id, stats)` → `datasetService.updateDryRunStats(id, stats)`
- `datasetsDB.updateDatasetStats(id, stats)` → `datasetService.updateDatasetStats(id, stats)`
- `datasetsDB.updateDatasetTrainingConfig(id, config)` → `datasetService.updateTrainingConfig(id, config)`
- `datasetsDB.updateDatasetReadme(id, readme, source)` → `datasetService.updateReadme(id, readme, source)`
- `datasetsDB.spanExistsInDataset(id, spanId)` → `recordService.spanExists(id, spanId)`
- `datasetsDB.getDatasetsBySpanId(spanId)` → `recordService.getDatasetsBySpanId(spanId)`
- `datasetsDB.addSpansToDataset(id, spans, topic)` → `recordService.addFromSpans(id, spans, topic)`
- `datasetsDB.getRecordCount(id)` → `recordService.getCount(id)`
- `datasetsDB.getTopicCoverageStats(id)` → `recordService.getTopicCoverageStats(id)`
- `datasetsDB.clearAllRecordTopics(id)` → `recordService.clearAllTopics(id)`
- `datasetsDB.renameTopicInRecords(id, old, new)` → `recordService.renameTopic(id, old, new)`
- `datasetsDB.clearTopicFromRecords(id, name)` → `recordService.clearTopic(id, name)`

**Special cases:**
- `DATASET_REFRESH_EVENT` — imported from `datasets-db.ts`. This is an event emitter constant. Move to a separate events file or keep in datasets-db.
- `extractDataInfoFromSpan` — imported from `@/utils/modelUtils`, not from datasets-db. No change needed.
- `backfillDryRunScoresFromJobs`, `backfillDryRunModel` — used in `DryRunJobsContext.tsx`. These are migration helpers. May be removable.
- `getDB()` — used in tests and orphan-cleanup. Replace with API calls.
- `updateRecordEvaluation` (without "Scores") — different from `updateRecordEvaluationScores`. Check signature.

**Full file list (44 files):**
```
src/contexts/DatasetsContext.tsx
src/contexts/DryRunJobsContext.tsx
src/hooks/useFineTuneAgentChat.ts
src/lib/distri-dataset-tools/analysis/analyze-coverage.ts
src/lib/distri-dataset-tools/analysis/analyze-dry-run.ts
src/lib/distri-dataset-tools/analysis/analyze-knowledge-coverage.ts
src/lib/distri-dataset-tools/analysis/generate-topics.ts
src/lib/distri-finetune-tools/eval-tools.ts
src/lib/distri-finetune-tools/steps/adjust-hierarchy.ts
src/lib/distri-finetune-tools/steps/analyze-coverage.ts
src/lib/distri-finetune-tools/steps/analyze-evaluation.ts
src/lib/distri-finetune-tools/steps/analyze-knowledge-sources.ts
src/lib/distri-finetune-tools/steps/analyze-training.ts
src/lib/distri-finetune-tools/steps/apply-hierarchy.ts
src/lib/distri-finetune-tools/steps/categorize-records.ts
src/lib/distri-finetune-tools/steps/check-viability.ts
src/lib/distri-finetune-tools/steps/create-dataset.ts
src/lib/distri-finetune-tools/steps/execute-plan.ts
src/lib/distri-finetune-tools/steps/generate-grader.ts
src/lib/distri-finetune-tools/steps/generate-preview.ts
src/lib/distri-finetune-tools/steps/generate-skill-package.ts
src/lib/distri-finetune-tools/steps/generate-synthetic.ts
src/lib/distri-finetune-tools/steps/generate-topics/frontend.ts
src/lib/distri-finetune-tools/steps/get-dataset-records.ts
src/lib/distri-finetune-tools/steps/get-dataset-state.ts
src/lib/distri-finetune-tools/steps/get-evaluation-details.ts
src/lib/distri-finetune-tools/steps/get-training-metrics.ts
src/lib/distri-finetune-tools/steps/knowledge-sources.ts
src/lib/distri-finetune-tools/steps/mark-job-reviewed.ts
src/lib/distri-finetune-tools/steps/propose-plan/handler.ts
src/lib/distri-finetune-tools/steps/run-dry-run.ts
src/lib/distri-finetune-tools/steps/save-plan.ts
src/lib/distri-finetune-tools/steps/sync-evaluator.ts
src/lib/distri-finetune-tools/steps/test-grader.ts
src/lib/distri-finetune-tools/steps/topic-manipulation.ts
src/lib/distri-finetune-tools/steps/update-dataset-readme.ts
src/lib/distri-finetune-tools/steps/update-objective.ts
src/lib/distri-finetune-tools/steps/update-record.ts
src/lib/distri-finetune-tools/steps/upload-dataset.ts
src/lib/distri-finetune-tools/steps/validate-records.ts
src/lib/distri-finetune-tools/workflow/index.ts
src/test/integration/seed-helpers.ts
src/test/mock-data/mock-generate-initial-data.ts
(+ files in src/services/ that also import, like finetune-api.ts, dry-run-polling-manager.ts, etc.)
```

#### 4b. Files importing `knowledge-sources-db` (12 files)
```
src/services/adapters/api-knowledge-source-adapter.ts  (type import only — SearchResult)
src/services/interfaces/knowledge-source-service.ts    (type import only)
src/services/adapters/indexeddb-knowledge-source-adapter.ts (will be deleted)
src/lib/distri-finetune-tools/steps/get-dataset-state.ts
src/lib/distri-finetune-tools/steps/generate-skill-package.ts
src/lib/distri-finetune-tools/steps/shared/knowledge-context.ts
src/lib/distri-finetune-tools/steps/shared/chunk-lookup.ts
src/lib/distri-finetune-tools/steps/analyze-knowledge-sources.ts
src/lib/distri-dataset-tools/analysis/analyze-knowledge-coverage.ts
src/contexts/DatasetsContext.tsx
src/lib/distri-finetune-tools/steps/knowledge-sources.ts
src/components/agent/lucy-agent/plan-render/SourcesProcessingMessage.tsx
```

Replace `import * as knowledgeDB from '@/services/knowledge-sources-db'` with:
- `import { knowledgeSourceService } from '@/services/service-registry'`
- `knowledgeDB.getKnowledgeSourcesByDataset(id)` → `knowledgeSourceService.getByDataset(id)`
- `knowledgeDB.createKnowledgeSource(...)` → `knowledgeSourceService.create(...)`
- etc.

#### 4c. Files importing `dry-run-jobs-db` (7 files)
```
src/services/adapters/indexeddb-dry-run-adapter.ts (will be deleted)
src/hooks/useFineTuneAgentChat.ts
src/test/integration/seed-helpers.ts
src/lib/distri-finetune-tools/steps/mark-job-reviewed.ts
src/lib/distri-finetune-tools/steps/get-evaluation-details.ts
src/contexts/DatasetsContext.tsx
src/contexts/DryRunJobsContext.tsx
```

Replace with `import { evalJobService } from '@/services/service-registry'`.

#### 4d. Files importing `finetune-workflow-db` (33 files)
```
src/services/interfaces/workflow-service.ts (type imports)
src/services/adapters/indexeddb-workflow-adapter.ts (will be deleted)
src/hooks/useFineTuneAgentChat.ts
src/lib/distri-finetune-tools/workflow/index.ts
src/lib/distri-finetune-tools/types.ts
src/lib/distri-finetune-tools/index.ts
src/lib/distri-finetune-tools/steps/analyze-coverage.ts
src/lib/distri-finetune-tools/steps/analyze-evaluation.ts
src/lib/distri-finetune-tools/steps/analyze-training.ts
src/lib/distri-finetune-tools/steps/adjust-hierarchy.ts
src/lib/distri-finetune-tools/steps/apply-hierarchy.ts
src/lib/distri-finetune-tools/steps/categorize-records.ts
src/lib/distri-finetune-tools/steps/check-viability.ts
src/lib/distri-finetune-tools/steps/check-training-status.ts
src/lib/distri-finetune-tools/steps/deploy-model.ts
src/lib/distri-finetune-tools/steps/execute-plan.ts
src/lib/distri-finetune-tools/steps/generate-grader.ts
src/lib/distri-finetune-tools/steps/generate-skill-package.ts
src/lib/distri-finetune-tools/steps/generate-synthetic.ts
src/lib/distri-finetune-tools/steps/get-dataset-state.ts
src/lib/distri-finetune-tools/steps/get-training-metrics.ts
src/lib/distri-finetune-tools/steps/run-dry-run.ts
src/lib/distri-finetune-tools/steps/start-training.ts
src/lib/distri-finetune-tools/steps/sync-evaluator.ts
src/lib/distri-finetune-tools/steps/test-grader.ts
src/lib/distri-finetune-tools/steps/topic-manipulation.ts
src/lib/distri-finetune-tools/steps/update-objective.ts
src/lib/distri-finetune-tools/steps/update-record.ts
src/lib/distri-finetune-tools/steps/upload-dataset.ts
src/lib/distri-finetune-tools/steps/validate-records.ts
src/test/integration/seed-helpers.ts
src/contexts/DatasetsContext.tsx
src/components/agent/lucy-agent/DatasetStatusSummary.tsx
```

Many files do `import * as workflowDB from '@/services/finetune-workflow-db'` and call:
- `workflowDB.getWorkflowByDataset(id)` → `workflowService.getByDataset(id)`
- `workflowDB.updateStepData(id, key, data)` → `workflowService.updateStepData(id, key, data)`
- `workflowDB.advanceToStep(id, step)` → `workflowService.advanceToStep(id, step)`
- etc.

**Type imports**: Many files import types like `FinetuneWorkflowState`, `FinetuneStep`, `DryRunVerdict`, `GenerationStrategy` from `finetune-workflow-db.ts`. These types need to be available from a non-IndexedDB location.

**Solution**: Extract types from `finetune-workflow-db.ts` into a standalone `src/types/workflow-types.ts` file. Then update all type imports.

#### 4e. Files importing `finetune-iteration-db` (10 files)
```
src/services/interfaces/iteration-service.ts (type imports)
src/services/adapters/indexeddb-iteration-adapter.ts (will be deleted)
src/lib/distri-finetune-tools/steps/analyze-training.ts
src/hooks/useFineTuneAgentChat.ts
src/test/integration/seed-helpers.ts
src/components/agent/lucy-agent/plan-render/LucyPendingDecisionCard.tsx
src/test/integration/eval-analysis.test.ts
src/components/agent/lucy-agent/plan-render/computeStallCount.test.ts
src/test/fixtures/eval-scenarios.ts
src/lib/distri-finetune-tools/steps/iteration-history.ts
```

### Task 5: Extract types from IndexedDB modules

Create standalone type files that don't import from `*-db.ts`:

1. **`src/types/workflow-types.ts`** — Extract from `finetune-workflow-db.ts`:
   - `FinetuneWorkflowState`, `FinetuneStep`, `StepStatus`
   - `GenerationStrategy`, `GenerationRound`, `DryRunVerdict`, `DryRunSample`
   - `TrainingMetrics`, `ValidationError`
   - `WorkflowSnapshotStore`, `GenerationHistoryStore`
   - `CachedJobEvaluation`
   - `finetuneWorkflowService` (the service instance)

2. **`src/types/iteration-types.ts`** — Extract from `finetune-iteration-db.ts`:
   - `IterationState`, `IterationHistoryEntry`, `IterationPhase`, `ProposedChange`

3. **Move `SearchResult`, `ChunkMatch`** from `knowledge-sources-db.ts` → `src/types/knowledge-types.ts` or keep in the interface file.

### Task 6: Additional services that import from IndexedDB

These files in `src/services/` also import from `*-db.ts` and need updating:

```
src/services/finetune-api.ts          — imports datasetsDB
src/services/dry-run-polling-manager.ts — imports datasetsDB
src/services/quick-finetune.ts        — imports datasetsDB
src/services/orphan-cleanup.ts        — imports datasetsDB + getDB()
src/services/sample-datasets.ts       — imports datasetsDB
```

`dry-run-polling-manager.ts` does background polling — with the BE eval state tracker, this may be removable entirely.

### Task 7: Delete IndexedDB modules

After all imports are rewired, delete:
```
src/services/datasets-db.ts
src/services/knowledge-sources-db.ts
src/services/dry-run-jobs-db.ts
src/services/finetune-workflow-db.ts
src/services/finetune-iteration-db.ts
src/services/adapters/indexeddb-dataset-adapter.ts
src/services/adapters/indexeddb-record-adapter.ts
src/services/adapters/indexeddb-workflow-adapter.ts
src/services/adapters/indexeddb-dry-run-adapter.ts
src/services/adapters/indexeddb-knowledge-source-adapter.ts
src/services/adapters/indexeddb-iteration-adapter.ts
src/services/dry-run-polling-manager.ts  (replaced by BE eval state tracker)
src/services/upload-session-db.ts  (if not used elsewhere)
src/services/orphan-cleanup.ts  (IndexedDB-specific cleanup)
```

### Task 8: Rename `dryRun` → `evaluation` terminology

User requested removing "dry run" terminology. Only the internal concept name changes — the DB column names (`dry_run_score`, `dryRun` in workflow state) stay as-is for now.

Key renames:
- `DryRunJobsContext.tsx` → `EvalJobsContext.tsx`
- `dryRunJobService` export → `evalJobService` (already done in registry)
- `DryRunJob` type — keep for now, it's used widely
- `dry-run-polling-manager.ts` — being removed entirely (BE does polling)

---

## Type Mapping Reference

### Dataset (FE) ↔ Workflow (BE)

| FE field | BE field | Notes |
|----------|----------|-------|
| `id` | `id` | Same UUID |
| `name` | `name` | Direct map |
| `datasetObjective` | `objective` | Rename |
| `evalScript` | `eval_script` | Direct map |
| `createdAt` (epoch ms) | `created_at` (ISO string) | Convert |
| `updatedAt` (epoch ms) | `updated_at` (ISO string) | Convert |
| `backendDatasetId` | — | Cloud upload ID, not in workflow table |
| `topicHierarchy` | — | Stored in `workflow_topics` table |
| `coverageStats` | — | Computed from records on demand |
| `dryRunStats` | — | Computed from eval jobs on demand |
| `stats` | — | Computed from records on demand |
| `trainingConfig` | — | TODO: add column or store in state JSON |
| `readme` | — | TODO: add column or store in state JSON |
| `state` | — | Not tracked in workflow table |

### DatasetRecord (FE) ↔ WorkflowRecord (BE)

| FE field | BE field | Notes |
|----------|----------|-------|
| `id` | `id` | Same |
| `datasetId` | `workflow_id` | Rename |
| `data` (object) | `data` (JSON string) | Serialize/parse |
| `topic` | `topic` | Direct map |
| `spanId` | `span_id` | Rename |
| `is_generated` (bool) | `is_generated` (i32: 0/1) | Convert |
| `sourceRecordId` | `source_record_id` | Rename |
| `metadata` (object) | `metadata` (JSON string) | Serialize/parse |
| `evaluation.dryRunScore` | `dry_run_score` (f32) | Extract |
| `evaluation.finetuneScore` | `finetune_score` (f32) | Extract |
| `evaluation.dryRunModel` | — | Not stored in BE |
| `evaluation.finetuneModel` | — | Not stored in BE |
| `evaluations` (per-job) | — | Not stored in BE |
| `createdAt` (epoch ms) | `created_at` (ISO string) | Convert |
| `updatedAt` (epoch ms) | — | Not stored, use created_at |

### DryRunJob (FE) ↔ EvalJob (BE)

| FE field | BE field | Notes |
|----------|----------|-------|
| `id` | `id` | Same |
| `datasetId` | `workflow_id` | Rename |
| `backendDatasetId` | `workflow_id` | Same as workflow_id |
| `evaluationRunId` | `cloud_run_id` | Rename |
| `status` | `status` | Same values |
| `sampleSize` | `sample_size` | Rename |
| `rolloutModel` | `rollout_model` | Rename |
| `error` | `error` | Direct map |
| `createdAt` (epoch ms) | `created_at` (ISO string) | Convert |
| `pollingSnapshot` | — | Not stored in BE (fetched on demand from cloud) |
| `result` | — | Not stored in BE (fetched on demand from cloud) |
| `reviewedByAgent` | — | Not stored in BE |

### KnowledgeSource (FE) ↔ KnowledgeSource (BE)

| FE field | BE field | Notes |
|----------|----------|-------|
| `id` | `id` | Same |
| `datasetId` | `workflow_id` | Rename |
| `name` | `name` | Direct map |
| `type` | `type` (serde: "type") | Same, BE uses `source_type` internally |
| `status` | `status` | Same |
| `content` | `content` | Direct map |
| `extractedContent` (object) | `extracted_content` (JSON string) | Serialize/parse |
| `progress` (object) | `progress` (JSON string) | Serialize/parse |
| `createdAt` (epoch ms) | `created_at` (ISO string) | Convert |
| `size`, `mimeType`, `comment` | — | Not stored in BE |
| `error` | — | Not stored in BE (part of status update) |
| `needsLlmExtraction` | — | Client-side only |
| `extractionPhase` | — | Client-side only |

---

## Execution Order

1. **Task 5**: Extract types from IndexedDB modules → standalone type files
2. **Task 1**: Add `state` + `iteration_state` columns to BE workflow table
3. **Task 2**: Create `apiWorkflowAdapter`
4. **Task 3**: Create `apiIterationAdapter`
5. **Task 4**: Rewire all 52+ files (can be done in batches):
   - 4a: `datasets-db` imports (44 files) — largest batch
   - 4b: `knowledge-sources-db` imports (12 files)
   - 4c: `dry-run-jobs-db` imports (7 files)
   - 4d: `finetune-workflow-db` imports (33 files)
   - 4e: `finetune-iteration-db` imports (10 files)
6. **Task 6**: Update service files (`finetune-api.ts`, etc.)
7. **Task 7**: Delete IndexedDB modules
8. **Task 8**: Rename dryRun → evaluation terminology
9. **Final**: Run `npx tsc --noEmit` — must have 0 errors
10. **Final**: Run `gateway/test-api.sh` — must have 73/73 passing

---

## Verification Checklist

- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `gateway/test-api.sh` passes all tests
- [ ] No imports from `*-db.ts` files remain (except test files, if kept)
- [ ] No `indexedDB` references in production code
- [ ] `service-registry.ts` uses all API adapters
- [ ] All IndexedDB adapter files deleted
- [ ] All IndexedDB module files deleted
- [ ] Types extracted to standalone files

---

## Notes for Agents

- **API client**: Use `import { api, handleApiResponse } from '@/lib/api-client'`
- **Base URL**: Automatically resolved by `getBackendUrl()` — don't hardcode
- **Error handling**: `handleApiResponse<T>()` throws on non-2xx. Callers should catch.
- **Type-check after every change**: `npx tsc --noEmit` (hook runs automatically)
- **Test API**: `./gateway/test-api.sh http://localhost:9092` (or whatever port)
- **The `_` placeholder**: Some API adapters use `_` as a placeholder workflow_id in paths where the handler ignores it (e.g., `GET /finetune/workflows/_/knowledge/{ks_id}`). This works because the handler extracts only the second path param.
- **Float precision**: BE stores f32, so 0.85 may come back as 0.8500000238418579. FE should handle this.
- **Timestamps**: BE returns ISO strings (`2026-03-11 05:48:59`), FE expects epoch ms. Convert with `new Date(str).getTime()`.
