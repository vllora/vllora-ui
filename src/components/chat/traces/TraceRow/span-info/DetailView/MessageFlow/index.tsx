import React, { useMemo, useState, useCallback, useRef } from "react";
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
  Controls,
  NodeMouseHandler,
  ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { FlowDialogProps, NodeType } from "./types";
import { nodeTypes } from "./nodes";
import { getEdgeColor } from "./utils";
import { extractResponseMessage } from "@/utils/extractResponseMessage";
import { DetailPanel } from "./DetailPanel";

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

export const FlowDialog: React.FC<FlowDialogProps> = ({
  rawRequest,
  rawResponse,
}) => {
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: string;
    data: Record<string, any>;
  } | null>(null);
  const [graphHeight, setGraphHeight] = useState(40); // percentage
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactFlowInstance = useRef<ReactFlowInstance<any, any> | null>(null);

  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Extract data from raw request/response
    const messagesInput: Array<Record<string, any>> = rawRequest?.messages || [];
    const modelInvoked: string = rawRequest?.model || 'Model';
    const extractedResponse = extractResponseMessage({ responseObject: rawResponse });

    const inputSpacing = 70;
    let inputYOffset = 0;

    // Create individual nodes for each message in order
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
      const preview = typeof message.content === 'string'
        ? message.content
        : (nodeType === 'tools' && message.tool_calls
            ? message.tool_calls.map((t: Record<string, any>) => t.function?.name).join(', ')
            : '');

      flowNodes.push({
        id: nodeId,
        type: 'input',
        position: { x: 0, y: inputYOffset },
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
        type: 'default',
        style: { stroke: getEdgeColor(nodeType), strokeWidth: 2 },
        animated: true,
      });

      inputYOffset += inputSpacing;
    });

    // Add each tool as a separate input node
    const toolsDefinition: Array<Record<string, any>> = rawRequest?.tools || [];
    toolsDefinition.forEach((tool: Record<string, any>, index: number) => {
      const toolName = tool.function?.name || tool.name || 'Tool';
      const toolDescription = tool.function?.description || tool.description || '';
      const nodeId = `tool-${index}`;

      flowNodes.push({
        id: nodeId,
        type: 'input',
        position: { x: 0, y: inputYOffset },
        data: {
          label: toolName,
          nodeType: 'tools',
          preview: toolDescription,
          toolInfo: tool
        },
      });

      flowEdges.push({
        id: `${nodeId}-model`,
        source: nodeId,
        target: 'model',
        type: 'default',
        style: { stroke: getEdgeColor('tools'), strokeWidth: 2 },
        animated: true,
      });

      inputYOffset += inputSpacing;
    });

    // Calculate model position (centered vertically)
    const totalInputHeight = Math.max(inputYOffset - inputSpacing, 0);
    const modelY = totalInputHeight / 2;

    // Model node - positioned further right for better spacing
    flowNodes.push({
      id: 'model',
      type: 'model',
      position: { x: 300, y: modelY },
      data: {
        label: modelInvoked || 'Model',
        finishReason: extractedResponse.finish_reason,
      },
    });

    // Output nodes - calculate total output count first for centering
    const outputSpacing = 70;
    const hasResponse = extractedResponse.messages && extractedResponse.messages.length > 0;
    const hasToolCalls = extractedResponse.tool_calls && extractedResponse.tool_calls.length > 0;
    const outputCount = (hasResponse ? 1 : 0) + (hasToolCalls ? 1 : 0);
    const totalOutputHeight = Math.max((outputCount - 1) * outputSpacing, 0);
    let outputYOffset = modelY - totalOutputHeight / 2;

    if (hasResponse) {
      const responseContent = extractedResponse.messages
        .map((m: Record<string, any>) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
        .join('\n');
      flowNodes.push({
        id: 'response',
        type: 'output',
        position: { x: 550, y: outputYOffset },
        data: {
          label: 'Response',
          nodeType: 'response',
          count: extractedResponse.messages.length,
          preview: responseContent,
        },
      });
      flowEdges.push({
        id: 'model-response',
        source: 'model',
        target: 'response',
        type: 'default',
        style: { stroke: getEdgeColor('model'), strokeWidth: 2 },
        animated: true,
      });
      outputYOffset += outputSpacing;
    }

    if (hasToolCalls && extractedResponse.tool_calls) {
      flowNodes.push({
        id: 'tool_calls',
        type: 'output',
        position: { x: 550, y: outputYOffset },
        data: {
          label: 'Tool Calls',
          nodeType: 'tool_calls',
          count: extractedResponse.tool_calls.length,
          preview: extractedResponse.tool_calls.map((t: any) => t.function?.name || t.name).join(', '),
        },
      });
      flowEdges.push({
        id: 'model-tool_calls',
        source: 'model',
        target: 'tool_calls',
        type: 'default',
        style: { stroke: getEdgeColor('model'), strokeWidth: 2 },
        animated: true,
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [rawRequest, rawResponse]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNode({
      id: node.id,
      type: node.type || '',
      data: node.data as Record<string, any>,
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100;

      // Clamp between 20% and 80%
      setGraphHeight(Math.min(80, Math.max(20, newHeight)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Fit view after resize ends
      setTimeout(() => {
        reactFlowInstance.current?.fitView({ padding: 0.4 });
      }, 50);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Add selected state to nodes
  const nodesWithSelection = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      selected: node.id === selectedNode?.id,
    }));
  }, [nodes, selectedNode?.id]);

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
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 overflow-hidden border-[#30363d] flex flex-col">
        <style>{flowStyles}</style>
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-[#30363d]">
          <DialogTitle className="flex items-center gap-2 text-zinc-200">
            <GitBranch className="w-5 h-5" />
            Visual Flow
          </DialogTitle>
        </DialogHeader>

        <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden">
          {/* Graph Section */}
          <div style={{ height: `${graphHeight}%` }} className="min-h-0">
            <ReactFlow
              nodes={nodesWithSelection}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onInit={(instance) => { reactFlowInstance.current = instance; }}
              fitView
              fitViewOptions={{ padding: 0.4 }}
              proOptions={{ hideAttribution: true }}
              nodesConnectable={false}
              elementsSelectable={true}
            >
              <Controls
                showInteractive={false}
                className="!border-[#30363d] !shadow-none [&>button]:!bg-[#161b22] [&>button]:!border-[#30363d] [&>button]:!text-zinc-400 [&>button:hover]:!bg-[#21262d]"
              />
            </ReactFlow>
          </div>

          {/* Resize Handle */}
          <div
            className="h-1 cursor-row-resize bg-[#30363d] hover:bg-[#0078d4] transition-colors"
            onMouseDown={handleResizeStart}
          />

          {/* Detail Panel Section */}
          <div className="flex-1 overflow-hidden min-h-0">
            <DetailPanel selectedNode={selectedNode} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
