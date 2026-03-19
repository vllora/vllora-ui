/**
 * FinetuneMetricsChart
 *
 * Visualizes raw GRPO/GSPO training metrics (reward, KL, loss, completion stats)
 * with alert indicators based on the reinforcement_metrics_cheatsheet thresholds.
 * Complements the eval-score-based TrainingMetricsChart with low-level telemetry.
 */

import { useMemo, useState } from "react";
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
import { AlertTriangle, Activity, TrendingUp, Zap } from "lucide-react";
import type { FinetuneJobMetricPoint } from "@/services/finetune-api";

// =============================================================================
// Types
// =============================================================================

interface FinetuneMetricsChartProps {
  metrics: FinetuneJobMetricPoint[];
  className?: string;
  isLive?: boolean;
  /** Pre-select a specific tab */
  defaultTab?: MetricTab;
  /** Hide the tab bar (when parent controls tab selection) */
  hideTabs?: boolean;
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
      { key: "reward", label: "Reward", color: "#10b981", primary: true, description: "Average reward score from the evaluator. Higher = model generates better responses. Should increase over training." },
      { key: "reward_std", label: "Reward Std", color: "#6366f1", primary: false, description: "Standard deviation of reward scores across candidates. Some variance is healthy (provides learning signal). Too low = model outputs are too similar." },
      { key: "frac_reward_zero_std", label: "Zero Std Frac", color: "#f59e0b", primary: false, description: "Fraction of prompts where all candidates received the same score (zero variance). High values (>0.6) mean the evaluator can't differentiate — consider improving the grader." },
    ],
  },
  stability: {
    label: "Loss",
    icon: <Activity className="h-3 w-3" />,
    metrics: [
      { key: "loss", label: "Loss", color: "#ef4444", primary: true, description: "Policy loss — measures how much the model deviates from producing high-reward responses. Should generally decrease over training." },
      { key: "kl", label: "KL Divergence", color: "#f59e0b", primary: false, description: "KL divergence from the reference model. Measures how far the model has drifted from its original behavior. Too high = model may be overfitting or becoming incoherent." },
      { key: "grad_norm", label: "Grad Norm", color: "#8b5cf6", primary: false, description: "Gradient norm — magnitude of weight updates. Spikes indicate unstable training. Should be relatively stable." },
      { key: "learning_rate", label: "Learning Rate", color: "#06b6d4", primary: false, description: "Current learning rate. May change over training if a schedule is used (e.g., cosine decay)." },
    ],
  },
  completions: {
    label: "Completions",
    icon: <Zap className="h-3 w-3" />,
    metrics: [
      { key: "completions/clipped_ratio", label: "Clipped Ratio", color: "#ef4444", primary: true, description: "Fraction of responses that were truncated (hit max token limit). High values (>0.7) mean responses are too long — consider increasing max tokens or adjusting the prompt." },
      { key: "completions/mean_length", label: "Mean Length", color: "#10b981", primary: false, description: "Average response length in tokens across all generated candidates." },
      { key: "completions/mean_terminated_length", label: "Terminated Length", color: "#6366f1", primary: false, description: "Average length of responses that ended naturally (with an EOS token), excluding truncated ones." },
    ],
  },
};

interface MetricDef {
  key: string;
  label: string;
  color: string;
  primary: boolean;
  description: string;
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

/** Generate a plain-language insight about the current training metrics */
function getMetricsInsight(
  latest: Record<string, unknown> | null,
  tab: MetricTab,
): string {
  if (!latest) return "Waiting for metrics data...";

  if (tab === "reward") {
    const reward = typeof latest.reward === "number" ? latest.reward : null;
    const rewardStd = typeof latest.reward_std === "number" ? latest.reward_std : null;
    const fracZero = typeof latest.frac_reward_zero_std === "number" ? latest.frac_reward_zero_std : null;

    if (reward == null) return "Reward data not available yet.";

    const parts: string[] = [];
    if (reward >= 0.9) parts.push("Reward is high — the model is generating good responses.");
    else if (reward >= 0.7) parts.push("Reward is moderate — the model is learning but has room to improve.");
    else parts.push("Reward is low — the model may need more training or better data.");

    if (rewardStd != null) {
      if (rewardStd < 0.02) parts.push("Very low variance between candidates — the evaluator may not differentiate well.");
      else if (rewardStd > 0.2) parts.push("High variance between candidates — good learning signal.");
    }
    if (fracZero != null && fracZero > 0.5) {
      parts.push(`${(fracZero * 100).toFixed(0)}% of prompts have zero score variance — consider improving the evaluator.`);
    }
    return parts.join(" ");
  }

  if (tab === "stability") {
    const loss = typeof latest.loss === "number" ? latest.loss : null;
    const kl = typeof latest.kl === "number" ? latest.kl : null;
    const gradNorm = typeof latest.grad_norm === "number" ? latest.grad_norm : null;

    if (loss == null) return "Loss data not available yet.";

    const parts: string[] = [];
    if (loss < 0.01) parts.push("Loss is very low — training is converging well.");
    else if (loss < 0.1) parts.push("Loss is healthy — model is learning steadily.");
    else if (loss < 1.0) parts.push("Loss is moderate — training is in progress.");
    else parts.push("Loss is high — model is still early in training or may be struggling.");

    if (kl != null) {
      if (kl > 100) parts.push("KL divergence is very high — the model is drifting significantly from the base model.");
      else if (kl > 10) parts.push("KL divergence is elevated — watch for quality degradation.");
      else parts.push("KL divergence is within normal range.");
    }
    if (gradNorm != null && gradNorm > 10) {
      parts.push("Gradient norm is high — training may be unstable.");
    }
    return parts.join(" ");
  }

  if (tab === "completions") {
    const clipped = typeof latest["completions/clipped_ratio"] === "number" ? latest["completions/clipped_ratio"] : null;
    const meanLen = typeof latest["completions/mean_length"] === "number" ? latest["completions/mean_length"] : null;

    if (clipped == null && meanLen == null) return "Completion data not available yet.";

    const parts: string[] = [];
    if (clipped != null) {
      if (clipped > 0.7) parts.push(`${(clipped * 100).toFixed(0)}% of responses are being truncated — consider increasing max tokens.`);
      else if (clipped > 0.3) parts.push(`${(clipped * 100).toFixed(0)}% of responses are truncated — moderate, but watch the trend.`);
      else parts.push("Low truncation rate — response lengths are within limits.");
    }
    if (meanLen != null) {
      parts.push(`Average response length: ${Math.round(meanLen)} tokens.`);
    }
    return parts.join(" ");
  }

  return "";
}

function formatMetricValue(value: number): string {
  if (Math.abs(value) < 0.001) return value.toExponential(1);
  if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "K";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
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
}: FinetuneMetricsChartProps) {
  const [internalTab, setInternalTab] = useState<MetricTab>(defaultTab ?? "reward");
  // When parent controls tabs (hideTabs=true), use defaultTab prop directly
  const activeTab = hideTabs ? (defaultTab ?? "reward") : internalTab;
  const setActiveTab = setInternalTab;
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
            {TAB_CONFIG[activeTab].label}
          </p>
          <div className="flex items-baseline gap-3">
            {latestReward != null && (
              <h2 className="text-2xl font-mono font-bold text-[#10b981]">
                {latestReward.toFixed(3)}
              </h2>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-medium text-slate-400 cursor-help">
                    Step {latestStep}
                    {maxSteps ? ` / ${maxSteps}` : ""}
                    {progressPercent != null ? ` (${progressPercent}%)` : ""}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px]">
                  <p className="text-[11px]">
                    A <span className="font-semibold">step</span> = one batch of records processed by the optimizer.
                    Each step updates the model weights once.
                    {maxSteps ? ` This job has ${maxSteps} total steps across all epochs.` : ""}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

      {/* Health insight — plain language interpretation of current metrics */}
      <div className="px-5 pb-2 text-[11px] text-slate-400 leading-snug">
        {getMetricsInsight(latestMetrics, activeTab)}
      </div>

      {/* Tab Bar — hidden when parent controls tab selection */}
      {!hideTabs && (
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
      )}

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

      {/* Legend with latest values + tooltips */}
      <TooltipProvider delayDuration={200}>
        <div className="px-5 py-2.5 bg-black/20 border-t border-white/5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {availableMetrics.map((metric) => {
            const latestVal =
              chartData.length > 0
                ? ((chartData[chartData.length - 1] as Record<string, unknown>)[metric.key] as
                    | number
                    | undefined)
                : undefined;
            return (
              <Tooltip key={metric.key}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <svg width="16" height="3" className="shrink-0">
                      <line
                        x1="0" y1="1.5" x2="16" y2="1.5"
                        stroke={metric.color}
                        strokeWidth={metric.primary ? 2 : 1.5}
                        strokeDasharray={metric.primary ? undefined : "3 2"}
                      />
                    </svg>
                    <span className="text-[10px] text-slate-400">{metric.label}</span>
                    {latestVal != null && (
                      <span
                        className="text-[10px] font-mono font-semibold"
                        style={{ color: metric.color }}
                      >
                        {formatMetricValue(latestVal)}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px]">
                  <p className="text-[11px]">{metric.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
