/**
 * TopicHierarchyCanvas
 *
 * Visual canvas using @xyflow/react to display the topic hierarchy.
 * - If no hierarchy: Shows a single "Raw Data" root node
 * - If hierarchy exists: Shows the full tree structure with connections
 * - Nodes can expand to show embedded table with records
 * - Uses TopicCanvasContext for state management
 */

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  ConnectionLineType,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TopicNodeComponent, type TopicNode } from "./TopicNodeComponent";
import { TopicCanvasProvider, useTopicCanvas } from "./TopicCanvasContext";
import type { TopicHierarchyNode, DatasetRecord } from "@/types/dataset-types";

// Custom node types with proper typing
const nodeTypes = {
  topic: TopicNodeComponent,
} as const;

interface TopicHierarchyCanvasProps {
  /** The topic hierarchy (undefined means no hierarchy yet) */
  hierarchy?: TopicHierarchyNode[];
  /** All records in the dataset */
  records: DatasetRecord[];
  /** Dataset ID */
  datasetId?: string;
  /** Called when a topic node is selected to view its data */
  onSelectTopic?: (topicName: string | null) => void;
  /** Currently selected topic (null = root/all) */
  selectedTopic?: string | null;
  /** Called when adding a new topic */
  onAddTopic?: (parentTopicName: string | null) => void;
  /** Called when renaming a topic */
  onRenameTopic?: (topicName: string) => void;
  /** Called when deleting a topic */
  onDeleteTopic?: (topicName: string) => void;
  /** Called when updating a record's topic */
  onUpdateRecordTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  /** Called when deleting a record */
  onDeleteRecord?: (recordId: string) => void;
  /** Called when saving record data */
  onSaveRecord?: (recordId: string, data: unknown) => Promise<void>;
}

// Layout constants
const NODE_WIDTH = 280;
const NODE_WIDTH_EXPANDED = 750; // Must match TopicNodeComponent's DEFAULT_EXPANDED_WIDTH
const HORIZONTAL_SPACING = 100;
const VERTICAL_SPACING = 120;

// Inner component that uses the context
function TopicHierarchyCanvasInner({
  hierarchy,
}: {
  hierarchy?: TopicHierarchyNode[];
}) {
  const { records, expandedNodes } = useTopicCanvas();

  // Compute record counts by topic
  const recordCountsByTopic = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const record of records) {
      if (record.topic) {
        counts[record.topic] = (counts[record.topic] || 0) + 1;
      }
    }
    return counts;
  }, [records]);

  // Convert hierarchy to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: TopicNode[] = [];
    const edges: Edge[] = [];
    const hasHierarchy = hierarchy && hierarchy.length > 0;
    const isRootExpanded = expandedNodes.has("root");

    // Root node
    nodes.push({
      id: "root",
      type: "topic",
      position: { x: 0, y: 0 },
      data: {
        name: hasHierarchy ? "All Data" : "Uncategorized Data",
        topicKey: "__all__",
        nodeId: "root",
        recordCount: records.length,
        isRoot: true,
      },
    });

    if (hasHierarchy) {
      const processLevel = (
        levelNodes: TopicHierarchyNode[],
        parentId: string,
        depth: number,
        startX: number
      ): number => {
        let totalWidth = 0;
        const levelY = depth * VERTICAL_SPACING;

        levelNodes.forEach((node) => {
          const nodeId = `topic-${node.id}`;
          const hasChildren = node.children && node.children.length > 0;
          const recordCount = recordCountsByTopic[node.name] || 0;
          const isNodeExpanded = expandedNodes.has(nodeId);
          const currentNodeWidth = isNodeExpanded ? NODE_WIDTH_EXPANDED : NODE_WIDTH;

          // Calculate children width first for proper centering
          let childrenWidth = 0;
          if (hasChildren) {
            childrenWidth = processLevel(
              node.children!,
              nodeId,
              depth + 1,
              startX + totalWidth
            );
          }

          const nodeWidth = Math.max(currentNodeWidth, childrenWidth);
          const nodeX = startX + totalWidth + (nodeWidth - currentNodeWidth) / 2;

          nodes.push({
            id: nodeId,
            type: "topic",
            position: { x: nodeX, y: levelY },
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
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: "hsl(var(--border))", strokeWidth: 2 },
          });

          totalWidth += nodeWidth + HORIZONTAL_SPACING;
        });

        return totalWidth - HORIZONTAL_SPACING; // Remove last spacing
      };

      const totalWidth = processLevel(hierarchy, "root", 1, 0);

      // Center root node above children
      const rootNodeWidth = isRootExpanded ? NODE_WIDTH_EXPANDED : NODE_WIDTH;
      nodes[0].position.x = (totalWidth - rootNodeWidth) / 2;
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [hierarchy, records.length, recordCountsByTopic, expandedNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when props change
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <div className="flex-1 w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.01 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false} // Layout is automatic, don't allow manual dragging
        nodesConnectable={false} // Hierarchy is managed via dialog, not by drawing edges
        elementsSelectable={true} // Required for NodeResizer to work
        selectNodesOnDrag={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background gap={20} size={1} color="hsl(var(--border) / 0.3)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// Main component that wraps with context provider
export function TopicHierarchyCanvas({
  hierarchy,
  records,
  datasetId,
  onSelectTopic,
  selectedTopic,
  onAddTopic,
  onRenameTopic,
  onDeleteTopic,
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
}: TopicHierarchyCanvasProps) {
  return (
    <TopicCanvasProvider
      records={records}
      datasetId={datasetId}
      selectedTopic={selectedTopic}
      onSelectTopic={onSelectTopic}
      onAddTopic={onAddTopic}
      onRenameTopic={onRenameTopic}
      onDeleteTopic={onDeleteTopic}
      onUpdateRecordTopic={onUpdateRecordTopic}
      onDeleteRecord={onDeleteRecord}
      onSaveRecord={onSaveRecord}
    >
      <TopicHierarchyCanvasInner hierarchy={hierarchy} />
    </TopicCanvasProvider>
  );
}
