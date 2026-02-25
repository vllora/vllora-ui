/**
 * TrainingMetricsChart
 *
 * Visualizes training evaluation metrics with epoch-over-epoch progress charts.
 * Uses area gradients, score-zone bands, and per-criteria breakdowns.
 */

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { cn } from "@/lib/utils";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import {
  parseScoreBreakdown,
  getAllCriteriaNames,
  averageCriteriaScores,
  getScoreColorClass,
  formatScore,
  type ScoreBreakdown,
} from "@/utils/parse-score-breakdown";

interface TrainingMetricsChartProps {
  results: FinetuneEvalResultsResponse["results"];
  className?: string;
}

// Criteria line colors (distinct, dark-theme friendly)
const CRITERIA_COLORS = [
  "#6366f1", // Indigo
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

interface EpochData {
  epoch: number;
  avgScore: number;
  rowCount: number;
  criteriaAvg: Record<string, number>;
}

// Custom tooltip with dark styling
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[11px] font-medium text-zinc-300 mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-zinc-400">{entry.dataKey}</span>
            <span className={cn(
              "ml-auto font-mono font-medium",
              entry.dataKey === "Avg Score"
                ? getScoreColorClass(entry.value)
                : "text-zinc-200"
            )}>
              {entry.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Custom dot with glow for the main score line
function ScoreDot(props: { cx?: number; cy?: number; value?: number }) {
  const { cx, cy, value } = props;
  if (cx === undefined || cy === undefined || value === undefined) return null;

  const color = value >= 0.8 ? "#34d399" : value >= 0.6 ? "#fbbf24" : "#f87171";

  return (
    <g>
      {/* Glow */}
      <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.15} />
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} />
      {/* Inner dot */}
      <circle cx={cx} cy={cy} r={3} fill={color} />
    </g>
  );
}

export function TrainingMetricsChart({
  results,
  className,
}: TrainingMetricsChartProps) {
  // Process data for charts
  const { epochData, criteriaNames, latestCriteriaAvg } = useMemo(() => {
    const epochMap = new Map<
      number,
      { scores: number[]; breakdowns: ScoreBreakdown[] }
    >();

    for (const row of results) {
      for (const [epochStr, evalResults] of Object.entries(row.epochs)) {
        const epoch = parseInt(epochStr, 10);

        if (!epochMap.has(epoch)) {
          epochMap.set(epoch, { scores: [], breakdowns: [] });
        }
        const epochStats = epochMap.get(epoch)!;

        for (const result of evalResults) {
          const breakdown = parseScoreBreakdown(result.reason);

          if (typeof result.score === "number") {
            epochStats.scores.push(result.score);
            epochStats.breakdowns.push(breakdown);
          }
        }
      }
    }

    const sortedEpochs = Array.from(epochMap.entries()).sort(
      ([a], [b]) => a - b
    );
    const epochDataList: EpochData[] = sortedEpochs.map(([epoch, stats]) => {
      const avgScore =
        stats.scores.length > 0
          ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
          : 0;
      const criteriaAvg = averageCriteriaScores(stats.breakdowns);

      return { epoch, avgScore, rowCount: stats.scores.length, criteriaAvg };
    });

    const criteriaNamesList = getAllCriteriaNames(
      Array.from(epochMap.values()).flatMap((s) => s.breakdowns)
    );

    const latestAvg =
      epochDataList.length > 0
        ? epochDataList[epochDataList.length - 1].criteriaAvg
        : {};

    return {
      epochData: epochDataList,
      criteriaNames: criteriaNamesList,
      latestCriteriaAvg: latestAvg,
    };
  }, [results]);

  if (epochData.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No epoch data available for visualization
      </div>
    );
  }

  // Prepare chart data — display epochs as 1-based (backend is 0-based)
  const chartData = epochData.map((epoch) => ({
    name: `Epoch ${epoch.epoch + 1}`,
    epoch: epoch.epoch,
    "Avg Score": parseFloat(epoch.avgScore.toFixed(3)),
    ...Object.fromEntries(
      Object.entries(epoch.criteriaAvg).map(([key, val]) => [
        key,
        parseFloat(val.toFixed(3)),
      ])
    ),
  }));

  const hasBreakdown = criteriaNames.length > 0;
  const latestEpoch = epochData[epochData.length - 1];
  const latestScore = latestEpoch?.avgScore ?? 0;
  const isSinglePoint = chartData.length === 1;

  // Y-axis ticks at 0.0, 0.2, 0.4, 0.6, 0.8, 1.0
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Score header */}
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Avg Score
        </span>
        <span className={cn("text-2xl font-semibold font-mono tabular-nums", getScoreColorClass(latestScore))}>
          {formatScore(latestScore)}
        </span>
        <span className="text-[11px] text-zinc-600">
          Epoch {latestEpoch ? latestEpoch.epoch + 1 : "-"} &middot; {latestEpoch?.rowCount} rows
        </span>
      </div>

      {/* Chart area */}
      <div className="h-[220px] w-full rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-2 pr-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 12, right: 16, bottom: 4, left: -12 }}
          >
            <defs>
              {/* Main score gradient fill */}
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--theme-500))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="rgb(var(--theme-500))" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Score zone bands (subtle background) */}
            <ReferenceArea y1={0.8} y2={1.0} fill="#22c55e" fillOpacity={0.04} />
            <ReferenceArea y1={0.6} y2={0.8} fill="#eab308" fillOpacity={0.03} />
            <ReferenceArea y1={0} y2={0.6} fill="#ef4444" fillOpacity={0.02} />

            {/* Reference lines at score thresholds */}
            <ReferenceLine y={0.8} stroke="#22c55e" strokeOpacity={0.15} strokeDasharray="4 4" />
            <ReferenceLine y={0.6} stroke="#eab308" strokeOpacity={0.15} strokeDasharray="4 4" />

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(0 0% 20%)"
              strokeOpacity={0.4}
              vertical={false}
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }}
              dy={8}
            />
            <YAxis
              domain={[0, 1]}
              ticks={yTicks}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(0 0% 40%)" }}
              tickFormatter={(v: number) => v.toFixed(1)}
              dx={-4}
            />
            <RechartsTooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "hsl(0 0% 30%)", strokeDasharray: "4 4" }}
            />

            {/* Main score area + line */}
            <Area
              type="monotone"
              dataKey="Avg Score"
              stroke="rgb(var(--theme-500))"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              dot={<ScoreDot />}
              activeDot={{ r: 6, fill: "rgb(var(--theme-400))", stroke: "rgb(var(--theme-300))", strokeWidth: 2 }}
              isAnimationActive={!isSinglePoint}
            />

            {/* Criteria lines (dashed, no fill) */}
            {hasBreakdown &&
              criteriaNames.map((criteria, idx) => (
                <Line
                  key={criteria}
                  type="monotone"
                  dataKey={criteria}
                  stroke={CRITERIA_COLORS[idx % CRITERIA_COLORS.length]}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 2.5, fill: CRITERIA_COLORS[idx % CRITERIA_COLORS.length] }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={!isSinglePoint}
                />
              ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend + Criteria pills */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Main legend */}
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span className="w-3 h-[2px] rounded-full bg-[rgb(var(--theme-500))]" />
          Avg Score
        </div>

        {/* Criteria legends */}
        {hasBreakdown && criteriaNames.map((name, idx) => (
          <div key={name} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span
              className="w-3 h-[2px] rounded-full opacity-70"
              style={{ backgroundColor: CRITERIA_COLORS[idx % CRITERIA_COLORS.length], borderTop: "1px dashed" }}
            />
            {name}
          </div>
        ))}

        {/* Score zone guide (right-aligned) */}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500/60" /> &ge;0.8</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" /> &ge;0.6</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500/60" /> &lt;0.6</span>
        </div>
      </div>

      {/* Criteria Breakdown Pills */}
      {hasBreakdown && Object.keys(latestCriteriaAvg).length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-800/60">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600 self-center mr-1">
            Epoch {latestEpoch ? latestEpoch.epoch + 1 : "-"}
          </span>
          {Object.entries(latestCriteriaAvg).map(([key, val]) => (
            <div
              key={key}
              className={cn(
                "px-2 py-0.5 rounded-md text-[11px] font-medium border",
                val >= 0.8
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : val >= 0.6
                    ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
              )}
            >
              {key}: {formatScore(val)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
