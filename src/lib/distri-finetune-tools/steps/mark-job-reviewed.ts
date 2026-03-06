/**
 * Mark Job Reviewed Tool
 *
 * Sets reviewedByAgent=true on a dry run job after Lucy presents results to the user.
 * This enables the catch-up protocol: on dataset reopen, Lucy checks for
 * unreviewed completed/failed jobs and presents results first.
 */

import type { DistriFnTool } from '@distri/core';
import { updateDryRunJob } from '@/services/dry-run-jobs-db';
import type { ToolHandler } from '../types';

// =============================================================================
// Handler
// =============================================================================

export const markJobReviewedHandler: ToolHandler = async (params) => {
  try {
    const { job_id } = params;

    if (!job_id || typeof job_id !== 'string') {
      return { success: false, error: 'job_id is required' };
    }

    const updated = await updateDryRunJob(job_id, {
      reviewedByAgent: true,
      reviewedByAgentAt: Date.now(),
    });

    if (!updated) {
      return { success: false, error: `Job not found: ${job_id}` };
    }

    return {
      success: true,
      job_id: updated.id,
      reviewed_at: updated.reviewedByAgentAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark job as reviewed',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const markJobReviewedTool: DistriFnTool = {
  name: 'mark_job_reviewed',
  description:
    'Mark an evaluation job as reviewed by the agent. Call this after presenting evaluation results to the user. This prevents Lucy from re-presenting the same results on dataset reopen.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      job_id: {
        type: 'string',
        description: 'The dry run job ID to mark as reviewed',
      },
    },
    required: ['job_id'],
  },
  handler: async (input) => JSON.stringify(await markJobReviewedHandler(input as Record<string, unknown>)),
} as DistriFnTool;
