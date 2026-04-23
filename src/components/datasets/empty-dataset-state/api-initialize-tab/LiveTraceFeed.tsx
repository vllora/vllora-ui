/**
 * LiveTraceFeed
 *
 * Terminal-style streaming log of captured API traces.
 * Monospace font, minimal chrome, logs flow bottom-up.
 */

import { cn } from "@/lib/utils";
import { LiveTraceFeedHeader } from "./LiveTraceFeedHeader";
import { TraceItem } from "./TraceItem";
import { EmptyTraceState } from "./EmptyTraceState";

export interface TraceMessage {
  role: string;
  content: string;
}

export interface Trace {
  traceId: string;
  time: string;
  status: string;
  messages: TraceMessage[];
  tools?: unknown[];
  startTimeUs?: number;
}

interface LiveTraceFeedProps {
  traces: Trace[];
  onClear?: () => void;
  className?: string;
}

export function LiveTraceFeed({
  traces,
  onClear,
  className,
}: LiveTraceFeedProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden flex flex-col",
        className
      )}
    >
      <LiveTraceFeedHeader
        traceCount={traces.length}
        onClear={onClear}
      />

      <div className="flex-1 overflow-y-auto">
        {traces.length > 0 ? (
          <div className="px-3 py-2 space-y-1">
            {traces.map((trace, i) => (
              <TraceItem key={i} trace={trace} />
            ))}
          </div>
        ) : (
          <EmptyTraceState />
        )}
      </div>
    </div>
  );
}
