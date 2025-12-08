import { ChevronDown } from "lucide-react";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { DynamicHandles } from "./DynamicHandles";
import { LabelTag } from "../../../../new-timeline/timeline-row/label-tag";

export const ModelNode = ({ id, data }: { id: string; data: Record<string, unknown> }) => {
  const isExpanded = data.isExpanded as boolean;
  const headers = data.headers as any;
  const requestJson = data.requestJson as Record<string, any> | undefined;
  const modelName = data.modelName as string;
  const xLabel = headers && typeof headers === 'object' ? headers['x-label'] : null;
  const nodeWidth = data.nodeWidth as number | undefined;
  const expandedHeight = data.expandedHeight as number | undefined;
  const onToggleExpand = data.onToggleExpand as ((nodeId: string) => void) | undefined;
  const costInfo = data.costInfo as { totalCost?: number; inputTokens?: number; outputTokens?: number } | undefined;

  // Parse provider and model name from label (e.g., "openai/gpt-4.1-mini")
  const hasProvider = modelName?.includes('/');
  const providerName = hasProvider ? modelName.split('/')[0] : null;
  const model_name_display = hasProvider ? modelName.split('/').slice(1).join('/') : modelName;

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
      className="relative border border-border rounded-md cursor-pointer hover:brightness-110 transition-all"
      style={{
        width: nodeWidth ?? 220,
        boxShadow: `0 0 10px rgba(var(--theme-500), 0.1), 0 0 20px rgba(var(--theme-500), 0.05), 0 0 30px rgba(var(--theme-500), 0.03)`,
      }}
    >
      <DynamicHandles />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {providerName ? (
            <ProviderIcon provider_name={providerName} className="w-5 h-5" />
          ) : (
            <ProviderIcon provider_name={'langdb'} className="w-5 h-5" />
          )}
          <span className="text-sm font-medium text-zinc-200 truncate max-w-[140px]">{model_name_display}</span>
          {xLabel && <LabelTag label={xLabel} maxWidth={75} />}
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
    

            {/* Token usage */}
            {(costInfo?.inputTokens !== undefined || costInfo?.outputTokens !== undefined) && (
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                {costInfo?.inputTokens !== undefined && (
                  <span>In: {costInfo.inputTokens.toLocaleString()}</span>
                )}
                {costInfo?.outputTokens !== undefined && (
                  <span>Out: {costInfo.outputTokens.toLocaleString()}</span>
                )}
              </div>
            )}

            {requestParams && (
              <div className="space-y-1">
                <span className="text-xs ">Parameters:</span>
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
          </div>
        )}
      </div>
    </div>
  );
};
