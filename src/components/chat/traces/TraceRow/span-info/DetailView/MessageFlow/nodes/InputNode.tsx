import { Handle, Position } from "@xyflow/react";
import { Layers } from "lucide-react";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";

export const InputNode = ({ data }: { data: Record<string, unknown> }) => {
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const roleStyle = getRoleStyle(nodeType);
  const rawMessage = data.rawMessage as Record<string, any> | undefined;
  const toolInfo = data.toolInfo as Record<string, any> | undefined;

  // Get preview text
  const getPreviewText = () => {
    if (toolInfo) {
      const description = toolInfo.function?.description || toolInfo.description || '';
      return description.split('\n')[0].slice(0, 25) + (description.length > 25 ? '...' : '');
    }
    if (rawMessage?.content) {
      if (typeof rawMessage.content === 'string') {
        const firstLine = rawMessage.content.split('\n')[0];
        return firstLine.slice(0, 25) + (firstLine.length > 25 ? '...' : '');
      }
      if (Array.isArray(rawMessage.content)) {
        return null; // Will show content blocks indicator
      }
    }
    return null;
  };

  const previewText = getPreviewText();
  const hasMultipleItems = rawMessage?.content && Array.isArray(rawMessage.content);

  return (
    <div className={`relative ${roleStyle.bgColor} border ${roleStyle.borderColor} rounded-md min-w-[160px] max-w-[200px] shadow-sm cursor-pointer hover:brightness-110 transition-all`}>
      <Handle type="source" position={Position.Right} className="!bg-[#30363d] !w-2 !h-2 !border-0 !right-[0px]" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={roleStyle.textColor}>{getNodeIcon(nodeType)}</span>
          <span className={`text-xs font-medium ${roleStyle.textColor || 'text-zinc-200'}`}>{label}</span>
        </div>
        {previewText && (
          <div className="mt-1.5 text-xs text-zinc-500 truncate">
            {previewText}
          </div>
        )}
        {hasMultipleItems && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500">
            <Layers className="w-3 h-3" />
            <span>{rawMessage.content.length} blocks</span>
          </div>
        )}
      </div>
    </div>
  );
};

