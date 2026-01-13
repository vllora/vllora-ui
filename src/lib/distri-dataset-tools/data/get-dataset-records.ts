import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { DatasetRecord } from '@/types/dataset-types';
import {
  filterAndSortRecords,
  type SortField,
  type SortDirection,
} from '@/components/datasets/record-filters';
import { getLabel } from '@/components/datasets/record-utils';

export const getDatasetRecordsHandler: ToolHandler = async ({
  dataset_id,
  ids_only,
  search,
  topic,
  sort_by,
  sort_direction,
  limit,
}) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }

  try {
    const allRecords = await datasetsDB.getRecordsByDatasetId(dataset_id as string);

    // Use shared filtering and sorting logic (same as UI)
    let records = filterAndSortRecords(
      allRecords,
      {
        search: search as string | undefined,
        topic: topic as string | undefined,
      },
      {
        field: (sort_by as SortField) || 'timestamp',
        direction: (sort_direction as SortDirection) || 'desc',
      }
    );

    // Apply limit
    if (limit && typeof limit === 'number' && limit > 0) {
      records = records.slice(0, limit);
    }

    // Return IDs only if requested
    if (ids_only === true) {
      return {
        success: true,
        record_ids: records.map(r => r.id),
        count: records.length,
      };
    }

    // Return full records with summary info
    const recordSummaries = records.map(r => ({
      id: r.id,
      topic: r.topic,
      label: getLabel(r),
      has_evaluation: !!r.evaluation,
      evaluation_score: r.evaluation?.score,
      created_at: r.createdAt,
      // Include a preview of the data (first message or truncated)
      data_preview: getDataPreview(r),
    }));

    return {
      success: true,
      records: recordSummaries,
      count: records.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get records',
    };
  }
};

// Helper to get a short preview of record data
function getDataPreview(record: DatasetRecord): string {
  try {
    const data = record.data as { input?: { messages?: Array<{ content?: string }> } };
    const firstMessage = data?.input?.messages?.[0];
    if (firstMessage?.content) {
      const content = typeof firstMessage.content === 'string'
        ? firstMessage.content
        : JSON.stringify(firstMessage.content);
      return content.length > 100 ? content.slice(0, 100) + '...' : content;
    }
    return '[No preview available]';
  } catch {
    return '[No preview available]';
  }
}

export const getDatasetRecordsTool: DistriFnTool = {
  name: 'get_dataset_records',
  description: 'Get records for a specific dataset with optional filtering and sorting. Use ids_only=true to get just record IDs for use with select_records.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      ids_only: {
        type: 'boolean',
        description: 'If true, returns only record IDs (useful for selecting records). Default: false',
      },
      search: {
        type: 'string',
        description: 'Search query to filter records by label, topic, or span ID',
      },
      topic: {
        type: 'string',
        description: 'Filter records by exact topic match',
      },
      sort_by: {
        type: 'string',
        enum: ['timestamp', 'topic', 'evaluation'],
        description: 'Field to sort by. Default: timestamp',
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction. Default: desc',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return',
      },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await getDatasetRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
