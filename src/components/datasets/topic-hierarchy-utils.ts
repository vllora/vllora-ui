/**
 * Utility functions for topic hierarchy operations
 */

import { TopicHierarchyNode, DatasetRecord } from "@/types/dataset-types";

/**
 * Count records per topic name
 * Returns a map of topic name -> count
 */
export function getTopicCounts(records: DatasetRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.topic) {
      counts.set(record.topic, (counts.get(record.topic) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Count total nodes in hierarchy
 */
export function countNodes(nodes: TopicHierarchyNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children) {
      count += countNodes(node.children);
    }
  }
  return count;
}

/**
 * Get all node IDs (for expand all)
 */
export function getAllNodeIds(nodes: TopicHierarchyNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children) {
      ids.push(...getAllNodeIds(node.children));
    }
  }
  return ids;
}

/**
 * Deep clone hierarchy for immutable updates
 */
export function cloneHierarchy(nodes: TopicHierarchyNode[]): TopicHierarchyNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneHierarchy(node.children) : undefined,
  }));
}

/**
 * Update a node's name by ID (recursive)
 */
export function updateNodeName(
  nodes: TopicHierarchyNode[],
  nodeId: string,
  newName: string
): TopicHierarchyNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, name: newName };
    }
    if (node.children) {
      return { ...node, children: updateNodeName(node.children, nodeId, newName) };
    }
    return node;
  });
}

/**
 * Add a child to a node by ID (recursive)
 */
export function addChildToNode(
  nodes: TopicHierarchyNode[],
  parentId: string,
  newChild: TopicHierarchyNode
): TopicHierarchyNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      const children = node.children ? [...node.children, newChild] : [newChild];
      return { ...node, children };
    }
    if (node.children) {
      return { ...node, children: addChildToNode(node.children, parentId, newChild) };
    }
    return node;
  });
}

/**
 * Delete a node by ID (recursive)
 */
export function deleteNode(
  nodes: TopicHierarchyNode[],
  nodeId: string
): TopicHierarchyNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (node.children) {
        return { ...node, children: deleteNode(node.children, nodeId) };
      }
      return node;
    });
}
