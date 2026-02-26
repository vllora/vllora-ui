/**
 * TraceItem
 *
 * Renders a single trace as a terminal log line.
 * Format: [HH:MM:SS]  [USER] message content...         CAPTURED
 */

import { cn } from "@/lib/utils";
import type { Trace } from "./LiveTraceFeed";

interface TraceItemProps {
  trace: Trace;
}

const roleColors: Record<string, string> = {
  system: "text-amber-500/60",
  user: "text-blue-400/60",
  assistant: "text-[rgba(var(--theme-500),0.6)]",
  tool: "text-purple-400/60",
};

export function TraceItem({ trace }: TraceItemProps) {
  const shortTime = trace.time?.replace(/\.\d+$/, "") || trace.time;

  // Show the last message in the trace
  const displayMsg = trace.messages[trace.messages.length - 1];

  return (
    <div className="flex items-center gap-2 font-mono text-[11px] leading-[1.8] animate-in fade-in slide-in-from-bottom-1 duration-200">
      <span className="shrink-0 text-muted-foreground/25">
        [{shortTime}]
      </span>
      {displayMsg && (
        <>
          <span className={cn("shrink-0 uppercase", roleColors[displayMsg.role] || "text-muted-foreground/40")}>
            [{displayMsg.role}]
          </span>
          <span className="text-muted-foreground/50 truncate">
            {displayMsg.content}
          </span>
        </>
      )}
      <span
        className={cn(
          "shrink-0 ml-auto",
          trace.status === "CAPTURED"
            ? "text-[rgb(var(--theme-500))]"
            : "text-muted-foreground/40"
        )}
      >
        {trace.status}
      </span>
    </div>
  );
}
