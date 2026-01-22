/**
 * StatsBadge
 *
 * Displays token count and turn count statistics for a conversation.
 */

import { cn } from "@/lib/utils";
import { Coins, MessageSquare } from "lucide-react";
import { extractMessages } from "./ConversationThreadCell";

interface StatsBadgeProps {
  data: unknown;
  className?: string;
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

export function StatsBadge({ data, className }: StatsBadgeProps) {
  const tokens = estimateTokens(data);
  const turns = countTurns(data);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5 text-xs">
        <Coins className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-foreground font-medium">{formatNumber(tokens)}</span>
        <span className="text-muted-foreground">tokens</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{turns} turns</span>
      </div>
    </div>
  );
}
