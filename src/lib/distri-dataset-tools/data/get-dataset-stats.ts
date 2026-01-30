import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { getDryRunAnalytics } from '@/services/finetune-api';
import type { ToolHandler, DatasetStats } from '../types';

export const getDatasetStatsHandler: ToolHandler = async ({ dataset_id, include_server_analytics_info: _includeServerAnalyticsInfo }) => {
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

    // Optionally fetch server analytics if requested
    if (records.length > 0) {
      try {
        // Convert records to the format expected by the analytics API
        const rows = records.map((r) => r.data);
        const analyticsResponse = await getDryRunAnalytics(rows);
        stats.server_analytics = {
          analytics: analyticsResponse.analytics,
          quality: analyticsResponse.quality,
        };
      } catch (analyticsError) {
        // Include partial result with error info - don't fail the whole request
        stats.server_analytics = {
          analytics: {},
          quality: {},
        };
        return {
          success: true,
          stats,
          analytics_warning: analyticsError instanceof Error
            ? analyticsError.message
            : 'Failed to fetch server analytics',
        };
      }
    }

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
  description: 'Get statistics for a dataset (record count, topics, evaluations, etc.). Optionally includes server-side analytics with quality metrics and data distribution analysis.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      include_server_analytics_info: {
        type: 'boolean',
        description:
          'When true, sends dataset rows to the server analytics API to compute additional quality metrics (data distributions, quality scores, anomaly detection). This makes an API call and may take longer for large datasets. Use this when you need detailed analytics beyond basic counts. Default: false',
      },
    },
    required: ['dataset_id'],
  },
  handler: async (input: object) =>
    JSON.stringify(await getDatasetStatsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
