import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const selectRecordsHandler: ToolHandler = async ({ record_ids }) => {
  if (!record_ids || !Array.isArray(record_ids)) {
    return { success: false, error: 'record_ids array is required' };
  }
  emitter.emit('vllora_dataset_select_records' as any, { recordIds: record_ids as string[] });
  return { success: true, selected_count: record_ids.length };
};

export const selectRecordsTool: DistriFnTool = {
  name: 'select_records',
  description: 'Select specific records by their IDs',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      record_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of record IDs to select',
      },
    },
    required: ['record_ids'],
  },
  handler: async (input: object) =>
    JSON.stringify(await selectRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
