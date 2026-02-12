/**
 * HistoryView
 *
 * VS Code terminal-style split layout: job details on the left, job list on the right.
 * Also supports a compact list-only mode for the DryRunDialog.
 */

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";
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
  const stats = result?.statistics;
  const [showRecs, setShowRecs] = useState(false);

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
        {stats?.mean !== undefined && (
          <span className="text-xs font-mono text-zinc-400">
            avg {stats.mean.toFixed(2)}
          </span>
        )}
        <span className="text-[10px] text-zinc-600 ml-auto">
          {formatTime(job.createdAt)}
        </span>
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
      ) : result ? (
        <div className="shrink-0 px-3 pt-2 space-y-2">
          {/* Compact chart + inline stats */}
          {scores.length > 0 && (
            <ScoreHistogram
              scores={scores}
              showMean
              height={120}
              showStats={false}
              showDiagnosis={false}
            />
          )}
          {/* Inline stats row */}
          {stats && (
            <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
              <span>
                Mean <span className="text-zinc-200 font-semibold">{stats.mean.toFixed(2)}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span>
                Std <span className="text-zinc-300">{stats.std.toFixed(2)}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span>
                Min <span className="text-zinc-300">{stats.min.toFixed(2)}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span>
                Max <span className="text-zinc-300">{stats.max.toFixed(2)}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span>
                Med <span className="text-zinc-300">{stats.median.toFixed(2)}</span>
              </span>
            </div>
          )}
          {/* Collapsible recommendations */}
          {recommendations.length > 0 && (
            <button
              onClick={() => setShowRecs((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", showRecs && "rotate-90")} />
              <span>{recommendations.length} recommendation{recommendations.length !== 1 ? "s" : ""}</span>
            </button>
          )}
          {showRecs && recommendations.length > 0 && (
            <ul className="text-[11px] text-zinc-500 space-y-0.5 pl-4">
              {recommendations.map((rec, i) => (
                <li key={i}>- {rec}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Results table fills remaining space */}
      {evaluationResults && evaluationResults.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col px-3 pb-1 pt-2">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-1 shrink-0">
            <span>{evaluationResults.length} evaluation{evaluationResults.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex-1 min-h-0">
            <ResultsTable results={evaluationResults} fillHeight />
          </div>
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
