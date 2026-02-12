/**
 * DryRunActivityView
 *
 * VS Code terminal-style split layout: job details on the left, job list on the right.
 * Also supports a compact list-only mode for the DryRunDialog.
 */

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { XCircle, AlertTriangle, RefreshCw, RotateCw, ChevronRight } from "lucide-react";
import { VerdictBadge } from "./VerdictBadge";
import { ScoreStrip } from "./ScoreStrip";
import { ResultsTable } from "./ResultsTable";
import { RunningView } from "./RunningView";
import { RunsSidebar } from "./RunsSidebar";
import { flattenEvaluationResults } from "@/services/finetune-api";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobTotalRows, getJobCompletedRows } from "@/types/dry-run-job";

interface DryRunActivityViewProps {
  /** Dataset ID for navigation (click record ID → switch to Records tab) */
  datasetId: string;
  jobs: DryRunJob[];
  /** Cancel handler for running jobs */
  onCancelJob?: () => void;
  /** Pre-select a specific job when opening */
  initialSelectedId?: string | null;
  /** "Run Again" handler — shown in JobDetail footer when provided */
  onRunAgain?: () => void;
  /** Refresh a job's data from the backend API */
  onRefresh?: (jobId: string) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Generate a short human-readable insight from score statistics */
function getScoreInsight(stats: { mean: number; std: number; min: number; max: number }): string {
  const { mean, std, min, max } = stats;
  const range = max - min;

  if (mean < 0.1) {
    return "Nearly all scores are near zero — the dataset may be too hard or the grader too strict.";
  }
  if (mean > 0.95) {
    return "Almost perfect scores across the board — the grader may be too lenient or the task too easy.";
  }
  if (mean > 0.85 && std < 0.1) {
    return `Scores are tightly clustered around ${mean.toFixed(2)} with little variance — quality is consistent but the grader may not differentiate well.`;
  }
  if (mean > 0.7 && std < 0.1) {
    return `Scores cluster around ${mean.toFixed(2)} with low spread — decent quality, but limited differentiation between samples.`;
  }
  if (std > 0.25) {
    return `Wide spread of scores (${min.toFixed(2)}–${max.toFixed(2)}) — the grader is strongly differentiating between samples.`;
  }
  if (mean < 0.4) {
    return `Low average score (${mean.toFixed(2)}) — most samples score poorly. Consider revising the dataset or adjusting grader criteria.`;
  }
  if (range > 0.5 && std > 0.15) {
    return `Scores range from ${min.toFixed(2)} to ${max.toFixed(2)} with moderate spread — good differentiation across sample quality.`;
  }
  return `Average score is ${mean.toFixed(2)} with ${std < 0.15 ? "low" : "moderate"} variance across samples.`;
}

/** Inline detail panel for a selected job (left side of split) */
function JobDetail({ job, datasetId, onCancel, onRunAgain, onRefresh }: { job: DryRunJob; datasetId: string; onCancel?: () => void; onRunAgain?: () => void; onRefresh?: (jobId: string) => void }) {
  const result = job.result;

  const scores = useMemo(() => {
    if (!result) return [];
    const allScores: number[] = [];
    if (result.sampleResults) {
      const { highest, lowest, aroundMean } = result.sampleResults;
      [...(highest || []), ...(lowest || []), ...(aroundMean || [])].forEach((s) => {
        allScores.push(s.score);
      });
    }
    return allScores;
  }, [result]);

  const evaluationResults = useMemo(() => {
    if (!job.pollingSnapshot?.results) return undefined;
    return flattenEvaluationResults(job.pollingSnapshot.results);
  }, [job.pollingSnapshot?.results]);

  const { errorCount, totalCount } = useMemo(() => {
    if (!evaluationResults) return { errorCount: 0, totalCount: 0 };
    const errors = evaluationResults.filter(
      (r) => r.status === "failed" || !!r.error_message
    ).length;
    return { errorCount: errors, totalCount: evaluationResults.length };
  }, [evaluationResults]);

  const recommendations = result?.diagnosis?.recommendations || [];
  const stats = result?.statistics;
  const verdict = result?.diagnosis?.verdict;
  // All hooks must be called before any early returns
  const [showRecs, setShowRecs] = useState(verdict !== "GO" && recommendations.length > 0);

  if (job.status === "running") {
    const total = getJobTotalRows(job);
    const completed = getJobCompletedRows(job);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
      <div className="flex flex-col h-full min-h-0 p-3">
        <RunningView
          job={job}
          progress={pct}
          onCancel={onCancel || (() => {})}
        />
      </div>
    );
  }

  // For non-running jobs without results or evaluation data
  if (!result && !evaluationResults) {
    if (job.status === "failed") {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
          <XCircle className="h-5 w-5 text-red-400" />
          <span className="text-xs text-red-400 text-center">{job.error || "Job failed"}</span>
        </div>
      );
    }
    if (job.status === "cancelled") {
      return (
        <div className="flex items-center justify-center h-full text-xs text-zinc-500">
          Job was cancelled
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-xs text-zinc-600">
        No results available
      </div>
    );
  }

  const showErrorView = totalCount > 0 && (errorCount / totalCount) > 0.5;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800/60">
          {/* Row 1: main info */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="text-xs font-medium text-zinc-300">
              {job.sampleSize} samples
            </span>
            {result && <VerdictBadge verdict={result.diagnosis.verdict} />}
            {job.status === "failed" && !result && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                Failed
              </span>
            )}
            {stats && (
              <UITooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-mono text-zinc-400 cursor-help">
                    avg{" "}
                    <span className="text-zinc-200 font-semibold">{stats.mean.toFixed(2)}</span>
                    <span className="text-zinc-600 mx-0.5">&plusmn;</span>
                    <span className="text-zinc-500">{stats.std.toFixed(2)}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs font-mono">
                  <div className="space-y-0.5">
                    <div>Min: {stats.min.toFixed(2)}</div>
                    <div>Max: {stats.max.toFixed(2)}</div>
                    <div>Median: {stats.median.toFixed(2)}</div>
                  </div>
                </TooltipContent>
              </UITooltip>
            )}
            <span className="text-[10px] text-zinc-600 ml-auto">
              {formatTime(job.createdAt)}
            </span>
            {onRefresh && (
              <button
                onClick={() => onRefresh(job.id)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Refresh data"
              >
                <RotateCw className="h-3 w-3" />
              </button>
            )}
            {onRunAgain && (
              <Button
                onClick={onRunAgain}
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] gap-1 text-zinc-400 hover:text-zinc-200"
              >
                <RefreshCw className="h-3 w-3" />
                Re-run
              </Button>
            )}
          </div>
        </div>

        {/* Error banner for failed jobs */}
        {job.status === "failed" && job.error && (
          <div className="shrink-0 mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5">
            <div className="flex items-start gap-2">
              <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-400 line-clamp-2">{job.error}</p>
            </div>
          </div>
        )}

        {showErrorView ? (
          <div className="shrink-0 mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-400">
                {errorCount === totalCount ? "All" : "Most"} evaluations failed ({errorCount}/{totalCount})
              </p>
            </div>
          </div>
        ) : result && scores.length > 0 ? (
          /* Score strip + recommendations */
          <div className="shrink-0 px-3 pt-2 space-y-1">
            <ScoreStrip scores={scores} mean={stats?.mean} />
            {stats && (
              <p className="text-[11px] text-zinc-300 leading-snug">
                {getScoreInsight(stats)}
              </p>
            )}
            {recommendations.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRecs((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", showRecs && "rotate-90")} />
                  <span>{recommendations.length} recommendation{recommendations.length !== 1 ? "s" : ""}</span>
                </button>
                {showRecs && (
                  <ul className="grid grid-cols-3 gap-x-4 gap-y-0 mt-1 text-[11px] text-zinc-300">
                    {recommendations.map((rec, i) => (
                      <li key={i} className="truncate" title={rec}>
                        <span className="text-zinc-600 mr-1">&#8226;</span>{rec}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Results table fills remaining space */}
        {evaluationResults && evaluationResults.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col px-3 pb-1 pt-2">
            <div className="flex-1 min-h-0">
              <ResultsTable
                results={evaluationResults}
                fillHeight
                onRecordIdClick={(recordId) => {
                  emitter.emit('vllora_switch_tab', { datasetId, tab: 'records' });
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('vllora_highlight_record', {
                      detail: { recordId }
                    }));
                  }, 150);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export function DryRunActivityView({ datasetId, jobs, onCancelJob, initialSelectedId, onRunAgain, onRefresh }: DryRunActivityViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialSelectedId) return initialSelectedId;
    // Default to most recent completed job
    const completed = jobs.find((j) => j.status === "completed");
    return completed?.id ?? jobs[0]?.id ?? null;
  });

  // Sync when initialSelectedId changes externally
  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId]);

  const selectedJob = useMemo(() => {
    return jobs.find((j) => j.id === selectedId) ?? null;
  }, [jobs, selectedId]);

  return (
    <div className="flex h-full min-h-0">
      {/* Left: selected job detail */}
      <div className="flex-1 min-w-0 min-h-0 border-r border-zinc-800/60">
        {selectedJob ? (
          <JobDetail job={selectedJob} datasetId={datasetId} onCancel={onCancelJob} onRunAgain={onRunAgain} onRefresh={onRefresh} />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">
            Select a job from the list
          </div>
        )}
      </div>

      {/* Right: job list sidebar */}
      <RunsSidebar jobs={jobs} selectedId={selectedId} onSelectJob={setSelectedId} />
    </div>
  );
}
