/**
 * Update Workflow README Tool
 *
 * Saves agent-written README content for a dataset.
 * Accepts markdown content authored by the LLM agent.
 */

import type { DistriFnTool } from '@distri/core';
import { datasetService } from '@/services/service-registry';
import type { ToolHandler } from '../types';

// =============================================================================
// Handler
// =============================================================================

export const updateDatasetReadmeHandler: ToolHandler = async (params) => {
  const { workflow_id, readme_content } = params as {
    workflow_id: string;
    readme_content: string;
  };

  if (!workflow_id || typeof workflow_id !== 'string') {
    return { success: false, error: 'workflow_id is required' };
  }

  if (!readme_content || typeof readme_content !== 'string') {
    return { success: false, error: 'readme_content is required' };
  }

  try {
    // Verify dataset exists
    const dataset = await datasetService.getById(workflow_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${workflow_id} not found` };
    }

    // Save agent-authored README to IndexedDB
    await datasetService.updateReadme(workflow_id, readme_content, 'agent');

    console.log('[updateWorkflowReadme] Agent-authored README saved for dataset:', workflow_id);

    return {
      success: true,
      readme_length: readme_content.length,
    };
  } catch (error) {
    console.error('[updateWorkflowReadme] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save README',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const updateDatasetReadmeTool: DistriFnTool = {
  name: 'update_workflow_readme',
  description: `Save agent-written README content for a dataset.

Write a comprehensive, narrative README in markdown. Do NOT just list tables of numbers —
provide insights, context, and recommendations.

Cover:
1. Title + what this model will do (objective)
2. Summary paragraph: approach, methodology, dataset composition
3. Topic coverage: what each category/topic trains, record counts
4. Quality insights: interpret eval scores in context
5. Data provenance: knowledge sources used, generation strategy
6. Current status and recommendations

You already have context from the tools you called during execution.
If updating the README outside of plan execution, call get_workflow_state first.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      readme_content: {
        type: 'string',
        description: 'The full README markdown content to save',
      },
    },
    required: ['workflow_id', 'readme_content'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await updateDatasetReadmeHandler(input as Record<string, unknown>)),
} as DistriFnTool;
