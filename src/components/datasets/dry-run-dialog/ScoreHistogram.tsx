/**
 * ScoreHistogram
 *
 * Displays a histogram of scores from dry run validation.
 * Used to visualize the distribution of grader scores (0.0 - 1.0).
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DryRunDiagnosis } from "@/types/dataset-types";

interface ScoreHistogramProps {
  /** Array of scores (0.0 - 1.0) */
  scores: number[];
  /** Number of bins for the histogram */
  bins?: number;
  /** Height of the chart */
  height?: number;
  /** Show mean line */
  showMean?: boolean;
  /** Show statistics below chart */
  showStats?: boolean;
  /** Show diagnosis banner below stats (default: true) */
  showDiagnosis?: boolean;
  /** Actual diagnosis from result (if provided, uses this instead of recalculating) */
  resultDiagnosis?: DryRunDiagnosis;
}

interface HistogramBin {
  range: string;
  count: number;
  percentage: number;
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Calculate histogram bins from scores
 */
function calculateHistogram(scores: number[], numBins: number): HistogramBin[] {
  if (scores.length === 0) return [];

  const bins: HistogramBin[] = [];
  const binSize = 1.0 / numBins;

  for (let i = 0; i < numBins; i++) {
    const rangeStart = i * binSize;
    const rangeEnd = (i + 1) * binSize;
    const count = scores.filter(
      (s) => s >= rangeStart && (i === numBins - 1 ? s <= rangeEnd : s < rangeEnd)
    ).length;

    bins.push({
      range: `${rangeStart.toFixed(1)}-${rangeEnd.toFixed(1)}`,
      count,
      percentage: scores.length > 0 ? (count / scores.length) * 100 : 0,
      rangeStart,
      rangeEnd,
    });
  }

  return bins;
}

/**
 * Calculate statistics for scores
 */
function calculateStats(scores: number[]) {
  if (scores.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, median: 0 };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const std = Math.sqrt(variance);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  return { mean, std, min, max, median };
}

/**
 * Determine GO/NO-GO status based on statistics
 */
function getDiagnosis(stats: ReturnType<typeof calculateStats>): {
  verdict: "GO" | "NO-GO" | "WARNING";
  issues: string[];
  color: string;
  bgColor: string;
} {
  const issues: string[] = [];

  // Check for problems
  if (stats.mean < 0.1) {
    issues.push("Mean too low - examples may be too difficult or grader too strict");
  }
  if (stats.mean > 0.9) {
    issues.push("Mean too high - examples may be too easy or grader too lenient");
  }
  if (stats.std < 0.1 && stats.mean > 0.1 && stats.mean < 0.9) {
    issues.push("Low variance - grader may not differentiate well");
  }

  if (issues.length === 0) {
    return {
      verdict: "GO",
      issues: [],
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    };
  } else if (stats.mean < 0.1 || stats.mean > 0.9) {
    return {
      verdict: "NO-GO",
      issues,
      color: "text-red-600",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    };
  } else {
    return {
      verdict: "WARNING",
      issues,
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    };
  }
}

// Custom tooltip
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HistogramBin }>;
}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-3 text-sm">
      <p className="font-semibold text-zinc-100">Score: {data.range}</p>
      <p className="text-zinc-400 mt-1">
        <span className="font-mono text-zinc-200">{data.count}</span> samples
        <span className="text-zinc-500 ml-1">({data.percentage.toFixed(1)}%)</span>
      </p>
    </div>
  );
}

export function ScoreHistogram({
  scores,
  bins = 10,
  height = 200,
  showMean = true,
  showStats = true,
  showDiagnosis = true,
  resultDiagnosis,
}: ScoreHistogramProps) {
  const histogramData = useMemo(
    () => calculateHistogram(scores, bins),
    [scores, bins]
  );

  const stats = useMemo(() => calculateStats(scores), [scores]);
  const localDiagnosis = useMemo(() => getDiagnosis(stats), [stats]);

  // Use result diagnosis if provided, otherwise fall back to local calculation
  const diagnosis = useMemo(() => {
    if (resultDiagnosis) {
      // Convert result diagnosis format to local format
      const issues = resultDiagnosis.issues?.map(i => i.message) || resultDiagnosis.warnings || [];
      return {
        verdict: resultDiagnosis.verdict,
        issues,
        color: resultDiagnosis.verdict === "GO" ? "text-green-600" : resultDiagnosis.verdict === "NO-GO" ? "text-red-600" : "text-amber-600",
        bgColor: resultDiagnosis.verdict === "GO" ? "bg-green-100 dark:bg-green-900/30" : resultDiagnosis.verdict === "NO-GO" ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30",
      };
    }
    return localDiagnosis;
  }, [resultDiagnosis, localDiagnosis]);

  if (scores.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">No score data available</p>
        <p className="text-xs text-muted-foreground mt-1">
          Run dry run to generate scores
        </p>
      </div>
    );
  }

  // Determine bar color based on score range - matches DISTRIBUTION_BINS colors
  const getBarColor = (bin: HistogramBin) => {
    const midpoint = (bin.rangeStart + bin.rangeEnd) / 2;
    if (midpoint < 0.2) return "#ef4444"; // red
    if (midpoint < 0.4) return "#f97316"; // orange
    if (midpoint < 0.6) return "#eab308"; // yellow
    if (midpoint < 0.8) return "#84cc16"; // lime
    return "#10b981"; // emerald
  };

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={histogramData}
            margin={{ top: 20, right: 10, left: 0, bottom: 60 }}
          >
            <XAxis
              dataKey="range"
              tick={{ fontSize: 10, fill: '#71717a' }}
              interval={0}
              angle={-45}
              textAnchor="end"
              dy={10}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#71717a' }}
              tickFormatter={(value) => `${value}`}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            {/* Mean line */}
            {showMean && (
              <ReferenceLine
                x={histogramData.findIndex(
                  (b) => stats.mean >= b.rangeStart && stats.mean < b.rangeEnd
                )}
                stroke="#10b981"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Mean: ${stats.mean.toFixed(2)}`,
                  position: "top",
                  fontSize: 11,
                  fill: "#10b981",
                  fontWeight: 600,
                }}
              />
            )}
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {histogramData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Statistics */}
      {showStats && (
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-5 gap-2 text-center">
            <StatBox
              label="Mean"
              value={stats.mean.toFixed(2)}
              highlight
              tooltipTitle="Mean (Average Score)"
              tooltipDescription="Sum of all scores divided by sample count. Represents the central tendency of your evaluation results."
              tooltipRanges={[
                { range: "≥ 0.8", color: "text-emerald-400", meaning: "Excellent quality" },
                { range: "0.5–0.8", color: "text-amber-400", meaning: "Needs improvement" },
                { range: "< 0.5", color: "text-red-400", meaning: "Poor quality" },
              ]}
              learnMoreUrl="https://en.wikipedia.org/wiki/Arithmetic_mean"
            />
            <StatBox
              label="Std Dev"
              value={stats.std.toFixed(2)}
              tooltipTitle="Standard Deviation (σ)"
              tooltipDescription="Measures how spread out scores are from the mean. Lower values indicate more consistent, predictable quality."
              tooltipRanges={[
                { range: "≤ 0.15", color: "text-emerald-400", meaning: "Very consistent" },
                { range: "0.15–0.25", color: "text-amber-400", meaning: "Moderate variance" },
                { range: "> 0.25", color: "text-red-400", meaning: "High variance" },
              ]}
              learnMoreUrl="https://en.wikipedia.org/wiki/Standard_deviation"
            />
            <StatBox
              label="Min"
              value={stats.min.toFixed(2)}
              tooltipTitle="Minimum Score"
              tooltipDescription="The lowest evaluation score in the sample. Very low minimums may indicate problematic examples or edge cases that need attention."
            />
            <StatBox
              label="Max"
              value={stats.max.toFixed(2)}
              tooltipTitle="Maximum Score"
              tooltipDescription="The highest evaluation score in the sample. A max of 1.0 across many samples may indicate lenient grading criteria."
            />
            <StatBox
              label="Median"
              value={stats.median.toFixed(2)}
              tooltipTitle="Median Score"
              tooltipDescription="The middle value when scores are sorted. Less affected by outliers than mean, useful for skewed distributions."
              learnMoreUrl="https://en.wikipedia.org/wiki/Median"
            />
          </div>
        </TooltipProvider>
      )}

      {/* Diagnosis */}
      {showDiagnosis && (
        <div
          className={cn(
            "rounded-md p-3 border",
            diagnosis.bgColor,
            diagnosis.color
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-bold",
                diagnosis.verdict === "GO"
                  ? "bg-green-600 text-white"
                  : diagnosis.verdict === "NO-GO"
                  ? "bg-red-600 text-white"
                  : "bg-amber-600 text-white"
              )}
            >
              {diagnosis.verdict === "GO" ? "🟢 GO" : diagnosis.verdict === "NO-GO" ? "🔴 NO-GO" : "🟡 WARNING"}
            </span>
            <span className="text-sm font-medium">
              {diagnosis.verdict === "GO"
                ? "Dataset and grader quality look good"
                : diagnosis.issues[0]}
            </span>
          </div>
          {diagnosis.issues.length > 1 && (
            <ul className="mt-2 text-xs space-y-1 ml-6">
              {diagnosis.issues.slice(1).map((issue, i) => (
                <li key={i}>• {issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface TooltipRange {
  range: string;
  color: string;
  meaning: string;
}

function StatBox({
  label,
  value,
  highlight = false,
  tooltipTitle,
  tooltipDescription,
  tooltipRanges,
  learnMoreUrl,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tooltipTitle?: string;
  tooltipDescription?: string;
  tooltipRanges?: TooltipRange[];
  learnMoreUrl?: string;
}) {
  const content = (
    <div
      className={cn(
        "rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5 cursor-help transition-colors hover:bg-zinc-900/80",
        highlight && "border-emerald-500/30 bg-emerald-500/5"
      )}
    >
      <div className="flex items-center justify-center gap-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
        {tooltipDescription && (
          <HelpCircle className="h-3 w-3 text-zinc-600" />
        )}
      </div>
      <p className={cn("text-lg font-mono font-semibold text-zinc-200 mt-0.5", highlight && "text-emerald-400")}>
        {value}
      </p>
    </div>
  );

  if (!tooltipDescription) return content;

  return (
    <UITooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[280px] text-xs p-3">
        {tooltipTitle && <p className="font-semibold mb-1">{tooltipTitle}</p>}
        <p className="text-muted-foreground mb-2">{tooltipDescription}</p>
        {tooltipRanges && tooltipRanges.length > 0 && (
          <div className="text-muted-foreground border-t border-zinc-700 pt-2 mt-2">
            {tooltipRanges.map((r, i) => (
              <p key={i} className="mb-1">
                <span className={r.color}>{r.range}</span> — {r.meaning}
              </p>
            ))}
          </div>
        )}
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline block mt-2"
            onClick={(e) => e.stopPropagation()}
          >
            Learn more →
          </a>
        )}
      </TooltipContent>
    </UITooltip>
  );
}

/**
 * Compact score display for headers
 */
export function ScoreBadge({ mean, std }: { mean: number; std: number }) {
  const diagnosis = getDiagnosis({ mean, std, min: 0, max: 1, median: mean });

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        diagnosis.bgColor,
        diagnosis.color
      )}
    >
      <span>
        {diagnosis.verdict === "GO" ? "🟢" : diagnosis.verdict === "NO-GO" ? "🔴" : "🟡"}
      </span>
      <span>
        Mean: {mean.toFixed(2)} (Std: {std.toFixed(2)})
      </span>
    </div>
  );
}
