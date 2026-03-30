/**
 * RunningView
 *
 * Shows real-time progress during dry run execution.
 * Clean, minimal design focused on progress indication.
 */

import { cn } from "@/lib/utils";
import type { EvalJob } from "@/types/eval-job";
import {
  getJobTotalRows,
  getJobCompletedRows,
  getJobFailedRows,
  getJobAverageScore,
  getJobPassedCount,
} from "@/types/eval-job";
import { flattenEvaluationResults } from "@/services/finetune-api";
import { ResultsTable } from "./ResultsTable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RunningViewProps {
  job: EvalJob;
  progress: number;
  /** Callback when record ID is clicked — enables navigation to record */
  onRecordIdClick?: (recordId: string) => void;
}

export function RunningView({ job, progress, onRecordIdClick }: RunningViewProps) {
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
      {/* Compact progress section */}
      <div className="shrink-0 space-y-1.5">
        {/* Single row: label + progress bar + stats */}
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
          <span className="text-[11px] text-zinc-400 shrink-0">
            {completedRows}/{totalRows}
          </span>
          {/* Inline thin progress bar */}
          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-zinc-500 shrink-0">{progress}%</span>
          {hasAvgScore && (
            <>
              <span className="text-zinc-700 shrink-0">&middot;</span>
              <span className={cn(
                "text-[11px] font-mono shrink-0",
                averageScore >= 0.7
                  ? "text-[rgb(var(--theme-400))]"
                  : averageScore >= 0.4
                  ? "text-amber-400"
                  : "text-red-400"
              )}>
                {averageScore.toFixed(2)} avg
              </span>
            </>
          )}
          {hasResults && (
            <>
              {passedCount > 0 && (
                <>
                  <span className="text-zinc-700 shrink-0">&middot;</span>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[11px] text-[rgb(var(--theme-500))] shrink-0 cursor-help">
                          {passedCount} passed
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-[11px]">{passedCount} records scored above 0.5</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              {failedRows > 0 && (
                <>
                  <span className="text-zinc-700 shrink-0">&middot;</span>
                  <span className="text-[11px] text-red-400 shrink-0">
                    {failedRows} failed
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Results table - flexible height */}
      <div className="flex-1 min-h-0 mt-2">
        <ResultsTable
          results={results}
          totalRows={totalRows}
          fillHeight
          onRowClick={onRecordIdClick ? (r) => onRecordIdClick(r.dataset_row_id) : undefined}
        />
      </div>
    </div>
  );
}
