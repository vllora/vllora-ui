import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const getDatasetRecordsHandler: ToolHandler = async ({ dataset_id, limit }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  try {
    let records = await datasetsDB.getRecordsByDatasetId(dataset_id as string);
    if (limit && typeof limit === 'number' && limit > 0) {
      records = records.slice(0, limit);
    }
    return {
      success: true,
      records,
      count: records.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get records',
    };
  }
};

export const getDatasetRecordsTool: DistriFnTool = {
  name: 'get_dataset_records',
  description: 'Get records for a specific dataset',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      limit: { type: 'number', description: 'Maximum number of records to return' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await getDatasetRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
