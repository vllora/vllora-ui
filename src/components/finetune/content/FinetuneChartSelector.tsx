/**
 * FinetuneChartSelector
 *
 * Combines multiple chart views into a single area with a dropdown selector:
 * - Score Trend: epoch-over-epoch avg score area chart
 * - Training Progress: derived metrics from eval scores (improvement, failure rate)
 * - Loss & Reward: raw GRPO/GSPO metrics from training provider (if available)
 * - Score Distribution: per-record score histogram for latest epoch
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { TrainingMetricsSection } from "./TrainingMetricsSection";
import { FinetuneMetricsSection } from "./FinetuneMetricsSection";
import { ScoreStrip } from "@/components/datasets/eval-dialog/ScoreStrip";

type ChartView = "scoreTrend" | "stability" | "reward" | "completions" | "throughput" | "scoreDistribution";

/** Ordered by importance for finetune monitoring */
const CHART_VIEWS: { key: ChartView; label: string; description: string }[] = [
  { key: "scoreTrend", label: "Score Trend", description: "Average evaluation score over time with ±1σ confidence band. The primary indicator of whether your model is improving." },
  { key: "stability", label: "Loss", description: "Training loss, KL divergence, gradient norm, and learning rate. Shows whether training is converging and stable." },
  { key: "reward", label: "Reward", description: "Reward signal from the evaluator. Shows how well the model generates high-scoring responses and whether the evaluator provides useful learning signal." },
  { key: "completions", label: "Completions", description: "Response length and truncation rate. High truncation means responses hit the token limit — consider increasing max tokens." },
  { key: "throughput", label: "Throughput", description: "Token throughput, batch size, and completion length per step. Drops may indicate shorter or degenerate completions." },
  { key: "scoreDistribution", label: "Score Distribution", description: "Per-record score histogram for the latest evaluation. Shows the spread of scores across your dataset." },
];

interface FinetuneChartSelectorProps {
  readonly evalResults: FinetuneEvalResultsResponse | null;
  readonly isLoadingEvals: boolean;
  readonly isRefreshing: boolean;
  readonly evalsError: string | null;
  readonly onRefresh: () => void;
  readonly isLive: boolean;
  readonly jobId: string;
  readonly workflowId: string;
}

/** Extract scores from the latest epoch across all rows. */
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

export function FinetuneChartSelector({
  evalResults,
  isLoadingEvals,
  isRefreshing,
  evalsError,
  onRefresh,
  isLive,
  jobId,
  workflowId,
}: FinetuneChartSelectorProps) {
  const [view, setView] = useState<ChartView>("scoreTrend");

  const { scores, mean } = useMemo(() => {
    if (!evalResults?.results?.length) return { scores: [], mean: undefined };
    return extractLatestEpochScores(evalResults.results);
  }, [evalResults]);

  return (
    <div className="w-full">
      {/* Chart type selector — pill-style segmented control with tooltips */}
      <div className="flex items-center justify-between mb-2">
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center bg-zinc-800/40 rounded-md p-0.5 gap-0.5">
            {CHART_VIEWS.map(({ key, label, description }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setView(key)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-medium rounded transition-all",
                      view === key
                        ? "bg-zinc-700/80 text-zinc-200 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px]">
                  <p className="text-[11px]">{description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {view === "scoreTrend" && (
        <TrainingMetricsSection
          evalResults={evalResults}
          isLoading={isLoadingEvals}
          isRefreshing={isRefreshing}
          error={evalsError}
          onRefresh={onRefresh}
          isLive={isLive}
        />
      )}

      {(view === "reward" || view === "stability" || view === "completions" || view === "throughput") && (
        <FinetuneMetricsSection
          jobId={jobId}
          workflowId={workflowId}
          isLive={isLive}
          defaultTab={view}
        />
      )}

      {view === "scoreDistribution" && (
        <div className="rounded-lg bg-[#111] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">
              Score Distribution
            </p>
            <p className="text-xs text-slate-400">
              Per-record scores for the latest epoch
            </p>
          </div>
          <div className="p-4">
            {scores.length > 0 ? (
              <ScoreStrip scores={scores} mean={mean} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
                <span className="text-xs">No score data available yet.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
