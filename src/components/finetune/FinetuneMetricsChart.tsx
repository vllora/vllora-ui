/**
 * FinetuneMetricsChart
 *
 * Visualizes raw GRPO/GSPO training metrics (reward, KL, loss, completion stats).
 *
 * Single metric: full chart with Y-axis + tooltip.
 * Multiple metrics: ONE chart with stacked lanes — each metric normalized to
 *   its own vertical band (e.g., top third, middle third, bottom third).
 *   Single tooltip shows all values. No sync issues.
 * Legend toggles metrics on/off.
 */

import { useMemo, useState, useCallback, useRef, useEffect, memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { AlertTriangle, Activity, TrendingUp, Zap, Eye, EyeOff, BarChart3, Info, TrendingDown } from "lucide-react";
import type { FinetuneJobMetricPoint } from "@/services/finetune-api";
import { getMetricsInsights } from "./training-metrics-insights";

// =============================================================================
// Types & Constants
// =============================================================================

interface FinetuneMetricsChartProps {
  metrics: FinetuneJobMetricPoint[];
  className?: string;
  isLive?: boolean;
  defaultTab?: MetricTab;
  hideTabs?: boolean;
  maxOutputTokens?: number;
}

type MetricTab = "reward" | "loss" | "kl" | "lr" | "gradNorm" | "clipRatio" | "deadPrompts" | "completions" | "tokens" | "batchSize" | "avgCompletion";

interface MetricDef {
  key: string;
  label: string;
  color: string;
  primary: boolean;
  description: string;
  group?: string;
}

const TAB_CONFIG: Record<
  MetricTab,
  { label: string; icon: React.ReactNode; description: string; metrics: readonly MetricDef[] }
> = {
  reward: {
    label: "Reward",
    icon: <TrendingUp className="h-3 w-3" />,
    description: "Reward signal from the grader. Shows how well the model generates high-scoring responses. Reward Std shows score variance (some is healthy — GRPO needs differences to learn). Zero Std Frac shows what % of prompts got identical scores across all completions (= zero learning signal).",
    metrics: [
      { key: "reward", label: "Reward", color: "#10b981", primary: true, description: "Average reward score from the evaluator. Higher = model generates better responses." },
      { key: "reward_std", label: "Reward Std", color: "#6366f1", primary: true, description: "Standard deviation of reward scores across candidates. Some variance is healthy." },
    ],
  },
  loss: {
    label: "Loss",
    icon: <Activity className="h-3 w-3" />,
    description: "GRPO policy loss. Unlike SFT, loss starts near 0 and rises slightly as the model learns — this is normal. A spike followed by recovery is fine. Sustained NaN or explosion means training is broken.",
    metrics: [
      { key: "loss", label: "Loss", color: "#ef4444", primary: true, description: "GRPO policy loss — starts near 0 and rises slightly as learning progresses. Unlike SFT loss, lower is NOT always better." },
    ],
  },
  kl: {
    label: "KL Divergence",
    icon: <Activity className="h-3 w-3" />,
    description: "How far the model has drifted from the base model. With β=0 (default), KL is informational only and does not affect training. Useful for tracking how much the model has changed.",
    metrics: [
      { key: "kl", label: "KL Divergence", color: "#f59e0b", primary: true, description: "Distance from base model distribution. With β=0 (default), this is informational only and does not affect training." },
    ],
  },
  lr: {
    label: "Learning Rate",
    icon: <TrendingUp className="h-3 w-3" />,
    description: "Learning rate schedule over training. Shows warmup (ramp up), peak, and decay phases. If the curve looks wrong, check your scheduler config (cosine, linear, constant).",
    metrics: [
      { key: "learning_rate", label: "Learning Rate", color: "#06b6d4", primary: true, description: "Current learning rate from the scheduler. Shows warmup, peak, and decay phases." },
    ],
  },
  gradNorm: {
    label: "Grad Norm",
    icon: <Activity className="h-3 w-3" />,
    description: "Magnitude of gradient updates. Smooth values = stable training. Spikes = unstable batches or degenerate completions. Sustained high values may need a lower learning rate.",
    metrics: [
      { key: "grad_norm", label: "Grad Norm", color: "#8b5cf6", primary: true, description: "Gradient norm — spikes indicate unstable training." },
    ],
  },
  clipRatio: {
    label: "Trust Region",
    icon: <Activity className="h-3 w-3" />,
    description: "Fraction of token-level policy updates clipped by the GRPO trust region (epsilon). 0.1-0.3 is healthy. Too high means the model is trying to change too fast. Different from Clipped Ratio in Completions (which measures response truncation).",
    metrics: [
      { key: "clip_ratio/region_mean", label: "Trust Region", color: "#ec4899", primary: true, description: "Fraction of tokens clipped by trust region. 0.1-0.3 is healthy. High = updates too aggressive." },
    ],
  },
  deadPrompts: {
    label: "Dead Prompts",
    icon: <Activity className="h-3 w-3" />,
    description: "Fraction of prompts where all G completions scored identically (zero reward variance). These prompts provide no learning signal to GRPO. Healthy <0.2, warning >0.5, critical >0.8.",
    metrics: [
      { key: "frac_reward_zero_std", label: "Zero Std Frac", color: "#f59e0b", primary: true, description: "Fraction of prompts with zero reward variance. Healthy <0.2, warning >0.5, critical >0.8." },
    ],
  },
  completions: {
    label: "Completions",
    icon: <Zap className="h-3 w-3" />,
    description: "Response length and truncation. Clipped Ratio shows what % of responses hit max_output_tokens. Mean Length is the overall average. Natural Avg is the average for responses that finished on their own (model output EOS). A big gap between Mean Length and Natural Avg means truncation is inflating the average.",
    metrics: [
      { key: "completions/clipped_ratio", label: "Clipped Ratio", color: "#ef4444", primary: true, description: "Fraction of responses truncated at max_output_tokens. Healthy <0.1, warning >0.1, critical >0.5.", group: "ratio" },
      { key: "completions/mean_length", label: "Mean Length", color: "#10b981", primary: true, description: "Average response length in tokens.", group: "length" },
      { key: "completions/max_length", label: "Max Length", color: "#f59e0b", primary: false, description: "Longest response in tokens. If stuck at max_output_tokens, model is hitting the ceiling.", group: "length" },
      { key: "completions/min_length", label: "Min Length", color: "#06b6d4", primary: false, description: "Shortest response. Decreasing min suggests some prompts get trivial answers.", group: "length" },
      { key: "completions/mean_terminated_length", label: "Natural Avg", color: "#6366f1", primary: true, description: "Average length of responses that finished naturally (model output EOS). Compare with Mean Length — a big gap means many responses are being truncated.", group: "length" },
      { key: "completions/max_terminated_length", label: "Natural Max", color: "#a855f7", primary: false, description: "Longest response that finished naturally. If close to max_output_tokens, the model needs more room.", group: "length" },
      { key: "completions/min_terminated_length", label: "Natural Min", color: "#14b8a6", primary: false, description: "Shortest response that finished naturally. Very short (<10 tokens) may indicate trivial answers — check grader.", group: "length" },
    ],
  },
  tokens: {
    label: "Tokens/Step",
    icon: <BarChart3 className="h-3 w-3" />,
    description: "Total tokens processed per training step. Sudden drops may indicate shorter completions or filtered batches.",
    metrics: [
      { key: "num_tokens", label: "Tokens/Step", color: "#10b981", primary: true, description: "Total tokens processed per training step. Drops may indicate shorter completions." },
    ],
  },
  batchSize: {
    label: "Batch Size",
    icon: <BarChart3 className="h-3 w-3" />,
    description: "Number of record samples per training step. Should be consistent throughout training — drops may indicate prompts being filtered.",
    metrics: [
      { key: "row_indices_count", label: "Batch Size", color: "#6366f1", primary: true, description: "Number of record samples per step. Should be consistent." },
    ],
  },
  avgCompletion: {
    label: "Avg Completion",
    icon: <BarChart3 className="h-3 w-3" />,
    description: "Average completion length across all candidates in each batch. Trends here mirror the Completions tab but include all G completions per prompt.",
    metrics: [
      { key: "completion_length", label: "Avg Completion", color: "#f59e0b", primary: true, description: "Average completion length across all candidates in the batch." },
    ],
  },
};

// =============================================================================
// Helpers
// =============================================================================

function getAlertCount(metrics: FinetuneJobMetricPoint[]): number {
  if (metrics.length === 0) return 0;
  const latest = metrics[metrics.length - 1].metrics;
  let count = 0;
  if (typeof latest["completions/clipped_ratio"] === "number" && (latest["completions/clipped_ratio"] as number) > 0.5) count++;
  if (typeof latest.frac_reward_zero_std === "number" && (latest.frac_reward_zero_std as number) > 0.5) count++;
  for (const key of ["loss", "reward", "kl", "grad_norm"] as const) {
    const val = latest[key];
    if (val != null && (!isFinite(val as number) || isNaN(val as number))) count++;
  }
  return count;
}

function formatMetricValue(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) < 0.0001) return (value * 1000000).toFixed(1) + "µ";
  if (Math.abs(value) < 0.001) return (value * 1000).toFixed(2) + "m";
  if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "K";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

/** Apply exponential moving average smoothing to chart data */
function applyEmaSmoothing(
  data: Record<string, unknown>[],
  metricKeys: string[],
  alpha = 0.3,
): Record<string, unknown>[] {
  const ema: Record<string, number> = {};
  return data.map((point) => {
    const smoothed = { ...point };
    for (const key of metricKeys) {
      const raw = point[key];
      if (typeof raw !== "number" || !isFinite(raw)) continue;
      if (ema[key] == null) {
        ema[key] = raw;
      } else {
        ema[key] = alpha * raw + (1 - alpha) * ema[key];
      }
      smoothed[key] = ema[key];
    }
    return smoothed;
  });
}

const MAX_CHART_POINTS = 400;

/** Downsample data to at most maxPoints, preserving first/last and local extremes */
function downsample<T>(data: readonly T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data as T[];
  const stride = Math.ceil(data.length / maxPoints);
  const result: T[] = [data[0]];
  for (let i = stride; i < data.length - 1; i += stride) {
    result.push(data[i]);
  }
  result.push(data[data.length - 1]);
  return result;
}

// MetricInsight type and getMetricsInsights imported from ./training-metrics-insights

// =============================================================================
// Stacked lanes: normalize each metric into its own vertical band
// =============================================================================

const LANE_GAP = 0.06; // gap between lanes

interface LanedPoint {
  name: string;
  [key: string]: unknown;
}

function buildLanedData(
  chartData: Record<string, unknown>[],
  visibleMetrics: MetricDef[],
): { data: LanedPoint[]; lanes: { key: string; yCenter: number; yMin: number; yMax: number }[] } {
  const n = visibleMetrics.length;
  const laneHeight = (1 - LANE_GAP * (n - 1)) / n;

  // Compute ranges
  const ranges: Record<string, { min: number; max: number }> = {};
  for (const m of visibleMetrics) {
    const vals = chartData.map((d) => d[m.key]).filter((v): v is number => typeof v === "number" && isFinite(v));
    if (vals.length > 0) {
      ranges[m.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
  }

  // Each metric gets a lane: metric[0] at top, metric[n-1] at bottom
  const lanes = visibleMetrics.map((m, i) => {
    const yMax = 1 - i * (laneHeight + LANE_GAP);
    const yMin = yMax - laneHeight;
    return { key: m.key, yCenter: (yMin + yMax) / 2, yMin, yMax };
  });

  const data = chartData.map((d) => {
    const point: LanedPoint = { name: d.name as string };
    for (let i = 0; i < visibleMetrics.length; i++) {
      const m = visibleMetrics[i];
      const raw = d[m.key];
      const range = ranges[m.key];
      const lane = lanes[i];
      if (typeof raw === "number" && range && lane) {
        const span = range.max - range.min;
        const normalized = span > 0 ? (raw - range.min) / span : 0.5;
        // Map normalized 0-1 into this metric's lane band
        point[m.key] = lane.yMin + normalized * (lane.yMax - lane.yMin);
      }
    }
    // Store raw values for tooltip
    point._raw = Object.fromEntries(visibleMetrics.map((m) => [m.key, d[m.key]]));
    return point;
  });

  return { data, lanes };
}

// =============================================================================
// Stacked Tooltip — shows real values for all visible metrics
// =============================================================================

function StackedTooltip({
  active,
  payload,
  label,
  visibleMetrics,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; payload: LanedPoint }>;
  label?: string;
  visibleMetrics: MetricDef[];
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload?._raw as Record<string, number> | undefined;
  if (!raw) return null;

  return (
    <div className="rounded-lg border border-[#262626] bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[10px] font-mono text-slate-500 mb-1.5 border-b border-[#262626] pb-1">Step {label}</p>
      <div className="space-y-1">
        {visibleMetrics.map((m) => {
          const val = raw[m.key];
          return (
            <div key={m.key} className="flex items-center justify-between gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                <span className="text-slate-400">{m.label}</span>
              </span>
              <span className="font-mono font-bold" style={{ color: m.color }}>
                {typeof val === "number" ? formatMetricValue(val) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Lane label component — rendered as Y-axis tick-like labels
// =============================================================================

function LaneLabels({
  lanes,
  visibleMetrics,
  chartData,
}: {
  lanes: { key: string; yCenter: number }[];
  visibleMetrics: MetricDef[];
  chartData: Record<string, unknown>[];
}) {
  const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  return (
    <div className="absolute left-1 top-0 bottom-0 w-[70px] flex flex-col pointer-events-none" style={{ paddingTop: 8, paddingBottom: 28 }}>
      {lanes.map((lane, i) => {
        const m = visibleMetrics[i];
        const latestVal = latestPoint ? (latestPoint[m.key] as number | undefined) : undefined;
        return (
          <div
            key={lane.key}
            className="absolute left-0 right-0 flex flex-col items-start justify-center"
            style={{
              top: `${(1 - lane.yCenter) * 100}%`,
              transform: "translateY(-50%)",
            }}
          >
            <span className="text-[8px] font-medium uppercase tracking-wider truncate" style={{ color: m.color }}>
              {m.label}
            </span>
            {latestVal != null && (
              <span className="text-[9px] font-mono font-semibold" style={{ color: m.color }}>
                {formatMetricValue(latestVal)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Grouped charts: metrics sharing a Y-axis within each group
// =============================================================================

const GROUP_LABELS: Record<string, string> = {
  ratio: "Clip Ratio",
  length: "Response Length (tokens)",
  score: "Reward Score",
  policy: "Policy Loss & KL",
  stability: "Training Stability",
  schedule: "Learning Rate",
};

function GroupedCharts({
  chartData,
  visibleMetrics,
  maxOutputTokens,
}: {
  chartData: Record<string, unknown>[];
  visibleMetrics: MetricDef[];
  maxOutputTokens?: number;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, MetricDef[]>();
    for (const m of visibleMetrics) {
      const g = m.group ?? "default";
      const list = map.get(g);
      if (list) list.push(m);
      else map.set(g, [m]);
    }
    return Array.from(map.entries());
  }, [visibleMetrics]);

  return (
    <>
      {groups.map(([groupName, metrics]) => {
        const vals = metrics.flatMap((m) =>
          chartData.map((d) => d[m.key]).filter((v): v is number => typeof v === "number" && isFinite(v)),
        );
        const minVal = vals.length > 0 ? Math.min(...vals) : 0;
        const maxVal = vals.length > 0 ? Math.max(...vals) : 1;
        const pad = (maxVal - minVal) * 0.1 || 0.1;
        const yDomain: [number, number] = [Math.max(0, minVal - pad), maxVal + pad];
        const height = metrics.length <= 1 ? 130 : 220;

        return (
          <div key={groupName} className="px-4" style={{ height }}>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider pt-2 pb-1">
              {GROUP_LABELS[groupName] ?? groupName}
            </p>
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={chartData} syncId="completions-sync" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} dy={8} tickFormatter={(v: number) => `Step ${v}`} interval="equidistantPreserveStart" />
                <YAxis domain={yDomain} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#475569" }} tickFormatter={formatMetricValue} width={50} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-[#262626] bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                        <p className="text-[10px] font-mono text-slate-500 mb-1.5 border-b border-[#262626] pb-1">Step {label}</p>
                        <div className="space-y-1">
                          {metrics.map((m) => {
                            const entry = payload.find((p) => p.dataKey === m.key);
                            return (
                              <div key={m.key} className="flex items-center justify-between gap-4 text-[11px]">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                                  <span className="text-slate-400">{m.label}</span>
                                </span>
                                <span className="font-mono font-bold" style={{ color: m.color }}>
                                  {typeof entry?.value === "number" ? formatMetricValue(entry.value) : "-"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ stroke: "#334155", strokeDasharray: "4 4" }}
                />
                {groupName === "ratio" && <ReferenceLine y={0.7} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="4 4" />}
                {groupName === "length" && maxOutputTokens != null && (
                  <ReferenceLine y={maxOutputTokens} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="4 4" />
                )}
                {metrics.map((m) => (
                  <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={m.primary ? 2 : 1.5} dot={false} activeDot={{ r: 3, fill: m.color, stroke: "#111", strokeWidth: 1.5 }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export const FinetuneMetricsChart = memo(function FinetuneMetricsChart({
  metrics,
  className,
  isLive,
  defaultTab,
  hideTabs,
  maxOutputTokens,
}: FinetuneMetricsChartProps) {
  const [internalTab, setInternalTab] = useState<MetricTab>(defaultTab ?? "reward");
  const activeTab = hideTabs ? (defaultTab ?? "reward") : internalTab;
  const setActiveTab = setInternalTab;
  const alertCount = useMemo(() => getAlertCount(metrics), [metrics]);

  // Skip animation on initial mount (fast render), enable on subsequent updates (smooth polling)
  const hasMountedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { hasMountedRef.current = true; }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const [isSmoothed, setIsSmoothed] = useState(false);
  const [isLogScale, setIsLogScale] = useState(false);

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => {
    const tab = TAB_CONFIG[defaultTab ?? "reward"];
    return new Set(tab.metrics.filter((m) => m.primary).map((m) => m.key));
  });

  const handleTabChange = useCallback((tab: MetricTab) => {
    setActiveTab(tab);
    setVisibleKeys(new Set(TAB_CONFIG[tab].metrics.filter((m) => m.primary).map((m) => m.key)));
  }, [setActiveTab]);

  useMemo(() => {
    if (hideTabs && defaultTab) {
      setVisibleKeys(new Set(TAB_CONFIG[defaultTab].metrics.filter((m) => m.primary).map((m) => m.key)));
    }
  }, [hideTabs, defaultTab]);

  const toggleMetric = useCallback((key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const chartData = useMemo(() => {
    return metrics.map((point, idx) => {
      const m = point.metrics;
      return {
        name: typeof m.global_step === "number" ? m.global_step : idx + 1,
        reward: typeof m.reward === "number" ? m.reward : undefined,
        reward_std: typeof m.reward_std === "number" ? m.reward_std : undefined,
        frac_reward_zero_std: typeof m.frac_reward_zero_std === "number" ? m.frac_reward_zero_std : undefined,
        loss: typeof m.loss === "number" ? m.loss : undefined,
        kl: typeof m.kl === "number" ? m.kl : undefined,
        grad_norm: typeof m.grad_norm === "number" ? m.grad_norm : undefined,
        learning_rate: typeof m.learning_rate === "number" ? m.learning_rate : undefined,
        "completions/clipped_ratio": typeof m["completions/clipped_ratio"] === "number" ? m["completions/clipped_ratio"] : undefined,
        "completions/mean_length": typeof m["completions/mean_length"] === "number" ? m["completions/mean_length"] : undefined,
        "completions/max_length": typeof m["completions/max_length"] === "number" ? m["completions/max_length"] : undefined,
        "completions/min_length": typeof m["completions/min_length"] === "number" ? m["completions/min_length"] : undefined,
        "completions/mean_terminated_length": typeof m["completions/mean_terminated_length"] === "number" ? m["completions/mean_terminated_length"] : undefined,
        "completions/max_terminated_length": typeof m["completions/max_terminated_length"] === "number" ? m["completions/max_terminated_length"] : undefined,
        "completions/min_terminated_length": typeof m["completions/min_terminated_length"] === "number" ? m["completions/min_terminated_length"] : undefined,
        num_tokens: typeof m.num_tokens === "number" ? m.num_tokens : undefined,
        row_indices_count: typeof m.row_indices_count === "number" ? m.row_indices_count : undefined,
        completion_length: typeof m.completion_length === "number" ? m.completion_length : undefined,
        "clip_ratio/region_mean": typeof m["clip_ratio/region_mean"] === "number" ? m["clip_ratio/region_mean"] : undefined,
        "clip_ratio/high_mean": typeof m["clip_ratio/high_mean"] === "number" ? m["clip_ratio/high_mean"] : undefined,
        "clip_ratio/low_mean": typeof m["clip_ratio/low_mean"] === "number" ? m["clip_ratio/low_mean"] : undefined,
      };
    });
  }, [metrics]);

  // Apply EMA smoothing + downsampling for performance
  const displayData = useMemo(() => {
    let data = chartData;
    if (isSmoothed) {
      const allKeys = TAB_CONFIG[activeTab].metrics.map((m) => m.key);
      data = applyEmaSmoothing(data as Record<string, unknown>[], allKeys) as typeof chartData;
    }
    return downsample(data, MAX_CHART_POINTS);
  }, [chartData, isSmoothed, activeTab]);

  const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1].metrics : null;
  // Full metrics history as Record[] for cross-metric trend checks (e.g., length-reward divergence)
  const metricsHistory = useMemo(
    () => metrics.map((p) => p.metrics as Record<string, unknown>),
    [metrics],
  );
  const latestStep = latestMetrics && typeof latestMetrics.global_step === "number" ? latestMetrics.global_step : metrics.length;
  const maxSteps = latestMetrics && typeof latestMetrics.max_steps === "number" ? latestMetrics.max_steps : null;
  const progressPercent = maxSteps && latestStep ? Math.round((latestStep / maxSteps) * 100) : null;

  const tabConfig = TAB_CONFIG[activeTab];
  const availableMetrics = tabConfig.metrics.filter((m) =>
    displayData.some((d) => (d as Record<string, unknown>)[m.key] != null)
  );
  const visibleMetrics = availableMetrics.filter((m) => visibleKeys.has(m.key));
  const isSingleMetric = visibleMetrics.length <= 1;
  const hasGroups = visibleMetrics.some((m) => m.group);

  // Build laned data for multi-metric stacked view
  const { data: lanedData, lanes } = useMemo(
    () => buildLanedData(displayData as Record<string, unknown>[], visibleMetrics),
    [displayData, visibleMetrics],
  );

  // Whether to use shared Y-axis (single metric OR multiple without groups)
  const useSharedAxis = isSingleMetric || !hasGroups;

  // When log scale is on, replace 0/negative values with a floor so log() doesn't break
  const logSafeData = useMemo(() => {
    if (!isLogScale) return displayData;
    const keys = visibleMetrics.map((m) => m.key);
    return displayData.map((d) => {
      const safe = { ...d } as Record<string, unknown>;
      for (const k of keys) {
        const v = safe[k];
        if (typeof v === "number" && v <= 0) safe[k] = undefined;
      }
      return safe as typeof d;
    });
  }, [displayData, isLogScale, visibleMetrics]);

  // Y domain for shared-axis chart (all visible metrics on one axis)
  const sharedYDomain = useMemo<[number, number]>(() => {
    if (!useSharedAxis) return [0, 1];
    const source = isLogScale ? logSafeData : displayData;
    const vals = visibleMetrics.flatMap((m) =>
      source.map((d) => (d as Record<string, unknown>)[m.key])
        .filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0),
    );
    if (vals.length === 0) return isLogScale ? [0.001, 1] : [0, 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (isLogScale) {
      return [min * 0.5, max * 2];
    }
    const pad = (max - min) * 0.1 || 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [useSharedAxis, visibleMetrics, displayData, logSafeData, isLogScale]);

  // Only show log toggle when data spans 100x+ range (or already toggled on)
  const showLogToggle = useMemo(() => {
    if (!useSharedAxis) return false;
    if (isLogScale) return true;
    const vals = visibleMetrics.flatMap((m) =>
      displayData.map((d) => (d as Record<string, unknown>)[m.key])
        .filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0),
    );
    if (vals.length < 2) return false;
    return Math.max(...vals) / Math.min(...vals) >= 100;
  }, [useSharedAxis, isLogScale, visibleMetrics, displayData]);

  if (metrics.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No training metrics available yet</div>;
  }

  // Chart height scales with number of visible metrics in stacked mode
  const chartHeight = useSharedAxis ? 200 : Math.max(160, visibleMetrics.length * 60);

  return (
    <div className={cn("rounded-lg bg-[#111] overflow-hidden outline-none [&_*]:outline-none", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{TAB_CONFIG[activeTab].label}</p>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[360px] p-3">
                <p className="text-[11px] leading-relaxed text-slate-300 mb-2">{TAB_CONFIG[activeTab].description}</p>
                {(() => {
                  const tab = TAB_CONFIG[activeTab];
                  const groups = new Map<string, MetricDef[]>();
                  for (const m of tab.metrics) {
                    const g = m.group ?? "default";
                    const list = groups.get(g);
                    if (list) list.push(m);
                    else groups.set(g, [m]);
                  }
                  if (groups.size <= 1 && tab.metrics.length <= 1) return null;
                  return (
                    <div className="space-y-2 border-t border-white/10 pt-2">
                      {Array.from(groups.entries()).map(([groupName, groupMetrics]) => (
                        <div key={groupName}>
                          {groups.size > 1 && (
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              {GROUP_LABELS[groupName] ?? groupName}
                            </p>
                          )}
                          <div className="space-y-1">
                            {groupMetrics.map((m) => (
                              <div key={m.key} className="flex items-start gap-1.5 text-[10px]">
                                <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: m.color }} />
                                <span>
                                  <span className="font-medium text-slate-300">{m.label}</span>
                                  <span className="text-slate-500"> — {m.description}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[11px] font-mono font-medium text-slate-400 cursor-help">
                  Step {latestStep}{maxSteps ? ` / ${maxSteps}` : ""}{progressPercent != null ? ` (${progressPercent}%)` : ""}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px]">
                <p className="text-[11px]">A step = one batch processed.{maxSteps ? ` ${maxSteps} total steps.` : ""}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          {/* Smoothing toggle */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsSmoothed((p) => !p)}
                  className={cn(
                    "p-1 rounded transition-colors text-[10px] font-medium",
                    isSmoothed ? "bg-blue-500/20 text-blue-400" : "text-zinc-600 hover:text-zinc-400",
                  )}
                >
                  <TrendingDown className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px]">
                <p className="text-[10px] font-medium">{isSmoothed ? "Smoothing ON — click to show raw values" : "Smooth noisy data"}</p>
                <p className="text-[9px] text-zinc-500 mt-0.5">
                  {isSmoothed
                    ? "Currently showing exponential moving average. Raw values are hidden."
                    : "Apply exponential moving average to reduce noise and reveal trends. Useful for Loss, Reward, and Grad Norm."}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Log scale toggle — only show when data spans 100x+ range */}
          {showLogToggle && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsLogScale((p) => !p)}
                    className={cn(
                      "px-1.5 py-0.5 rounded transition-colors text-[10px] font-mono font-medium",
                      isLogScale ? "bg-blue-500/20 text-blue-400" : "text-zinc-600 hover:text-zinc-400",
                    )}
                  >
                    log
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[240px]">
                  <p className="text-[10px] font-medium">{isLogScale ? "Log scale ON — click for linear" : "Switch to log scale"}</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5">
                    {isLogScale
                      ? "Currently using logarithmic Y-axis. Small values are more visible but large differences appear compressed."
                      : "Use logarithmic Y-axis when values span orders of magnitude (e.g., loss dropping from 1000 to 0.001). Makes small changes visible."}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {alertCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded text-xs text-amber-400 font-medium">
              <AlertTriangle className="h-3 w-3" />{alertCount} alert{alertCount > 1 ? "s" : ""}
            </div>
          )}
          {isLive && (
            <div className="flex items-center gap-2 bg-[#10b981]/10 border border-[#10b981]/20 px-3 py-1 rounded text-xs text-[#10b981] font-medium">
              <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse" />Live
            </div>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      {!hideTabs && (
        <div className="flex border-b border-white/5 px-4">
          {(Object.entries(TAB_CONFIG) as [MetricTab, (typeof TAB_CONFIG)[MetricTab]][]).map(
            ([key, config]) => (
              <button key={key} onClick={() => handleTabChange(key)}
                className={cn("flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2",
                  activeTab === key ? "text-slate-200 border-[#10b981]" : "text-slate-500 border-transparent hover:text-slate-300"
                )}
              >{config.icon}{config.label}</button>
            )
          )}
        </div>
      )}

      {/* Chart */}
      {hasGroups && !isSingleMetric ? (
        /* Grouped charts: metrics sharing a Y-axis within each group */
        <GroupedCharts chartData={displayData as Record<string, unknown>[]} visibleMetrics={visibleMetrics} maxOutputTokens={maxOutputTokens} />
      ) : (
        <div className="relative" style={{ height: chartHeight }}>
          {/* Lane labels (stacked mode only) */}
          {!useSharedAxis && (
            <LaneLabels lanes={lanes} visibleMetrics={visibleMetrics} chartData={displayData as Record<string, unknown>[]} />
          )}

          <div className={cn("w-full h-full", !useSharedAxis ? "pl-[70px]" : "p-4 pr-2")}>
            <ResponsiveContainer width="100%" height="100%">
              {useSharedAxis ? (
                /* Shared Y-axis: one or more metrics on the same scale */
                <LineChart data={isLogScale ? logSafeData : displayData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" strokeOpacity={0.4} vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} dy={8} tickFormatter={(v: number) => `Step ${v}`} interval="equidistantPreserveStart" />
                  <YAxis domain={sharedYDomain} scale={isLogScale ? "log" : "auto"} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#475569" }} tickFormatter={(v: number) => formatMetricValue(v)} width={50} />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border border-[#262626] bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                          <p className="text-[10px] font-mono text-slate-500 mb-1.5 border-b border-[#262626] pb-1">Step {label}</p>
                          <div className="space-y-1">
                            {visibleMetrics.map((m) => {
                              const entry = payload.find((p) => p.dataKey === m.key);
                              return (
                                <div key={m.key} className="flex items-center justify-between gap-4 text-[11px]">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                                    <span className="text-slate-400">{m.label}</span>
                                  </span>
                                  <span className="font-mono font-bold" style={{ color: m.color }}>
                                    {typeof entry?.value === "number" ? formatMetricValue(entry.value) : "-"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                    cursor={{ stroke: "#334155", strokeDasharray: "4 4" }}
                  />
                  {visibleMetrics.some((m) => m.key === "completions/clipped_ratio") && (
                    <ReferenceLine y={0.7} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="4 4" />
                  )}
                  {visibleMetrics.map((m) => (
                    <Line key={m.key} type="monotone" dataKey={m.key} stroke={m.color} strokeWidth={m.primary ? 2 : 1.5} dot={false} activeDot={{ r: 4, fill: m.color }} connectNulls isAnimationActive={hasMountedRef.current} animationDuration={300} />
                  ))}
                </LineChart>
              ) : (
                /* Stacked lanes: all metrics in one chart, each in its own band */
                <LineChart data={lanedData} margin={{ top: 8, right: 16, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} dy={8} tickFormatter={(v: number) => `Step ${v}`} interval="equidistantPreserveStart" />
                  <YAxis domain={[-0.02, 1.02]} axisLine={false} tickLine={false} tick={false} width={1} />
                  <RechartsTooltip
                    content={<StackedTooltip visibleMetrics={visibleMetrics} />}
                    cursor={{ stroke: "#334155", strokeDasharray: "4 4" }}
                  />
                  {/* Lane separator lines */}
                  {lanes.slice(0, -1).map((lane, i) => (
                    <ReferenceLine key={`sep-${i}`} y={lane.yMin - LANE_GAP / 2} stroke="#262626" strokeOpacity={0.5} strokeDasharray="2 4" />
                  ))}
                  {/* One Line per metric */}
                  {visibleMetrics.map((m) => (
                    <Line
                      key={m.key}
                      type="monotone"
                      dataKey={m.key}
                      name={m.label}
                      stroke={m.color}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: m.color, stroke: "#111", strokeWidth: 1.5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Legend */}
      <TooltipProvider delayDuration={200}>
        <div className="px-4 py-2 bg-black/20 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {availableMetrics.map((metric) => {
            const isVisible = visibleKeys.has(metric.key);
            const latestVal = displayData.length > 0
              ? ((displayData[displayData.length - 1] as Record<string, unknown>)[metric.key] as number | undefined)
              : undefined;
            return (
              <Tooltip key={metric.key}>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => toggleMetric(metric.key)}
                    className={cn("flex items-center gap-1.5 transition-opacity cursor-pointer group/legend", !isVisible && "opacity-35")}
                  >
                    {isVisible
                      ? <Eye className="h-2.5 w-2.5 text-zinc-500 opacity-0 group-hover/legend:opacity-100 transition-opacity" />
                      : <EyeOff className="h-2.5 w-2.5 text-zinc-600" />
                    }
                    <svg width="16" height="3" className="shrink-0">
                      <line x1="0" y1="1.5" x2="16" y2="1.5" stroke={metric.color} strokeWidth={2} />
                    </svg>
                    <span className="text-[10px] text-slate-400">{metric.label}</span>
                    {latestVal != null && (
                      <span className="text-[10px] font-mono font-semibold" style={{ color: metric.color }}>{formatMetricValue(latestVal)}</span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px]">
                  <p className="text-[11px]">{metric.description}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Click to {isVisible ? "hide" : "show"}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Insights */}
      {latestMetrics && (() => {
        const insights = getMetricsInsights(latestMetrics, activeTab, metricsHistory, maxOutputTokens);
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
});
