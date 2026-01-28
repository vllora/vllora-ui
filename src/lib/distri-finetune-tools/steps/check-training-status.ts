/**
 * Check Training Status Tool
 *
 * Checks the status of the ongoing training job.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import type { ToolHandler } from '../types';

export const checkTrainingStatusHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (!workflow.training?.jobId) {
      return { success: false, error: 'No training job found' };
    }

    // TODO: Actually check training status via API
    // Mock status progression
    const elapsed = Date.now() - (workflow.training.startedAt || Date.now());
    let status: 'queued' | 'running' | 'completed' | 'failed' = 'running';
    let progress = Math.min(100, Math.floor(elapsed / 1000 / 60 * 3)); // ~3% per minute

    if (progress >= 100) {
      status = 'completed';
      progress = 100;
    }

    return {
      success: true,
      training_status: {
        job_id: workflow.training.jobId,
        status,
        progress,
        base_model: workflow.training.baseModel,
        started_at: workflow.training.startedAt,
        estimated_completion: status === 'completed' ? null : Date.now() + (100 - progress) * 20000,
        fine_tuned_model: status === 'completed' ? `ft:${workflow.training.baseModel}:${workflow.training.jobId}` : null,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check training status' };
  }
};

export const checkTrainingStatusTool: DistriFnTool = {
  name: 'check_training_status',
  description: 'Check the status of the ongoing training job.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await checkTrainingStatusHandler(input as Record<string, unknown>)),
} as DistriFnTool;
