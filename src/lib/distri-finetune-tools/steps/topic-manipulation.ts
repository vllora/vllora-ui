/**
 * Topic Manipulation Tools
 *
 * Tools for reading topic hierarchies.
 * For modifications, use adjust_topic_hierarchy which uses the BE/LLM.
 */

import type { DistriFnTool } from '@distri/core';
import { workflowService, datasetService } from '@/services/service-registry';
import type { TopicHierarchyNode } from '@/types/dataset-types';
import type { ToolHandler } from '../types';
import { countLeafTopics, calculateMaxDepth } from './helpers';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert hierarchy to a readable tree string
 */
function hierarchyToTreeString(
  nodes: TopicHierarchyNode[],
  prefix: string = '',
  _isLast: boolean = true
): string {
  let result = '';
  nodes.forEach((node, index) => {
    const isLastNode = index === nodes.length - 1;
    const connector = isLastNode ? '└── ' : '├── ';
    const childPrefix = isLastNode ? '    ' : '│   ';

    result += `${prefix}${connector}${node.name}\n`;

    if (node.children && node.children.length > 0) {
      result += hierarchyToTreeString(node.children, prefix + childPrefix, isLastNode);
    }
  });
  return result;
}

// =============================================================================
// get_topic_hierarchy
// =============================================================================

interface GetTopicHierarchyResult {
  success: boolean;
  error?: string;
  hierarchy?: TopicHierarchyNode[];
  topic_count?: number;
  depth?: number;
  tree_view?: string;
}

export const getTopicHierarchyHandler: ToolHandler = async (params): Promise<GetTopicHierarchyResult> => {
  try {
    const { workflow_id } = params;

    let workflowIdToUse: string | null = null;

    if (workflow_id && typeof workflow_id === 'string') {
      const workflow = await workflowService.get(workflow_id);
      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }
      workflowIdToUse = workflow.workflowId;
    } else if (workflow_id && typeof workflow_id === 'string') {
      workflowIdToUse = workflow_id;
    } else {
      return { success: false, error: 'Either workflow_id or workflow_id is required' };
    }

    const dataset = await datasetService.getById(workflowIdToUse);
    if (!dataset) {
      return { success: false, error: 'Dataset not found' };
    }

    const hierarchy = dataset.topicHierarchy?.hierarchy;
    if (!hierarchy || hierarchy.length === 0) {
      return {
        success: true,
        hierarchy: [],
        topic_count: 0,
        depth: 0,
        tree_view: '(No topics defined)',
      };
    }

    const topicCount = countLeafTopics(hierarchy);
    const depth = calculateMaxDepth(hierarchy);
    const treeView = hierarchyToTreeString(hierarchy);

    return {
      success: true,
      hierarchy,
      topic_count: topicCount,
      depth,
      tree_view: treeView,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get topic hierarchy' };
  }
};

export const getTopicHierarchyTool: DistriFnTool = {
  name: 'get_topic_hierarchy',
  description: 'Get the current topic hierarchy for a dataset. Returns the hierarchy structure, topic count, depth, and a human-readable tree view.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The workflow ID',
      },
    },
    required: [],
  },
  handler: async (input) => JSON.stringify(await getTopicHierarchyHandler(input as Record<string, unknown>)),
} as DistriFnTool;
