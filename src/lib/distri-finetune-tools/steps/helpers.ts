/**
 * Shared helpers for finetune step tools
 */

import type { TopicHierarchyNode } from '@/types/dataset-types';

/**
 * Build topic hierarchy from analysis result
 */
export function buildHierarchyFromAnalysis(
  analysis: { topic_trees?: Array<{ topic_paths?: string[][] }> }
): TopicHierarchyNode[] {
  const root: Map<string, TopicHierarchyNode> = new Map();

  if (!analysis.topic_trees) return [];

  for (const tree of analysis.topic_trees) {
    if (!tree.topic_paths) continue;

    for (const path of tree.topic_paths) {
      if (!path || path.length === 0) continue;

      let currentLevel = root;
      let currentNode: TopicHierarchyNode | undefined;

      for (let i = 0; i < path.length; i++) {
        const name = path[i];
        const id = path.slice(0, i + 1).join('/');

        if (!currentLevel.has(name)) {
          const newNode: TopicHierarchyNode = {
            id,
            name,
            children: [],
          };
          currentLevel.set(name, newNode);
        }

        currentNode = currentLevel.get(name)!;

        // Move to next level
        if (i < path.length - 1) {
          if (!currentNode.children) {
            currentNode.children = [];
          }
          // Convert children array to map for easier lookup
          const childMap = new Map<string, TopicHierarchyNode>();
          for (const child of currentNode.children) {
            childMap.set(child.name, child);
          }
          currentLevel = childMap;
        }
      }
    }
  }

  return Array.from(root.values());
}

/**
 * Count leaf topics in a hierarchy
 */
export function countLeafTopics(nodes: TopicHierarchyNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (!node.children || node.children.length === 0) {
      count++;
    } else {
      count += countLeafTopics(node.children);
    }
  }
  return count;
}

/**
 * Calculate maximum depth of a hierarchy
 */
export function calculateMaxDepth(nodes: TopicHierarchyNode[], currentDepth = 1): number {
  let maxDepth = currentDepth;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      const childDepth = calculateMaxDepth(node.children, currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }
  return maxDepth;
}

/**
 * Extract messages from record data
 */
export function extractMessages(
  data: unknown
): { input?: unknown[]; output?: unknown } {
  const typedData = data as { input?: { messages?: unknown[] }; output?: { messages?: unknown[] | unknown } } | null;
  return {
    input: typedData?.input?.messages,
    output: typedData?.output?.messages,
  };
}
