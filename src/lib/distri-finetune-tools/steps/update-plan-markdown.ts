/**
 * Update Plan Markdown Tool
 *
 * Called by the agent during execution to update the plan display.
 * After each tool completes, the agent checks off the step in the markdown
 * and calls this tool to update the UI.
 */

import type { DistriFnTool } from '@distri/core';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';
import {
  getStoredPlan,
  updateStoredPlanMarkdown,
} from './proposed-plan-store';

// =============================================================================
// Handler
// =============================================================================

export const updatePlanMarkdownHandler: ToolHandler = async (params) => {
  const { workflow_id, plan_markdown, status, error_message } = params as {
    workflow_id: string;
    plan_markdown: string;
    status?: 'executing' | 'completed' | 'failed';
    error_message?: string;
  };

  if (!workflow_id || typeof workflow_id !== 'string') {
    return { success: false, error: 'workflow_id is required' };
  }

  if (!plan_markdown || typeof plan_markdown !== 'string') {
    return { success: false, error: 'plan_markdown is required' };
  }

  try {
    const stored = await getStoredPlan(workflow_id);
    if (!stored) {
      return { success: false, error: 'No plan found for this dataset' };
    }

    // Update the markdown in IndexedDB (preserves status, progress, etc.)
    await updateStoredPlanMarkdown(workflow_id, plan_markdown);

    // If a status transition was requested, persist it to IndexedDB too
    if (status) {
      const { updatePlanStatus, completePlan, failPlan } = await import('./proposed-plan-store');
      if (status === 'completed') {
        completePlan(workflow_id, null);
      } else if (status === 'failed') {
        failPlan(workflow_id, null);
      } else {
        updatePlanStatus(workflow_id, status);
      }
    }

    // Emit content-only update — does NOT reset plan status (unlike vllora_plan_proposed)
    emitter.emit('vllora_plan_markdown_updated', {
      workflowId: workflow_id,
      plan: { ...stored.plan, plan_markdown },
      status,
      error_message,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update plan markdown',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const updatePlanMarkdownTool: DistriFnTool = {
  name: 'update_plan_markdown',
  description: `Update the plan display with new markdown content and optionally transition plan status.

Call this during execution to check off completed steps in the plan checklist.

Example flow:
1. Call apply_topic_hierarchy → succeeds
2. Call update_plan_markdown with the plan markdown updated to check off that step:
   "- [x] Set up training categories\\n- [ ] Generate training data\\n..."
3. On the FINAL step, include status: "completed" to mark the plan as done.

The UI will re-render immediately with the updated checklist.

Status transitions:
- Omit status for intermediate updates (auto-transitions to "executing" on first call)
- "completed" — all steps done successfully (shows "Completed" badge)
- "failed" — execution stopped due to error (shows "Failed" badge)`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      plan_markdown: {
        type: 'string',
        description: 'The full updated plan markdown. Use - [x] for completed steps, - [ ] for pending.',
      },
      status: {
        type: 'string',
        enum: ['executing', 'completed', 'failed'],
        description: 'Optional status transition. Use "completed" on the final update when all steps are done. Use "failed" if execution stopped due to an error. Omit for intermediate updates.',
      },
      error_message: {
        type: 'string',
        description: 'Short error description when status is "failed". Shown in the plan footer so the user knows what went wrong. Example: "Training failed: maximum finetune jobs reached"',
      },
    },
    required: ['workflow_id', 'plan_markdown'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await updatePlanMarkdownHandler(input as Record<string, unknown>)),
} as DistriFnTool;
