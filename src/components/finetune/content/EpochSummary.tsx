/**
 * EpochSummary
 *
 * Displays a summary of epoch training results with progress indicators.
 */

import { cn } from "@/lib/utils";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";

interface EpochSummaryProps {
  results: FinetuneEvalResultsResponse['results'];
}

export function EpochSummary({ results }: EpochSummaryProps) {
  // Collect all epochs across all rows
  const epochStats = new Map<number, { scores: number[]; count: number }>();

  for (const row of results) {
    for (const [epochStr, evalResults] of Object.entries(row.epochs)) {
      const epoch = parseInt(epochStr, 10);
      if (!epochStats.has(epoch)) {
        epochStats.set(epoch, { scores: [], count: 0 });
      }
      const stats = epochStats.get(epoch)!;
      for (const result of evalResults) {
        stats.count++;
        if (typeof result.score === 'number') {
          stats.scores.push(result.score);
        }
      }
    }
  }

  // Sort epochs
  const sortedEpochs = Array.from(epochStats.entries()).sort(([a], [b]) => a - b);

  if (sortedEpochs.length === 0) {
    return <div className="text-xs text-muted-foreground">No epoch data available</div>;
  }

  // Calculate average scores per epoch
  const epochData = sortedEpochs.map(([epoch, stats]) => {
    const avgScore = stats.scores.length > 0
      ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
      : null;
    return { epoch, avgScore, count: stats.count };
  });

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
        <span className="font-mono">{results.length}</span>

        <span className="text-muted-foreground">Latest Epoch:</span>
        <span className="font-mono">{epochData[epochData.length - 1]?.epoch ?? '-'}</span>

        {epochData.length > 0 && epochData[epochData.length - 1].avgScore !== null && (
          <>
            <span className="text-muted-foreground">Latest Avg Score:</span>
            <span className={cn(
              "font-mono",
              epochData[epochData.length - 1].avgScore! >= 0.7
                ? "text-green-600"
                : epochData[epochData.length - 1].avgScore! >= 0.4
                ? "text-yellow-600"
                : "text-red-600"
            )}>
              {epochData[epochData.length - 1].avgScore!.toFixed(2)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
