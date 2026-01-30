import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const expandDatasetHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  emitter.emit('vllora_dataset_expand' as any, { datasetId: dataset_id as string });
  return { success: true, expanded: dataset_id };
};

export const expandDatasetTool: DistriFnTool = {
  name: 'expand_dataset',
  description: 'Expand a dataset card in the list view to show its records',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The ID of the dataset to expand' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await expandDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
