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
import type { TopicEvalStats, ReadinessGate } from "@/types/dataset-types";

interface ScoreStripProps {
  readonly scores: number[];
  readonly mean?: number;
  readonly className?: string;
  /** Per-topic breakdown data — adds a "By Topic" tab when provided */
  readonly byTopic?: Record<string, TopicEvalStats>;
  /** Readiness gate result — adds a "Readiness" tab when provided */
  readonly readinessGate?: ReadinessGate;
}

type ChartView = "distribution" | "sorted" | "boxplot" | "topics" | "readiness";

const CHART_LABELS: Record<ChartView, string> = {
  distribution: "Distribution",
  sorted: "Sorted Scores",
  boxplot: "Box Plot",
  topics: "By Topic",
  readiness: "Readiness",
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

export function ScoreStrip({ scores, mean, className, byTopic, readinessGate }: ScoreStripProps) {
  const [view, setView] = useState<ChartView>("distribution");
  const hasTopics = byTopic && Object.keys(byTopic).length > 0;

  // Only show tabs that have data
  const availableViews: ChartView[] = [
    "distribution", "sorted", "boxplot",
    ...(hasTopics ? ["topics" as const] : []),
    ...(readinessGate ? ["readiness" as const] : []),
  ];

  return (
    <div className={cn("w-full", className)}>
      {/* Chart type selector — pill-style segmented control */}
      <div className="flex items-center justify-end mb-1">
        <div className="flex items-center bg-zinc-800/40 rounded-md p-0.5 gap-0.5">
          {availableViews.map((key) => (
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
      {view === "topics" && hasTopics && <TopicBarChart byTopic={byTopic} />}
      {view === "readiness" && readinessGate && <ReadinessView gate={readinessGate} />}

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

// ─── Topic Horizontal Bar Chart ───

// Topic status tooltips — reframed for GRPO: low base model scores are EXPECTED,
// focus on grader quality and relative topic comparison, not absolute score level.
const STATUS_TOOLTIPS: Record<string, { label: string; description: string; action: string }> = {
  good: {
    label: "Strong",
    description: "This topic scores above average. The grader provides clear signal here.",
    action: "Good training signal. GRPO will reinforce this capability.",
  },
  warning: {
    label: "Typical",
    description: "This topic scores in the expected range for a base model. Low scores are normal before training \u2014 GRPO learns from comparing K=8 completions, not from high absolute scores.",
    action: "Check that the grader differentiates quality within this topic. If all records score identically, the grader may need topic-specific criteria.",
  },
  problem: {
    label: "Weak",
    description: "This topic scores well below average. This is not necessarily a problem \u2014 hard topics yield the largest training gains (arXiv:2508.14094). But verify the grader is working correctly for this topic.",
    action: "Review 2\u20133 low-scoring records: are the grader\u2019s reasons sensible? If yes, these hard examples are valuable for training. If the reasons are wrong, adjust grader criteria for this topic.",
  },
};

interface TopicDatum {
  name: string;
  shortName: string;
  mean: number;
  count: number;
  status: string;
  color: string;
}

function TopicChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TopicDatum }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const tip = STATUS_TOOLTIPS[d.status];
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 shadow-lg max-w-[300px]">
      <div className="text-[11px] text-zinc-200 font-medium mb-1">{d.name}</div>
      <div className="text-[11px] text-zinc-400 space-y-0.5">
        <div>Score: <span className="font-semibold text-zinc-200">{d.mean.toFixed(3)}</span> &middot; {d.count} records</div>
        {tip && (
          <>
            <div className="border-t border-zinc-800 my-1" />
            <div className="font-medium" style={{ color: d.color }}>{tip.label}</div>
            <div className="text-[10px] text-zinc-500">{tip.description}</div>
            <div className="text-[10px] text-zinc-400 italic mt-0.5">{tip.action}</div>
          </>
        )}
      </div>
    </div>
  );
}

function TopicBarChart({ byTopic }: { byTopic: Record<string, TopicEvalStats> }) {
  const data = useMemo<TopicDatum[]>(() => {
    return Object.entries(byTopic)
      .map(([name, stats]) => ({
        name,
        shortName: name.length > 20 ? name.slice(0, 18) + "\u2026" : name,
        mean: stats.mean,
        count: stats.count,
        status: stats.status,
        color: stats.mean >= 0.8 ? "#10b981" : stats.mean >= 0.6 ? "#eab308" : stats.mean >= 0.25 ? "#f97316" : "#ef4444",
      }))
      .sort((a, b) => b.mean - a.mean);
  }, [byTopic]);

  // Dynamic height: ~20px per topic, min 140, max 300
  const chartHeight = Math.max(140, Math.min(300, data.length * 22));

  return (
    <div style={{ height: chartHeight, overflowY: chartHeight >= 300 ? "auto" : "hidden" }}>
      <ResponsiveContainer width="100%" height={Math.max(chartHeight, data.length * 22)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 4 }}>
          <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="shortName" width={140} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} tickLine={false} axisLine={false} />
          <RechartsTooltip content={<TopicChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="mean" radius={[0, 3, 3, 0]} label={{ position: "right", fontSize: 9, fill: "rgba(255,255,255,0.5)", formatter: (v) => typeof v === "number" ? v.toFixed(2) : String(v ?? "") }}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Readiness Gate View ───

/** Human-friendly labels and explanations for each check */
const CHECK_META: Record<string, { label: string; why: string; source: string }> = {
  sample_count: { label: "Samples", why: "GRPO needs enough prompts for stable advantage estimates.", source: "OpenAI RFT" },
  score_std: { label: "Score Spread", why: "Grader must produce varied scores — zero spread = zero gradient.", source: "Dr. GRPO" },
  score_concentration: { label: "Score Diversity", why: "If >50% of scores are the same value, the grader is too coarse. With K=8 completions all getting the same score, advantage=(r\u2212mean)/std=0 \u2192 zero gradient. The grader needs more granular criteria.", source: "DAPO (arXiv:2503.14476), Dr. GRPO (arXiv:2503.20783)" },
  high_score_frac: { label: "Not Too Easy", why: "If most scores are >0.9, grader is too lenient — all K completions score high = no signal.", source: "DAPO" },
  binary_frac: { label: "Partial Credit", why: "Continuous 0–1 scoring gives stronger gradient than binary pass/fail.", source: "DeepSeek-R1" },
  avg_score: { label: "Has Signal", why: "Just needs nonzero — only 0% success is fatal. Low scores are expected for base models.", source: "OpenAI RFT" },
  dead_weight_frac: { label: "Compute Efficiency", why: "Dead-weight prompts (score<0.1) waste GPU. 30–99% zero-variance per batch is normal.", source: "ICLR 2026" },
  pass_rate: { label: "Quality Floor", why: "Eval K=1 ≠ Training K=8. A 6.5% pass@1 ≈ 41% pass@8. Hard examples = biggest gains.", source: "arXiv:2508.14094" },
  prompt_learnability: { label: "Learnable Prompts", why: "Prompts where all completions score the same give zero GRPO gradient.", source: "DAPO" },
  score_length_corr: { label: "No Length Bias", why: "High score↔length correlation = grader rewards verbosity, not quality.", source: "Dr. GRPO" },
  topic_balance: { label: "Topic Balance", why: "No single topic should dominate >40% — prevents over-optimization.", source: "OpenAI RFT" },
};

function formatCheckValue(id: string, value: number): string {
  if (id === "sample_count") return String(value);
  return (value * 100).toFixed(1) + "%";
}

/** Progress bar showing value relative to threshold */
function CheckGauge({ check }: { check: { id: string; passed: boolean; value: number; threshold: string; kind: string; skipped?: boolean; suggestion: string } }) {
  const meta = CHECK_META[check.id];
  const label = meta?.label ?? check.id;
  const isHard = check.kind === "hard";
  const isFailed = !check.passed && !check.skipped;

  // Parse threshold for progress calculation
  const threshNum = parseFloat(check.threshold.replace(/[<>=\s]/g, ""));
  const isGt = check.threshold.includes(">");
  // For ">" checks, progress = value/threshold (capped at 1). For "<" checks, progress = 1 - value/threshold
  const ratio = isGt
    ? Math.min(check.value / (threshNum || 1), 1.5)
    : Math.min(1.5, threshNum > 0 ? 1 - (check.value / threshNum) + 1 : 1);
  const progressPct = Math.max(0, Math.min(100, (ratio / 1.5) * 100));

  const barColor = check.skipped
    ? "bg-zinc-700"
    : check.passed
      ? "bg-emerald-500/60"
      : isHard ? "bg-red-500/60" : "bg-amber-500/60";

  const valueColor = check.skipped
    ? "text-zinc-600"
    : check.passed
      ? "text-emerald-400"
      : isHard ? "text-red-400" : "text-amber-400";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-1 cursor-help">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">{label}</span>
              <span className={cn("text-[10px] font-mono font-semibold tabular-nums", valueColor)}>
                {formatCheckValue(check.id, check.value)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[320px] p-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-zinc-200">{label}</span>
              <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium", isHard ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800 text-zinc-400")}>
                {check.kind}
              </span>
              <span className={cn("text-[9px] font-medium", check.passed ? "text-emerald-400" : isFailed ? (isHard ? "text-red-400" : "text-amber-400") : "text-zinc-500")}>
                {check.passed ? "passed" : check.skipped ? "skipped" : "failed"}
              </span>
            </div>
            <div className="text-[11px] text-zinc-300">
              <span className={cn("font-mono font-semibold", valueColor)}>{formatCheckValue(check.id, check.value)}</span>
              <span className="text-zinc-600 mx-1">{check.threshold}</span>
            </div>
            {meta && <p className="text-[10px] text-zinc-400 leading-relaxed">{meta.why}</p>}
            {isFailed && <p className="text-[10px] text-zinc-500 border-t border-zinc-800 pt-1.5">{check.suggestion}</p>}
            {meta && <p className="text-[9px] text-zinc-600 italic">{meta.source}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ReadinessView({ gate }: { gate: ReadinessGate }) {
  const hardChecks = gate.checks.filter(c => c.kind === "hard");
  const softChecks = gate.checks.filter(c => c.kind === "soft");

  // Check if score_concentration is extreme (>70%) — this means the grader is
  // broken (most K=8 groups will score identically → zero gradient → wasted GPU).
  // Unlike other soft warnings, this should NOT be treated as "safe to proceed."
  const concentrationCheck = gate.checks.find(c => c.id === "score_concentration");
  const concentrationBlocksTraining = concentrationCheck != null
    && !concentrationCheck.passed
    && concentrationCheck.value > 0.70;

  const effectiveVerdict = gate.verdict === "WARN" && concentrationBlocksTraining ? "FIX_GRADER" : gate.verdict;
  const verdictColor = effectiveVerdict === "PASS" ? "text-emerald-400"
    : effectiveVerdict === "FIX_GRADER" ? "text-orange-400"
    : effectiveVerdict === "WARN" ? "text-amber-400"
    : "text-red-400";
  const verdictBg = effectiveVerdict === "PASS" ? "bg-emerald-500/10"
    : effectiveVerdict === "FIX_GRADER" ? "bg-orange-500/10"
    : effectiveVerdict === "WARN" ? "bg-amber-500/10"
    : "bg-red-500/10";

  return (
    <div className="space-y-3">
      {/* Verdict header */}
      <div className="flex items-center gap-3">
        <div className={cn("px-2.5 py-1 rounded-md text-xs font-bold", verdictBg, verdictColor)}>
          {effectiveVerdict === "FIX_GRADER" ? "FIX GRADER" : gate.verdict}
        </div>
        <span className="text-[10px] text-zinc-500">
          {effectiveVerdict === "PASS" && "Grader quality verified. Ready for training."}
          {effectiveVerdict === "FIX_GRADER" && `${Math.round(concentrationCheck!.value * 100)}% of scores are one value — fix grader before training or GPU hours will be wasted.`}
          {effectiveVerdict === "WARN" && "Some quality signals below ideal — training can proceed."}
          {effectiveVerdict === "FAIL" && "Grader issues detected. Fix before training."}
        </span>
        <span className="ml-auto text-[10px] text-zinc-600">
          {gate.hardPassed}/{gate.hardTotal} hard · {gate.softPassed}/{gate.softTotal} soft
        </span>
      </div>

      {/* Two-column gauge grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="space-y-2">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Grader Quality</p>
          {hardChecks.map(c => <CheckGauge key={c.id} check={c} />)}
        </div>
        <div className="space-y-2">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Quality Signals</p>
          {softChecks.map(c => <CheckGauge key={c.id} check={c} />)}
        </div>
      </div>
    </div>
  );
}
