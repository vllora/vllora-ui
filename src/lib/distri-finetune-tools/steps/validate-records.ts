/**
 * Validate Records Tool
 *
 * Validates dataset records for training readiness.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

export const validateRecordsHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get records
    const records = await datasetsDB.getRecordsByDatasetId(workflow.datasetId);

    // Validation checks
    const issues: Array<{ record_id: string; field: string; issue: string }> = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const record of records) {
      const recordIssues: string[] = [];

      // Extract messages from record.data (DataInfo structure)
      const data = record.data as { input?: { messages?: unknown[] }; output?: { messages?: unknown[] | unknown } } | null;
      const inputMessages = data?.input?.messages;
      const outputMessages = data?.output?.messages;

      // Check for empty input messages
      if (!inputMessages || !Array.isArray(inputMessages) || inputMessages.length === 0) {
        recordIssues.push('No input messages');
      } else {
        // Check message structure
        for (let i = 0; i < inputMessages.length; i++) {
          const msg = inputMessages[i] as { role?: string; content?: string; tool_calls?: unknown[] } | null;
          if (!msg?.role) {
            recordIssues.push(`Input message ${i}: missing role`);
          }
          if (!msg?.content && !msg?.tool_calls) {
            recordIssues.push(`Input message ${i}: missing content`);
          }
        }
      }

      // Check output messages exist
      if (!outputMessages) {
        recordIssues.push('No output messages');
      }

      if (recordIssues.length > 0) {
        invalidCount++;
        for (const issue of recordIssues) {
          issues.push({ record_id: record.id, field: 'data', issue });
        }
      } else {
        validCount++;
      }
    }

    return {
      success: true,
      validation: {
        total_records: records.length,
        valid_count: validCount,
        invalid_count: invalidCount,
        issues: issues.slice(0, 100), // Limit to first 100 issues
        is_valid: invalidCount === 0,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to validate records' };
  }
};

export const validateRecordsTool: DistriFnTool = {
  name: 'validate_records',
  description: 'Validate dataset records for training readiness.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await validateRecordsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
