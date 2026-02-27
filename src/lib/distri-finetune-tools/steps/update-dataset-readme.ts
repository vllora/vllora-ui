/**
 * Update Dataset README Tool
 *
 * Saves agent-written README content for a dataset.
 * Accepts markdown content authored by the LLM agent.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';

// =============================================================================
// Handler
// =============================================================================

export const updateDatasetReadmeHandler: ToolHandler = async (params) => {
  const { dataset_id, readme_content } = params as {
    dataset_id: string;
    readme_content: string;
  };

  if (!dataset_id || typeof dataset_id !== 'string') {
    return { success: false, error: 'dataset_id is required' };
  }

  if (!readme_content || typeof readme_content !== 'string') {
    return { success: false, error: 'readme_content is required' };
  }

  try {
    // Verify dataset exists
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Save agent-authored README to IndexedDB
    await datasetsDB.updateDatasetReadme(dataset_id, readme_content, 'agent');

    console.log('[updateDatasetReadme] Agent-authored README saved for dataset:', dataset_id);

    return {
      success: true,
      readme_length: readme_content.length,
    };
  } catch (error) {
    console.error('[updateDatasetReadme] Failed:', error);
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
  name: 'update_dataset_readme',
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
If updating the README outside of plan execution, call get_dataset_state first.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      readme_content: {
        type: 'string',
        description: 'The full README markdown content to save',
      },
    },
    required: ['dataset_id', 'readme_content'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await updateDatasetReadmeHandler(input as Record<string, unknown>)),
} as DistriFnTool;
