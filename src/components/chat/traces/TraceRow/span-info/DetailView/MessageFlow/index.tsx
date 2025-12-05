import React, { useMemo } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { FlowDialogProps, NodeType } from "./types";
import { nodeTypes } from "./nodes";
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
      <DialogContent className="max-w-[1200px] w-[90vw] h-[80vh] p-0 overflow-hidden border-[#30363d]">
        <style>{flowStyles}</style>
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-[#30363d]">
          <DialogTitle className="flex items-center gap-2 text-zinc-200">
            <GitBranch className="w-5 h-5" />
            Visual Flow
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 h-[calc(80vh-60px)]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            proOptions={{ hideAttribution: true }}
            // nodesDraggable={true}
            // nodesConnectable={false}
            // elementsSelectable={false}
            // panOnDrag={true}
            // zoomOnScroll={true}
            // defaultEdgeOptions={{ type: 'default' }}
          >
            {/* <Background color="#21262d" gap={20} size={1} /> */}
            <Controls
              showInteractive={true}
              className="!border-[#30363d] !shadow-none [&>button]:!bg-[#161b22] [&>button]:!border-[#30363d] [&>button]:!text-zinc-400 [&>button:hover]:!bg-[#21262d]"
            />
          </ReactFlow>
        </div>
      </DialogContent>
    </Dialog>
  );
};
