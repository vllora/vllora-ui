import { Handle, Position } from "@xyflow/react";
import { ChevronDown, Layers } from "lucide-react";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";
import { MarkdownViewer } from "../../markdown-viewer";
import { ToolInfoDisplay } from "./ToolInfoDisplay";
import { ContentArrayDisplay } from "@/components/chat/messages/ContentArrayDisplay";

export const InputNode = ({ id, data }: { id: string; data: Record<string, unknown> }) => {
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const roleStyle = getRoleStyle(nodeType);
  const rawMessage = data.rawMessage as Record<string, any> | undefined;
  const toolInfo = data.toolInfo as Record<string, any> | undefined;
  const isExpanded = data.isExpanded as boolean;
  const angle = data.angle as number | undefined;
  const nodeWidth = data.nodeWidth as number | undefined;
  const expandedHeight = data.expandedHeight as number | undefined;
  const onToggleExpand = data.onToggleExpand as ((nodeId: string) => void) | undefined;

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

  // Get full content for expanded view
  const getFullContent = () => {
    if (toolInfo) {
      return toolInfo.function?.description || toolInfo.description || '';
    }
    if (rawMessage?.content) {
      if (typeof rawMessage.content === 'string') {
        return rawMessage.content;
      }
      if (Array.isArray(rawMessage.content)) {
        return rawMessage.content
          .map((block: any) => {
            if (block.type === 'text') return block.text;
            if (block.type === 'image_url') return '[Image]';
            return JSON.stringify(block);
          })
          .join('\n\n');
      }
    }
    return '';
  };
  // Calculate handle position to face towards the model (centered on edge)
  const getHandlePosition = () => {
    if (angle === undefined) {
      return Position.Right;
    }

    const sinAngle = Math.sin(angle);
    const cosAngle = Math.cos(angle);

    // Handle should point towards model (opposite direction of node's position)
    // Use threshold of 0.7 (~45°) to determine primary direction
    if (sinAngle < -0.7) {
      // Node is above model → handle on BOTTOM edge
      return Position.Bottom;
    } else if (sinAngle > 0.7) {
      // Node is below model → handle on TOP edge
      return Position.Top;
    } else if (cosAngle > 0.7) {
      // Node is to the right of model → handle on LEFT edge
      return Position.Left;
    } else {
      // Node is to the left of model → handle on RIGHT edge
      return Position.Right;
    }
  };

  const handlePosition = getHandlePosition();

  return (
    <div
      className="relative border border-border rounded-md shadow-sm cursor-pointer hover:brightness-110 transition-all bg-background"
      style={{ width: nodeWidth ?? 220 }}
    >
      <Handle type="source" position={handlePosition} className="!bg-[#30363d] !w-0 !h-0 !border-0" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex-shrink-0 ${roleStyle.textColor}`}>{getNodeIcon(nodeType)}</span>
          <span
            className={`text-xs font-medium truncate ${roleStyle.textColor || 'text-zinc-200'}`}
            title={label}
          >
            {label}
          </span>
          {
            <div className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
              {toolInfo && toolInfo.function && toolInfo.function.parameters && Object.keys(toolInfo.function.parameters).length > 0 && <span>{Object.keys(toolInfo.function.parameters).length} params</span>}
              <ChevronDown
                className={`w-3 h-3 ml-auto text-zinc-500 transition-transform cursor-pointer hover:text-zinc-300 ${isExpanded ? 'rotate-180' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand?.(id);
                }}
              />
            </div>}
        </div>

        {!isExpanded && previewText && (
          <div className="mt-1.5 text-left text-xs text-zinc-500 truncate">
            {previewText}
          </div>
        )}
        {!isExpanded && hasMultipleItems && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500">
            <Layers className="w-3 h-3" />
            <span>{rawMessage.content.length} blocks</span>
          </div>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div
            className="mt-2 pt-2 border-t border-zinc-700/50 overflow-y-auto nowheel nopan"
            style={{ maxHeight: expandedHeight ?? 180 }}
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {toolInfo ? (
              <ToolInfoDisplay toolInfo={toolInfo} />
            ) : hasMultipleItems ? (<div className="text-xs text-left text-zinc-300 leading-relaxed"><ContentArrayDisplay contentArray={rawMessage.content} /> </div>) : (
              <div className="text-xs text-left text-zinc-300 leading-relaxed">
                <MarkdownViewer message={getFullContent()} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

