/**
 * StatsBadge
 *
 * Displays token count, turn count, and tool count statistics for a conversation.
 * Includes a tooltip with role-by-role breakdown.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Coins, MessageSquare } from "lucide-react";
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
  /** Compact mode: token-only display, no icons or turn count */
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

/** Count turns by role */
function countTurnsByRole(data: unknown): Record<string, number> {
  const messages = extractMessages(data);
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    const role = msg.role.toLowerCase();
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

const ROLE_LABELS: Record<string, string> = {
  system: "System",
  user: "User",
  human: "User",
  assistant: "Assistant",
  ai: "Assistant",
  model: "Assistant",
  tool: "Tool",
};

const ROLE_COLORS: Record<string, string> = {
  system: "text-amber-400",
  user: "text-blue-400",
  human: "text-blue-400",
  assistant: "text-emerald-400",
  ai: "text-emerald-400",
  model: "text-emerald-400",
  tool: "text-green-400",
};

export function StatsBadge({ data, className, compact }: StatsBadgeProps) {
  const tokens = estimateTokens(data);
  const turns = countTurns(data);
  const toolInfo = useMemo(() => extractToolInfo(data), [data]);
  const roleCounts = useMemo(() => countTurnsByRole(data), [data]);

  // ─── Compact mode: token count only ─────────────────────────────────────────
  if (compact) {
    const compactBadge = (
      <span className={cn("text-[10px] text-muted-foreground/70 tabular-nums cursor-help shrink-0 whitespace-nowrap", className)}>
        {formatNumber(tokens)}t
      </span>
    );

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{compactBadge}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px]">
            <div className="text-xs space-y-2">
              <div>
                <p className="font-semibold text-muted-foreground mb-0.5">Estimated Tokens</p>
                <p className="text-foreground">{formatNumber(tokens)}</p>
              </div>
              {Object.keys(roleCounts).length > 0 && (
                <div>
                  <p className="font-semibold text-muted-foreground mb-0.5">Turns ({turns})</p>
                  <div className="space-y-0.5">
                    {Object.entries(roleCounts).map(([role, count]) => (
                      <div key={role} className="flex items-center justify-between">
                        <span className={ROLE_COLORS[role] || "text-zinc-400"}>{ROLE_LABELS[role] || role}</span>
                        <span className="text-foreground font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {toolInfo.totalCount > 0 && (
                <div>
                  <p className="font-semibold text-muted-foreground mb-0.5">Tools ({toolInfo.totalCount})</p>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ─── Default mode: full stats display ───────────────────────────────────────
  const badge = (
    <div className={cn("flex flex-col gap-1 cursor-help", className)}>
      <div className="flex items-center gap-1.5 text-[11px]">
        <Coins className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground font-medium">{formatNumber(tokens)}</span>
        <span className="text-muted-foreground">tokens</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <MessageSquare className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground">{turns} turns</span>
      </div>
      {toolInfo.totalCount > 0 && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="w-3 h-3 flex items-center justify-center text-zinc-500 italic font-serif text-[10px]">fx</span>
          <span className="text-muted-foreground">{toolInfo.totalCount} tools</span>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px]">
          <div className="text-xs space-y-2">
            {/* Token estimate */}
            <div>
              <p className="font-semibold text-muted-foreground mb-0.5">
                Estimated Tokens
              </p>
              <p className="text-foreground">{formatNumber(tokens)}</p>
            </div>

            {/* Turn breakdown by role */}
            {Object.keys(roleCounts).length > 0 && (
              <div>
                <p className="font-semibold text-muted-foreground mb-0.5">
                  Turns ({turns})
                </p>
                <div className="space-y-0.5">
                  {Object.entries(roleCounts).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between">
                      <span className={ROLE_COLORS[role] || "text-zinc-400"}>
                        {ROLE_LABELS[role] || role}
                      </span>
                      <span className="text-foreground font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tool breakdown */}
            {toolInfo.totalCount > 0 && (
              <div>
                <p className="font-semibold text-muted-foreground mb-0.5">
                  Tools ({toolInfo.totalCount})
                </p>
                <div className="space-y-0.5">
                  {toolInfo.inputTools.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Available</span>
                      <span className="text-foreground font-medium">{toolInfo.inputTools.length}</span>
                    </div>
                  )}
                  {toolInfo.outputToolCalls.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Invoked</span>
                      <span className="text-foreground font-medium">{toolInfo.outputToolCalls.length}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
