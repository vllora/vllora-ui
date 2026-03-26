/**
 * TrainingMetricsChart
 *
 * Visualizes training evaluation metrics with epoch-over-epoch progress charts.
 * Wrapped in a Stitch-style card with AVG SCORE header, Live badge, and legend footer.
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
  Label,
} from "recharts";
import { cn } from "@/lib/utils";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { getScoreTrendInsights } from "./training-metrics-insights";
import {
  parseScoreBreakdown,
  getAllCriteriaNames,
  averageCriteriaScores,
  formatScore,
  type ScoreBreakdown,
} from "@/utils/parse-score-breakdown";

interface TrainingMetricsChartProps {
  results: FinetuneEvalResultsResponse["results"];
  className?: string;
  /** Whether the training job is currently running (shows Live badge) */
  isLive?: boolean;
}

// Criteria line colors (distinct, dark-theme friendly) — matches Stitch tokens
const CRITERIA_COLORS = [
  "#6366f1", // Indigo (chart-indigo)
  "#f59e0b", // Amber (chart-amber)
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

interface EpochData {
  epoch: number;
  avgScore: number;
  stdDev: number;
  /** Upper bound of ±1 std dev band */
  scoreUpper: number;
  /** Lower bound of ±1 std dev band */
  scoreLower: number;
  improvement: number;
  rowCount: number;
  criteriaAvg: Record<string, number>;
}

// Score Trend & Distribution insights imported from ./training-metrics-insights

// Custom tooltip with dark styling
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-[#262626] bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[10px] font-mono text-slate-500 mb-1.5 border-b border-[#262626] pb-1">
        {label}
      </p>
      <div className="space-y-1">
        {payload.filter((entry) => typeof entry.value === "number" && entry.dataKey !== "stdDevBand").map((entry) => (
          <div
            key={entry.dataKey}
            className="flex items-center justify-between gap-3 text-[11px]"
          >
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-400">{entry.dataKey}</span>
            </span>
            <span
              className="font-mono font-bold"
              style={{ color: entry.color }}
            >
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

  return (
    <g>
      {/* Glow ring */}
      <circle cx={cx} cy={cy} r={8} fill="#10b981" opacity={0.1} />
      {/* Outer ring */}
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="none"
        stroke="#10b981"
        strokeWidth={1.5}
        opacity={0.3}
      />
      {/* Inner dot */}
      <circle cx={cx} cy={cy} r={3} fill="#10b981" />
    </g>
  );
}

export function TrainingMetricsChart({
  results,
  className,
  isLive,
}: TrainingMetricsChartProps) {
  // Process data for charts
  const { epochData, criteriaNames, latestCriteriaAvg } = useMemo(() => {
    const epochMap = new Map<
      number,
      { scores: number[]; breakdowns: ScoreBreakdown[]; uniqueRows: Set<number> }
    >();

    for (const row of results) {
      for (const [epochStr, evalResults] of Object.entries(row.epochs)) {
        const epoch = parseInt(epochStr, 10);

        if (!epochMap.has(epoch)) {
          epochMap.set(epoch, { scores: [], breakdowns: [], uniqueRows: new Set() });
        }
        const epochStats = epochMap.get(epoch)!;

        for (const result of evalResults) {
          const breakdown = parseScoreBreakdown(result.reason);

          if (typeof result.score === "number") {
            epochStats.scores.push(result.score);
            epochStats.breakdowns.push(breakdown);
            epochStats.uniqueRows.add(row.row_index);
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
      const stdDev = stats.scores.length > 0
        ? Math.sqrt(stats.scores.reduce((a, b) => a + (b - avgScore) ** 2, 0) / stats.scores.length)
        : 0;
      const criteriaAvg = averageCriteriaScores(stats.breakdowns);

      return {
        epoch,
        avgScore,
        stdDev,
        scoreUpper: Math.min(1, avgScore + stdDev),
        scoreLower: Math.max(0, avgScore - stdDev),
        improvement: 0, // computed below
        rowCount: stats.uniqueRows.size,
        criteriaAvg,
      };
    });

    // Compute improvement (delta from previous epoch)
    for (let i = 1; i < epochDataList.length; i++) {
      epochDataList[i] = {
        ...epochDataList[i],
        improvement: epochDataList[i].avgScore - epochDataList[i - 1].avgScore,
      };
    }

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
    name: `Eval ${epoch.epoch + 1}`,
    epoch: epoch.epoch,
    "Avg Score": parseFloat(epoch.avgScore.toFixed(3)),
    // Std dev band (upper and lower bounds as an array for Recharts Area)
    stdDevBand: [
      parseFloat(epoch.scoreLower.toFixed(3)),
      parseFloat(epoch.scoreUpper.toFixed(3)),
    ],
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
    <div
      className={cn(
        "rounded-lg bg-[#111] overflow-hidden",
        className
      )}
    >
      {/* ── Card Header ── AVG SCORE + Live badge */}
      <div className="px-5 py-4 border-b border-white/5 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            Avg Score
          </p>
          <div className="flex items-baseline gap-3">
            <h2 className="text-3xl font-mono font-bold text-[#10b981]">
              {formatScore(latestScore)}
            </h2>
            <span className="text-xs font-medium text-slate-400">
              Eval {latestEpoch ? latestEpoch.epoch + 1 : "-"} ·{" "}
              {latestEpoch?.rowCount} rows
            </span>
          </div>
        </div>
        {isLive && (
          <div className="flex items-center gap-2 bg-[#10b981]/10 border border-[#10b981]/20 px-3 py-1 rounded text-xs text-[#10b981] font-medium">
            <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse" />
            Live
          </div>
        )}
      </div>

      {/* ── Chart Area ── */}
      <div className="h-[260px] w-full p-4 pr-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 12, right: 16, bottom: 4, left: -12 }}
          >
            <defs>
              {/* Std dev band gradient */}
              <linearGradient id="stdDevGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.12} />
                <stop offset="50%" stopColor="#10b981" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.12} />
              </linearGradient>
              {/* Main score gradient fill */}
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Score zone bands (subtle background) */}
            <ReferenceArea
              y1={0.8}
              y2={1.0}
              fill="#10b981"
              fillOpacity={0.05}
            >
              <Label
                value="TARGET"
                position="insideTopRight"
                fill="#10b981"
                fontSize={9}
                opacity={0.4}
                fontWeight={700}
              />
            </ReferenceArea>
            <ReferenceArea
              y1={0.6}
              y2={0.8}
              fill="#eab308"
              fillOpacity={0.04}
            >
              <Label
                value="ACCEPTABLE"
                position="insideTopRight"
                fill="#eab308"
                fontSize={9}
                opacity={0.3}
                fontWeight={700}
              />
            </ReferenceArea>
            <ReferenceArea y1={0} y2={0.6} fill="#ef4444" fillOpacity={0.03}>
              <Label
                value="CRITICAL"
                position="insideBottomRight"
                fill="#ef4444"
                fontSize={9}
                opacity={0.3}
                fontWeight={700}
              />
            </ReferenceArea>

            {/* Reference lines at score thresholds */}
            <ReferenceLine
              y={0.8}
              stroke="#10b981"
              strokeOpacity={0.2}
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={0.6}
              stroke="#eab308"
              strokeOpacity={0.15}
              strokeDasharray="4 4"
            />

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#262626"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#64748b" }}
              dy={8}
            />
            <YAxis
              domain={[0, 1]}
              ticks={yTicks}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#475569" }}
              tickFormatter={(v: number) => v.toFixed(1)}
              dx={-4}
            />
            <RechartsTooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "#334155", strokeDasharray: "4 4" }}
            />

            {/* ±1 std dev confidence band */}
            <Area
              type="monotone"
              dataKey="stdDevBand"
              stroke="none"
              fill="url(#stdDevGradient)"
              activeDot={false}
              isAnimationActive={!isSinglePoint}
            />

            {/* Main score area + line */}
            <Area
              type="monotone"
              dataKey="Avg Score"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              dot={<ScoreDot />}
              activeDot={{
                r: 6,
                fill: "#10b981",
                stroke: "#34d399",
                strokeWidth: 2,
              }}
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
                  strokeOpacity={0.7}
                  dot={{
                    r: 2.5,
                    fill: CRITERIA_COLORS[idx % CRITERIA_COLORS.length],
                  }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={!isSinglePoint}
                />
              ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Legend Footer ── Stitch style with dark bg */}
      <div className="px-5 py-3 bg-black/20 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Line legends */}
        <div className="flex items-center gap-4">
          {/* Main score legend */}
          <div className="flex items-center gap-2">
            <span className="block w-3 h-0.5 bg-[#10b981]" />
            <span className="size-1.5 rounded-full bg-[#10b981]" />
            <span className="text-xs text-slate-300 font-medium">
              Score Trend
            </span>
          </div>

          {/* Std dev band legend */}
          <div className="flex items-center gap-2 opacity-60">
            <span className="block w-3 h-2 bg-[#10b981]/20 rounded-sm" />
            <span className="text-xs text-slate-400">±1σ band</span>
          </div>

          {/* Criteria legends */}
          {hasBreakdown &&
            criteriaNames.map((name, idx) => (
              <div
                key={name}
                className="flex items-center gap-2 opacity-75"
              >
                <span
                  className="block w-3 h-0.5"
                  style={{
                    backgroundColor:
                      CRITERIA_COLORS[idx % CRITERIA_COLORS.length],
                  }}
                />
                <span className="text-xs text-slate-400">{name}</span>
              </div>
            ))}
        </div>

        {/* Right: Criteria pills */}
        {hasBreakdown && Object.keys(latestCriteriaAvg).length > 0 && (
          <div className="flex items-center gap-2">
            {Object.entries(latestCriteriaAvg).map(([key, val]) => {
              const idx = criteriaNames.indexOf(key);
              const color = CRITERIA_COLORS[idx >= 0 ? idx % CRITERIA_COLORS.length : 0];
              return (
                <div
                  key={key}
                  className="px-2 py-1 rounded text-[10px] font-mono"
                  style={{
                    backgroundColor: `${color}15`,
                    borderWidth: 1,
                    borderColor: `${color}30`,
                    color: color,
                  }}
                >
                  {key}: {formatScore(val)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Summary Stats ── Total improvement, final avg, spread */}
      {epochData.length >= 2 && (
        <div className="px-5 py-2 border-t border-white/5 flex items-center gap-6 text-[11px] text-zinc-500 flex-wrap">
          <span>
            Total Δ:{" "}
            <span className={cn(
              "font-mono font-semibold",
              epochData[epochData.length - 1].avgScore - epochData[0].avgScore >= 0 ? "text-emerald-400" : "text-red-400",
            )}>
              {epochData[epochData.length - 1].avgScore - epochData[0].avgScore >= 0 ? "+" : ""}
              {(epochData[epochData.length - 1].avgScore - epochData[0].avgScore).toFixed(3)}
            </span>
          </span>
          <span>
            Final avg:{" "}
            <span className="font-mono font-semibold text-zinc-200">
              {formatScore(epochData[epochData.length - 1].avgScore)}
            </span>
          </span>
          <span>
            Spread (σ):{" "}
            <span className="font-mono font-semibold text-zinc-200">
              {epochData[epochData.length - 1].stdDev.toFixed(3)}
            </span>
          </span>
          <span>
            {epochData[epochData.length - 1].rowCount} records
          </span>
        </div>
      )}

      {/* ── Insights ── */}
      {(() => {
        const insights = getScoreTrendInsights(epochData);
        if (insights.length === 0) return null;
        const levelIcon = { ok: "✅", warn: "⚠️", critical: "🔴" } as const;
        const levelColor = { ok: "text-emerald-400/70", warn: "text-amber-400/80", critical: "text-red-400/80" } as const;
        return (
          <div className="px-4 py-2 border-t border-white/5 flex flex-col gap-1">
            {insights.map((ins, i) => (
              <p key={i} className={cn("text-[10px] leading-relaxed", levelColor[ins.level])}>
                {levelIcon[ins.level]} {ins.text}
              </p>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
