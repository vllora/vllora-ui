import { User, Bot, Wrench, Settings, MessageSquare, Brain } from "lucide-react";
import { Node, Edge } from "@xyflow/react";
import { NodeType } from "./types";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";

export interface RoleStyle {
  textColor: string;
  bgColor: string;
  borderColor: string;
}

export const getNodeIcon = (type: NodeType, size: string = '4') => {

  switch (type) {
    case 'user':
      return <User className={`w-${size} h-${size}`} />;
    case 'system':
      return <Settings className={`w-${size} h-${size}`} />;
    case 'tool':
      return <WrenchScrewdriverIcon className={`w-${size} h-${size}`} />;
    case 'tools':
      return <WrenchScrewdriverIcon className={`w-${size} h-${size}`} />;
    case 'model':
      return <Brain className="w-5 h-5" />;
    case 'response':
      return <Bot className={`w-${size} h-${size}`} />;
    case 'tool_calls':
      return <Wrench className={`w-${size} h-${size}`} />;
    case 'assistant':
      return <Bot className={`w-${size} h-${size}`} />;
    default:
      return <MessageSquare className={`w-${size} h-${size}`} />;
  }
};

// Colors matching SingleMessage getRoleStyle
export const getRoleStyle = (type: NodeType): RoleStyle => {
  switch (type) {
    case 'user':
      return {
        textColor: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20'
      };
    case 'assistant':
    case 'response':
      return {
        textColor: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20'
      };
    case 'system':
      return {
        textColor: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20'
      };
    case 'tool':
    case 'tools':
    case 'tool_calls':
      return {
        textColor: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20'
      };
    case 'model':
      return {
        textColor: 'text-pink-400',
        bgColor: 'bg-pink-500/10',
        borderColor: 'border-pink-500/20'
      };
    default:
      return {
        textColor: 'text-zinc-400',
        bgColor: 'bg-zinc-500/10',
        borderColor: 'border-zinc-500/20'
      };
  }
};

export const getIconColor = (type: NodeType) => {
  return getRoleStyle(type).textColor;
};

// Hex colors for edge strokes (matching Tailwind color values)
export const getEdgeColor = (type: NodeType): string => {
  switch (type) {
    case 'user':
      return '#60a5fa'; // blue-400
    case 'assistant':
    case 'response':
      return '#c084fc'; // purple-400
    case 'system':
      return '#fbbf24'; // amber-400
    case 'tool':
    case 'tools':
    case 'tool_calls':
      return '#4ade80'; // green-400
    case 'model':
      return '#f472b6'; // pink-400
    default:
      return '#a1a1aa'; // zinc-400
  }
};

export const truncateText = (str: string, len: number) =>
  str?.length > len ? str.slice(0, len) + '...' : str;

// Node size constants
const COLLAPSED_HEIGHT = 60;

// Custom radial layout - positions input nodes around the model node
export const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  expandedNodes: Set<string>,
  expandedHeight: number,
  nodeWidth: number
) => {
  const EXPANDED_HEIGHT = expandedHeight;
  const NODE_WIDTH = nodeWidth;

  // Find the model node and input nodes
  const modelNode = nodes.find(n => n.id === 'model');
  const inputNodes = nodes.filter(n => n.id !== 'model');

  if (!modelNode) {
    return { nodes, edges };
  }

  // Calculate radius based on number of inputs and max node size
  const baseRadius = Math.max(250,inputNodes.length * 60,  NODE_WIDTH * 1.2);

  // Model node position (center of the layout)
  const modelX = baseRadius + NODE_WIDTH;
  const modelY = baseRadius + EXPANDED_HEIGHT / 2;
  const isModelExpanded = expandedNodes.has('model');
  const modelHeight = isModelExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

  // Position input nodes radially around the model (full 360° circle)
  // Start from left (180°) and go clockwise
  const startAngle = Math.PI; // 180° = left

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
