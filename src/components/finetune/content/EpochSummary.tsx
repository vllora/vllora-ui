/**
 * EpochSummary
 *
 * Displays a summary of epoch training results with progress indicators.
 */

import { cn } from "@/lib/utils";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { computeTrainingSummary } from "./utils";

interface EpochSummaryProps {
  results: FinetuneEvalResultsResponse['results'];
}

export function EpochSummary({ results }: EpochSummaryProps) {
  const summary = computeTrainingSummary(results);

  if (!summary) {
    return <div className="text-xs text-muted-foreground">No epoch data available</div>;
  }

  const { totalRows, epochData, latestEpoch, latestAvgScore } = summary;

  return (
    <div className="space-y-2">
      {/* Epoch Progress Bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-16">Epochs:</span>
        <div className="flex gap-1">
          {epochData.map(({ epoch, avgScore }) => (
            <div
              key={epoch}
              className={cn(
                "w-8 h-6 rounded text-xs flex items-center justify-center font-mono",
                avgScore !== null
                  ? avgScore >= 0.7
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : avgScore >= 0.4
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
              )}
              title={`Epoch ${epoch}: ${avgScore !== null ? avgScore.toFixed(2) : 'No score'}`}
            >
              {epoch}
            </div>
          ))}
        </div>
      </div>

      {/* Score Summary Table */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">Total Rows:</span>
        <span className="font-mono">{totalRows}</span>

        <span className="text-muted-foreground">Latest Epoch:</span>
        <span className="font-mono">{latestEpoch ?? '-'}</span>

        {latestAvgScore !== null && (
          <>
            <span className="text-muted-foreground">Latest Avg Score:</span>
            <span className={cn(
              "font-mono",
              latestAvgScore >= 0.7
                ? "text-green-600"
                : latestAvgScore >= 0.4
                ? "text-yellow-600"
                : "text-red-600"
            )}>
              {latestAvgScore.toFixed(2)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
