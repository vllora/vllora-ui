/**
 * WorkflowHealthHero
 *
 * Wide hero card for the Overview tab. Adapted from the Workflow Redesign
 * mock — pulls only from data already loaded by EvalJobsContext + the
 * dataset's `evalStats`. Shows: big score, delta from previous eval,
 * sparkline trend across completed eval runs, and a quality distribution
 * mini stacked bar (records by score bucket).
 */

import { useMemo } from "react";
import { ArrowUp, ArrowDown, Target, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EvalJob } from "@/types/eval-job";
import { getJobAverageScore } from "@/types/eval-job";
import type { EvalStats, ScoreDistribution } from "@/types/dataset-types";

interface WorkflowHealthHeroProps {
  evalJobs: readonly EvalJob[];
  evalStats?: EvalStats;
  onClick?: () => void;
}

interface TrendPoint {
  jobId: string;
  score: number;
  ts: number;
}

const DISTRIBUTION_KEYS: readonly (keyof ScoreDistribution)[] = [
  "0.0-0.2",
  "0.2-0.4",
  "0.4-0.6",
  "0.6-0.8",
  "0.8-1.0",
];

const DISTRIBUTION_TONES: Record<keyof ScoreDistribution, { className: string; label: string; tip: string }> = {
  "0.0-0.2": { className: "bg-red-500", label: "Failing", tip: "Score 0.0–0.2 · incorrect or low-quality, needs human review" },
  "0.2-0.4": { className: "bg-red-400/80", label: "Weak", tip: "Score 0.2–0.4 · borderline-low, consider revising prompt or examples" },
  "0.4-0.6": { className: "bg-amber-500", label: "Mid", tip: "Score 0.4–0.6 · partially correct" },
  "0.6-0.8": { className: "bg-emerald-500/70", label: "Good", tip: "Score 0.6–0.8 · mostly correct" },
  "0.8-1.0": { className: "bg-emerald-400", label: "Strong", tip: "Score 0.8–1.0 · correct answer with good trajectory" },
};

function buildTrend(jobs: readonly EvalJob[]): TrendPoint[] {
  return jobs
    .filter((j) => j.status === "completed")
    .map((j) => {
      const score = getJobAverageScore(j);
      if (score == null) return null;
      const ts = j.completedAt ?? j.startedAt ?? j.createdAt;
      return { jobId: j.id, score, ts };
    })
    .filter((p): p is TrendPoint => p !== null)
    .sort((a, b) => a.ts - b.ts);
}

function Sparkline({ points }: { points: readonly TrendPoint[] }) {
  if (points.length === 0) return null;
  const w = 240;
  const h = 56;
  const padX = 4;
  const padY = 6;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const min = Math.min(0, ...points.map((p) => p.score));
  const max = Math.max(1, ...points.map((p) => p.score));
  const range = Math.max(0.0001, max - min);
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coord = (p: TrendPoint, i: number) => ({
    x: padX + i * stepX,
    y: padY + innerH - ((p.score - min) / range) * innerH,
  });
  const path = points
    .map((p, i) => {
      const c = coord(p, i);
      return `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`;
    })
    .join(" ");
  const lastIdx = points.length - 1;
  const last = coord(points[lastIdx], lastIdx);
  const baseline = padY + innerH - ((0.8 - min) / range) * innerH;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id="hero-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--theme-500))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(var(--theme-500))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Reference baseline at 0.8 */}
      <line
        x1={padX}
        x2={w - padX}
        y1={baseline}
        y2={baseline}
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeDasharray="3 3"
      />
      {/* Area fill */}
      <path
        d={`${path} L${last.x},${h - padY} L${padX},${h - padY} Z`}
        fill="url(#hero-trend-fill)"
      />
      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke="rgb(var(--theme-400))"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Latest point marker */}
      <circle cx={last.x} cy={last.y} r="3" fill="rgb(var(--theme-300))" />
      <circle cx={last.x} cy={last.y} r="6" fill="rgb(var(--theme-300))" fillOpacity="0.18" />
    </svg>
  );
}

function DistributionBar({ distribution }: { distribution: ScoreDistribution }) {
  const total = DISTRIBUTION_KEYS.reduce((sum, k) => sum + (distribution[k] ?? 0), 0);
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        {DISTRIBUTION_KEYS.map((key) => {
          const v = distribution[key] ?? 0;
          if (v === 0) return null;
          const pct = (v / total) * 100;
          const tone = DISTRIBUTION_TONES[key];
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <div className={cn("h-full", tone.className)} style={{ width: `${pct}%` }} />
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {v} record{v === 1 ? "" : "s"} · {tone.label} ({key})
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>{distribution["0.8-1.0"] ?? 0} strong</span>
        <span>{(distribution["0.4-0.6"] ?? 0) + (distribution["0.6-0.8"] ?? 0)} mid</span>
        <span>{(distribution["0.0-0.2"] ?? 0) + (distribution["0.2-0.4"] ?? 0)} weak</span>
      </div>
    </div>
  );
}

export function WorkflowHealthHero({ evalJobs, evalStats, onClick }: WorkflowHealthHeroProps) {
  const trend = useMemo(() => buildTrend(evalJobs), [evalJobs]);
  const latest = trend[trend.length - 1];
  const previous = trend.length >= 2 ? trend[trend.length - 2] : undefined;
  const score = latest?.score ?? evalStats?.statistics.mean;
  const samples = evalStats?.samplesEvaluated;
  const delta =
    latest && previous
      ? Math.round((latest.score - previous.score) * 100 * 10) / 10
      : null;

  const scorePercent = score != null ? Math.round(score * 100) : null;

  return (
    <TooltipProvider delayDuration={300}>
      <button
        onClick={onClick}
        className="h-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-4 text-left hover:border-[rgb(var(--theme-500))]/50 transition-colors w-full flex flex-col"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Dataset Quality
          </span>
          <Target className="w-3.5 h-3.5 text-muted-foreground/60" />
        </div>

        {scorePercent == null ? (
          <div className="flex-1 flex flex-col justify-center text-xs text-muted-foreground py-1">
            <p>No evaluations yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Run an evaluation to see quality trends
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-2.5 min-h-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold leading-none tabular-nums text-emerald-300">
                  {scorePercent}%
                </span>
                {delta !== null && (
                  <span
                    className={cn(
                      "flex items-center text-[10px] font-semibold tabular-nums",
                      delta >= 0 ? "text-emerald-400" : "text-destructive",
                    )}
                  >
                    {delta >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {delta >= 0 ? "+" : ""}
                    {delta}%
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                {trend.length} run{trend.length === 1 ? "" : "s"}
                {samples != null ? ` · ${samples} sample${samples === 1 ? "" : "s"}` : ""}
              </span>
            </div>

            {trend.length > 0 && (
              <div className="h-12 -mx-1 text-emerald-500/80">
                <Sparkline points={trend} />
              </div>
            )}

            {evalStats?.distribution ? (
              <div className="space-y-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                      <span>Records by quality</span>
                      <Info className="w-2.5 h-2.5 opacity-60" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs max-w-[220px]">
                      Distribution of {samples ?? 0} graded record{samples === 1 ? "" : "s"} across
                      five score buckets. Hover any segment for the bucket count.
                    </p>
                  </TooltipContent>
                </Tooltip>
                <DistributionBar distribution={evalStats.distribution} />
              </div>
            ) : null}
          </div>
        )}
      </button>
    </TooltipProvider>
  );
}
