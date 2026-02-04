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
    <div className="rounded-md border bg-card p-2 text-xs">
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "font-mono px-1.5 py-0.5 rounded",
            sample.score < 0.3
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : sample.score < 0.7
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          )}
        >
          {sample.score.toFixed(2)}
        </span>
      </div>
      <p className="text-muted-foreground line-clamp-2 text-xs">
        Record: {sample.recordId.slice(0, 8)}...
      </p>
      {sample.reason && (
        <>
          {expanded && (
            <div className="mt-2 p-2 rounded bg-muted/50">
              <p className="font-medium mb-1">Reasoning:</p>
              <p className="text-muted-foreground">{sample.reason}</p>
            </div>
          )}
          <button
            className="text-primary text-xs mt-1 hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide reasoning" : "Show reasoning"}
          </button>
        </>
      )}
    </div>
  );
}
