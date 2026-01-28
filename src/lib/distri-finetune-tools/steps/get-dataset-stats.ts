/**
 * Get Dataset Stats Tool
 *
 * Gets statistics about the dataset.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const getDatasetStatsHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get records and dataset
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);

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
  description: 'Get statistics about the dataset.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await getDatasetStatsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
