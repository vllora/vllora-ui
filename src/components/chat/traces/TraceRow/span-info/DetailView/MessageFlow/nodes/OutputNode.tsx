import { Handle, Position } from "@xyflow/react";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";
import { extractResponseMessage } from "@/utils/extractResponseMessage";

export const OutputNode = ({ data }: { data: Record<string, any> }) => {
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const preview = data.preview as string | undefined;
  const roleStyle = getRoleStyle(nodeType);
  const hasToolCalls = data.hasToolCalls as boolean | undefined;
  const rawResponse = data.rawResponse
  const { finish_reason } = rawResponse ? extractResponseMessage({
    responseObject: rawResponse,
  }) : {};
  // Get truncated preview text
  const getPreviewText = () => {
    if (!preview) return null;
    const firstLine = preview.split('\n')[0];
    return firstLine.slice(0, 25) + (firstLine.length > 25 ? '...' : '');
  };

  const previewText = getPreviewText();

  return (
    <div className={`relative ${roleStyle.bgColor} border ${roleStyle.borderColor} rounded-md min-w-[160px] max-w-[250px] shadow-sm cursor-pointer hover:brightness-110 transition-all`}>
      <Handle type="target" position={Position.Left} className="!bg-[#30363d] !w-2 !h-2 !border-0 !left-[0px]" />
      {hasToolCalls && (
        <Handle type="source" id="bottom" position={Position.Bottom} className="!bg-[#30363d] !w-2 !h-2 !border-0" />
      )}
      <div className="px-3 py-2.5 flex flex-col">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex-shrink-0 ${roleStyle.textColor}`}>{getNodeIcon(nodeType)}</span>
          <span
            className={`text-xs font-medium truncate ${roleStyle.textColor || 'text-zinc-200'}`}
            title={label}
          >
            {label}
          </span>
        </div>

        {previewText && (
          <div className="mt-1.5 text-xs text-left text-zinc-500 truncate">
            {previewText}
          </div>
        )}
        {!previewText && finish_reason && (
          <div className="mt-1.5 text-left">
            <span className="inline-flex items-start px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700/50 text-zinc-300">
              {finish_reason}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
