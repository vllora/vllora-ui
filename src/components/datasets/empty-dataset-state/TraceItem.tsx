/**
 * TraceItem
 *
 * Renders a single trace card with status, timestamp, and messages.
 */

import { cn } from "@/lib/utils";
import type { Trace } from "./LiveTraceFeed";
import { TraceMessageItem } from "./TraceMessageItem";

interface TraceItemProps {
  trace: Trace;
}

export function TraceItem({ trace }: TraceItemProps) {
  return (
    <div className="p-2 rounded-lg bg-muted/30 border border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium",
            trace.status === "CAPTURED"
              ? "bg-emerald-500/20 text-emerald-500"
              : "bg-muted text-muted-foreground"
          )}
        >
          {trace.status}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {trace.time}
        </span>
      </div>
      <div className="space-y-1">
        {trace.messages.map((msg, j) => (
          <TraceMessageItem key={j} message={msg} />
        ))}
      </div>
    </div>
  );
}
