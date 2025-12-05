import { Handle, Position } from "@xyflow/react";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";

export const ModelNode = ({ data }: { data: Record<string, unknown> }) => {
  const label = data.label as string;
  const finishReason = data.finishReason as string | undefined;

  // Parse provider and model name from label (e.g., "openai/gpt-4.1-mini")
  const hasProvider = label?.includes('/');
  const providerName = hasProvider ? label.split('/')[0] : null;
  const modelName = hasProvider ? label.split('/').slice(1).join('/') : label;

  return (
    <div className="relative bg-[#161b22] border border-[#30363d] rounded-md min-w-[180px] shadow-sm cursor-pointer hover:brightness-110 transition-all">
      <Handle type="target" position={Position.Left} className="!bg-[#30363d] !w-2 !h-2 !border-0 !left-[0px]" />
      <Handle type="source" position={Position.Right} className="!bg-[#30363d] !w-2 !h-2 !border-0 !right-[0px]" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {providerName ? (
            <ProviderIcon provider_name={providerName} className="w-5 h-5" />
          ) : (
            <ProviderIcon provider_name={'langdb'} className="w-5 h-5" />
          )}
          <span className="text-sm font-medium text-zinc-200 truncate max-w-[140px]">{modelName}</span>
        </div>
        {finishReason && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-pink-500"></span>
            <span className="text-xs text-zinc-400">{finishReason}</span>
          </div>
        )}
      </div>
    </div>
  );
};
