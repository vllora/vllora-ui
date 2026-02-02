# Lucy Finetune Agent - State Machine

This document describes the workflow state machine for the Lucy Finetune Agent system.

---

## State Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Finetune Workflow State Machine                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐                                                               │
│   │ not_started  │ ─── start_finetune_workflow ───►                              │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │ topics_config│ ─── generate_topics + apply_topic_hierarchy ───►              │
│   │   (Step 1)   │     [OPTIONAL: can skip]                                      │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │  categorize  │ ─── categorize_records ───►                                   │
│   │   (Step 2)   │     [OPTIONAL: can skip]                                      │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │  coverage_   │ ─── analyze_coverage + generate_synthetic_data ───►           │
│   │  generation  │     [OPTIONAL: can skip]                                      │
│   │   (Step 3)   │                                                               │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │ grader_config│ ─── configure_grader + test_grader_sample ───►                │
│   │   (Step 4)   │     [REQUIRED for training]                                   │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │   dry_run    │ ─── upload_dataset + run_dry_run ───►                         │
│   │   (Step 5)   │     [RECOMMENDED but can skip]                                │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │   training   │ ─── start_training + check_training_status ───►               │
│   │   (Step 6)   │     [REQUIRED]                                                │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │  deployment  │ ─── deploy_model ───►                                         │
│   │   (Step 7)   │     [OPTIONAL]                                                │
│   └──────────────┘                                                               │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────┐                                                               │
│   │  completed   │                                                               │
│   └──────────────┘                                                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
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
type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
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
| Tools | `generate_topics`, `apply_topic_hierarchy` |
| Output | `topicsConfig` object stored in workflow |

**State Transitions:**
- `pending` → `in_progress`: When user requests topic generation
- `in_progress` → `completed`: When hierarchy is applied
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
| Required | No (optional, requires Steps 1-2) |
| Tools | `analyze_coverage`, `generate_synthetic_data` |
| Output | `coverageGeneration` object stored in workflow |

**State Transitions:**
- `pending` → `in_progress`: When coverage analysis begins
- `in_progress` → `completed`: When generation is done or user approves coverage
- `pending` → `skipped`: When user skips

**Data Stored:**
```typescript
interface CoverageGenerationResult {
  coverageScore: number;           // 0.0 - 1.0
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
| Required | **Yes** (must have evaluator before training) |
| Tools | `configure_grader`, `test_grader_sample` |
| Output | `graderConfig` object stored in workflow |

**State Transitions:**
- `pending` → `in_progress`: When grader configuration begins
- `in_progress` → `completed`: When grader is tested and confirmed
- Cannot be skipped (required for training)

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
| Required | No (recommended but can skip) |
| Tools | `upload_dataset`, `sync_evaluator`, `run_dry_run` |
| Output | `dryRun` object stored in workflow |

**State Transitions:**
- `pending` → `in_progress`: When dry run begins
- `in_progress` → `completed`: When dry run passes
- `in_progress` → `pending`: When dry run fails (can retry)
- `pending` → `skipped`: When user chooses to skip

**Data Stored:**
```typescript
interface DryRunResult {
  verdict: DryRunVerdict;          // 'pass' | 'fail' | 'warning'
  sampleSize: number;
  averageScore: number;
  issues: DryRunIssue[];
  completedAt: number;
}
```

---

### Step 6: Training (`training`)

**Purpose:** Start and monitor the fine-tuning training job.

| Property | Value |
|----------|-------|
| Required | **Yes** |
| Tools | `start_training`, `check_training_status` |
| Output | `training` object stored in workflow |

**State Transitions:**
- `pending` → `in_progress`: When training job starts
- `in_progress` → `completed`: When training completes successfully
- `in_progress` → `pending`: When training fails (can retry)

**Data Stored:**
```typescript
interface TrainingResult {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  modelId?: string;                // Set when completed
  startedAt: number;
  completedAt?: number;
  metrics?: TrainingMetrics;
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

**State Transitions:**
- `pending` → `in_progress`: When deployment begins
- `in_progress` → `completed`: When model is deployed
- `pending` → `skipped`: When user skips

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

  // Metadata
  createdAt: number;
  updatedAt: number;
}
```

---

## State Transitions

### Workflow Control Tools

| Tool | From States | To States | Description |
|------|-------------|-----------|-------------|
| `start_finetune_workflow` | (none) | `topics_config` | Initialize new workflow |
| `get_workflow_status` | (any) | (same) | Read-only status check |
| `advance_to_step` | (any) | (next step) | Move forward in workflow |
| `rollback_to_step` | (any) | (previous step) | Restore from snapshot |

### Advance Rules

1. **Forward Only (normally):** `advance_to_step` moves to the next logical step
2. **Skip Support:** Optional steps can be skipped
3. **Prerequisite Check:** Required steps must be completed before dependent steps
4. **Snapshot Creation:** State is snapshotted before advancing

### Rollback Rules

1. **Snapshot Restore:** Rollback restores workflow to a previous snapshot
2. **Data Preservation:** Step results are preserved in snapshots
3. **Any-to-Any:** Can rollback to any previously completed step

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

## Minimum Viable Workflow (Quick Path)

The shortest path to training requires only **two things**:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ not_started  │────►│ grader_config│────►│   training   │────►│  completed   │
│              │     │  (REQUIRED)  │     │  (REQUIRED)  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │
                     Skip all of:
                     - topics_config
                     - categorize
                     - coverage_generation
                     - dry_run
                     - deployment
```

**Minimum Requirements:**
1. **Dataset with records** - At least some input/output pairs exist
2. **Evaluation function configured** - JavaScript or LLM-as-Judge grader set up

**Why allow this?**
- Users can quickly see the **end-to-end flow** without extensive setup
- Results may not be optimal, but provides a fast feedback loop
- Users can iterate and add optional steps later to improve quality

**Note:** The training result quality depends heavily on data quality and coverage. Skipping preparation steps will likely produce suboptimal results, but allows rapid experimentation.

---

## Step Dependencies

```
topics_config ──► categorize ──► coverage_generation
                                        │
                                        ▼
grader_config ◄─────────────────────────┘
     │
     ▼
  dry_run ──► training ──► deployment ──► completed
```

**Dependency Rules:**
- `categorize` requires `topics_config` (or both skipped)
- `coverage_generation` requires `categorize` (or both skipped)
- `grader_config` is independent (required)
- `dry_run` requires `grader_config`
- `training` requires `grader_config` (and optionally `dry_run`)
- `deployment` requires `training`

---

## Context Injection

Every user message includes workflow context:

```json
{
  "page": "datasets",
  "current_dataset_id": "dataset-123",
  "finetune_workflow": {
    "workflow_id": "workflow-456",
    "current_step": "coverage_generation",
    "step_statuses": {
      "topics_config": "completed",
      "categorize": "completed",
      "coverage_generation": "in_progress",
      "grader_config": "pending",
      "dry_run": "pending",
      "training": "pending",
      "deployment": "pending"
    },
    "coverage": 0.72,
    "has_grader": false,
    "training_goals": "Improve response quality for customer support"
  }
}
```

This context allows the agent to make informed decisions about which tools to use and what guidance to provide.

---

## Related Documentation

- [Architecture](./architecture.md) - System architecture overview
- [Overview](./01-overview.md) - High-level feature overview
- [README](./README.md) - Complete design document
