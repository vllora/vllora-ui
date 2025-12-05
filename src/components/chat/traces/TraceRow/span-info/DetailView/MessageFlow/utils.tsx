import { User, Bot, Wrench, Settings, MessageSquare, Brain } from "lucide-react";
import { NodeType } from "./types";

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
      return <Wrench className={`w-${size} h-${size}`} />;
    case 'tools':
      return <Wrench className={`w-${size} h-${size}`} />;
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
