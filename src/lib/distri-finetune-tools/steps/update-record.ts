/**
 * Update Record Tool
 *
 * Updates a dataset record (topic assignment, messages, etc.).
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const updateRecordHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, record_id, updates } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!record_id || typeof record_id !== 'string') {
      return { success: false, error: 'record_id is required' };
    }

    if (!updates || typeof updates !== 'object') {
      return { success: false, error: 'updates object is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get existing record
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const record = records.find((r) => r.id === record_id);

    if (!record) {
      return { success: false, error: 'Record not found' };
    }

    // Apply updates
    const updatesObj = updates as Record<string, unknown>;

    // Update topic if provided
    if ('topic' in updatesObj && typeof updatesObj.topic === 'string') {
      await datasetsDB.updateRecordTopic(workflow.datasetId, record_id, updatesObj.topic);
    }

    // Update data if messages provided
    if ('messages' in updatesObj && Array.isArray(updatesObj.messages)) {
      const existingData = record.data as { input?: { messages?: unknown[] }; output?: unknown } | null;
      const newData = {
        ...existingData,
        input: {
          ...existingData?.input,
          messages: updatesObj.messages,
        },
      };
      await datasetsDB.updateRecordData(workflow.datasetId, record_id, newData);
    }

    // Get updated record
    const updatedRecords = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);
    const updatedRecord = updatedRecords.find(r => r.id === record_id);
    const updatedData = updatedRecord?.data as { input?: { messages?: unknown[] } } | null;

    return {
      success: true,
      updated_record: {
        id: record_id,
        topic: updatedRecord?.topic,
        message_count: updatedData?.input?.messages?.length || 0,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update record' };
  }
};

export const updateRecordTool: DistriFnTool = {
  name: 'update_record',
  description: 'Update a dataset record (topic assignment, messages, etc.).',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      record_id: { type: 'string', description: 'The record ID to update' },
      updates: {
        type: 'object',
        description: 'Fields to update: { topic?: string, messages?: Message[] }',
      },
    },
    required: ['workflow_id', 'record_id', 'updates'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await updateRecordHandler(input as Record<string, unknown>)),
} as DistriFnTool;
