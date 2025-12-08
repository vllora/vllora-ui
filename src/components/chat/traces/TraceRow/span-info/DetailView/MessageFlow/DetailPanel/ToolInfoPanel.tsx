import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";

interface ToolInfoPanelProps {
  toolInfo: Record<string, any>;
  nodeType: NodeType;
  label: string;
}

export const ToolInfoPanel = ({ toolInfo, nodeType, label }: ToolInfoPanelProps) => {
  const roleStyle = getRoleStyle(nodeType);
  const description = toolInfo.function?.description || toolInfo.description || '';
  const parameters = toolInfo.function?.parameters || toolInfo.parameters;
  const toolName = toolInfo.function?.name || toolInfo.name || '';

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <span className={roleStyle.textColor}>{getNodeIcon(nodeType)}</span>
        <span className="text-sm font-medium text-zinc-200">{toolName || label}</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
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
    </div>
  );
};
