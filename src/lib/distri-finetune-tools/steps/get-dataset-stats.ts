/**
 * Get Dataset Stats Tool
 *
 * Gets statistics about the dataset and optionally persists them.
 * Includes sanitization/validation results.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import type { DatasetStats, SanitizationStats, DatasetRecord } from '@/types/dataset-types';
import { sanitizeRecords, DEFAULT_VALIDATION_CONFIG } from '@/components/datasets/sanitization-utils';

/**
 * Run sanitization on records and return stats.
 */
async function computeSanitizationStats(records: DatasetRecord[]): Promise<SanitizationStats> {
  if (records.length === 0) {
    return {
      validRecords: 0,
      invalidRecords: 0,
      duplicateRecords: 0,
      validationRate: 0,
      errorsByType: {},
      recommendations: [],
    };
  }

  const result = await sanitizeRecords(records, DEFAULT_VALIDATION_CONFIG);

  return {
    validRecords: result.report.valid,
    invalidRecords: result.report.rejected,
    duplicateRecords: result.report.duplicatesRemoved,
    validationRate: result.report.valid / result.report.total,
    errorsByType: result.report.errorsByType as Record<string, number>,
    recommendations: result.report.recommendations,
  };
}

/**
 * Compute dataset statistics from records and dataset.
 * Separated for reuse by other tools/components.
 */
export async function computeDatasetStats(
  records: DatasetRecord[],
  dataset: { topicHierarchy?: unknown; evaluationConfig?: unknown } | null
): Promise<DatasetStats> {
  const byTopic: Record<string, number> = {};
  let generatedCount = 0;
  let totalMessages = 0;
  let uncategorizedCount = 0;

  for (const record of records) {
    const topic = record.topic;
    if (topic) {
      byTopic[topic] = (byTopic[topic] || 0) + 1;
    } else {
      uncategorizedCount++;
    }
    if (record.is_generated) generatedCount++;
    const data = record.data as { input?: { messages?: unknown[] } } | null;
    totalMessages += data?.input?.messages?.length || 0;
  }

  // Run sanitization
  const sanitization = await computeSanitizationStats(records);

  return {
    totalRecords: records.length,
    generatedRecords: generatedCount,
    originalRecords: records.length - generatedCount,
    totalMessages,
    averageMessagesPerRecord: records.length > 0 ? Math.round((totalMessages / records.length) * 100) / 100 : 0,
    topicDistribution: byTopic,
    topicCount: Object.keys(byTopic).length,
    uncategorizedCount,
    hasTopicHierarchy: !!dataset?.topicHierarchy,
    hasEvaluationConfig: !!dataset?.evaluationConfig,
    sanitization,
    lastCalculatedAt: Date.now(),
  };
}

/**
 * Convert DatasetStats to snake_case for agent consumption.
 */
function toSnakeCaseStats(stats: DatasetStats) {
  return {
    total_records: stats.totalRecords,
    generated_records: stats.generatedRecords,
    original_records: stats.originalRecords,
    total_messages: stats.totalMessages,
    average_messages_per_record: stats.averageMessagesPerRecord,
    topic_distribution: stats.topicDistribution,
    topic_count: stats.topicCount,
    uncategorized_count: stats.uncategorizedCount,
    has_topic_hierarchy: stats.hasTopicHierarchy,
    has_evaluation_config: stats.hasEvaluationConfig,
    sanitization: stats.sanitization ? {
      valid_records: stats.sanitization.validRecords,
      invalid_records: stats.sanitization.invalidRecords,
      duplicate_records: stats.sanitization.duplicateRecords,
      validation_rate: stats.sanitization.validationRate,
      errors_by_type: stats.sanitization.errorsByType,
      recommendations: stats.sanitization.recommendations,
    } : undefined,
  };
}

export const getDatasetStatsHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id, persist = true } = params;

    if (!dataset_id || typeof dataset_id !== 'string') {
      return { success: false, error: 'dataset_id is required' };
    }

    // Get records and dataset
    const records = await datasetsDB.getRecordsByDatasetId(dataset_id);
    const dataset = await datasetsDB.getDatasetById(dataset_id);

    // Compute stats (includes sanitization)
    const stats = await computeDatasetStats(records, dataset);

    // Persist stats to dataset if requested (default: true)
    if (persist && dataset) {
      await datasetsDB.updateDatasetStats(dataset_id, stats);
    }

    return {
      success: true,
      stats: toSnakeCaseStats(stats),
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
