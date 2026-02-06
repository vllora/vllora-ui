/**
 * ToolsBadge
 *
 * Displays a badge showing the number of tools used in a conversation.
 */

import { cn } from "@/lib/utils";
import { DataInfo } from "@/types/dataset-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToolsBadgeProps {
  data: unknown;
  className?: string;
}

interface ToolInfo {
  inputTools: string[];
  outputToolCalls: string[];
  totalCount: number;
}

/**
 * Extract tool information from DataInfo structure
 */
export function extractToolInfo(data: unknown): ToolInfo {
  if (!data || typeof data !== "object") {
    return { inputTools: [], outputToolCalls: [], totalCount: 0 };
  }

  const dataInfo = data as DataInfo;
  const inputTools: string[] = [];
  const outputToolCalls: string[] = [];

  // Get input tools (available tool definitions)
  if (dataInfo?.input?.tools && Array.isArray(dataInfo.input.tools)) {
    for (const tool of dataInfo.input.tools) {
      if (tool && typeof tool === "object" && "name" in tool) {
        inputTools.push(tool.name as string);
      }
    }
  }

  // Get output tool calls (actual tool invocations)
  if (dataInfo?.output?.tool_calls && Array.isArray(dataInfo.output.tool_calls)) {
    for (const call of dataInfo.output.tool_calls) {
      if (call && typeof call === "object" && "name" in call) {
        outputToolCalls.push(call.name as string);
      }
    }
  }

  return {
    inputTools,
    outputToolCalls,
    totalCount: inputTools.length + outputToolCalls.length,
  };
}

/**
 * Count tools from DataInfo structure (legacy helper)
 */
export function countTools(data: unknown): number {
  return extractToolInfo(data).totalCount;
}

export function ToolsBadge({ data, className }: ToolsBadgeProps) {
  const { inputTools, outputToolCalls, totalCount } = extractToolInfo(data);

  const badge = (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-500/10 border border-zinc-500/20 cursor-help",
        className
      )}
    >
      <span className="text-[11px] text-zinc-500 italic font-serif">fx</span>
      <span className="text-[11px] font-medium text-zinc-400">
        {totalCount}
      </span>
    </div>
  );

  // No tooltip if no tools
  if (totalCount === 0) {
    return badge;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <div className="text-xs space-y-2">
            {inputTools.length > 0 && (
              <div>
                <p className="font-semibold text-muted-foreground mb-1">
                  Available Tools ({inputTools.length})
                </p>
                <ul className="space-y-0.5">
                  {inputTools.slice(0, 5).map((name, i) => (
                    <li key={i} className="font-mono text-[10px] text-foreground">
                      {name}
                    </li>
                  ))}
                  {inputTools.length > 5 && (
                    <li className="text-muted-foreground">
                      +{inputTools.length - 5} more...
                    </li>
                  )}
                </ul>
              </div>
            )}
            {outputToolCalls.length > 0 && (
              <div>
                <p className="font-semibold text-muted-foreground mb-1">
                  Tool Calls ({outputToolCalls.length})
                </p>
                <ul className="space-y-0.5">
                  {outputToolCalls.slice(0, 5).map((name, i) => (
                    <li key={i} className="font-mono text-[10px] text-foreground">
                      {name}
                    </li>
                  ))}
                  {outputToolCalls.length > 5 && (
                    <li className="text-muted-foreground">
                      +{outputToolCalls.length - 5} more...
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
