# General-Purpose Planning System

## Overview

The planning system enables Lucy to propose a plan for user approval before executing any complex multi-step operation. This follows the Claude Code in VS Code pattern: an AI assistant that analyzes, proposes, shows progress, and executes.

**Design principle: Tools are dumb, Lucy is smart.** Lucy decides when to propose a plan, constructs the plan herself, and the tool just validates, persists, and shows it to the user. There is no special-casing — initial setup, data augmentation, regrading, retraining all follow the same flow.

## The Flow (Always the Same)

```
assess state → (analyze if needed) → construct plan → propose → approve → execute
```

1. **Assess state**: Lucy calls `get_dataset_state` to see what exists (records, topics, grader, etc.)
2. **Analyze** (optional): If knowledge sources need analysis, Lucy calls `analyze_knowledge_sources` to get topic/grader/schema recommendations
3. **Construct plan**: Lucy builds a `SetupPlan` object based on state + analysis + user intent
4. **Propose**: Lucy calls `propose_setup_plan({ dataset_id, plan })` → tool persists to IndexedDB, emits event, UI shows plan card
5. **Approve**: User reviews plan in UI, clicks "Approve & Execute"
6. **Execute**: Lucy calls `execute_setup_plan` → runs steps sequentially, emits progress

## Tools

### `analyze_knowledge_sources`

Analyzes dataset objective and uploaded knowledge sources. Returns building blocks for plan construction:

- `proposed_topics` — topic hierarchy with target counts
- `grader_criteria` — evaluation criteria
- `grader_template_preview` — pre-generated JS eval script
- `output_format` — structured schema (if applicable)
- `strategy` — data generation strategy notes
- `knowledge_sources` — summary of analyzed documents

This tool calls an internal LLM. Lucy uses the results to construct her plan.

### `propose_setup_plan`

Validates, persists, and displays a plan for user approval. **Does not generate anything** — Lucy passes in a fully-constructed plan.

Parameters:
- `dataset_id` (required) — the dataset
- `plan` (required) — the `SetupPlan` object Lucy constructed

### `execute_setup_plan`

Registry-based orchestrator. Iterates `steps_to_execute` from the plan and calls each registered step executor in order.

Parameters:
- `dataset_id` (required) — the dataset
- `plan` (optional) — if not provided, retrieves the approved plan from UI
- `steps_to_execute` (optional) — override which steps to run (defaults to `plan.steps_to_execute` or all)
- `overrides` (optional) — per-step parameter overrides (defaults to `plan.overrides`)

#### Step Registry

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

Execution order is fixed: `topics → adjust_topics → categorize → generate → grader → upload → dryrun → readme → finetune`. Steps not in `steps_to_execute` are skipped.

Non-fatal steps log errors and continue. Fatal steps abort the pipeline.

To add a new step: define an executor function, add it to `STEP_REGISTRY` and `STEP_ORDER`.

## SetupPlan Type Reference

```typescript
interface SetupPlan {
  // Always present
  dataset_id: string;
  dataset_name: string;
  objective: string;
  execution_steps: { step: string; description: string; estimated_time: string }[];
  estimated_duration: string;

  // Plan metadata
  title?: string;              // Human-readable plan title (shown in UI header)
  description?: string;        // Brief description (shown below title)

  // Execution config embedded in plan
  steps_to_execute?: ExecutionStepId[];   // Which steps execute_setup_plan should run
  overrides?: {                            // Per-step parameter overrides
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };
  adjust_topics_instruction?: string;      // NL instruction for adjust_topics step

  // Domain-specific sections (optional — only present when relevant)
  output_format?: OutputFormat | null;
  knowledge_sources?: { name: string; topics_extracted: string[] }[];
  proposed_topics?: ProposedTopic[];
  total_topic_count?: number;
  data_generation?: { strategy: string; grounded_in_knowledge: boolean };
  grader_config?: { criteria: GraderCriterion[]; template_preview: string };
  estimated_records?: number;
}
```

## Execution Types

```typescript
type ExecutionStepId = 'topics' | 'adjust_topics' | 'categorize' | 'generate' | 'grader' | 'upload' | 'dryrun' | 'readme' | 'finetune';

interface StepExecutor {
  name: string;
  workflowStep?: FinetuneStep;  // Maps to workflow state machine
  nonFatal?: boolean;            // If true, failure doesn't abort pipeline
  execute: (ctx: StepContext) => Promise<StepResult>;
}

interface StepContext {
  dataset_id: string;
  plan: SetupPlan;
  workflow_id: string;
  workflow: FinetuneWorkflowState;
  overrides?: {
    adjust_topics?: { instruction?: string };
    generate?: { count?: number; target_topics?: string[]; per_topic_count?: number };
    upload?: { force_reupload?: boolean };
  };
  summary: ExecutionSummary;     // Mutable — each step updates its fields
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

## Validation

Before execution starts, the plan is validated by `validatePlanForExecution()` (exported from `execute-setup-plan.ts`). This runs in two places:

1. **UI gate** (`SetupPlanContext.approvePlan`) — shows `toast.error()` with the first error and blocks approval
2. **Handler gate** (`executeSetupPlanHandler`) — safety net before marking the plan as 'executing' in IndexedDB

### Validation Rules

| Step | Prerequisite | Error Message |
|---|---|---|
| _(any)_ | All IDs in `steps_to_execute` exist in `STEP_ORDER` | `Unknown step: '{id}'` |
| `topics` | `plan.proposed_topics` has length > 0 | `Step 'topics' requires proposed_topics in the plan` |
| `adjust_topics` | `overrides.adjust_topics.instruction` or `plan.adjust_topics_instruction` non-empty | `Step 'adjust_topics' requires an instruction (in plan or overrides)` |
| `generate` | `estimated_records > 0` or `overrides.generate.count > 0` or `per_topic_count > 0` | `Step 'generate' requires a record count (...)` |
| `grader` | `plan.grader_config.template_preview` non-empty | `Step 'grader' requires grader_config.template_preview in the plan` |
| `categorize`, `upload`, `dryrun`, `readme`, `finetune` | No plan-level prereqs | _(always pass)_ |

If validation fails, execution never starts — the plan status stays as-is (not 'executing').

## Plan Lifecycle

```
propose → [UI shows plan card] → approve → validate → execute → complete/fail
                                    ↑           ↓
                               adjust (edit)  toast.error (if invalid)
```

## UI Rendering

The UI conditionally renders sections based on what's present in the plan:

- **Title**: Shows `plan.title` if present, else "Setup Plan"
- **Description**: Shows `plan.description` if present, else "for {dataset_name}"
- **Topics section**: Only shown if `plan.proposed_topics?.length > 0`
- **Knowledge sources**: Only shown if `plan.knowledge_sources?.length > 0`
- **Output format**: Only shown if `plan.output_format` is truthy
- **Data generation**: Only shown if `plan.data_generation` is truthy
- **Grader config**: Only shown if `plan.grader_config?.criteria?.length > 0`
- **Summary**: Shows records count only if `plan.estimated_records` is present

## Files

| File | Role |
|---|---|
| `src/lib/distri-finetune-tools/steps/analyze-knowledge-sources.ts` | Analyzes knowledge sources via LLM, returns building blocks |
| `src/lib/distri-finetune-tools/steps/propose-setup-plan/types.ts` | SetupPlan type with optional fields |
| `src/lib/distri-finetune-tools/steps/propose-setup-plan/handler.ts` | Validates, persists, emits plan (no LLM) |
| `src/lib/distri-finetune-tools/steps/propose-setup-plan/tool.ts` | Tool definition (plan required) |
| `src/lib/distri-finetune-tools/steps/execute-setup-plan.ts` | Registry-based orchestrator with STEP_REGISTRY and step executors |
| `src/components/datasets/plan-section/SetupPlanCard.tsx` | Full plan card with conditional sections |
| `src/components/agent/lucy-agent/setup-plan-render/PlanCard.tsx` | Sidebar plan card |
| `src/components/datasets/ActivePlanBanner.tsx` | Banner with plan title and stats |
| `gateway/agents/finetune/vllora-finetune-agent.md` | Agent prompt with plan-first pattern |
