import { useMemo } from "react";
import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";

interface ModelPanelProps {
  label: string;
  finishReason?: string;
  requestJson?: Record<string, any>;
}

export const ModelPanel = ({ label, finishReason, requestJson }: ModelPanelProps) => {
  // Parse provider and model name from label (e.g., "openai/gpt-4.1-mini")
  const hasProvider = label?.includes('/');
  const providerName = hasProvider ? label.split('/')[0] : null;
  const modelName = hasProvider ? label.split('/').slice(1).join('/') : label;

  // Filter requestJson to exclude messages and tools
  const filteredRequestJson = useMemo(() => {
    if (!requestJson) return null;
    const { messages, tools, ...rest } = requestJson;
    return Object.keys(rest).length > 0 ? rest : null;
  }, [requestJson]);

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        {providerName ? (
          <ProviderIcon provider_name={providerName} className="w-5 h-5" />
        ) : (
          <ProviderIcon provider_name="langdb" className="w-5 h-5" />
        )}
        <span className="text-sm font-medium text-zinc-200">{modelName}</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
        {filteredRequestJson && (
          <div>
            <div className="text-xs font-medium text-zinc-400 mb-2">Request Parameters</div>
            <div className="text-xs">
              <JsonViewer data={filteredRequestJson} collapsed={10} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
