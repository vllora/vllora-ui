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
import { FinetuneChartSelector } from "../FinetuneChartSelector";
import { PerRowDetailsSection } from "../PerRowDetailsSection";
import { EvaluatorVersionHistory } from "../EvaluatorVersionHistory";
import { EvaluatorVersionBadge } from "@/components/shared/EvaluatorVersionBadge";
import { useEvaluatorVersions } from "@/hooks/useEvaluatorVersions";
import { ErrorLogSection } from "../ErrorLogSection";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import {
  formatFinetuneJobDate,
  getModelDisplayName,
  computeTrainingSummary,
  triggerFileDownload,
  showWeightsDownloadToast,
} from "../utils";
import {
  cancelFinetuneJob,
  resumeFinetuneJob,
  getWeightsDownloadUrl,
} from "@/services/finetune-api";
import type { FinetuneJob } from "@/services/finetune-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function JobDetailPanel({ job }: { job: FinetuneJob }) {
  const { latestVersion } = useEvaluatorVersions(job.workflow_id);
  const { getJobEvaluations, refreshJobEvaluations, loadJobs } = FinetuneJobsConsumer();
  const { jobs: evalJobs } = EvalJobsConsumer();
  const {
    data: evalResults,
    isLoading: isLoadingEvals,
    error: evalsError,
  } = getJobEvaluations(job.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Find the first completed baseline eval for comparison
  const baselineEvalId = useMemo(() => {
    const completedEval = evalJobs.find(
      (j) => j.status === "completed" && j.evaluationRunId,
    );
    return completedEval?.evaluationRunId ?? null;
  }, [evalJobs]);

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
      const result = await cancelFinetuneJob(job.workflow_id, job.provider_job_id);
      loadJobs(job.workflow_id);
      if (result.cloudCancelFailed) {
        toast.warning("Job marked as cancelled locally, but the cloud training may still be running. Check the provider dashboard to confirm.");
      } else {
        toast.success("Job cancelled");
      }
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
      await resumeFinetuneJob(job.workflow_id, job.provider_job_id);
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
      {/* ── Header — single row: status + model + metadata + actions ── */}
      <header className="sticky top-0 z-20 border-b border-[#262626] bg-[#0a0a0a] px-4 py-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <FinetuneJobStatusBadge
            status={job.status}
            className="rounded bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium"
          />
          <span className="inline-flex items-center rounded bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-400 border border-zinc-700/40">
            {getModelDisplayName(job.base_model)}
          </span>
          {job.evaluator_version != null && latestVersion != null && (
            <EvaluatorVersionBadge jobVersion={job.evaluator_version} latestVersion={latestVersion} />
          )}
          {summary && (
            <span className="text-[10px] text-zinc-500">{summary.totalRows} rows</span>
          )}

          {/* Right: time + actions */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-zinc-600">{formatFinetuneJobDate(job.created_at)}</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleRefresh}
                    disabled={isLoadingEvals || isRefreshing}
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40 rounded hover:bg-white/5"
                  >
                    <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">Refresh metrics</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {canCancel && (
              <button onClick={handleCancel} disabled={isActionLoading}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <StopCircle className="h-3 w-3" />}
                Cancel
              </button>
            )}
            {canResume && (
              <button onClick={handleResume} disabled={isActionLoading}
                className="flex items-center gap-1 rounded bg-[#10b981] px-2.5 py-1 text-[10px] font-bold text-[#0a0a0a] hover:bg-[#10b981]/90 transition-colors disabled:opacity-50"
              >
                {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Resume
              </button>
            )}
            {job.status === "succeeded" && (
              <>
                <button onClick={handleDownloadWeights} disabled={isDownloading}
                  className="flex items-center gap-1 rounded bg-[#10b981] px-2.5 py-1 text-[10px] font-bold text-[#0a0a0a] hover:bg-[#10b981]/90 transition-colors disabled:opacity-50"
                >
                  {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Weights
                </button>
                <UsageGuideDialog jobId={job.provider_job_id} baseModel={job.base_model} />
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Scrollable content: chart + insights + results ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* ── Epoch Progress (thin bar only) ── */}
          {totalEpochs != null && summary?.latestEpoch != null && (
            <EpochProgressBar
              currentEpoch={Math.min(summary.latestEpoch + 1, totalEpochs)}
              totalEpochs={totalEpochs}
            />
          )}

          {/* ── Job Details ── */}
          <FinetuneJobDetailsSection job={job} />

          {/* ── Error ── */}
          {job.error_message && (
            <ErrorLogSection errorMessage={job.error_message} />
          )}

          {/* ── Charts (Score Trend / Training Progress / Loss & Reward / Score Distribution) ── */}
          {job.workflow_id ? (
            canCancel && !evalResults?.results?.length ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-zinc-500">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-amber-400 animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-zinc-300">
                    {job.status === "pending" ? "Waiting for training to start" : "Training in progress"}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {job.status === "pending"
                      ? "Your job is queued. Training will begin shortly and metrics will appear here."
                      : "Evaluation scores will appear here as training progresses."}
                  </p>
                </div>
              </div>
            ) : (
              <FinetuneChartSelector
                evalResults={evalResults}
                isLoadingEvals={isLoadingEvals}
                isRefreshing={isRefreshing}
                evalsError={evalsError}
                onRefresh={handleRefresh}
                isLive={canCancel}
                jobId={job.provider_job_id}
                workflowId={job.workflow_id}
                baselineEvalId={baselineEvalId ?? undefined}
                maxOutputTokens={job.inference_parameters?.max_output_tokens}
              />
            )
          ) : (
            !(job.status === "failed") && (
              <div className="text-xs text-muted-foreground py-2">
                No workflow linked to this job
              </div>
            )
          )}

          {/* ── Evaluator Version History ── */}
          {job.workflow_id && (
            <EvaluatorVersionHistory workflowId={job.workflow_id} />
          )}

          {/* Baseline comparison now lives inside FinetuneChartSelector ("vs Baseline" tab) */}
        </div>

        {/* ── Results table ── */}
        {job.workflow_id && evalResults && evalResults.results.length > 0 && (
          <div className="px-4 pb-4 [&_input]:!bg-[#141414] [&_input]:!border-[#262626] [&_button]:!border-[#262626] [&_button]:!text-slate-400 [&_button:hover]:!bg-white/5">
            <PerRowDetailsSection
              results={evalResults.results}
              workflowId={job.workflow_id}
            />
          </div>
        )}
      </div>
    </div>
  );
}
