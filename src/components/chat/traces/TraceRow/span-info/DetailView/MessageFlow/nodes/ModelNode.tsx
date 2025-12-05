import { Handle, Position } from "@xyflow/react";
import { getNodeIcon, getIconColor } from "../utils";

export const ModelNode = ({ data }: { data: Record<string, unknown> }) => {
  const label = data.label as string;
  const finishReason = data.finishReason as string | undefined;
  const iconColor = getIconColor('model');

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-md min-w-[180px] shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-[#30363d] !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-[#30363d] !w-2 !h-2 !border-0" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={iconColor}>{getNodeIcon('model')}</span>
          <span className="text-sm font-medium text-zinc-200 truncate max-w-[140px]">{label}</span>
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
