import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const exportDatasetHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  emitter.emit('vllora_dataset_export' as any, { datasetId: dataset_id as string });
  return { success: true, export_triggered: dataset_id };
};

export const exportDatasetTool: DistriFnTool = {
  name: 'export_dataset',
  description: 'Trigger export of a dataset as JSON file',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The ID of the dataset to export' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await exportDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
