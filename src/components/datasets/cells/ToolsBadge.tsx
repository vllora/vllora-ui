/**
 * ToolsBadge
 *
 * Displays a badge showing the number of tools used in a conversation.
 */

import { cn } from "@/lib/utils";
import { DataInfo } from "@/types/dataset-types";

interface ToolsBadgeProps {
  data: unknown;
  className?: string;
}

/**
 * Count tools from DataInfo structure
 */
export function countTools(data: unknown): number {
  if (!data || typeof data !== "object") return 0;

  const dataInfo = data as DataInfo;
  let count = 0;

  // Count input tools
  if (dataInfo?.input?.tools && Array.isArray(dataInfo.input.tools)) {
    count += dataInfo.input.tools.length;
  }

  // Count output tool calls
  if (dataInfo?.output?.tool_calls && Array.isArray(dataInfo.output.tool_calls)) {
    count += dataInfo.output.tool_calls.length;
  }

  return count;
}

export function ToolsBadge({ data, className }: ToolsBadgeProps) {
  const toolCount = countTools(data);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-500/10 border border-zinc-500/20",
        className
      )}
    >
      <span className="text-xs text-zinc-500 italic font-serif">fx</span>
      <span className="text-xs font-medium text-zinc-400">
        {toolCount}
      </span>
    </div>
  );
}
