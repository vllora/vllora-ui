/**
 * Sync Evaluator Tool
 *
 * Validates that the evaluator is configured and dataset is ready.
 * Note: The backend API doesn't support updating evaluators separately.
 * The eval script is included during dataset upload - to change it, use
 * upload_dataset with force_reupload=true.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
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

    // Check if dataset has been uploaded to backend
    if (!dataset.backendDatasetId) {
      return {
        success: true,
        needs_upload: true,
        evaluator_type: 'js',
        message: 'Eval script configured. Dataset needs to be uploaded to backend. Use upload_dataset tool.',
      };
    }

    // Dataset is uploaded and has eval script - ready for dry run
    // Note: We can't update the eval script separately. If it changed since upload,
    // user needs to re-upload with force_reupload=true
    return {
      success: true,
      backend_dataset_id: dataset.backendDatasetId,
      evaluator_type: 'js',
      message: 'Eval script configured and dataset uploaded. Ready for dry run. Note: If eval script changed, use upload_dataset with force_reupload=true.',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check evaluator status' };
  }
};

export const syncEvaluatorTool: DistriFnTool = {
  name: 'sync_evaluator',
  description: 'Check evaluator configuration status. Note: To update the eval script on backend, use upload_dataset with force_reupload=true.',
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
