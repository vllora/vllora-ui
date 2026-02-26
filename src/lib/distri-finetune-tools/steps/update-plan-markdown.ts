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
  const { dataset_id, plan_markdown } = params as {
    dataset_id: string;
    plan_markdown: string;
  };

  if (!dataset_id || typeof dataset_id !== 'string') {
    return { success: false, error: 'dataset_id is required' };
  }

  if (!plan_markdown || typeof plan_markdown !== 'string') {
    return { success: false, error: 'plan_markdown is required' };
  }

  try {
    const stored = await getStoredPlan(dataset_id);
    if (!stored) {
      return { success: false, error: 'No plan found for this dataset' };
    }

    // Update the markdown in IndexedDB (preserves status, progress, etc.)
    await updateStoredPlanMarkdown(dataset_id, plan_markdown);

    // Re-emit so PlanPreview re-renders with updated content
    emitter.emit('vllora_plan_proposed', {
      datasetId: dataset_id,
      plan: { ...stored.plan, plan_markdown },
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
  description: `Update the plan display with new markdown content.

Call this during execution to check off completed steps in the plan checklist.

Example flow:
1. Call apply_topic_hierarchy → succeeds
2. Call update_plan_markdown with the plan markdown updated to check off that step:
   "- [x] Set up training categories\\n- [ ] Generate training data\\n..."

The UI will re-render immediately with the updated checklist.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      plan_markdown: {
        type: 'string',
        description: 'The full updated plan markdown. Use - [x] for completed steps, - [ ] for pending.',
      },
    },
    required: ['dataset_id', 'plan_markdown'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await updatePlanMarkdownHandler(input as Record<string, unknown>)),
} as DistriFnTool;
