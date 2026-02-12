/**
 * HistoryView
 *
 * VS Code terminal-style split layout: job details on the left, job list on the right.
 * Also supports a compact list-only mode for the DryRunDialog.
 */

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, ArrowDown, RefreshCw } from "lucide-react";
import { VerdictBadge } from "./VerdictBadge";
import { ScoreHistogram } from "./ScoreHistogram";
import { ResultsTable } from "./ResultsTable";
import { RunningView } from "./RunningView";
import { flattenEvaluationResults } from "@/services/finetune-api";
import { cn } from "@/lib/utils";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobTotalRows, getJobCompletedRows } from "@/types/dry-run-job";

interface HistoryViewProps {
  jobs: DryRunJob[];
  onSelectJob: (job: DryRunJob) => void;
  onBack: () => void;
  /** When true, renders VS Code terminal-style split layout (left: details, right: job list) */
  splitView?: boolean;
  /** Cancel handler for running jobs (used in split view) */
  onCancelJob?: () => void;
  /** Pre-select a specific job when opening */
  initialSelectedId?: string | null;
  /** "Run Again" handler — shown in JobDetail footer when provided */
  onRunAgain?: () => void;
}

function StatusIcon({ status }: { status: DryRunJob["status"] }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  if (status === "cancelled") return <XCircle className="h-3.5 w-3.5 text-zinc-500" />;
  return <Clock className="h-3.5 w-3.5 text-zinc-500" />;
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

/** Inline detail panel for a selected job (left side of split) */
function JobDetail({ job, onCancel, onRunAgain }: { job: DryRunJob; onCancel?: () => void; onRunAgain?: () => void }) {
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
  const recommendations = result?.diagnosis?.recommendations || [];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header summary */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60">
        <span className="text-xs font-medium text-zinc-300">
          {job.sampleSize} samples
        </span>
        {result && <VerdictBadge verdict={result.diagnosis.verdict} />}
        {job.status === "failed" && !result && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
            Failed
          </span>
        )}
        {result?.statistics?.mean !== undefined && (
          <span className="text-xs font-mono text-zinc-400">
            avg {result.statistics.mean.toFixed(2)}
          </span>
        )}
        <span className="text-[10px] text-zinc-600 ml-auto">
          {formatTime(job.createdAt)}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {/* Error banner for failed jobs */}
        {job.status === "failed" && job.error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{job.error}</p>
            </div>
          </div>
        )}

        {showErrorView ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-400">
                  {errorCount === totalCount ? "All" : "Most"} evaluations failed
                </p>
                <p className="text-[11px] text-zinc-400">
                  {errorCount} of {totalCount} encountered errors.
                </p>
              </div>
            </div>
          </div>
        ) : result ? (
          <>
            {scores.length > 0 && (
              <ScoreHistogram scores={scores} showMean showStats resultDiagnosis={result.diagnosis} />
            )}
            {recommendations.length > 0 && (
              <div className="rounded-md bg-zinc-900/50 border border-zinc-800 p-2.5 space-y-1.5">
                <p className="text-xs font-medium text-zinc-400">Recommendations</p>
                <ul className="text-xs text-zinc-500 space-y-1">
                  {recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-zinc-600">-</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null}

        {evaluationResults && evaluationResults.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <ArrowDown className="w-3 h-3" />
              <span>{evaluationResults.length} evaluation{evaluationResults.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="h-[200px]">
              <ResultsTable results={evaluationResults} fillHeight />
            </div>
          </div>
        )}
      </div>

      {/* Footer with Run Again */}
      {onRunAgain && (
        <div className="shrink-0 flex items-center justify-end px-3 py-2 border-t border-zinc-800/60">
          <Button
            onClick={onRunAgain}
            size="sm"
            className="h-7 text-xs gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
          >
            <RefreshCw className="h-3 w-3" />
            Run Again
          </Button>
        </div>
      )}
    </div>
  );
}

export function HistoryView({ jobs, onSelectJob, onBack, splitView = false, onCancelJob, initialSelectedId, onRunAgain }: HistoryViewProps) {
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

  // ── Split view (VS Code terminal-style) ──────────────────────────────
  if (splitView) {
    return (
      <div className="flex h-full min-h-0">
        {/* Left: selected job detail */}
        <div className="flex-1 min-w-0 min-h-0 border-r border-zinc-800/60">
          {selectedJob ? (
            <JobDetail job={selectedJob} onCancel={onCancelJob} onRunAgain={onRunAgain} />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-zinc-600">
              Select a job from the list
            </div>
          )}
        </div>

        {/* Right: job list (narrow sidebar) */}
        <div className="w-48 shrink-0 flex flex-col min-h-0 bg-zinc-900/30">
          <div className="shrink-0 px-2 py-1.5 border-b border-zinc-800/60">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
              Runs
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {jobs.map((job) => {
              const isSelected = job.id === selectedId;
              const meanScore = job.result?.statistics?.mean;
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedId(job.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 flex items-center gap-2 text-xs transition-colors border-l-2",
                    isSelected
                      ? "bg-zinc-800/60 border-l-[rgb(var(--theme-500))] text-zinc-200"
                      : "border-l-transparent text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300"
                  )}
                >
                  <StatusIcon status={job.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium truncate">{job.sampleSize}s</span>
                      {meanScore !== undefined && (
                        <span className="font-mono text-[10px] text-zinc-500">{meanScore.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-600 truncate">
                      {formatTime(job.createdAt)}
                    </div>
                  </div>
                  {job.result && (
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      job.result.diagnosis.verdict === "GO" ? "bg-emerald-500" :
                      job.result.diagnosis.verdict === "NO-GO" ? "bg-red-500" : "bg-amber-500"
                    )} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Classic list view (DryRunDialog) ──────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {jobs.map((job) => (
          <button
            key={job.id}
            className={cn(
              "w-full text-left p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors",
              job.status === "running" && "border-blue-500/50"
            )}
            onClick={() => job.status === "completed" && onSelectJob(job)}
            disabled={job.status !== "completed"}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon status={job.status} />
                <span className="text-sm font-medium">
                  {job.sampleSize} samples
                </span>
              </div>
              {job.result && (
                <VerdictBadge verdict={job.result.diagnosis.verdict} />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span>{new Date(job.createdAt).toLocaleString()}</span>
              {job.status === "running" && (
                <span>{getJobCompletedRows(job)} / {getJobTotalRows(job)}</span>
              )}
              {job.status === "failed" && job.error && (
                <span className="text-red-500 truncate max-w-[200px]">{job.error}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <Separator />

      <div className="flex justify-start">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
