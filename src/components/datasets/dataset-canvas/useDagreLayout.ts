/**
 * useDagreLayout
 *
 * Hook for automatic tree layout using dagre algorithm.
 * Supports dynamic node sizes for expandable nodes.
 */

import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import { Position, type Edge } from "@xyflow/react";
import type { TopicNode } from "./TopicNodeComponent";
import type { TopicHierarchyNode } from "@/types/dataset-types";

// Layout constants
const NODE_WIDTH_COLLAPSED = 280;
const NODE_HEIGHT_COLLAPSED = 80;
const NODE_HEIGHT_EXPANDED = 500;
const NODE_SPACING = 50;
const RANK_SPACING = 100;

interface DagreLayoutOptions {
  direction?: "TB" | "LR";
  nodeSpacing?: number;
  rankSpacing?: number;
}

interface DagreLayoutResult {
  nodes: TopicNode[];
  edges: Edge[];
  /** Mapping from topic name to node ID (for edge highlighting) */
  topicNameToNodeId: Record<string, string>;
  /** Mapping from node ID to parent node ID (for edge highlighting) */
  nodeIdToParentId: Record<string, string>;
}

/**
 * Applies dagre layout to nodes and edges.
 * Uses collapsed height for layout calculation to keep siblings aligned,
 * but uses actual width to prevent horizontal overlap.
 * Nodes grow downward when expanded.
 */
function getLayoutedElements(
  nodes: TopicNode[],
  edges: Edge[],
  expandedNodes: Set<string>,
  topicNameToNodeId: Record<string, string>,
  nodeIdToParentId: Record<string, string>,
  options: DagreLayoutOptions = {}
): DagreLayoutResult {
  const { direction = "TB", nodeSpacing = NODE_SPACING, rankSpacing = RANK_SPACING } = options;
  const isHorizontal = direction === "LR";

  // Calculate dynamic spacing based on whether any node is expanded
  const hasExpandedNode = expandedNodes.size > 0;

  // For vertical (TB) layout: expanded nodes grow downward, so increase rank spacing
  const dynamicRankSpacing = !isHorizontal && hasExpandedNode
    ? rankSpacing + NODE_HEIGHT_EXPANDED - NODE_HEIGHT_COLLAPSED
    : rankSpacing;

  // For horizontal (LR) layout: expanded nodes grow downward, so increase node spacing (vertical gap between siblings)
  const dynamicNodeSpacing = isHorizontal && hasExpandedNode
    ? nodeSpacing + NODE_HEIGHT_EXPANDED - NODE_HEIGHT_COLLAPSED
    : nodeSpacing;

  // Create a new dagre graph for each layout calculation
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: dynamicNodeSpacing,
    ranksep: dynamicRankSpacing,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes with dimensions:
  // - Always use collapsed dimensions for dagre (keeps siblings aligned at same position)
  // - Expanded nodes will visually grow right and downward without affecting layout
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH_COLLAPSED, // Always use collapsed width for alignment
      height: NODE_HEIGHT_COLLAPSED, // Always use collapsed height for alignment
    });
  });

  // Add edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run dagre layout
  dagre.layout(dagreGraph);

  // Map positions back to nodes
  // Position is calculated from dagre's center point, converted to top-left
  // Always use collapsed dimensions for offset to keep siblings aligned
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH_COLLAPSED / 2, // Always use collapsed width for alignment
        y: nodeWithPosition.y - NODE_HEIGHT_COLLAPSED / 2, // Always use collapsed height for alignment
      },
    };
  });

  return { nodes: layoutedNodes, edges, topicNameToNodeId, nodeIdToParentId };
}

// Edge styles
const DEFAULT_EDGE_STYLE = {
  stroke: "rgba(16, 185, 129, 0.4)",
  strokeWidth: 1,
};

const HIGHLIGHTED_EDGE_STYLE = {
  stroke: "rgba(16, 185, 129, 0.6)",
  strokeWidth: 1,
  filter: "drop-shadow(0 0 4px rgba(16, 185, 129, 0.7))",
};

/**
 * Hook to generate layouted nodes and edges from topic hierarchy.
 * Does NOT include selection-based edge highlighting - that should be
 * computed separately to avoid layout recalculation on selection change.
 */
export function useDagreLayout(
  hierarchy: TopicHierarchyNode[] | undefined,
  recordCountsByTopic: Record<string, number>,
  totalRecordCount: number,
  expandedNodes: Set<string>,
  options?: DagreLayoutOptions
): DagreLayoutResult {
  return useMemo(() => {
    const nodes: TopicNode[] = [];
    const edges: Edge[] = [];
    const hasHierarchy = hierarchy && hierarchy.length > 0;

    // Maps for path highlighting (returned for use by caller)
    const topicNameToNodeId: Record<string, string> = {};
    const nodeIdToParentId: Record<string, string> = {};

    // Compute unassigned count (total - sum of topic counts)
    const assignedCount = Object.values(recordCountsByTopic).reduce((sum, c) => sum + c, 0);
    const unassignedCount = totalRecordCount - assignedCount;

    // Root node (always present) - shows unassigned records
    nodes.push({
      id: "root",
      type: "topic",
      position: { x: 0, y: 0 }, // Will be updated by dagre
      data: {
        name: hasHierarchy ? "Unassigned" : "Uncategorized Data",
        topicKey: "__unassigned__",
        nodeId: "root",
        recordCount: unassignedCount,
        isRoot: true,
        hasChildren: hasHierarchy,
      },
    });

    if (hasHierarchy) {
      // Recursively process hierarchy
      const processNode = (
        node: TopicHierarchyNode,
        parentId: string
      ) => {
        const nodeId = `topic-${node.id}`;
        const hasChildren = node.children && node.children.length > 0;
        const recordCount = recordCountsByTopic[node.name] || 0;

        // Track mappings for path highlighting
        topicNameToNodeId[node.name] = nodeId;
        nodeIdToParentId[nodeId] = parentId;

        nodes.push({
          id: nodeId,
          type: "topic",
          position: { x: 0, y: 0 }, // Will be updated by dagre
          data: {
            name: node.name,
            topicKey: node.name,
            nodeId: nodeId,
            recordCount,
            isRoot: false,
            hasChildren,
          },
        });

        // Edge from parent
        edges.push({
          id: `edge-${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          type: "smoothstep",
          style: DEFAULT_EDGE_STYLE,
        });

        // Process children recursively
        if (hasChildren) {
          node.children!.forEach((child) => {
            processNode(child, nodeId);
          });
        }
      };

      // Process all top-level topics
      hierarchy.forEach((topLevelNode) => {
        processNode(topLevelNode, "root");
      });
    }

    // Apply dagre layout
    return getLayoutedElements(nodes, edges, expandedNodes, topicNameToNodeId, nodeIdToParentId, options);
  }, [hierarchy, recordCountsByTopic, totalRecordCount, expandedNodes, options]);
}

/**
 * Compute highlighted edge IDs for the path from root to selected topic.
 * Returns a Set of edge IDs that should be highlighted.
 */
export function getHighlightedEdgeIds(
  selectedTopic: string | null | undefined,
  topicNameToNodeId: Record<string, string>,
  nodeIdToParentId: Record<string, string>
): Set<string> {
  const highlightedEdgeIds = new Set<string>();

  if (selectedTopic && topicNameToNodeId[selectedTopic]) {
    let currentNodeId = topicNameToNodeId[selectedTopic];

    // Walk up the tree from selected node to root
    while (currentNodeId && nodeIdToParentId[currentNodeId]) {
      const parentId = nodeIdToParentId[currentNodeId];
      highlightedEdgeIds.add(`edge-${parentId}-${currentNodeId}`);
      currentNodeId = parentId;
    }
  }

  return highlightedEdgeIds;
}

/** Default edge style */
export { DEFAULT_EDGE_STYLE, HIGHLIGHTED_EDGE_STYLE };
