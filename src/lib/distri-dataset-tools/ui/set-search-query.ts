import { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const setSearchQueryHandler: ToolHandler = async ({ query }) => {
  emitter.emit('vllora_dataset_set_search' as any, { query: (query as string) || '' });
  return { success: true, search_query: query || '' };
};

export const setSearchQueryTool: DistriFnTool = {
  name: 'set_search_query',
  description: 'Set the search filter for records',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query string' },
    },
    required: ['query'],
  },
  handler: async (input: object) =>
    JSON.stringify(await setSearchQueryHandler(input as Record<string, unknown>)),
} as DistriFnTool;
