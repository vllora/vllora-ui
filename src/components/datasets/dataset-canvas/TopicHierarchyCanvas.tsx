/**
 * TopicHierarchyCanvas
 *
 * Visual canvas using @xyflow/react to display the topic hierarchy.
 * - If no hierarchy: Shows a single "Raw Data" root node
 * - If hierarchy exists: Shows the full tree structure with connections
 * - Nodes can expand to show embedded table with records
 * - Uses dagre for automatic tree layout
 * - Uses TopicCanvasContext for state management
 */

import { useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TopicNodeComponent } from "./TopicNodeComponent";
import { TopicInputNodeComponent } from "./TopicInputNode";
import { TopicCanvasProvider, TopicCanvasConsumer } from "./TopicCanvasContext";
import type { CanvasNode } from "./useDagreLayout";
import {
  useDagreLayout,
  getHighlightedEdgeIds,
  DEFAULT_EDGE_STYLE,
  HIGHLIGHTED_EDGE_STYLE,
} from "./useDagreLayout";
import type { TopicHierarchyNode, DatasetRecord } from "@/types/dataset-types";

// Custom node types with proper typing
const nodeTypes = {
  topic: TopicNodeComponent,
  topicInput: TopicInputNodeComponent,
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
  /** Called when creating a new child topic via inline input */
  onCreateChildTopic?: (parentTopicName: string | null, childTopicName: string) => void;
}

// Inner component that uses the context
function TopicHierarchyCanvasInner({
  hierarchy,
}: {
  hierarchy?: TopicHierarchyNode[];
}) {
  const { records, expandedNodes, selectedTopic, setSelectedTopic, pendingAddParentId } = TopicCanvasConsumer();

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

  // Use dagre for automatic tree layout (horizontal left-to-right)
  const {
    nodes: layoutedNodes,
    edges: layoutedEdges,
    topicNameToNodeId,
    nodeIdToParentId,
  } = useDagreLayout(
    hierarchy,
    recordCountsByTopic,
    records.length,
    expandedNodes,
    { direction: "LR" },
    pendingAddParentId
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Store React Flow instance for programmatic control
  const reactFlowInstance = useRef<ReactFlowInstance<CanvasNode> | null>(null);

  // Track changes to avoid unnecessary updates
  const layoutVersionRef = useRef(0);
  const prevExpandedNodesRef = useRef(expandedNodes);
  const prevSelectedTopicRef = useRef(selectedTopic);
  const prevNodeCountRef = useRef(layoutedNodes.length);

  // Update nodes when expansion changes or hierarchy changes (layout recalculation)
  useEffect(() => {
    const expandedNodesChanged =
      prevExpandedNodesRef.current.size !== expandedNodes.size ||
      ![...prevExpandedNodesRef.current].every(id => expandedNodes.has(id));

    // Detect hierarchy changes by comparing node count
    const hierarchyChanged = prevNodeCountRef.current !== layoutedNodes.length;

    if (expandedNodesChanged || hierarchyChanged || layoutVersionRef.current === 0) {
      prevExpandedNodesRef.current = expandedNodes;
      prevNodeCountRef.current = layoutedNodes.length;
      layoutVersionRef.current++;
      setNodes(layoutedNodes);

      // Apply edge highlighting based on current selection
      // Preserve original style for input node edges (dashed style)
      const highlightedEdgeIds = getHighlightedEdgeIds(selectedTopic, topicNameToNodeId, nodeIdToParentId);
      setEdges(layoutedEdges.map(edge => {
        // Keep original style for input node edge (has strokeDasharray)
        if (edge.target === "__input_node__") {
          return edge;
        }
        return {
          ...edge,
          style: highlightedEdgeIds.has(edge.id) ? HIGHLIGHTED_EDGE_STYLE : DEFAULT_EDGE_STYLE,
        };
      }));

      // Fit view after layout update when hierarchy or expansion changes
      if ((expandedNodesChanged || hierarchyChanged) && reactFlowInstance.current) {
        setTimeout(() => {
          reactFlowInstance.current?.fitView({
            padding: 0.2,
            duration: 300,
          });
        }, 50);
      }
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, expandedNodes, selectedTopic, topicNameToNodeId, nodeIdToParentId]);

  // Update only edge styles when selection changes (no layout recalculation)
  useEffect(() => {
    if (prevSelectedTopicRef.current !== selectedTopic) {
      prevSelectedTopicRef.current = selectedTopic;

      // Recompute edge highlighting without changing positions
      // Preserve original style for input node edges (dashed style)
      const highlightedEdgeIds = getHighlightedEdgeIds(selectedTopic, topicNameToNodeId, nodeIdToParentId);
      setEdges(currentEdges =>
        currentEdges.map(edge => {
          // Keep original style for input node edge (has strokeDasharray)
          if (edge.target === "__input_node__") {
            return edge;
          }
          return {
            ...edge,
            style: highlightedEdgeIds.has(edge.id) ? HIGHLIGHTED_EDGE_STYLE : DEFAULT_EDGE_STYLE,
          };
        })
      );
    }
  }, [selectedTopic, topicNameToNodeId, nodeIdToParentId, setEdges]);

  const onInit = (instance: ReactFlowInstance<CanvasNode>) => {
    reactFlowInstance.current = instance;
  };

  // Clear selection when clicking on the canvas background
  // Don't clear if there's a pending add (to avoid accidentally canceling)
  const onPaneClick = () => {
    if (pendingAddParentId === undefined) {
      setSelectedTopic(null);
    }
  };

  return (
    <div className="flex-1 w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
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
  onCreateChildTopic,
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
      onCreateChildTopic={onCreateChildTopic}
    >
      <TopicHierarchyCanvasInner hierarchy={hierarchy} />
    </TopicCanvasProvider>
  );
}
