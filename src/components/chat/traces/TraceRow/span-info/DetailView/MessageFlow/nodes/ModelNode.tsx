import { Handle, Position } from "@xyflow/react";
import { ChevronDown } from "lucide-react";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";

export const ModelNode = ({ data }: { data: Record<string, unknown> }) => {
  const label = data.label as string;
  const isExpanded = data.isExpanded as boolean;
  const requestJson = data.requestJson as Record<string, any> | undefined;
  const finishReason = data.finishReason as string | undefined;

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
    <div className={`relative bg-[#161b22] border border-[#30363d] rounded-md shadow-sm cursor-pointer hover:brightness-110 transition-all ${isExpanded ? 'w-[280px]' : 'min-w-[180px]'}`}>
      <Handle type="target" position={Position.Left} className="!bg-[#30363d] !w-2 !h-2 !border-0 !left-[0px]" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {providerName ? (
            <ProviderIcon provider_name={providerName} className="w-5 h-5" />
          ) : (
            <ProviderIcon provider_name={'langdb'} className="w-5 h-5" />
          )}
          <span className="text-sm font-medium text-zinc-200 truncate max-w-[140px]">{modelName}</span>
          <ChevronDown className={`w-3 h-3 ml-auto text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div
            className="mt-2 pt-2 border-t border-zinc-700/50 space-y-2 max-h-[180px] overflow-y-auto nowheel nopan"
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
