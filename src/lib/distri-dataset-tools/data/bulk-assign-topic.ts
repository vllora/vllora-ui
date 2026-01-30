import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import { emitter } from '@/utils/eventEmitter';
import type { ToolHandler } from '../types';
import type { TopicHierarchyNode } from '@/types/dataset-types';

/**
 * Check if a topic ID is a leaf in the hierarchy (no children)
 */
function isLeafTopic(hierarchy: TopicHierarchyNode[] | undefined, topicId: string): boolean {
  if (!hierarchy) return true; // No hierarchy = allow any topic

  function findNode(nodes: TopicHierarchyNode[]): TopicHierarchyNode | null {
    for (const node of nodes) {
      const nodeId = node.id || node.name;
      if (nodeId === topicId) return node;
      if (node.children && node.children.length > 0) {
        const found = findNode(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  const node = findNode(hierarchy);
  if (!node) return true; // Topic not in hierarchy = allow (could be custom)
  return !node.children || node.children.length === 0;
}

export const bulkAssignTopicHandler: ToolHandler = async ({ dataset_id, record_ids, topic }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
    return { success: false, error: 'record_ids array is required' };
  }

  const topicStr = (topic as string) || '';

  // If clearing topic, allow it
  if (!topicStr) {
    try {
      for (const recordId of record_ids as string[]) {
        await datasetsDB.updateRecordTopic(dataset_id as string, recordId, '');
      }
      emitter.emit('vllora_dataset_refresh' as any, {});
      return { success: true, updated_count: record_ids.length, topic: '(cleared)' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear topics',
      };
    }
  }

  try {
    // Validate topic is a leaf (records can only be assigned to leaf topics)
    const dataset = await datasetsDB.getDatasetById(dataset_id as string);
    if (dataset?.topicHierarchy?.hierarchy) {
      if (!isLeafTopic(dataset.topicHierarchy.hierarchy, topicStr)) {
        return {
          success: false,
          error: `Cannot assign records to non-leaf topic "${topicStr}". Records can only be assigned to leaf topics.`,
        };
      }
    }

    for (const recordId of record_ids as string[]) {
      await datasetsDB.updateRecordTopic(dataset_id as string, recordId, topicStr);
    }
    emitter.emit('vllora_dataset_refresh' as any, {});
    return { success: true, updated_count: record_ids.length, topic: topicStr };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk assign topic',
    };
  }
};

export const bulkAssignTopicTool: DistriFnTool = {
  name: 'bulk_assign_topic',
  description: 'Assign the same topic to multiple records',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_ids: { type: 'array', items: { type: 'string' }, description: 'Record IDs to update' },
      topic: { type: 'string', description: 'The topic to assign (empty string to clear)' },
    },
    required: ['dataset_id', 'record_ids', 'topic'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(await bulkAssignTopicHandler(input as Record<string, unknown>)),
} as DistriFnTool;
