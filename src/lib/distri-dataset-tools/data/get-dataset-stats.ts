import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler, DatasetStats } from '../types';

export const getDatasetStatsHandler: ToolHandler = async ({ dataset_id }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  try {
    const datasets = await datasetsDB.getAllDatasets();
    const dataset = datasets.find((d) => d.id === dataset_id);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    const records = await datasetsDB.getRecordsByDatasetId(dataset_id as string);

    // Calculate stats
    const fromSpans = records.filter((r) => r.spanId).length;
    const topics: Record<string, number> = {};
    let evaluatedCount = 0;

    records.forEach((r) => {
      if (r.topic) {
        topics[r.topic] = (topics[r.topic] || 0) + 1;
      }
      if (r.evaluation?.score !== undefined) {
        evaluatedCount++;
      }
    });

    const stats: DatasetStats = {
      dataset_id: dataset.id,
      dataset_name: dataset.name,
      record_count: records.length,
      from_spans_count: fromSpans,
      manual_count: records.length - fromSpans,
      topic_count: Object.keys(topics).length,
      topics,
      evaluated_count: evaluatedCount,
      created_at: dataset.createdAt,
      updated_at: dataset.updatedAt,
    };

    return { success: true, stats };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dataset stats',
    };
  }
};

export const getDatasetStatsTool: DistriFnTool = {
  name: 'get_dataset_stats',
  description: 'Get statistics for a dataset (record count, topics, evaluations, etc.)',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await getDatasetStatsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
