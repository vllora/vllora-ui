# Guided Onboarding & Planning System

This document covers the general-purpose planning system and the guided onboarding flow that uses it.

## Planning System

### Design Principle

**Tools are dumb, Lucy is smart.** Lucy decides when to propose a plan, constructs the plan herself, and the tool just validates, persists, and shows it to the user. There is no special-casing — initial setup, data augmentation, regrading, retraining all follow the same flow.

### The Flow (Always the Same)

```
assess state → (analyze if needed) → construct plan → propose → approve → execute
```

1. **Assess state**: Lucy calls `get_dataset_state` to see what exists (records, topics, grader, etc.)
2. **Analyze** (optional): If knowledge sources need analysis, Lucy calls `analyze_knowledge_sources` to get topic/grader/schema recommendations
3. **Construct plan**: Lucy builds a `Plan` object based on state + analysis + user intent
4. **Propose**: Lucy calls `propose_plan({ dataset_id, plan })` — tool persists to IndexedDB, emits event, UI shows plan card
5. **Approve**: User reviews plan in UI, clicks "Approve & Execute"
6. **Execute**: Lucy calls `execute_plan` — runs steps sequentially, emits progress

### Plan Lifecycle

```
propose → [UI shows plan card] → approve → validate → execute → complete/fail
                                    ↑           ↓
                               adjust (edit)  toast.error (if invalid)
```

### Step Registry

Each step is a `StepExecutor` with `name`, `execute`, optional `workflowStep`, and optional `nonFatal` flag.

| Step ID | Name | Workflow Step | Non-Fatal |
|---|---|---|---|
| `topics` | Apply Topic Hierarchy | `topics_config` | No |
| `adjust_topics` | Adjust Topics | `topics_config` | No |
| `categorize` | Categorize Records | `categorize` | No |
| `generate` | Generate Data | `coverage_generation` | No |
| `grader` | Configure Evaluator | `grader_config` | No |
| `upload` | Upload Dataset | — | No |
| `dryrun` | Run Dry Run | `dry_run` | Yes |
| `readme` | Generate README | — | Yes |
| `finetune` | Start Finetune Job | — | Yes |

Execution order is fixed: `topics → adjust_topics → categorize → generate → grader → upload → dryrun → readme → finetune`. Steps not in `steps_to_execute` are skipped. Non-fatal steps log errors and continue. Fatal steps abort the pipeline.

To add a new step: define an executor function, add it to `STEP_REGISTRY` and `STEP_ORDER` in `execute-plan.ts`.

### Plan Type

```typescript
interface Plan {
  dataset_id: string;
  dataset_name: string;
  objective: string;
  execution_steps: { step: string; description: string; estimated_time: string }[];
  estimated_duration: string;

  // Plan metadata
  title?: string;
  description?: string;

  // Execution config
  steps_to_execute?: ExecutionStepId[];
  overrides?: {
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };
  adjust_topics_instruction?: string;

  // Domain-specific sections (optional)
  output_format?: OutputFormat | null;
  knowledge_sources?: { name: string; topics_extracted: string[] }[];
  proposed_topics?: ProposedTopic[];
  total_topic_count?: number;
  data_generation?: { strategy: string; grounded_in_knowledge: boolean };
  grader_config?: { criteria: GraderCriterion[]; template_preview: string };
  estimated_records?: number;
}
```

### Execution Types

```typescript
type ExecutionStepId = 'topics' | 'adjust_topics' | 'categorize' | 'generate' | 'grader' | 'upload' | 'dryrun' | 'readme' | 'finetune';

interface StepExecutor {
  name: string;
  workflowStep?: FinetuneStep;
  nonFatal?: boolean;
  execute: (ctx: StepContext) => Promise<StepResult>;
}

interface StepContext {
  dataset_id: string;
  plan: Plan;
  workflow_id: string;
  workflow: FinetuneWorkflowState;
  overrides?: { ... };
  summary: ExecutionSummary;  // Mutable — each step updates its fields
}

interface ExecutionSummary {
  topics_created: number;
  records_generated: number;
  grader_configured: boolean;
  dry_run_completed: boolean;
  dry_run_pass_rate?: number;
  ready_to_finetune: boolean;
  finetune_job_id?: string;
  finetune_job_status?: string;
}
```

### Validation Rules

Before execution starts, the plan is validated by `validatePlanForExecution()` (exported from `execute-plan.ts`). Runs in two places: UI gate (`PlanContext.approvePlan` — shows `toast.error()`) and handler gate (`executePlanHandler` — safety net).

| Step | Prerequisite | Error Message |
|---|---|---|
| _(any)_ | All IDs in `steps_to_execute` exist in `STEP_ORDER` | `Unknown step: '{id}'` |
| `topics` | `plan.proposed_topics` has length > 0 | `Step 'topics' requires proposed_topics in the plan` |
| `adjust_topics` | `overrides.adjust_topics.instruction` or `plan.adjust_topics_instruction` non-empty | `Step 'adjust_topics' requires an instruction` |
| `generate` | `estimated_records > 0` or `overrides.generate.count > 0` or `per_topic_count > 0` | `Step 'generate' requires a record count` |
| `grader` | `plan.grader_config.template_preview` non-empty | `Step 'grader' requires grader_config.template_preview` |
| `categorize`, `upload`, `dryrun`, `readme`, `finetune` | No plan-level prereqs | _(always pass)_ |

### UI Conditional Rendering

The UI renders plan sections based on what's present:

- **Title**: `plan.title` if present, else "Plan"
- **Description**: `plan.description` if present, else "for {dataset_name}"
- **Topics section**: Only if `plan.proposed_topics?.length > 0`
- **Knowledge sources**: Only if `plan.knowledge_sources?.length > 0`
- **Output format**: Only if `plan.output_format` is truthy
- **Data generation**: Only if `plan.data_generation` is truthy
- **Grader config**: Only if `plan.grader_config?.criteria?.length > 0`
- **Summary**: Records count only if `plan.estimated_records` is present

### Planning System Files

| File | Role |
|---|---|
| `src/lib/distri-finetune-tools/steps/analyze-knowledge-sources.ts` | Analyzes knowledge sources via LLM, returns building blocks |
| `src/lib/distri-finetune-tools/steps/propose-plan/types.ts` | Plan type with optional fields |
| `src/lib/distri-finetune-tools/steps/propose-plan/handler.ts` | Validates, persists, emits plan (no LLM) |
| `src/lib/distri-finetune-tools/steps/save-plan.ts` | Persist plan to IndexedDB |
| `src/lib/distri-finetune-tools/steps/execute-plan.ts` | Registry-based orchestrator with STEP_REGISTRY |
| `src/contexts/PlanContext.tsx` | Plan lifecycle state (generating, proposed, executing, completed) |
| `src/components/datasets/PlanPreview.tsx` | Plan workspace tab (reads from PlanContext) |
| `src/components/datasets/plan-section/PlanCard.tsx` | Full plan card with conditional sections |
| `src/components/datasets/plan-section/PlanEditor.tsx` | Markdown-based plan editor |
| `gateway/agents/finetune/vllora-finetune-agent.md` | Agent prompt with plan-first pattern |

---

## Guided Onboarding Flow

### Overview

When a user has an **empty dataset** (0 records) and uploads **knowledge sources** (documents), Lucy automatically triggers a guided onboarding flow that:

1. Analyzes the uploaded documents
2. Proposes a comprehensive plan
3. Presents the plan via a custom UI card for approval
4. Executes all setup steps automatically upon approval

This eliminates the need for users to manually configure topics, data generation, and evaluation criteria.

## Flow Diagram

```
User uploads documents to empty dataset
         │
         ▼
┌─────────────────────────────────────┐
│  LucyDatasetAssistant detects:      │
│  - Empty dataset (0 records)        │
│  - Knowledge sources uploaded       │
│  - Triggers propose_plan      │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  propose_plan tool            │
│  - Fetches dataset objective        │
│  - Extracts topics from documents   │
│  - Calls LLM to generate plan       │
│  - Returns Plan object         │
│  - Emits vllora_plan_proposed │
└─────────────────────────────────────┘
         │
         ├────────────────────────────────────┐
         ▼                                    ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│  Lucy Chat (Left)       │    │  Plan Tab (Right)                   │
│  LucyToolRenderer  │    │  PlanPreview                        │
│  - Shows confirmation   │    │  - Shows loading while generating   │
│    message              │    │  - Displays PlanEditor         │
│  - Points user to right │    │  - Editable markdown format         │
│    panel                │    │  - User modifies plan if needed     │
└─────────────────────────┘    │  - "Approve & Execute" button       │
                               └─────────────────────────────────────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          │                   │                   │
                          ▼ (User requests    │                   ▼ (User clicks
                             changes)         │                      Approve)
               ┌─────────────────────────┐    │
               │  adjust_plan tool  │    │
               │  - Takes user feedback   │    │
               │  - Regenerates plan      │    │
               │  - Emits updated plan    │────┘
               └─────────────────────────┘
                               ┌─────────────────────────────────────┐
                               │  execute_plan tool            │
                               │  - Step 1: Apply topic hierarchy    │
                               │  - Step 2: Generate initial data    │
                               │  - Step 3: Configure evaluator      │
                               │  - Step 4: Upload to backend        │
                               │  - Step 5: Run dry run validation   │
                               │  - Step 6: Generate README          │
                               │  - Step 7: Start finetune job       │
                               │  - Emits progress events            │
                               └─────────────────────────────────────┘
                                              │
                                              ▼
                               ┌─────────────────────────────────────┐
                               │  ExecutionProgressCard              │
                               │  - Shows real-time step progress    │
                               │  - Listens to progress events       │
                               │  - Final: "Ready for fine-tuning!"  │
                               └─────────────────────────────────────┘
```

## Trigger Conditions

### Manual Trigger
The guided onboarding flow can be triggered manually when ALL of the following are true:

1. **Dataset is empty** - No existing training records
2. **Knowledge sources uploaded** - User has added at least one document
3. **Training objective defined** - Dataset has a `datasetObjective` set

If the training objective is not set, Lucy will first help the user define it before proposing a plan.

### Auto-Trigger via `?autoGeneratePlan=true`

When a user clicks "Start Finetune" in the empty dataset state **with files uploaded**, the app navigates to:
```
/datasets/{datasetId}?autoGeneratePlan=true
```

**File:** `src/components/datasets/empty-dataset-state/index.tsx` (line 197)

`DatasetDetailContentV2.tsx` (lines 246-269) detects this query parameter and:
1. Removes the query param immediately (to prevent re-triggering on refresh)
2. Waits 2 seconds for knowledge sources to finish processing
3. Emits a `vllora_lucy_prompt` event asking Lucy to create a plan
4. Lucy calls `propose_plan` automatically

This creates a seamless flow: upload docs → click Start → transition screen → auto-plan generation.

## Tools

### `propose_plan`

Analyzes the dataset and knowledge sources to generate a comprehensive plan.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dataset_id` | string | Yes | - | The dataset ID to generate a plan for |
| `seed_count` | number | No | 30 | Target number of initial training examples |

**Returns:**
```typescript
interface ProposePlanResult {
  success: boolean;
  error?: string;
  plan?: Plan;
  requires_knowledge_sources?: boolean;
  message?: string;
}
```

**Plan Structure:**
```typescript
interface Plan {
  dataset_id: string;
  dataset_name: string;
  objective: string;

  // Knowledge sources analysis
  knowledge_sources: {
    name: string;
    topics_extracted: string[];
  }[];

  // Proposed topic hierarchy
  proposed_topics: ProposedTopic[];
  total_topic_count: number;

  // Data generation plan
  data_generation: {
    seed_count: number;
    strategy: string;
    grounded_in_knowledge: boolean;
  };

  // Grader configuration
  grader_config: {
    criteria: GraderCriterion[];
    passing_threshold: number;
    template_preview: string;
  };

  // Execution steps
  execution_steps: {
    step: string;
    description: string;
    estimated_time: string;
  }[];

  // Estimated totals
  estimated_records: number;
  estimated_duration: string;
}
```

### `adjust_plan`

Adjusts an existing plan based on user feedback via chat.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataset_id` | string | Yes | The dataset ID |
| `current_plan` | Plan | Yes | The current plan to adjust |
| `user_feedback` | string | Yes | User's feedback/request for changes (e.g., "reduce to 5 topics with 50 records each") |

**Returns:**
```typescript
interface AdjustPlanResult {
  success: boolean;
  error?: string;
  plan?: Plan;
  message?: string;
}
```

**Use Cases:**
- User requests changes to the plan (e.g., "reduce to 5 topics", "increase examples to 100 each")
- User wants to modify topic structure, counts, or grader criteria
- The adjusted plan is shown to the user for approval via the same `vllora_plan_proposed` event

### `execute_plan`

Executes all steps in the approved plan automatically.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataset_id` | string | Yes | The dataset ID |
| `plan` | Plan | Yes | The approved plan object |

**Returns:**
```typescript
interface ExecutePlanResult {
  success: boolean;
  error?: string;
  execution_id: string;
  final_status: ExecutionProgress;
  summary: {
    topics_applied: number;
    records_generated: number;
    grader_configured: boolean;
    dataset_uploaded: boolean;
    dry_run_passed: boolean;
    ready_to_finetune: boolean;
    finetune_job_id?: string;
    finetune_job_status?: string;
  };
}
```

**Execution Steps (7 total):**
1. **Apply Topic Hierarchy** - Creates topic structure from proposed_topics
2. **Generate Initial Data** - Creates seed training examples (distributed by topic - records are assigned to topics during generation, no separate categorization needed)
3. **Configure Evaluator** - Sets up LLM-as-Judge grader using `plan.grader_config.template_preview`
4. **Upload Dataset** - Syncs to backend via API
5. **Run Dry Run** - Validates with current model (non-fatal if fails)
6. **Generate README** - Creates comprehensive documentation including:
   - Data provenance (which knowledge sources were used)
   - Topic hierarchy visualization
   - Record statistics and coverage analysis
   - Plan execution summary
7. **Start Finetune Job** - Automatically creates and submits the training job using `quickFinetune()` with base model `google/gemma-3-4b-it`. Emits `vllora_finetune_job_created` event and switches UI to Jobs tab. (Non-fatal if fails, user can start manually)

## Progress Indicators

### Dataset-Level Progress (RecordsSectionHeader)

The `RecordsSectionHeader` component shows overall data generation progress near the Export button:

```typescript
// Displays: "Generating X/Y" with animated spinner
{generationProgress && (
  <div className="flex items-center gap-1.5 text-[rgb(var(--theme-400))] text-xs px-2 py-1 bg-[rgba(var(--theme-500),0.1)] rounded-md">
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
    <span>Generating {generationProgress.completed}/{generationProgress.total}</span>
  </div>
)}
```

The component listens for `vllora_data_generation_progress` events with `completed` and `total` fields.

### Per-Topic Progress (TopicNodeHeader)

Individual topics show generation progress while records are being created for that specific topic:

```typescript
// In TopicNodeHeader.tsx
{isGenerating && (
  <div className="flex items-center gap-1.5 text-[rgb(var(--theme-400))]">
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
    <span className="text-xs">
      {generatingProgress
        ? `Generating... ${generatingProgress.completed}/${generatingProgress.total}`
        : "Generating..."}
    </span>
  </div>
)}
```

The per-topic progress uses `topicCompleted` and `topicTotal` fields from the event (distinct from the dataset-level `completed`/`total`).

### Progress Event Structure

```typescript
interface DataGenerationProgressEvent {
  datasetId: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  // Dataset-level progress
  total: number;
  completed: number;
  // Per-topic progress (for topic-level indicators)
  currentTopic?: string;
  topicCompleted?: number;
  topicTotal?: number;
  error?: string;
}
```

## Plan Execution State Persistence

### execution-state-store.ts

Located at: `/ui/src/lib/distri-finetune-tools/steps/execution-state-store.ts`

A simple in-memory store that persists execution progress across tab switches. This allows users to:
- Switch away from the Plan tab during execution
- Return to see current progress
- View the plan markdown alongside execution progress

**Key functions:**
```typescript
// Get current execution progress for a dataset
getCurrentExecution(datasetId: string): ExecutionProgress | null

// Check if a dataset has an active execution
hasActiveExecution(datasetId: string): boolean

// Get the plan being executed (for displaying during execution)
getExecutingPlan(datasetId: string): Plan | null

// Store the plan when approved (called automatically via event)
setExecutingPlan(datasetId: string, plan: Plan): void
```

The store automatically:
- Updates on `vllora_plan_progress` events
- Stores the plan on `vllora_plan_approved` events
- Auto-clears completed executions after 5 seconds

### Plan Markdown During Execution

When a plan is being executed, the `PlanSection` component shows a split view:
- **Left side**: The plan rendered as markdown (read-only)
- **Right side**: `ExecutionProgressCard` with step-by-step progress

This is achieved by:
1. Storing the plan in `executingPlanStore` when approved
2. Retrieving it in `PlanSection` on mount via `getExecutingPlan()`
3. Displaying both the plan markdown and progress card side-by-side

## UI Components

### PlanEditor (Right Panel)

Located at: `/ui/src/components/datasets/plan-section/PlanEditor.tsx`

The primary component for viewing and editing plans. Displayed in the main content area (right panel) when a plan is proposed. Features:
- **Markdown view** - Plan rendered as readable markdown
- **Edit mode** - Toggle to edit the markdown directly
- **Approve & Execute** - Button to proceed with the plan
- **Dismiss** - Button to close and discard the plan

**Props:**
```typescript
interface PlanEditorProps {
  plan: Plan;
  onApprove: (plan: Plan) => void;
  onDismiss?: () => void;
}
```

The editor converts the Plan to markdown for editing and parses changes back when approved. Key editable fields:
- Seed count
- Passing threshold
- Topic target counts

### PlanCard (Legacy/Compact)

Located at: `/ui/src/components/datasets/plan-section/PlanCard.tsx`

Compact card version with expandable sections (used as fallback or in constrained spaces):
- **Knowledge Sources** - Documents analyzed
- **Topics** - Hierarchical topic structure with counts
- **Data Generation** - Strategy and seed count (editable)
- **Evaluation Criteria** - Grader criteria with weights
- **Execution Steps** - What will happen on approval

**Props:**
```typescript
interface PlanCardProps {
  plan: Plan;
  onApprove: (plan: Plan) => void;
}
```

### ExecutionProgressCard

Located at: `/ui/src/components/datasets/plan-section/ExecutionProgressCard.tsx`

Shows real-time execution progress:
- Step-by-step status (pending, running, completed, failed)
- Progress indicator
- Final summary with "Ready for fine-tuning!" message

**Props:**
```typescript
interface ExecutionProgressCardProps {
  initialProgress?: ExecutionProgress;
  onComplete?: (progress: ExecutionProgress) => void;
}
```

**Event Subscription:**
The component subscribes to `vllora_plan_progress` events to receive real-time updates.

### PlanPreview (Workspace Tab)

Located at: `/ui/src/components/datasets/PlanPreview.tsx`

Workspace tab component for plan management. Reads plan state from `PlanContext` and renders the appropriate view based on lifecycle:
1. **Docs processing** — Shows `DocsProcessingState` when knowledge sources are still being processed
2. **Generating plan** — Shows loading state while Lucy generates a plan
3. **Plan proposed** — Displays `PlanEditor` when a plan is ready for review
4. **Execution in progress** — Shows `ExecutionProgressCard` with real-time progress
5. **Plan completed** — Shows `PlanCompletedState` with summary
6. **Empty state** — Prompts user to generate a plan

### LucyToolRenderer

Located at: `/ui/src/components/agent/lucy-agent/LucyToolRenderer.tsx`

Generic tool renderer that handles display for tool calls in the chat sidebar. Includes specialized rendering for plan-related tools (`propose_plan`, `execute_plan`) showing loading states, success confirmations, error displays, and "requires knowledge sources" messages.

## Event Flow

### Plan Generating Event

When `propose_plan` starts, it emits an event to switch to the Plan tab and show loading:

```typescript
emitter.emit('vllora_plan_generating', { datasetId: string });
```

`DatasetDetailContentV2` listens for this event and automatically switches to the Plan tab. `PlanSection` displays a loading state while the plan is being generated.

### Plan Proposed Event

When `propose_plan` completes, it emits an event so the right panel can display the plan:

```typescript
emitter.emit('vllora_plan_proposed', { datasetId: string, plan: Plan });
```

The `PlanSection` component listens for this event and displays the `PlanEditor`.

### Plan Dismissed Event

Emitted in two scenarios:
1. When the user dismisses the plan without approving
2. When `propose_plan` returns early because documents are still processing (clears the "generating plan" loading state)

```typescript
emitter.emit('vllora_plan_dismissed', { datasetId: string });
```

### Progress Events

The `execute_plan` handler emits progress events via the event emitter:

```typescript
emitter.emit('vllora_plan_progress', { progress: ExecutionProgress });
```

### Workflow Updated Event

After execution completes, a workflow updated event is emitted to trigger UI refresh:

```typescript
emitter.emit('vllora_workflow_updated', { datasetId: string });
```

The `useFineTuneAgentChat` hook listens for this event and automatically refreshes the workflow state, ensuring the next agent message has the current context. The `PlanSection` component also listens for this to clear any displayed plan.

**ExecutionProgress Structure:**
```typescript
interface ExecutionProgress {
  execution_id: string;
  dataset_id: string;
  started_at: number;
  updated_at: number;
  is_complete: boolean;
  current_step: string;
  steps: ExecutionStep[];
}

interface ExecutionStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: number;
  completed_at?: number;
  result?: any;
  error?: string;
}
```

### Approval Event

When user clicks "Approve & Execute", the PlanCard emits:

```typescript
emitter.emit('vllora_lucy_prompt', {
  prompt: `I approve the plan. Please execute it now using the execute_plan tool with the following plan:\n\n${JSON.stringify(plan)}`,
});
```

This triggers Lucy to call the `execute_plan` tool.

## Agent Integration

The Lucy agent system uses 4 agent definitions in `gateway/agents/finetune/`:

### Orchestrator Agent (`vllora-finetune-agent.md`)

The orchestrator handles plan creation directly (no delegation to sub-agents). Its plan-related external tools:
```yaml
external = [
  "analyze_knowledge_sources",
  "generate_topics",
  "generate_grader",
  "propose_plan",
  "adjust_plan",
  "save_plan",
  "execute_plan"
]
```

**Rule #0 (Plan-First Triggers)** in the agent definition prioritizes plan creation when:
- Message contains "documents have finished processing" or "documents are ready"
- Message contains "plan" or "create a plan"
- Message contains "analyze my documents"
- Dataset is empty (0 records) and has knowledge sources

When triggered, the orchestrator runs a 5-step sequence directly:
1. `analyze_knowledge_sources` — check for uploaded documents
2. `generate_topics` — get topic suggestions
3. `generate_grader` — get evaluation criteria
4. `propose_plan` — assemble and save draft plan
5. `save_plan` — validate, commit, and show to user

### Sub-Agents

- **`finetune-topics-agent.md`** — Topic hierarchy specialist, delegated via `transfer_to_agent("finetune_topics", ...)`
- **`finetune-workflow-agent.md`** — Workflow executor (also has `propose_plan` and `execute_plan` for delegated scenarios)
- **`data-generation-agent.md`** — Interactive data generation with knowledge sources, previews, iterative refinement

## File Locations

| Component | Path |
|-----------|------|
| **Plan Tools** | |
| propose_plan folder | `/ui/src/lib/distri-finetune-tools/steps/propose-plan/` |
| propose_plan types | `/ui/src/lib/distri-finetune-tools/steps/propose-plan/types.ts` |
| propose_plan handler | `/ui/src/lib/distri-finetune-tools/steps/propose-plan/handler.ts` |
| propose_plan tool def | `/ui/src/lib/distri-finetune-tools/steps/propose-plan/tool.ts` |
| adjust_plan tool | `/ui/src/lib/distri-finetune-tools/steps/propose-plan/adjust-plan.ts` |
| grader_template utility | `/ui/src/lib/distri-finetune-tools/steps/propose-plan/grader-template.ts` |
| save_plan tool | `/ui/src/lib/distri-finetune-tools/steps/save-plan.ts` |
| execute_plan tool | `/ui/src/lib/distri-finetune-tools/steps/execute-plan.ts` |
| plan_step_normalization | `/ui/src/lib/distri-finetune-tools/steps/plan-step-normalization.ts` |
| execution_state_store | `/ui/src/lib/distri-finetune-tools/steps/execution-state-store.ts` |
| proposed_plan_store | `/ui/src/lib/distri-finetune-tools/steps/proposed-plan-store.ts` |
| **Other Tools** | |
| generate_initial_data | `/ui/src/lib/distri-finetune-tools/steps/generate-initial-data.ts` |
| knowledge_sources | `/ui/src/lib/distri-finetune-tools/steps/knowledge-sources.ts` |
| analyze_knowledge_sources | `/ui/src/lib/distri-finetune-tools/steps/analyze-knowledge-sources.ts` |
| semantic_pdf_extractor | `/ui/src/lib/distri-finetune-tools/steps/semantic-pdf-extractor.ts` |
| pdf_native_extractor | `/ui/src/lib/distri-finetune-tools/steps/pdf-native-extractor.ts` |
| **Plan UI Components** | |
| PlanPreview (workspace tab) | `/ui/src/components/datasets/PlanPreview.tsx` |
| PlanEditor | `/ui/src/components/datasets/plan-section/PlanEditor.tsx` |
| PlanCard | `/ui/src/components/datasets/plan-section/PlanCard.tsx` |
| PlanHeaderActions | `/ui/src/components/datasets/plan-section/PlanHeaderActions.tsx` |
| PlanCompletedState | `/ui/src/components/datasets/plan-section/PlanCompletedState.tsx` |
| DocsProcessingState | `/ui/src/components/datasets/plan-section/DocsProcessingState.tsx` |
| ExecutionProgressCard | `/ui/src/components/datasets/plan-section/ExecutionProgressCard.tsx` |
| plan-markdown-utils | `/ui/src/components/datasets/plan-section/plan-markdown-utils.ts` |
| **Contexts & State** | |
| PlanContext | `/ui/src/contexts/PlanContext.tsx` |
| **Other UI** | |
| Tool Renderers | `/ui/src/components/agent/lucy-agent/LucyToolRenderer.tsx` |
| RecordsSectionHeader | `/ui/src/components/datasets/dataset-detail-header/RecordsSectionHeader.tsx` |
| TopicRecordTree | `/ui/src/components/datasets/records-table/TopicRecordTree.tsx` |
| TopicNodeHeader | `/ui/src/components/datasets/records-table/TopicNodeHeader.tsx` |
| TopicTreeNodeRow | `/ui/src/components/datasets/records-table/TopicTreeNodeRow.tsx` |
| Lucy Assistant | `/ui/src/components/datasets/LucyDatasetAssistant.tsx` |
| DatasetDetailContentV2 | `/ui/src/components/datasets/DatasetDetailContentV2.tsx` |
| Event Emitter | `/ui/src/utils/eventEmitter.ts` |
| **Agent Definitions** | |
| Orchestrator Agent | `/gateway/agents/finetune/vllora-finetune-agent.md` |
| Topics Agent | `/gateway/agents/finetune/finetune-topics-agent.md` |
| Workflow Agent | `/gateway/agents/finetune/finetune-workflow-agent.md` |
| Data Generation Agent | `/gateway/agents/finetune/data-generation-agent.md` |

## Recent Improvements

### Default Plan Structure (5 Leaf Topics)

Initial plans now default to a **2-level hierarchy with exactly 5 leaf topics**:
- 2-3 parent categories (target_count = 0)
- 5 leaf subtopics distributed across parents (target_count = 30 each)
- Total: 150 records by default

The LLM prompt enforces this structure, and `propose-plan/handler.ts` validates leaf topic counts while `propose-plan/adjust-plan.ts` includes `validateAndFixResponse()` to programmatically ensure the correct number of leaf topics even if the LLM deviates.

### Parallel Data Generation

Data generation now uses **3 parallel LLM requests** for faster processing:
- Batch size: 10 records per request
- Parallel requests: 3 concurrent batches
- ~3x speedup compared to sequential generation

See `generate-initial-data.ts` for the implementation using `Promise.all()`.

### LLM-as-Judge Evaluator

The evaluator configuration step now uses the pre-generated `template_preview` from the plan:
- `grader-template.ts` generates a full LLM-as-judge evaluator during plan creation
- `execute-plan.ts` uses `plan.grader_config.template_preview` directly
- No more placeholder scripts with `[object Object]` issues

### Executed Plan Read-Only View

After plan execution completes, the Plan tab shows a read-only view:
- `PlanCompletedState` component displays the executed plan summary
- Green "Plan Executed Successfully" badge in header
- "Clear" button to dismiss and return to empty state
- Persists across tab switches via `execution-state-store.ts`

## Troubleshooting

### Plan Shows Error Despite Successful Generation

**Symptom:** Console shows `[proposePlan] Plan generated successfully` but UI shows error.

**Cause:** Tool result structure mismatch. The renderer wasn't using `extractToolResultData` to properly extract from the `ToolResult.parts` structure.

**Solution:** Use `extractToolResultData` from `@distri/core` to extract the result:
```typescript
import { extractToolResultData } from '@distri/core';

const resultData = extractToolResultData(state.result);
const result = resultData ? resultData.result : state.result;
```

### Progress Events Not Received

**Symptom:** ExecutionProgressCard shows initial state but doesn't update.

**Cause:** Race condition - events may fire before the component subscribes.

**Solution:** The component uses `initialProgress` prop to handle the final state if events were missed. Ensure the handler returns `final_status` in its result.

### Knowledge Sources Not Ready

**Symptom:** Plan says "requires knowledge sources" even though documents were uploaded.

**Cause:** Documents are still being processed (status: 'processing').

**Solution:** The tool now checks for processing sources and displays a specific message:
- If sources are processing: Shows amber "Documents still processing" message with wait instructions
- If no sources at all: Shows prompt to upload documents

The `sources_processing` flag in the result indicates this state, and the UI shows a distinct amber card with a loading indicator.

Before returning early, the handler emits `vllora_plan_dismissed` to clear the "generating plan" loading state in `PlanSection`, preventing a misleading spinner.

### PDF Extraction Quality

**Symptom:** Extracted topics include noise like "Page Break", "Copyright", author names.

**Cause:** Using `basic` extraction mode instead of LLM-assisted extraction.

**Solution:** The `upload_knowledge_source` tool now supports an `extraction_mode` parameter:
- `llm` (default): Uses LLM to intelligently extract meaningful topics, filter noise, and provide document summary
- `basic`: Fast regex-based extraction (may include noise)

The LLM mode automatically filters out:
- Copyright notices, legal disclaimers
- Preface, foreword, acknowledgments
- Bibliography, references, index
- Page numbers, headers, footers

If LLM extraction fails, it automatically falls back to basic mode.
