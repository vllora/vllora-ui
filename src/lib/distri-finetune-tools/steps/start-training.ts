/**
 * Start Training Tool
 *
 * Starts the fine-tuning training job using the backend API.
 * Uses quickFinetune which handles all prerequisites automatically:
 * - Creates/gets workflow
 * - Uploads dataset if needed
 * - Checks for duplicate running jobs
 * - Creates the training job
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import { quickFinetune } from '@/services/quick-finetune';
import type { ToolHandler } from '../types';

export const startTrainingHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, base_model = 'llama-v3-8b-instruct', training_params } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    // Get workflow to find the dataset ID
    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const model = typeof base_model === 'string' ? base_model : 'llama-v3-8b-instruct';

    // Use quickFinetune which handles everything:
    // - Workflow creation/management
    // - Dataset upload if needed
    // - Duplicate job prevention
    // - Training job creation
    const result = await quickFinetune({
      datasetId: workflow.datasetId,
      baseModel: model,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      training: {
        job_id: result.jobId,
        status: result.status,
        base_model: model,
        workflow_id: result.workflowId,
        training_params: training_params || {},
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start training' };
  }
};

export const startTrainingTool: DistriFnTool = {
  name: 'start_training',
  description: 'Start the fine-tuning training job. Requires dataset to be uploaded to backend first.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      base_model: { type: 'string', default: 'llama-v3-8b-instruct', description: 'Base model to fine-tune' },
      training_params: { type: 'object', description: 'Optional training parameters' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await startTrainingHandler(input as Record<string, unknown>)),
} as DistriFnTool;
