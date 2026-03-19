/**
 * ScoreStrip
 *
 * Multi-view score visualization for evaluation results.
 * Dropdown lets user switch between: Distribution (histogram), Sorted Bars, Box Plot.
 * All charts use Recharts.
 */

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ReferenceLine,
  ReferenceArea,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScoreStripProps {
  readonly scores: number[];
  readonly mean?: number;
  readonly className?: string;
}

type ChartView = "distribution" | "sorted" | "boxplot";

const CHART_LABELS: Record<ChartView, string> = {
  distribution: "Distribution",
  sorted: "Sorted Scores",
  boxplot: "Box Plot",
};

// ─── Color helpers ───

const BIN_COLORS = [
  "#ef4444", "#f87171", "#f97316", "#fb923c", "#eab308",
  "#facc15", "#84cc16", "#a3e635", "#10b981", "#34d399",
];

const BIN_LABELS = [
  "0.0–0.1", "0.1–0.2", "0.2–0.3", "0.3–0.4", "0.4–0.5",
  "0.5–0.6", "0.6–0.7", "0.7–0.8", "0.8–0.9", "0.9–1.0",
];

function scoreColor(s: number): string {
  return BIN_COLORS[Math.min(Math.floor(s * 10), 9)];
}

// ─── Main component ───

export function ScoreStrip({ scores, mean, className }: ScoreStripProps) {
  const [view, setView] = useState<ChartView>("distribution");

  return (
    <div className={cn("w-full", className)}>
      {/* Chart type selector — pill-style segmented control */}
      <div className="flex items-center justify-end mb-1">
        <div className="flex items-center bg-zinc-800/40 rounded-md p-0.5 gap-0.5">
          {(Object.keys(CHART_LABELS) as ChartView[]).map((key) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium rounded transition-all",
                view === key
                  ? "bg-zinc-700/80 text-zinc-200 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {CHART_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Chart content */}
      {view === "distribution" && <DistributionChart scores={scores} mean={mean} />}
      {view === "sorted" && <SortedBarsChart scores={scores} mean={mean} />}
      {view === "boxplot" && <BoxPlotChart scores={scores} />}

      {/* Mean legend with tooltip */}
      {mean != null && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 mt-1 cursor-help w-fit">
                <span className="w-4 h-0 border-t border-dashed border-white/50" />
                <span className="text-[10px] text-zinc-500 font-mono">Mean {mean.toFixed(2)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[260px]">
              <p className="text-[11px]">
                The <span className="font-semibold">mean score</span> ({mean.toFixed(3)}) is the average across all {scores.length} records
                in this evaluation. The dashed line shows where this average falls on the distribution.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── Distribution Histogram ───

interface BinData {
  range: string;
  count: number;
  color: string;
}

function DistributionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: BinData }> }) {
  if (!active || !payload?.[0]) return null;
  const { range, count } = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 shadow-lg">
      <div className="text-[11px] text-zinc-300 font-medium">{range}</div>
      <div className="text-[11px] text-zinc-400">
        <span className="font-semibold text-zinc-200">{count}</span> record{count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function BarCountLabel(props: Record<string, unknown>) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const value = Number(props.value ?? 0);
  if (value <= 0) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.6)" fontWeight={700}>
      {value}
    </text>
  );
}

function DistributionChart({ scores, mean }: { scores: number[]; mean?: number }) {
  const data = useMemo<BinData[]>(() => {
    const counts = Array(10).fill(0) as number[];
    for (const s of scores) {
      counts[Math.min(Math.floor(s * 10), 9)]++;
    }
    return counts.map((count, i) => ({
      range: BIN_LABELS[i],
      count,
      color: BIN_COLORS[i],
    }));
  }, [scores]);

  const meanX = mean !== undefined ? BIN_LABELS[Math.min(Math.floor(mean * 10), 9)] : undefined;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 14, right: 4, bottom: 0, left: 4 }} barCategoryGap="8%">
        <XAxis
          dataKey="range"
          tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
          axisLine={{ stroke: "#27272a" }}
          tickLine={false}
          interval={1}
        />
        <YAxis hide />
        <RechartsTooltip
          content={<DistributionTooltip />}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} label={<BarCountLabel />}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} fillOpacity={entry.count === 0 ? 0.1 : 0.85} />
          ))}
        </Bar>
        {meanX && (
          <ReferenceLine
            x={meanX}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1.5}
            strokeDasharray="3 2"
            label={{ value: `Mean ${mean!.toFixed(2)}`, position: "top", fontSize: 9, fill: "#a1a1aa", fontFamily: "monospace" }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Sorted Bars Chart ───

interface SortedBarData {
  index: number;
  score: number;
  color: string;
}

function SortedTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SortedBarData }> }) {
  if (!active || !payload?.[0]) return null;
  const { index, score } = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 shadow-lg">
      <div className="text-[11px] text-zinc-300">Record #{index + 1}</div>
      <div className="text-[11px] font-mono font-semibold text-zinc-200">{score.toFixed(3)}</div>
    </div>
  );
}

function SortedBarsChart({ scores, mean }: { scores: number[]; mean?: number }) {
  const data = useMemo<SortedBarData[]>(() => {
    return [...scores]
      .sort((a, b) => a - b)
      .map((score, i) => ({ index: i, score, color: scoreColor(score) }));
  }, [scores]);

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap={0} barGap={0}>
        <XAxis
          dataKey="index"
          tick={false}
          axisLine={{ stroke: "#27272a" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          width={28}
          ticks={[0, 0.5, 1.0]}
        />
        <RechartsTooltip
          content={<SortedTooltip />}
          cursor={{ fill: "rgba(255,255,255,0.05)" }}
        />
        {/* Score zone backgrounds */}
        <ReferenceArea y1={0.8} y2={1} fill="#10b981" fillOpacity={0.05} />
        <ReferenceArea y1={0.6} y2={0.8} fill="#eab308" fillOpacity={0.03} />
        <ReferenceArea y1={0} y2={0.6} fill="#ef4444" fillOpacity={0.03} />
        <Bar dataKey="score" radius={[1, 1, 0, 0]} maxBarSize={8}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} fillOpacity={0.8} />
          ))}
        </Bar>
        {mean !== undefined && (
          <ReferenceLine
            y={mean}
            stroke="rgba(255,255,255,0.4)"
            strokeDasharray="3 2"
            label={{ value: `Mean ${mean.toFixed(2)}`, position: "right", fontSize: 9, fill: "#71717a", fontFamily: "monospace" }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Box Plot (via Scatter) ───

function BoxPlotChart({ scores }: { scores: number[] }) {
  const stats = useMemo(() => {
    const sorted = [...scores].sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return null;
    const q1 = sorted[Math.floor(n * 0.25)];
    const median = sorted[Math.floor(n * 0.5)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const min = sorted[0];
    const max = sorted[n - 1];
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    // Outliers: below Q1 - 1.5*IQR or above Q3 + 1.5*IQR
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outliers = sorted.filter((s) => s < lowerFence || s > upperFence);
    const whiskerLow = Math.max(min, lowerFence);
    const whiskerHigh = Math.min(max, upperFence);
    return { q1, median, q3, min, max, mean, whiskerLow, whiskerHigh, outliers };
  }, [scores]);

  if (!stats) return null;

  // Render as a horizontal box plot using scatter + reference areas
  const dotData = stats.outliers.map((s, i) => ({ x: s, y: 0.5, index: i }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, 1]}
          tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
          axisLine={{ stroke: "#27272a" }}
          tickLine={false}
          ticks={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
        />
        <YAxis type="number" dataKey="y" hide domain={[0, 1]} />
        <ZAxis range={[30, 30]} />

        {/* Score zone backgrounds */}
        <ReferenceArea x1={0.8} x2={1} fill="#10b981" fillOpacity={0.06} />
        <ReferenceArea x1={0.6} x2={0.8} fill="#eab308" fillOpacity={0.04} />
        <ReferenceArea x1={0} x2={0.6} fill="#ef4444" fillOpacity={0.04} />

        {/* IQR box */}
        <ReferenceArea
          x1={stats.q1} x2={stats.q3}
          y1={0.2} y2={0.8}
          fill="#3b82f6" fillOpacity={0.15}
          stroke="#3b82f6" strokeOpacity={0.4}
        />

        {/* Median line */}
        <ReferenceLine x={stats.median} stroke="#3b82f6" strokeWidth={2} />

        {/* Mean marker */}
        <ReferenceLine
          x={stats.mean}
          stroke="rgba(255,255,255,0.5)"
          strokeDasharray="3 2"
          label={{ value: `Mean ${stats.mean.toFixed(2)}`, position: "top", fontSize: 9, fill: "#a1a1aa", fontFamily: "monospace" }}
        />

        {/* Whiskers */}
        <ReferenceLine x={stats.whiskerLow} stroke="#52525b" strokeWidth={1} />
        <ReferenceLine x={stats.whiskerHigh} stroke="#52525b" strokeWidth={1} />

        {/* Whisker lines (horizontal) — simulated with thin reference areas */}
        <ReferenceArea x1={stats.whiskerLow} x2={stats.q1} y1={0.45} y2={0.55} fill="#52525b" fillOpacity={0.3} />
        <ReferenceArea x1={stats.q3} x2={stats.whiskerHigh} y1={0.45} y2={0.55} fill="#52525b" fillOpacity={0.3} />

        {/* Outlier dots */}
        {dotData.length > 0 && (
          <Scatter data={dotData} fill="#ef4444" fillOpacity={0.7} />
        )}

        <RechartsTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const val = payload[0].payload as { x: number };
            return (
              <div className="bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 shadow-lg">
                <div className="text-[11px] font-mono text-zinc-200">{val.x.toFixed(3)}</div>
                <div className="text-[10px] text-red-400">Outlier</div>
              </div>
            );
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
