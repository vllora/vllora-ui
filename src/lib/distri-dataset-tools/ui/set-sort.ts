import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const setSortHandler: ToolHandler = async ({ field, direction }) => {
  if (!field) {
    return { success: false, error: 'field is required' };
  }
  const dir = (direction as string) || 'desc';
  if (dir !== 'asc' && dir !== 'desc') {
    return { success: false, error: 'direction must be "asc" or "desc"' };
  }
  emitter.emit('vllora_dataset_set_sort' as any, {
    field: field as string,
    direction: dir as 'asc' | 'desc',
  });
  return { success: true, sorted_by: field, direction: dir };
};

export const setSortTool: DistriFnTool = {
  name: 'set_sort',
  description: 'Set the sort configuration for records',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      field: {
        type: 'string',
        enum: ['timestamp', 'topic', 'evaluation'],
        description: 'Field to sort by',
      },
      direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: desc)',
      },
    },
    required: ['field'],
  },
  handler: async (input: object) =>
    JSON.stringify(await setSortHandler(input as Record<string, unknown>)),
} as DistriFnTool;
