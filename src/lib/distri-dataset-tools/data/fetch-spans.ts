import { DistriFnTool } from '@distri/core';
import { listSpans, type ListSpansQuery } from '@/services/spans-api';
import type { ToolHandler } from '../types';
import { getCurrentProjectId } from './helpers';

export const fetchSpansHandler: ToolHandler = async ({ filters, limit }) => {
  try {
    const projectId = await getCurrentProjectId();
    const query: ListSpansQuery = {};

    if (filters && typeof filters === 'object') {
      const f = filters as Record<string, unknown>;
      if (f.threadIds) query.threadIds = Array.isArray(f.threadIds) ? f.threadIds.join(',') : f.threadIds as string;
      if (f.runIds) query.runIds = Array.isArray(f.runIds) ? f.runIds.join(',') : f.runIds as string;
      if (f.labels) query.labels = Array.isArray(f.labels) ? f.labels.join(',') : f.labels as string;
      if (f.operationNames) query.operationNames = Array.isArray(f.operationNames) ? f.operationNames.join(',') : f.operationNames as string;
    }

    query.limit = (limit as number) || 50;

    const result = await listSpans({ projectId, params: query });
    return {
      success: true,
      spans: result.data,
      count: result.data.length,
      total: result.pagination?.total,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch spans',
    };
  }
};

export const fetchSpansTool: DistriFnTool = {
  name: 'fetch_spans',
  description: 'Fetch spans from traces with optional filtering',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      filters: {
        type: 'object',
        description: 'Filter options: threadIds, runIds, labels, operationNames',
        properties: {
          threadIds: { type: 'array', items: { type: 'string' } },
          runIds: { type: 'array', items: { type: 'string' } },
          labels: { type: 'array', items: { type: 'string' } },
          operationNames: { type: 'array', items: { type: 'string' } },
        },
      },
      limit: { type: 'number', description: 'Maximum spans to fetch (default: 50)' },
    },
  },
  handler: async (input: object) =>
    JSON.stringify(await fetchSpansHandler(input as Record<string, unknown>)),
} as DistriFnTool;
