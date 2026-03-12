/**
 * Finetune Workflow Control Tools
 *
 * Tools for managing the finetune workflow lifecycle.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, datasetService, recordService } from '@/services/service-registry';
import type {
  ToolHandler,
  StartWorkflowResult,
  WorkflowStatusResult,
  AdvanceStepResult,
  RollbackResult,
} from '../types';
import { workflowToStatusResult } from '../types';
import type { FinetuneStep, FinetuneWorkflowState, ValidationError } from '@/types/workflow-types';

// =============================================================================
// Event Emitter for UI Updates
// =============================================================================

/**
 * Emit an event when the workflow state changes.
 * This allows UI components (like WorkflowStepIndicator) to update in real-time.
 */
export function emitWorkflowUpdate(workflowId: string, step?: FinetuneStep): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('finetune-workflow-updated', {
        detail: { workflowId, step },
      })
    );

    // Emit section change for specific steps
    if (step === 'grader_config') {
      window.dispatchEvent(
        new CustomEvent('finetune-set-view-mode', {
          detail: { section: 'evaluator' },
        })
      );
    }
  }
}

// =============================================================================
// Step Order and Validation
// =============================================================================

const STEP_ORDER: FinetuneStep[] = [
  'not_started',
  'topics_config',
  'categorize',
  'coverage_generation',
  'grader_config',
  'dry_run',
  'skill_packaging',
  'training',
  'deployment',
  'completed',
];

function getStepIndex(step: FinetuneStep): number {
  return STEP_ORDER.indexOf(step);
}

/**
 * Valid step transitions. The workflow allows flexibility:
 * - Normal flow: topics_config → categorize → coverage_generation → grader_config → dry_run → training → deployment
 * - Quick path: not_started → grader_config (skip ALL preparation steps for rapid experimentation)
 * - Skip coverage: topics_config → grader_config (skip categorization and coverage)
 * - Skip coverage: categorize → grader_config (skip coverage analysis)
 * - Skip dry_run: grader_config → training (skip dry run validation)
 *
 * The key requirement for training is having the evaluation function configured (grader_config).
 * All other steps (topics, categorization, coverage, dry_run) are optional - users can proceed
 * as long as they have records and an evaluation function configured.
 */
function isValidStepTransition(from: FinetuneStep, to: FinetuneStep): boolean {
  const fromIndex = getStepIndex(from);
  const toIndex = getStepIndex(to);

  // Normal flow: advance one step at a time
  if (toIndex === fromIndex + 1) {
    return true;
  }

  // Quick path: Allow skipping directly from not_started to grader_config
  // This enables users to see the end-to-end flow quickly with just records + evaluation function
  // Results may not be optimal, but allows rapid experimentation
  if (to === 'grader_config' && from === 'not_started') {
    return true;
  }

  // Allow skipping to grader_config from topics_config or categorize
  // This enables users to proceed with finetune even without perfect coverage,
  // as long as they configure the evaluation function
  if (to === 'grader_config' && (from === 'topics_config' || from === 'categorize')) {
    return true;
  }

  // Allow skipping dry_run and going directly to training
  // Users can skip validation if they're confident in their data and grader
  if (to === 'training' && from === 'grader_config') {
    return true;
  }

  // Allow skipping skill_packaging — it's optional
  if (to === 'training' && from === 'dry_run') {
    return true;
  }
  if (to === 'training' && from === 'skill_packaging') {
    return true;
  }

  // Allow skipping from coverage_generation directly to skill_packaging
  if (to === 'skill_packaging' && from === 'coverage_generation') {
    return true;
  }

  return false;
}

function canRollbackTo(currentStep: FinetuneStep, targetStep: FinetuneStep): boolean {
  const currentIndex = getStepIndex(currentStep);
  const targetIndex = getStepIndex(targetStep);

  // Can rollback to any previous step
  return targetIndex < currentIndex && targetIndex > 0;
}

// =============================================================================
// start_finetune_workflow
// =============================================================================

export const startFinetuneWorkflowHandler: ToolHandler = async (params): Promise<StartWorkflowResult> => {
  try {
    const { workflow_id, training_goals, start_step } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    // Validate start_step if provided
    const validStartSteps: FinetuneStep[] = ['topics_config', 'grader_config'];
    const targetStartStep: FinetuneStep = (start_step && typeof start_step === 'string' && validStartSteps.includes(start_step as FinetuneStep))
      ? (start_step as FinetuneStep)
      : 'topics_config';

    // Verify dataset exists
    const dataset = await datasetService.getById(workflow_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${workflow_id} not found` };
    }

    // Use provided training_goals or fall back to dataset's objective
    const effectiveGoals = (typeof training_goals === 'string' && training_goals.trim())
      ? training_goals.trim()
      : dataset.datasetObjective;

    if (!effectiveGoals) {
      return { success: false, error: 'training_goals is required (dataset has no datasetObjective set)' };
    }

    // Check if workflow already exists
    const existingWorkflow = await workflowService.getByDataset(workflow_id);
    if (existingWorkflow && existingWorkflow.currentStep !== 'completed') {
      return {
        success: false,
        error: `A finetune workflow already exists for this dataset (step: ${existingWorkflow.currentStep}). Use get_workflow_status to check its state.`,
      };
    }

    // Get and validate records
    const records = await recordService.getByDatasetId(workflow_id);
    const validationErrors: ValidationError[] = [];

    // Basic validation: check records have input/output
    for (const record of records) {
      const data = record.data as { input?: unknown; output?: unknown } | null;
      if (!data || !data.input || !data.output) {
        validationErrors.push({
          recordId: record.id,
          error: 'Record missing input or output data',
        });
      }
    }

    const validCount = records.length - validationErrors.length;
    const invalidCount = validationErrors.length;

    // Create workflow
    const workflow = await workflowService.create(workflow_id, effectiveGoals);

    // Update workflow with validation results
    await workflowService.updateStepData(workflow.id, 'inputValidation', {
      recordCount: records.length,
      validCount,
      invalidCount,
      validationErrors,
    });

    // Advance to target start step (quick path: grader_config, normal: topics_config)
    await workflowService.advanceToStep(workflow.id, targetStartStep);

    // Emit event for UI update
    emitWorkflowUpdate(workflow_id, targetStartStep);

    return {
      success: true,
      workflow_id: workflow.id,
      current_step: targetStartStep,
      validation: {
        record_count: records.length,
        valid_count: validCount,
        invalid_count: invalidCount,
        errors: validationErrors.length > 0 ? validationErrors.slice(0, 10) : undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start workflow',
    };
  }
};

export const startFinetuneWorkflowTool: DistriFnTool = {
  name: 'start_finetune_workflow',
  description: 'Initialize a new finetune workflow for a dataset. Validates records and sets up the workflow state. Uses dataset\'s datasetObjective as training goals if not provided. Supports quick path: set start_step to "grader_config" to skip all preparation steps.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to create a workflow for',
      },
      training_goals: {
        type: 'string',
        description: 'Optional: Override training goals. If not provided, uses dataset\'s datasetObjective.',
      },
      start_step: {
        type: 'string',
        enum: ['topics_config', 'grader_config'],
        description: 'Optional: The step to start at. Default is "topics_config". Use "grader_config" for quick path to skip all preparation steps.',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await startFinetuneWorkflowHandler(input as Record<string, unknown>)),
} as DistriFnTool;

// =============================================================================
// get_workflow_status
// =============================================================================

export const getWorkflowStatusHandler: ToolHandler = async (params): Promise<WorkflowStatusResult> => {
  try {
    const { workflow_id } = params;

    let workflow: FinetuneWorkflowState | null = null;
    let workflowIdToCheck: string | null = null;

    if (workflow_id && typeof workflow_id === 'string') {
      workflow = await workflowService.get(workflow_id);
      if (!workflow) {
        workflow = await workflowService.getByDataset(workflow_id);
      }
      workflowIdToCheck = workflow?.workflowId ?? workflow_id;
    } else {
      return { success: false, error: 'workflow_id is required' };
    }

    // Check if dataset has evalScript (configured via UI)
    let datasetHasEvalScript = false;
    if (workflowIdToCheck) {
      const dataset = await datasetService.getById(workflowIdToCheck);
      datasetHasEvalScript = !!dataset?.evalScript;

      // Sync: If dataset has evalScript but workflow doesn't have graderConfig,
      // update workflow to reflect this
      if (workflow && datasetHasEvalScript && !workflow.graderConfig) {
        await workflowService.updateStepData(workflow.id, 'graderConfig', {
          type: 'js',
          configuredAt: Date.now(),
        });
        // Refresh workflow state
        workflow = await workflowService.get(workflow.id);
      }
    }

    return workflowToStatusResult(workflow, datasetHasEvalScript);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get workflow status',
    };
  }
};

export const getWorkflowStatusTool: DistriFnTool = {
  name: 'get_workflow_status',
  description: 'Get the current state of a finetune workflow including step progress, coverage stats, and results.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The workflow ID',
      },
    },
    required: [],
  },
  handler: async (input) => JSON.stringify(await getWorkflowStatusHandler(input as Record<string, unknown>)),
} as DistriFnTool;

// =============================================================================
// advance_to_step
// =============================================================================

export const advanceToStepHandler: ToolHandler = async (params): Promise<AdvanceStepResult> => {
  try {
    const { workflow_id, step } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!step || typeof step !== 'string') {
      return { success: false, error: 'step is required' };
    }

    const targetStep = step as FinetuneStep;
    if (!STEP_ORDER.includes(targetStep)) {
      return { success: false, error: `Invalid step: ${step}` };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (!isValidStepTransition(workflow.currentStep, targetStep)) {
      const currentIndex = getStepIndex(workflow.currentStep);
      const nextStep = STEP_ORDER[currentIndex + 1];
      // Provide helpful guidance on valid transitions
      let validOptions: string;
      if (workflow.currentStep === 'not_started') {
        validOptions = `Next step should be ${nextStep}, or you can skip directly to grader_config for quick path (skips all preparation steps).`;
      } else if (workflow.currentStep === 'topics_config' || workflow.currentStep === 'categorize') {
        validOptions = `Next step should be ${nextStep}, or you can skip to grader_config if you want to proceed without coverage analysis.`;
      } else if (workflow.currentStep === 'grader_config') {
        validOptions = `Next step should be ${nextStep}, or you can skip directly to training if you want to bypass dry run validation.`;
      } else {
        validOptions = `Next step should be ${nextStep}.`;
      }
      return {
        success: false,
        error: `Cannot advance from ${workflow.currentStep} to ${step}. ${validOptions}`,
      };
    }

    const previousStep = workflow.currentStep;
    await workflowService.advanceToStep(workflow_id, targetStep);
    return {
      success: true,
      previous_step: previousStep,
      current_step: targetStep,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to advance step',
    };
  }
};

export const advanceToStepTool: DistriFnTool = {
  name: 'advance_to_step',
  description: 'Move the workflow to the next step. Supports skipping optional steps: not_started can skip to grader_config (quick path), topics_config/categorize can skip to grader_config, grader_config can skip to training.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The workflow ID',
      },
      step: {
        type: 'string',
        enum: ['topics_config', 'categorize', 'coverage_generation', 'grader_config', 'dry_run', 'training', 'deployment', 'completed'],
        description: 'The step to advance to',
      },
    },
    required: ['workflow_id', 'step'],
  },
  handler: async (input) => JSON.stringify(await advanceToStepHandler(input as Record<string, unknown>)),
} as DistriFnTool;

// =============================================================================
// rollback_to_step
// =============================================================================

export const rollbackToStepHandler: ToolHandler = async (params): Promise<RollbackResult> => {
  try {
    const { workflow_id, step, snapshot_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get available snapshots
    const snapshots = await workflowService.getSnapshots(workflow_id);

    // If snapshot_id provided, use that
    if (snapshot_id && typeof snapshot_id === 'string') {
      const restored = await workflowService.rollbackToSnapshot(snapshot_id);
      if (!restored) {
        return {
          success: false,
          error: 'Snapshot not found',
          available_snapshots: snapshots.map((s) => ({
            id: s.id,
            step: s.step,
            created_at: s.createdAt,
          })),
        };
      }
      // Emit event for UI update
      emitWorkflowUpdate(workflow.workflowId);
      return {
        success: true,
        rolled_back_to: restored.currentStep,
      };
    }

    // If step provided, find matching snapshot
    if (step && typeof step === 'string') {
      const targetStep = step as FinetuneStep;

      if (!canRollbackTo(workflow.currentStep, targetStep)) {
        return {
          success: false,
          error: `Cannot rollback from ${workflow.currentStep} to ${step}`,
        };
      }

      // Find latest snapshot for this step
      const matchingSnapshot = snapshots
        .filter((s) => s.step === targetStep)
        .sort((a, b) => b.createdAt - a.createdAt)[0];

      if (!matchingSnapshot) {
        return {
          success: false,
          error: `No snapshot found for step ${step}`,
          available_snapshots: snapshots.map((s) => ({
            id: s.id,
            step: s.step,
            created_at: s.createdAt,
          })),
        };
      }

      const restored = await workflowService.rollbackToSnapshot(matchingSnapshot.id);
      if (!restored) {
        return { success: false, error: 'Failed to restore snapshot' };
      }

      // Emit event for UI update
      emitWorkflowUpdate(workflow.workflowId);

      return {
        success: true,
        rolled_back_to: restored.currentStep,
      };
    }

    // No step or snapshot provided, return available options
    return {
      success: false,
      error: 'Either step or snapshot_id is required',
      available_snapshots: snapshots.map((s) => ({
        id: s.id,
        step: s.step,
        created_at: s.createdAt,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rollback',
    };
  }
};

export const rollbackToStepTool: DistriFnTool = {
  name: 'rollback_to_step',
  description: 'Rollback the workflow to a previous step using saved snapshots.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The workflow ID',
      },
      step: {
        type: 'string',
        enum: ['topics_config', 'categorize', 'coverage_generation', 'grader_config', 'dry_run'],
        description: 'The step to rollback to (will use most recent snapshot for that step)',
      },
      snapshot_id: {
        type: 'string',
        description: 'Optional: specific snapshot ID to rollback to',
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await rollbackToStepHandler(input as Record<string, unknown>)),
} as DistriFnTool;

// =============================================================================
// Tool Names and Handlers
// =============================================================================

export const WORKFLOW_TOOL_NAMES = [
  'start_finetune_workflow',
  'get_workflow_status',
  'advance_to_step',
  'rollback_to_step',
] as const;

export type WorkflowToolName = (typeof WORKFLOW_TOOL_NAMES)[number];

export function isWorkflowTool(name: string): name is WorkflowToolName {
  return WORKFLOW_TOOL_NAMES.includes(name as WorkflowToolName);
}

// All workflow tools auto-execute — they operate on local IndexedDB state.
export const workflowTools: DistriFnTool[] = [
  startFinetuneWorkflowTool,
  getWorkflowStatusTool,
  advanceToStepTool,
  rollbackToStepTool,
].map(tool => ({ ...tool, autoExecute: true }));

export const workflowToolHandlers: Record<string, ToolHandler> = {
  start_finetune_workflow: startFinetuneWorkflowHandler,
  get_workflow_status: getWorkflowStatusHandler,
  advance_to_step: advanceToStepHandler,
  rollback_to_step: rollbackToStepHandler,
};
