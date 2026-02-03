/**
 * LiveTraceFeed
 *
 * Displays real-time trace feed from the gateway.
 * Shows captured API requests and connection status.
 */

import { Circle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TraceMessage {
  role: string;
  content: string;
}

export interface Trace {
  time: string;
  status: string;
  messages: TraceMessage[];
}

interface LiveTraceFeedProps {
  isActive: boolean;
  traces: Trace[];
  className?: string;
}

export function LiveTraceFeed({ isActive, traces, className }: LiveTraceFeedProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden flex flex-col",
      className
    )}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Circle className={cn(
            "w-2 h-2 fill-current",
            isActive ? "text-emerald-500 animate-pulse" : "text-muted-foreground"
          )} />
          <span className="text-sm font-medium">Live Trace Feed</span>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/50 text-xs text-muted-foreground">
          <Circle className="w-1.5 h-1.5 fill-current text-emerald-500" />
          LISTENING
        </span>
      </div>

      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        {traces.length > 0 ? (
          traces.map((trace, i) => (
            <div key={i} className="p-2 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium",
                  trace.status === "CAPTURED"
                    ? "bg-emerald-500/20 text-emerald-500"
                    : "bg-muted text-muted-foreground"
                )}>
                  {trace.status}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">{trace.time}</span>
              </div>
              <div className="space-y-1">
                {trace.messages.map((msg, j) => (
                  <div key={j} className="flex gap-1.5 text-[11px]">
                    <span className={cn(
                      "shrink-0 font-medium",
                      msg.role === "system" && "text-amber-500",
                      msg.role === "user" && "text-blue-500",
                      msg.role === "assistant" && "text-emerald-500",
                      msg.role === "tool" && "text-purple-500"
                    )}>
                      {msg.role.toUpperCase()}:
                    </span>
                    <span className="text-foreground/70 truncate">{msg.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            {/* Animated radar effect */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border border-emerald-500/20 animate-ping" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border border-emerald-500/30 animate-pulse" />
              </div>
              <div className="relative w-20 h-20 flex items-center justify-center">
                <Radio className="w-6 h-6 text-emerald-500/60" />
              </div>
            </div>

            {/* Text with animated dots */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Waiting for traces
                <span className="inline-flex w-6">
                  <span className="animate-[bounce_1s_ease-in-out_infinite]">.</span>
                  <span className="animate-[bounce_1s_ease-in-out_0.2s_infinite]">.</span>
                  <span className="animate-[bounce_1s_ease-in-out_0.4s_infinite]">.</span>
                </span>
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Run the curl command to capture requests
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
