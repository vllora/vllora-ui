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
import { cn } from "@/lib/utils";

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
    issues.push("Mean too low - dataset may be too hard or grader too strict");
  }
  if (stats.mean > 0.9) {
    issues.push("Mean too high - dataset may be too easy or grader too lenient");
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
    <div className="bg-popover border rounded-md shadow-md p-2 text-sm">
      <p className="font-medium">Score: {data.range}</p>
      <p className="text-muted-foreground">
        {data.count} samples ({data.percentage.toFixed(1)}%)
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
}: ScoreHistogramProps) {
  const histogramData = useMemo(
    () => calculateHistogram(scores, bins),
    [scores, bins]
  );

  const stats = useMemo(() => calculateStats(scores), [scores]);
  const diagnosis = useMemo(() => getDiagnosis(stats), [stats]);

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

  // Determine bar color based on score range
  const getBarColor = (bin: HistogramBin) => {
    const midpoint = (bin.rangeStart + bin.rangeEnd) / 2;
    if (midpoint < 0.2) return "hsl(var(--destructive))";
    if (midpoint < 0.4) return "hsl(38 92% 50%)"; // amber
    if (midpoint < 0.7) return "hsl(var(--primary))";
    return "hsl(142 76% 36%)"; // green
  };

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={histogramData}
            margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
          >
            <XAxis
              dataKey="range"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={50}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `${value}`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Mean line */}
            {showMean && (
              <ReferenceLine
                x={histogramData.findIndex(
                  (b) => stats.mean >= b.rangeStart && stats.mean < b.rangeEnd
                )}
                stroke="hsl(var(--primary))"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Mean: ${stats.mean.toFixed(2)}`,
                  position: "top",
                  fontSize: 11,
                  fill: "hsl(var(--primary))",
                }}
              />
            )}
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {histogramData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry)} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Statistics */}
      {showStats && (
        <div className="grid grid-cols-5 gap-2 text-center">
          <StatBox label="Mean" value={stats.mean.toFixed(2)} highlight />
          <StatBox label="Std" value={stats.std.toFixed(2)} />
          <StatBox label="Min" value={stats.min.toFixed(2)} />
          <StatBox label="Max" value={stats.max.toFixed(2)} />
          <StatBox label="Median" value={stats.median.toFixed(2)} />
        </div>
      )}

      {/* Diagnosis */}
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
    </div>
  );
}

function StatBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-2",
        highlight && "bg-primary/5 border-primary/20"
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", highlight && "text-primary")}>
        {value}
      </p>
    </div>
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
