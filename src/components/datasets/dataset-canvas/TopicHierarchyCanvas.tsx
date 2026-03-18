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

import { useMemo, useEffect, useRef, useState } from "react";
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
import { Loader2, X } from "lucide-react";
import { TopicNodeComponent, type TopicNodeData } from "./topic-node/TopicNodeComponent";
import { TopicInputNodeComponent } from "./TopicInputNode";
import { RootNodeComponent } from "./RootNodeComponent";
import { CanvasToolbar } from "./CanvasToolbar";
import { TopicCanvasProvider, TopicCanvasConsumer } from "./TopicCanvasContext";
import { TopicRecordsDialogWrapper } from "./TopicRecordsDialogWrapper";
import { TopicInspectorDrawer } from "./TopicInspectorDrawer";
import { SourceGhostNodes } from "./SourceGhostNodes";
import { CanvasEmptyState } from "./CanvasEmptyState";
import { findTopicInHierarchy } from "../record-utils";
import type { CanvasNode } from "./useDagreLayout";
import {
  useDagreLayout,
  getHighlightedEdgeIds,
  DEFAULT_EDGE_STYLE,
  HIGHLIGHTED_EDGE_STYLE,
} from "./useDagreLayout";
import type { TopicHierarchyNode, DatasetRecord, CoverageStats } from "@/types/dataset-types";

// Custom node types with proper typing
const nodeTypes = {
  topic: TopicNodeComponent,
  topicInput: TopicInputNodeComponent,
  root: RootNodeComponent,
} as const;

interface TopicHierarchyCanvasProps {
  /** The topic hierarchy (undefined means no hierarchy yet) */
  hierarchy?: TopicHierarchyNode[];
  /** All records in the dataset */
  records: DatasetRecord[];
  /** Dataset ID */
  workflowId?: string;
  /** Coverage stats for showing distribution info on nodes */
  coverageStats?: CoverageStats;
  /** Called when a topic node is selected to view its data */
  onSelectTopic?: (topicName: string | null) => void;
  /** Currently selected topic (null = root/all) */
  selectedTopic?: string | null;
  /** Called when adding a new topic */
  onAddTopic?: (parentTopicName: string | null) => void;
  /** Called when renaming a topic inline. Receives old name and new name. */
  onRenameTopic?: (oldName: string, newName: string) => void;
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
  /** Called when user wants to generate more data for a specific topic */
  onGenerateForTopic?: (topicName: string) => void;
  /** Called when user wants to generate subtopics for a topic (null = root level) */
  onGenerateSubtopics?: (topicId: string | null) => void;
  /** Called when a record is selected for detail view (opens Sheet) */
  onSelectRecordId?: (id: string | null) => void;
  /** Called when user wants to view the current topic in table view */
  onViewInTable?: (topicId: string) => void;
  /** Dataset training objective (for system prompt segment display on nodes) */
  datasetObjective?: string;
  /** LLM-normalized "You are ..." role sentence (cached on dataset) */
  normalizedObjective?: string;
  /** Per-topic quality scores for canvas node display */
  topicQualityScores?: Record<string, { avg: number; count: number; evaluated: number }>;
}

// Inner component that uses the context
function TopicHierarchyCanvasInner({
  hierarchy,
}: {
  hierarchy?: TopicHierarchyNode[];
}) {
  const { records, expandedNodes, nodeSizes, selectedTopic, setSelectedTopic, pendingAddParentId, layoutVersion, operationProgress, zoomedTopicId, zoomOut } = TopicCanvasConsumer();

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
    pendingAddParentId,
    nodeSizes,
    layoutVersion,
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Store React Flow instance for programmatic control
  const reactFlowInstance = useRef<ReactFlowInstance<CanvasNode> | null>(null);

  // Track changes to avoid unnecessary updates
  const prevLayoutVersionRef = useRef(layoutVersion);
  const prevExpandedNodesRef = useRef(expandedNodes);
  const prevSelectedTopicRef = useRef(selectedTopic);
  const prevNodeCountRef = useRef(layoutedNodes.length);
  const prevRecordCountsByTopicRef = useRef(recordCountsByTopic);
  const isFirstRenderRef = useRef(true);

  // Update nodes when expansion changes, hierarchy changes, record counts change, or manual relayout triggered
  useEffect(() => {
    const expandedNodesChanged =
      prevExpandedNodesRef.current.size !== expandedNodes.size ||
      ![...prevExpandedNodesRef.current].every(id => expandedNodes.has(id));

    // Detect hierarchy changes by comparing node count
    const hierarchyChanged = prevNodeCountRef.current !== layoutedNodes.length;

    // Detect manual relayout trigger
    const manualRelayoutTriggered = prevLayoutVersionRef.current !== layoutVersion;

    // Detect record count changes (when records are assigned/unassigned to topics)
    const recordCountsChanged = JSON.stringify(prevRecordCountsByTopicRef.current) !== JSON.stringify(recordCountsByTopic);

    if (expandedNodesChanged || hierarchyChanged || manualRelayoutTriggered || recordCountsChanged || isFirstRenderRef.current) {
      prevExpandedNodesRef.current = expandedNodes;
      prevNodeCountRef.current = layoutedNodes.length;
      prevLayoutVersionRef.current = layoutVersion;
      prevRecordCountsByTopicRef.current = recordCountsByTopic;
      isFirstRenderRef.current = false;
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

      // Fit view after layout update
      if ((expandedNodesChanged || hierarchyChanged || manualRelayoutTriggered) && reactFlowInstance.current) {
        setTimeout(() => {
          reactFlowInstance.current?.fitView({
            padding: 0.2,
            duration: 300,
          });
        }, 50);
      }
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, expandedNodes, selectedTopic, topicNameToNodeId, nodeIdToParentId, layoutVersion, recordCountsByTopic]);

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
      if (zoomedTopicId) {
        zoomOut();
      }
      setSelectedTopic(null);
    }
  };

  // Zoom-to-inspect: when a topic is zoomed, zoom the viewport to center on it
  useEffect(() => {
    if (!zoomedTopicId || !reactFlowInstance.current) return;

    // Find the node matching the zoomed topic
    const targetNode = nodes.find(n => {
      const data = n.data as TopicNodeData;
      return data?.name === zoomedTopicId || data?.topicKey === zoomedTopicId;
    });

    if (targetNode && targetNode.position) {
      const nodeWidth = targetNode.measured?.width ?? 300;
      const nodeHeight = targetNode.measured?.height ?? 105;
      reactFlowInstance.current.setCenter(
        targetNode.position.x + nodeWidth / 2,
        targetNode.position.y + nodeHeight / 2,
        { zoom: 1.2, duration: 400 },
      );
    }
  }, [zoomedTopicId, nodes]);

  // Apply fade/blur to non-zoomed nodes
  useEffect(() => {
    if (!zoomedTopicId) {
      // Restore all nodes to normal
      setNodes(current =>
        current.map(n => ({
          ...n,
          className: undefined,
          style: { ...n.style, opacity: undefined, filter: undefined, transition: 'opacity 0.3s, filter 0.3s' },
        }))
      );
      return;
    }

    setNodes(current =>
      current.map(n => {
        const data = n.data as TopicNodeData;
        const isZoomed = data?.name === zoomedTopicId || data?.topicKey === zoomedTopicId;
        return {
          ...n,
          style: {
            ...n.style,
            opacity: isZoomed ? 1 : 0.15,
            filter: isZoomed ? undefined : 'blur(1px)',
            transition: 'opacity 0.3s, filter 0.3s',
          },
        };
      })
    );
  }, [zoomedTopicId, setNodes]);

  // 3.7: Banner dismiss state — reset when new operation starts
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const prevOperationRef = useRef(operationProgress);
  useEffect(() => {
    if (prevOperationRef.current === null && operationProgress !== null) {
      setBannerDismissed(false);
    }
    prevOperationRef.current = operationProgress;
  }, [operationProgress]);

  // Fit view callback for toolbar
  const handleFitView = () => {
    reactFlowInstance.current?.fitView({
      padding: 0.2,
      duration: 300,
    });
  };

  // Show empty state when no hierarchy exists
  const hasHierarchy = hierarchy && hierarchy.length > 0;
  if (!hasHierarchy && records.length === 0) {
    return <CanvasEmptyState />;
  }

  return (
    <div className="h-full relative min-w-0 transition-all duration-200">
      {/* P0-15: Operation progress banner */}
      {operationProgress && !bannerDismissed && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg">
          <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--theme-500))]" />
          <span className="text-sm text-foreground">
            {operationProgress.type === "generation" && "Generating data"}
            {operationProgress.type === "import" && "Importing records"}
            {operationProgress.type === "evaluation" && "Running evaluation"}
          </span>
          {operationProgress.completed !== undefined && operationProgress.total !== undefined && (
            <span className="text-xs text-muted-foreground">
              {operationProgress.completed}/{operationProgress.total}
            </span>
          )}
          {operationProgress.topicName && (
            <span className="text-xs text-muted-foreground">
              for &ldquo;{operationProgress.topicName}&rdquo;
            </span>
          )}
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Vignette overlay when zoomed to inspect */}
      {zoomedTopicId && (
        <div
          className="absolute inset-0 z-[1] pointer-events-none transition-opacity duration-300"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%)',
          }}
        />
      )}
      <CanvasToolbar onFitView={handleFitView} />
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
        <Controls
          showInteractive={false}
          className="!bg-background/95 !border-border !shadow-lg [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted"
        />
      </ReactFlow>
    </div>
  );
}

// Layout wrapper: canvas + bottom inspector drawer + ghost nodes overlay
function CanvasWithPanel({ hierarchy }: { hierarchy?: TopicHierarchyNode[] }) {
  const { viewingTopicId, zoomedTopicId, workflowId } = TopicCanvasConsumer();
  const showDrawer = viewingTopicId !== null;

  // Resolve source refs for ghost nodes when a topic is zoomed
  const zoomedSourceRefs = useMemo(() => {
    if (!zoomedTopicId || !hierarchy) return [];
    const node = findTopicInHierarchy(hierarchy, zoomedTopicId);
    return (node?.sourceChunkRefs ?? []) as string[];
  }, [zoomedTopicId, hierarchy]);

  return (
    <div className="relative flex flex-col h-full w-full">
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <TopicHierarchyCanvasInner hierarchy={hierarchy} />
        {/* Source ghost nodes — floating overlay when a topic is zoomed */}
        {zoomedTopicId && zoomedSourceRefs.length > 0 && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-auto">
            <SourceGhostNodes sourceChunkRefs={zoomedSourceRefs} workflowId={workflowId} />
          </div>
        )}
      </div>
      {showDrawer && (
        <div className="relative z-20">
          <TopicInspectorDrawer />
        </div>
      )}
    </div>
  );
}

// Main component that wraps with context provider
export function TopicHierarchyCanvas({
  hierarchy,
  records,
  workflowId,
  coverageStats,
  onSelectTopic,
  selectedTopic,
  onAddTopic,
  onRenameTopic,
  onDeleteTopic,
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
  onCreateChildTopic,
  onGenerateForTopic,
  onGenerateSubtopics,
  onSelectRecordId,
  onViewInTable,
  datasetObjective,
  normalizedObjective: _normalizedObjective,
  topicQualityScores,
}: TopicHierarchyCanvasProps) {
  return (
    <TopicCanvasProvider
      records={records}
      workflowId={workflowId}
      hierarchy={hierarchy}
      coverageStats={coverageStats}
      selectedTopic={selectedTopic}
      onSelectTopic={onSelectTopic}
      onAddTopic={onAddTopic}
      onRenameTopic={onRenameTopic}
      onDeleteTopic={onDeleteTopic}
      onUpdateRecordTopic={onUpdateRecordTopic}
      onDeleteRecord={onDeleteRecord}
      onSaveRecord={onSaveRecord}
      onCreateChildTopic={onCreateChildTopic}
      onGenerateForTopic={onGenerateForTopic}
      onGenerateSubtopics={onGenerateSubtopics}
      onSelectRecordId={onSelectRecordId}
      onViewInTable={onViewInTable}
      datasetObjective={datasetObjective}
      topicQualityScores={topicQualityScores}
    >
      <CanvasWithPanel hierarchy={hierarchy} />
      <TopicRecordsDialogWrapper />
    </TopicCanvasProvider>
  );
}
