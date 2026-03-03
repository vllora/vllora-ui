/**
 * StatsBadge
 *
 * Displays estimated token count for a training record.
 * Token count is the key metric — determines training cost.
 * Tool usage shown if present (relevant for function-calling datasets).
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { extractMessages } from "./ConversationThreadCell";
import { extractToolInfo } from "./ToolsBadge";

interface StatsBadgeProps {
  data: unknown;
  className?: string;
  /** Compact mode: smaller text, no icons */
  compact?: boolean;
}

/**
 * Estimate token count from messages (~4 chars per token)
 */
export function estimateTokens(data: unknown): number {
  const messages = extractMessages(data);
  const totalChars = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Count conversation turns (number of messages)
 */
export function countTurns(data: unknown): number {
  const messages = extractMessages(data);
  return messages.length;
}

/**
 * Format number with commas for display
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function StatsBadge({ data, className, compact }: StatsBadgeProps) {
  const tokens = estimateTokens(data);
  const toolInfo = useMemo(() => extractToolInfo(data), [data]);
  const hasTools = toolInfo.totalCount > 0;

  // Tooltip content — same for both modes
  const tooltipContent = (
    <div className="text-xs space-y-1">
      <p>~{formatNumber(tokens)} tokens (estimated)</p>
      {hasTools && (
        <p className="text-muted-foreground">
          {toolInfo.totalCount} tool{toolInfo.totalCount !== 1 ? "s" : ""} used
        </p>
      )}
    </div>
  );

  // ─── Compact mode: small inline text ─────────────────────────────────────────
  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "text-[10px] text-muted-foreground/60 tabular-nums cursor-help shrink-0 whitespace-nowrap",
              className
            )}>
              {formatNumber(tokens)} tok
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{tooltipContent}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ─── Default mode: clean token count ─────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            "text-[11px] text-muted-foreground/60 tabular-nums cursor-help shrink-0 whitespace-nowrap",
            className
          )}>
            {formatNumber(tokens)} tok
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
