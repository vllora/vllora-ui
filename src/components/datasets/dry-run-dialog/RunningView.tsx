/**
 * RunningView
 *
 * Shows real-time progress during dry run execution.
 * Clean, minimal design focused on progress indication.
 */

import { StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DryRunJob } from "@/types/dry-run-job";
import {
  getJobTotalRows,
  getJobCompletedRows,
  getJobFailedRows,
  getJobAverageScore,
  getJobPassedCount,
} from "@/types/dry-run-job";
import { flattenEvaluationResults } from "@/services/finetune-api";
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
  const hasResults = completedRows > 0 || failedRows > 0;

  // Get results from polling snapshot, flattened for the table
  const results = job.pollingSnapshot?.results ? flattenEvaluationResults(job.pollingSnapshot.results) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Progress section */}
      <div className="shrink-0 space-y-3">
        {/* Progress header with live stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-medium text-zinc-200">
              Evaluating samples...
            </span>
          </div>
          {hasAvgScore && (
            <span className={cn(
              "text-sm font-mono font-medium",
              averageScore >= 0.7
                ? "text-[rgb(var(--theme-400))]"
                : averageScore >= 0.4
                ? "text-amber-400"
                : "text-red-400"
            )}>
              {(averageScore * 100).toFixed(0)}% avg
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative">
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats row - only show meaningful stats */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">
            {completedRows} / {totalRows} ({progress}%)
          </span>
          {hasResults && (
            <div className="flex items-center gap-3">
              {passedCount > 0 && (
                <span className="text-[rgb(var(--theme-400))]">
                  {passedCount} passed
                </span>
              )}
              {failedRows > 0 && (
                <span className="text-red-400">
                  {failedRows} failed
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results table - flexible height */}
      <div className="flex-1 min-h-0 mt-4">
        <ResultsTable results={results} fillHeight />
      </div>

      {/* Footer */}
      <div className="shrink-0 pt-4 space-y-4">
        <Separator className="bg-zinc-800" />
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Dry run continues in the background.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-8 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <StopCircle className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
