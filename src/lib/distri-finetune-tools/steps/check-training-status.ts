/**
 * Check Training Status Tool
 *
 * Checks the status of the ongoing training job via backend API.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService } from '@/services/service-registry';
import { getFinetuneJobStatus } from '@/services/finetune-api';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';

export const checkTrainingStatusHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Switch to Jobs tab so user can see the training status
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('finetune-set-view-mode', {
          detail: { section: 'jobs' },
        })
      );
    }

    if (!workflow.training?.jobId) {
      return { success: false, error: 'No training job found' };
    }

    // Get actual job status from backend API (source of truth)
    const job = await getFinetuneJobStatus(workflow.workflowId, workflow.training.jobId);

    // Map backend status to workflow status
    const statusMap: Record<string, 'pending' | 'queued' | 'running' | 'completed' | 'failed'> = {
      pending: 'pending',
      running: 'running',
      succeeded: 'completed',
      failed: 'failed',
      cancelled: 'failed',
    };
    const workflowStatus = statusMap[job.status] || 'running';

    // Update workflow with latest job info (modelId when completed, status changes)
    const needsUpdate =
      workflow.training.status !== workflowStatus ||
      (job.fine_tuned_model && workflow.training.modelId !== job.fine_tuned_model);

    if (needsUpdate) {
      await workflowService.updateStepData(workflow_id, 'training', {
        ...workflow.training,
        status: workflowStatus,
        modelId: job.fine_tuned_model || workflow.training.modelId,
      });

      // Emit completion event so LucySidebar auto-triggers training analysis.
      // FinetuneJobsContext only emits this via SSE, which the mock server lacks.
      const wasActive = workflow.training.status === 'running' || workflow.training.status === 'pending' || workflow.training.status === 'queued';
      const isTerminal = workflowStatus === 'completed' || workflowStatus === 'failed';
      if (wasActive && isTerminal && workflow.workflowId) {
        emitter.emit('vllora_finetune_job_completed', {
          jobId: workflow.training.jobId,
          workflowId: workflow.workflowId,
        });
      }
    }

    return {
      success: true,
      training_status: {
        job_id: job.provider_job_id || job.id,
        status: job.status,
        base_model: job.base_model,
        fine_tuned_model: job.fine_tuned_model || null,
        created_at: job.created_at,
        updated_at: job.updated_at,
        completed_at: job.completed_at || null,
        error_message: job.error_message || null,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check training status' };
  }
};

export const checkTrainingStatusTool: DistriFnTool = {
  name: 'check_training_status',
  description: 'Check the status of the ongoing training job.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
    },
    required: ['workflow_id'],
  },
  handler: async (input) => JSON.stringify(await checkTrainingStatusHandler(input as Record<string, unknown>)),
} as DistriFnTool;
