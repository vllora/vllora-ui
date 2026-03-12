/**
 * EvaluationResultsState
 *
 * Compact card showing dry run evaluation results.
 * Layout: Score donut | Distribution chart | Stats cards
 */

import { ChevronRight, CheckCircle2, AlertTriangle, XCircle, FlaskConical, TrendingUp, TrendingDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScoreDistribution } from "@/types/dataset-types";
import type { EvalJob } from "@/types/eval-job";

interface EvaluationResultsStateProps {
  /** The completed dry run job */
  job: EvalJob;
  /** Previous job for comparison */
  previousJob?: EvalJob;
  /** Callback when clicking to view details */
  onDryRunClick?: () => void;
}

const VERDICT_CONFIG = {
  GO: {
    label: "Ready",
    icon: CheckCircle2,
    color: "#10b981",
    pillClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  WARNING: {
    label: "Review",
    icon: AlertTriangle,
    color: "#f59e0b",
    pillClass: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  "NO-GO": {
    label: "Adjust",
    icon: XCircle,
    color: "#ef4444",
    pillClass: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

const DISTRIBUTION_BINS: Array<{ key: keyof ScoreDistribution; label: string; color: string }> = [
  { key: "0.0-0.2", label: "0-0.2", color: "#ef4444" },
  { key: "0.2-0.4", label: "0.2-0.4", color: "#f97316" },
  { key: "0.4-0.6", label: "0.4-0.6", color: "#eab308" },
  { key: "0.6-0.8", label: "0.6-0.8", color: "#84cc16" },
  { key: "0.8-1.0", label: "0.8-1.0", color: "#10b981" },
];

/** Compact donut chart for average score */
function ScoreDonut({ score, color, comparison }: { score: number; color: string; comparison?: number }) {
  const radius = 32;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const progress = score * circumference;

  return (
    <div className="flex flex-col items-center justify-center px-3">
      <svg width="80" height="80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="38" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-lg font-bold">
          {score.toFixed(2)}
        </text>
        <text x="40" y="54" textAnchor="middle" className="fill-muted-foreground text-[8px] uppercase tracking-wider">
          Avg Score
        </text>
      </svg>
      {comparison !== undefined && (
        <div className={`flex items-center gap-1 text-[10px] ${comparison >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {comparison >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{comparison >= 0 ? '+' : ''}{(comparison * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

/** Vertical bar chart distribution (histogram style) */
function DistributionSection({ distribution, totalSamples }: { distribution: ScoreDistribution; totalSamples: number }) {
  const maxCount = Math.max(...Object.values(distribution), 1);
  const barMaxHeight = 40; // pixels

  return (
    <div className="flex-1 flex flex-col px-4 border-l border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Score Distribution</span>
        <span className="text-[9px] text-muted-foreground">{totalSamples} total</span>
      </div>
      <div className="flex items-end gap-1" style={{ height: barMaxHeight }}>
        <TooltipProvider delayDuration={200}>
          {DISTRIBUTION_BINS.map((bin) => {
            const count = distribution[bin.key] || 0;
            const heightPx = maxCount > 0 ? (count / maxCount) * barMaxHeight : 0;
            const percentage = totalSamples > 0 ? ((count / totalSamples) * 100).toFixed(0) : '0';

            return (
              <Tooltip key={bin.key}>
                <TooltipTrigger asChild>
                  <div
                    className="flex-1 rounded-t cursor-help hover:opacity-80 transition-opacity"
                    style={{
                      height: Math.max(heightPx, count > 0 ? 4 : 2),
                      backgroundColor: count > 0 ? bin.color : 'rgb(63 63 70 / 0.3)',
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">Score {bin.label}</p>
                  <p className="text-muted-foreground">{count} samples ({percentage}%)</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>
      {/* X-axis labels */}
      <div className="flex gap-1 mt-1">
        {DISTRIBUTION_BINS.map((bin) => (
          <span key={bin.key} className="flex-1 text-[7px] text-muted-foreground text-center truncate">
            {bin.label.split('-')[1]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compact stats section */
function StatsSection({
  totalSamples,
  mean,
  std,
}: {
  totalSamples: number;
  mean: number;
  std: number;
}) {
  return (
    <div className="flex items-center gap-6 px-4 border-l border-zinc-800">
      <TooltipProvider delayDuration={200}>
        {/* Dry Run */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Dry Run</div>
            <div className="text-sm font-semibold text-foreground">
              {totalSamples} <span className="text-xs font-normal text-muted-foreground">samples</span>
            </div>
          </div>
        </div>

        {/* Mean */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Mean</div>
              <div className="text-sm font-semibold text-foreground tabular-nums">{mean.toFixed(2)}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[280px] p-3">
            <p className="font-semibold mb-1">Mean (Average Score)</p>
            <p className="text-muted-foreground mb-2">
              Sum of all scores divided by sample count. Represents the central tendency of your evaluation results.
            </p>
            <div className="text-muted-foreground border-t border-zinc-700 pt-2 mt-2">
              <p className="mb-1"><span className="text-emerald-400">≥ 0.8</span> — Excellent quality</p>
              <p className="mb-1"><span className="text-amber-400">0.5–0.8</span> — Needs improvement</p>
              <p><span className="text-red-400">&lt; 0.5</span> — Poor quality</p>
            </div>
            <a
              href="https://en.wikipedia.org/wiki/Arithmetic_mean"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline block mt-2"
              onClick={(e) => e.stopPropagation()}
            >
              Learn more →
            </a>
          </TooltipContent>
        </Tooltip>

        {/* Std Dev */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Std Dev</div>
              <div className="text-sm font-semibold text-foreground tabular-nums">{std.toFixed(2)}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[280px] p-3">
            <p className="font-semibold mb-1">Standard Deviation (σ)</p>
            <p className="text-muted-foreground mb-2">
              Measures how spread out scores are from the mean. Lower values indicate more consistent, predictable quality.
            </p>
            <div className="text-muted-foreground border-t border-zinc-700 pt-2 mt-2">
              <p className="mb-1"><span className="text-emerald-400">≤ 0.15</span> — Very consistent</p>
              <p className="mb-1"><span className="text-amber-400">0.15–0.25</span> — Moderate variance</p>
              <p><span className="text-red-400">&gt; 0.25</span> — High variance, inconsistent</p>
            </div>
            <a
              href="https://en.wikipedia.org/wiki/Standard_deviation"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline block mt-2"
              onClick={(e) => e.stopPropagation()}
            >
              Learn more →
            </a>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/** Verdict badge */
function VerdictBadge({ config, label }: { config: typeof VERDICT_CONFIG[keyof typeof VERDICT_CONFIG]; label: string }) {
  const VerdictIcon = config.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border ${config.pillClass}`}>
      <VerdictIcon className="w-3.5 h-3.5" />
      {label}
    </div>
  );
}

export function EvaluationResultsState({
  job,
  previousJob,
  onDryRunClick,
}: EvaluationResultsStateProps) {
  const stats = job.result;

  if (!stats) {
    return null;
  }

  const { statistics, distribution, diagnosis } = stats;
  const verdict = diagnosis.verdict as keyof typeof VERDICT_CONFIG;
  const config = VERDICT_CONFIG[verdict];

  const totalSamples = job.sampleSize || Object.values(distribution).reduce((sum: number, count: number) => sum + count, 0);

  const comparison = previousJob?.result?.statistics?.mean !== undefined
    ? statistics.mean - previousJob.result.statistics.mean
    : undefined;

  return (
    <button
      onClick={onDryRunClick}
      className="w-full flex items-center p-2 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-900/80 transition-colors text-left group"
    >
      <ScoreDonut score={statistics.mean} color={config.color} comparison={comparison} />
      <DistributionSection distribution={distribution} totalSamples={totalSamples} />
      <StatsSection
        totalSamples={totalSamples}
        mean={statistics.mean}
        std={statistics.std}
      />
      <VerdictBadge config={config} label={config.label} />
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-2" />
    </button>
  );
}
