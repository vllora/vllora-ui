import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const clearSelectionHandler: ToolHandler = async () => {
  emitter.emit('vllora_dataset_clear_selection' as any, {});
  return { success: true, message: 'Selection cleared' };
};

export const clearSelectionTool: DistriFnTool = {
  name: 'clear_selection',
  description: 'Clear all selected records',
  type: 'function',
  parameters: { type: 'object', properties: {} },
  handler: async () => JSON.stringify(await clearSelectionHandler({})),
} as DistriFnTool;
