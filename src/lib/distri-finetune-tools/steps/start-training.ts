/**
 * Start Training Tool
 *
 * Starts the fine-tuning training job using the backend API.
 * Requires dataset to be uploaded to backend first.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import { createFinetuneJobFromUpload } from '@/services/finetune-api';
import type { ToolHandler } from '../types';

export const startTrainingHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, base_model = 'llama-v3-8b-instruct', training_params } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'training') {
      return { success: false, error: `Cannot start training in step ${workflow.currentStep}. Must be in training step.` };
    }

    // Dry run is optional - only block if dry run was attempted and got NO-GO
    // If no dry run was done (skipped), allow training to proceed
    if (workflow.dryRun?.verdict === 'NO-GO') {
      return { success: false, error: 'Dry run failed with NO-GO verdict. Please fix the issues before training, or rollback and skip dry run if you want to proceed anyway.' };
    }

    // Get dataset to check backend ID
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    if (!dataset.backendDatasetId) {
      return { success: false, error: 'Dataset must be uploaded to backend first. Use upload_dataset tool.' };
    }

    const model = typeof base_model === 'string' ? base_model : 'llama-v3-8b-instruct';

    // Create the finetune job via backend API
    const job = await createFinetuneJobFromUpload(
      dataset.backendDatasetId,
      dataset.name,
      {
        baseModel: model,
        displayName: `${dataset.name} Fine-tune`,
      }
    );

    // Update workflow with training job info
    await workflowDB.updateStepData(workflow_id, 'training', {
      jobId: job.provider_job_id,
      baseModel: model,
      status: job.status as 'pending' | 'queued' | 'running' | 'completed' | 'failed',
      startedAt: Date.now(),
      progress: 0,
      metrics: null,
      modelId: job.fine_tuned_model || null,
    });

    return {
      success: true,
      training: {
        job_id: job.provider_job_id,
        internal_id: job.id,
        status: job.status,
        base_model: model,
        fine_tuned_model: job.fine_tuned_model,
        training_config: job.training_config,
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
