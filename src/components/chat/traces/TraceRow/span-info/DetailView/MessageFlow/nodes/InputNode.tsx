import { Handle, Position } from "@xyflow/react";
import { ChevronDown, Layers } from "lucide-react";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle, getEdgeColor } from "../utils";
import { MarkdownViewer } from "../../markdown-viewer";
import { ToolInfoDisplay } from "./ToolInfoDisplay";
import { ContentArrayDisplay } from "@/components/chat/messages/ContentArrayDisplay";
import { ToolCallList } from "@/components/chat/messages/ToolCallList";

interface ExpandedContentDisplayProps {
  toolInfo?: Record<string, any>;
  tool_calls?: any[];
  hasMultipleItems: boolean;
  contentArray?: any[];
  getFullContent: () => string;
}

const ExpandedContentDisplay = ({
  tool_calls,
  toolInfo,
  hasMultipleItems,
  contentArray,
  getFullContent,
}: ExpandedContentDisplayProps) => {
  if (toolInfo) {
    return <ToolInfoDisplay toolInfo={toolInfo} />;
  }

  if (hasMultipleItems && contentArray) {
    return (
      <div className="text-xs text-left text-zinc-300 leading-relaxed">
        <ContentArrayDisplay contentArray={contentArray} />
      </div>
    );
  }
  if(tool_calls && tool_calls.length> 0) {
    return <div className="text-xs text-left text-zinc-300 leading-relaxed">
      <ToolCallList toolCalls={tool_calls} hideTitle={true}/>
    </div>
  }

  return (
    <div className="text-xs text-left text-zinc-300 leading-relaxed">
      <MarkdownViewer message={getFullContent()} />
    </div>
  );
};

export const InputNode = ({ data }: { id: string; data: Record<string, unknown> }) => {
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const roleStyle = getRoleStyle(nodeType);
  const rawMessage = data.rawMessage as Record<string, any> | undefined;
  const toolInfo = data.toolInfo as Record<string, any> | undefined;
  const isExpanded = data.isExpanded as boolean;
  const nodeWidth = data.nodeWidth as number | undefined;
  const expandedHeight = data.expandedHeight as number | undefined;
  const onToggleExpand = data.onToggleExpand as ((nodeId: string) => void) | undefined;
  const id = data.id as string;

  rawMessage?.tool_calls && rawMessage.tool_calls && console.log('=== rawMessage', rawMessage)

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
    if(rawMessage?.tool_calls && rawMessage.tool_calls.length > 0){
      return rawMessage.tool_calls.map((t: Record<string, any>) => t.function?.name).join(', ')
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
  // Get glow color based on node type
  const glowColor = getEdgeColor(nodeType);

  return (
    <div
      className={`relative border-2 ${roleStyle.borderColor} rounded-md cursor-pointer hover:brightness-110 transition-all bg-background`}
      style={{
        width: nodeWidth ?? 220,
        boxShadow: `0 0 10px ${glowColor}1A, 0 0 20px ${glowColor}0D, 0 0 30px ${glowColor}08`,
      }}
    >
      {/* Handles on all sides - floating edges calculate positions dynamically */}
      <Handle type="source" position={Position.Top} id="top" className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Left} id="left" className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} id="right" className="!opacity-0 !w-1 !h-1" />
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
            <ExpandedContentDisplay
              toolInfo={toolInfo}
              tool_calls={rawMessage?.tool_calls}
              hasMultipleItems={!!hasMultipleItems}
              contentArray={rawMessage?.content}
              getFullContent={getFullContent}
            />
          </div>
        )}
      </div>
    </div>
  );
};

