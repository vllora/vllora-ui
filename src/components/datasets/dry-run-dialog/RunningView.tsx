/**
 * RunningView
 *
 * Shows real-time progress and results during dry run execution.
 * Displays stats cards and a scrollable table of evaluation results.
 */

import { Loader2, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DryRunJob } from "@/types/dry-run-job";
import {
  getJobTotalRows,
  getJobCompletedRows,
  getJobFailedRows,
  getJobAverageScore,
  getJobPassedCount,
} from "@/types/dry-run-job";

interface RunningViewProps {
  job: DryRunJob;
  progress: number;
  onCancel: () => void;
}

export function RunningView({ job, progress, onCancel }: RunningViewProps) {
  const totalRows = getJobTotalRows(job);
  const completedRows = getJobCompletedRows(job);
  const failedRows = getJobFailedRows(job);
  const averageScore = getJobAverageScore(job);
  const passedCount = getJobPassedCount(job);

  const hasAvgScore = averageScore !== undefined;

  // Get results from polling snapshot
  const results = job.pollingSnapshot?.results ?? [];

  return (
    <div className="space-y-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Running dry run validation...</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress text */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {completedRows} / {totalRows} samples evaluated ({progress}%)
        </p>
      </div>

      {/* Real-time stats */}
      <div className="grid grid-cols-4 gap-2">
        {/* Completed */}
        <div className="rounded-md border bg-card p-2 text-center">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className={cn(
            "text-sm font-mono font-medium",
            completedRows > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}>
            {completedRows}
          </p>
        </div>

        {/* Failed (execution) */}
        <div className="rounded-md border bg-card p-2 text-center">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className={cn(
            "text-sm font-mono font-medium",
            failedRows > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
          )}>
            {failedRows}
          </p>
        </div>

        {/* Passed grading */}
        <div className="rounded-md border bg-card p-2 text-center">
          <p className="text-xs text-muted-foreground">Passed</p>
          <p className={cn(
            "text-sm font-mono font-medium",
            passedCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}>
            {passedCount}
          </p>
        </div>

        {/* Average score */}
        <div className="rounded-md border bg-card p-2 text-center">
          <p className="text-xs text-muted-foreground">Avg Score</p>
          <p className={cn(
            "text-sm font-mono font-medium",
            hasAvgScore
              ? averageScore >= 0.7
                ? "text-emerald-600 dark:text-emerald-400"
                : averageScore >= 0.4
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
          )}>
            {hasAvgScore ? `${(averageScore * 100).toFixed(0)}%` : "-"}
          </p>
        </div>
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">#</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">Score</th>
                  <th className="text-left p-2 font-medium">Reason / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.map((result) => (
                  <tr key={result.dataset_row_id} className="hover:bg-muted/30">
                    <td className="p-2 font-mono text-muted-foreground">
                      {result.row_index + 1}
                    </td>
                    <td className="p-2">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-medium",
                        result.status === "completed"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : result.status === "failed"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      )}>
                        {result.status}
                      </span>
                    </td>
                    <td className="p-2">
                      {result.score != null && result.status === "completed" ? (
                        <span className={cn(
                          "font-mono",
                          result.score >= 0.7
                            ? "text-emerald-600 dark:text-emerald-400"
                            : result.score >= 0.4
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400"
                        )}>
                          {(result.score * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-2 max-w-[200px] truncate text-muted-foreground" title={result.reason || result.error_message}>
                      {result.error_message ? (
                        <span className="text-red-500">{result.error_message}</span>
                      ) : result.reason ? (
                        result.reason
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info message */}
      <p className="text-xs text-muted-foreground text-center">
        You can close this dialog - the dry run will continue in the background.
      </p>

      {/* Cancel button */}
      <div className="flex justify-center">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <StopCircle className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
