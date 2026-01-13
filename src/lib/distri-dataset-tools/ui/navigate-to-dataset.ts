import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const navigateToDatasetHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  emitter.emit('vllora_dataset_navigate' as any, { datasetId: dataset_id as string });
  return { success: true, navigated_to: dataset_id };
};

export const navigateToDatasetTool: DistriFnTool = {
  name: 'navigate_to_dataset',
  description: 'Navigate to the detail view of a specific dataset',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The ID of the dataset to navigate to' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await navigateToDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
