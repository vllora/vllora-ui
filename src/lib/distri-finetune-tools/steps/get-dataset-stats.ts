/**
 * Get Dataset Stats Tool
 *
 * Gets statistics about the dataset.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const getDatasetStatsHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id } = params;

    if (!dataset_id || typeof dataset_id !== 'string') {
      return { success: false, error: 'dataset_id is required' };
    }

    // Get records and dataset
    const records = await datasetsDB.getRecordsByDatasetId(dataset_id);
    const dataset = await datasetsDB.getDatasetById(dataset_id);

    // Calculate stats
    const byTopic: Record<string, number> = {};
    let generatedCount = 0;
    let totalMessages = 0;

    for (const record of records) {
      const topic = record.topic || '__uncategorized__';
      byTopic[topic] = (byTopic[topic] || 0) + 1;
      if (record.is_generated) generatedCount++;
      const data = record.data as { input?: { messages?: unknown[] } } | null;
      totalMessages += data?.input?.messages?.length || 0;
    }

    return {
      success: true,
      stats: {
        total_records: records.length,
        generated_records: generatedCount,
        original_records: records.length - generatedCount,
        total_messages: totalMessages,
        average_messages_per_record: records.length > 0 ? totalMessages / records.length : 0,
        topic_distribution: byTopic,
        topic_count: Object.keys(byTopic).length,
        has_topic_hierarchy: !!dataset?.topicHierarchy,
        has_evaluation_config: !!dataset?.evaluationConfig,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get stats' };
  }
};

export const getDatasetStatsTool: DistriFnTool = {
  name: 'get_dataset_stats',
  description: 'Get statistics about the dataset including record counts, topic distribution, and message stats.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
    },
    required: ['dataset_id'],
  },
  handler: async (input) => JSON.stringify(await getDatasetStatsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
