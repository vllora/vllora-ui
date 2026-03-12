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
import { workflowService } from '@/services/service-registry';
import { quickFinetune } from '@/services/quick-finetune';
import type { ToolHandler } from '../types';
import { toast } from 'sonner';

interface TrainingParams {
  // Training config
  learning_rate?: number;
  epochs?: number;
  batch_size?: number;
  lora_rank?: number;
  max_context_length?: number;
  gradient_accumulation_steps?: number;
  learning_rate_warmup_steps?: number;
  batch_size_samples?: number;
  // Inference parameters
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  response_candidates_count?: number;
}

export const startTrainingHandler: ToolHandler = async (params) => {
  try {
    const {
      workflow_id,
      base_model = 'unsloth/Qwen3.5-4B',
      chunk_size,
      node_count,
      training_params,
    } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    // Parse top-level params with type coercion
    const model = typeof base_model === 'string' ? base_model : 'unsloth/Qwen3.5-4B';
    const chunkSize = typeof chunk_size === 'number' ? chunk_size : undefined;
    const nodeCount = typeof node_count === 'number' ? node_count : undefined;

    // Get workflow to find the dataset ID
    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Switch to Jobs tab immediately so user can see the training progress
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('finetune-set-view-mode', {
          detail: { section: 'jobs' },
        })
      );
    }

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
      ...(tp.batch_size_samples !== undefined && { batch_size_samples: tp.batch_size_samples }),
    };
    const inferenceParameters = {
      ...(tp.max_output_tokens !== undefined && { max_output_tokens: tp.max_output_tokens }),
      ...(tp.temperature !== undefined && { temperature: tp.temperature }),
      ...(tp.top_p !== undefined && { top_p: tp.top_p }),
      ...(tp.top_k !== undefined && { top_k: tp.top_k }),
      ...(tp.response_candidates_count !== undefined && { response_candidates_count: tp.response_candidates_count }),
    };

    // Use quickFinetune which handles everything:
    // - Workflow creation/management
    // - Dataset upload if needed
    // - Duplicate job prevention
    // - Training job creation
    const result = await quickFinetune({
      workflowId: workflow.workflowId,
      baseModel: model,
      trainingConfig: Object.keys(trainingConfig).length > 0 ? trainingConfig : undefined,
      inferenceParameters: Object.keys(inferenceParameters).length > 0 ? inferenceParameters : undefined,
      chunkSize,
      nodeCount,
    });


    if (!result.success) {
      toast.error(result.error || "Failed to start finetune job");
      return { success: false, error: result.error };
    }

    toast.success(`Finetune job started! Job ID: ${result.jobId}`);
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
  description: 'Start the fine-tuning training job. Automatically uploads dataset to backend if not already uploaded.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      base_model: { type: 'string', default: 'unsloth/Qwen3.5-4B', description: 'Base model to fine-tune' },
      chunk_size: { type: 'number', description: 'Chunk size for training data processing' },
      node_count: { type: 'number', description: 'Number of nodes for distributed training' },
      training_params: {
        type: 'object',
        description: 'Advanced training and inference parameters (optional)',
        properties: {
          // Training config
          learning_rate: { type: 'number', description: 'Learning rate (default: 0.00001)' },
          epochs: { type: 'number', description: 'Number of epochs (default: 3)' },
          batch_size: { type: 'number', description: 'Batch size (default: 10)' },
          batch_size_samples: { type: 'number', description: 'Batch size in samples' },
          lora_rank: { type: 'number', description: 'LoRA rank (default: 8)' },
          max_context_length: { type: 'number', description: 'Max context length for training' },
          gradient_accumulation_steps: { type: 'number', description: 'Gradient accumulation steps (default: 40)' },
          learning_rate_warmup_steps: { type: 'number', description: 'Learning rate warmup steps' },
          // Inference parameters
          max_output_tokens: { type: 'number', description: 'Max output tokens during training rollouts (default: 1000)' },
          temperature: { type: 'number', description: 'Temperature for rollouts (default: 0.7)' },
          top_p: { type: 'number', description: 'Top-p sampling (default: 0.9)' },
          top_k: { type: 'number', description: 'Top-k sampling' },
          response_candidates_count: { type: 'number', description: 'Number of response candidates per prompt (default: 2)' },
        },
      },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await startTrainingHandler(input as Record<string, unknown>)),
} as DistriFnTool;
