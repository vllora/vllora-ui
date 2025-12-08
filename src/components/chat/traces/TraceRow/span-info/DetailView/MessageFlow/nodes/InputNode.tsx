import { Handle, Position } from "@xyflow/react";
import { ChevronDown, Layers } from "lucide-react";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";
import { MarkdownViewer } from "../../markdown-viewer";

export const InputNode = ({ data }: { data: Record<string, unknown> }) => {
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const roleStyle = getRoleStyle(nodeType);
  const rawMessage = data.rawMessage as Record<string, any> | undefined;
  const toolInfo = data.toolInfo as Record<string, any> | undefined;
  const isExpanded = data.isExpanded as boolean;

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

  // Only tool definitions that are called in response need a target handle for "require invoke" edges
  const isCalledInResponse = data.isCalledInResponse as boolean | undefined;

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

  // Truncate content for display
  const getTruncatedContent = () => {
    const fullContent = getFullContent();
    const maxLength = 500;
    if (fullContent.length > maxLength) {
      return fullContent.slice(0, maxLength) + '...';
    }
    return fullContent;
  };

  return (
    <div className={`relative ${roleStyle.bgColor} border ${roleStyle.borderColor} rounded-md shadow-sm cursor-pointer hover:brightness-110 transition-all ${isExpanded ? 'w-[300px]' : 'min-w-[170px] max-w-[250px]'}`}>
      <Handle type="source" position={Position.Right} className="!bg-[#30363d] !w-2 !h-2 !border-0 !right-[0px]" />
      {isCalledInResponse && (
        <Handle type="target" id="bottom" position={Position.Bottom} className="!bg-[#30363d] !w-2 !h-2 !border-0" />
      )}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex-shrink-0 ${roleStyle.textColor}`}>{getNodeIcon(nodeType)}</span>
          <span
            className={`text-xs font-medium truncate ${roleStyle.textColor || 'text-zinc-200'}`}
            title={label}
          >
            {label}
          </span>
          <ChevronDown className={`w-3 h-3 ml-auto text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
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
            className="mt-2 pt-2 border-t border-zinc-700/50 max-h-[180px] overflow-y-auto nowheel nopan"
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {toolInfo ? (
              <div className="space-y-2">
                <div className="text-xs text-zinc-400 leading-relaxed line-clamp-4">
                  {toolInfo.function?.description || toolInfo.description}
                </div>
                {(toolInfo.function?.parameters || toolInfo.parameters) && (
                  <details className="text-xs">
                    <summary className="text-zinc-500 cursor-pointer hover:text-zinc-400">Parameters</summary>
                    <pre className="mt-1 p-1.5 bg-zinc-900/50 rounded text-zinc-400 overflow-x-auto max-h-[80px] overflow-y-auto text-[10px]">
                      {JSON.stringify(toolInfo.function?.parameters || toolInfo.parameters, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <div className="text-xs text-zinc-300 leading-relaxed">
                <MarkdownViewer message={getTruncatedContent()} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

