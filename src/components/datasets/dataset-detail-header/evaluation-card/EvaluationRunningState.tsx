/**
 * EvaluationRunningState
 *
 * Card showing dry run progress while evaluation is running.
 * Displays progress bar, completion stats, and pass/fail counts.
 */

import { Loader2, Check, X } from "lucide-react";
import type { DryRunJob } from "@/types/dry-run-job";
import {
  getJobTotalRows,
  getJobCompletedRows,
  getJobFailedRows,
  getJobAverageScore,
  getJobPassedCount,
  getJobFailedGradingCount,
} from "@/types/dry-run-job";

interface EvaluationRunningStateProps {
  /** The currently running dry run job */
  runningJob: DryRunJob;
  /** Callback when clicking to open dry run dialog */
  onDryRunClick?: () => void;
}

export function EvaluationRunningState({
  runningJob,
  onDryRunClick,
}: EvaluationRunningStateProps) {
  const totalRows = getJobTotalRows(runningJob);
  const completedRows = getJobCompletedRows(runningJob);
  const failedRows = getJobFailedRows(runningJob);
  const averageScore = getJobAverageScore(runningJob);
  const passedCount = getJobPassedCount(runningJob);
  const failedGradingCount = getJobFailedGradingCount(runningJob);

  const progress = totalRows > 0
    ? Math.round((completedRows / totalRows) * 100)
    : 0;
  const hasAvgScore = averageScore !== undefined;
  const hasPassedCount = passedCount > 0;
  const hasFailures = failedRows > 0 || failedGradingCount > 0;

  return (
    <button
      onClick={onDryRunClick}
      className="w-full px-4 py-3 rounded-lg bg-muted/50 flex flex-col min-h-[88px] hover:bg-muted/70 transition-colors cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-2">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
          <span className="text-xs text-muted-foreground">
            Dry run in progress...
          </span>
        </div>
        {hasAvgScore && (
          <span className="text-xs font-medium text-foreground">
            {(averageScore * 100).toFixed(0)}% avg
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between w-full">
        {/* Progress count */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground tabular-nums">
            {completedRows}
          </span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalRows}
          </span>
          <span className="text-[10px] text-muted-foreground/70 ml-0.5">
            ({progress}%)
          </span>
        </div>

        {/* Pass/Fail badges */}
        {(hasPassedCount || hasFailures) && (
          <div className="flex items-center gap-1.5">
            {hasPassedCount && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10">
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-500 tabular-nums">
                  {passedCount}
                </span>
              </div>
            )}
            {hasFailures && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10">
                <X className="w-3 h-3 text-red-500" />
                <span className="text-xs font-medium text-red-500 tabular-nums">
                  {failedRows + failedGradingCount}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
