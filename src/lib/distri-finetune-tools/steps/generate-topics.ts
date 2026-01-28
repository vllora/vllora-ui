/**
 * Generate Topics Tool
 *
 * Auto-generates topic hierarchy from dataset content.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import { buildHierarchyFromAnalysis, countLeafTopics } from './helpers';

// Import existing analysis tools
import { generateTopics as existingGenerateTopics } from '@/lib/distri-dataset-tools/analysis/generate-topics';

export const generateTopicsHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, method = 'auto', max_depth = 3, degree = 3 } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'topics_config') {
      return { success: false, error: `Cannot generate topics in step ${workflow.currentStep}. Must be in topics_config step.` };
    }

    // Use existing topic generation
    const result = await existingGenerateTopics({
      datasetId: workflow.datasetId,
      maxDepth: typeof max_depth === 'number' ? max_depth : 3,
      degree: typeof degree === 'number' ? degree : 3,
    });

    if (!result.success || !result.analysis) {
      return { success: false, error: result.error || 'Failed to generate topics' };
    }

    // Convert analysis to hierarchy structure
    const hierarchy = buildHierarchyFromAnalysis(result.analysis);
    const topicCount = countLeafTopics(hierarchy);
    const depth = typeof max_depth === 'number' ? max_depth : 3;

    // Save hierarchy to dataset (single source of truth)
    await datasetsDB.updateDatasetTopicHierarchy(workflow.datasetId, {
      goals: workflow.trainingGoals,
      depth,
      hierarchy,
      generatedAt: Date.now(),
    });

    // Update workflow with metadata only (not the full hierarchy)
    await workflowDB.updateStepData(workflow_id, 'topicsConfig', {
      topicCount,
      depth,
      generatedAt: Date.now(),
      method: method as 'auto' | 'template' | 'manual',
    });

    return {
      success: true,
      hierarchy,
      method,
      topic_count: topicCount,
      depth,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate topics' };
  }
};

export const generateTopicsTool: DistriFnTool = {
  name: 'generate_topics',
  description: 'Auto-generate topic hierarchy from dataset content. Must be in topics_config step.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      method: {
        type: 'string',
        enum: ['auto', 'template', 'manual'],
        default: 'auto',
        description: 'Method for generating topics',
      },
      max_depth: { type: 'number', default: 3, description: 'Maximum hierarchy depth' },
      degree: { type: 'number', default: 3, description: 'Branching factor' },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) => JSON.stringify(await generateTopicsHandler(input as Record<string, unknown>)),
} as DistriFnTool;
