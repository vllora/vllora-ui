/**
 * HealthRow
 *
 * Two-column quality summary for the Overview tab, mirroring the mock's
 * hr-main + hr-side layout:
 *   Left: big score + delta + eval-history line chart (one point per
 *         completed eval run).
 *   Right: two ministat cards — "Records by quality" (stacked bar over
 *         score bands) and "Coverage" (topics with ≥ 1 linked source part).
 *
 * Pulls only from already-loaded contexts (no extra fetches). Renders a
 * graceful empty state when no evaluations have completed.
 */

import { useMemo } from "react";
import { ArrowUp, ArrowDown, Info, Loader2 } from "lucide-react";
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
} from "@/types/eval-job";
import type {
  EvalStats,
  ScoreDistribution,
  TopicHierarchyNode,
} from "@/types/dataset-types";
import { flattenEvaluationResults } from "@/services/finetune-api";
import { ScoreStrip } from "@/components/datasets/eval-dialog/ScoreStrip";

interface HealthRowProps {
  evalJobs: readonly EvalJob[];
  evalStats?: EvalStats;
  topicHierarchy?: readonly TopicHierarchyNode[];
  totalRecords: number;
  onOpenEvalDetails?: () => void;
}

interface TrendPoint {
  jobId: string;
  score: number;
  ts: number;
  label: string;
}

const DISTRIBUTION_KEYS: readonly (keyof ScoreDistribution)[] = [
  "0.0-0.2",
  "0.2-0.4",
  "0.4-0.6",
  "0.6-0.8",
  "0.8-1.0",
];

const DISTRIBUTION_TONES: Record<
  keyof ScoreDistribution,
  { className: string; label: string; tip: string }
> = {
  "0.0-0.2": { className: "bg-rose-500", label: "Failing", tip: "Score 0.0–0.2 · needs human review" },
  "0.2-0.4": { className: "bg-rose-400/80", label: "Weak", tip: "Score 0.2–0.4 · borderline-low" },
  "0.4-0.6": { className: "bg-amber-500", label: "Mid", tip: "Score 0.4–0.6 · partially correct" },
  "0.6-0.8": { className: "bg-emerald-500/70", label: "Good", tip: "Score 0.6–0.8 · mostly correct" },
  "0.8-1.0": { className: "bg-emerald-400", label: "Strong", tip: "Score 0.8–1.0 · correct + good trajectory" },
};

// ─── Public component ───────────────────────────────────────────────────────

export function HealthRow({
  evalJobs,
  evalStats,
  topicHierarchy,
  totalRecords,
  onOpenEvalDetails,
}: HealthRowProps) {
  const trend = useMemo(() => buildTrend(evalJobs), [evalJobs]);
  const running = useMemo(() => buildRunningSnapshot(evalJobs), [evalJobs]);
  const coverage = useMemo(() => buildCoverageStats(topicHierarchy), [topicHierarchy]);
  const quality = useMemo(
    () => buildQualityStats(evalStats?.distribution, totalRecords),
    [evalStats, totalRecords],
  );
  const latestCompletedJob = useMemo(() => findLatestCompletedJob(evalJobs), [evalJobs]);
  const latestScores = useMemo(() => extractScores(latestCompletedJob), [latestCompletedJob]);

  const latest = trend[trend.length - 1];
  const previous = trend.length >= 2 ? trend[trend.length - 2] : undefined;
  const completedScore = latest?.score ?? evalStats?.statistics.mean ?? null;
  // If no completed eval yet but one is running with a live score, surface
  // that as the hero number so the user sees immediate feedback.
  const score = completedScore ?? running?.score ?? null;
  const samples = evalStats?.samplesEvaluated;
  const delta =
    latest && previous
      ? Math.round((latest.score - previous.score) * 100) / 100
      : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <QualityHero
          score={score}
          delta={delta}
          trend={trend}
          running={running}
          samples={samples}
          isLive={completedScore == null && running != null}
          latestScores={latestScores}
          latestByTopic={evalStats?.byTopic}
          latestReadinessGate={evalStats?.readinessGate}
          onOpenDetails={onOpenEvalDetails}
        />
        <div className="flex flex-col gap-3">
          <QualityBreakdown quality={quality} totalRecords={totalRecords} />
          <CoverageCard coverage={coverage} />
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Quality hero ──────────────────────────────────────────────────────────

function QualityHero({
  score,
  delta,
  trend,
  running,
  samples,
  isLive,
  latestScores,
  latestByTopic,
  latestReadinessGate,
  onOpenDetails,
}: {
  readonly score: number | null;
  readonly delta: number | null;
  readonly trend: readonly TrendPoint[];
  readonly running?: RunningSnapshot | null;
  readonly samples?: number;
  readonly isLive?: boolean;
  readonly latestScores: readonly number[];
  readonly latestByTopic?: EvalStats["byTopic"];
  readonly latestReadinessGate?: EvalStats["readinessGate"];
  readonly onOpenDetails?: () => void;
}) {
  const runningPct =
    running && running.total > 0 ? Math.round((running.completed / running.total) * 100) : null;

  return (
    <div className="rounded-xl border border-border/60 bg-zinc-900/40 px-5 py-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            Dataset quality
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> live
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            {trend.length > 0
              ? `Latest eval · ${trend[trend.length - 1].label}${samples ? ` · ${samples} records` : ""}`
              : running
                ? `Evaluation running · ${running.completed}/${running.total} rows graded`
                : "No evaluations yet"}
          </div>
        </div>
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="inline-flex h-6 items-center rounded-md border border-border/60 bg-card/40 px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Details
          </button>
        )}
      </div>

      {score == null && running == null ? (
        <div className="flex h-[140px] flex-col items-start justify-center text-[12px] text-muted-foreground">
          <p>No evaluations yet.</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            Run an evaluation to see dataset quality trends here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            {score != null ? (
              <>
                <span
                  className={cn(
                    "text-[34px] font-semibold leading-none tracking-[-0.015em] tabular-nums",
                    scoreTone(score),
                  )}
                >
                  {score.toFixed(2)}
                </span>
                <span className="text-[13px] text-muted-foreground">/ 1.00</span>
              </>
            ) : (
              <span className="text-[20px] font-medium leading-none text-muted-foreground">
                Awaiting first score
              </span>
            )}
            {delta !== null && delta !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  delta > 0
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-rose-500/15 text-rose-300",
                )}
              >
                {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {delta > 0 ? "+" : ""}
                {delta.toFixed(2)}
              </span>
            )}
            {trend.length > 0 && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                across {trend.length} eval run{trend.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {running && runningPct != null && (
            <div className="flex flex-col gap-1 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px]">
              <div className="flex items-center gap-2 text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  Eval running · {runningPct}% · {running.completed}/{running.total} rows
                </span>
                {running.score != null && (
                  <span className="ml-auto font-mono tabular-nums">
                    live avg <span className={scoreTone(running.score)}>{running.score.toFixed(2)}</span>
                  </span>
                )}
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-amber-500/15">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${runningPct}%` }}
                />
              </div>
            </div>
          )}

          {trend.length >= 2 ? (
            <HistoryChart points={trend} />
          ) : latestScores.length > 0 ? (
            <ScoreStrip
              scores={[...latestScores]}
              mean={score ?? undefined}
              byTopic={latestByTopic}
              readinessGate={latestReadinessGate}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function HistoryChart({ points }: { readonly points: readonly TrendPoint[] }) {
  const w = 400;
  const h = 140;
  const padX = 28;
  const padY = 20;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const min = 0.4;
  const max = 1.0;
  const range = max - min;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coord = (p: TrendPoint, i: number) => ({
    x: padX + i * stepX,
    y: padY + innerH - ((Math.max(min, Math.min(max, p.score)) - min) / range) * innerH,
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
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[140px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="health-row-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.66 0.18 160)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="oklch(0.66 0.18 160)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* gridlines */}
      <g stroke="oklch(0.26 0.012 170)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.7">
        <line x1={padX} y1={padY} x2={w - padX} y2={padY} />
        <line x1={padX} y1={padY + innerH / 3} x2={w - padX} y2={padY + innerH / 3} />
        <line x1={padX} y1={padY + (2 * innerH) / 3} x2={w - padX} y2={padY + (2 * innerH) / 3} />
        <line x1={padX} y1={padY + innerH} x2={w - padX} y2={padY + innerH} />
      </g>

      {/* y-axis labels */}
      <g fill="oklch(0.48 0.012 170)" fontSize="9">
        <text x={4} y={padY + 3}>1.0</text>
        <text x={4} y={padY + innerH / 3 + 3}>0.8</text>
        <text x={4} y={padY + (2 * innerH) / 3 + 3}>0.6</text>
        <text x={4} y={padY + innerH + 3}>0.4</text>
      </g>

      {/* baseline at 0.8 */}
      <line
        x1={padX}
        x2={w - padX}
        y1={baseline}
        y2={baseline}
        stroke="oklch(0.48 0.012 170)"
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.5"
      />
      <text
        x={w - padX - 4}
        y={baseline - 4}
        fill="oklch(0.48 0.012 170)"
        fontSize="8.5"
        textAnchor="end"
      >
        target 0.80
      </text>

      {/* area fill */}
      {points.length > 1 && (
        <path
          d={`${path} L${last.x},${h - padY} L${padX},${h - padY} Z`}
          fill="url(#health-row-fill)"
        />
      )}

      {/* line */}
      <path d={path} fill="none" stroke="oklch(0.74 0.17 160)" strokeWidth="1.8" />

      {/* dots */}
      {points.map((p, i) => {
        const c = coord(p, i);
        return (
          <circle
            key={p.jobId}
            cx={c.x}
            cy={c.y}
            r={i === lastIdx ? 4.5 : 3}
            fill={i === lastIdx ? "oklch(0.74 0.17 160)" : "oklch(0.48 0.012 170)"}
            stroke="var(--background)"
            strokeWidth="1.5"
          />
        );
      })}

      {/* x-axis labels */}
      <g fill="oklch(0.48 0.012 170)" fontSize="9" textAnchor="middle">
        {points.map((p, i) => {
          const c = coord(p, i);
          const anchor = i === 0 ? "start" : i === lastIdx ? "end" : "middle";
          return (
            <text key={p.jobId} x={c.x} y={h - 4} textAnchor={anchor}>
              {p.label}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

// ─── Quality breakdown ─────────────────────────────────────────────────────

function QualityBreakdown({
  quality,
  totalRecords,
}: {
  readonly quality: QualityStats;
  readonly totalRecords: number;
}) {
  const hasData = quality.totalBucketed > 0;
  return (
    <div className="rounded-xl border border-border/60 bg-zinc-900/40 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
        Records by quality
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full bg-muted/40 text-[8px] font-semibold text-muted-foreground/70">
              i
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="max-w-[220px] text-xs">
              Distribution of evaluated records across score bands (strong / mid / weak).
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      {hasData ? (
        <>
          <div className="mb-2 flex items-baseline gap-1.5">
            <span className="font-mono text-[20px] font-medium leading-none text-foreground tabular-nums">
              {quality.totalBucketed.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground/70">
              of {totalRecords.toLocaleString()} evaluated
            </span>
          </div>
          <div className="mb-2 flex h-1.5 overflow-hidden rounded-full bg-muted/30">
            {DISTRIBUTION_KEYS.map((k) => {
              const count = quality.buckets[k];
              if (count === 0) return null;
              const pct = (count / quality.totalBucketed) * 100;
              const tone = DISTRIBUTION_TONES[k];
              return (
                <Tooltip key={k}>
                  <TooltipTrigger asChild>
                    <div className={cn("h-full", tone.className)} style={{ width: `${pct}%` }} />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">
                      {count} record{count === 1 ? "" : "s"} · {tone.label} ({k})
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <span className="text-emerald-300">● {quality.strong} strong</span>
            <span className="text-amber-400">● {quality.mid} mid</span>
            <span className="text-rose-300">● {quality.weak} weak</span>
          </div>
        </>
      ) : (
        <>
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="font-mono text-[20px] font-medium leading-none text-muted-foreground tabular-nums">
              —
            </span>
            <span className="text-[11px] text-muted-foreground/70">
              {totalRecords.toLocaleString()} records waiting
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            Run an evaluation to see quality distribution.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Coverage card ─────────────────────────────────────────────────────────

function CoverageCard({ coverage }: { readonly coverage: CoverageStats }) {
  const { withParts, total, uncovered } = coverage;
  const pct = total > 0 ? Math.round((withParts / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border/60 bg-zinc-900/40 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
        Coverage
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 cursor-help text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="max-w-[220px] text-xs">
              Share of topics that have at least one linked knowledge part. A topic with 0 parts
              produces no records when you regenerate.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="font-mono text-[20px] font-medium leading-none text-foreground tabular-nums">
          {withParts}
        </span>
        <span className="text-[13px] text-muted-foreground/70">/ {total}</span>
        <span className="ml-0.5 text-[11px] text-muted-foreground">topics</span>
      </div>
      <div className="mb-1 flex h-1.5 overflow-hidden rounded-full bg-muted/30">
        <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
        <div
          className="h-full bg-muted-foreground/30"
          style={{ width: `${Math.max(0, 100 - pct)}%` }}
        />
      </div>
      {uncovered > 0 ? (
        <div className="text-[11px] text-rose-300">
          {uncovered} topic{uncovered === 1 ? "" : "s"} {uncovered === 1 ? "has" : "have"} 0 linked parts
        </div>
      ) : total > 0 ? (
        <div className="text-[11px] text-emerald-300">All topics have linked parts</div>
      ) : (
        <div className="text-[11px] text-muted-foreground/70">
          No topics yet. Generate a topic hierarchy to see coverage.
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreTone(score: number): string {
  if (score >= 0.8) return "text-emerald-300";
  if (score >= 0.6) return "text-amber-400";
  return "text-rose-300";
}

interface RunningSnapshot {
  readonly score: number | null;
  readonly completed: number;
  readonly total: number;
  readonly jobId: string;
}

function findLatestCompletedJob(jobs: readonly EvalJob[]): EvalJob | null {
  const completed = jobs
    .filter((j) => j.status === "completed")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return completed[0] ?? null;
}

function extractScores(job: EvalJob | null): readonly number[] {
  if (!job?.pollingSnapshot?.results) return [];
  return flattenEvaluationResults(job.pollingSnapshot.results)
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number");
}

function buildRunningSnapshot(jobs: readonly EvalJob[]): RunningSnapshot | null {
  const running = jobs.find((j) => j.status === "running" || j.status === "pending");
  if (!running) return null;
  const completed = getJobCompletedRows(running);
  const total = getJobTotalRows(running);
  const score = getJobAverageScore(running);
  return {
    score: typeof score === "number" ? score : null,
    completed,
    total,
    jobId: running.id,
  };
}

function buildTrend(jobs: readonly EvalJob[]): TrendPoint[] {
  const completed = jobs
    .filter((j) => j.status === "completed")
    .map((j) => {
      const score = getJobAverageScore(j);
      if (score == null) return null;
      const ts = j.completedAt ?? j.startedAt ?? j.createdAt;
      return { jobId: j.id, score, ts };
    })
    .filter((p): p is { jobId: string; score: number; ts: number } => p !== null)
    .sort((a, b) => a.ts - b.ts);

  return completed.map((p, i) => ({
    ...p,
    label: i === completed.length - 1 ? "latest" : `v${i + 1}`,
  }));
}

interface QualityStats {
  buckets: Record<keyof ScoreDistribution, number>;
  totalBucketed: number;
  strong: number;
  mid: number;
  weak: number;
}

function buildQualityStats(distribution: ScoreDistribution | undefined, _totalRecords: number): QualityStats {
  const buckets: Record<keyof ScoreDistribution, number> = {
    "0.0-0.2": distribution?.["0.0-0.2"] ?? 0,
    "0.2-0.4": distribution?.["0.2-0.4"] ?? 0,
    "0.4-0.6": distribution?.["0.4-0.6"] ?? 0,
    "0.6-0.8": distribution?.["0.6-0.8"] ?? 0,
    "0.8-1.0": distribution?.["0.8-1.0"] ?? 0,
  };
  const strong = buckets["0.8-1.0"];
  const mid = buckets["0.4-0.6"] + buckets["0.6-0.8"];
  const weak = buckets["0.0-0.2"] + buckets["0.2-0.4"];
  const totalBucketed = strong + mid + weak;
  return { buckets, totalBucketed, strong, mid, weak };
}

interface CoverageStats {
  total: number;
  withParts: number;
  uncovered: number;
}

function buildCoverageStats(hierarchy: readonly TopicHierarchyNode[] | undefined): CoverageStats {
  if (!hierarchy || hierarchy.length === 0) {
    return { total: 0, withParts: 0, uncovered: 0 };
  }
  let total = 0;
  let withParts = 0;
  const walk = (node: TopicHierarchyNode) => {
    const isLeaf = !node.children || node.children.length === 0;
    if (isLeaf) {
      total += 1;
      if ((node.sourceChunkRefs?.length ?? 0) > 0) withParts += 1;
    }
    for (const child of node.children ?? []) walk(child);
  };
  hierarchy.forEach(walk);
  return { total, withParts, uncovered: total - withParts };
}
