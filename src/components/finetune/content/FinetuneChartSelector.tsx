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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { TrainingMetricsSection } from "./TrainingMetricsSection";
import { FinetuneMetricsSection } from "./FinetuneMetricsSection";
import { ScoreStrip } from "@/components/datasets/eval-dialog/ScoreStrip";

type ChartView = "scoreTrend" | "trainingProgress" | "lossReward" | "scoreDistribution";

const CHART_LABELS: Record<ChartView, string> = {
  scoreTrend: "Score Trend",
  trainingProgress: "Training Progress",
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

/** Compute per-epoch derived metrics from eval results */
interface EpochProgressData {
  epoch: number;
  label: string;
  avgScore: number;
  improvement: number;
  /** Standard deviation — measures score spread (learning signal quality) */
  stdDev: number;
  /** % of records in the bottom quartile (below Q1 of epoch 1 baseline) */
  bottomQuartilePct: number;
  count: number;
}

function computeEpochProgress(
  results: FinetuneEvalResultsResponse["results"],
): EpochProgressData[] {
  // Collect all epoch numbers
  const epochSet = new Set<number>();
  for (const row of results) {
    for (const key of Object.keys(row.epochs)) {
      epochSet.add(parseInt(key, 10));
    }
  }
  const epochNumbers = [...epochSet].sort((a, b) => a - b);
  if (epochNumbers.length === 0) return [];

  const data: EpochProgressData[] = [];
  let prevAvg = 0;

  for (const epoch of epochNumbers) {
    const scores: number[] = [];
    for (const row of results) {
      const entries = row.epochs[epoch];
      if (!entries) continue;
      for (const e of entries) {
        if (typeof e.score === "number") scores.push(e.score);
      }
    }
    if (scores.length === 0) continue;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = Math.sqrt(scores.reduce((a, b) => a + (b - avg) ** 2, 0) / scores.length);
    const improvement = data.length > 0 ? avg - prevAvg : 0;
    // Bottom quartile: records below Q1 (25th percentile)
    const sorted = [...scores].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const bottomCount = scores.filter((s) => s <= q1).length;

    data.push({
      epoch,
      label: `Eval ${epoch + 1}`,
      avgScore: avg,
      improvement,
      stdDev,
      bottomQuartilePct: (bottomCount / scores.length) * 100,
      count: scores.length,
    });
    prevAvg = avg;
  }
  return data;
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

  const progressData = useMemo(() => {
    if (!evalResults?.results?.length) return [];
    return computeEpochProgress(evalResults.results);
  }, [evalResults]);

  return (
    <div className="w-full">
      {/* Chart type selector */}
      <div className="flex items-center justify-end mb-1">
        <select
          value={view}
          onChange={(e) => setView(e.target.value as ChartView)}
          className="text-[10px] bg-zinc-800/60 border border-zinc-700/50 rounded px-1.5 py-0.5 text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors outline-none focus:ring-1 focus:ring-zinc-600"
        >
          {(Object.keys(CHART_LABELS) as ChartView[]).map((key) => (
            <option key={key} value={key}>{CHART_LABELS[key]}</option>
          ))}
        </select>
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

      {view === "trainingProgress" && (
        <TrainingProgressChart data={progressData} isLive={isLive} />
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
                <span className="text-xs">No score data available yet.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Training Progress Chart (derived from eval scores) ───

function ProgressTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: EpochProgressData }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 shadow-lg space-y-0.5">
      <div className="text-[11px] text-zinc-200 font-medium">{d.label}</div>
      <div className="text-[11px] text-zinc-400">
        Avg Score: <span className="font-mono font-semibold text-zinc-200">{d.avgScore.toFixed(3)}</span>
      </div>
      <div className="text-[11px] text-zinc-400">
        Improvement: <span className={`font-mono font-semibold ${d.improvement >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {d.improvement >= 0 ? "+" : ""}{d.improvement.toFixed(3)}
        </span>
      </div>
      <div className="text-[11px] text-zinc-400">
        Score Spread (σ): <span className="font-mono font-semibold text-zinc-200">{d.stdDev.toFixed(3)}</span>
        <span className="text-zinc-600"> — higher = more learning signal</span>
      </div>
      <div className="text-[11px] text-zinc-500">{d.count} records evaluated</div>
    </div>
  );
}

function TrainingProgressChart({ data, isLive }: { readonly data: EpochProgressData[]; readonly isLive: boolean }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
        <span className="text-xs">
          {isLive ? "Waiting for epoch results..." : "No epoch data available."}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Improvement per epoch */}
      <div>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
          Score Improvement Per Eval
        </span>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
              axisLine={{ stroke: "#27272a" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              width={35}
              tickFormatter={(v: number) => (v >= 0 ? "+" : "") + v.toFixed(2)}
            />
            <RechartsTooltip content={<ProgressTooltip />} />
            <ReferenceLine y={0} stroke="#3f3f46" />
            <Bar dataKey="improvement" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.improvement >= 0 ? "#10b981" : "#ef4444"}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Score spread per epoch — higher spread = more learning signal for GRPO */}
      <div>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
          Score Spread Per Eval
          <span className="font-normal text-zinc-600 ml-1">(std dev — higher = stronger reward signal for training)</span>
        </span>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
              axisLine={{ stroke: "#27272a" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              width={35}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <RechartsTooltip content={<ProgressTooltip />} />
            <Bar dataKey="stdDev" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.stdDev >= 0.15 ? "#10b981" : entry.stdDev >= 0.05 ? "#eab308" : "#ef4444"}
                  fillOpacity={0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats row */}
      <div className="flex items-center gap-6 text-[11px] text-zinc-500 flex-wrap">
        {data.length >= 2 && (
          <>
            <span>
              Total improvement:{" "}
              <span className={`font-mono font-semibold ${data[data.length - 1].avgScore - data[0].avgScore >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {data[data.length - 1].avgScore - data[0].avgScore >= 0 ? "+" : ""}
                {(data[data.length - 1].avgScore - data[0].avgScore).toFixed(3)}
              </span>
            </span>
            <span>
              Final avg:{" "}
              <span className="font-mono font-semibold text-zinc-200">
                {data[data.length - 1].avgScore.toFixed(3)}
              </span>
            </span>
            <span>
              Final spread (σ):{" "}
              <span className="font-mono font-semibold text-zinc-200">
                {data[data.length - 1].stdDev.toFixed(3)}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
