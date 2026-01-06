import { Handle, Position } from "@xyflow/react";
import { ChevronDown } from "lucide-react";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";
import { extractResponseMessage } from "@/utils/extractResponseMessage";
import { MarkdownViewer } from "../../markdown-viewer";

export const OutputNode = ({ data }: { data: Record<string, any> }) => {
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const preview = data.preview as string | undefined;
  const roleStyle = getRoleStyle(nodeType);
  const hasToolCalls = data.hasToolCalls as boolean | undefined;
  const rawResponse = data.rawResponse;
  const isExpanded = data.isExpanded as boolean;
  const duration = data.duration;
  const costInfo = data.costInfo;

  const { finish_reason, tool_calls } = rawResponse ? extractResponseMessage({
    responseObject: rawResponse,
  }) : { finish_reason: undefined, tool_calls: undefined };

  // Get truncated preview text
  const getPreviewText = () => {
    if (!preview) return null;
    const firstLine = preview.split('\n')[0];
    return firstLine.slice(0, 25) + (firstLine.length > 25 ? '...' : '');
  };

  const previewText = getPreviewText();

  // Truncate preview for expanded view
  const getTruncatedPreview = () => {
    if (!preview) return '';
    const maxLength = 400;
    if (preview.length > maxLength) {
      return preview.slice(0, maxLength) + '...';
    }
    return preview;
  };

  return (
    <div className={`relative ${roleStyle.bgColor} border ${roleStyle.borderColor} rounded-md shadow-sm cursor-pointer hover:brightness-110 transition-all ${isExpanded ? 'w-[300px]' : 'min-w-[160px] max-w-[250px]'}`}>
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
          <ChevronDown className={`w-3 h-3 ml-auto text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>

        {!isExpanded && previewText && (
          <div className="mt-1.5 text-xs text-left text-zinc-500 truncate">
            {previewText}
          </div>
        )}
        {!isExpanded && !previewText && finish_reason && (
          <div className="mt-1.5 text-left">
            <span className="inline-flex items-start px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700/50 text-zinc-300">
              {finish_reason}
            </span>
          </div>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div
            className="mt-2 pt-2 border-t border-zinc-700/50 space-y-2 max-h-[180px] overflow-y-auto nowheel nopan"
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {/* Stats row */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {finish_reason && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700/50 text-zinc-300">
                  {finish_reason}
                </span>
              )}
              {duration && (
                <span className="text-zinc-500">
                  {typeof duration === 'number' ? `${duration.toFixed(0)}ms` : duration}
                </span>
              )}
              {costInfo?.totalCost && (
                <span className="text-zinc-500">
                  ${costInfo.totalCost.toFixed(6)}
                </span>
              )}
            </div>

            {/* Response content */}
            {preview && (
              <div className="text-xs text-zinc-300 leading-relaxed">
                <MarkdownViewer message={getTruncatedPreview()} />
              </div>
            )}

            {/* Tool calls */}
            {tool_calls && tool_calls.length > 0 && (
              <details className="text-xs">
                <summary className="text-zinc-500 cursor-pointer hover:text-zinc-400">
                  Tool calls ({tool_calls.length})
                </summary>
                <div className="mt-1 space-y-1">
                  {tool_calls.slice(0, 3).map((tc: any, idx: number) => (
                    <div key={idx} className="p-1.5 bg-zinc-900/50 rounded">
                      <div className="font-medium text-amber-400 text-[11px]">
                        {tc.function?.name || tc.name}
                      </div>
                      <pre className="text-zinc-400 overflow-x-auto text-[9px] max-h-[60px] overflow-y-auto">
                        {JSON.stringify(
                          typeof tc.function?.arguments === 'string'
                            ? JSON.parse(tc.function.arguments)
                            : tc.function?.arguments || tc.arguments,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  ))}
                  {tool_calls.length > 3 && (
                    <div className="text-zinc-500 text-[10px]">+{tool_calls.length - 3} more</div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
