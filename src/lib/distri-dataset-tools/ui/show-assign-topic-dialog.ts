import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const showAssignTopicDialogHandler: ToolHandler = async () => {
  emitter.emit('vllora_dataset_show_assign_topic' as any, {});
  return { success: true, message: 'Assign topic dialog opened' };
};

export const showAssignTopicDialogTool: DistriFnTool = {
  name: 'show_assign_topic_dialog',
  description: 'Open the bulk assign topic dialog for selected records',
  type: 'function',
  parameters: { type: 'object', properties: {} },
  handler: async () => JSON.stringify(await showAssignTopicDialogHandler({})),
} as DistriFnTool;
