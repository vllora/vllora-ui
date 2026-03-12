/**
 * Create Dataset Tool
 *
 * Creates a new dataset in IndexedDB (with optional objective and workflow)
 * and navigates the browser to the new dataset page.
 *
 * This allows the agent to handle "create a new dataset" requests without
 * the user needing to manually use the UI create dialog.
 */

import type { DistriFnTool } from '@distri/core';
import { datasetService } from '@/services/service-registry';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const createDatasetHandler: ToolHandler = async (params) => {
  try {
    const { name, objective } = params;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return { success: false, error: 'name is required (non-empty string)' };
    }

    const resolvedObjective =
      typeof objective === 'string' && objective.trim() ? objective.trim() : undefined;

    // Create dataset + auto-create workflow if objective is provided
    const dataset = await datasetService.create(name.trim(), resolvedObjective);

    // Navigate the browser to the new dataset
    emitter.emit('vllora_dataset_navigate' as never, {
      datasetId: dataset.id,
    } as never);

    return {
      success: true,
      dataset_id: dataset.id,
      name: dataset.name,
      objective: dataset.datasetObjective ?? null,
      has_workflow: Boolean(resolvedObjective),
      message: `Dataset "${dataset.name}" created.${resolvedObjective ? ' Workflow initialized.' : ''} Navigated to new dataset.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create dataset',
    };
  }
};

export const createDatasetTool: DistriFnTool = {
  name: 'create_dataset',
  description: `Create a new finetune dataset with an optional training objective.

Creates the dataset in IndexedDB, initializes a workflow if an objective is provided,
and navigates the browser to the new dataset page.

Use this when the user asks to create a new dataset or start a new project.
Do NOT use update_objective on an existing dataset when the user wants a separate new dataset.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the new dataset (e.g., "Python debugging assistant")',
      },
      objective: {
        type: 'string',
        description:
          'Training objective describing what the model should learn. If provided, a workflow is auto-initialized.',
      },
    },
    required: ['name'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(
      await createDatasetHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
