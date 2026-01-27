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
const NODE_WIDTH_EXPANDED = 700;
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
}

/**
 * Applies dagre layout to nodes and edges
 */
function getLayoutedElements(
  nodes: TopicNode[],
  edges: Edge[],
  expandedNodes: Set<string>,
  options: DagreLayoutOptions = {}
): DagreLayoutResult {
  const { direction = "TB", nodeSpacing = NODE_SPACING, rankSpacing = RANK_SPACING } = options;
  const isHorizontal = direction === "LR";

  // Create a new dagre graph for each layout calculation
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: nodeSpacing,
    ranksep: rankSpacing,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes with their dimensions based on expanded state
  nodes.forEach((node) => {
    const isExpanded = expandedNodes.has(node.id);
    dagreGraph.setNode(node.id, {
      width: isExpanded ? NODE_WIDTH_EXPANDED : NODE_WIDTH_COLLAPSED,
      height: isExpanded ? NODE_HEIGHT_EXPANDED : NODE_HEIGHT_COLLAPSED,
    });
  });

  // Add edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run dagre layout
  dagre.layout(dagreGraph);

  // Map positions back to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const isExpanded = expandedNodes.has(node.id);
    const nodeWidth = isExpanded ? NODE_WIDTH_EXPANDED : NODE_WIDTH_COLLAPSED;
    const nodeHeight = isExpanded ? NODE_HEIGHT_EXPANDED : NODE_HEIGHT_COLLAPSED;

    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Hook to generate layouted nodes and edges from topic hierarchy
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
          style: {
            stroke: "rgba(16, 185, 129, 0.4)",
            strokeWidth: 1,
          },
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
    return getLayoutedElements(nodes, edges, expandedNodes, options);
  }, [hierarchy, recordCountsByTopic, totalRecordCount, expandedNodes, options]);
}
