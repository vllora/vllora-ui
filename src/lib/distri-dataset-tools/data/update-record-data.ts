import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const updateRecordDataHandler: ToolHandler = async ({ dataset_id, record_id, data }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!record_id) {
    return { success: false, error: 'record_id is required' };
  }
  if (!data) {
    return { success: false, error: 'data is required' };
  }
  try {
    await datasetsDB.updateRecordData(dataset_id as string, record_id as string, data);
    emitter.emit('vllora_dataset_refresh' as any, {});
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update record data',
    };
  }
};

export const updateRecordDataTool: DistriFnTool = {
  name: 'update_record_data',
  description: 'Update the data content of a record',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_id: { type: 'string', description: 'The record ID' },
      data: { type: 'object', description: 'The new data object' },
    },
    required: ['dataset_id', 'record_id', 'data'],
  },
  handler: async (input: object) =>
    JSON.stringify(await updateRecordDataHandler(input as Record<string, unknown>)),
} as DistriFnTool;
