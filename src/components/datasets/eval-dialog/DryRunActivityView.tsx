/**
 * DryRunActivityView
 *
 * VS Code terminal-style split layout: job details on the left, job list on the right.
 * Also supports a compact list-only mode for the DryRunDialog.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { XCircle, AlertTriangle, RefreshCw, RotateCw, ChevronRight, StopCircle, Loader2 } from "lucide-react";
import { VerdictBadge } from "./VerdictBadge";
import { ScoreStrip } from "./ScoreStrip";
import { ResultsTable } from "./ResultsTable";
import { RunningView } from "./RunningView";
import { RunsSidebar } from "./RunsSidebar";
import { flattenEvaluationResults } from "@/services/finetune-api";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import type { EvalJob } from "@/types/eval-job";
import { getJobTotalRows, getJobCompletedRows, getJobFailedRows } from "@/types/eval-job";
import { EvaluatorVersionBadge } from "@/components/shared/EvaluatorVersionBadge";
import { useEvaluatorVersions } from "@/hooks/useEvaluatorVersions";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { computeReadinessGate } from "@/lib/distri-dataset-tools/analysis/compute-readiness-gate";
import { DEFAULT_INFERENCE_PARAMETERS } from "@/services/finetune-api";
import type { TopicEvalStats, ReadinessGate } from "@/types/dataset-types";

/**
 * Map the readiness gate verdict to the cloud verdict format (GO/WARNING/NO-GO).
 * When we have a readiness gate result, it takes priority over the cloud's simpler
 * diagnosis — e.g., the cloud says "GO" but our gate detects 79% score concentration
 * and says "FIX GRADER". This prevents contradictory signals in the UI.
 */
function mapReadinessToVerdict(gate: ReadinessGate | undefined, cloudVerdict: string): string {
  if (!gate) return cloudVerdict;

  // Check if score_concentration is extreme (>70%) — grader is broken
  const concentrationCheck = gate.checks.find(c => c.id === "score_concentration");
  const concentrationBlocksTraining = concentrationCheck != null
    && !concentrationCheck.passed
    && concentrationCheck.value > 0.70;

  if (gate.verdict === "FAIL") return "NO-GO";
  if (gate.verdict === "WARN" && concentrationBlocksTraining) return "NO-GO";
  if (gate.verdict === "WARN") return "WARNING";
  return "GO";
}

interface EvalActivityViewProps {
  /** Dataset ID for navigation (click record ID → switch to Records tab) */
  workflowId: string;
  jobs: EvalJob[];
  /** Cancel handler for running jobs */
  onCancelJob?: () => void;
  /** Pre-select a specific job when opening */
  initialSelectedId?: string | null;
  /** "Run Again" handler — shown in JobDetail footer when provided */
  onRunAgain?: () => void;
  /** Refresh a job's data from the backend API */
  onRefresh?: (jobId: string) => void;
  /** Hide the runs sidebar (used when Explorer already shows job nodes) */
  hideRunsSidebar?: boolean;
}

function formatTime(ts: number): string {
  if (!ts || ts < 1_000_000_000) return "";
  // Detect seconds-precision timestamps and convert to ms
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
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
    return "Nearly all scores are near zero — the dataset may be too hard or the evaluator too strict.";
  }
  if (mean > 0.95) {
    return "Almost perfect scores across the board — the evaluator may be too lenient or the task too easy.";
  }
  if (mean > 0.85 && std < 0.1) {
    return `Scores are tightly clustered around ${mean.toFixed(2)} with little variance — quality is consistent but the evaluator may not differentiate well.`;
  }
  if (mean > 0.7 && std < 0.1) {
    return `Scores cluster around ${mean.toFixed(2)} with low spread — decent quality, but limited differentiation between samples.`;
  }
  if (std > 0.25) {
    return `Wide spread of scores (${min.toFixed(2)}–${max.toFixed(2)}) — the evaluator is strongly differentiating between samples.`;
  }
  if (mean < 0.4) {
    return `Low average score (${mean.toFixed(2)}) — most samples score poorly. Consider revising the dataset or adjusting evaluation criteria.`;
  }
  if (range > 0.5 && std > 0.15) {
    return `Scores range from ${min.toFixed(2)} to ${max.toFixed(2)} with moderate spread — good differentiation across sample quality.`;
  }
  return `Average score is ${mean.toFixed(2)} with ${std < 0.15 ? "low" : "moderate"} variance across samples.`;
}

/** Evaluator version badge that shows staleness for eval jobs */
function EvalJobVersionBadge({ workflowId, jobCreatedAt }: { workflowId: string; jobCreatedAt: number }) {
  const { latestVersion, inferVersionForTimestamp } = useEvaluatorVersions(workflowId);
  const jobVersion = inferVersionForTimestamp(jobCreatedAt);

  if (jobVersion == null || latestVersion == null) return null;

  return (
    <EvaluatorVersionBadge
      jobVersion={jobVersion}
      latestVersion={latestVersion}
    />
  );
}

/** Inline detail panel for a selected job (left side of split) */
function JobDetail({ job, workflowId, onCancel, onRunAgain, onRefresh }: { job: EvalJob; workflowId: string; onCancel?: () => void; onRunAgain?: () => void; onRefresh?: (jobId: string) => void }) {
  const { sortedRecords } = DatasetDetailConsumer();
  const result = job.result;

  // Use ALL scores from evaluationResults (full dataset), fall back to sampled sampleResults
  const scores = useMemo(() => {
    // Prefer full evaluation results (all records)
    if (job.pollingSnapshot?.results) {
      const flat = flattenEvaluationResults(job.pollingSnapshot.results);
      const allScores = flat
        .filter((r) => typeof r.score === "number")
        .map((r) => r.score as number);
      if (allScores.length > 0) return allScores;
    }
    // Fall back to sampled sampleResults (subset of ~15)
    if (!result?.sampleResults) return [];
    const { highest, lowest, aroundMean } = result.sampleResults;
    return [...(highest || []), ...(lowest || []), ...(aroundMean || [])].map((s) => s.score);
  }, [job.pollingSnapshot?.results, result]);

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

  // Group identical error messages so 50 rows with the same error collapse
  // into one banner ("50 rows failed: Tool call id not found in request").
  const topErrorGroups = useMemo(() => {
    if (!evaluationResults) return [];
    const counts = new Map<string, number>();
    for (const r of evaluationResults) {
      const msg = r.error_message?.trim();
      if (!msg) continue;
      const normalized = msg.replace(/^Evaluation error:\s*/i, "");
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([message, count]) => ({ message, count }));
  }, [evaluationResults]);

  // Build a quick lookup from record ID to topic name
  const recordTopicMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of sortedRecords) {
      if (r.topic) map.set(r.id, r.topic);
    }
    return map;
  }, [sortedRecords]);

  // Compute per-topic scores from evaluation results
  const topicScores = useMemo<Record<string, TopicEvalStats>>(() => {
    if (!evaluationResults) return {};
    const byTopic: Record<string, number[]> = {};
    for (const r of evaluationResults) {
      if (r.score == null) continue;
      // Look up topic from gateway records (eval row data doesn't include topic)
      const gatewayId = r.row?.id;
      const topic = gatewayId ? recordTopicMap.get(gatewayId) : undefined;
      if (!topic) continue;
      (byTopic[topic] ??= []).push(r.score);
    }
    // First pass: compute stats
    const result2: Record<string, TopicEvalStats> = {};
    for (const [topic, scores2] of Object.entries(byTopic)) {
      const topicMean = scores2.reduce((a, b) => a + b, 0) / scores2.length;
      const std = Math.sqrt(scores2.reduce((a, b) => a + (b - topicMean) ** 2, 0) / scores2.length);
      result2[topic] = { mean: topicMean, std, count: scores2.length, status: "good" };
    }
    // Second pass: relative status (compared to dataset average, not absolute thresholds)
    const allMeans = Object.values(result2).map(s => s.mean);
    const datasetAvg = allMeans.length > 0 ? allMeans.reduce((a, b) => a + b, 0) / allMeans.length : 0;
    for (const stats of Object.values(result2)) {
      if (stats.mean < datasetAvg * 0.6) stats.status = "problem";
      else if (stats.mean < datasetAvg * 0.85) stats.status = "warning";
    }
    return result2;
  }, [evaluationResults, recordTopicMap]);

  // Readiness gate: prefer persisted value, fallback to live computation from snapshot
  const readinessGate = useMemo<ReadinessGate | undefined>(() => {
    if (result?.readinessGate) return result.readinessGate;
    if (!evaluationResults || evaluationResults.length === 0) return undefined;
    const scored = evaluationResults.filter(r => r.score != null);
    if (scored.length === 0) return undefined;
    return computeReadinessGate(scored, topicScores, {
      maxOutputTokens: DEFAULT_INFERENCE_PARAMETERS.max_output_tokens,
    });
  }, [result?.readinessGate, evaluationResults, topicScores]);

  const recommendations = result?.diagnosis?.recommendations || [];
  const verdict = result?.diagnosis?.verdict;

  // Use persisted statistics when available (completed job), otherwise compute live from scores
  const stats = useMemo(() => {
    if (result?.statistics) return result.statistics;
    if (scores.length === 0) return undefined;
    const sorted = [...scores].sort((a, b) => a - b);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    return { mean, std, median, min: sorted[0], max: sorted[sorted.length - 1] };
  }, [result?.statistics, scores]);
  // All hooks must be called before any early returns
  const [showRecs, setShowRecs] = useState(verdict !== "GO" && recommendations.length > 0);

  // Auto-fetch results once when viewing a completed job that lacks results.
  // Uses a Set to track which job IDs have been attempted (prevents re-fire on re-render).
  const attemptedJobIds = useRef(new Set<string>());
  useEffect(() => {
    if (
      job.status === "completed" &&
      !result &&
      !evaluationResults &&
      job.evaluationRunId &&
      onRefresh &&
      !attemptedJobIds.current.has(job.id)
    ) {
      attemptedJobIds.current.add(job.id);
      onRefresh(job.id);
    }
  }, [job.id, job.status, job.evaluationRunId, result, evaluationResults, onRefresh]);

  // For non-running, non-cancelled jobs without results or evaluation data
  if (job.status !== "running" && job.status !== "cancelled" && !result && !evaluationResults) {
    if (job.status === "failed") {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
          <XCircle className="h-5 w-5 text-red-400" />
          <span className="text-xs text-red-400 text-center">{job.error || "Job failed"}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        <span className="text-xs text-zinc-500">Loading evaluation results...</span>
        <button
          type="button"
          className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline"
          onClick={() => onRefresh?.(job.id)}
        >
          Retry
        </button>
      </div>
    );
  }

  const isRunning = job.status === "running";
  const showErrorView = totalCount > 0 && (errorCount / totalCount) > 0.5;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full min-h-0">
        {/* Header — single row: status + model + metadata + actions */}
        <header className="shrink-0 border-b border-[#262626] px-4 py-1.5">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] text-blue-400 font-medium">
                <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
                Running
              </div>
            ) : job.status === "cancelled" ? (
              <span className="inline-flex items-center gap-1 rounded bg-zinc-500/10 border border-zinc-500/20 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                Cancelled{result ? ' (partial)' : ''}
              </span>
            ) : job.status === "failed" && !result ? (
              <span className="inline-flex items-center rounded bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">
                Failed
              </span>
            ) : result ? (
              <VerdictBadge verdict={mapReadinessToVerdict(readinessGate, result.diagnosis.verdict)} />
            ) : null}
            <span className="inline-flex items-center rounded bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-400 border border-zinc-700/40">
              {job.rolloutModel || "gpt-4o-mini"}
            </span>
            <span className="text-[10px] text-zinc-500">
              {(job.pollingSnapshot?.total_rows || job.sampleSize || evaluationResults?.length) ?? 0} records
            </span>
            {job.workflowId && (
              <EvalJobVersionBadge workflowId={job.workflowId} jobCreatedAt={job.createdAt} />
            )}

            {/* Right: elapsed + ETA + time + actions */}
            <div className="flex items-center gap-2 ml-auto">
              <EvalElapsedEta job={job} isRunning={isRunning} />
              {isRunning && onCancel && (
                <button onClick={onCancel} className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                  <StopCircle className="h-3 w-3" />Cancel
                </button>
              )}
              {onRefresh && !isRunning && (
                <button onClick={() => onRefresh(job.id)} className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-white/5 transition-colors" title="Refresh">
                  <RotateCw className="h-3 w-3" />
                </button>
              )}
              {onRunAgain && !isRunning && (
                <Button onClick={onRunAgain} variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 text-zinc-400 hover:text-zinc-200">
                  <RefreshCw className="h-3 w-3" />Re-run
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Error banner for failed jobs */}
        {!isRunning && job.status === "failed" && job.error && (
          <div className="shrink-0 mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5">
            <div className="flex items-start gap-2">
              <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-400 line-clamp-2">{job.error}</p>
            </div>
          </div>
        )}

        {/* Grouped per-row errors — collapses "50 rows failed with same error" into one banner */}
        {topErrorGroups.length > 0 && (() => {
          const snapshotFailed = getJobFailedRows(job);
          const snapshotTotal = getJobTotalRows(job);
          const failedTotal = snapshotFailed || errorCount;
          const runTotal = snapshotTotal || totalCount;
          const groupedTotal = topErrorGroups.reduce((sum, g) => sum + g.count, 0);
          const isSample = failedTotal > groupedTotal;
          return (
            <div className="shrink-0 mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <p className="text-[11px] font-semibold text-red-400">
                  {failedTotal} of {runTotal} evaluations failed
                  {topErrorGroups.length > 1 ? ` (${topErrorGroups.length} distinct errors)` : ""}
                </p>
              </div>
              <ul className="space-y-1 pl-5">
                {topErrorGroups.map(({ message, count }) => (
                  <li key={message} className="flex items-start gap-2 text-[11px]">
                    <span className="font-mono tabular-nums text-red-300/80 shrink-0 w-10 text-right">×{count}</span>
                    <span className="text-red-100/90 break-words leading-relaxed">{message}</span>
                  </li>
                ))}
              </ul>
              {isSample && (
                <p className="text-[10px] text-red-300/70 pl-5">
                  Showing breakdown from {groupedTotal} loaded failures (of {failedTotal} total).
                </p>
              )}
            </div>
          );
        })()}

        {!isRunning && showErrorView ? (
          <div className="shrink-0 mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-400">
                {errorCount === totalCount ? "All" : "Most"} evaluations failed ({errorCount}/{totalCount})
              </p>
            </div>
          </div>
        ) : scores.length > 0 ? (
          /* Score distribution + stats — shown during running AND after completion */
          <div className="shrink-0 px-3 pt-2 space-y-2">
            {/* Score distribution card — matches finetune chart style */}
            <div className="rounded-lg bg-[#111] overflow-hidden">
              {/* Card header with score */}
              <div className="px-5 py-4 border-b border-white/5 flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Avg Score{isRunning ? " (live)" : ""}
                  </p>
                  <div className="flex items-baseline gap-3">
                    {stats && (
                      <h2 className="text-3xl font-mono font-bold text-[#10b981]">
                        {stats.mean.toFixed(2)}
                      </h2>
                    )}
                    <span className="text-xs font-medium text-slate-400">
                      {scores.length} scored · ±{stats?.std.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart area */}
              <div className="p-4">
                <ScoreStrip scores={scores} mean={stats?.mean} byTopic={Object.keys(topicScores).length > 0 ? topicScores : undefined} readinessGate={readinessGate} />
              </div>

              {/* Stats footer */}
              {stats && (
                <div className="px-5 py-2.5 bg-black/20 border-t border-white/5 flex items-center gap-6 text-[11px] flex-wrap">
                  <span className="text-zinc-500">Mean <span className="text-zinc-200 font-mono font-medium">{stats.mean.toFixed(3)}</span></span>
                  <span className="text-zinc-500">Std Dev <span className="text-zinc-200 font-mono">{stats.std.toFixed(3)}</span></span>
                  <span className="text-zinc-500">Min / Max <span className="text-zinc-200 font-mono">{stats.min.toFixed(2)} – {stats.max.toFixed(2)}</span></span>
                  <span className="text-zinc-500">Median <span className="text-zinc-200 font-mono">{stats.median.toFixed(3)}</span></span>
                </div>
              )}

              {/* Insight — only show for completed jobs (live stats are still in flux) */}
              {!isRunning && stats && (
                <div className="px-5 py-2 border-t border-white/5">
                  <p className="text-[10px] text-slate-500 leading-relaxed">{getScoreInsight(stats)}</p>
                </div>
              )}
            </div>

            {/* Readiness gate is now a tab in ScoreStrip ("Readiness") */}

            {/* Recommendations — only for completed jobs */}
            {!isRunning && recommendations.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRecs((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", showRecs && "rotate-90")} />
                  <span>{recommendations.length} recommendation{recommendations.length !== 1 ? "s" : ""}</span>
                </button>
                {showRecs && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-400">
                    {recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-zinc-600 mt-px shrink-0">&#8226;</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Per-topic breakdown is now a tab in ScoreStrip ("By Topic") */}
          </div>
        ) : null}

        {/* Running: progress view + results table (below chart if chart is shown) */}
        {isRunning && (() => {
          const total = getJobTotalRows(job);
          const completed = getJobCompletedRows(job);
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          return (
            <div className="flex-1 min-h-0 p-3">
              <RunningView
                job={job}
                progress={pct}
                onNavigateToRecord={(recordId: string, result: { row?: Record<string, unknown> }) => {
                  // Try to find the gateway record by: dataset_row_id, row.id, or row.row_id
                  const rowData = result?.row as Record<string, unknown> | undefined;
                  const candidateIds = [recordId, rowData?.id, rowData?.row_id].filter(Boolean) as string[];

                  let record: { id: string; topic?: string } | undefined;
                  for (const cid of candidateIds) {
                    record = sortedRecords.find((r: { id: string }) => r.id === cid);
                    if (record) break;
                  }

                  if (record?.topic) {
                    window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
                      detail: { jobId: record.topic, type: "topic" },
                    }));
                  } else {
                    emitter.emit('vllora_navigate_to_record', { workflowId, recordId });
                  }
                }}
              />
            </div>
          );
        })()}

        {/* Cancelled with no results — show empty state */}
        {!isRunning && job.status === "cancelled" && scores.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4">
            <StopCircle className="h-5 w-5 text-zinc-500/40" />
            <span className="text-xs text-zinc-500">Cancelled before any records were scored</span>
          </div>
        )}

        {/* Results table fills remaining space */}
        {!isRunning && evaluationResults && evaluationResults.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col px-3 pb-1 pt-2">
            <div className="flex-1 min-h-0">
              <ResultsTable
                results={evaluationResults}
                totalRows={job.pollingSnapshot?.total_rows ?? job.sampleSize}
                fillHeight
                onNavigateToRecord={(_cloudRowId, result) => {
                  // Use the original gateway record ID to find the record's topic
                  const gatewayId = (result?.row?.id ?? _cloudRowId) as string;
                  const record = sortedRecords.find(r => r.id === gatewayId);
                  if (record?.topic) {
                    // Navigate via sidebar handleSelect — highlights the topic node
                    window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
                      detail: { jobId: record.topic, type: "topic" },
                    }));
                  } else {
                    // Fallback: open data tab
                    emitter.emit('vllora_navigate_to_record', { workflowId, recordId: gatewayId });
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─── Elapsed Time + ETA ───

function EvalElapsedEta({ job, isRunning }: { readonly job: EvalJob; readonly isRunning: boolean }) {
  const [, setTick] = useState(0);

  // Re-render every 10s while running to update elapsed time
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const startMs = job.createdAt;
  const endMs = job.completedAt ?? (isRunning ? Date.now() : null);
  if (!startMs || !endMs) {
    return <span className="text-[10px] text-zinc-600">{formatTime(job.createdAt)}</span>;
  }

  const elapsedMs = endMs - startMs;
  const elapsedStr = formatDuration(elapsedMs);

  // ETA — based on completed/total rows
  let etaStr: string | null = null;
  if (isRunning) {
    const total = getJobTotalRows(job);
    const completed = getJobCompletedRows(job);
    if (completed > 0 && completed < total) {
      const msPerRow = elapsedMs / completed;
      const remainingMs = msPerRow * (total - completed);
      etaStr = `~${formatDuration(remainingMs)}`;
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-[10px]">
        <span className="text-zinc-500">{isRunning ? "Elapsed" : "Duration"}</span>
        <span className="text-zinc-400 tabular-nums">{elapsedStr}</span>
      </span>
      {etaStr && (
        <span className="flex items-center gap-1 text-[10px]">
          <span className="text-amber-500">ETA</span>
          <span className="text-amber-400 tabular-nums">{etaStr}</span>
        </span>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function DryRunActivityView({ workflowId, jobs, onCancelJob, initialSelectedId, onRunAgain, onRefresh, hideRunsSidebar = false }: EvalActivityViewProps) {
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
      <div className={cn("flex-1 min-w-0 min-h-0", !hideRunsSidebar && "border-r border-zinc-800/60")}>
        {selectedJob ? (
          <JobDetail job={selectedJob} workflowId={workflowId} onCancel={onCancelJob} onRunAgain={onRunAgain} onRefresh={onRefresh} />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">
            Select a job from the list
          </div>
        )}
      </div>

      {/* Right: job list sidebar (hidden when Explorer provides job navigation) */}
      {!hideRunsSidebar && (
        <RunsSidebar jobs={jobs} selectedId={selectedId} onSelectJob={setSelectedId} />
      )}
    </div>
  );
}
