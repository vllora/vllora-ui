/**
 * EvaluationCard
 *
 * Summary card showing evaluation score distribution.
 * Shows blank state if evaluation is not configured.
 * Shows running state if a dry run is in progress.
 */

import { FlaskConical, Loader2, RefreshCw } from "lucide-react";
import type { DryRunStats, EvaluationConfig } from "@/types/dataset-types";
import type { DryRunJob } from "@/types/dry-run-job";
import {
  getJobTotalRows,
  getJobCompletedRows,
  getJobFailedRows,
  getJobAverageScore,
  getJobPassedCount,
  getJobFailedGradingCount,
} from "@/types/dry-run-job";

export interface EvaluationCardProps {
  /** Evaluation configuration (if set) */
  evaluationConfig?: EvaluationConfig;
  /** Dry run stats (if evaluation has been run) */
  dryRunStats?: DryRunStats;
  /** Currently running dry run job (if any) */
  runningJob?: DryRunJob | null;
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

export function EvaluationCard({ evaluationConfig, dryRunStats, runningJob, onConfigureClick, onDryRunClick }: EvaluationCardProps) {
  // No evaluation config - show setup prompt (clickable)
  if (!evaluationConfig) {
    return (
      <button
        onClick={onConfigureClick}
        className="w-full px-4 py-3 rounded-lg bg-muted/50 flex items-center justify-center min-h-[88px] hover:bg-muted/70 transition-colors cursor-pointer"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <FlaskConical className="w-5 h-5 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground">
            Configure evaluation
          </span>
        </div>
      </button>
    );
  }

  // Dry run is currently running - show progress with summary stats
  if (runningJob && (runningJob.status === 'running' || runningJob.status === 'pending')) {
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
        className="w-full px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/50 flex flex-col min-h-[88px] hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
      >
        {/* Header */}
        <div className="flex items-center justify-between w-full mb-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
              Dry run in progress...
            </span>
          </div>
          {hasAvgScore && (
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
              {(averageScore * 100).toFixed(0)}% avg
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-blue-200/50 dark:bg-blue-800/30 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between w-full text-xs">
          <span className="text-blue-600/80 dark:text-blue-400/80">
            {completedRows} / {totalRows} ({progress}%)
          </span>
          {(hasPassedCount || hasFailures) && (
            <div className="flex items-center gap-2">
              {hasPassedCount && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓ {passedCount}
                </span>
              )}
              {hasFailures && (
                <span className="text-red-600 dark:text-red-400">
                  ✗ {failedRows + failedGradingCount}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    );
  }

  // Config exists but no dry run yet
  if (!dryRunStats) {
    return (
      <button
        onClick={onDryRunClick}
        className="w-full px-4 py-3 rounded-lg bg-muted/50 flex items-center justify-center min-h-[88px] hover:bg-muted/70 transition-colors cursor-pointer"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <FlaskConical className="w-5 h-5 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground">
            Run dry run to see scores
          </span>
        </div>
      </button>
    );
  }

  // Show evaluation results
  const { statistics, distribution, diagnosis } = dryRunStats;
  const verdict = diagnosis.verdict;
  const verdictColor = VERDICT_COLORS[verdict];

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
