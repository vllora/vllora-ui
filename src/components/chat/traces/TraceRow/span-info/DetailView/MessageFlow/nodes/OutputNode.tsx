import { Handle, Position } from "@xyflow/react";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";
import { StringPreview } from "./StringPreview";

export const OutputNode = ({ data }: { data: Record<string, unknown> }) => {
  const nodeType = data.nodeType as NodeType;
  const label = data.label as string;
  const count = data.count as number | undefined;
  const preview = data.preview as string | undefined;
  const roleStyle = getRoleStyle(nodeType);

  return (
    <div className={`relative ${roleStyle.bgColor} border ${roleStyle.borderColor} rounded-md min-w-[160px] max-w-[200px] shadow-sm`}>
      <Handle type="target" position={Position.Left} className="!bg-[#30363d] !w-2 !h-2 !border-0 !left-[0px]" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={roleStyle.textColor}>{getNodeIcon(nodeType)}</span>
          <span className={`text-xs font-medium ${roleStyle.textColor || 'text-zinc-200'}`}>{label}</span>
          {count && count > 1 && (
            <span className="text-xs text-zinc-500">×{count}</span>
          )}
        </div>
        {preview && <StringPreview content={preview} />}
      </div>
    </div>
  );
};
