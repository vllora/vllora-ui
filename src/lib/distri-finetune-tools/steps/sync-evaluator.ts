/**
 * Sync Evaluator Tool
 *
 * Syncs the local evaluator config to the backend dataset.
 * This allows updating the grader without re-uploading the entire dataset.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import {
  updateDatasetEvaluator,
  evaluationConfigToBackendEvaluator,
} from '@/services/finetune-api';
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

    // Check if dataset has been uploaded to backend
    if (!dataset.backendDatasetId) {
      return {
        success: false,
        error: 'Dataset must be uploaded to backend first. Use upload_dataset tool.',
      };
    }

    // Check if evaluator config exists locally
    if (!dataset.evaluationConfig) {
      return {
        success: false,
        error: 'No evaluator config found on dataset. Configure grader first.',
      };
    }

    // Convert to backend format and sync
    const backendEvaluator = evaluationConfigToBackendEvaluator(dataset.evaluationConfig);

    await updateDatasetEvaluator(dataset.backendDatasetId, backendEvaluator);

    return {
      success: true,
      backend_dataset_id: dataset.backendDatasetId,
      evaluator_type: dataset.evaluationConfig.type,
      message: 'Evaluator config synced to backend. Ready for dry run.',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to sync evaluator' };
  }
};

export const syncEvaluatorTool: DistriFnTool = {
  name: 'sync_evaluator',
  description: 'Sync the local evaluator config to the backend dataset. Use this after configuring or updating the grader to sync it without re-uploading the entire dataset.',
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
