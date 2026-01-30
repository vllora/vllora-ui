import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const closeRecordEditorHandler: ToolHandler = async () => {
  emitter.emit('vllora_dataset_close_editor' as any, {});
  return { success: true, message: 'Editor closed' };
};

export const closeRecordEditorTool: DistriFnTool = {
  name: 'close_record_editor',
  description: 'Close the record editor dialog',
  type: 'function',
  parameters: { type: 'object', properties: {} },
  handler: async () => JSON.stringify(await closeRecordEditorHandler({})),
} as DistriFnTool;
