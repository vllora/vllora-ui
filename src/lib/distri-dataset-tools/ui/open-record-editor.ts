import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const openRecordEditorHandler: ToolHandler = async ({ record_id }) => {
  if (!record_id) {
    return { success: false, error: 'record_id is required' };
  }
  emitter.emit('vllora_dataset_open_editor' as any, { recordId: record_id as string });
  return { success: true, opened_editor_for: record_id };
};

export const openRecordEditorTool: DistriFnTool = {
  name: 'open_record_editor',
  description: 'Open the JSON editor dialog for a specific record',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      record_id: { type: 'string', description: 'The ID of the record to edit' },
    },
    required: ['record_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await openRecordEditorHandler(input as Record<string, unknown>)),
} as DistriFnTool;
