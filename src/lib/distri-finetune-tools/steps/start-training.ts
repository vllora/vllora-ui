/**
 * Start Training Tool
 *
 * Starts the fine-tuning training job.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import type { ToolHandler } from '../types';

export const startTrainingHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, base_model = 'gpt-4o-mini', training_params } = params;

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

    if (!workflow.dryRun || workflow.dryRun.verdict === 'NO-GO') {
      return { success: false, error: 'Dry run must pass before starting training' };
    }

    // TODO: Actually start training via API
    // For now, return mock job
    const jobId = `ft-job-${Date.now()}`;
    const model = typeof base_model === 'string' ? base_model : 'gpt-4o-mini';

    // Update workflow
    await workflowDB.updateStepData(workflow_id, 'training', {
      jobId,
      baseModel: model,
      status: 'queued',
      startedAt: Date.now(),
      progress: 0,
      metrics: null,
      modelId: null,
    });

    return {
      success: true,
      training: {
        job_id: jobId,
        status: 'queued',
        base_model: model,
        estimated_duration: '30-60 minutes',
        training_params: training_params || {},
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start training' };
  }
};

export const startTrainingTool: DistriFnTool = {
  name: 'start_training',
  description: 'Start the fine-tuning training job.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      base_model: { type: 'string', default: 'gpt-4o-mini', description: 'Base model to fine-tune' },
      training_params: { type: 'object', description: 'Optional training parameters' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await startTrainingHandler(input as Record<string, unknown>)),
} as DistriFnTool;
