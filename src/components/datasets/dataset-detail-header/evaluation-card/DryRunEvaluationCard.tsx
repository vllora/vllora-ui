/**
 * DryRunEvaluationCard
 *
 * Summary card showing dry run evaluation score distribution.
 * Shows blank state if evaluation is not configured.
 * Shows running state if a dry run is in progress.
 * Shows failed state if the last job failed.
 */

import {
  getJobTotalRows,
  getJobFailedRows,
  getJobFailedGradingCount,
} from "@/types/dry-run-job";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { DryRunEmptyState } from "./EvaluationEmptyState";
import { EvaluationFailedState } from "./EvaluationFailedState";
import { EvaluationRunningState } from "./EvaluationRunningState";
import { EvaluationResultsState } from "./EvaluationResultsState";
import { EvaluationErrorState } from "./EvaluationErrorState";

export interface DryRunEvaluationCardProps {
  /** Evaluation script (if set) */
  evalScript?: string;
  /** Callback when clicking to configure evaluation */
  onConfigureClick?: () => void;
  /** Callback when clicking to open dry run dialog */
  onDryRunClick?: () => void;
}

export function DryRunEvaluationCard({ evalScript, onDryRunClick }: DryRunEvaluationCardProps) {
  const { jobs, isLoading, runningJob, lastCompletedJob, cancelDryRun } = DryRunJobsConsumer();

  // No eval script - show setup prompt (clickable)
  if (!evalScript) {
    return <></>
    // return <EvaluationEmptyState onConfigureClick={onConfigureClick} />;
  }

  // Dry run is currently running - show progress with summary stats
  if (runningJob && (runningJob.status === 'running' || runningJob.status === 'pending')) {
    return (
      <EvaluationRunningState
        runningJob={runningJob}
        onDryRunClick={onDryRunClick}
        onCancel={() => cancelDryRun(runningJob.id)}
      />
    );
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

  // Check if this is an error state by looking at the completed job
  const totalRows = lastCompletedJob ? getJobTotalRows(lastCompletedJob) : 0;
  const failedRows = lastCompletedJob ? getJobFailedRows(lastCompletedJob) : 0;
  const failedGrading = lastCompletedJob ? getJobFailedGradingCount(lastCompletedJob) : 0;
  const totalErrors = failedRows + failedGrading;

  // Error state: most evaluations failed (>50% errors)
  const isErrorState = totalRows > 0 && totalErrors > 0 && (totalErrors / totalRows) > 0.5;

  // Error state - show simplified error view
  if (isErrorState) {
    return <EvaluationErrorState onDryRunClick={onDryRunClick} />;
  }

  // Show evaluation results with distribution bars
  return <EvaluationResultsState job={lastCompletedJob} onDryRunClick={onDryRunClick} />;
}
