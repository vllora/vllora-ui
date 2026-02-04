/**
 * TraceMessageItem
 *
 * Renders a single message within a trace (user, assistant, system, tool).
 */

import { cn } from "@/lib/utils";
import type { TraceMessage } from "./LiveTraceFeed";

interface TraceMessageItemProps {
  message: TraceMessage;
}

const roleColors: Record<string, string> = {
  system: "text-amber-500",
  user: "text-blue-500",
  assistant: "text-emerald-500",
  tool: "text-purple-500",
};

export function TraceMessageItem({ message }: TraceMessageItemProps) {
  return (
    <div className="flex gap-1.5 text-[11px]">
      <span
        className={cn(
          "shrink-0 font-medium",
          roleColors[message.role] || "text-muted-foreground"
        )}
      >
        {message.role.toUpperCase()}:
      </span>
      <span className="text-foreground/70 truncate">{message.content}</span>
    </div>
  );
}
