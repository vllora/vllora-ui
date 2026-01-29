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

/**
 * Normalize and validate hierarchy nodes.
 * - Ensures each node has a unique `id`
 * - Ensures each node has a `name`
 * - Recursively processes children
 */
function normalizeHierarchy(
  nodes: unknown[],
  parentPath: string = ''
): TopicHierarchyNode[] {
  const result: TopicHierarchyNode[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as Record<string, unknown>;
    if (!node || typeof node !== 'object') continue;

    // Get name (required) - support various field names the LLM might use
    const name = (node.name as string) || (node.label as string) || (node.title as string);
    if (!name || typeof name !== 'string') {
      console.warn('[apply-hierarchy] Skipping node without name:', node);
      continue;
    }

    // Generate or validate id
    const currentPath = parentPath ? `${parentPath}/${name}` : name;
    let id = (node.id as string) || currentPath;

    // Ensure unique ID
    if (seenIds.has(id)) {
      id = `${id}-${i}`;
    }
    seenIds.add(id);

    // Process children recursively
    const children = Array.isArray(node.children)
      ? normalizeHierarchy(node.children, currentPath)
      : undefined;

    result.push({
      id,
      name,
      children: children && children.length > 0 ? children : undefined,
    });
  }

  return result;
}

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

    // Allow hierarchy changes in topics_config or grader_config steps
    // (users may want to refine topics while configuring the grader)
    const allowedSteps = ['topics_config', 'grader_config'];
    if (!allowedSteps.includes(workflow.currentStep)) {
      return { success: false, error: `Cannot apply hierarchy in step ${workflow.currentStep}. Must be in topics_config or grader_config step.` };
    }

    // Normalize and validate hierarchy structure (ensures IDs exist)
    const validHierarchy = normalizeHierarchy(hierarchy);
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
  description: 'Apply a user-provided or edited topic hierarchy to the workflow. Available in topics_config and grader_config steps.',
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
