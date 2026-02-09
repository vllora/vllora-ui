/**
 * Regenerate README Tool
 *
 * Allows agents to trigger README regeneration for a dataset.
 * The README summarizes the dataset's current state, structure, and quality metrics.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import * as workflowDB from '@/services/finetune-workflow-db';
import { generateDatasetReadme } from '@/services/dataset-readme-generator';
import type { ToolHandler } from '../types';

// =============================================================================
// Types
// =============================================================================

interface RegenerateReadmeParams {
  dataset_id: string;
}

interface RegenerateReadmeResult {
  success: boolean;
  error?: string;
  readme_updated: boolean;
  readme_length?: number;
  sections?: string[];
}

// =============================================================================
// Main Handler
// =============================================================================

export const regenerateReadmeHandler: ToolHandler = async (
  params
): Promise<RegenerateReadmeResult> => {
  try {
    const { dataset_id } = params as unknown as RegenerateReadmeParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required', readme_updated: false };
    }

    // Get dataset
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found`, readme_updated: false };
    }

    // Get records
    const records = await datasetsDB.getRecordsByDatasetId(dataset_id);

    // Get workflow if available
    const workflow = await workflowDB.getWorkflow(dataset_id);

    // Generate the README
    const readme = generateDatasetReadme({
      dataset,
      records,
      workflow,
    });

    // Save to IndexedDB
    await datasetsDB.updateDatasetReadme(dataset_id, readme);

    // Extract section headers for summary
    const sectionMatches = readme.match(/^## .+$/gm) || [];
    const sections = sectionMatches.map(s => s.replace('## ', ''));

    console.log('[regenerateReadme] README updated for dataset:', dataset_id);

    return {
      success: true,
      readme_updated: true,
      readme_length: readme.length,
      sections,
    };
  } catch (error) {
    console.error('[regenerateReadme] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate README',
      readme_updated: false,
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const regenerateReadmeTool: DistriFnTool = {
  name: 'regenerate_readme',
  description: `Regenerate the README for a dataset.

The README is an auto-generated markdown document that summarizes:
- Dataset overview (name, objective, record count)
- Topic hierarchy visualization
- Coverage analysis by topic
- Quality metrics from dry runs
- Workflow status and history
- Configuration settings

Use this tool:
- After making significant changes to the dataset
- When user asks to see or update the README
- After generating synthetic data
- After completing a dry run

The README is viewable in the dataset's README tab.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to regenerate README for',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await regenerateReadmeHandler(input as Record<string, unknown>)),
} as DistriFnTool;
