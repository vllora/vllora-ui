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

interface TrainingParams {
  learning_rate?: number;
  epochs?: number;
  batch_size?: number;
  lora_rank?: number;
  max_context_length?: number;
  gradient_accumulation_steps?: number;
  learning_rate_warmup_steps?: number;
  // Inference parameters
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

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

    // Parse training params if provided
    const tp = (training_params || {}) as TrainingParams;
    const trainingConfig = {
      ...(tp.learning_rate !== undefined && { learning_rate: tp.learning_rate }),
      ...(tp.epochs !== undefined && { epochs: tp.epochs }),
      ...(tp.batch_size !== undefined && { batch_size: tp.batch_size }),
      ...(tp.lora_rank !== undefined && { lora_rank: tp.lora_rank }),
      ...(tp.max_context_length !== undefined && { max_context_length: tp.max_context_length }),
      ...(tp.gradient_accumulation_steps !== undefined && { gradient_accumulation_steps: tp.gradient_accumulation_steps }),
      ...(tp.learning_rate_warmup_steps !== undefined && { learning_rate_warmup_steps: tp.learning_rate_warmup_steps }),
    };
    const inferenceParameters = {
      ...(tp.max_output_tokens !== undefined && { max_output_tokens: tp.max_output_tokens }),
      ...(tp.temperature !== undefined && { temperature: tp.temperature }),
      ...(tp.top_p !== undefined && { top_p: tp.top_p }),
      ...(tp.top_k !== undefined && { top_k: tp.top_k }),
    };

    // Use quickFinetune which handles everything:
    // - Workflow creation/management
    // - Dataset upload if needed
    // - Duplicate job prevention
    // - Training job creation
    const result = await quickFinetune({
      datasetId: workflow.datasetId,
      baseModel: model,
      trainingConfig: Object.keys(trainingConfig).length > 0 ? trainingConfig : undefined,
      inferenceParameters: Object.keys(inferenceParameters).length > 0 ? inferenceParameters : undefined,
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
        training_params: tp,
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
      training_params: {
        type: 'object',
        description: 'Optional training parameters',
        properties: {
          learning_rate: { type: 'number', description: 'Learning rate (default: 0.0001)' },
          epochs: { type: 'number', description: 'Number of epochs (default: 2.0)' },
          batch_size: { type: 'number', description: 'Batch size (default: 65536)' },
          lora_rank: { type: 'number', description: 'LoRA rank (default: 16)' },
          max_context_length: { type: 'number', description: 'Max context length' },
          max_output_tokens: { type: 'number', description: 'Max output tokens (default: 2048)' },
          temperature: { type: 'number', description: 'Temperature (default: 0.7)' },
        },
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await startTrainingHandler(input as Record<string, unknown>)),
} as DistriFnTool;
