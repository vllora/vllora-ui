import { Handle, Position } from "@xyflow/react";
import { ChevronDown } from "lucide-react";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";

export const ModelNode = ({ id, data }: { id: string; data: Record<string, unknown> }) => {
  const label = data.label as string;
  const isExpanded = data.isExpanded as boolean;
  const requestJson = data.requestJson as Record<string, any> | undefined;
  const finishReason = data.finishReason as string | undefined;
  const inputHandles = data.inputHandles as string[] | undefined;
  const inputAngles = data.inputAngles as Record<string, number> | undefined;
  const nodeWidth = data.nodeWidth as number | undefined;
  const expandedHeight = data.expandedHeight as number | undefined;
  const onToggleExpand = data.onToggleExpand as ((nodeId: string) => void) | undefined;

  // Parse provider and model name from label (e.g., "openai/gpt-4.1-mini")
  const hasProvider = label?.includes('/');
  const providerName = hasProvider ? label.split('/')[0] : null;
  const modelName = hasProvider ? label.split('/').slice(1).join('/') : label;

  // Extract key parameters from request
  const getRequestParams = () => {
    if (!requestJson) return null;
    const params: Record<string, any> = {};
    if (requestJson.temperature !== undefined) params.temperature = requestJson.temperature;
    if (requestJson.max_tokens !== undefined) params.max_tokens = requestJson.max_tokens;
    if (requestJson.top_p !== undefined) params.top_p = requestJson.top_p;
    if (requestJson.frequency_penalty !== undefined) params.frequency_penalty = requestJson.frequency_penalty;
    if (requestJson.presence_penalty !== undefined) params.presence_penalty = requestJson.presence_penalty;
    if (requestJson.stream !== undefined) params.stream = requestJson.stream;
    return Object.keys(params).length > 0 ? params : null;
  };

  const requestParams = getRequestParams();

  return (
    <div
      className="relative bg-[#161b22] border border-[#30363d] rounded-md shadow-sm cursor-pointer hover:brightness-110 transition-all"
      style={{ width: nodeWidth ?? 220 }}
    >
      {/* Dynamic handles positioned based on input node angles (centered on edges) */}
      {inputHandles && inputHandles.length > 0 ? (
        inputHandles.map((handleId) => {
          const angle = inputAngles?.[handleId];
          if (angle === undefined) return null;

          const sinAngle = Math.sin(angle);
          const cosAngle = Math.cos(angle);

          let position: Position;

          // Determine which edge based on angle of input node
          // Use threshold of 0.7 (~45°) to determine primary direction
          if (sinAngle < -0.7) {
            // Input is above → handle on TOP edge
            position = Position.Top;
          } else if (sinAngle > 0.7) {
            // Input is below → handle on BOTTOM edge
            position = Position.Bottom;
          } else if (cosAngle > 0.7) {
            // Input is to the right → handle on RIGHT edge
            position = Position.Right;
          } else {
            // Input is to the left → handle on LEFT edge
            position = Position.Left;
          }

          return (
            <Handle
              key={handleId}
              type="target"
              position={position}
              id={handleId}
              className="!bg-[#30363d] !w-0 !h-0 !border-0"
            />
          );
        })
      ) : (
        <Handle type="target" position={Position.Left} className="!bg-[#30363d] !w-0 !h-0 !border-0" />
      )}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {providerName ? (
            <ProviderIcon provider_name={providerName} className="w-5 h-5" />
          ) : (
            <ProviderIcon provider_name={'langdb'} className="w-5 h-5" />
          )}
          <span className="text-sm font-medium text-zinc-200 truncate max-w-[140px]">{modelName}</span>
          <ChevronDown
            className={`w-3 h-3 ml-auto text-zinc-500 transition-transform cursor-pointer hover:text-zinc-300 ${isExpanded ? 'rotate-180' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.(id);
            }}
          />
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div
            className="mt-2 pt-2 border-t border-zinc-700/50 space-y-2 overflow-y-auto nowheel nopan"
            style={{ maxHeight: expandedHeight ?? 180 }}
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {finishReason && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Finish:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700/50 text-zinc-300">
                  {finishReason}
                </span>
              </div>
            )}

            {requestParams && (
              <div className="space-y-1">
                <span className="text-xs text-zinc-500">Parameters:</span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  {Object.entries(requestParams).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-zinc-500">{key}:</span>
                      <span className="text-zinc-300">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {requestJson && (
              <details className="text-xs">
                <summary className="text-zinc-500 cursor-pointer hover:text-zinc-400">Request JSON</summary>
                <pre className="mt-1 p-1.5 bg-zinc-900/50 rounded text-zinc-400 overflow-x-auto max-h-[100px] overflow-y-auto text-[10px]">
                  {JSON.stringify(requestJson, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
