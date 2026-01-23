import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFinetuneContext } from '../FinetuneContext';
import { PipelineNode as PipelineNodeType, PipelineStep } from '../types';
import { PipelineNodeComponent } from './PipelineNode';
import { PipelineEdge } from './PipelineEdge';

// Node dimensions and spacing
const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const HORIZONTAL_GAP = 60;
const VERTICAL_GAP = 50;
const SECTION_GAP = 30;

// Define the fixed positions for each step
const getNodePosition = (step: PipelineStep): { x: number; y: number } => {
  // Row 1: Steps 1, 2, 3 (Data Preparation)
  // Row 2: Steps 3 -> 4, 5 (Validation) - note: 3 connects down to 4-5
  // Row 3: Steps 6, 7 (Training)

  const positions: Record<PipelineStep, { x: number; y: number }> = {
    1: { x: 50, y: 80 },
    2: { x: 50 + NODE_WIDTH + HORIZONTAL_GAP, y: 80 },
    3: { x: 50 + 2 * (NODE_WIDTH + HORIZONTAL_GAP), y: 80 },
    4: { x: 50, y: 80 + NODE_HEIGHT + VERTICAL_GAP + SECTION_GAP },
    5: { x: 50 + NODE_WIDTH + HORIZONTAL_GAP, y: 80 + NODE_HEIGHT + VERTICAL_GAP + SECTION_GAP },
    6: { x: 50, y: 80 + 2 * (NODE_HEIGHT + VERTICAL_GAP + SECTION_GAP) },
    7: { x: 50 + NODE_WIDTH + HORIZONTAL_GAP, y: 80 + 2 * (NODE_HEIGHT + VERTICAL_GAP + SECTION_GAP) },
  };

  return positions[step];
};

// Define edge connections
const EDGE_CONNECTIONS: Array<[PipelineStep, PipelineStep]> = [
  [1, 2],
  [2, 3],
  [3, 5], // Coverage to Dry Run
  [5, 4], // Dry Run back to Grader (reverse direction visually)
  [4, 6], // Grader to Train
  [6, 7],
];

// Convert pipeline nodes to React Flow nodes
const createFlowNodes = (
  pipelineNodes: PipelineNodeType[],
  selectedNodeId: PipelineStep | null,
  onNodeSelect: (id: PipelineStep) => void
): Node[] => {
  return pipelineNodes.map(node => ({
    id: `node-${node.id}`,
    type: 'pipeline',
    position: getNodePosition(node.id),
    data: {
      ...node,
      isSelected: selectedNodeId === node.id,
      onSelect: () => onNodeSelect(node.id),
    },
    draggable: false,
    selectable: true,
  }));
};

// Determine edge status based on connected nodes
const getEdgeStatus = (
  fromNode: PipelineNodeType | undefined,
  toNode: PipelineNodeType | undefined
): 'inactive' | 'active' | 'running' => {
  if (!fromNode || !toNode) return 'inactive';

  if (toNode.status === 'running') return 'running';
  if (fromNode.status === 'complete' && toNode.status !== 'waiting') return 'active';
  if (fromNode.status === 'complete') return 'active';

  return 'inactive';
};

// Convert to React Flow edges
const createFlowEdges = (pipelineNodes: PipelineNodeType[]): Edge[] => {
  const nodeMap = new Map(pipelineNodes.map(n => [n.id, n]));

  return EDGE_CONNECTIONS.map(([from, to]) => {
    const fromNode = nodeMap.get(from);
    const toNode = nodeMap.get(to);
    const status = getEdgeStatus(fromNode, toNode);

    return {
      id: `edge-${from}-${to}`,
      source: `node-${from}`,
      target: `node-${to}`,
      type: 'pipeline',
      data: { status },
      animated: status === 'running',
    };
  });
};

// Custom node types
const nodeTypes = {
  pipeline: PipelineNodeComponent,
};

// Custom edge types
const edgeTypes = {
  pipeline: PipelineEdge,
};

// Custom styles for React Flow
const flowStyles = `
  .react-flow__node {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
  .react-flow__handle {
    opacity: 0;
    pointer-events: none;
  }
  .react-flow__edge-path {
    stroke-linecap: round !important;
  }
  .react-flow__edge.animated path {
    stroke-dasharray: 8 4 !important;
    animation: dashdraw 0.5s linear infinite !important;
  }
  @keyframes dashdraw {
    from { stroke-dashoffset: 12; }
    to { stroke-dashoffset: 0; }
  }
`;

interface PipelineCanvasProps {
  className?: string;
}

export function PipelineCanvas({ className }: PipelineCanvasProps) {
  const { currentDataset, selectedNodeId, setSelectedNodeId } = useFinetuneContext();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Update nodes and edges when dataset or selection changes
  useEffect(() => {
    if (!currentDataset) return;

    const flowNodes = createFlowNodes(
      currentDataset.pipelineNodes,
      selectedNodeId,
      setSelectedNodeId
    );
    const flowEdges = createFlowEdges(currentDataset.pipelineNodes);

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [currentDataset, selectedNodeId, setSelectedNodeId, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeId = parseInt(node.id.replace('node-', '')) as PipelineStep;
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId]
  );

  const handlePaneClick = useCallback(() => {
    // Optional: deselect on pane click
    // setSelectedNodeId(null);
  }, []);

  if (!currentDataset) {
    return null;
  }

  return (
    <div className={className}>
      <style>{flowStyles}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.5}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll={true}
        zoomOnScroll={true}
        panOnDrag={true}
      >
        <Background
          color="rgb(39, 39, 42)"
          gap={20}
          size={1}
        />
        <Controls
          showInteractive={false}
          className="!bg-zinc-900/80 !border-zinc-700 !shadow-xl [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700 [&>button:hover]:!text-zinc-200"
        />

        {/* Section Labels */}
        <Panel position="top-left" className="pointer-events-none">
          <div className="space-y-0 ml-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-1" style={{ marginTop: '40px' }}>
              Data Preparation
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium" style={{ marginTop: `${NODE_HEIGHT + VERTICAL_GAP + SECTION_GAP - 20}px` }}>
              Validation
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium" style={{ marginTop: `${NODE_HEIGHT + VERTICAL_GAP + SECTION_GAP - 20}px` }}>
              Training
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
