/**
 * Run Evaluation Tool
 *
 * Starts an evaluation on a sample of the dataset.
 * The evaluation runs in the background - use get_evaluation_status to check progress.
 * Uses the shared eval polling manager for consistent behavior with the UI.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, recordService } from '@/services/service-registry';
import { evalPollingManager } from '@/services/eval-polling-manager';
import type { ToolHandler } from '../types';

export const runEvaluationHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, sample_percentage = 100, rollout_model = 'gpt-4o-mini' } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }
    // Get records to calculate sample size
    const records = await recordService.getByDatasetId(workflow.workflowId);
    const pct = typeof sample_percentage === 'number' ? sample_percentage : 100;
    const sampleSize = Math.max(1, Math.floor(records.length * (pct / 100)));

    // Start evaluation using high-level API (handles auto-upload and validation)
    const model = typeof rollout_model === 'string' ? rollout_model : 'gpt-4o-mini';
    const jobId = await evalPollingManager.startEvalForDataset({
      workflowId: workflow.workflowId,
      sampleSize,
      rolloutModel: model,
    });

    return {
      success: true,
      message: 'Evaluation started in background',
      dry_run_job_id: jobId,
      sample_size: sampleSize,
      sample_percentage: pct,
      status: 'running',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start evaluation' };
  }
};

export const runEvaluationTool: DistriFnTool = {
  name: 'run_evaluation',
  description: 'Start an evaluation on a sample of the dataset. The evaluation runs in the background - use get_dry_run_status to check progress and results. Automatically uploads dataset to backend if not already uploaded.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      sample_percentage: { type: 'number', default: 100, description: 'Percentage of records to test (1-100)' },
      rollout_model: { type: 'string', default: 'gpt-4o-mini', description: 'Model to use for generating responses to be evaluated. Options: gpt-4o-mini, gpt-4o, gpt-4.1, gpt-4.1-mini' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await runEvaluationHandler(input as Record<string, unknown>)),
} as DistriFnTool;
