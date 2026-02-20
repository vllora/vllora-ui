/**
 * Regenerate README Tool
 *
 * Allows agents to trigger README regeneration for a dataset.
 * The README summarizes the dataset's current state, structure, and quality metrics.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as knowledgeDB from '@/services/knowledge-sources-db';
import { generateDatasetReadme, type KnowledgeSourceInfo, type PlanSummary } from '@/services/dataset-readme-generator';
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

    // Get knowledge sources
    const sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);
    const knowledgeSources: KnowledgeSourceInfo[] = sources
      .filter(s => s.status === 'ready')
      .map(s => ({
        name: s.name,
        type: s.type,
        section_headings: s.extractedContent?.sectionHeadings || [],
        size: s.size,
      }));

    // Reconstruct plan summary from existing data
    let planSummary: PlanSummary | undefined;
    const generatedRecords = records.filter(r => r.is_generated);
    if (generatedRecords.length > 0) {
      // Extract system prompt template from first record's system message
      const firstData = generatedRecords[0]?.data as { input?: { messages?: { role: string; content: string }[] } } | undefined;
      const systemMsg = firstData?.input?.messages?.find(m => m.role === 'system');

      const topicCount = dataset.topicHierarchy?.hierarchy
        ? new Set(records.map(r => r.topic).filter(Boolean)).size
        : 0;

      planSummary = {
        executed_at: generatedRecords[0]?.createdAt || Date.now(),
        topics_created: topicCount,
        records_generated: generatedRecords.length,
        grader_configured: !!dataset.evalScript,
        dry_run_completed: !!dataset.dryRunStats,
        system_prompt_template: systemMsg?.content || undefined,
      };
    }

    // Generate the README
    const readme = generateDatasetReadme({
      dataset,
      records,
      workflow,
      knowledgeSources,
      planSummary,
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

The README is viewable from the dataset header via the README drawer.`,
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
