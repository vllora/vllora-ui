import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const createDatasetHandler: ToolHandler = async ({ name }) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { success: false, error: 'name is required' };
  }
  try {
    const dataset = await datasetsDB.createDataset(name as string);
    // Emit event with full dataset to update React state directly
    emitter.emit('vllora_dataset_created' as any, { dataset });
    return {
      success: true,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        created_at: dataset.createdAt,
      },
    };
  } catch (error) {
    console.error('==== createDatasetHandler error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create dataset',
    };
  }
};

export const createDatasetTool: DistriFnTool = {
  name: 'create_dataset',
  description: 'Create a new dataset with the given name',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the new dataset' },
    },
    required: ['name'],
  },
  handler: async (input: object) =>
    JSON.stringify(await createDatasetHandler(input as Record<string, unknown>)),
} as DistriFnTool;
