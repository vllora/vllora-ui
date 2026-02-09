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
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  LucySetupPlanRenderer              │
│  - Renders SetupPlanCard component  │
│  - Shows: topics, data strategy,    │
│    grader config, execution steps   │
│  - User can edit seed count         │
│  - "Approve & Execute" button       │
└─────────────────────────────────────┘
         │
         ▼ (User clicks Approve)
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
  };
}
```

**Execution Steps:**
1. **Apply Topic Hierarchy** - Creates topic structure from proposed_topics
2. **Generate Initial Data** - Creates seed training examples
3. **Configure Evaluator** - Sets up LLM-as-Judge grader
4. **Upload Dataset** - Syncs to backend
5. **Run Dry Run** - Validates with current model (non-fatal if fails)

## UI Components

### SetupPlanCard

Located at: `/ui/src/components/datasets/lucy-plan-card/SetupPlanCard.tsx`

Displays the proposed setup plan with expandable sections:
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

### ExecutionProgressCard

Located at: `/ui/src/components/datasets/lucy-plan-card/ExecutionProgressCard.tsx`

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

### LucySetupPlanRenderer

Located at: `/ui/src/components/agent/lucy-agent/LucySetupPlanRenderer.tsx`

Custom tool renderer for `propose_setup_plan` tool. Handles:
- Loading state while generating plan
- Success state with SetupPlanCard
- Error state display
- "Requires knowledge sources" message

### LucyExecutePlanRenderer

Located at: `/ui/src/components/agent/lucy-agent/LucySetupPlanRenderer.tsx`

Custom tool renderer for `execute_setup_plan` tool. Handles:
- Running state with progress card
- Success state with final summary
- Error state display

## Event Flow

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

The `useFineTuneAgentChat` hook listens for this event and automatically refreshes the workflow state, ensuring the next agent message has the current context.

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
| propose_setup_plan tool | `/ui/src/lib/distri-finetune-tools/steps/propose-setup-plan.ts` |
| execute_setup_plan tool | `/ui/src/lib/distri-finetune-tools/steps/execute-setup-plan.ts` |
| SetupPlanCard | `/ui/src/components/datasets/lucy-plan-card/SetupPlanCard.tsx` |
| ExecutionProgressCard | `/ui/src/components/datasets/lucy-plan-card/ExecutionProgressCard.tsx` |
| Tool Renderers | `/ui/src/components/agent/lucy-agent/LucySetupPlanRenderer.tsx` |
| Lucy Assistant | `/ui/src/components/datasets/LucyDatasetAssistant.tsx` |
| Orchestrator Agent | `/gateway/agents/finetune/vllora-finetune-agent.md` |
| Workflow Agent | `/gateway/agents/finetune/finetune-workflow-agent.md` |

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
