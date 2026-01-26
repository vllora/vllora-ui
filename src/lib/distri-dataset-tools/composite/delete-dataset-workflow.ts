import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { DatasetContext } from './types';
import { mergeWithStoredContext } from './context-store';

export const deleteDatasetWorkflowHandler: ToolHandler = async ({
  dataset_id,
  dataset_name,
  confirmed,
  context: passedContext,
}: {
  dataset_id?: string;
  dataset_name?: string;
  confirmed?: boolean;
  context?: Partial<DatasetContext>;
}) => {
  try {
    // Merge passed context with stored context (fallback for when context isn't passed through agent chain)
    const context = mergeWithStoredContext(passedContext);

    // 1. Resolve dataset ID using context.dataset_names or context.current_dataset_id
    let targetId = dataset_id;
    if (!targetId && dataset_name) {
      const match = context?.dataset_names?.find(
        (d) => d.name.toLowerCase() === dataset_name.toLowerCase()
      );
      targetId = match?.id;
    }
    targetId = targetId || context?.current_dataset_id;

    if (!targetId) {
      return { success: false, error: 'No dataset specified' };
    }

    // 2. Get dataset info
    const dataset = await datasetsDB.getDatasetById(targetId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    const recordCount = await datasetsDB.getRecordCount(targetId);

    // 3. If not confirmed, return confirmation prompt
    if (!confirmed) {
      return {
        success: true,
        requires_confirmation: true,
        dataset_id: targetId,
        dataset_name: dataset.name,
        link: `[${dataset.name}](/datasets?id=${targetId})`,
        record_count: recordCount,
        message: `Are you sure you want to delete "${dataset.name}" with ${recordCount} records? This cannot be undone. Reply 'yes' to confirm.`,
      };
    }

    // 4. Execute deletion (deleteDataset also removes all records in the same transaction)
    await datasetsDB.deleteDataset(targetId);

    // 5. Navigate to datasets list
    emitter.emit('vllora_dataset_navigate_to_list' as any, {});

    return {
      success: true,
      deleted: true,
      dataset_name: dataset.name,
      records_deleted: recordCount,
      datasets_list_link: '[View all datasets](/datasets)',
      message: `Deleted dataset "${dataset.name}" and ${recordCount} records`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete dataset',
    };
  }
};

export const deleteDatasetWorkflowTool: DistriFnTool = {
  name: 'delete_dataset_workflow',
  description:
    'Delete a dataset with confirmation handling. First call returns confirmation prompt, second call with confirmed=true executes deletion. Use this for requests like "delete dataset X", "remove dataset X".',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description:
          'The ID of the dataset to delete (optional if dataset_name or context.current_dataset_id provided)',
      },
      dataset_name: {
        type: 'string',
        description: 'The name of the dataset to delete (will be resolved to ID using context)',
      },
      confirmed: {
        type: 'boolean',
        description: 'Set to true to confirm and execute the deletion',
      },
      context: {
        type: 'object',
        description: 'Current page context from orchestrator',
      },
    },
    required: ['context'],
  },
  handler: async (input: object) =>
    JSON.stringify(await deleteDatasetWorkflowHandler(input as Record<string, unknown>)),
} as DistriFnTool;
