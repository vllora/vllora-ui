/**
 * LiveTraceFeed
 *
 * Displays real-time trace feed from the gateway.
 * Shows captured API requests and connection status.
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
  isActive: boolean;
  traces: Trace[];
  onClear?: () => void;
  className?: string;
}

export function LiveTraceFeed({
  isActive,
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
      <LiveTraceFeedHeader isActive={isActive} onClear={onClear} />

      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        {traces.length > 0 ? (
          traces.map((trace, i) => <TraceItem key={i} trace={trace} />)
        ) : (
          <EmptyTraceState />
        )}
      </div>
    </div>
  );
}
