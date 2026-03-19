/**
 * FinetuneChartSelector
 *
 * Combines the score trend chart, loss/reward chart, and score distribution
 * into a single chart area with a dropdown selector.
 * Mirrors the dropdown pattern from ScoreStrip.tsx in the eval dialog.
 */

import { useMemo, useState } from "react";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { TrainingMetricsSection } from "./TrainingMetricsSection";
import { FinetuneMetricsSection } from "./FinetuneMetricsSection";
import { ScoreStrip } from "@/components/datasets/eval-dialog/ScoreStrip";

type ChartView = "scoreTrend" | "lossReward" | "scoreDistribution";

const CHART_LABELS: Record<ChartView, string> = {
  scoreTrend: "Score Trend",
  lossReward: "Loss & Reward",
  scoreDistribution: "Score Distribution",
};

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

/**
 * Extract scores from the latest epoch across all rows.
 * Returns an array of numeric scores for distribution visualization.
 */
function extractLatestEpochScores(
  results: FinetuneEvalResultsResponse["results"]
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
      if (typeof result.score === "number") {
        scores.push(result.score);
      }
    }
  }

  const mean =
    scores.length > 0
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
      {/* Chart type selector — top-right, matching ScoreStrip pattern */}
      <div className="flex items-center justify-end mb-1">
        <select
          value={view}
          onChange={(e) => setView(e.target.value as ChartView)}
          className="text-[10px] bg-zinc-800/60 border border-zinc-700/50 rounded px-1.5 py-0.5 text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors outline-none focus:ring-1 focus:ring-zinc-600"
        >
          {(Object.keys(CHART_LABELS) as ChartView[]).map((key) => (
            <option key={key} value={key}>
              {CHART_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {/* Selected chart view */}
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

      {view === "lossReward" && (
        <FinetuneMetricsSection
          jobId={jobId}
          workflowId={workflowId}
          isLive={isLive}
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
                <span className="text-xs">
                  No score data available for distribution view.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
