/**
 * useDagreLayout
 *
 * Hook for automatic tree layout using dagre algorithm.
 * Supports dynamic node sizes for expandable nodes.
 */

import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import { Position, type Edge } from "@xyflow/react";
import type { TopicNode } from "./topic-node/TopicNodeComponent";
import type { TopicInputNode } from "./TopicInputNode";
import type { RootNode } from "./RootNodeComponent";
import type { TopicHierarchyNode } from "@/types/dataset-types";

// Union type for all canvas node types
export type CanvasNode = TopicNode | TopicInputNode | RootNode;

// Layout constants - must match TopicNodeComponent sizes
const NODE_WIDTH_COLLAPSED = 280;
const NODE_WIDTH_EXPANDED = 700;
const NODE_HEIGHT_COLLAPSED = 80;
const NODE_HEIGHT_EXPANDED = 500;
const NODE_SPACING = 50;
const RANK_SPACING = 100;

// Root node size (circle with label below)
const ROOT_NODE_WIDTH = 64;
const ROOT_NODE_HEIGHT = 90;

interface DagreLayoutOptions {
  direction?: "TB" | "LR";
  nodeSpacing?: number;
  rankSpacing?: number;
}

interface DagreLayoutResult {
  nodes: CanvasNode[];
  edges: Edge[];
  /** Mapping from topic name to node ID (for edge highlighting) */
  topicNameToNodeId: Record<string, string>;
  /** Mapping from node ID to parent node ID (for edge highlighting) */
  nodeIdToParentId: Record<string, string>;
}

/**
 * Applies dagre layout to nodes and edges.
 * Uses actual node dimensions based on expansion state so dagre can
 * properly space nodes to prevent overlap when expanded.
 */
function getLayoutedElements(
  nodes: CanvasNode[],
  edges: Edge[],
  expandedNodes: Set<string>,
  topicNameToNodeId: Record<string, string>,
  nodeIdToParentId: Record<string, string>,
  options: DagreLayoutOptions = {},
  nodeSizes?: Record<string, { width: number; height: number }>
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

  // Add nodes with dimensions based on their type and expansion state
  // For LR layout: expanded nodes grow both wider and taller
  // - Width affects horizontal spacing (rank separation)
  // - Height affects vertical spacing (node separation between siblings)
  // Use actual sizes from nodeSizes if available (from user resizing)
  nodes.forEach((node) => {
    let width: number;
    let height: number;

    // Simple root node has fixed compact size
    if (node.type === "root") {
      width = ROOT_NODE_WIDTH;
      height = ROOT_NODE_HEIGHT;
    } else {
      const isExpanded = expandedNodes.has(node.id);
      const actualSize = nodeSizes?.[node.id];

      if (isExpanded && actualSize) {
        // Use actual resized dimensions
        width = actualSize.width;
        height = actualSize.height;
      } else if (isExpanded) {
        // Use default expanded dimensions
        width = NODE_WIDTH_EXPANDED;
        height = NODE_HEIGHT_EXPANDED;
      } else {
        // Collapsed dimensions
        width = NODE_WIDTH_COLLAPSED;
        height = NODE_HEIGHT_COLLAPSED;
      }
    }

    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run dagre layout
  dagre.layout(dagreGraph);

  // Calculate depth (rank) of each node from parent relationships
  // Use -1 as a "processing" marker to detect and break cycles
  const nodeDepths: Record<string, number> = {};
  const calculateDepth = (nodeId: string, visited: Set<string> = new Set()): number => {
    // Already calculated
    if (nodeDepths[nodeId] !== undefined && nodeDepths[nodeId] >= 0) {
      return nodeDepths[nodeId];
    }

    // Cycle detection - if we've seen this node in current path, break the cycle
    if (visited.has(nodeId)) {
      console.warn(`[useDagreLayout] Cycle detected at node: ${nodeId}`);
      nodeDepths[nodeId] = 0;
      return 0;
    }

    const parentId = nodeIdToParentId[nodeId];
    if (!parentId) {
      nodeDepths[nodeId] = 0;
      return 0;
    }

    // Mark as visited in current path
    visited.add(nodeId);
    const parentDepth = calculateDepth(parentId, visited);
    nodeDepths[nodeId] = parentDepth + 1;
    return nodeDepths[nodeId];
  };
  nodes.forEach((node) => calculateDepth(node.id, new Set()));

  // First pass: convert dagre positions to top-left using actual dimensions
  const nodesWithPositions = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    let nodeWidth: number;
    let nodeHeight: number;

    // Simple root node has fixed compact size
    if (node.type === "root") {
      nodeWidth = ROOT_NODE_WIDTH;
      nodeHeight = ROOT_NODE_HEIGHT;
    } else {
      const isExpanded = expandedNodes.has(node.id);
      const actualSize = nodeSizes?.[node.id];

      if (isExpanded && actualSize) {
        nodeWidth = actualSize.width;
        nodeHeight = actualSize.height;
      } else if (isExpanded) {
        nodeWidth = NODE_WIDTH_EXPANDED;
        nodeHeight = NODE_HEIGHT_EXPANDED;
      } else {
        nodeWidth = NODE_WIDTH_COLLAPSED;
        nodeHeight = NODE_HEIGHT_COLLAPSED;
      }
    }

    return {
      node,
      depth: nodeDepths[node.id],
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });

  // Second pass: align nodes at the same depth by their left edge
  // Find minimum x for each depth level
  const minXByDepth: Record<number, number> = {};
  nodesWithPositions.forEach(({ depth, x }) => {
    if (minXByDepth[depth] === undefined || x < minXByDepth[depth]) {
      minXByDepth[depth] = x;
    }
  });

  // Apply aligned positions
  const layoutedNodes: CanvasNode[] = nodesWithPositions.map(({ node, depth, y }) => {
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: minXByDepth[depth], // Align left edge with minimum x at this depth
        y,
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
 *
 * @param pendingAddParentId - When defined, adds a temporary input node as child of this parent.
 *                             null means root, undefined means no pending add.
 * @param nodeSizes - Actual sizes of nodes (from resizing). Falls back to defaults if not provided.
 * @param layoutVersion - Version number to trigger manual relayout when changed.
 */
export function useDagreLayout(
  hierarchy: TopicHierarchyNode[] | undefined,
  recordCountsByTopic: Record<string, number>,
  totalRecordCount: number,
  expandedNodes: Set<string>,
  options?: DagreLayoutOptions,
  pendingAddParentId?: string | null,
  nodeSizes?: Record<string, { width: number; height: number }>,
  layoutVersion?: number
): DagreLayoutResult {
  return useMemo(() => {
    const nodes: CanvasNode[] = [];
    const edges: Edge[] = [];
    const hasHierarchy = hierarchy && hierarchy.length > 0;

    // Maps for path highlighting (returned for use by caller)
    const topicNameToNodeId: Record<string, string> = {};
    const nodeIdToParentId: Record<string, string> = {};

    // Compute unassigned count (total - sum of topic counts)
    const assignedCount = Object.values(recordCountsByTopic).reduce((sum, c) => sum + c, 0);
    const unassignedCount = totalRecordCount - assignedCount;

    // Root node - use simple "root" type when empty, otherwise "topic" type
    const isEmptyRoot = hasHierarchy && unassignedCount === 0;

    if (isEmptyRoot) {
      // Simple root node (circle with label)
      nodes.push({
        id: "root",
        type: "root",
        position: { x: 0, y: 0 }, // Will be updated by dagre
        data: {
          hasChildren: true,
        },
      } as CanvasNode);
    } else {
      // Full topic node for unassigned records
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
      } as CanvasNode);
    }

    if (hasHierarchy) {
      // Recursively process hierarchy
      const processNode = (
        node: TopicHierarchyNode,
        parentId: string
      ) => {
        // Ensure node has valid id and name
        if (!node || (!node.id && !node.name)) {
          console.warn('[useDagreLayout] Skipping invalid node:', node);
          return;
        }
        const nodeId = `topic-${node.id || node.name}`;
        const hasChildren = node.children && node.children.length > 0;
        // Look up by node.id (records store topic as ID, not name)
        const nodeTopicId = node.id || node.name;
        const recordCount = nodeTopicId ? (recordCountsByTopic[nodeTopicId] || 0) : 0;

        // Track mappings for path highlighting
        if (node.name) {
          topicNameToNodeId[node.name] = nodeId;
        }
        nodeIdToParentId[nodeId] = parentId;

        const nodeName = node.name || node.id || 'Unknown';
        nodes.push({
          id: nodeId,
          type: "topic",
          position: { x: 0, y: 0 }, // Will be updated by dagre
          data: {
            name: nodeName,
            topicKey: nodeTopicId, // Use ID for lookup (records store topic as ID)
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

    // Add temporary input node if pending add is active
    if (pendingAddParentId !== undefined) {
      const inputNodeId = "__input_node__";
      // Determine parent node ID: null means root, otherwise look up by topic name
      const parentNodeId = pendingAddParentId === null
        ? "root"
        : topicNameToNodeId[pendingAddParentId] || "root";

      nodes.push({
        id: inputNodeId,
        type: "topicInput",
        position: { x: 0, y: 0 }, // Will be updated by dagre
        data: {
          parentTopicName: pendingAddParentId,
        },
      } as CanvasNode);

      edges.push({
        id: `edge-${parentNodeId}-${inputNodeId}`,
        source: parentNodeId,
        target: inputNodeId,
        type: "smoothstep",
        style: {
          ...HIGHLIGHTED_EDGE_STYLE,
          strokeDasharray: "5 5", // Dashed line for pending connection
        },
      });

      // Track parent relationship for the input node
      nodeIdToParentId[inputNodeId] = parentNodeId;
    }

    // Apply dagre layout
    return getLayoutedElements(nodes, edges, expandedNodes, topicNameToNodeId, nodeIdToParentId, options, nodeSizes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchy, recordCountsByTopic, totalRecordCount, expandedNodes, options, pendingAddParentId, nodeSizes, layoutVersion]);
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
