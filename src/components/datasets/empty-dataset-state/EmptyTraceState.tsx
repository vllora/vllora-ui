/**
 * EmptyTraceState
 *
 * Displays the waiting state when no traces have been captured yet.
 * Shows an animated radar effect and instructional text.
 */

import { Radio } from "lucide-react";

export function EmptyTraceState() {
  return (
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
  );
}
