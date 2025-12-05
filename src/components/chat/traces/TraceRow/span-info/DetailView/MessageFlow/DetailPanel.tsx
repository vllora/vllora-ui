import { Message } from "@/types/chat";
import { MarkdownViewer } from "../markdown-viewer";
import { ContentArrayDisplay } from "@/components/chat/messages/ContentArrayDisplay";
import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";
import { NodeType } from "./types";
import { getNodeIcon, getRoleStyle } from "./utils";

interface DetailPanelProps {
  selectedNode: {
    id: string;
    type: string;
    data: Record<string, any>;
  } | null;
}

export const DetailPanel = ({ selectedNode }: DetailPanelProps) => {
  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Click on a node to view details
      </div>
    );
  }

  const { data, type } = selectedNode;
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const roleStyle = getRoleStyle(nodeType || 'model');

  // Handle different node types
  if (type === 'model') {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className={roleStyle.textColor}>{getNodeIcon('model')}</span>
          <span className="text-sm font-medium text-zinc-200">{label}</span>
        </div>
        {data.finishReason && (
          <div className="text-xs text-zinc-400">
            <span className="font-medium">Finish Reason:</span> {data.finishReason}
          </div>
        )}
      </div>
    );
  }

  // Tool definition node
  if (data.toolInfo) {
    const toolInfo = data.toolInfo as Record<string, any>;
    const description = toolInfo.function?.description || toolInfo.description || '';
    const parameters = toolInfo.function?.parameters || toolInfo.parameters;
    const toolName = toolInfo.function?.name || toolInfo.name || '';

    return (
      <div className="h-full overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className={roleStyle.textColor}>{getNodeIcon(nodeType)}</span>
          <span className="text-sm font-medium text-zinc-200">{toolName || label}</span>
        </div>
        {description && (
          <div>
            <div className="text-xs font-medium text-zinc-400 mb-1">Description</div>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap">{description}</div>
          </div>
        )}
        {parameters && (
          <div>
            <div className="text-xs font-medium text-zinc-400 mb-1">Parameters</div>
            <div className="text-xs">
              <JsonViewer data={parameters} collapsed={10} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Message node (input/output with rawMessage or preview)
  if (data.rawMessage) {
    const rawMessage = data.rawMessage as Message;
    const typeOfContent = typeof rawMessage.content;
    const isStringContent = typeOfContent === 'string';
    const stringContent = isStringContent ? rawMessage.content as string : undefined;
    const arrayContent = !isStringContent && Array.isArray(rawMessage.content) ? rawMessage.content as any[] : undefined;

    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className={roleStyle.textColor}>{getNodeIcon(nodeType)}</span>
          <span className="text-sm font-medium text-zinc-200">{label}</span>
        </div>
        {arrayContent && <ContentArrayDisplay contentArray={arrayContent} />}
        {!arrayContent && stringContent && (
          <div className="text-foreground leading-relaxed whitespace-normal break-words text-sm">
            <MarkdownViewer message={stringContent} />
          </div>
        )}
      </div>
    );
  }

  // Output node with preview string
  if (data.preview) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className={roleStyle.textColor}>{getNodeIcon(nodeType)}</span>
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          {data.count && data.count > 1 && (
            <span className="text-xs text-zinc-500">×{data.count}</span>
          )}
        </div>
        <div className="text-foreground leading-relaxed whitespace-normal break-words text-sm">
          <MarkdownViewer message={data.preview as string} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
      No details available
    </div>
  );
};
