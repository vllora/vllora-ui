/**
 * TrainingImpactCard
 *
 * Post-training hero chart for the workflow overview. Reuses the same
 * TrainingMetricsSection + FinetuneJobsConsumer cache as the Training tab
 * (src/components/datasets/TrainingMetricsSummary.tsx) — no parallel fetch,
 * no parallel logic. The overview and the detail pane always show the same
 * numbers.
 *
 * Rendering priority (resolved by the parent WorkspaceWelcome):
 *   1. This card (eval-score-per-epoch) — when a training job has at least
 *      one epoch-eval row.
 *   2. HealthRow (pre-training eval distribution / trend) — otherwise.
 *
 * The dashed baseline line on the chart = the pre-training eval mean, passed
 * in from the same `computeDatasetScore(...)` helper used by PipelineStrip
 * and HealthRow. One source of truth for the "starting point" number.
 */

import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { TrainingMetricsSection } from "@/components/finetune/content/TrainingMetricsSection";
import { extractEpochScores } from "@/components/finetune/content/baseline-comparison-helpers";
import { cn } from "@/lib/utils";

interface TrainingImpactCardProps {
  /** Pre-training eval mean — shared with HealthRow/PipelineStrip. */
  readonly baselineScore: number | null;
  readonly onOpenDetails?: () => void;
}

export function TrainingImpactCard({
  baselineScore,
  onOpenDetails,
}: TrainingImpactCardProps) {
  const { latestJob, getJobEvaluations, ensureJobEvaluationsLoaded, refreshJobEvaluations } =
    FinetuneJobsConsumer();

  const jobId = latestJob?.id;
  useEffect(() => {
    if (!jobId) return;
    ensureJobEvaluationsLoaded(jobId);
  }, [jobId, ensureJobEvaluationsLoaded]);

  if (!latestJob || !jobId) return null;

  const evalState = getJobEvaluations(jobId);
  const rows = evalState.data?.results;
  const hasData = !!rows && rows.length > 0;

  // Aggregate per-epoch means from the SAME rows the chart consumes — so the
  // header delta pill and the baseline line on the chart stay in lockstep.
  const { latestEpochAvg, epochCount } = useMemo(() => {
    if (!rows || rows.length === 0) return { latestEpochAvg: null, epochCount: 0 };
    const epochScores = extractEpochScores(rows);
    if (epochScores.size === 0) return { latestEpochAvg: null, epochCount: 0 };
    const epochs = Array.from(epochScores.keys()).sort((a, b) => a - b);
    const latestEpoch = epochs[epochs.length - 1];
    const scores = Array.from(epochScores.get(latestEpoch)?.values() ?? []);
    const avg =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { latestEpochAvg: avg, epochCount: epochs.length };
  }, [rows]);

  // Only render when the same `TrainingMetricsSummary` would render a chart —
  // otherwise HealthRow's pre-training story is still the right one to show.
  if (!hasData) return null;

  const isLive = latestJob.status === "running" || latestJob.status === "pending";
  const modelLabel = latestJob.fine_tuned_model ?? latestJob.base_model;
  const delta =
    typeof latestEpochAvg === "number" && typeof baselineScore === "number"
      ? Math.round((latestEpochAvg - baselineScore) * 100) / 100
      : null;

  return (
    <div className="rounded-xl border border-border/60 bg-zinc-900/40 px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            Training impact
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> live
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            Eval score per epoch · {epochCount} checkpoint{epochCount === 1 ? "" : "s"}
            {modelLabel ? ` · ${modelLabel}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {delta !== null && delta !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                delta > 0
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300",
              )}
              title={
                baselineScore != null
                  ? `Baseline ${baselineScore.toFixed(2)} → latest ${latestEpochAvg?.toFixed(2)}`
                  : undefined
              }
            >
              {delta > 0 ? "+" : ""}
              {delta.toFixed(2)} vs baseline
            </span>
          )}
          {onOpenDetails && (
            <button
              type="button"
              onClick={onOpenDetails}
              className="inline-flex h-6 items-center rounded-md border border-border/60 bg-card/40 px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Details
            </button>
          )}
        </div>
      </div>

      <TrainingMetricsSection
        evalResults={evalState.data}
        isLoading={evalState.isLoading}
        isRefreshing={false}
        error={evalState.error}
        onRefresh={() => refreshJobEvaluations(jobId)}
        isLive={isLive}
        baselineScore={baselineScore ?? undefined}
      />
    </div>
  );
}
