import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const renameDatasetHandler: ToolHandler = async ({ dataset_id, new_name }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!new_name || typeof new_name !== 'string' || !new_name.trim()) {
    return { success: false, error: 'new_name is required' };
  }
  try {
    await datasetsDB.renameDataset(dataset_id as string, new_name as string);
    // Emit event to update React state directly
    emitter.emit('vllora_dataset_renamed' as any, { datasetId: dataset_id, name: new_name });
    return { success: true, renamed_to: new_name };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rename dataset',
    };
  }
};

export const renameDatasetTool: DistriFnTool = {
  name: 'rename_dataset',
  description: 'Rename a dataset',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      new_name: { type: 'string', description: 'The new name for the dataset' },
    },
    required: ['dataset_id', 'new_name'],
  },
  handler: async (input: object) =>
    JSON.stringify(await renameDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
