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

export const updateRecordTopicHandler: ToolHandler = async ({ dataset_id, record_id, topic }) => {
  if (!dataset_id) {
    return { success: false, error: 'dataset_id is required' };
  }
  if (!record_id) {
    return { success: false, error: 'record_id is required' };
  }

  const topicStr = (topic as string) || '';

  // If clearing topic, allow it
  if (!topicStr) {
    try {
      await datasetsDB.updateRecordTopic(dataset_id as string, record_id as string, '');
      emitter.emit('vllora_dataset_refresh' as any, {});
      return { success: true, updated_topic: '(cleared)' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear topic',
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
          error: `Cannot assign record to non-leaf topic "${topicStr}". Records can only be assigned to leaf topics.`,
        };
      }
    }

    await datasetsDB.updateRecordTopic(dataset_id as string, record_id as string, topicStr);
    emitter.emit('vllora_dataset_refresh' as any, {});
    return { success: true, updated_topic: topicStr };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update topic',
    };
  }
};

export const updateRecordTopicTool: DistriFnTool = {
  name: 'update_record_topic',
  description: 'Update the topic for a single record',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: { type: 'string', description: 'The dataset ID' },
      record_id: { type: 'string', description: 'The record ID' },
      topic: { type: 'string', description: 'The new topic (empty string to clear)' },
    },
    required: ['dataset_id', 'record_id', 'topic'],
  },
  handler: async (input: object) =>
    JSON.stringify(await updateRecordTopicHandler(input as Record<string, unknown>)),
} as DistriFnTool;
