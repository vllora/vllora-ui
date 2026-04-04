/**
 * FinetuneChartSelector
 *
 * Scrollable 2-column grid of training metrics charts.
 * Fetches metrics once and renders multiple compact charts simultaneously.
 * Primary charts always visible; secondary charts in a collapsible section.
 *
 * Non-metric views (Score Trend, Score Distribution, vs Baseline) render
 * as full-width cards within the grid.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2, RefreshCw, Activity } from "lucide-react";
import type {
  FinetuneEvalResultsResponse,
  FinetuneJobMetricPoint,
} from "@/services/finetune-api";
import { getFinetuneJobMetrics } from "@/services/finetune-api";
import { TrainingMetricsSection } from "./TrainingMetricsSection";
import { FinetuneMetricsChart } from "../FinetuneMetricsChart";
import { ScoreStrip } from "@/components/datasets/eval-dialog/ScoreStrip";
import { getScoreDistributionInsights } from "../training-metrics-insights";
import { BaselineComparisonPanel } from "./BaselineComparisonPanel";

// =============================================================================
// Types
// =============================================================================

type MetricTab = "reward" | "loss" | "kl" | "lr" | "gradNorm" | "clipRatio" | "deadPrompts" | "completions" | "tokens" | "batchSize" | "avgCompletion";

interface FinetuneChartSelectorProps {
  readonly evalResults: FinetuneEvalResultsResponse | null;
  readonly isLoadingEvals: boolean;
  readonly isRefreshing: boolean;
  readonly evalsError: string | null;
  readonly onRefresh: () => void;
  readonly isLive: boolean;
  readonly jobId: string;
  readonly workflowId: string;
  readonly baselineEvalId?: string;
  readonly maxOutputTokens?: number;
  readonly onStepProgress?: (currentStep: number, maxSteps: number) => void;
}

// Priority order based on cross-platform research (OpenAI RFT, WandB, Unsloth, TRL):
//
// Score Trend (eval) is always #1 — it's the ground truth (OpenAI's hero chart)
// Reward + Loss are next — is optimization proceeding? (every platform shows these)
// Completions clipped ratio — most common silent failure mode
// Grad Norm — stability diagnostic
// Everything else is debugging-only (LR, KL, Clip Ratio, throughput)

// Priority order based on GRPO practitioner research:
// #1 Score Trend (eval) — always first, full-width
// #2 Reward + Dead Prompts — is it learning? does it have signal?
// #3 Completions — truncation is the most common silent failure
// #4 Loss + Grad Norm — optimizer health + stability
// #5+ KL, LR, throughput — diagnostic only

// Primary charts in 2-column grid rows: [left, right]
const PRIMARY_GRID: readonly [MetricTab, MetricTab][] = [
  ["reward", "deadPrompts"],
  ["loss", "gradNorm"],
];

// Full-width primary charts below the grid (has sub-charts)
const PRIMARY_FULL: readonly MetricTab[] = ["completions"];

// Charts in the collapsible "More" section (diagnostic / debugging only)
const SECONDARY_CHARTS: readonly MetricTab[] = [
  "kl",
  "lr",
  "clipRatio",
  "avgCompletion",
  "tokens",
  "batchSize",
];

const POLL_INTERVAL = 15_000;

// =============================================================================
// Helpers
// =============================================================================

function extractLatestEpochScores(
  results: FinetuneEvalResultsResponse["results"],
): { scores: number[]; mean: number | undefined } {
  let maxEpoch = -1;
  for (const row of results) {
    for (const epochStr of Object.keys(row.epochs)) {
      const epoch = parseInt(epochStr, 10);
      if (epoch > maxEpoch) maxEpoch = epoch;
    }
  }
  if (maxEpoch < 0) return { scores: [], mean: undefined };

  const scores: number[] = [];
  for (const row of results) {
    const epochResults = row.epochs[maxEpoch];
    if (!epochResults) continue;
    for (const result of epochResults) {
      if (typeof result.score === "number") scores.push(result.score);
    }
  }
  const mean = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : undefined;
  return { scores, mean };
}

/** Check if metrics data has any values for a given chart tab */
function hasDataForTab(
  metrics: FinetuneJobMetricPoint[],
  tab: MetricTab,
): boolean {
  // Map tab to the metric keys it uses
  const keyMap: Record<MetricTab, string[]> = {
    reward: ["reward"],
    loss: ["loss"],
    kl: ["kl"],
    lr: ["learning_rate"],
    gradNorm: ["grad_norm"],
    clipRatio: ["clip_ratio/region_mean"],
    deadPrompts: ["frac_reward_zero_std"],
    completions: ["completions/mean_length", "completions/clipped_ratio"],
    tokens: ["num_tokens"],
    batchSize: ["row_indices_count"],
    avgCompletion: ["completion_length"],
  };
  const keys = keyMap[tab];
  return metrics.some((p) =>
    keys.some((k) => {
      const val = p.metrics[k];
      return typeof val === "number" && isFinite(val);
    }),
  );
}

// =============================================================================
// LazyChart — only mounts the chart when it scrolls into view
// =============================================================================

function LazyChart({ children, height = 250 }: { children: React.ReactNode; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: "50px" }, // Pre-load 50px before it's in view
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (isVisible) return <>{children}</>;
  return <div ref={ref} style={{ minHeight: height }} className="rounded-lg bg-[#111]" />;
}

// =============================================================================
// Component
// =============================================================================

export function FinetuneChartSelector({
  evalResults,
  isLoadingEvals,
  isRefreshing,
  evalsError,
  onRefresh,
  isLive,
  jobId,
  workflowId,
  baselineEvalId,
  maxOutputTokens,
  onStepProgress,
}: FinetuneChartSelectorProps) {
  // ── Metrics fetch (single source for all charts) ──
  const [metrics, setMetrics] = useState<FinetuneJobMetricPoint[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const hasDataRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stabilize onStepProgress via ref to avoid recreating fetchMetrics on parent re-renders
  const onStepProgressRef = useRef(onStepProgress);
  onStepProgressRef.current = onStepProgress;

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await getFinetuneJobMetrics(workflowId, jobId);
      setMetrics(response.metrics);
      hasDataRef.current = response.metrics.length > 0;
      setMetricsError(null);
      // Report step progress for ETA computation
      if (response.metrics.length > 0 && onStepProgressRef.current) {
        const latest = response.metrics[response.metrics.length - 1].metrics;
        const step = typeof latest.global_step === "number" ? latest.global_step : response.metrics.length;
        const max = typeof latest.max_steps === "number" ? latest.max_steps : 0;
        if (step > 0 && max > 0) onStepProgressRef.current(step, max);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch metrics";
      if (!hasDataRef.current) setMetricsError(message);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [jobId, workflowId]);

  useEffect(() => {
    setIsLoadingMetrics(true);
    setMetrics([]);
    setMetricsError(null);
    fetchMetrics();
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLive) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(fetchMetrics, POLL_INTERVAL);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [isLive, fetchMetrics]);

  // ── Collapsible state ──
  const [showSecondary, setShowSecondary] = useState(false);
  const [showScoreDist, setShowScoreDist] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);

  // ── Score distribution ──
  const { scores, mean } = useMemo(() => {
    if (!evalResults?.results?.length) return { scores: [], mean: undefined };
    return extractLatestEpochScores(evalResults.results);
  }, [evalResults]);

  // Filter grid rows to only those with at least one chart having data
  const availableGridRows = useMemo(
    () => PRIMARY_GRID.filter(([l, r]) => hasDataForTab(metrics, l) || hasDataForTab(metrics, r)),
    [metrics],
  );
  const availableFull = useMemo(
    () => PRIMARY_FULL.filter((tab) => hasDataForTab(metrics, tab)),
    [metrics],
  );
  const availableSecondary = useMemo(
    () => SECONDARY_CHARTS.filter((tab) => hasDataForTab(metrics, tab)),
    [metrics],
  );

  const hasMetrics = metrics.length > 0;

  return (
    <div className="w-full space-y-3">
      {/* ── Score Trend (full-width, always first) ── */}
      <TrainingMetricsSection
        evalResults={evalResults}
        isLoading={isLoadingEvals}
        isRefreshing={isRefreshing}
        error={evalsError}
        onRefresh={onRefresh}
        isLive={isLive}
      />

      {/* ── Metrics loading state ── */}
      {isLoadingMetrics && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading training metrics...</span>
        </div>
      )}

      {/* ── Metrics error state ── */}
      {metricsError && !hasMetrics && !isLive && !isLoadingMetrics && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-zinc-500">
          <Activity className="h-4 w-4 opacity-40" />
          <span className="text-xs">
            {metricsError.includes("404") ? "No training metrics available yet" : metricsError}
          </span>
          <button onClick={fetchMetrics} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* ── Primary charts: paired 2-column rows ── */}
      {hasMetrics && availableGridRows.map(([left, right], rowIdx) => {
        const row = (
          <div key={`${left}-${right}`} className="grid grid-cols-2 gap-3">
            {hasDataForTab(metrics, left) && (
              <FinetuneMetricsChart metrics={metrics} isLive={isLive} defaultTab={left} hideTabs maxOutputTokens={maxOutputTokens} />
            )}
            {hasDataForTab(metrics, right) && (
              <FinetuneMetricsChart metrics={metrics} isLive={isLive} defaultTab={right} hideTabs maxOutputTokens={maxOutputTokens} />
            )}
          </div>
        );
        // First row renders immediately; subsequent rows lazy-load on scroll
        return rowIdx === 0 ? row : <LazyChart key={`${left}-${right}`}>{row}</LazyChart>;
      })}

      {/* ── Full-width primary charts (Completions) — lazy-loaded ── */}
      {hasMetrics && availableFull.map((tab) => (
        <LazyChart key={tab} height={350}>
          <FinetuneMetricsChart metrics={metrics} isLive={isLive} defaultTab={tab} hideTabs maxOutputTokens={maxOutputTokens} />
        </LazyChart>
      ))}

      {/* ── Secondary charts (collapsible) ── */}
      {hasMetrics && availableSecondary.length > 0 && (
        <div>
          <button
            onClick={() => setShowSecondary((p) => !p)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors py-1"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showSecondary && "rotate-180")} />
            {showSecondary ? "Hide" : "Show"} more metrics ({availableSecondary.length})
          </button>
          {showSecondary && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              {availableSecondary.map((tab) => (
                <LazyChart key={tab} height={200}>
                  <FinetuneMetricsChart
                    metrics={metrics}
                    isLive={isLive}
                    defaultTab={tab}
                    hideTabs
                    maxOutputTokens={maxOutputTokens}
                  />
                </LazyChart>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Score Distribution (collapsible) ── */}
      {scores.length > 0 && (
        <div>
          <button
            onClick={() => setShowScoreDist((p) => !p)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors py-1"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showScoreDist && "rotate-180")} />
            Score Distribution
          </button>
          {showScoreDist && (
            <div className="rounded-lg bg-[#111] overflow-hidden mt-2">
              <div className="p-4">
                <ScoreStrip scores={scores} mean={mean} />
              </div>
              {(() => {
                const insights = getScoreDistributionInsights(scores, mean);
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
          )}
        </div>
      )}

      {/* ── vs Baseline (collapsible) ── */}
      {baselineEvalId && (
        <div>
          <button
            onClick={() => setShowBaseline((p) => !p)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors py-1"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showBaseline && "rotate-180")} />
            vs Baseline
          </button>
          {showBaseline && (
            <div className="mt-2">
              <BaselineComparisonPanel
                workflowId={workflowId}
                baselineEvalId={baselineEvalId}
                finetuneJobId={jobId}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
