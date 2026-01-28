/**
 * Apply Topic Hierarchy Tool
 *
 * Applies a user-provided or edited topic hierarchy to the workflow.
 */

import type { DistriFnTool } from '@distri/core';
import * as workflowDB from '@/services/finetune-workflow-db';
import * as datasetsDB from '@/services/datasets-db';
import type { TopicHierarchyNode } from '@/types/dataset-types';
import type { ToolHandler } from '../types';
import { countLeafTopics, calculateMaxDepth } from './helpers';

export const applyTopicHierarchyHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, hierarchy } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!hierarchy || !Array.isArray(hierarchy)) {
      return { success: false, error: 'hierarchy array is required' };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.currentStep !== 'topics_config') {
      return { success: false, error: `Cannot apply hierarchy in step ${workflow.currentStep}` };
    }

    // Validate hierarchy structure
    const validHierarchy = hierarchy as TopicHierarchyNode[];
    const topicCount = countLeafTopics(validHierarchy);

    if (topicCount === 0) {
      return { success: false, error: 'Hierarchy must have at least one topic' };
    }

    const depth = calculateMaxDepth(validHierarchy);

    // Save hierarchy to dataset (single source of truth)
    await datasetsDB.updateDatasetTopicHierarchy(workflow.datasetId, {
      hierarchy: validHierarchy,
      depth,
      generatedAt: Date.now(),
    });

    // Update workflow with metadata only (not the full hierarchy)
    await workflowDB.updateStepData(workflow_id, 'topicsConfig', {
      topicCount,
      depth,
      generatedAt: Date.now(),
      method: 'manual',
    });

    return {
      success: true,
      applied_hierarchy: validHierarchy,
      topic_count: topicCount,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to apply hierarchy' };
  }
};

export const applyTopicHierarchyTool: DistriFnTool = {
  name: 'apply_topic_hierarchy',
  description: 'Apply a user-provided or edited topic hierarchy to the workflow.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      hierarchy: {
        type: 'array',
        items: { type: 'object' },
        description: 'TopicHierarchyNode[] structure',
      },
    },
    required: ['workflow_id', 'hierarchy'],
  },
  handler: async (input) => JSON.stringify(await applyTopicHierarchyHandler(input as Record<string, unknown>)),
} as DistriFnTool;
