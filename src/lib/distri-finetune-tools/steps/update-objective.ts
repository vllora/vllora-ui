/**
 * Update Dataset Objective Tool
 *
 * Allows agents to update the training objective for a dataset.
 * Also syncs the objective to the associated workflow's trainingGoals if one exists.
 */

import type { DistriFnTool } from '@distri/core';
import { datasetService, workflowService } from '@/services/service-registry';
import type { ToolHandler } from '../types';
import { normalizeObjectiveToRole } from './shared/topic-system-prompt';

// =============================================================================
// Types
// =============================================================================

interface UpdateObjectiveParams {
  dataset_id: string;
  objective: string;
}

interface UpdateObjectiveResult {
  success: boolean;
  error?: string;
  previous_objective?: string;
  new_objective: string;
  workflow_synced: boolean;
}

// =============================================================================
// Main Handler
// =============================================================================

export const updateObjectiveHandler: ToolHandler = async (
  params
): Promise<UpdateObjectiveResult> => {
  try {
    const { dataset_id, objective } = params as unknown as UpdateObjectiveParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required', new_objective: '', workflow_synced: false };
    }

    if (!objective || !objective.trim()) {
      return { success: false, error: 'objective is required and cannot be empty', new_objective: '', workflow_synced: false };
    }

    const trimmedObjective = objective.trim();

    const dataset = await datasetService.getById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found`, new_objective: '', workflow_synced: false };
    }

    const previousObjective = dataset.datasetObjective;

    // Normalize the objective to a "You are ..." role sentence via LLM
    let normalizedRole: string | undefined;
    try {
      normalizedRole = await normalizeObjectiveToRole(trimmedObjective);
    } catch (err) {
      console.warn('[updateObjective] Failed to normalize objective via LLM, will use heuristic fallback:', err);
    }

    await datasetService.updateObjective(dataset_id, trimmedObjective, normalizedRole);

    let workflowSynced = false;
    try {
      const workflow = await workflowService.getByDataset(dataset_id);
      if (workflow) {
        workflow.trainingGoals = trimmedObjective;
        await workflowService.update(workflow);
        workflowSynced = true;
      }
    } catch (err) {
      console.warn('[updateObjective] Failed to sync objective to workflow:', err);
    }

    return {
      success: true,
      previous_objective: previousObjective,
      new_objective: trimmedObjective,
      workflow_synced: workflowSynced,
    };
  } catch (error) {
    console.error('[updateObjective] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update objective',
      new_objective: '',
      workflow_synced: false,
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const updateObjectiveTool: DistriFnTool = {
  name: 'update_objective',
  description: `Update the training objective for a dataset.

The training objective describes the specific behaviors to reinforce or suppress during fine-tuning. It is used by:
- Topic generation (to create relevant topic hierarchies)
- Data generation (to produce training examples aligned with the goal)
- Grader generation (to create evaluation criteria)
- Setup plan creation (to configure the full workflow)

If a workflow exists for this dataset, its trainingGoals will also be updated.

Use this tool when:
- The user wants to change or refine the training objective
- The user provides a new objective after seeing initial results
- The current objective needs to be more specific or broader`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to update the objective for',
      },
      objective: {
        type: 'string',
        description: 'The new training objective describing specific behaviors to reinforce or suppress',
      },
    },
    required: ['dataset_id', 'objective'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await updateObjectiveHandler(input as Record<string, unknown>)),
} as DistriFnTool;
