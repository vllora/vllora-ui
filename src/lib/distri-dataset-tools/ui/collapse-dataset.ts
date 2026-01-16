import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const collapseDatasetHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  emitter.emit('vllora_dataset_collapse' as any, { datasetId: dataset_id as string });
  return { success: true, collapsed: dataset_id };
};

export const collapseDatasetTool: DistriFnTool = {
  name: 'collapse_dataset',
  description: 'Collapse a dataset card in the list view',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The ID of the dataset to collapse' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await collapseDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
