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

import { useMemo, useState, useCallback } from "react";
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
import { AlertTriangle, Activity, TrendingUp, Zap, Eye, EyeOff, BarChart3 } from "lucide-react";
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

type MetricTab = "reward" | "stability" | "completions" | "throughput";

interface MetricDef {
  key: string;
  label: string;
  color: string;
  primary: boolean;
  description: string;
}

const TAB_CONFIG: Record<
  MetricTab,
  { label: string; icon: React.ReactNode; metrics: readonly MetricDef[] }
> = {
  reward: {
    label: "Reward",
    icon: <TrendingUp className="h-3 w-3" />,
    metrics: [
      { key: "reward", label: "Reward", color: "#10b981", primary: true, description: "Average reward score from the evaluator. Higher = model generates better responses." },
      { key: "reward_std", label: "Reward Std", color: "#6366f1", primary: false, description: "Standard deviation of reward scores across candidates. Some variance is healthy." },
      { key: "frac_reward_zero_std", label: "Zero Std Frac", color: "#f59e0b", primary: false, description: "Fraction of prompts where all G completions scored identically (zero learning signal). Healthy <0.2, warning >0.5, critical >0.8." },
    ],
  },
  stability: {
    label: "Loss",
    icon: <Activity className="h-3 w-3" />,
    metrics: [
      { key: "loss", label: "Loss", color: "#ef4444", primary: true, description: "GRPO policy loss — starts near 0 and rises slightly as learning progresses. Unlike SFT loss, lower is NOT always better." },
      { key: "kl", label: "KL Divergence", color: "#f59e0b", primary: false, description: "Distance from base model distribution. With β=0 (default), this is informational only and does not affect training." },
      { key: "grad_norm", label: "Grad Norm", color: "#8b5cf6", primary: false, description: "Gradient norm — spikes indicate unstable training." },
      { key: "learning_rate", label: "Learning Rate", color: "#06b6d4", primary: false, description: "Current learning rate. May change if a schedule is used." },
      { key: "clip_ratio/region_mean", label: "Clip Ratio", color: "#ec4899", primary: false, description: "Fraction of tokens clipped by trust region. 0.1-0.3 is healthy. High = updates too aggressive." },
    ],
  },
  completions: {
    label: "Completions",
    icon: <Zap className="h-3 w-3" />,
    metrics: [
      { key: "completions/clipped_ratio", label: "Clipped Ratio", color: "#ef4444", primary: true, description: "Fraction of responses truncated at max_output_tokens. Healthy <0.1, warning >0.1, critical >0.5." },
      { key: "completions/mean_length", label: "Mean Length", color: "#10b981", primary: false, description: "Average response length in tokens." },
      { key: "completions/max_length", label: "Max Length", color: "#f59e0b", primary: false, description: "Longest response in tokens. If stuck at max_output_tokens, model is hitting the ceiling." },
      { key: "completions/min_length", label: "Min Length", color: "#06b6d4", primary: false, description: "Shortest response. Decreasing min suggests some prompts get trivial answers." },
      { key: "completions/mean_terminated_length", label: "Terminated Length", color: "#6366f1", primary: false, description: "Average length of naturally-ended (non-truncated) responses." },
      { key: "completions/max_terminated_length", label: "Max Terminated", color: "#a855f7", primary: false, description: "Longest natural response. If close to max_output_tokens, you need more room." },
      { key: "completions/min_terminated_length", label: "Min Terminated", color: "#14b8a6", primary: false, description: "Shortest natural response. Very short (<10) may indicate trivial answers — check grader." },
    ],
  },
  throughput: {
    label: "Throughput",
    icon: <BarChart3 className="h-3 w-3" />,
    metrics: [
      { key: "num_tokens", label: "Tokens/Step", color: "#10b981", primary: true, description: "Total tokens processed per training step. Drops may indicate shorter completions." },
      { key: "row_indices_count", label: "Batch Size", color: "#6366f1", primary: false, description: "Number of record samples per step. Should be consistent." },
      { key: "completion_length", label: "Avg Completion", color: "#f59e0b", primary: false, description: "Average completion length across all candidates in the batch." },
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
  if (Math.abs(value) < 0.001) return value.toExponential(1);
  if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "K";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
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
      <p className="text-[10px] font-mono text-slate-500 mb-1.5 border-b border-[#262626] pb-1">{label}</p>
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
// Main Component
// =============================================================================

export function FinetuneMetricsChart({
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

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => {
    return new Set(TAB_CONFIG[defaultTab ?? "reward"].metrics.map((m) => m.key));
  });

  const handleTabChange = useCallback((tab: MetricTab) => {
    setActiveTab(tab);
    setVisibleKeys(new Set(TAB_CONFIG[tab].metrics.map((m) => m.key)));
  }, [setActiveTab]);

  useMemo(() => {
    if (hideTabs && defaultTab) {
      setVisibleKeys(new Set(TAB_CONFIG[defaultTab].metrics.map((m) => m.key)));
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
        name: `Step ${typeof m.global_step === "number" ? m.global_step : idx + 1}`,
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
    chartData.some((d) => (d as Record<string, unknown>)[m.key] != null)
  );
  const visibleMetrics = availableMetrics.filter((m) => visibleKeys.has(m.key));
  const isSingleMetric = visibleMetrics.length <= 1;

  // Build laned data for multi-metric stacked view
  const { data: lanedData, lanes } = useMemo(
    () => buildLanedData(chartData as Record<string, unknown>[], visibleMetrics),
    [chartData, visibleMetrics],
  );

  // Y domain for single metric
  const singleYDomain = useMemo<[number, number]>(() => {
    if (!isSingleMetric || !visibleMetrics[0]) return [0, 1];
    const vals = chartData.map((d) => (d as Record<string, unknown>)[visibleMetrics[0].key])
      .filter((v): v is number => typeof v === "number" && isFinite(v));
    if (vals.length === 0) return [0, 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1 || 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [isSingleMetric, visibleMetrics, chartData]);

  if (metrics.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No training metrics available yet</div>;
  }

  // Chart height scales with number of visible metrics in stacked mode
  const chartHeight = isSingleMetric ? 200 : Math.max(160, visibleMetrics.length * 60);

  return (
    <div className={cn("rounded-lg bg-[#111] overflow-hidden", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{TAB_CONFIG[activeTab].label}</p>
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
      <div className="relative" style={{ height: chartHeight }}>
        {/* Lane labels (stacked mode only) */}
        {!isSingleMetric && (
          <LaneLabels lanes={lanes} visibleMetrics={visibleMetrics} chartData={chartData as Record<string, unknown>[]} />
        )}

        <div className={cn("w-full h-full", !isSingleMetric ? "pl-[70px]" : "p-4 pr-2")}>
          <ResponsiveContainer width="100%" height="100%">
            {isSingleMetric ? (
              /* Single metric: real Y-axis + full tooltip */
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} dy={8} interval="preserveStartEnd" />
                <YAxis domain={singleYDomain} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#475569" }} tickFormatter={(v: number) => formatMetricValue(v)} width={50} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.[0]) return null;
                    const m = visibleMetrics[0];
                    return (
                      <div className="rounded-lg border border-[#262626] bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                        <p className="text-[10px] font-mono text-slate-500 mb-1">{label}</p>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                          <span className="text-slate-400">{m.label}</span>
                          <span className="font-mono font-bold" style={{ color: m.color }}>
                            {typeof payload[0].value === "number" ? formatMetricValue(payload[0].value as number) : "-"}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ stroke: "#334155", strokeDasharray: "4 4" }}
                />
                {visibleMetrics[0]?.key === "completions/clipped_ratio" && (
                  <ReferenceLine y={0.7} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="4 4" />
                )}
                <Line type="monotone" dataKey={visibleMetrics[0]?.key} stroke={visibleMetrics[0]?.color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: visibleMetrics[0]?.color }} connectNulls />
              </LineChart>
            ) : (
              /* Stacked lanes: all metrics in one chart, each in its own band */
              <LineChart data={lanedData} margin={{ top: 8, right: 16, bottom: 4, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} dy={8} interval="preserveStartEnd" />
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

      {/* Legend */}
      <TooltipProvider delayDuration={200}>
        <div className="px-4 py-2 bg-black/20 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {availableMetrics.map((metric) => {
            const isVisible = visibleKeys.has(metric.key);
            const latestVal = chartData.length > 0
              ? ((chartData[chartData.length - 1] as Record<string, unknown>)[metric.key] as number | undefined)
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
}
