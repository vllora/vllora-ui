/**
 * Get Dataset Records Tool
 *
 * Gets dataset records with optional filtering and pagination.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const getDatasetRecordsHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id, limit = 100, offset = 0, topic_filter } = params;

    if (!dataset_id || typeof dataset_id !== 'string') {
      return { success: false, error: 'dataset_id is required' };
    }

    // Get records
    let records = await datasetsDB.getRecordsByDatasetId(dataset_id);

    // Apply topic filter if provided
    if (topic_filter && typeof topic_filter === 'string') {
      records = records.filter((r) => r.topic === topic_filter);
    }

    // Apply pagination
    const lim = typeof limit === 'number' ? limit : 100;
    const off = typeof offset === 'number' ? offset : 0;
    const paginatedRecords = records.slice(off, off + lim);

    const hasMore = off + lim < records.length;

    return {
      success: true,
      records: paginatedRecords.map((r) => {
        const data = r.data as { input?: { messages?: Array<{ content?: string }> } } | null;
        const inputMessages = data?.input?.messages;
        return {
          id: r.id,
          topic: r.topic,
          is_generated: r.is_generated || false,
          message_count: inputMessages?.length || 0,
          preview: inputMessages?.[0]?.content?.slice(0, 100) || '',
        };
      }),
      total: records.length,
      returned: paginatedRecords.length,
      limit: lim,
      offset: off,
      has_more: hasMore,
      // Hint to agent: use get_dataset_stats for counts, this is just for sampling content
      note: hasMore ? `Showing ${paginatedRecords.length} of ${records.length} records. Use get_dataset_stats for full counts - do NOT paginate through all records.` : undefined,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get records' };
  }
};

export const getDatasetRecordsTool: DistriFnTool = {
  name: 'get_dataset_records',
  description: 'Get sample records to preview content. Use limit=10-20 for representative samples. Do NOT paginate through all records - use get_dataset_stats for counts.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      limit: { type: 'number', default: 100, description: 'Maximum records to return' },
      offset: { type: 'number', default: 0, description: 'Offset for pagination' },
      topic_filter: { type: 'string', description: 'Filter by topic' },
    },
    required: ['dataset_id'],
  },
  handler: async (input) => JSON.stringify(await getDatasetRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
