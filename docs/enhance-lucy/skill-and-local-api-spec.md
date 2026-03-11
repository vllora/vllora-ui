# Spec: Finetune Skill + Local API Migration

Single source of truth for the plan to (1) migrate UI from IndexedDB to gateway local API, (2) rewrite the finetune skill, and (3) enable seamless CLI → UI handoff.

---

## Problem

The UI stores all finetune data in browser IndexedDB. The finetune skill (CLI agent) talks to the gateway API. These are two isolated worlds — data created by the skill is invisible to the UI, and vice versa.

```
Current:
  Skill (CLI) → gateway API → cloud (datasets, eval, training)
  UI (browser) → IndexedDB (datasets, records, workflows, jobs)
  ❌ No shared state between skill and UI
```

## Goal

Both the skill and the UI read/write through the same gateway API. The gateway's local SQLite becomes the single source of truth for workspace data.

```
Target:
  Skill (CLI) ──┐
                 ├→ gateway API (localhost:9090) → local SQLite (workspace data)
  UI (browser) ──┘                               → cloud API (eval, training, deploy)
```

---

## Architecture

### What moves to gateway local API

| Data | Current Location | Target Location | Priority |
|------|-----------------|-----------------|----------|
| Datasets (metadata) | IndexedDB `datasets` | Gateway SQLite `workflows` | P0 |
| Records (JSONL rows) | IndexedDB `records` | Gateway SQLite `workflow_records` | P0 |
| Topic hierarchy | IndexedDB `datasets.topicHierarchy` | Gateway SQLite `workflows.topics` | P0 |
| Grader script | IndexedDB `datasets.evalScript` | Gateway SQLite `workflows.grader_script` | P0 |
| Workflow state (7-step) | IndexedDB `workflows` | Gateway SQLite `workflows.*` | P1 |
| Dry run jobs | IndexedDB `dryRunJobs` | Gateway SQLite (new table) | P1 |
| Iteration state | IndexedDB `iterationState` | Gateway SQLite (new table) | P2 |
| Knowledge sources | IndexedDB `knowledge_sources` | Gateway SQLite (new table) | P2 |
| Upload sessions | IndexedDB `uploadSession` | Keep in IndexedDB (browser-only concern) | — |

### What stays in the cloud API (unchanged)

- Uploaded JSONL datasets (`POST /finetune/datasets`)
- Evaluation runs and results (`/finetune/evaluations/*`)
- Training jobs and metrics (`/finetune/reinforcement-jobs/*`)
- Deployments (`/finetune/deployments/*`)

### What stays in IndexedDB (unchanged for now)

- Upload session state (browser-only UX concern)
- Any purely UI-local state

---

## Gateway API Design (for the BE developer)

### Existing (from commit `e199769`)

```
GET    /finetune/workflows                    → list workflows
POST   /finetune/workflows                    → create workflow (name, objective)
PUT    /finetune/workflows/{id}               → update workflow
DELETE /finetune/workflows/{id}               → soft delete
```

### Needed: Expand workflows table

```sql
-- Extend existing table
ALTER TABLE workflows ADD COLUMN system_prompt TEXT;
ALTER TABLE workflows ADD COLUMN topics TEXT;              -- JSON blob (topic hierarchy)
ALTER TABLE workflows ADD COLUMN grader_script TEXT;       -- JavaScript source
ALTER TABLE workflows ADD COLUMN grader_config TEXT;       -- JSON blob (evaluator config)
ALTER TABLE workflows ADD COLUMN cloud_dataset_id TEXT;    -- link to uploaded cloud dataset
ALTER TABLE workflows ADD COLUMN current_step TEXT;        -- pipeline step name
ALTER TABLE workflows ADD COLUMN step_status TEXT;         -- not_started/in_progress/completed/failed
ALTER TABLE workflows ADD COLUMN metadata TEXT;            -- JSON blob for extensible state
ALTER TABLE workflows ADD COLUMN eval_script TEXT;         -- evaluator script (separate from grader)
ALTER TABLE workflows ADD COLUMN dry_run_stats TEXT;       -- JSON blob
ALTER TABLE workflows ADD COLUMN coverage_stats TEXT;      -- JSON blob
ALTER TABLE workflows ADD COLUMN training_config TEXT;     -- JSON blob
ALTER TABLE workflows ADD COLUMN readme TEXT;              -- auto-generated README
```

### Needed: Records table

```sql
CREATE TABLE workflow_records (
    id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    messages TEXT NOT NULL,           -- JSON array [{role, content}]
    topic TEXT,                       -- topic path e.g. "tactics/forks"
    span_id TEXT,                     -- source trace span ID (nullable)
    dry_run_score REAL,              -- latest eval score
    dry_run_model TEXT,              -- model used for eval
    finetune_score REAL,             -- latest training score
    finetune_model TEXT,             -- fine-tuned model name
    metadata TEXT,                    -- JSON blob for extensible data
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);
CREATE INDEX idx_records_workflow ON workflow_records(workflow_id);
CREATE INDEX idx_records_topic ON workflow_records(workflow_id, topic);
CREATE INDEX idx_records_span ON workflow_records(workflow_id, span_id);
```

### Needed: New endpoints

```
-- Records
GET    /finetune/workflows/{id}/records              → list records (supports ?topic= filter)
POST   /finetune/workflows/{id}/records              → add records (bulk, array body)
PUT    /finetune/workflows/{id}/records/{rid}         → update single record
DELETE /finetune/workflows/{id}/records/{rid}         → delete single record
DELETE /finetune/workflows/{id}/records               → delete all records
POST   /finetune/workflows/{id}/records/batch-update  → batch update topics/scores

-- Workflow fields
PUT    /finetune/workflows/{id}/topics               → update topic hierarchy (JSON body)
PUT    /finetune/workflows/{id}/grader               → update grader script + config
PUT    /finetune/workflows/{id}/step                  → advance/update workflow step
GET    /finetune/workflows/{id}/state                 → full workflow state (metadata, stats, etc.)

-- Search / query
GET    /finetune/workflows/{id}/records/count         → record count
GET    /finetune/workflows/{id}/records/stats          → topic coverage, score distribution
```

---

## UI Abstraction Layer Design

### Strategy: Adapter pattern

```
Context/Tool → Service Interface (abstract) → IndexedDBAdapter (now)
                                             → ApiAdapter (later, swap in)
```

We define TypeScript interfaces matching the current function signatures. Create an IndexedDB adapter that wraps existing code. Later, create an API adapter with the same interface. The swap is changing one import.

### Interface shape

Based on the audit (90 exported functions across 6 services), group into 5 service interfaces:

```typescript
// src/services/interfaces/dataset-service.ts
interface DatasetService {
  // CRUD
  getById(id: string): Promise<Dataset | null>;
  getByBackendId(backendId: string): Promise<Dataset | null>;
  getAll(): Promise<Dataset[]>;
  create(name: string, objective?: string): Promise<Dataset>;
  rename(id: string, name: string): Promise<void>;
  delete(id: string): Promise<void>;
  updateObjective(id: string, objective: string, normalized?: string): Promise<void>;
  updateBackendId(id: string, backendId: string): Promise<void>;
  updateTopicHierarchy(id: string, topics: TopicHierarchyConfig): Promise<void>;
  updateEvalScript(id: string, script: string): Promise<void>;
  updateCoverageStats(id: string, stats: CoverageStats): Promise<void>;
  updateDryRunStats(id: string, stats: DryRunStats): Promise<void>;
  updateDatasetStats(id: string, stats: DatasetStats): Promise<void>;
  updateTrainingConfig(id: string, config: SampleTrainingConfig): Promise<void>;
  updateReadme(id: string, readme: string, source?: string): Promise<void>;
}

// src/services/interfaces/record-service.ts
interface RecordService {
  getByDatasetId(datasetId: string, recordIds?: string[]): Promise<DatasetRecord[]>;
  getCount(datasetId: string): Promise<number>;
  getTopicCoverageStats(datasetId: string): Promise<{ total: number; withTopic: number }>;
  add(datasetId: string, records: NewRecord[], defaultTopic?: string): Promise<DatasetRecord[]>;
  addFromSpans(datasetId: string, spans: Span[], topic?: string): Promise<number>;
  delete(datasetId: string, recordId: string): Promise<void>;
  clearAll(datasetId: string): Promise<number>;
  updateTopic(datasetId: string, recordId: string, topic: string): Promise<void>;
  updateTopicsBatch(datasetId: string, updates: Map<string, string>): Promise<number>;
  updateData(datasetId: string, recordId: string, data: unknown): Promise<void>;
  updateEvalScores(datasetId: string, recordId: string, update: ScoreUpdate): Promise<void>;
  clearAllTopics(datasetId: string): Promise<number>;
  renameTopic(datasetId: string, oldName: string, newName: string): Promise<number>;
  spanExists(datasetId: string, spanId: string): Promise<boolean>;
  getDatasetsBySpanId(spanId: string): Promise<Dataset[]>;
}

// src/services/interfaces/workflow-service.ts
interface WorkflowService {
  create(datasetId: string, goals: string): Promise<FinetuneWorkflowState>;
  get(id: string): Promise<FinetuneWorkflowState | null>;
  getByDataset(datasetId: string): Promise<FinetuneWorkflowState | null>;
  getAll(): Promise<FinetuneWorkflowState[]>;
  update(workflow: FinetuneWorkflowState): Promise<void>;
  delete(id: string): Promise<void>;
  advanceToStep(id: string, step: FinetuneStep): Promise<FinetuneWorkflowState | null>;
  markStepFailed(id: string): Promise<FinetuneWorkflowState | null>;
  updateStepData<K extends keyof FinetuneWorkflowState>(
    id: string, key: K, data: FinetuneWorkflowState[K]
  ): Promise<FinetuneWorkflowState | null>;
  // Snapshots
  createSnapshot(workflow: FinetuneWorkflowState): Promise<string>;
  getSnapshots(workflowId: string): Promise<WorkflowSnapshotStore[]>;
  rollbackToSnapshot(snapshotId: string): Promise<FinetuneWorkflowState | null>;
  // Generation history
  recordGeneration(workflowId: string, data: GenerationData): Promise<string>;
  getGenerationHistory(workflowId: string): Promise<GenerationHistoryStore[]>;
  // Job evaluation cache
  getCachedJobEvaluations(jobId: string): Promise<CachedJobEvaluation | null>;
  saveJobEvaluationsCache(jobId: string, data: FinetuneEvalResultsResponse): Promise<void>;
}

// src/services/interfaces/dry-run-service.ts
interface DryRunJobService {
  create(job: Omit<DryRunJob, 'id'>): Promise<DryRunJob>;
  get(id: string): Promise<DryRunJob | null>;
  getByDataset(datasetId: string): Promise<DryRunJob[]>;
  getRunning(): Promise<DryRunJob[]>;
  getPending(): Promise<DryRunJob[]>;
  update(id: string, updates: Partial<DryRunJob>): Promise<DryRunJob | null>;
  delete(id: string): Promise<void>;
  deleteByDataset(datasetId: string): Promise<void>;
}

// src/services/interfaces/knowledge-source-service.ts
interface KnowledgeSourceService {
  create(datasetId: string, name: string, type: KnowledgeSourceType, options?: CreateOptions): Promise<KnowledgeSource>;
  get(id: string): Promise<KnowledgeSource | null>;
  getByDataset(datasetId: string): Promise<KnowledgeSource[]>;
  getCount(datasetId: string): Promise<number>;
  updateStatus(id: string, status: KnowledgeSourceStatus, options?: StatusOptions): Promise<void>;
  updateProgress(id: string, progress: KnowledgeSourceProgress): Promise<void>;
  updateChunks(id: string, content: ExtractedContent, phase: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByDataset(datasetId: string): Promise<void>;
  search(datasetId: string, query: string): Promise<SearchResult[]>;
}
```

### Migration plan (per service)

```
Phase 0 (now — no BE dependency):
  1. Create interface files in src/services/interfaces/
  2. Create IndexedDB adapters that wrap existing code
  3. Create a service registry / provider context
  4. DO NOT change any consumers yet

Phase 1 (when BE /finetune/workflows + /records endpoints ready):
  1. Create API adapters for DatasetService + RecordService
  2. Swap adapter in the registry
  3. Update contexts to use registry instead of direct imports
  4. Update tools to use registry instead of direct imports
  5. Test: skill creates data via API → UI sees it

Phase 2 (when BE workflow state endpoints ready):
  1. Create API adapter for WorkflowService
  2. Swap adapter

Phase 3 (when BE dry-run + iteration endpoints ready):
  1. Create API adapters for DryRunJobService + IterationService
  2. Swap adapters

Phase 4 (when BE knowledge source endpoints ready):
  1. Create API adapter for KnowledgeSourceService
  2. Swap adapter
  3. Remove all IndexedDB code
```

---

## Skill Rewrite Plan

### What changes

| Aspect | Current Skill | New Skill |
|--------|--------------|-----------|
| Target | Standalone CLI-only | CLI with optional UI handoff |
| API target | `localhost:9090` only | `localhost:9090` (gateway) |
| Data storage | Local filesystem (JSONL, JSON) | Gateway local API (`/finetune/workflows/*`) |
| Handoff | None | "Open in UI" after data prep |
| Knowledge files | 2300 lines (duplicates enhance-lucy docs) | Trimmed to vLLora-specific: API, JSONL format, grader runtime |
| Mode | Single mode (full pipeline) | Two modes: data prep + handoff, OR full CLI pipeline |

### Two modes

**Mode A: Data Prep + Handoff to Lucy**
```
1. Define objective
2. Read documents, extract knowledge
3. Build topic hierarchy
4. Generate JSONL training data
5. Write grader
6. Create workflow via API: POST /finetune/workflows
7. Upload records via API: POST /finetune/workflows/{id}/records
8. Upload topics + grader via API
9. Print: "Open vLLora UI → select '{workflow_name}' → Lucy will take over"
```

**Mode B: Full CLI Pipeline (existing, updated)**
```
Steps 1-5 same as Mode A
6. Upload dataset to cloud: POST /finetune/datasets
7. Create evaluation: POST /finetune/evaluations
8. Poll results, analyze, iterate
9. Start training: POST /finetune/reinforcement-jobs
10. At any point: "Open vLLora UI to see progress"
```

### Skill file structure (new)

```
finetune-skill/
├── SKILL.md                      # Main entry (~200 lines, two modes)
├── knowledge/
│   ├── api-reference.md          # Updated gateway endpoints (finetune + local workflow)
│   ├── data-format.md            # JSONL format (mostly unchanged)
│   ├── grader-writing.md         # Grader patterns (trimmed, agent knows most of this)
│   └── iteration-strategy.md     # Trimmed to key vLLora-specific decisions
├── templates/
│   ├── sample-conversation.jsonl # Example prompts
│   └── grader-template.js        # Starter grader
└── README.md                     # Maintainer docs (trimmed)
```

### What gets removed from knowledge files

The agent (Claude) already knows:
- How RFT works conceptually
- How to design topic hierarchies
- How to write JavaScript
- How to analyze scores and iterate
- Stall patterns and escalation (generic ML knowledge)

The skill only needs to teach:
- vLLora-specific API endpoints and request/response formats
- JSONL format requirements (`messages` array, `id` field, prompts-only)
- Grader runtime environment (`__langdb_call_llm_as_judge_obj`, server-side execution)
- The workflow API for UI handoff
- `dataset_id` must be UUID
- Score thresholds for GO/NO-GO (avg > 0.6, pass rate > 70%)

---

## Sequence: What to build when

```
Now (no BE dependency):
  ✅ This spec doc
  ✅ UI abstraction layer interfaces (Phase 0)
  ✅ Skill rewrite (SKILL.md + trimmed knowledge files)

When BE workflow + records endpoints ready:
  → UI: Create API adapters, swap in (Phase 1)
  → Skill: Update api-reference.md with real endpoint shapes
  → Test: skill creates workflow → UI shows it

When BE workflow state endpoints ready:
  → UI: Phase 2 swap

When BE remaining endpoints ready:
  → UI: Phase 3-4 swap
  → Remove IndexedDB entirely
```

---

## Open decisions

1. **Event system**: Currently IndexedDB adapters emit custom DOM events (`DATASET_REFRESH_EVENT`, `vllora_dry_run_job_update`). The API adapter needs the same events — likely via SSE from gateway or polling.

2. **Offline support**: Moving to API means the UI needs the gateway running. Currently IndexedDB works offline. This is acceptable since the gateway is always required anyway.

3. **Migration of existing data**: Users with data in IndexedDB need a one-time migration to the gateway. Could be an automatic migration on first load, or manual export/import.

4. **Real-time updates**: When the skill writes data via API, the UI needs to reflect changes. Options: SSE from gateway, polling, or manual refresh.
