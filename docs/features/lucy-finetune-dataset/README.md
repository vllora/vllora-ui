# Lucy Finetune Agent - Design Document

## Overview

This document outlines the architecture and implementation plan for refactoring Lucy from a dataset management assistant into a **process-focused Finetune Agent** that guides users through the complete RFT (Reinforcement Fine-Tuning) workflow.

### Goals

1. **Process-Focused**: Guide users through the 7-step finetune pipeline
2. **Simplified Input**: Accept DatasetRecord(s) + training goals as primary input
3. **Guided Workflow**: Provide clear guidance at each step with user interaction
4. **Quality Assurance**: Ensure users don't skip critical validation steps
5. **No UI Separation**: Single agent focused on the finetune process (not UI navigation)

### Input/Output

**Input:**
- `DatasetRecord[]` - One or more records in the standard format
- `trainingGoals: string` - User's description of desired model behaviors

**Output:**
- Fine-tuned model ID ready for deployment
- Training metrics and validation results

---

## Architecture

### Current State (To Be Replaced)

```
┌─────────────────────────────────────────────────────────────┐
│                 vllora_dataset_orchestrator                  │
│                      (Router Agent)                          │
├──────────┬──────────┬──────────────┬────────────────────────┤
│ composite│    ui    │     data     │       analysis         │
│  agent   │  agent   │    agent     │        agent           │
├──────────┴──────────┴──────────────┴────────────────────────┤
│  5 tools │ 11 tools │   12 tools   │       7 tools          │
│          │          │              │                        │
│ Combined │ Navigate │ CRUD ops on  │ Topic generation,      │
│ workflows│ select   │ datasets &   │ duplicate detection,   │
│          │ expand   │ records      │ analysis               │
└──────────┴──────────┴──────────────┴────────────────────────┘
                              ↓
                    35 tools total
                    UI-focused architecture
```

### Target State (New Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                   vllora_finetune_agent                      │
│                  (Process-Focused Agent)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Workflow   │  │   Step      │  │   Data      │         │
│  │  Control    │  │   Execution │  │   Access    │         │
│  │  Tools      │  │   Tools     │  │   Tools     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  • start_workflow     • generate_topics    • get_records    │
│  • get_status         • categorize         • save_dataset   │
│  • advance_step       • analyze_coverage   • get_stats      │
│  • rollback_step      • generate_data                       │
│  • complete_workflow  • configure_grader                    │
│                       • run_dry_run                         │
│                       • start_training                      │
│                       • deploy_model                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ~15 tools total
                    Process-focused architecture
```

---

## Workflow State Machine

```
                    ┌──────────────────┐
                    │                  │
                    │   NOT_STARTED    │
                    │                  │
                    └────────┬─────────┘
                             │ start_workflow(records, goals)
                             │ + auto-validates records
                             ▼
                    ┌──────────────────┐
                    │                  │
                    │ 1. TOPICS_CONFIG │◄─────────────────┐
                    │                  │                  │
                    └────────┬─────────┘                  │
                             │ generate_topics()         │
                             ├─────────────────────┐     │
                             ▼                     │     │
                    ┌──────────────────┐           │     │
                    │                  │           │     │
                    │ 2. CATEGORIZE    │           │     │
                    │                  │           │     │
                    └────────┬─────────┘           │     │
                             │ categorize_records()│     │
                             ├─────────────────────┤     │
                             ▼                     │     │
                    ┌──────────────────┐           │     │
                    │                  │           │     │
                    │ 3. COVERAGE &    │←──────┐   │     │ User can
                    │    GENERATE_DATA │       │   │     │ go back
                    │   (OPTIONAL)     │       │   │     │ to any
                    └────────┬─────────┘       │   │     │ previous
                             │                 │   │     │ step
                             │ analyze →       │   │     │
                             │ generate if     │   │     │
                             │ gaps found      │   │     │
                             ▼                 │   │     │
                    ┌──────────────────┐       │   │     │
                    │                  │───────┘   │     │
                    │ 4. GRADER_CONFIG │◄──────────┘     │
                    │   (REQUIRED)     │                  │
                    └────────┬─────────┘                  │
                             │ configure_grader()        │
                             ├─────────────────────┐     │
                             ▼                     │     │
                    ┌──────────────────┐           │     │
                    │                  │  ◄────────┼─────┤
                    │ 5. DRY_RUN       │  NO-GO:  │     │
                    │   (OPTIONAL)     │  fix/retry│     │
                    └────────┬─────────┘           │     │
                             │ GO decision         │     │
                             ▼                     │     │
                    ┌──────────────────┐           │     │
                    │                  │◄──────────┘     │
                    │ 6. TRAINING      │──────────────────┘
                    │                  │
                    └────────┬─────────┘
                             │ training complete
                             ▼
                    ┌──────────────────┐
                    │                  │
                    │ 7. DEPLOYMENT    │
                    │                  │
                    └────────┬─────────┘
                             │ deploy_model()
                             ▼
                    ┌──────────────────┐
                    │                  │
                    │    COMPLETED     │
                    │                  │
                    └──────────────────┘
```

**Key Points:**
- Records are INPUT to the workflow, not a step
- GENERATE_DATA is combined with COVERAGE as one step (analyze → generate if needed → repeat)
- The goal of GENERATE_DATA is to improve topic coverage balance
- **The ONLY hard requirements for training are: (1) having records, and (2) having the evaluation function configured (grader_config)**

**Quick Path to Training:**
Users who just want to see the end-to-end flow quickly can skip directly from `not_started` to `grader_config`, then proceed to `training`. This produces results (though not optimal), allowing rapid experimentation.

**Optional Steps (All Improve Quality):**
- **Topics Configuration (Step 1)**: OPTIONAL - helps organize data by categories
- **Categorization (Step 2)**: OPTIONAL - assigns records to topics for coverage analysis
- **Coverage & Generation (Step 3)**: OPTIONAL - balances dataset by generating synthetic data for gaps
- **Dry Run (Step 5)**: OPTIONAL but RECOMMENDED - validates dataset + grader quality before training

**Minimum Viable Path:**
```
not_started → grader_config → training → completed
```

This allows users to quickly experiment even if results aren't perfect.

---

## Two Supported Workflows

The system supports two different approaches for data generation:

### 1. Data-First Workflow (Seed-Based)

Use when users have a few high-quality seed records and want to expand them before organizing into topics.

```
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Raw Seed       │───>│  Generate           │───>│  Create         │───>│  Categorize     │
│  Records (1-3)  │    │  Variations         │    │  Topics         │    │  All Records    │
└─────────────────┘    └─────────────────────┘    └─────────────────┘    └─────────────────┘
```

**Steps:**
1. User provides a small number of raw seed records
2. `generate_synthetic_data` with `record_ids` parameter - works WITHOUT topic hierarchy
3. After generating enough data, `generate_topics` to create hierarchy
4. `categorize_records` to categorize all records (original + generated)
5. Continue with normal workflow

**When to use:**
- User has only a few high-quality examples
- User wants to bootstrap a dataset quickly
- User prefers to organize topics after seeing the generated data

### 2. Topics-First Workflow (Coverage-Based)

Use when users want to define topic structure first, then fill gaps.

```
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Create         │───>│  Categorize         │───>│  Analyze        │───>│  Generate for   │
│  Topics         │    │  Records            │    │  Coverage       │    │  Gaps           │
└─────────────────┘    └─────────────────────┘    └─────────────────┘    └─────────────────┘
                                                          ↑                      │
                                                          └──────────────────────┘
                                                               (repeat)
```

**Steps:**
1. `generate_topics` or `apply_topic_hierarchy` to define structure
2. `categorize_records` to assign records to topics
3. `analyze_coverage` to identify gaps
4. `generate_synthetic_data` for under-represented topics
5. Repeat until balance is satisfactory

**When to use:**
- User has a clear idea of the topic structure
- User has a larger initial dataset that needs balancing
- User wants systematic coverage across defined topics

---

## Generation Modes

The `generate_synthetic_data` tool supports two modes:

### RFT Mode (Default)
- **Output format**: Input messages only, empty output for rollouts
- **Use case**: Reinforcement Fine-Tuning where model learns from feedback
- **How it works**: Varies the last user message with different personas while preserving context
- **Parameter**: `generation_mode: 'rft'`

### SFT Mode
- **Output format**: Complete conversations with assistant responses
- **Use case**: Supervised Fine-Tuning with example responses
- **How it works**: Simulates full multi-turn conversations
- **Parameter**: `generation_mode: 'sft'`

**Default is RFT mode** - matches the standard RFT training pipeline.

---

## Data Structures

### Workflow State

```typescript
interface FinetuneWorkflowState {
  id: string;                          // Unique workflow ID
  datasetId: string;                   // Dataset being processed
  trainingGoals: string;               // User's training objective
  currentStep: FinetuneStep;           // Current step in pipeline
  stepStatus: Record<FinetuneStep, StepStatus>;

  // Input validation (runs on start_workflow)
  inputValidation: {
    recordCount: number;
    validCount: number;
    invalidCount: number;
    validationErrors: ValidationError[];
  } | null;

  // Step-specific results
  topicsConfig: {
    hierarchy: TopicHierarchyNode[];
    generatedAt: number;
    method: 'auto' | 'template' | 'manual';
  } | null;

  categorization: {
    assignedCount: number;
    lowConfidenceCount: number;
    confidenceThreshold: number;
  } | null;

  // Coverage & Generation (combined step)
  // Note: Full CoverageStats is stored on Dataset.coverageStats for UI visualization
  coverageGeneration: {
    balanceScore: number;
    topicDistribution: Record<string, number>;
    recommendations: string[];
    // Generation tracking
    generationRounds: Array<{
      strategy: GenerationStrategy;
      topicsTargeted: string[];
      recordsGenerated: number;
      timestamp: number;
    }>;
    syntheticCount: number;
    syntheticPercentage: number;
  } | null;

  graderConfig: EvaluationConfig | null;

  // Note: dryRun in workflow is a summary for state tracking.
  // Full DryRunStats with percentiles, distribution, diagnosis is stored on Dataset.dryRunStats
  dryRun: {
    mean: number;
    std: number;
    percentAboveZero: number;
    percentPerfect: number;
    verdict: 'GO' | 'NO-GO' | 'WARNING';
    sampleResults: DryRunSample[];
    recommendations: string[];
  } | null;

  training: {
    jobId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    metrics: TrainingMetrics | null;
    modelId: string | null;
  } | null;

  deployment: {
    deployedAt: number;
    modelId: string;
    endpoint: string;
  } | null;

  createdAt: number;
  updatedAt: number;
}

type FinetuneStep =
  | 'not_started'
  | 'topics_config'
  | 'categorize'
  | 'coverage_generation'    // Combined: analyze coverage + generate data
  | 'grader_config'
  | 'dry_run'
  | 'training'
  | 'deployment'
  | 'completed';

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

type GenerationStrategy =
  | 'message_variation'      // Vary last user message (recommended for multi-turn)
  | 'few_shot'               // Generate similar from examples
  | 'topic_description'      // Generate from topic description
  | 'scenario_expansion'     // Expand specific scenarios
  | 'tool_chain';            // Generate tool usage patterns

type GenerationMode =
  | 'rft'                    // RFT: Varied prompts with empty output (default)
  | 'sft';                   // SFT: Complete conversations with assistant responses
```

### Input Format

```typescript
interface FinetuneInput {
  // Records to train on (required)
  records: DatasetRecord[];

  // Training goals (required)
  trainingGoals: string;

  // Optional: existing dataset ID to continue from
  existingDatasetId?: string;

  // Optional: name for the dataset
  datasetName?: string;
}
```

### Dataset-Level Stats (For UI Visualization)

Some stats are stored directly on the `Dataset` entity (not just workflow) so they can be displayed in the UI consistently:

```typescript
// On Dataset entity (dataset-types.ts)
interface Dataset {
  // ... other fields ...

  // Coverage stats - calculated by analyze_coverage, displayed in UI
  coverageStats?: CoverageStats;

  // Dry run stats - calculated by run_dry_run, displayed in UI
  dryRunStats?: DryRunStats;

  // Backend dataset ID - set after upload_dataset
  backendDatasetId?: string;
}

interface CoverageStats {
  balanceScore: number;
  balanceRating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  topicDistribution: Record<string, number>;
  uncategorizedCount: number;
  totalRecords: number;
  lastCalculatedAt: number;
}

interface DryRunStats {
  evaluationRunId: string;
  lastRunAt: number;
  samplesEvaluated: number;
  samplePercentage: number;
  statistics: {
    mean: number;
    std: number;
    median: number;
    min: number;
    max: number;
    percentiles: { p10, p25, p50, p75, p90 };
    percentAboveZero: number;
    percentPerfect: number;
  };
  distribution: ScoreDistribution;
  byTopic: Record<string, TopicDryRunStats>;
  diagnosis: DryRunDiagnosis;
  sampleResults: { highest, lowest, aroundMean };
}
```

This ensures:
1. **Consistency** - Lucy agent and UI components read from the same source
2. **Persistence** - Stats survive across sessions without workflow context
3. **Decoupling** - UI can display stats without needing workflow state

---

## Workflow State Persistence (IndexedDB)

The `FinetuneWorkflowState` must be persisted in IndexedDB so Lucy can:
1. **Resume workflows** across page reloads or sessions
2. **Access context** at any time without needing it passed in messages
3. **Track multiple workflows** for the same user
4. **Show workflow history** and allow resumption

### IndexedDB Schema

```typescript
// Database: vllora-finetune
// Version: 1

// Object Stores:

// 1. workflows - Main workflow state
interface WorkflowStore {
  id: string;                    // Primary key
  state: FinetuneWorkflowState;
  createdAt: number;
  updatedAt: number;
}
// Indexes: datasetId, currentStep, createdAt

// 2. workflow_snapshots - Checkpoint history for rollback
interface WorkflowSnapshotStore {
  id: string;                    // Auto-generated
  workflowId: string;            // Foreign key to workflows
  step: FinetuneStep;            // Step at snapshot time
  state: FinetuneWorkflowState;  // Full state snapshot
  createdAt: number;
}
// Indexes: workflowId, step

// 3. generation_history - Track all generation runs
interface GenerationHistoryStore {
  id: string;                    // Auto-generated
  workflowId: string;            // Foreign key
  strategy: GenerationStrategy;
  topicsTargeted: string[];
  recordsGenerated: number;
  recordsValid: number;
  balanceScoreBefore: number;
  balanceScoreAfter: number;
  createdAt: number;
}
// Indexes: workflowId
```

### Persistence Service

```typescript
// services/finetune-workflow-db.ts

import Dexie, { type Table } from 'dexie';

class FinetuneWorkflowDB extends Dexie {
  workflows!: Table<WorkflowStore>;
  snapshots!: Table<WorkflowSnapshotStore>;
  generationHistory!: Table<GenerationHistoryStore>;

  constructor() {
    super('vllora-finetune');
    this.version(1).stores({
      workflows: 'id, datasetId, currentStep, createdAt, updatedAt',
      snapshots: '++id, workflowId, step, createdAt',
      generationHistory: '++id, workflowId, createdAt',
    });
  }
}

export const finetuneDB = new FinetuneWorkflowDB();

// API
export const finetuneWorkflowService = {
  // Create new workflow
  async createWorkflow(state: FinetuneWorkflowState): Promise<string> {
    const now = Date.now();
    await finetuneDB.workflows.add({
      id: state.id,
      state,
      createdAt: now,
      updatedAt: now,
    });
    return state.id;
  },

  // Get workflow by ID
  async getWorkflow(id: string): Promise<FinetuneWorkflowState | null> {
    const record = await finetuneDB.workflows.get(id);
    return record?.state ?? null;
  },

  // Get active workflow for a dataset
  async getWorkflowByDataset(datasetId: string): Promise<FinetuneWorkflowState | null> {
    const record = await finetuneDB.workflows
      .where('datasetId')
      .equals(datasetId)
      .first();
    return record?.state ?? null;
  },

  // Get all workflows (for history/list)
  async getAllWorkflows(): Promise<FinetuneWorkflowState[]> {
    const records = await finetuneDB.workflows
      .orderBy('updatedAt')
      .reverse()
      .toArray();
    return records.map(r => r.state);
  },

  // Update workflow state
  async updateWorkflow(state: FinetuneWorkflowState): Promise<void> {
    await finetuneDB.workflows.update(state.id, {
      state,
      updatedAt: Date.now(),
    });
  },

  // Create checkpoint snapshot
  async createSnapshot(workflowId: string, state: FinetuneWorkflowState): Promise<void> {
    await finetuneDB.snapshots.add({
      id: `${workflowId}-${state.currentStep}-${Date.now()}`,
      workflowId,
      step: state.currentStep,
      state,
      createdAt: Date.now(),
    });
  },

  // Get snapshots for rollback
  async getSnapshots(workflowId: string): Promise<WorkflowSnapshotStore[]> {
    return finetuneDB.snapshots
      .where('workflowId')
      .equals(workflowId)
      .toArray();
  },

  // Rollback to snapshot
  async rollbackToSnapshot(snapshotId: string): Promise<FinetuneWorkflowState | null> {
    const snapshot = await finetuneDB.snapshots.get(snapshotId);
    if (!snapshot) return null;

    await this.updateWorkflow(snapshot.state);
    return snapshot.state;
  },

  // Record generation run
  async recordGeneration(
    workflowId: string,
    data: Omit<GenerationHistoryStore, 'id' | 'workflowId' | 'createdAt'>
  ): Promise<void> {
    await finetuneDB.generationHistory.add({
      id: `${workflowId}-gen-${Date.now()}`,
      workflowId,
      ...data,
      createdAt: Date.now(),
    });
  },

  // Delete workflow
  async deleteWorkflow(id: string): Promise<void> {
    await finetuneDB.workflows.delete(id);
    await finetuneDB.snapshots.where('workflowId').equals(id).delete();
    await finetuneDB.generationHistory.where('workflowId').equals(id).delete();
  },
};
```

### Context Integration with Lucy

Lucy can access workflow state through two mechanisms:

#### 1. Automatic Context Injection

When sending messages to Lucy, the current workflow state is automatically attached:

```typescript
// In LucyDatasetAssistant or useFineTuneAgentChat

const handleBeforeSendMessage = async (message: DistriMessage): Promise<DistriMessage> => {
  // Get current workflow state from IndexedDB
  const activeWorkflow = await finetuneWorkflowService.getWorkflowByDataset(currentDatasetId);

  const ctx = {
    page: "datasets",
    current_dataset_id: currentDatasetId,
    // Finetune workflow context
    finetune_workflow: activeWorkflow ? {
      workflow_id: activeWorkflow.id,
      current_step: activeWorkflow.currentStep,
      step_status: activeWorkflow.stepStatus,
      coverage: activeWorkflow.coverageGeneration?.balanceScore,
      has_grader: !!activeWorkflow.graderConfig,
      dry_run_verdict: activeWorkflow.dryRun?.verdict,
      training_status: activeWorkflow.training?.status,
    } : null,
  };

  const contextText = `Context:\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``;
  return { ...message, parts: [{ part_type: 'text', data: contextText }, ...message.parts] };
};
```

#### 2. Tool-Based Access

Tools can directly read/write workflow state:

```typescript
// In finetune tools

export const getWorkflowStatusHandler: ToolHandler = async ({ workflow_id }) => {
  const state = await finetuneWorkflowService.getWorkflow(workflow_id);
  if (!state) {
    return { success: false, error: 'Workflow not found' };
  }
  return { success: true, workflow: state };
};

export const updateWorkflowStepHandler: ToolHandler = async ({ workflow_id, step, data }) => {
  const state = await finetuneWorkflowService.getWorkflow(workflow_id);
  if (!state) {
    return { success: false, error: 'Workflow not found' };
  }

  // Create snapshot before update
  await finetuneWorkflowService.createSnapshot(workflow_id, state);

  // Update state
  const updatedState = {
    ...state,
    currentStep: step,
    ...data,
    updatedAt: Date.now(),
  };

  await finetuneWorkflowService.updateWorkflow(updatedState);
  return { success: true, workflow: updatedState };
};
```

### Workflow Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        IndexedDB                                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ workflows                                                │   │
│  │  ├─ wf_001: { currentStep: "coverage_generation", ... } │   │
│  │  └─ wf_002: { currentStep: "training", ... }            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ snapshots (for rollback)                                 │   │
│  │  ├─ wf_001-topics_config-1234567890                     │   │
│  │  ├─ wf_001-categorize-1234567891                        │   │
│  │  └─ wf_001-coverage_generation-1234567892               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ generationHistory (for tracking)                         │   │
│  │  ├─ wf_001-gen-1234567893: { strategy: "message_var" }  │   │
│  │  └─ wf_001-gen-1234567894: { strategy: "few_shot" }     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Read/Write
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                        Lucy Agent                                │
│                                                                  │
│  • Reads workflow state on every message (via context)          │
│  • Updates state through tools                                   │
│  • Can list all workflows for user                              │
│  • Can resume any workflow at any step                          │
│  • Can rollback to previous snapshots                           │
└─────────────────────────────────────────────────────────────────┘
```

### Benefits of Persistence

1. **Session Continuity**: User can close browser, come back, and Lucy knows exactly where they left off
2. **Multi-Workflow Support**: User can have multiple finetune workflows in progress
3. **Rollback Capability**: If something goes wrong, can rollback to any previous step
4. **History Tracking**: Track all generation rounds for debugging/analysis
5. **Cross-Component Access**: Any UI component can read workflow state (not just Lucy)
6. **Offline Support**: IndexedDB works offline, state is always available

---

## Agent Definition

### vllora-finetune-agent.md

```markdown
---
name = "vllora_finetune_agent"
description = "Process-focused agent that guides users through the RFT fine-tuning workflow"
max_iterations = 20
tool_format = "provider"

[tools]
builtin = ["final"]
external = [
  # Workflow control
  "start_finetune_workflow",
  "get_workflow_status",
  "advance_to_step",
  "rollback_to_step",

  # Step execution
  "validate_records",
  "generate_topics",
  "apply_topic_hierarchy",
  "categorize_records",
  "analyze_coverage",
  "generate_synthetic_data",
  "configure_grader",
  "test_grader_sample",
  "upload_dataset",
  "sync_evaluator",
  "run_dry_run",
  "start_training",
  "check_training_status",
  "deploy_model",

  # Data access
  "get_dataset_records",
  "get_dataset_stats",
  "update_record"
]

[model_settings]
model = "gpt-4.1"
temperature = 0.2
---

# ROLE

You are a Finetune Assistant that guides users through the complete RFT (Reinforcement Fine-Tuning) workflow. Your goal is to help users create high-quality fine-tuned models from their data.

# WORKFLOW OVERVIEW

The finetune process has 7 main steps (input is records + training goals):

1. **Topics Configuration** - Define topic hierarchy (auto-generate, template, or manual) **(OPTIONAL)**
2. **Categorization** - Assign records to topics with confidence scoring **(OPTIONAL)**
3. **Coverage & Generation** - Analyze balance, generate synthetic data to fill gaps **(OPTIONAL)**
4. **Grader Configuration** - Set up evaluation function (LLM-as-Judge or Script) **(REQUIRED)**
5. **Dry Run** - Validate dataset + grader quality (GO/NO-GO decision) **(OPTIONAL but RECOMMENDED)**
6. **Training** - Execute RFT training **(REQUIRED)**
7. **Deployment** - Deploy the fine-tuned model **(OPTIONAL)**

**Key Insight**: The ONLY hard requirements for training are:
1. Having **records** (existing data in the dataset)
2. Having the **evaluation function configured** (grader_config)

All other steps (topics, categorization, coverage, dry run) are optional quality improvements. Users can skip directly to grader_config and training for a quick end-to-end experience.

**Quick Path (Minimum Viable):**
```
not_started → grader_config → training → completed
```

**Full Path (Best Quality):**
```
not_started → topics_config → categorize → coverage_generation → grader_config → dry_run → training → deployment → completed
```

**Flexible Skipping:**
- From `not_started` → can skip directly to `grader_config` (skip Steps 1-3)
- From `grader_config` → can skip directly to `training` (bypass dry run)
- The result quality depends on preparation - skipping steps trades quality for speed

**GENERATE_DATA Purpose**: When used, it improves COVERAGE by:
- Balancing under-represented topics
- Augmenting small datasets
- Adding missing edge cases
- Filling tool usage patterns

# INTERACTION STYLE

1. **Be Proactive**: Guide users through each step, explaining what's happening and why
2. **Explain Decisions**: When auto-executing steps, explain what you're doing
3. **Request Confirmation**: For critical decisions (grader config, training start), always confirm
4. **Show Progress**: Regularly update users on workflow status
5. **Handle Failures**: When something fails, explain why and suggest fixes

# STEP GUIDANCE

## Input: Records + Training Goals
- When user provides records + training goals, call `start_finetune_workflow`
- Records are validated automatically
- If invalid records found, explain issues and ask if user wants to proceed with valid ones
- **Quick Path Option**: If user wants to train quickly, use `start_step: "grader_config"` to skip directly to grader configuration

## Step 1: Topics Configuration (OPTIONAL)
- **This step is optional** - users can skip directly to grader_config
- Offer three options: auto-generate, use template, or manual
- Default to auto-generate if user doesn't specify
- Show generated hierarchy for user approval
- **Skip option**: Inform user they can proceed without topics if they want a quick training run

## Step 2: Categorization (OPTIONAL)
- **This step is optional** - requires Step 1, both can be skipped
- Run categorization automatically after topics are approved
- Report results: how many assigned, confidence levels
- Flag low-confidence records for review
- **Skip option**: If Step 1 was skipped, this step is also skipped

## Step 3: Coverage & Generation (OPTIONAL)
- **This step is optional** - users can skip directly to grader_config if satisfied with their data
- Analyze topic distribution automatically
- Calculate balance score (0.0-1.0)
- If balance < 0.5, recommend generating synthetic data (but don't require it)
- **Generation Goal**: Improve coverage by filling gaps in under-represented topics
- Support multiple generation strategies:
  - **Message Variation** (recommended for multi-turn): Vary last user message
  - **Few-Shot**: Generate similar from examples
  - **Topic Description**: Generate from topic description
  - **Scenario Expansion**: Expand specific scenarios
  - **Tool Chain**: Generate tool usage patterns
- Can repeat generation multiple times until coverage is satisfactory
- Target: Balance score > 0.5, all topics have min 100 samples
- **Skip option**: If user wants to proceed without coverage analysis, advance directly to grader_config

## Step 4: Grader Configuration
- This step REQUIRES user input - don't auto-generate
- Ask user to describe how outputs should be evaluated
- Offer LLM-as-Judge or Script options
- Help construct the grader configuration
- Test on sample before proceeding

## Step 5: Dry Run (OPTIONAL but RECOMMENDED)
- **This step is optional** but strongly recommended - users can skip directly to training
- Before dry run, upload dataset to backend: call `upload_dataset`
- If grader is updated after upload, use `sync_evaluator` instead of re-uploading
- Explain metrics: mean, std, percentiles, distribution, per-topic breakdown
- Make GO/NO-GO/WARNING recommendation with diagnosis
- If NO-GO, diagnose issues AND always offer two options:
  - **Option A (Recommended)**: Fix the issues (add data, adjust grader, etc.)
  - **Option B (Bypass)**: Rollback to grader_config and skip directly to training
- **Skip option**: If user is confident and wants to skip dry run, advance directly to training

## Step 6: Training
- Confirm training parameters with user
- Start training and monitor progress
- Report metrics as training progresses

## Step 7: Deployment
- Show final results
- Ask for deployment confirmation
- Deploy and provide model ID

# RULES

1. **Only grader config + training are required** - Steps 1-3 (topics, categorize, coverage) are all optional. Users can skip directly to grader_config if they want a quick training run.
2. **Support quick path** - If user wants to see end-to-end flow quickly, guide them directly to grader_config → training. Warn that results may not be optimal without preparation steps.
3. **Recommend dry run** - Dry run is optional but strongly recommended. If skipped and training fails, suggest going back
4. **NO-GO is not a dead end** - If dry run returns NO-GO, always offer two options: fix the issues OR bypass by rolling back and skipping dry run
5. **Confirm destructive actions** - Training costs money, confirm first
6. **Track state** - Use workflow status to know where we are
7. **Be helpful** - If user is stuck, suggest next actions
8. **Explain metrics** - Users may not understand dry run metrics, explain them
9. **Quality vs Speed tradeoff** - Make it clear that skipping optional steps saves time but may reduce training quality
```

---

## Tools Specification

### Workflow Control Tools

#### `start_finetune_workflow`
```typescript
{
  name: "start_finetune_workflow",
  description: "Initialize a new finetune workflow with records and training goals. Validates records automatically.",
  parameters: {
    type: "object",
    properties: {
      records: {
        type: "array",
        description: "Dataset records to train on (DatasetRecord format)",
        items: { type: "object" }
      },
      training_goals: {
        type: "string",
        description: "User's description of desired model behaviors"
      },
      dataset_name: {
        type: "string",
        description: "Optional name for the dataset"
      },
      start_step: {
        type: "string",
        enum: ["topics_config", "grader_config"],
        default: "topics_config",
        description: "Which step to start at. Use 'grader_config' for quick path (skip topics/categorize/coverage steps)"
      }
    },
    required: ["records", "training_goals"]
  }
}
// Returns: { workflow_id, current_step, validation: { valid_count, invalid_count, errors } }
```

#### `get_workflow_status`
```typescript
{
  name: "get_workflow_status",
  description: "Get current workflow state including step progress, coverage stats, and results",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" }
    },
    required: ["workflow_id"]
  }
}
// Returns: Full FinetuneWorkflowState
```

#### `advance_to_step`
```typescript
{
  name: "advance_to_step",
  description: "Move the workflow to the next step. Supports skipping optional steps for quick path workflow.",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      step: {
        type: "string",
        enum: ["topics_config", "categorize", "coverage_generation", "grader_config", "dry_run", "training", "deployment"]
      }
    },
    required: ["workflow_id", "step"]
  }
}
// Valid transitions:
// - Normal flow: advance one step at a time
// - Quick path: not_started → grader_config (skip topics, categorize, coverage steps)
// - Skip to grader_config: from topics_config or categorize (skip coverage analysis)
// - Skip to training: from grader_config (skip dry run validation)
```

### Step 1: Topics Configuration Tools

#### `generate_topics`
```typescript
{
  name: "generate_topics",
  description: "Auto-generate topic hierarchy from record content",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      method: {
        type: "string",
        enum: ["auto", "template", "manual"],
        default: "auto"
      },
      max_depth: { type: "number", default: 3 },
      template_name: { type: "string" }
    },
    required: ["workflow_id"]
  }
}
```

#### `apply_topic_hierarchy`
```typescript
{
  name: "apply_topic_hierarchy",
  description: "Apply a user-provided or edited topic hierarchy",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      hierarchy: {
        type: "array",
        items: { type: "object" },
        description: "TopicHierarchyNode[] structure"
      }
    },
    required: ["workflow_id", "hierarchy"]
  }
}
```

### Step 2: Categorization Tools

#### `categorize_records`
```typescript
{
  name: "categorize_records",
  description: "Assign records to topics using hybrid categorization (keyword + embedding + LLM)",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      confidence_threshold: { type: "number", default: 0.7 }
    },
    required: ["workflow_id"]
  }
}
// Returns: { assigned_count, low_confidence_count, by_topic: { topic: count } }
```

### Step 3: Coverage & Generation Tools

#### `analyze_coverage`
```typescript
{
  name: "analyze_coverage",
  description: "Analyze topic distribution and calculate balance score",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" }
    },
    required: ["workflow_id"]
  }
}
// Returns: { balance_score, distribution: { topic: { count, percentage, status } }, recommendations }
```

#### `generate_data`
```typescript
{
  name: "generate_data",
  description: "Generate synthetic records to improve coverage. Supports two workflows: (1) Topics-First: generate for under-represented topics in hierarchy, (2) Data-First: generate variations from seed records without requiring hierarchy.",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      strategy: {
        type: "string",
        enum: ["message_variation", "few_shot", "topic_description", "scenario_expansion", "tool_chain"],
        default: "message_variation",
        description: "Generation strategy. message_variation recommended for multi-turn records."
      },
      generation_mode: {
        type: "string",
        enum: ["rft", "sft"],
        default: "rft",
        description: "Generation mode. RFT: varied prompts with empty output for rollouts. SFT: complete conversations with assistant responses."
      },
      target_topics: {
        type: "array",
        items: { type: "string" },
        description: "Topics to generate data for. Empty = auto-detect underrepresented topics."
      },
      count_per_topic: {
        type: "number",
        default: 50,
        description: "Number of records to generate per topic"
      },
      record_ids: {
        type: "array",
        items: { type: "string" },
        description: "Specific record IDs to use as seed records. When provided, enables Data-First workflow - generates variations from these records without requiring topic hierarchy."
      },
      variations_per_record: {
        type: "number",
        default: 3,
        description: "For message_variation strategy: how many variations per source record"
      }
    },
    required: ["workflow_id"]
  }
}
// Returns: { generated_count, valid_count, rejected_count, by_topic: { topic: stats }, new_balance_score }
```

#### `get_coverage_recommendations`
```typescript
{
  name: "get_coverage_recommendations",
  description: "Get AI-powered recommendations for improving coverage",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" }
    },
    required: ["workflow_id"]
  }
}
// Returns: { recommendations: [{ topic, action, reason, suggested_count }], suggested_strategy }
```

### Step 4: Grader Configuration Tools

#### `configure_grader`
```typescript
{
  name: "configure_grader",
  description: "Configure the evaluation/grader function for RFT",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      grader_type: {
        type: "string",
        enum: ["llm_as_judge", "script"]
      },
      config: {
        type: "object",
        description: "For llm_as_judge: { prompt_template, output_schema, model, temperature }. For script: { script_code }"
      }
    },
    required: ["workflow_id", "grader_type", "config"]
  }
}
```

#### `test_grader`
```typescript
{
  name: "test_grader",
  description: "Test the grader on a sample of records before committing",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      sample_size: { type: "number", default: 5 }
    },
    required: ["workflow_id"]
  }
}
// Returns: { samples: [{ prompt, response, score, reasoning }] }
```

### Upload Tools (Before Dry Run)

#### `upload_dataset`
```typescript
{
  name: "upload_dataset",
  description: "Upload dataset to backend for evaluation and training. Must be called before dry run.",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      force_reupload: { type: "boolean", default: false }
    },
    required: ["workflow_id"]
  }
}
// Returns: { backend_dataset_id, record_count, has_evaluator, has_topic_hierarchy }
```

#### `sync_evaluator`
```typescript
{
  name: "sync_evaluator",
  description: "Sync evaluator config to backend without re-uploading entire dataset. Use after updating grader.",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" }
    },
    required: ["workflow_id"]
  }
}
// Returns: { backend_dataset_id, evaluator_type }
```

### Step 5: Dry Run Tools

#### `run_dry_run`
```typescript
{
  name: "run_dry_run",
  description: "Execute dry run validation to test dataset + grader quality. Critical step before training! Dataset must be uploaded first.",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      sample_percentage: { type: "number", default: 10, description: "Percentage of records to test (1-100)" }
    },
    required: ["workflow_id"]
  }
}
// Returns comprehensive diagnostics:
// {
//   evaluation_run_id, sample_size, sample_percentage,
//   // Core statistics
//   mean, std, median, min, max,
//   // Percentiles
//   percentiles: { p10, p25, p50, p75, p90 },
//   // Score fractions
//   percent_above_zero, percent_perfect,
//   // Distribution buckets
//   distribution: { '0.0-0.2': %, '0.2-0.4': %, ... },
//   // Diagnosis
//   verdict: 'GO'|'NO-GO'|'WARNING',
//   dataset_quality: 'good'|'warning'|'problem',
//   grader_quality: 'good'|'warning'|'problem',
//   warnings: [...], recommendations: [...], issues: [...],
//   // Per-topic breakdown
//   by_topic: { topic: { mean, std, count, status } },
//   ready_for_training: boolean
// }
```

### Step 6: Training Tools

#### `start_training`
```typescript
{
  name: "start_training",
  description: "Start RFT training job",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      train_split: { type: "number", default: 0.9 },
      epochs: { type: "number", default: 2 },
      reasoning_effort: {
        type: "string",
        enum: ["low", "medium", "high"],
        default: "medium"
      }
    },
    required: ["workflow_id"]
  }
}
```

#### `check_training_status`
```typescript
{
  name: "check_training_status",
  description: "Check the status of a running training job",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" }
    },
    required: ["workflow_id"]
  }
}
// Returns: { status, progress, current_epoch, metrics: { train_reward, valid_reward, loss } }
```

### Step 7: Deployment Tools

#### `deploy_model`
```typescript
{
  name: "deploy_model",
  description: "Deploy the fine-tuned model",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string" },
      deployment_mode: {
        type: "string",
        enum: ["replace_gateway", "new_endpoint", "ab_test"],
        default: "new_endpoint"
      }
    },
    required: ["workflow_id"]
  }
}
// Returns: { model_id, endpoint, deployed_at }
```

---

## Conversation Flow Examples

### Key Principle: Proactive Analysis

When Lucy opens on a dataset with no active finetune workflow, she should:
1. **Auto-check** the data and training goals
2. **Provide insights** about the current dataset
3. **Suggest topics** based on content analysis
4. **Start the conversation** by proposing the first step

This creates a guided, conversational experience rather than waiting for commands.

---

### Example 1: First Time Opening Dataset (No Workflow Yet)

```
[User opens dataset "Customer Support Data" with 500 records and training goal:
"Train a model that responds helpfully and follows our brand voice"]

AGENT: [Auto-detects no active finetune workflow for this dataset]
       [Calls get_workflow_status - returns null]
       [Calls analyze dataset records and training goals]

       👋 I see you have a dataset ready for fine-tuning!

       **Dataset Overview:**
       - **Name:** Customer Support Data
       - **Records:** 500 total
       - **Training Goal:** "Train a model that responds helpfully and follows our brand voice"

       **Quick Analysis:**
       I've scanned your records and found some interesting patterns:
       - 📧 ~45% appear to be billing/payment related
       - 🔧 ~35% are technical support questions
       - 💬 ~20% are general inquiries

       Most records are multi-turn conversations (avg 4 messages), which is
       great for training contextual understanding.

       **Suggested Topic Hierarchy:**
       Based on your data and training goal, I recommend organizing into:

       ```
       Customer Support
       ├── Billing & Payments
       │   ├── Refund Requests
       │   ├── Payment Issues
       │   └── Subscription Changes
       ├── Technical Support
       │   ├── Account Access
       │   ├── Feature Help
       │   └── Bug Reports
       └── General Inquiries
           ├── Product Questions
           └── Feedback
       ```

       Does this structure make sense for your use case? I can:
       - ✅ Use this hierarchy as-is
       - ✏️ Modify specific topics
       - 🔄 Generate a different structure
       - 📝 Let you define it manually

USER: Looks good, but can you add a "Complaints" category under General?

AGENT: Good idea! Complaints are important to handle well.

       **Updated Hierarchy:**
       ```
       Customer Support
       ├── Billing & Payments
       │   ├── Refund Requests
       │   ├── Payment Issues
       │   └── Subscription Changes
       ├── Technical Support
       │   ├── Account Access
       │   ├── Feature Help
       │   └── Bug Reports
       └── General Inquiries
           ├── Product Questions
           ├── Feedback
           └── Complaints ← NEW
       ```

       Should I start categorizing your records with this structure?

USER: Yes, let's do it

AGENT: [Calls start_finetune_workflow with records + goals]
       [Calls apply_topic_hierarchy]
       [Calls categorize_records]

       **Workflow Started!** 🚀

       I've categorized all 487 valid records (13 had issues - missing user messages):

       **Categorization Results:**
       | Topic | Count | Confidence |
       |-------|-------|------------|
       | Billing & Payments | 145 | 92% avg |
       | Technical Support | 198 | 88% avg |
       | General Inquiries | 131 | 85% avg |
       | Complaints | 13 | 78% avg |

       - ✅ High confidence (>0.7): 423 records
       - ⚠️ Low confidence (review suggested): 64 records

       [Calls analyze_coverage]

       **Coverage Analysis:**
       Your dataset is well-balanced! Balance Score: **0.68** ✅

       The only slight concern is "Complaints" has only 13 records (3%).
       Would you like me to generate some synthetic complaint scenarios to
       ensure the model handles them well?

USER: Sure, generate maybe 30 more complaint examples

AGENT: [Calls generate_data targeting "Complaints"]

       **Generation Complete:**
       - Generated: 30 complaint scenarios
       - Valid: 27 (3 rejected as too similar)
       - Strategy: message_variation (kept context from real complaints)

       **Updated Coverage:**
       - Complaints: 13 → 40 records (8%)
       - Balance Score: 0.68 → 0.72 ✅

       Great! Your dataset is ready for the next step.

       **Next: Grader Configuration**

       For a customer support model focused on "helpful responses" and "brand voice",
       I'd suggest evaluating on:

       1. **Helpfulness** (40%) - Does it address the customer's actual issue?
       2. **Accuracy** (25%) - Is the information correct?
       3. **Brand Voice** (20%) - Professional, friendly, on-brand tone?
       4. **Resolution** (15%) - Does it move toward solving the problem?

       Should I set up an LLM-as-Judge grader with these criteria?
       Or do you have specific evaluation rules in mind?

USER: Add something about not making promises we can't keep - like delivery times

AGENT: Smart addition! Over-promising is a common issue in support responses.

       **Updated Evaluation Criteria:**
       1. **Helpfulness** (35%) - Addresses the customer's issue
       2. **Accuracy** (25%) - Information is correct
       3. **Brand Voice** (15%) - Professional and friendly tone
       4. **Resolution** (15%) - Moves toward problem resolution
       5. **No Over-promising** (10%) - Avoids unrealistic commitments
          *(e.g., specific delivery dates, guaranteed outcomes)*

       [Calls configure_grader]
       [Calls test_grader]

       Let me test this on 5 sample records...

       **Test Results:**
       | Sample | Score | Notes |
       |--------|-------|-------|
       | #1 | 0.82 | Good helpful response |
       | #2 | 0.91 | Excellent - clear and accurate |
       | #3 | 0.45 | ⚠️ Promised "delivery by Friday" |
       | #4 | 0.78 | Good, slightly formal tone |
       | #5 | 0.67 | Could be more solution-focused |

       The grader caught the over-promising in Sample #3! Looks like it's
       working well. Ready to run the dry run validation?

USER: Yes

AGENT: [Calls run_dry_run with sample_size=200]

       **Dry Run Results:**

       | Metric | Value | Healthy Range | Status |
       |--------|-------|---------------|--------|
       | Mean   | 0.52  | 0.25-0.65     | ✅ Good |
       | Std    | 0.19  | 0.10-0.25     | ✅ Good |
       | %>0    | 94%   | >10-20%       | ✅ Good |
       | %=1.0  | 8%    | <30-50%       | ✅ Good |

       **Verdict: GO** ✅

       Your dataset and grader look great! The base model can solve some
       tasks but has room to improve - perfect for RFT training.

       **Ready to Train?**
       - Records: 514 (487 original + 27 generated)
       - Train/Valid split: 90/10 (463 train, 51 valid)
       - Estimated improvement: 15-30% based on dry run metrics

       Should I start training?

USER: Let's do it!

AGENT: [Calls start_training]

       **Training Started!** 🎯

       Job ID: `ft-cs-2024-abc123`

       I'll keep you updated on progress...

       [Monitors training...]

       **Epoch 1/2:** Train reward 0.58, Valid reward 0.54
       **Epoch 2/2:** Train reward 0.71, Valid reward 0.67

       **Training Complete!** 🎉

       **Results:**
       | Metric | Before | After | Change |
       |--------|--------|-------|--------|
       | Valid Reward | 0.52 | 0.67 | +29% |
       | Helpfulness | 0.48 | 0.72 | +50% |
       | No Over-promise | 0.61 | 0.79 | +30% |

       Your model improved significantly, especially in helpfulness!

       **Model ID:** `ft-model-cs-xyz789`

       Would you like to deploy this model to your gateway?
```

---

### Example 2: Resuming an Existing Workflow

```
[User opens dataset with existing workflow at "coverage_generation" step]

AGENT: [Calls get_workflow_status - finds existing workflow]

       👋 Welcome back! I see you have a finetune workflow in progress.

       **Workflow Status:**
       - **Current Step:** Coverage & Generation (Step 3 of 7)
       - **Last Activity:** 2 hours ago

       **Where We Left Off:**
       - Topics: ✅ Configured (5 topics)
       - Categorization: ✅ Done (295 records assigned)
       - Coverage: ⚠️ Balance score 0.38 (needs improvement)

       Last time we discussed generating synthetic data for the
       under-represented "Edge Cases" topic (only 12 records).

       Should I continue with generation, or would you like to review
       the current state first?

USER: Let's generate more for edge cases

AGENT: [Calls generate_data targeting "Edge Cases"]

       **Generated 45 records for "Edge Cases":**
       - Valid: 41
       - Strategy: scenario_expansion (created diverse edge case scenarios)

       **New Coverage:**
       - Edge Cases: 12 → 53 records
       - Balance Score: 0.38 → 0.56 ✅

       Coverage looks good now! Ready to configure the grader?
```

---

### Example 3: Imbalanced Dataset with Iterative Refinement

```
[User opens "Financial Assistant" dataset - 300 records, goal: "accurate calculations"]

AGENT: [Auto-analyzes dataset]

       👋 Let me take a look at your Financial Assistant dataset...

       **Dataset Analysis:**
       - **Records:** 300 total (295 valid)
       - **Goal:** "Accurate calculations and clear explanations"

       **Content Breakdown:**
       I noticed something important - your data is quite imbalanced:
       - 💰 Transfers: 180 records (61%) ← Dominant!
       - 🔢 Calculations: 23 records (8%) ← Very low!
       - 📊 Account Inquiries: 45 records (15%)
       - ❓ General: 47 records (16%)

       **Concern:** Your training goal emphasizes "accurate calculations",
       but only 8% of your data covers calculation scenarios. The model
       might not learn this skill well.

       **Suggested Topic Hierarchy:**
       ```
       Financial Assistant
       ├── Calculations
       │   ├── Interest & Loans
       │   ├── Investment Returns
       │   └── Currency Conversion
       ├── Transfers
       │   ├── Domestic
       │   └── International
       ├── Account Inquiries
       │   ├── Balance Checks
       │   └── Transaction History
       └── General Questions
       ```

       I recommend we:
       1. Use this structure
       2. Generate synthetic calculation examples to balance the dataset
       3. Aim for at least 80-100 calculation records

       Does this approach make sense?

USER: Yes, but I'm worried about synthetic data quality. Can you show me examples first?

AGENT: Absolutely! Let me generate a few samples so you can judge the quality.

       [Calls generate_data with count_per_topic=5, target_topics=["Calculations"]]

       **Sample Generated Calculations:**

       **1. Loan Payment:**
       > "I have a $25,000 car loan at 5.9% APR over 48 months.
       > What's my monthly payment and total interest?"

       **2. Investment Growth:**
       > "If I invest $500 monthly at 7% annual return,
       > how much will I have after 15 years?"

       **3. Currency Conversion:**
       > "I need to convert $10,000 to Euros. Current rate is 0.92.
       > What's the amount after a 2% conversion fee?"

       **4. Compound Interest:**
       > "Calculate compound interest on $50,000 at 4.5% compounded
       > quarterly for 3 years."

       **5. Break-even Analysis:**
       > "My mortgage is $350,000 at 6.5%. If I refinance to 5.25%
       > with $8,000 closing costs, when do I break even?"

       These maintain the conversation style from your real data.
       Do they look realistic enough?

USER: Those look great! Generate more like this

AGENT: [Calls generate_data with count_per_topic=75, strategy="few_shot"]

       **Generation Complete:**

       | Sub-topic | Generated | Valid | Pass Rate |
       |-----------|-----------|-------|-----------|
       | Interest & Loans | 25 | 23 | 92% |
       | Investment Returns | 25 | 24 | 96% |
       | Currency Conversion | 25 | 22 | 88% |

       **Updated Distribution:**
       | Topic | Before | After |
       |-------|--------|-------|
       | Calculations | 23 (8%) | 92 (24%) |
       | Transfers | 180 (61%) | 180 (47%) |
       | Account Inquiries | 45 (15%) | 45 (12%) |
       | General | 47 (16%) | 47 (12%) |

       **Balance Score:** 0.13 → 0.51 ✅

       Much better! Your dataset now has substantial coverage of
       calculation scenarios. Ready to configure the grader?

USER: Actually, can we add a few more edge cases? Like really complex calculations

AGENT: Good thinking! Edge cases help the model handle unusual requests.

       Let me generate some complex scenarios:

       [Calls generate_data with strategy="scenario_expansion",
        base_scenario="complex multi-step financial calculations"]

       **Complex Calculation Edge Cases Generated:**

       1. "Calculate the tax-adjusted return on a municipal bond ladder
          with varying maturities and state tax implications"

       2. "I'm comparing a 15-year vs 30-year mortgage with points.
          Factor in opportunity cost of the down payment difference"

       3. "What's the NPV of leasing vs buying equipment over 5 years
          with different depreciation methods?"

       Generated 15 complex scenarios, 13 valid.

       **Final Coverage:**
       - Calculations: 105 records (26%)
       - Balance Score: 0.54 ✅

       Now your model will be exposed to both common and complex
       calculation scenarios. Should we move to grader configuration?
```

---

### Example 4: User Wants to Modify Suggestions

```
[User opens dataset, Lucy suggests topics]

AGENT: **Suggested Topic Hierarchy:**
       ```
       E-commerce Support
       ├── Orders
       ├── Shipping
       ├── Returns
       └── Products
       ```

USER: I don't like this structure. Can we organize by customer intent instead?

AGENT: Great idea! Intent-based organization can be more useful for training.

       Let me re-analyze with that lens...

       [Re-analyzes records focusing on intent patterns]

       **Intent-Based Hierarchy:**
       ```
       Customer Intents
       ├── Informational
       │   ├── Product Questions
       │   ├── Policy Inquiries
       │   └── How-To Guides
       ├── Transactional
       │   ├── Place Order
       │   ├── Modify Order
       │   └── Cancel Order
       ├── Problem Resolution
       │   ├── Delivery Issues
       │   ├── Product Defects
       │   └── Billing Disputes
       └── Relationship
           ├── Feedback
           ├── Complaints
           └── Loyalty Questions
       ```

       This maps better to how customers think. Does this work better?

USER: Yes! But merge "Informational" and "Relationship" - they're similar

AGENT: Makes sense - both are non-urgent interactions.

       **Updated Hierarchy:**
       ```
       Customer Intents
       ├── Information & Engagement
       │   ├── Product Questions
       │   ├── Policy Inquiries
       │   ├── Feedback
       │   └── Loyalty Questions
       ├── Transactional
       │   ├── Place Order
       │   ├── Modify Order
       │   └── Cancel Order
       └── Problem Resolution
           ├── Delivery Issues
           ├── Product Defects
           ├── Billing Disputes
           └── Complaints
       ```

       Simpler and cleaner! Should I proceed with categorization?
```

---

## Implementation Plan

### Phase 1: Foundation (Tools + State)
1. Create `FinetuneWorkflowState` type and storage
2. Implement workflow control tools (`start`, `status`, `advance`)
3. Set up IndexedDB storage for workflow state

### Phase 2: Step Tools
1. Implement `validate_records` tool
2. Implement `generate_topics` tool (reuse existing)
3. Implement `categorize_records` tool (reuse existing)
4. Implement `analyze_coverage` tool
5. Implement `generate_synthetic_data` tool (reuse existing)
6. Implement `configure_grader` tool
7. Implement `run_dry_run` tool
8. Implement `start_training` tool
9. Implement `deploy_model` tool

### Phase 3: Agent Definition
1. Create `vllora-finetune-agent.md`
2. Register agent in `agents.rs`
3. Test agent with sample conversations

### Phase 4: UI Integration
1. Create `useFineTuneAgentChat` hook
2. Update `LucyDatasetAssistant` to use new agent
3. Remove old dataset-specific quick actions
4. Add finetune-focused quick actions

### Phase 5: Testing & Polish
1. End-to-end testing of complete workflow
2. Error handling and edge cases
3. Progress indicators and status updates
4. Documentation updates

---

## File Structure

```
gateway/
└── agents/
    └── finetune/
        └── vllora-finetune-agent.md     # New agent definition

ui/src/
├── lib/
│   └── distri-finetune-tools/           # New tools directory
│       ├── index.ts                      # Tool exports
│       ├── types.ts                      # Type definitions
│       ├── workflow-state.ts             # State management
│       ├── workflow/
│       │   ├── start-workflow.ts
│       │   ├── get-status.ts
│       │   └── advance-step.ts
│       └── steps/
│           ├── validate-records.ts
│           ├── generate-topics.ts
│           ├── categorize-records.ts
│           ├── analyze-coverage.ts
│           ├── generate-synthetic.ts
│           ├── configure-grader.ts
│           ├── run-dry-run.ts
│           ├── start-training.ts
│           └── deploy-model.ts
│
├── hooks/
│   └── useFineTuneAgentChat.ts          # New hook
│
├── components/
│   └── datasets/
│       └── LucyDatasetAssistant.tsx     # Updated to use new agent
│
└── services/
    └── finetune-workflow-db.ts          # Workflow state persistence
```

---

## Migration Strategy

### Backward Compatibility

The old tools will remain available during transition:
1. Keep existing `distri-dataset-tools` for gradual migration
2. New `distri-finetune-tools` runs in parallel
3. Switch agent definition to new one
4. Deprecate old tools once verified

### Data Migration

- No data migration needed - workflows are new entities
- Existing datasets remain compatible
- Old conversation history preserved (different agent ID)

---

## Success Metrics

1. **Workflow Completion Rate**: % of started workflows that complete
2. **Dry Run Pass Rate**: % of dry runs that return GO
3. **Training Success Rate**: % of training jobs that complete
4. **User Interaction Count**: Average messages per workflow (lower = more guided)
5. **Time to Fine-tune**: Average time from start to deployed model
