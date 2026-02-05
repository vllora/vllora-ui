/**
 * DryRunEvaluationCard
 *
 * Summary card showing dry run evaluation score distribution.
 * Shows blank state if evaluation is not configured.
 * Shows running state if a dry run is in progress.
 * Shows failed state if the last job failed.
 */

import { RefreshCw } from "lucide-react";
import {
  getJobTotalRows,
  getJobFailedRows,
  getJobFailedGradingCount,
} from "@/types/dry-run-job";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { EvaluationEmptyState, DryRunEmptyState } from "./EvaluationEmptyState";
import { EvaluationFailedState } from "./EvaluationFailedState";
import { EvaluationRunningState } from "./EvaluationRunningState";

export interface DryRunEvaluationCardProps {
  /** Evaluation script (if set) */
  evalScript?: string;
  /** Callback when clicking to configure evaluation */
  onConfigureClick?: () => void;
  /** Callback when clicking to open dry run dialog */
  onDryRunClick?: () => void;
}

const VERDICT_COLORS = {
  GO: "text-emerald-500",
  WARNING: "text-amber-500",
  "NO-GO": "text-red-500",
};

const VERDICT_BG = {
  GO: "bg-emerald-500",
  WARNING: "bg-amber-500",
  "NO-GO": "bg-red-500",
};

export function DryRunEvaluationCard({ evalScript, onConfigureClick, onDryRunClick }: DryRunEvaluationCardProps) {
  const { jobs, isLoading, runningJob, lastCompletedJob } = DryRunJobsConsumer();

  // No eval script - show setup prompt (clickable)
  if (!evalScript) {
    return <EvaluationEmptyState onConfigureClick={onConfigureClick} />;
  }

  // Dry run is currently running - show progress with summary stats
  if (runningJob && (runningJob.status === 'running' || runningJob.status === 'pending')) {
    return <EvaluationRunningState runningJob={runningJob} onDryRunClick={onDryRunClick} />;
  }

  // Check for failed jobs (most recent first)
  const lastFailedJob = jobs.find((j) => j.status === 'failed');

  // Get dry run stats from last completed job
  const dryRunStats = lastCompletedJob?.result;

  // Still loading - show empty state as placeholder
  if (isLoading) {
    return <DryRunEmptyState onDryRunClick={onDryRunClick} />;
  }

  // No jobs at all - show empty state to run first dry run
  if (jobs.length === 0) {
    return <DryRunEmptyState onDryRunClick={onDryRunClick} />;
  }

  // Has failed job but no completed job with results - show failed state
  if (lastFailedJob && !dryRunStats) {
    return (
      <EvaluationFailedState
        onRetryClick={onDryRunClick}
        errorMessage={lastFailedJob.error}
      />
    );
  }

  // No completed job with results - show empty state
  if (!dryRunStats) {
    return <DryRunEmptyState onDryRunClick={onDryRunClick} />;
  }

  // Show evaluation results
  const { statistics, distribution, diagnosis } = dryRunStats;
  const verdict = diagnosis.verdict as keyof typeof VERDICT_COLORS;
  const verdictColor = VERDICT_COLORS[verdict];

  // Check if this is an error state by looking at the completed job
  const totalRows = lastCompletedJob ? getJobTotalRows(lastCompletedJob) : 0;
  const failedRows = lastCompletedJob ? getJobFailedRows(lastCompletedJob) : 0;
  const failedGrading = lastCompletedJob ? getJobFailedGradingCount(lastCompletedJob) : 0;
  const totalErrors = failedRows + failedGrading;

  // Error state: most evaluations failed (>50% errors)
  const isErrorState = totalRows > 0 && totalErrors > 0 && (totalErrors / totalRows) > 0.5;

  // Error state - show simplified error view
  if (isErrorState) {
    return (
      <button
        onClick={onDryRunClick}
        className="w-full px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 flex flex-col min-h-[88px] hover:bg-red-500/15 transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-between w-full mb-2">
          <span className="text-xs text-muted-foreground">Evaluation</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Verdict:</span>
            <span className="font-medium text-red-500">NO-GO</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-red-400">
            All evaluations failed — click to view details
          </span>
        </div>
      </button>
    );
  }

  // Calculate bar widths for distribution
  const maxCount = Math.max(
    distribution["0.0-0.2"],
    distribution["0.2-0.4"],
    distribution["0.4-0.6"],
    distribution["0.6-0.8"],
    distribution["0.8-1.0"]
  );

  const bars = [
    { label: "0-0.2", count: distribution["0.0-0.2"], color: "bg-red-500/70" },
    { label: "0.2-0.4", count: distribution["0.2-0.4"], color: "bg-orange-500/70" },
    { label: "0.4-0.6", count: distribution["0.4-0.6"], color: "bg-amber-500/70" },
    { label: "0.6-0.8", count: distribution["0.6-0.8"], color: "bg-lime-500/70" },
    { label: "0.8-1", count: distribution["0.8-1.0"], color: "bg-emerald-500/70" },
  ];

  return (
    <div className="px-4 py-3 rounded-lg bg-muted/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Evaluation</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Verdict:</span>
          <span className={`font-medium ${verdictColor}`}>{verdict}</span>
          <button
            onClick={onDryRunClick}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Re-run dry run"
          >
            <RefreshCw className="w-3 h-3 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      </div>

      {/* Score Distribution Bars */}
      <div className="flex items-end gap-1 h-6 mb-2">
        {bars.map((bar) => (
          <div
            key={bar.label}
            className="flex-1 flex flex-col items-center"
            title={`${bar.label}: ${bar.count} samples`}
          >
            <div
              className={`w-full rounded-sm ${bar.color} transition-all`}
              style={{
                height: maxCount > 0 ? `${(bar.count / maxCount) * 100}%` : "2px",
                minHeight: bar.count > 0 ? "4px" : "2px",
              }}
            />
          </div>
        ))}
      </div>

      {/* Stats Legend */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Mean: <span className="font-medium text-foreground">{(statistics.mean * 100).toFixed(0)}%</span>
          </span>
          <span className="text-muted-foreground">
            Std: <span className="font-medium text-foreground">{(statistics.std * 100).toFixed(0)}%</span>
          </span>
        </div>
        <div className={`w-2 h-2 rounded-full ${VERDICT_BG[verdict]}`} />
      </div>
    </div>
  );
}
