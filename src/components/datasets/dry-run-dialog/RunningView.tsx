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
import { ResultsTable } from "./ResultsTable";

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
      <ResultsTable results={results} />

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
