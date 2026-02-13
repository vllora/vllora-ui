# Lucy Finetune Agent - State Machine

This document describes the workflow state machine for the Lucy Finetune Agent system.

---

## State Overview

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
    ┌───────────────▼───────────────┐                         │
    │        not_started            │                         │
    └───────────────┬───────────────┘                         │
                    │ start_finetune_workflow                 │
                    ▼                                          │
    ┌───────────────────────────────┐                         │
    │       topics_config           │────────────┐            │
    │         (Step 1)              │            │            │
    └───────────────┬───────────────┘            │            │
                    │                            │ skip       │
                    ▼                            │            │
    ┌───────────────────────────────┐            │            │
    │         categorize            │────────────┤            │
    │         (Step 2)              │            │            │
    └───────────────┬───────────────┘            │            │
                    │                            │            │
                    ▼                            │            │
    ┌───────────────────────────────┐            │            │
    │     coverage_generation       │            │            │
    │         (Step 3)              │            │            │
    └───────────────┬───────────────┘            │            │
                    │                            ▼            │
                    ▼              ┌─────────────────────────┐│
    ┌───────────────────────────────────────────────────────┐││
    │              grader_config (REQUIRED)                 │◄┘
    │                    (Step 4)                           │
    └───────────────┬──────────────┬────────────────────────┘
                    │              │ skip
                    ▼              │
    ┌───────────────────────────────┐              │
    │           dry_run             │              │
    │           (Step 5)            │              │
    └───────────────┬───────────────┘              │
                    │                              │
                    ▼              ◄───────────────┘
    ┌───────────────────────────────┐
    │           training            │
    │        (Step 6 - REQUIRED)    │
    └───────────────┬───────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │          deployment           │
    │           (Step 7)            │
    └───────────────┬───────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │          completed            │
    └───────────────────────────────┘
```

---

## Step Definitions

### FinetuneStep Enum

```typescript
type FinetuneStep =
  | 'not_started'
  | 'topics_config'
  | 'categorize'
  | 'coverage_generation'
  | 'grader_config'
  | 'dry_run'
  | 'training'
  | 'deployment'
  | 'completed';
```

### Step Status Enum

```typescript
type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
```

---

## Valid State Transitions

The workflow supports flexible transitions defined in `workflow/index.ts`:

### Step Order

```typescript
const STEP_ORDER: FinetuneStep[] = [
  'not_started',      // 0
  'topics_config',    // 1
  'categorize',       // 2
  'coverage_generation', // 3
  'grader_config',    // 4
  'dry_run',          // 5
  'training',         // 6
  'deployment',       // 7
  'completed',        // 8
];
```

### Transition Rules

| From | To | Valid? | Notes |
|------|----|--------|-------|
| Any step | Next step (+1) | ✅ | Normal sequential flow |
| `not_started` | `grader_config` | ✅ | **Quick path** - skip ALL preparation steps |
| `topics_config` | `grader_config` | ✅ | Skip categorization & coverage |
| `categorize` | `grader_config` | ✅ | Skip coverage |
| `grader_config` | `training` | ✅ | Skip dry run |
| Any other skip | - | ❌ | Not allowed |

### Implementation

```typescript
function isValidStepTransition(from: FinetuneStep, to: FinetuneStep): boolean {
  const fromIndex = getStepIndex(from);
  const toIndex = getStepIndex(to);

  // Normal flow: advance one step at a time
  if (toIndex === fromIndex + 1) {
    return true;
  }

  // Quick path: Allow skipping directly from not_started to grader_config
  // This enables users to see the end-to-end flow quickly with just records + evaluation function
  if (to === 'grader_config' && from === 'not_started') {
    return true;
  }

  // Skip to grader_config from topics_config or categorize
  if (to === 'grader_config' && (from === 'topics_config' || from === 'categorize')) {
    return true;
  }

  // Skip dry_run and go directly to training
  if (to === 'training' && from === 'grader_config') {
    return true;
  }

  return false;
}
```

---

## Step Details

> **Important:** Only **grader_config** (Step 4) and **training** (Step 6) are required.
> All other steps are optional improvements that enhance training quality but are not blocking.

### Step 1: Topics Configuration (`topics_config`)

**Purpose:** Define a topic hierarchy to organize training data by categories.

| Property | Value |
|----------|-------|
| Required | **No** (optional - improves organization) |
| Can Skip To | `grader_config` directly |
| Tools | `generate_topics`, `apply_topic_hierarchy`, `adjust_topic_hierarchy`, `get_topic_hierarchy` |
| Output | `topicsConfig` object stored in workflow |

**State Transitions:**
- `pending` → `in_progress`: When user requests topic generation
- `in_progress` → `completed`: When hierarchy is applied
- `in_progress` → `failed`: When an error occurs during the step
- `pending` → `skipped`: When user chooses to skip

**Data Stored:**
```typescript
interface TopicsConfig {
  hierarchy: TopicNode[];
  source: 'generated' | 'manual' | 'imported';
  generatedAt: number;
}
```

---

### Step 2: Categorization (`categorize`)

**Purpose:** Assign each record to one or more topics from the hierarchy.

| Property | Value |
|----------|-------|
| Required | **No** (optional - improves coverage analysis) |
| Depends On | Step 1 (if Step 1 skipped, this is also skipped) |
| Can Skip To | `grader_config` directly |
| Tools | `categorize_records` |
| Output | `categorization` object stored in workflow |

**State Transitions:**
- `pending` → `in_progress`: When categorization begins
- `in_progress` → `completed`: When all records are categorized
- `in_progress` → `failed`: When an error occurs during categorization
- `pending` → `skipped`: When user skips (also skips if Step 1 skipped)

**Data Stored:**
```typescript
interface CategorizationResult {
  totalRecords: number;
  categorizedRecords: number;
  categorizedAt: number;
}
```

---

### Step 3: Coverage & Generation (`coverage_generation`)

**Purpose:** Analyze topic coverage gaps and generate synthetic data to fill them.

| Property | Value |
|----------|-------|
| Required | **No** (optional - improves data balance) |
| Depends On | Steps 1-2 (if skipped, this is also skipped) |
| Can Skip To | `grader_config` directly |
| Tools | `analyze_coverage`, `generate_synthetic_data`, `generate_initial_data` |
| Output | `coverageGeneration` object stored in workflow |

**Two Supported Workflows:**

1. **Data-First Workflow** (Seed-Based):
   - Start with few seed records
   - Generate variations without topics
   - Create topics after generation
   - Categorize all records

2. **Topics-First Workflow** (Coverage-Based):
   - Define topic hierarchy first
   - Categorize existing records
   - Analyze coverage gaps
   - Generate data for under-represented topics

**Data Stored:**
```typescript
interface CoverageGenerationResult {
  balanceScore: number;           // 0.0 - 1.0
  gaps: TopicGap[];
  generatedRecords: number;
  strategy: GenerationStrategy;
  completedAt: number;
}
```

---

### Step 4: Grader Configuration (`grader_config`)

**Purpose:** Configure the evaluation function (grader) for training.

| Property | Value |
|----------|-------|
| Required | **YES** (must have evaluator before training) |
| Can Skip From | `not_started`, `topics_config`, `categorize` |
| Tools | `configure_grader`, `test_grader_sample` |
| Output | `graderConfig` object stored in workflow |

**This is one of only TWO required steps** (along with training). Users can jump directly here from `not_started` if they just want to configure the evaluator and start training quickly.

**Grader Types:**
- `llm_as_judge` - LLM evaluates responses
- `javascript` - Custom JS evaluation script

**Data Stored:**
```typescript
interface GraderConfig {
  type: 'javascript' | 'llm_as_judge';
  script?: string;                 // For JavaScript evaluator
  model?: string;                  // For LLM-as-Judge
  testedAt: number;
  testResults: GraderTestResult[];
}
```

---

### Step 5: Dry Run (`dry_run`)

**Purpose:** Validate the dataset and grader by running a test evaluation.

| Property | Value |
|----------|-------|
| Required | **No** (recommended but can skip) |
| Can Skip To | `training` directly |
| Tools | `upload_dataset`, `sync_evaluator`, `run_dry_run` |
| Output | `dryRun` object stored in workflow |

**Prerequisites:**
- Must call `upload_dataset` before `run_dry_run`
- Use `sync_evaluator` to update grader after upload

**State Transitions:**
- `pending` -> `in_progress`: When dry run is started via `run_dry_run` tool or UI
- `in_progress` -> `completed`: When polling detects successful backend evaluation
- `in_progress` -> `failed`: When polling times out (~12 min), consecutive errors occur (5 failures), or backend reports failure
- `pending` -> `skipped`: When user skips dry run via `advance_to_step` to `training`

**Failure Detection (Polling Manager):**

The `dry-run-polling-manager.ts` singleton manages background polling and detects failures:

| Failure Mode | Threshold | Behavior |
|-------------|-----------|----------|
| Polling timeout | 120 attempts (~12 min at 6s interval) | Job marked failed, workflow step marked failed |
| Consecutive errors | 5 consecutive poll failures | Job marked failed, workflow step marked failed |
| Backend failure | Backend reports `status: 'failed'` | Job marked failed, workflow step marked failed |

On failure, the polling manager calls `markStepFailed()` which sets `stepStatus.dry_run = 'failed'` in the workflow state.

**Workflow State Sync:**

On successful completion, the polling manager populates `workflow.dryRun` via `updateStepData()`:
```typescript
{
  mean: number,
  std: number,
  percentAboveZero: number,
  percentPerfect: number,
  verdict: 'GO' | 'NO-GO' | 'WARNING',
  sampleResults: Array<{ recordId, prompt, response, score, reasoning }>,
  recommendations: string[],
}
```

**Cancel Support:**

Users can cancel a running dry run via the cancel button in the dry run dialog. Cancellation stops polling and marks the job as `cancelled`.

**Dry Run Metrics:**
| Metric | Healthy Range | Description |
|--------|---------------|-------------|
| Mean | 0.25-0.65 | Average score across samples |
| Std | 0.10-0.25 | Score spread/variance |
| %>0 | >10-20% | Tasks base model can't do perfectly |
| %=1.0 | <30-50% | Tasks already perfect (no learning signal) |

**Verdicts:**
- `GO` - Metrics look good, proceed to training
- `WARNING` - Some concerns, user decides
- `NO-GO` - Problems detected, recommend fixing

**Data Stored:**
```typescript
interface DryRunResult {
  verdict: DryRunVerdict;          // 'GO' | 'WARNING' | 'NO_GO'
  mean: number;
  std: number;
  percentAboveZero: number;
  percentPerfect: number;
  sampleCount: number;
  diagnosis?: string;
  recommendations: string[];
  completedAt: number;
}
```

**Per-Record Score Persistence:**

During dry run polling, individual row scores from the backend are persisted to each record's `evaluation` field via `updateRecordEvaluation()` in `dry-run-polling-manager.ts`. This enables the `QualityIndicator` component to display per-record scores in the records table (green >= 0.8, amber >= 0.6, red < 0.6). Scores are stored as `DatasetEvaluation` on `DatasetRecord.evaluation`.

---

### Step 6: Training (`training`)

**Purpose:** Start and monitor the fine-tuning training job.

| Property | Value |
|----------|-------|
| Required | **YES** (core purpose of the workflow) |
| Prerequisites | `grader_config` must be completed |
| Tools | `start_training`, `check_training_status` |
| Output | `training` object stored in workflow |

**This is one of only TWO required steps** (along with grader_config). Once grader is configured, users can proceed directly to training.

**Data Stored:**
```typescript
interface TrainingResult {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  modelId?: string;                // Set when completed
  progress?: number;
  currentEpoch?: number;
  totalEpochs?: number;
  metrics?: {
    trainReward: number;
    validReward: number;
    loss: number;
  };
  startedAt: number;
  completedAt?: number;
}
```

---

### Step 7: Deployment (`deployment`)

**Purpose:** Deploy the trained model for inference.

| Property | Value |
|----------|-------|
| Required | No (optional) |
| Tools | `deploy_model` |
| Output | `deployment` object stored in workflow |

**Data Stored:**
```typescript
interface DeploymentResult {
  modelId: string;
  endpoint: string;
  deployedAt: number;
}
```

---

## Workflow State Structure

```typescript
interface FinetuneWorkflowState {
  id: string;                                    // Unique workflow ID
  datasetId: string;                             // Associated dataset
  trainingGoals: string;                         // User's stated goals
  currentStep: FinetuneStep;                     // Current active step
  stepStatus: Record<FinetuneStep, StepStatus>;  // Status of each step

  // Step-specific results (null until completed)
  inputValidation: InputValidationResult | null;
  topicsConfig: TopicsConfig | null;
  categorization: CategorizationResult | null;
  coverageGeneration: CoverageGenerationResult | null;
  graderConfig: GraderConfig | null;
  dryRun: DryRunResult | null;
  training: TrainingResult | null;
  deployment: DeploymentResult | null;

  createdAt: number;
  updatedAt: number;
}
```

---

## Workflow Control Tools

| Tool | From States | To States | Description |
|------|-------------|-----------|-------------|
| `start_finetune_workflow` | (none) | `topics_config` | Initialize new workflow |
| `get_workflow_status` | (any) | (same) | Read-only status check |
| `advance_to_step` | (any) | (next/skip) | Move forward in workflow |
| `rollback_to_step` | (any) | (previous) | Restore from snapshot |

### Rollback Rules

```typescript
function canRollbackTo(currentStep: FinetuneStep, targetStep: FinetuneStep): boolean {
  const currentIndex = getStepIndex(currentStep);
  const targetIndex = getStepIndex(targetStep);

  // Can rollback to any previous step (but not not_started)
  return targetIndex < currentIndex && targetIndex > 0;
}
```

---

## Snapshot System

Snapshots enable rollback functionality by preserving workflow state at key points.

```typescript
interface WorkflowSnapshot {
  id: string;
  workflowId: string;
  step: FinetuneStep;
  state: FinetuneWorkflowState;   // Complete state at snapshot time
  createdAt: number;
}
```

**Snapshot Triggers:**
- Before advancing to a new step
- After completing a step successfully
- Before starting a potentially destructive operation

---

## IndexedDB Storage

The finetune workflow system uses **three separate IndexedDB databases** to persist data:

### Database 1: `vllora-finetune` (Workflow State)

**Purpose:** Stores workflow progress, step metadata, snapshots, dry run jobs, and proposed plans. Does NOT store actual configuration data.

**Version:** 4

| Object Store | Key | Indexes | Added In | Description |
|--------------|-----|---------|----------|-------------|
| `workflows` | `id` | `datasetId`, `currentStep`, `createdAt`, `updatedAt` | v1 | Workflow state per dataset |
| `snapshots` | `id` | `workflowId`, `step`, `createdAt` | v1 | State snapshots for rollback |
| `generationHistory` | `id` | `workflowId`, `createdAt` | v1 | Synthetic data generation runs |
| `dryRunJobs` | `id` | `datasetId`, `status`, `createdAt` | v2 | Dry run job tracking |
| `jobEvaluations` | `id` | `updatedAt` | v3 | Finetune job evaluation results (includes `scoresPersisted` flag) |
| `proposedPlans` | `datasetId` | (none) | v4 | Persisted setup plans with lifecycle status tracking |

#### Proposed Plans Store Schema

```typescript
type PlanStatus = 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'dismissed';

interface StoredPlan {
  datasetId: string;             // Key — one plan per dataset
  plan: SetupPlan;               // The full plan data
  status: PlanStatus;            // Lifecycle status (single source of truth)
  executionProgress: ExecutionProgress | null;  // Per-step progress (persisted for refresh survival)
  createdAt: number;
  updatedAt: number;
}
```

**Plan Status Transitions:**
```
proposed → approved → executing → completed
                                → failed
proposed → dismissed (deleted from store)
```

- **proposed**: Lucy generated and presented the plan. Stored in IndexedDB, shown in UI.
- **approved**: User clicked "Approve & Execute". Plan remains in IndexedDB (NOT deleted).
- **executing**: `execute_setup_plan` tool handler is running steps. Progress written to IndexedDB on each step.
- **completed**: All steps finished successfully. Final progress preserved.
- **failed**: A step failed during execution. Final progress preserved with error details.
- **dismissed**: User discarded the plan. Record deleted from IndexedDB entirely.

**Backward Compatibility:** Old records without `status` field are normalized to `'proposed'` on read.

#### Workflow Store Schema

```typescript
interface FinetuneWorkflowState {
  // Identity
  id: string;                    // Unique workflow ID (UUID)
  datasetId: string;             // Reference to dataset in vllora-datasets DB
  trainingGoals: string;         // User's stated training objectives

  // Progress tracking
  currentStep: FinetuneStep;     // Current active step
  stepStatus: Record<FinetuneStep, StepStatus>;  // Status of each step

  // Step metadata (NOT the actual config data)
  inputValidation: { recordCount, validCount, invalidCount, validationErrors } | null;
  topicsConfig: { topicCount, depth, generatedAt, method } | null;  // Hierarchy in Dataset.topicHierarchy
  categorization: { assignedCount, lowConfidenceCount, confidenceThreshold } | null;
  coverageGeneration: { balanceScore, topicDistribution, recommendations, generationRounds, syntheticCount, syntheticPercentage } | null;
  graderConfig: { type, configuredAt } | null;  // Actual config in Dataset.evaluationConfig
  dryRun: { mean, std, percentAboveZero, percentPerfect, verdict, sampleResults, recommendations } | null;
  training: { jobId, baseModel, status, startedAt, progress, metrics, modelId } | null;
  deployment: { deployedAt, modelId, deploymentName, endpoint } | null;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}
```

#### Snapshots Store Schema

```typescript
interface WorkflowSnapshotStore {
  id: string;              // Format: "{workflowId}-{step}-{timestamp}"
  workflowId: string;      // Reference to parent workflow
  step: FinetuneStep;      // Step at which snapshot was taken
  state: FinetuneWorkflowState;  // Complete workflow state copy
  createdAt: number;
}
```

#### Generation History Store Schema

```typescript
interface GenerationHistoryStore {
  id: string;              // Format: "{workflowId}-gen-{timestamp}"
  workflowId: string;
  strategy: GenerationStrategy;   // 'message_variation' | 'few_shot' | 'topic_description' | etc.
  topicsTargeted: string[];
  recordsGenerated: number;
  recordsValid: number;
  balanceScoreBefore: number;
  balanceScoreAfter: number;
  createdAt: number;
}
```

#### Job Evaluations Store Schema

```typescript
interface CachedJobEvaluation {
  jobId: string;                     // Primary key (finetune job ID)
  data: FinetuneEvalResultsResponse; // Cached evaluation results from backend
  updatedAt: number;
  scoresPersisted?: boolean;         // Whether scores have been written to records
}
```

The `scoresPersisted` flag tracks whether finetune evaluation scores from a completed job have been persisted to individual `DatasetRecord.evaluation` fields in the `vllora-datasets` database. This flag is backed by IndexedDB (not volatile in-memory state), so it survives page refreshes. Scores are only marked as persisted after `persistFinetuneScoresToRecords()` confirms that records were actually updated (`persisted > 0`).

---

### Database 2: `vllora-datasets` (Dataset & Records)

**Purpose:** Stores actual dataset data including records, topic hierarchy, and evaluation configuration.

| Object Store | Key | Indexes | Description |
|--------------|-----|---------|-------------|
| `datasets` | `id` | `name`, `createdAt` | Dataset metadata and configurations |
| `records` | `id` | `datasetId`, `createdAt` | Training records (input/output pairs, with optional `evaluation` field for per-record quality scores) |

#### What's Stored in Dataset (NOT in Workflow)

```typescript
interface Dataset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  // Dataset state for tracking finetune progress
  state?: DatasetState;              // 'draft' | 'in_finetune' | 'completed'

  // Training objective
  datasetObjective?: string;

  // Actual configuration data (workflow only stores metadata)
  topicHierarchy?: TopicHierarchyConfig;  // Full topic tree (Step 1 output)
  evalScript?: string;                     // JavaScript evaluation script (Step 4 output)

  // Backend sync
  backendDatasetId?: string;  // ID from backend after upload

  // Statistics for UI display
  coverageStats?: CoverageStats;
  dryRunStats?: DryRunStats;
  stats?: DatasetStats;

  // Auto-generated README
  readme?: string;
}
```

**DatasetState** tracks the finetune lifecycle. The shared `DATASET_STATE_CONFIG` array in `dataset-types.ts` provides display labels and CSS classes for each state, consumed by the `DatasetCard` state badge and `DatasetsListHeader` filter tabs.

---

### Database 3: `vllora-knowledge-sources` (Knowledge Sources)

**Purpose:** Stores uploaded knowledge source documents (PDFs, text, etc.) with extracted content and metadata.

**Version:** 1

**File:** `ui/src/services/knowledge-sources-db.ts`

| Object Store | Key | Indexes | Description |
|--------------|-----|---------|-------------|
| `knowledge_sources` | `id` | `datasetId`, `status`, `type` | Uploaded documents with extracted content |

---

### Storage Separation Rationale

| Data Type | Stored In | Why |
|-----------|-----------|-----|
| Workflow progress | `vllora-finetune` (workflows) | Allows multiple workflows per dataset, snapshots, rollback |
| Topic hierarchy | `vllora-datasets` (Dataset) | Shared across workflows, used by records |
| Evaluation config | `vllora-datasets` (Dataset) | Shared across workflows, synced to backend |
| Records | `vllora-datasets` (Records) | Core data, independent of workflow |
| Training job info | `vllora-finetune` (workflows) | Workflow-specific, includes job ID and status |
| Snapshots | `vllora-finetune` (snapshots) | Enables rollback without affecting dataset |
| Dry run jobs | `vllora-finetune` (dryRunJobs) | Tracks dry run execution per dataset |
| Job evaluations | `vllora-finetune` (jobEvaluations) | Stores finetune job evaluation cache + `scoresPersisted` flag for persistence tracking |
| Proposed plans | `vllora-finetune` (proposedPlans) | Persists plans with lifecycle status (`proposed` → `approved` → `executing` → `completed`/`failed`) |
| Knowledge sources | `vllora-knowledge-sources` | Documents are large, independent lifecycle from workflow |

**Key Design Decision:** The workflow stores **metadata/pointers** to configurations, not the configurations themselves. This prevents data duplication and ensures the dataset remains the source of truth for `topicHierarchy` and `evaluationConfig`.

---

## Quick Path (Minimum Viable Workflow)

The shortest path to training requires only **two things**:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ not_started  │────►│ grader_config│────►│   training   │────►│  completed   │
│              │     │  (REQUIRED)  │     │  (REQUIRED)  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

**How to use Quick Path:**

Option 1: Use `start_step` parameter when starting workflow:
```typescript
start_finetune_workflow({
  dataset_id: "...",
  training_goals: "...",
  start_step: "grader_config"  // Skip directly to grader config
})
```

Option 2: Use `advance_to_step` after starting:
```typescript
// Start workflow (lands at not_started or topics_config)
start_finetune_workflow({ dataset_id: "...", training_goals: "..." })

// Skip to grader_config
advance_to_step({ workflow_id: "...", step: "grader_config" })
```

**Skipped Steps:**
- `topics_config` (Step 1)
- `categorize` (Step 2)
- `coverage_generation` (Step 3)
- `dry_run` (Step 5)
- `deployment` (Step 7)

**Minimum Requirements:**
1. **Dataset with records** - At least some input/output pairs exist
2. **Evaluation function configured** - JavaScript or LLM-as-Judge grader set up

**Why allow this?**
- Users can quickly see the **end-to-end flow** without extensive setup
- Results may not be optimal, but provides a fast feedback loop
- Users can iterate and add optional steps later to improve quality

---

## Step Dependencies Visualization

```
                    ┌─────────────────────────────────────────┐
                    │         OPTIONAL IMPROVEMENT PATH        │
                    │                                         │
                    │  topics_config ──► categorize ──►       │
                    │                    coverage_generation  │
                    │                          │              │
                    └──────────────────────────┼──────────────┘
                                               │
                                               ▼
┌─────────────┐                        ┌─────────────┐
│ not_started │──── QUICK PATH ───────►│grader_config│ (REQUIRED)
└─────────────┘                        └─────────────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           │                   │                   │
                           ▼                   │                   ▼
                    ┌─────────────┐            │            ┌─────────────┐
                    │   dry_run   │ (optional) │            │  training   │
                    └─────────────┘            │            │ (REQUIRED)  │
                           │                   │            └─────────────┘
                           └───────────────────┘                   │
                                                                   ▼
                                                            ┌─────────────┐
                                                            │ deployment  │
                                                            │ (optional)  │
                                                            └─────────────┘
                                                                   │
                                                                   ▼
                                                            ┌─────────────┐
                                                            │  completed  │
                                                            └─────────────┘
```

**Dependency Rules:**

**Required Path (minimum):**
- `grader_config` is **REQUIRED** (must configure evaluation function)
- `training` is **REQUIRED** and requires `grader_config` to be completed

**Optional Enhancement Path:**
- `categorize` requires `topics_config` (or both skipped)
- `coverage_generation` requires `categorize` (or both skipped)
- Steps 1-3 can be entirely skipped to go directly to `grader_config`

**Optional Validation:**
- `dry_run` requires `grader_config` but can be skipped
- `deployment` requires `training` but can be skipped

---

## Context Injection

Every user message is prepended with the dataset ID and workflow context in this format:

```
DATASET_ID: dataset-123

Context:
```json
{
  "page": "datasets",
  "current_dataset_id": "dataset-123",
  "finetune_workflow": {
    "workflow_id": "workflow-456",
    "current_step": "coverage_generation",
    "step_status": {
      "not_started": "completed",
      "topics_config": "completed",
      "categorize": "completed",
      "coverage_generation": "in_progress",
      "grader_config": "pending",
      "dry_run": "pending",
      "training": "pending",
      "deployment": "pending",
      "completed": "pending"
    },
    "coverage": 0.72,
    "has_grader": false,
    "dry_run_verdict": null,
    "training_status": null
  }
}
```

This context allows the agent to make informed decisions about which tools to use and what guidance to provide.

---

## Related Documentation

- [Architecture](./architecture.md) - System architecture overview
- [Overview](./01-overview.md) - High-level feature overview
- [README](./README.md) - Complete design document
