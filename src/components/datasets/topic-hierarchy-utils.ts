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
 * Find a node by ID (recursive)
 */
export function findNodeById(
  nodes: TopicHierarchyNode[],
  nodeId: string
): TopicHierarchyNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, nodeId);
      if (found) return found;
    }
  }
  return undefined;
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

/**
 * Get all leaf topic names from a node and its descendants
 * If the node has no children, it is itself a leaf and returns [node.name]
 */
export function getLeafNamesFromNode(node: TopicHierarchyNode): string[] {
  if (!node.children || node.children.length === 0) {
    return [node.name];
  }
  const leaves: string[] = [];
  for (const child of node.children) {
    leaves.push(...getLeafNamesFromNode(child));
  }
  return leaves;
}

/**
 * Look up a topic's full path from the hierarchy by topic name
 * Returns the path from root to leaf, or undefined if not found
 */
export function getTopicPathFromHierarchy(
  topicName: string,
  nodes: TopicHierarchyNode[],
  parentPath: string[] = []
): string[] | undefined {
  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];
    if (node.name === topicName) {
      return currentPath;
    }
    if (node.children && node.children.length > 0) {
      const found = getTopicPathFromHierarchy(topicName, node.children, currentPath);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Extract all leaf topics with their full paths from hierarchy
 */
export function extractLeafTopicsFromHierarchy(
  nodes: TopicHierarchyNode[],
  parentPath: string[] = []
): Array<{ name: string; path: string[] }> {
  const leaves: Array<{ name: string; path: string[] }> = [];
  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];
    if (node.children && node.children.length > 0) {
      leaves.push(...extractLeafTopicsFromHierarchy(node.children, currentPath));
    } else {
      leaves.push({ name: node.name, path: currentPath });
    }
  }
  return leaves;
}

/**
 * Flatten hierarchy to array with parent info for drag-and-drop
 */
export interface FlattenedNode {
  node: TopicHierarchyNode;
  parentId: string | null;
  depth: number;
  index: number;
}

export function flattenHierarchy(
  nodes: TopicHierarchyNode[],
  parentId: string | null = null,
  depth: number = 0
): FlattenedNode[] {
  const result: FlattenedNode[] = [];
  nodes.forEach((node, index) => {
    result.push({ node, parentId, depth, index });
    if (node.children) {
      result.push(...flattenHierarchy(node.children, node.id, depth + 1));
    }
  });
  return result;
}

/**
 * Find parent ID of a node
 */
export function findParentId(
  nodes: TopicHierarchyNode[],
  nodeId: string,
  parentId: string | null = null
): string | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return parentId;
    }
    if (node.children) {
      const found = findParentId(node.children, nodeId, node.id);
      if (found !== undefined) return found;
    }
  }
  return null;
}

/**
 * Move a node to a new position in the hierarchy
 */
export function moveNode(
  nodes: TopicHierarchyNode[],
  activeId: string,
  overId: string,
  position: 'before' | 'after' | 'inside'
): TopicHierarchyNode[] {
  // Find and remove the active node
  const activeNode = findNodeById(nodes, activeId);
  if (!activeNode) return nodes;

  // Remove node from its current position
  let result = deleteNode(nodes, activeId);

  // If dropping inside another node (as a child)
  if (position === 'inside') {
    return result.map((node) => {
      if (node.id === overId) {
        const children = node.children ? [...node.children, activeNode] : [activeNode];
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: moveNode(node.children, activeId, overId, position) };
      }
      return node;
    });
  }

  // If dropping before/after at the same level
  const insertAtLevel = (
    nodes: TopicHierarchyNode[],
    targetId: string,
    nodeToInsert: TopicHierarchyNode,
    pos: 'before' | 'after'
  ): TopicHierarchyNode[] => {
    const newNodes: TopicHierarchyNode[] = [];
    for (const node of nodes) {
      if (node.id === targetId) {
        if (pos === 'before') {
          newNodes.push(nodeToInsert);
          newNodes.push(node);
        } else {
          newNodes.push(node);
          newNodes.push(nodeToInsert);
        }
      } else {
        if (node.children) {
          newNodes.push({
            ...node,
            children: insertAtLevel(node.children, targetId, nodeToInsert, pos),
          });
        } else {
          newNodes.push(node);
        }
      }
    }
    return newNodes;
  };

  return insertAtLevel(result, overId, activeNode, position);
}

/**
 * Reorder nodes at the same level (for simple sibling reordering)
 */
export function reorderSiblings(
  nodes: TopicHierarchyNode[],
  parentId: string | null,
  activeId: string,
  overId: string
): TopicHierarchyNode[] {
  if (parentId === null) {
    // Reordering at root level
    const activeIndex = nodes.findIndex((n) => n.id === activeId);
    const overIndex = nodes.findIndex((n) => n.id === overId);
    if (activeIndex === -1 || overIndex === -1) return nodes;

    const newNodes = [...nodes];
    const [removed] = newNodes.splice(activeIndex, 1);
    newNodes.splice(overIndex, 0, removed);
    return newNodes;
  }

  // Reordering within a parent
  return nodes.map((node) => {
    if (node.id === parentId && node.children) {
      const activeIndex = node.children.findIndex((n) => n.id === activeId);
      const overIndex = node.children.findIndex((n) => n.id === overId);
      if (activeIndex === -1 || overIndex === -1) return node;

      const newChildren = [...node.children];
      const [removed] = newChildren.splice(activeIndex, 1);
      newChildren.splice(overIndex, 0, removed);
      return { ...node, children: newChildren };
    }
    if (node.children) {
      return { ...node, children: reorderSiblings(node.children, parentId, activeId, overId) };
    }
    return node;
  });
}
