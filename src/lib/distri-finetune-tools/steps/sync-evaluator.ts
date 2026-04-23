/**
 * Sync Evaluator Tool
 *
 * Validates that the evaluator is configured. The gateway auto-uploads
 * the dataset (including eval script) to cloud before creating evaluations.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, datasetService } from '@/services/service-registry';
import type { ToolHandler } from '../types';

export const syncEvaluatorHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get dataset
    const dataset = await datasetService.getById(workflow.workflowId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    // Check if eval script exists
    if (!dataset.evalScript) {
      return {
        success: false,
        error: 'No eval script found on dataset. Configure grader first.',
      };
    }

    return {
      success: true,
      backend_workflow_id: workflow.workflowId,
      evaluator_type: 'js',
      message: 'Eval script configured. Ready for evaluation.',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check evaluator status' };
  }
};

export const syncEvaluatorTool: DistriFnTool = {
  name: 'sync_evaluator',
  description: 'Check evaluator configuration and upload dataset if needed. Automatically uploads dataset to backend if not already uploaded.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await syncEvaluatorHandler(input as Record<string, unknown>)),
} as DistriFnTool;
