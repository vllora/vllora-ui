# Guided Onboarding Flow

This document describes the guided onboarding flow for first-time users setting up a finetune dataset with Lucy.

## Overview

When a user has an **empty dataset** (0 records) and uploads **knowledge sources** (documents), Lucy automatically triggers a guided onboarding flow that:

1. Analyzes the uploaded documents
2. Proposes a comprehensive setup plan
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
│  - Triggers propose_setup_plan      │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  propose_setup_plan tool            │
│  - Fetches dataset objective        │
│  - Extracts topics from documents   │
│  - Calls LLM to generate plan       │
│  - Returns SetupPlan object         │
│  - Emits vllora_setup_plan_proposed │
└─────────────────────────────────────┘
         │
         ├────────────────────────────────────┐
         ▼                                    ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│  Lucy Chat (Left)       │    │  Plan Tab (Right)                   │
│  LucySetupPlanRenderer  │    │  PlanSection                        │
│  - Shows confirmation   │    │  - Shows loading while generating   │
│    message              │    │  - Displays SetupPlanEditor         │
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
               │  adjust_setup_plan tool  │    │
               │  - Takes user feedback   │    │
               │  - Regenerates plan      │    │
               │  - Emits updated plan    │────┘
               └─────────────────────────┘
                               ┌─────────────────────────────────────┐
                               │  execute_setup_plan tool            │
                               │  - Step 1: Apply topic hierarchy    │
                               │  - Step 2: Generate initial data    │
                               │  - Step 3: Configure evaluator      │
                               │  - Step 4: Upload to backend        │
                               │  - Step 5: Run dry run validation   │
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

The guided onboarding flow is triggered when ALL of the following are true:

1. **Dataset is empty** - No existing training records
2. **Knowledge sources uploaded** - User has added at least one document
3. **Training objective defined** - Dataset has a `datasetObjective` set

If the training objective is not set, Lucy will first help the user define it before proposing a setup plan.

## Tools

### `propose_setup_plan`

Analyzes the dataset and knowledge sources to generate a comprehensive setup plan.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dataset_id` | string | Yes | - | The dataset ID to generate a plan for |
| `seed_count` | number | No | 30 | Target number of initial training examples |

**Returns:**
```typescript
interface ProposeSetupPlanResult {
  success: boolean;
  error?: string;
  plan?: SetupPlan;
  requires_knowledge_sources?: boolean;
  message?: string;
}
```

**SetupPlan Structure:**
```typescript
interface SetupPlan {
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

### `adjust_setup_plan`

Adjusts an existing setup plan based on user feedback via chat.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataset_id` | string | Yes | The dataset ID |
| `current_plan` | SetupPlan | Yes | The current setup plan to adjust |
| `user_feedback` | string | Yes | User's feedback/request for changes (e.g., "reduce to 5 topics with 50 records each") |

**Returns:**
```typescript
interface AdjustSetupPlanResult {
  success: boolean;
  error?: string;
  plan?: SetupPlan;
  message?: string;
}
```

**Use Cases:**
- User requests changes to the plan (e.g., "reduce to 5 topics", "increase examples to 100 each")
- User wants to modify topic structure, counts, or grader criteria
- The adjusted plan is shown to the user for approval via the same `vllora_setup_plan_proposed` event

### `execute_setup_plan`

Executes all steps in the approved setup plan automatically.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataset_id` | string | Yes | The dataset ID |
| `plan` | SetupPlan | Yes | The approved setup plan object |

**Returns:**
```typescript
interface ExecuteSetupPlanResult {
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

**Execution Steps:**
1. **Apply Topic Hierarchy** - Creates topic structure from proposed_topics
2. **Generate Initial Data** - Creates seed training examples (distributed by topic - records are assigned to topics during generation, no separate categorization needed)
3. **Configure Evaluator** - Sets up LLM-as-Judge grader
4. **Upload Dataset** - Syncs to backend
5. **Run Dry Run** - Validates with current model (non-fatal if fails)
6. **Generate README** - Creates comprehensive documentation including:
   - Data provenance (which knowledge sources were used)
   - Topic hierarchy visualization
   - Record statistics and coverage analysis
   - Setup plan execution summary
7. **Start Finetune Job** - Automatically creates and submits the training job (non-fatal if fails, user can start manually)

## Progress Indicators

### Dataset-Level Progress (RecordsSectionHeader)

The `RecordsSectionHeader` component shows overall data generation progress near the Export button:

```typescript
// Displays: "Generating X/Y" with animated spinner
{generationProgress && (
  <div className="flex items-center gap-1.5 text-emerald-400 text-xs px-2 py-1 bg-emerald-500/10 rounded-md">
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
  <div className="flex items-center gap-1.5 text-emerald-400">
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
getExecutingPlan(datasetId: string): SetupPlan | null

// Store the plan when approved (called automatically via event)
setExecutingPlan(datasetId: string, plan: SetupPlan): void
```

The store automatically:
- Updates on `vllora_setup_plan_progress` events
- Stores the plan on `vllora_setup_plan_approved` events
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

### SetupPlanEditor (Right Panel)

Located at: `/ui/src/components/datasets/plan-section/SetupPlanEditor.tsx`

The primary component for viewing and editing setup plans. Displayed in the main content area (right panel) when a plan is proposed. Features:
- **Markdown view** - Plan rendered as readable markdown
- **Edit mode** - Toggle to edit the markdown directly
- **Approve & Execute** - Button to proceed with the plan
- **Dismiss** - Button to close and discard the plan

**Props:**
```typescript
interface SetupPlanEditorProps {
  plan: SetupPlan;
  onApprove: (plan: SetupPlan) => void;
  onDismiss?: () => void;
}
```

The editor converts the SetupPlan to markdown for editing and parses changes back when approved. Key editable fields:
- Seed count
- Passing threshold
- Topic target counts

### SetupPlanCard (Legacy/Compact)

Located at: `/ui/src/components/datasets/plan-section/SetupPlanCard.tsx`

Compact card version with expandable sections (used as fallback or in constrained spaces):
- **Knowledge Sources** - Documents analyzed
- **Topics** - Hierarchical topic structure with counts
- **Data Generation** - Strategy and seed count (editable)
- **Evaluation Criteria** - Grader criteria with weights
- **Execution Steps** - What will happen on approval

**Props:**
```typescript
interface SetupPlanCardProps {
  plan: SetupPlan;
  onApprove: (plan: SetupPlan) => void;
}
```

### PlanExecutedView

Located at: `/ui/src/components/datasets/plan-section/PlanExecutedView.tsx`

Read-only view of a successfully executed setup plan:
- Shows plan markdown with success badge
- Green header with "Plan Executed Successfully" indicator
- "Clear" button to dismiss the view

**Props:**
```typescript
interface PlanExecutedViewProps {
  plan: SetupPlan;
  onClear: () => void;
  className?: string;
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
The component subscribes to `vllora_setup_plan_progress` events to receive real-time updates.

### PlanSection

Located at: `/ui/src/components/datasets/PlanSection.tsx`

Dedicated section for setup plan management in the Plan tab. It:
- Shows loading state while Lucy is generating a plan
- Listens for `vllora_setup_plan_proposed` events
- Displays SetupPlanEditor when a plan is proposed
- Shows ExecutionProgressCard during plan execution
- Shows empty state with "Generate Setup Plan" button when no plan is active
- Handles plan approval and dismissal

**Props:**
```typescript
interface PlanSectionProps {
  datasetId: string;
  isGeneratingPlan?: boolean;
  className?: string;
}
```

### ReadmeWithPlan

Located at: `/ui/src/components/datasets/ReadmeWithPlan.tsx`

Simple wrapper component for the README tab that renders the DatasetReadmeViewer. Plan functionality has been moved to the separate PlanSection component.

**Props:**
```typescript
interface ReadmeWithPlanProps {
  datasetId: string;
  readme: string | null;
  readmeUpdatedAt: number | null;
  onExport: () => void;
  onRegenerate: () => Promise<void>;
  className?: string;
}
```

### LucySetupPlanRenderer

Located at: `/ui/src/components/agent/lucy-agent/LucySetupPlanRenderer.tsx`

Custom tool renderer for `propose_setup_plan` tool in the chat. Shows:
- Loading state while generating plan
- Success confirmation pointing to the right panel
- Error state display
- "Requires knowledge sources" message

### LucyExecutePlanRenderer

Located at: `/ui/src/components/agent/lucy-agent/LucySetupPlanRenderer.tsx`

Custom tool renderer for `execute_setup_plan` tool. Handles:
- Running state with progress card
- Success state with final summary
- Error state display

## Event Flow

### Plan Generating Event

When `propose_setup_plan` starts, it emits an event to switch to the Plan tab and show loading:

```typescript
emitter.emit('vllora_setup_plan_generating', { datasetId: string });
```

`DatasetDetailContentV2` listens for this event and automatically switches to the Plan tab. `PlanSection` displays a loading state while the plan is being generated.

### Plan Proposed Event

When `propose_setup_plan` completes, it emits an event so the right panel can display the plan:

```typescript
emitter.emit('vllora_setup_plan_proposed', { datasetId: string, plan: SetupPlan });
```

The `PlanSection` component listens for this event and displays the `SetupPlanEditor`.

### Plan Dismissed Event

When the user dismisses the plan without approving:

```typescript
emitter.emit('vllora_setup_plan_dismissed', { datasetId: string });
```

### Progress Events

The `execute_setup_plan` handler emits progress events via the event emitter:

```typescript
emitter.emit('vllora_setup_plan_progress', { progress: ExecutionProgress });
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

When user clicks "Approve & Execute", the SetupPlanCard emits:

```typescript
emitter.emit('vllora_lucy_prompt', {
  prompt: `I approve the setup plan. Please execute it now using the execute_setup_plan tool with the following plan:\n\n${JSON.stringify(plan)}`,
});
```

This triggers Lucy to call the `execute_setup_plan` tool.

## Agent Integration

### Orchestrator Agent (`vllora-finetune-agent.md`)

The orchestrator has both tools in its external tools list:
```yaml
external = [
  "propose_setup_plan",
  "execute_setup_plan"
]
```

**Rule #0** in the agent definition prioritizes guided onboarding triggers:
- Contains "I've uploaded" AND "document(s)"
- Contains "propose_setup_plan" or "setup plan"
- Contains "analyze my documents"

When triggered, the orchestrator calls `propose_setup_plan` directly (no delegation).

### Workflow Agent (`finetune-workflow-agent.md`)

Also has access to both tools for delegated execution scenarios.

## File Locations

| Component | Path |
|-----------|------|
| propose_setup_plan folder | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan/` |
| propose_setup_plan types | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan/types.ts` |
| propose_setup_plan handler | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan/handler.ts` |
| propose_setup_plan prompts | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan/prompts.ts` |
| adjust_setup_plan tool | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan/adjust-plan.ts` |
| grader_template utility | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan/grader-template.ts` |
| llm_service utility | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan/llm-service.ts` |
| execute_setup_plan tool | `/ui/src/lib/distri-finetune-tools/steps/execute-setup-plan.ts` |
| generate_initial_data tool | `/ui/src/lib/distri-finetune-tools/steps/generate-initial-data.ts` |
| knowledge_sources tools | `/ui/src/lib/distri-finetune-tools/steps/knowledge-sources.ts` |
| pdf_extractor | `/ui/src/lib/distri-finetune-tools/steps/pdf-extractor.ts` |
| pdf_llm_extractor | `/ui/src/lib/distri-finetune-tools/steps/pdf-llm-extractor.ts` |
| execution_state_store | `/ui/src/lib/distri-finetune-tools/steps/execution-state-store.ts` |
| PlanSection | `/ui/src/components/datasets/plan-section/PlanSection.tsx` |
| SetupPlanEditor | `/ui/src/components/datasets/plan-section/SetupPlanEditor.tsx` |
| SetupPlanCard | `/ui/src/components/datasets/plan-section/SetupPlanCard.tsx` |
| ExecutionProgressCard | `/ui/src/components/datasets/plan-section/ExecutionProgressCard.tsx` |
| PlanExecutedView | `/ui/src/components/datasets/plan-section/PlanExecutedView.tsx` |
| ReadmeWithPlan | `/ui/src/components/datasets/ReadmeWithPlan.tsx` |
| SectionTabs | `/ui/src/components/datasets/dataset-detail-header/SectionTabs.tsx` |
| Tool Renderers | `/ui/src/components/agent/lucy-agent/LucySetupPlanRenderer.tsx` |
| RecordsSectionHeader | `/ui/src/components/datasets/dataset-detail-header/RecordsSectionHeader.tsx` |
| TopicRecordTree | `/ui/src/components/datasets/records-table/TopicRecordTree.tsx` |
| TopicNodeHeader | `/ui/src/components/datasets/records-table/TopicNodeHeader.tsx` |
| TopicTreeNodeRow | `/ui/src/components/datasets/records-table/TopicTreeNodeRow.tsx` |
| Lucy Assistant | `/ui/src/components/datasets/LucyDatasetAssistant.tsx` |
| DatasetDetailContentV2 | `/ui/src/components/datasets/DatasetDetailContentV2.tsx` |
| Event Emitter | `/ui/src/utils/eventEmitter.ts` |
| Orchestrator Agent | `/gateway/agents/finetune/vllora-finetune-agent.md` |
| Workflow Agent | `/gateway/agents/finetune/finetune-workflow-agent.md` |

## Recent Improvements

### Default Plan Structure (5 Leaf Topics)

Initial plans now default to a **2-level hierarchy with exactly 5 leaf topics**:
- 2-3 parent categories (target_count = 0)
- 5 leaf subtopics distributed across parents (target_count = 30 each)
- Total: 150 records by default

The LLM prompt enforces this structure, and `llm-service.ts` includes a `validateAndFixInitialPlan()` function that programmatically ensures exactly 5 leaf topics even if the LLM deviates.

### Parallel Data Generation

Data generation now uses **3 parallel LLM requests** for faster processing:
- Batch size: 10 records per request
- Parallel requests: 3 concurrent batches
- ~3x speedup compared to sequential generation

See `generate-initial-data.ts` for the implementation using `Promise.all()`.

### LLM-as-Judge Evaluator

The evaluator configuration step now uses the pre-generated `template_preview` from the plan:
- `grader-template.ts` generates a full LLM-as-judge evaluator during plan creation
- `execute-setup-plan.ts` uses `plan.grader_config.template_preview` directly
- No more placeholder scripts with `[object Object]` issues

### Executed Plan Read-Only View

After plan execution completes, the Plan tab shows a read-only view:
- `PlanExecutedView` component displays the executed plan markdown
- Green "Plan Executed Successfully" badge in header
- "Clear" button to dismiss and return to empty state
- Persists across tab switches via `execution-state-store.ts`

## Troubleshooting

### Plan Shows Error Despite Successful Generation

**Symptom:** Console shows `[proposeSetupPlan] Plan generated successfully` but UI shows error.

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
