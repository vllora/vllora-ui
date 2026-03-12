/**
 * JobDetailPanel
 *
 * Premium job detail view for the selected finetune job (left side of split view).
 * Layout: Header → Epoch Bar → Job Details → Metrics Chart → Per-Row Details
 * Visual design follows Stitch mockup with dark panel backgrounds and emerald accents.
 */

import { useCallback, useMemo, useState } from "react";
import {
  StopCircle,
  Play,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { FinetuneJobStatusBadge } from "../../FinetuneJobStatusBadge";
import { EpochProgressBar } from "./EpochProgressSection";
import { FinetuneJobDetailsSection } from "./FinetuneJobDetailsSection";
import { UsageGuideDialog } from "./UsageGuideSection";
import { TrainingMetricsSection } from "../TrainingMetricsSection";
import { ReinforcementMetricsSection } from "../ReinforcementMetricsSection";
import { PerRowDetailsSection } from "../PerRowDetailsSection";
import { EvaluatorVersionHistory } from "../EvaluatorVersionHistory";
import { ErrorLogSection } from "../ErrorLogSection";
import {
  formatFinetuneJobDate,
  getModelDisplayName,
  computeTrainingSummary,
  triggerFileDownload,
  showWeightsDownloadToast,
} from "../utils";
import {
  cancelReinforcementJob,
  resumeReinforcementJob,
  getWeightsDownloadUrl,
} from "@/services/finetune-api";
import type { FinetuneJob } from "@/services/finetune-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatScore } from "@/utils/parse-score-breakdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function JobDetailPanel({ job }: { job: FinetuneJob }) {
  const { getJobEvaluations, refreshJobEvaluations } = FinetuneJobsConsumer();
  const {
    data: evalResults,
    isLoading: isLoadingEvals,
    error: evalsError,
  } = getJobEvaluations(job.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const summary = useMemo(() => {
    if (!evalResults?.results) return null;
    return computeTrainingSummary(evalResults.results);
  }, [evalResults]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshJobEvaluations(job.id);
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [job.id, refreshJobEvaluations]);

  const handleCancel = useCallback(async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);
    try {
      await cancelReinforcementJob(job.workflow_id, job.provider_job_id);
      toast.success("Job cancelled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel"
      );
    } finally {
      setIsActionLoading(false);
    }
  }, [job.workflow_id, job.provider_job_id, isActionLoading]);

  const handleResume = useCallback(async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);
    try {
      await resumeReinforcementJob(job.workflow_id, job.provider_job_id);
      toast.success("Job resumed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to resume"
      );
    } finally {
      setIsActionLoading(false);
    }
  }, [job.workflow_id, job.provider_job_id, isActionLoading]);

  const handleDownloadWeights = useCallback(async () => {
    setIsDownloading(true);
    try {
      const { download_url } = await getWeightsDownloadUrl(
        job.workflow_id,
        job.provider_job_id
      );
      triggerFileDownload(
        download_url,
        `weights-${job.provider_job_id}.tar.gz`
      );
      showWeightsDownloadToast();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to get download URL"
      );
    } finally {
      setIsDownloading(false);
    }
  }, [job.workflow_id, job.provider_job_id]);

  const canCancel = job.status === "pending" || job.status === "running";
  const canResume = job.status === "cancelled";
  const totalEpochs = job.training_config?.epochs ?? null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── Stitch style: h-14, dark panel, pills + summary + actions */}
      <header className="sticky top-0 z-10 flex py-1 items-center justify-between border-b border-[#262626] px-4 shrink-0 gap-3">
        {/* Left: Status + Model pills */}
        <div className="flex items-center gap-2 shrink-0">
          <FinetuneJobStatusBadge
            status={job.status}
            className="rounded-full bg-slate-800/50 px-3 py-1 text-xs font-medium"
          />
          <span className="inline-flex items-center rounded-full bg-[#10b981]/10 px-3 py-1 text-xs font-medium text-[#10b981]">
            {getModelDisplayName(job.base_model)}
          </span>
        </div>

        {/* Center: Summary text */}
        {summary && (
          <p className="font-mono text-xs font-medium tracking-tight text-slate-300 truncate min-w-0">
            Epoch{" "}
            {summary.latestEpoch != null ? summary.latestEpoch + 1 : "-"}/
            {totalEpochs ?? "?"} · Avg Score{" "}
            <span className="text-[#10b981]">
              {summary.latestAvgScore != null
                ? formatScore(summary.latestAvgScore)
                : "-"}
            </span>{" "}
            · {summary.totalRows} rows
          </p>
        )}

        {/* Right: Time + Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-500 font-medium hidden sm:block">
            {formatFinetuneJobDate(job.created_at)}
          </span>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleRefresh}
                  disabled={isLoadingEvals || isRefreshing}
                  className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40 rounded hover:bg-white/5"
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5",
                      isRefreshing && "animate-spin"
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                Refresh metrics
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex gap-2">
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={isActionLoading}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {isActionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <StopCircle className="h-3.5 w-3.5" />
                )}
                Cancel
              </button>
            )}
            {canResume && (
              <button
                onClick={handleResume}
                disabled={isActionLoading}
                className="flex items-center gap-1.5 rounded bg-[#10b981] px-3 py-1.5 text-xs font-bold text-[#0a0a0a] hover:bg-[#10b981]/90 transition-colors disabled:opacity-50"
              >
                {isActionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Resume
              </button>
            )}
            {job.status === "succeeded" && (
              <>
                <button
                  onClick={handleDownloadWeights}
                  disabled={isDownloading}
                  className="flex items-center gap-1.5 rounded bg-[#10b981] px-3 py-1.5 text-xs font-bold text-[#0a0a0a] hover:bg-[#10b981]/90 transition-colors disabled:opacity-50"
                >
                  {isDownloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Weights
                </button>
                <UsageGuideDialog
                  jobId={job.provider_job_id}
                  baseModel={job.base_model}
                />
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Main scrollable content ── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* ── Epoch Progress (thin bar only) ── */}
          {totalEpochs != null && summary?.latestEpoch != null && (
            <EpochProgressBar
              currentEpoch={summary.latestEpoch + 1}
              totalEpochs={totalEpochs}
            />
          )}

          {/* ── Job Details ── */}
          <FinetuneJobDetailsSection job={job} />

          {/* ── Error ── */}
          {job.error_message && (
            <ErrorLogSection errorMessage={job.error_message} />
          )}

          {/* ── Eval Score Chart (per-epoch grader scores) ── */}
          {job.workflow_id ? (
            <TrainingMetricsSection
              evalResults={evalResults}
              isLoading={isLoadingEvals}
              isRefreshing={isRefreshing}
              error={evalsError}
              onRefresh={handleRefresh}
              isLive={job.status === "running"}
            />
          ) : (
            !(job.status === "failed") && (
              <div className="text-xs text-muted-foreground py-2">
                No workflow linked to this job
              </div>
            )
          )}

          {/* ── Reinforcement Training Metrics (reward, KL, loss, completions) ── */}
          <ReinforcementMetricsSection
            jobId={job.id}
            workflowId={job.workflow_id}
            isLive={job.status === "running"}
          />

          {/* ── Evaluator Version History ── */}
          {job.workflow_id && (
            <EvaluatorVersionHistory workflowId={job.workflow_id} />
          )}

          {/* ── Per-Row Details (themed to match panel) ── */}
          {job.workflow_id && evalResults && evalResults.results.length > 0 && (
            <div className="[&_input]:!bg-[#141414] [&_input]:!border-[#262626] [&_button]:!border-[#262626] [&_button]:!text-slate-400 [&_button:hover]:!bg-white/5">
              <PerRowDetailsSection
                results={evalResults.results}
                workflowId={job.workflow_id}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
