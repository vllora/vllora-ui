/**
 * Get Dataset Records Tool
 *
 * Gets dataset records with optional filtering and pagination.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const getDatasetRecordsHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, limit = 100, offset = 0, topic_filter } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get records
    let records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);

    // Apply topic filter if provided
    if (topic_filter && typeof topic_filter === 'string') {
      records = records.filter((r) => r.topic === topic_filter);
    }

    // Apply pagination
    const lim = typeof limit === 'number' ? limit : 100;
    const off = typeof offset === 'number' ? offset : 0;
    const paginatedRecords = records.slice(off, off + lim);

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
      limit: lim,
      offset: off,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get records' };
  }
};

export const getDatasetRecordsTool: DistriFnTool = {
  name: 'get_dataset_records',
  description: 'Get dataset records with optional filtering and pagination.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      limit: { type: 'number', default: 100, description: 'Maximum records to return' },
      offset: { type: 'number', default: 0, description: 'Offset for pagination' },
      topic_filter: { type: 'string', description: 'Filter by topic' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await getDatasetRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
