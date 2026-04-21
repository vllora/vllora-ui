/**
 * EvalRunHero
 *
 * KPI-strip + live progress + verdict header for a single eval run. Pulled
 * directly from `EvalJob.pollingSnapshot` and `EvalJob.result.statistics`
 * — no invented training metrics. Inserted above the existing
 * ScoreStrip card in the JobDetail panel.
 */

import { CheckCircle2, AlertTriangle, XCircle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EvalJob } from "@/types/eval-job";
import {
  getJobAverageScore,
  getJobCompletedRows,
  getJobTotalRows,
  getJobPassedCount,
  getJobFailedGradingCount,
} from "@/types/eval-job";
import { VerdictBadge } from "./VerdictBadge";

interface EvalRunHeroProps {
  job: EvalJob;
  /** Errored row count from per-result inspection (job.pollingSnapshot.results). */
  erroredCount: number;
  /** Topic count + problem count — rendered as a clickable KPI cell. */
  topics?: {
    total: number;
    problemCount: number;
    onView: () => void;
  };
}

interface KpiCellProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tooltip?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}

const TONE_CLASS: Record<NonNullable<KpiCellProps["tone"]>, string> = {
  default: "text-foreground",
  ok: "text-emerald-300",
  warn: "text-amber-400",
  danger: "text-red-400",
};

function KpiCell({ label, value, sub, tooltip, tone = "default" }: KpiCellProps) {
  const inner = (
    <div className="flex flex-col gap-0.5 px-3 py-2 min-w-0">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
        {label}
      </span>
      <span className={cn("text-base font-semibold leading-tight tabular-nums truncate", TONE_CLASS[tone])}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground/60 truncate">{sub}</span>}
    </div>
  );
  if (!tooltip) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs max-w-[220px]">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function VerdictCell({ job }: { job: EvalJob }) {
  const verdict = job.result?.diagnosis?.verdict;
  if (!verdict) {
    return <KpiCell label="Verdict" value={<span className="text-muted-foreground/60">—</span>} sub="awaiting completion" />;
  }
  const Icon = verdict === "GO" ? CheckCircle2 : verdict === "NO-GO" ? XCircle : AlertTriangle;
  const tone = verdict === "GO" ? "ok" : verdict === "NO-GO" ? "danger" : "warn";
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 min-w-0">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
        Verdict
      </span>
      <div className="flex items-center gap-1.5">
        <Icon className={cn("w-3.5 h-3.5", TONE_CLASS[tone as "ok" | "warn" | "danger"])} />
        <VerdictBadge verdict={verdict} />
      </div>
      {job.result?.diagnosis?.recommendations?.length ? (
        <span className="text-[10px] text-muted-foreground/60 truncate">
          {job.result.diagnosis.recommendations.length} recommendation
          {job.result.diagnosis.recommendations.length === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

function TopicsCell({ topics }: { topics: NonNullable<EvalRunHeroProps["topics"]> }) {
  const { total, problemCount, onView } = topics;
  const hasProblems = problemCount > 0;
  return (
    <button
      type="button"
      onClick={onView}
      className="group flex flex-col gap-0.5 px-3 py-2 min-w-0 cursor-pointer text-left transition-colors hover:bg-zinc-800/40"
    >
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-semibold flex items-center gap-1">
        Topics
        <Layers className="h-2.5 w-2.5 text-muted-foreground/50 transition-colors group-hover:text-emerald-300" />
      </span>
      <span className="text-base font-semibold leading-tight tabular-nums truncate text-foreground">
        {total}
      </span>
      <span
        className={cn(
          "text-[10px] truncate",
          hasProblems ? "text-red-400" : "text-muted-foreground/60",
        )}
      >
        {hasProblems
          ? `${problemCount} weak · view breakdown`
          : total > 0
            ? "view breakdown"
            : "no topics"}
      </span>
    </button>
  );
}

export function EvalRunHero({ job, erroredCount, topics }: EvalRunHeroProps) {
  const isRunning = job.status === "running" || job.status === "pending";
  const completed = getJobCompletedRows(job);
  const total = getJobTotalRows(job) || job.sampleSize || 0;
  const progressPct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const avg = getJobAverageScore(job);
  const stats = job.result?.statistics;
  const passed = getJobPassedCount(job);
  const failedGrading = getJobFailedGradingCount(job);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="shrink-0 px-3 pt-2 space-y-2">
        {isRunning && total > 0 && (
          <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 px-3 py-2 flex items-center gap-3">
            <div className="flex flex-col gap-0.5 min-w-[120px]">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                Progress
              </span>
              <span className="text-xs font-mono tabular-nums text-foreground">
                {completed} / {total}
                <span className="text-muted-foreground/70 ml-1.5">({progressPct}%)</span>
              </span>
            </div>
            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        <div className={cn(
          "rounded-lg bg-zinc-900/40 border border-zinc-800 grid grid-cols-2 sm:grid-cols-3 divide-x divide-zinc-800",
          topics ? "lg:grid-cols-6" : "lg:grid-cols-5",
        )}>
          <KpiCell
            label={`Avg score${isRunning ? " (live)" : ""}`}
            value={avg != null ? avg.toFixed(2) : "—"}
            sub={stats != null ? `±${stats.std.toFixed(2)} · median ${stats.median.toFixed(2)}` : undefined}
            tooltip="Mean score across all graded rows. Std dev shows spread."
            tone={avg == null ? "default" : avg >= 0.8 ? "ok" : avg >= 0.6 ? "warn" : "danger"}
          />
          <KpiCell
            label="Range"
            value={stats != null ? `${stats.min.toFixed(2)} – ${stats.max.toFixed(2)}` : "—"}
            sub={stats?.percentiles ? `p10 ${stats.percentiles.p10.toFixed(2)} · p90 ${stats.percentiles.p90.toFixed(2)}` : undefined}
            tooltip="Min and max scores across graded rows."
          />
          <KpiCell
            label="Passed"
            value={passed > 0 ? passed.toLocaleString() : "—"}
            sub={total > 0 ? `${Math.round((passed / total) * 100)}% of total` : undefined}
            tooltip="Rows where the grader returned a passing score."
            tone={passed > 0 ? "ok" : "default"}
          />
          <KpiCell
            label="Errored"
            value={erroredCount > 0 ? erroredCount.toLocaleString() : failedGrading > 0 ? failedGrading.toLocaleString() : "0"}
            sub={erroredCount > 0 ? "evaluation errors" : failedGrading > 0 ? "grader failures" : "no errors"}
            tooltip="Rows that failed evaluation (timeout, exception, or grader rejection)."
            tone={erroredCount > 0 || failedGrading > 0 ? "danger" : "default"}
          />
          <VerdictCell job={job} />
          {topics && <TopicsCell topics={topics} />}
        </div>
      </div>
    </TooltipProvider>
  );
}
