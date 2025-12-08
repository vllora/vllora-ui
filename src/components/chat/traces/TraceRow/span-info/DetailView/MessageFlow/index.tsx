import React, { Suspense, useMemo, useState, useCallback, useRef, useEffect } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";
import {
  ReactFlow,
  Node,
  Edge,
  NodeMouseHandler,
  ReactFlowInstance,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { FlowDialogProps, NodeType } from "./types";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { getEdgeColor } from "./utils";
import { extractResponseMessage } from "@/utils/extractResponseMessage";

export type { FlowDialogProps, NodeType } from "./types";

// Override ReactFlow default styles
const flowStyles = `
  .react-flow__node {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
  .react-flow__node-input,
  .react-flow__node-output,
  .react-flow__node-model {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }
  .react-flow__node.selected > div {
    position: relative;
  }
  .react-flow__node.selected > div::before {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 8px;
    padding: 2px;
    background: conic-gradient(from var(--angle), rgb(var(--theme-500)), transparent, rgb(var(--theme-500)));
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: rotate-gradient 2s linear infinite;
  }
  @property --angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }
  @keyframes rotate-gradient {
    to {
      --angle: 360deg;
    }
  }
  .react-flow__handle {
    background: #30363d !important;
    border: none !important;
  }
  .react-flow__edge.animated path {
    stroke-dasharray: 5 5 !important;
    animation: dashdraw 0.5s linear infinite !important;
  }
  .react-flow__edge path {
    stroke-linecap: round !important;
  }
  @keyframes dashdraw {
    from {
      stroke-dashoffset: 10;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
`;

// Custom radial layout - positions input nodes around the model node
const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  expandedNodes: Set<string>
) => {
  // Node size constants
  const NODE_WIDTH = 220;
  const COLLAPSED_HEIGHT = 60;
  const EXPANDED_HEIGHT = 240;

  // Find the model node and input nodes
  const modelNode = nodes.find(n => n.id === 'model');
  const inputNodes = nodes.filter(n => n.id !== 'model');

  if (!modelNode) {
    return { nodes, edges };
  }

  // Calculate radius based on number of inputs - needs to be large for expanded nodes
  const baseRadius = Math.max(350, inputNodes.length * 100);

  // Model node position (center of the layout)
  const modelX = baseRadius + NODE_WIDTH;
  const modelY = baseRadius + EXPANDED_HEIGHT / 2;
  const isModelExpanded = expandedNodes.has('model');
  const modelHeight = isModelExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

  // Position input nodes radially around the model (full 360° circle)
  // Start from top (-90°) and go clockwise
  const startAngle = -Math.PI / 2; // -90° = top

  // Calculate angles for each input node - evenly distributed around the circle
  const inputAngles: Record<string, number> = {};
  inputNodes.forEach((node, index) => {
    const totalInputs = inputNodes.length;
    // Distribute evenly around full circle
    const angle = startAngle + (2 * Math.PI * index) / totalInputs;
    inputAngles[node.id] = angle;
  });

  const layoutedNodes = nodes.map((node) => {
    const isExpanded = expandedNodes.has(node.id);
    const height = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

    if (node.id === 'model') {
      return {
        ...node,
        data: {
          ...node.data,
          inputAngles, // Pass angles to model node for handle positioning
        },
        position: {
          x: modelX - NODE_WIDTH / 2,
          y: modelY - modelHeight / 2,
        },
      };
    }

    // Calculate position for input node
    const angle = inputAngles[node.id];

    // Calculate position on the arc
    const x = modelX + baseRadius * Math.cos(angle) - NODE_WIDTH / 2;
    const y = modelY + baseRadius * Math.sin(angle) - height / 2;

    return {
      ...node,
      data: {
        ...node.data,
        angle, // Pass angle to input node for handle positioning
      },
      position: { x, y },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const FlowDialogContent: React.FC<FlowDialogProps> = ({
  rawRequest,
  rawResponse,
  duration,
  costInfo
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactFlowInstance = useRef<ReactFlowInstance<any, any> | null>(null);

  // Initialize expanded nodes with all node IDs on first render
  useEffect(() => {
    if (expandedNodes === null) {
      const allNodeIds: string[] = ['model'];
      const messages = rawRequest?.messages || [];
      const tools = rawRequest?.tools || [];
      messages.forEach((_: any, index: number) => allNodeIds.push(`input-${index}`));
      tools.forEach((_: any, index: number) => allNodeIds.push(`tool-${index}`));
      setExpandedNodes(new Set(allNodeIds));
    }
  }, [rawRequest, expandedNodes]);

  useEffect(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    const inputNodeIds: string[] = []; // Track all input node IDs for model handles

    // Extract data from raw request/response
    const messagesInput: Array<Record<string, any>> = rawRequest?.messages || [];
    const modelInvoked: string = rawRequest?.model || 'Model';
    const extractedResponse = extractResponseMessage({ responseObject: rawResponse });

    // Create individual nodes for each message in order (positions will be set by dagre)
    messagesInput.forEach((message: Record<string, any>, index: number) => {
      const role = message.role || message.type;
      let nodeType: NodeType = 'user';
      let label = 'Message';

      if (role === 'system') {
        nodeType = 'system';
        label = 'System';
      } else if (role === 'user') {
        nodeType = 'user';
        label = 'User';
      } else if (role === 'tool') {
        nodeType = 'tool';
        label = 'Tool Result';
      } else if (role === 'assistant') {
        if (message.tool_calls && message.tool_calls.length > 0) {
          nodeType = 'tools';
          label = 'Tool Calls';
        } else {
          nodeType = 'assistant';
          label = 'Assistant';
        }
      } else {
        return; // Skip unknown message types
      }

      const nodeId = `input-${index}`;
      inputNodeIds.push(nodeId);

      const preview = typeof message.content === 'string'
        ? message.content
        : (nodeType === 'tools' && message.tool_calls
          ? message.tool_calls.map((t: Record<string, any>) => t.function?.name).join(', ')
          : '');

      flowNodes.push({
        id: nodeId,
        type: 'input',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          label,
          nodeType,
          preview,
          rawMessage: message
        },
      });

      flowEdges.push({
        id: `${nodeId}-model`,
        source: nodeId,
        target: 'model',
        targetHandle: nodeId, // Connect to specific handle on model
        type: 'default',
        style: { stroke: getEdgeColor(nodeType), strokeWidth: 2 },
      });
    });

    // Add each tool as a separate input node
    const toolsDefinition: Array<Record<string, any>> = rawRequest?.tools || [];

    toolsDefinition.forEach((tool: Record<string, any>, index: number) => {
      const toolName = tool.function?.name || tool.name || 'Tool';
      const toolDescription = tool.function?.description || tool.description || '';
      const nodeId = `tool-${index}`;
      inputNodeIds.push(nodeId);

      flowNodes.push({
        id: nodeId,
        type: 'input',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          label: toolName,
          nodeType: 'tools',
          preview: toolDescription,
          toolInfo: tool,
        },
      });

      flowEdges.push({
        id: `${nodeId}-model`,
        source: nodeId,
        target: 'model',
        targetHandle: nodeId, // Connect to specific handle on model
        type: 'default',
        style: { stroke: getEdgeColor('tools'), strokeWidth: 2 },
      });
    });

    // Add model node with handles for each input
    flowNodes.push({
      id: 'model',
      type: 'model',
      position: { x: 0, y: 0 }, // Will be set by dagre
      data: {
        label: modelInvoked || 'Model',
        finishReason: extractedResponse.finish_reason,
        requestJson: rawRequest,
        inputHandles: inputNodeIds, // Pass input IDs for dynamic handle creation
      },
    });

    // Apply dagre layout to calculate node positions
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      flowNodes,
      flowEdges,
      expandedNodes ?? new Set()
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    // return { nodes: flowNodes, edges: flowEdges };
  }, [rawRequest, rawResponse, expandedNodes]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev ?? []);
      if (newSet.has(node.id)) {
        newSet.delete(node.id);
      } else {
        newSet.add(node.id);
      }
      return newSet;
    });
  }, []);

  const onPaneClick = useCallback(() => {
    // Don't collapse all on pane click - let users manually collapse each node
  }, []);

  // Refit the graph when expanded nodes change
  useEffect(() => {
    const timer = setTimeout(() => {
      reactFlowInstance.current?.fitView({ padding: 0.3, duration: 300 });
    }, 50);
    return () => clearTimeout(timer);
  }, [expandedNodes]);

  // Add expanded state and extra data to nodes
  const nodesWithSelection = useMemo(() => {
    const expanded = expandedNodes ?? new Set<string>();
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isExpanded: expanded.has(node.id),
        // Pass extra data needed for expanded details
        rawRequest,
        duration,
        costInfo,
      },
    }));
  }, [nodes, expandedNodes, rawRequest, duration, costInfo]);

  const hasData = nodes.length > 1; // At least model + one other node

  if (!hasData) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <GitBranch className="w-3.5 h-3.5 mr-1" />
          <span className="text-xs">Flow</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 overflow-hidden flex flex-col">
        <style>{flowStyles}</style>
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-zinc-200">
            <GitBranch className="w-5 h-5" />
            Visual Flow
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ReactFlow
            nodes={nodesWithSelection}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            
          >
            {/* <Controls
              showInteractive={false}
              className="!border-border !shadow-none [&>button]:!bg-[#161b22] [&>button]:!border-[#30363d] [&>button]:!text-zinc-400 [&>button:hover]:!bg-[#21262d]"
            /> */}
          </ReactFlow>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Wrapper with ErrorBoundary and Suspense to prevent crashes
export const FlowDialog: React.FC<FlowDialogProps> = (props) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="text-xs text-zinc-500 px-2">
          Flow view unavailable
        </div>
      }
    >
      <Suspense fallback={null}>
        <FlowDialogContent {...props} />
      </Suspense>
    </ErrorBoundary>
  );
};
