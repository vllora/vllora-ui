import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const deleteDatasetHandler: ToolHandler = async ({ dataset_id, confirmed }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!confirmed) {
    // Get dataset info for confirmation message
    const datasets = await datasetsDB.getAllDatasets();
    const dataset = datasets.find((d) => d.id === dataset_id);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }
    const recordCount = await datasetsDB.getRecordCount(dataset_id as string);
    return {
      success: false,
      requires_confirmation: true,
      message: `Delete dataset '${dataset.name}' with ${recordCount} records?`,
      action: 'delete_dataset',
      params: { dataset_id },
    };
  }
  try {
    const recordCount = await datasetsDB.getRecordCount(dataset_id as string);
    await datasetsDB.deleteDataset(dataset_id as string);
    // Emit event to update React state directly
    emitter.emit('vllora_dataset_deleted' as any, { datasetId: dataset_id });
    return { success: true, deleted_records_count: recordCount };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete dataset',
    };
  }
};

export const deleteDatasetTool: DistriFnTool = {
  name: 'delete_dataset',
  description: 'Delete a dataset and all its records. Requires confirmation.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      confirmed: { type: 'boolean', description: 'Set to true to confirm deletion' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await deleteDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
