/**
 * TraceMessageItem
 *
 * Renders a single message as a terminal log line.
 * Role is a colored fixed-width prefix, content is truncated.
 */

import { cn } from "@/lib/utils";
import type { TraceMessage } from "./LiveTraceFeed";

interface TraceMessageItemProps {
  message: TraceMessage;
}

const roleColors: Record<string, string> = {
  system: "text-amber-500/70",
  user: "text-blue-400/70",
  assistant: "text-[rgb(var(--theme-500))]",
  tool: "text-purple-400/70",
};

export function TraceMessageItem({ message }: TraceMessageItemProps) {
  return (
    <div className="flex gap-2 font-mono text-[11px] leading-[1.7] pl-4">
      <span
        className={cn(
          "shrink-0",
          roleColors[message.role] || "text-muted-foreground/50"
        )}
      >
        {message.role}
      </span>
      <span className="text-muted-foreground/50 truncate">{message.content}</span>
    </div>
  );
}
