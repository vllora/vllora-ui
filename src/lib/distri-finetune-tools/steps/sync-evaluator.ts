/**
 * Sync Evaluator Tool
 *
 * Validates that the evaluator is configured and uploads dataset if needed.
 * Note: The backend API doesn't support updating evaluators separately.
 * The eval script is included during dataset upload - to change it, use
 * upload_dataset with force_reupload=true.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import { ensureDatasetUploaded } from '@/services/finetune-api';
import type { ToolHandler } from '../types';

export const syncEvaluatorHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get dataset
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    // Check if eval script exists locally
    if (!dataset.evalScript) {
      return {
        success: false,
        error: 'No eval script found on dataset. Configure grader first.',
      };
    }

    // Ensure dataset is uploaded (auto-uploads if needed)
    const backendDatasetId = await ensureDatasetUploaded(workflow.datasetId);

    // Dataset is uploaded and has eval script - ready for dry run
    return {
      success: true,
      backend_dataset_id: backendDatasetId,
      evaluator_type: 'js',
      message: 'Eval script configured and dataset uploaded. Ready for dry run. Note: If eval script changed, use upload_dataset with force_reupload=true.',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check evaluator status' };
  }
};

export const syncEvaluatorTool: DistriFnTool = {
  name: 'sync_evaluator',
  description: 'Check evaluator configuration and upload dataset if needed. Automatically uploads dataset to backend if not already uploaded. Note: To update the eval script on backend, use upload_dataset with force_reupload=true.',
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
