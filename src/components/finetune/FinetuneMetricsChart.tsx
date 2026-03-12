/**
 * FinetuneMetricsChart
 *
 * Visualizes raw GRPO/GSPO training metrics (reward, KL, loss, completion stats)
 * with alert indicators based on the reinforcement_metrics_cheatsheet thresholds.
 * Complements the eval-score-based TrainingMetricsChart with low-level telemetry.
 */

import { useMemo, useState } from "react";
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
import { AlertTriangle, Activity, TrendingUp, Zap } from "lucide-react";
import type { FinetuneJobMetricPoint } from "@/services/finetune-api";

// =============================================================================
// Types
// =============================================================================

interface FinetuneMetricsChartProps {
  metrics: FinetuneJobMetricPoint[];
  className?: string;
  isLive?: boolean;
}

type MetricTab = "reward" | "stability" | "completions";

// =============================================================================
// Constants
// =============================================================================

const TAB_CONFIG: Record<
  MetricTab,
  { label: string; icon: React.ReactNode; metrics: readonly MetricDef[] }
> = {
  reward: {
    label: "Reward",
    icon: <TrendingUp className="h-3 w-3" />,
    metrics: [
      { key: "reward", label: "Reward", color: "#10b981", primary: true },
      { key: "reward_std", label: "Reward Std", color: "#6366f1", primary: false },
      { key: "frac_reward_zero_std", label: "Zero Std Frac", color: "#f59e0b", primary: false },
    ],
  },
  stability: {
    label: "Stability",
    icon: <Activity className="h-3 w-3" />,
    metrics: [
      { key: "loss", label: "Loss", color: "#ef4444", primary: true },
      { key: "kl", label: "KL Divergence", color: "#f59e0b", primary: false },
      { key: "grad_norm", label: "Grad Norm", color: "#8b5cf6", primary: false },
      { key: "learning_rate", label: "Learning Rate", color: "#06b6d4", primary: false },
    ],
  },
  completions: {
    label: "Completions",
    icon: <Zap className="h-3 w-3" />,
    metrics: [
      { key: "completions/clipped_ratio", label: "Clipped Ratio", color: "#ef4444", primary: true },
      { key: "completions/mean_length", label: "Mean Length", color: "#10b981", primary: false },
      { key: "completions/mean_terminated_length", label: "Terminated Length", color: "#6366f1", primary: false },
    ],
  },
};

interface MetricDef {
  key: string;
  label: string;
  color: string;
  primary: boolean;
}

// =============================================================================
// Alert Thresholds
// =============================================================================

const CLIPPED_RATIO_THRESHOLD = 0.7;
const FRAC_ZERO_STD_THRESHOLD = 0.6;

function getAlertCount(metrics: FinetuneJobMetricPoint[]): number {
  if (metrics.length === 0) return 0;
  const latest = metrics[metrics.length - 1].metrics;
  let count = 0;

  const clipped = latest["completions/clipped_ratio"];
  if (typeof clipped === "number" && clipped > CLIPPED_RATIO_THRESHOLD) count++;

  const fracZero = latest.frac_reward_zero_std;
  if (typeof fracZero === "number" && fracZero > FRAC_ZERO_STD_THRESHOLD) count++;

  for (const key of ["loss", "reward", "kl", "grad_norm"] as const) {
    const val = latest[key];
    if (val != null && (!isFinite(val as number) || isNaN(val as number))) count++;
  }

  return count;
}

// =============================================================================
// Custom Tooltip
// =============================================================================

function MetricsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-[#262626] bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[10px] font-mono text-slate-500 mb-1.5 border-b border-[#262626] pb-1">
        {label}
      </p>
      <div className="space-y-1">
        {payload
          .filter((e) => e.value != null)
          .map((entry) => (
            <div
              key={entry.dataKey}
              className="flex items-center justify-between gap-4 text-[11px]"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-slate-400">{entry.name}</span>
              </span>
              <span className="font-mono font-bold" style={{ color: entry.color }}>
                {typeof entry.value === "number" ? formatMetricValue(entry.value) : "-"}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function formatMetricValue(value: number): string {
  if (Math.abs(value) < 0.001) return value.toExponential(2);
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(4);
}

// =============================================================================
// Main Component
// =============================================================================

export function FinetuneMetricsChart({
  metrics,
  className,
  isLive,
}: FinetuneMetricsChartProps) {
  const [activeTab, setActiveTab] = useState<MetricTab>("reward");
  const alertCount = useMemo(() => getAlertCount(metrics), [metrics]);

  const chartData = useMemo(() => {
    return metrics.map((point, idx) => {
      const m = point.metrics;
      return {
        name: `Step ${typeof m.global_step === "number" ? m.global_step : idx + 1}`,
        step: typeof m.global_step === "number" ? m.global_step : idx + 1,
        // Reward tab
        reward: typeof m.reward === "number" ? m.reward : undefined,
        reward_std: typeof m.reward_std === "number" ? m.reward_std : undefined,
        frac_reward_zero_std:
          typeof m.frac_reward_zero_std === "number" ? m.frac_reward_zero_std : undefined,
        // Stability tab
        loss: typeof m.loss === "number" ? m.loss : undefined,
        kl: typeof m.kl === "number" ? m.kl : undefined,
        grad_norm: typeof m.grad_norm === "number" ? m.grad_norm : undefined,
        learning_rate: typeof m.learning_rate === "number" ? m.learning_rate : undefined,
        // Completions tab
        "completions/clipped_ratio":
          typeof m["completions/clipped_ratio"] === "number"
            ? m["completions/clipped_ratio"]
            : undefined,
        "completions/mean_length":
          typeof m["completions/mean_length"] === "number"
            ? m["completions/mean_length"]
            : undefined,
        "completions/mean_terminated_length":
          typeof m["completions/mean_terminated_length"] === "number"
            ? m["completions/mean_terminated_length"]
            : undefined,
      };
    });
  }, [metrics]);

  // Get latest values for header
  const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1].metrics : null;
  const latestReward =
    latestMetrics && typeof latestMetrics.reward === "number" ? latestMetrics.reward : null;
  const latestStep =
    latestMetrics && typeof latestMetrics.global_step === "number"
      ? latestMetrics.global_step
      : metrics.length;
  const maxSteps =
    latestMetrics && typeof latestMetrics.max_steps === "number" ? latestMetrics.max_steps : null;
  const progressPercent =
    maxSteps && latestStep ? Math.round((latestStep / maxSteps) * 100) : null;

  if (metrics.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        No training metrics available yet
      </div>
    );
  }

  const tabConfig = TAB_CONFIG[activeTab];
  // Filter to only metrics that have data
  const availableMetrics = tabConfig.metrics.filter((m) =>
    chartData.some((d) => (d as Record<string, unknown>)[m.key] != null)
  );

  // Compute Y domain from available data
  const allValues = availableMetrics.flatMap((m) =>
    chartData
      .map((d) => (d as Record<string, unknown>)[m.key])
      .filter((v): v is number => typeof v === "number" && isFinite(v))
  );
  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const yPadding = (yMax - yMin) * 0.1 || 0.1;

  return (
    <div className={cn("rounded-lg bg-[#111] overflow-hidden", className)}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            Training Metrics
          </p>
          <div className="flex items-baseline gap-3">
            {latestReward != null && (
              <h2 className="text-2xl font-mono font-bold text-[#10b981]">
                {latestReward.toFixed(3)}
              </h2>
            )}
            <span className="text-xs font-medium text-slate-400">
              Step {latestStep}
              {maxSteps ? ` / ${maxSteps}` : ""}
              {progressPercent != null ? ` (${progressPercent}%)` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded text-xs text-amber-400 font-medium">
              <AlertTriangle className="h-3 w-3" />
              {alertCount} alert{alertCount > 1 ? "s" : ""}
            </div>
          )}
          {isLive && (
            <div className="flex items-center gap-2 bg-[#10b981]/10 border border-[#10b981]/20 px-3 py-1 rounded text-xs text-[#10b981] font-medium">
              <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse" />
              Live
            </div>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/5 px-4">
        {(Object.entries(TAB_CONFIG) as [MetricTab, (typeof TAB_CONFIG)[MetricTab]][]).map(
          ([key, config]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2",
                activeTab === key
                  ? "text-slate-200 border-[#10b981]"
                  : "text-slate-500 border-transparent hover:text-slate-300"
              )}
            >
              {config.icon}
              {config.label}
            </button>
          )
        )}
      </div>

      {/* Chart */}
      <div className="h-[220px] w-full p-4 pr-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
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
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[Math.max(0, yMin - yPadding), yMax + yPadding]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#475569" }}
              tickFormatter={(v: number) => formatMetricValue(v)}
              dx={-4}
            />
            <RechartsTooltip
              content={<MetricsTooltip />}
              cursor={{ stroke: "#334155", strokeDasharray: "4 4" }}
            />

            {/* Threshold reference lines */}
            {activeTab === "completions" && (
              <ReferenceLine
                y={0.7}
                stroke="#ef4444"
                strokeOpacity={0.3}
                strokeDasharray="4 4"
                label={{
                  value: "Clip Threshold",
                  position: "insideTopRight",
                  fill: "#ef4444",
                  fontSize: 9,
                  opacity: 0.5,
                }}
              />
            )}

            {availableMetrics.map((metric) => (
              <Line
                key={metric.key}
                type="monotone"
                dataKey={metric.key}
                name={metric.label}
                stroke={metric.color}
                strokeWidth={metric.primary ? 2 : 1.5}
                strokeDasharray={metric.primary ? undefined : "4 3"}
                dot={false}
                activeDot={{ r: 4, fill: metric.color }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 bg-black/20 border-t border-white/5 flex flex-wrap items-center gap-4">
        {availableMetrics.map((metric) => {
          const latestVal =
            chartData.length > 0
              ? ((chartData[chartData.length - 1] as Record<string, unknown>)[metric.key] as
                  | number
                  | undefined)
              : undefined;
          return (
            <div key={metric.key} className="flex items-center gap-2">
              <span
                className="block w-3 h-0.5"
                style={{ backgroundColor: metric.color }}
              />
              <span className="text-xs text-slate-400">{metric.label}</span>
              {latestVal != null && (
                <span
                  className="text-xs font-mono font-medium"
                  style={{ color: metric.color }}
                >
                  {formatMetricValue(latestVal)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
