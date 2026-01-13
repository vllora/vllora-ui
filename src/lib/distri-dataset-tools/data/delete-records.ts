import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const deleteRecordsHandler: ToolHandler = async ({ dataset_id, record_ids, confirmed }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
    return { success: false, error: 'record_ids array is required' };
  }
  if (!confirmed) {
    return {
      success: false,
      requires_confirmation: true,
      message: `Delete ${record_ids.length} records?`,
      action: 'delete_records',
      params: { dataset_id, record_ids },
    };
  }
  try {
    for (const recordId of record_ids as string[]) {
      await datasetsDB.deleteRecord(dataset_id as string, recordId);
    }
    emitter.emit('vllora_dataset_refresh' as any, {});
    return { success: true, deleted_count: record_ids.length };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete records',
    };
  }
};

export const deleteRecordsTool: DistriFnTool = {
  name: 'delete_records',
  description: 'Delete specific records from a dataset. Requires confirmation.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_ids: { type: 'array', items: { type: 'string' }, description: 'Record IDs to delete' },
      confirmed: { type: 'boolean', description: 'Set to true to confirm deletion' },
    },
    required: ['dataset_id', 'record_ids'],
  },
  handler: async (input: object) =>
    JSON.stringify(await deleteRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
