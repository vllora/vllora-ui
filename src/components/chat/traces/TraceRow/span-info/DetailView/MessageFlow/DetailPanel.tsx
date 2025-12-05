import { Message } from "@/types/chat";
import { MarkdownViewer } from "../markdown-viewer";
import { NodeType } from "./types";
import { getNodeIcon, getRoleStyle } from "./utils";
import { ToolInfoPanel } from "./DetailPanel/ToolInfoPanel";
import { MessagePanel } from "./DetailPanel/MessagePanel";
import { ResponsePanel } from "./DetailPanel/ResponsePanel";
import { ModelPanel } from "./DetailPanel/ModelPanel";

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
      <ModelPanel
        label={label}
        finishReason={data.finishReason as string | undefined}
        requestJson={data.requestJson as Record<string, any> | undefined}
      />
    );
  }

  // Tool definition node
  if (data.toolInfo) {
    return (
      <ToolInfoPanel
        toolInfo={data.toolInfo as Record<string, any>}
        nodeType={nodeType}
        label={label}
      />
    );
  }

  // Message node (input/output with rawMessage or preview)
  if (data.rawMessage) {
    return (
      <MessagePanel
        rawMessage={data.rawMessage as Message}
        nodeType={nodeType}
        label={label}
      />
    );
  }

  // Response node with rawResponse
  if (data.rawResponse) {
    return (
      <ResponsePanel
        rawResponse={data.rawResponse as Record<string, any>}
        nodeType={nodeType}
        label={label}
        count={data.count as number | undefined}
      />
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
