/**
 * SampleCard
 *
 * Card displaying an individual sample result with score and optional reasoning.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SampleCardProps {
  sample: {
    recordId: string;
    score: number;
    reason?: string;
  };
}

export function SampleCard({ sample }: SampleCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "font-mono text-xs px-1.5 py-0.5 rounded font-medium",
            sample.score < 0.3
              ? "bg-red-500/15 text-red-400"
              : sample.score < 0.7
              ? "bg-amber-500/15 text-amber-400"
              : "bg-emerald-500/15 text-emerald-400"
          )}
        >
          {sample.score.toFixed(2)}
        </span>
      </div>
      <p className="text-zinc-500 line-clamp-2 text-xs">
        Record: {sample.recordId.slice(0, 8)}...
      </p>
      {sample.reason && (
        <>
          {expanded && (
            <div className="mt-2 p-2 rounded bg-zinc-800/50 border border-zinc-800">
              <p className="font-medium text-zinc-400 mb-1">Reasoning:</p>
              <p className="text-zinc-500">{sample.reason}</p>
            </div>
          )}
          <button
            className="text-emerald-500 text-xs mt-1.5 hover:text-emerald-400 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide reasoning" : "Show reasoning"}
          </button>
        </>
      )}
    </div>
  );
}
