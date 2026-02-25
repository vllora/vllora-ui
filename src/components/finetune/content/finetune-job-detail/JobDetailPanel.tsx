/**
 * JobDetailPanel
 *
 * Displays job detail for the selected finetune job (left side of split view).
 * Layout: Header → Quick Summary Bar → [Collapsible Details] → [Error] → Tabs (Metrics | Per-Row)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { StopCircle, Play, Download, Loader2, ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { FinetuneJobStatusBadge } from "../../FinetuneJobStatusBadge";
import { FinetuneJobDetailsSection } from "../FinetuneJobDetailsSection";
import { TrainingMetricsSection } from "../TrainingMetricsSection";
import { PerRowDetailsSection } from "../PerRowDetailsSection";
import { ErrorLogSection } from "../ErrorLogSection";
import {
  formatFinetuneJobDate,
  getModelDisplayName,
  computeTrainingSummary,
  triggerFileDownload,
} from "../utils";
import {
  cancelReinforcementJob,
  resumeReinforcementJob,
  getWeightsDownloadUrl,
} from "@/services/finetune-api";
import type { FinetuneJob } from "@/services/finetune-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getScoreColorClass, formatScore } from "@/utils/parse-score-breakdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function JobDetailPanel({ job }: { job: FinetuneJob }) {
  const { getJobEvaluations, refreshJobEvaluations } = FinetuneJobsConsumer();
  const { data: evalResults, isLoading: isLoadingEvals, error: evalsError } = getJobEvaluations(job.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [activeTab, setActiveTab] = useState("metrics");

  // Listen for highlight events from QualityIndicator finetune score clicks.
  // Switch to Per-Row tab, then re-dispatch so ResultsTable can scroll & highlight.
  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const recordId = detail?.recordId;
      // Skip re-dispatched events (prevent infinite loop)
      if (!recordId || detail?._fromJobPanel) return;
      // Switch to per-row tab
      setActiveTab("per-row");
      // Re-dispatch after Per-Row tab mounts so ResultsTable can catch it
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vllora_highlight_eval_result', {
          detail: { recordId, _fromJobPanel: true }
        }));
      }, 200);
    };

    window.addEventListener('vllora_highlight_eval_result', handleHighlight);
    return () => {
      window.removeEventListener('vllora_highlight_eval_result', handleHighlight);
    };
  }, []);

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
      await cancelReinforcementJob(job.provider_job_id);
      toast.success("Job cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel");
    } finally {
      setIsActionLoading(false);
    }
  }, [job.provider_job_id, isActionLoading]);

  const handleResume = useCallback(async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);
    try {
      await resumeReinforcementJob(job.provider_job_id);
      toast.success("Job resumed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resume");
    } finally {
      setIsActionLoading(false);
    }
  }, [job.provider_job_id, isActionLoading]);

  const handleDownloadWeights = useCallback(async () => {
    setIsDownloading(true);
    try {
      const { download_url } = await getWeightsDownloadUrl(job.provider_job_id);
      triggerFileDownload(download_url, `weights-${job.provider_job_id}.tar.gz`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to get download URL");
    } finally {
      setIsDownloading(false);
    }
  }, [job.provider_job_id]);

  const canCancel = job.status === "pending" || job.status === "running";
  const canResume = job.status === "cancelled";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: status + summary stats + actions (single compact row) */}
      <div className="shrink-0 border-b border-zinc-800/60">
        <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 min-w-0">
                <FinetuneJobStatusBadge status={job.status} className="text-[10px] px-1.5 py-0.5" />
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-700/50 text-[10px] font-medium text-zinc-300 border border-zinc-600/40">
                  {getModelDisplayName(job.base_model)}
                </span>
                {summary && (
                  <>
                    <span className="text-zinc-700">&middot;</span>
                    <span className="text-xs font-mono text-zinc-400">
                      Epoch <span className="text-zinc-300">{summary.latestEpoch ?? "-"}</span>
                      {job.training_config?.epochs && (
                        <span className="text-zinc-600">/{job.training_config.epochs}</span>
                      )}
                    </span>
                    {summary.latestAvgScore !== null && (
                      <>
                        <span className="text-zinc-700">&middot;</span>
                        <span className="text-xs font-mono text-zinc-400">
                          Avg Score{" "}
                          <span className={getScoreColorClass(summary.latestAvgScore)}>
                            {formatScore(summary.latestAvgScore)}
                          </span>
                        </span>
                      </>
                    )}
                    <span className="text-zinc-700">&middot;</span>
                    <span className="text-xs font-mono text-zinc-500">
                      {summary.totalRows} rows
                    </span>
                  </>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-0.5">
                <p><span className="text-zinc-400">Status:</span> {job.status}</p>
                <p><span className="text-zinc-400">Model:</span> {getModelDisplayName(job.base_model)}</p>
                {summary && (
                  <>
                    <p><span className="text-zinc-400">Epoch:</span> {summary.latestEpoch ?? "-"}{job.training_config?.epochs ? ` of ${job.training_config.epochs}` : ""}</p>
                    {summary.latestAvgScore !== null && (
                      <p><span className="text-zinc-400">Avg Score:</span> {formatScore(summary.latestAvgScore)} — average across all rows in latest epoch</p>
                    )}
                    <p><span className="text-zinc-400">Rows:</span> {summary.totalRows} training rows evaluated</p>
                  </>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-zinc-600 ml-auto">
            {formatFinetuneJobDate(job.created_at)}
          </span>
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={isActionLoading}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
            >
              <StopCircle className="h-3 w-3" />
              Cancel
            </button>
          )}
          {canResume && (
            <button
              onClick={handleResume}
              disabled={isActionLoading}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors"
            >
              <Play className="h-3 w-3" />
              Resume
            </button>
          )}
          {job.status === "succeeded" && (
            <button
              onClick={handleDownloadWeights}
              disabled={isDownloading}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors"
            >
              {isDownloading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              Weights
            </button>
          )}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", showDetails && "rotate-90")}
            />
            Details
          </button>
        </div>
        </TooltipProvider>
      </div>

      {/* Collapsible Job Details */}
      {showDetails && (
        <div className="shrink-0 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/10">
          <FinetuneJobDetailsSection job={job} hideDownload />
        </div>
      )}

      {/* Error */}
      {job.error_message && (
        <div className="shrink-0 px-3 pt-2">
          <ErrorLogSection errorMessage={job.error_message} />
        </div>
      )}

      {/* Tabbed content: Metrics | Per-Row — only show if there's data or the job might produce data */}
      {(() => {
        const hasEvalData = evalResults && evalResults.results.length > 0;
        const isFailed = job.status === "failed";
        const isActive = job.status === "running" || job.status === "pending";

        // Failed with no eval data: skip tabs entirely
        if (isFailed && !hasEvalData && !isLoadingEvals) {
          return null;
        }

        return (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 px-3 pt-2">
              <TabsList className="h-7">
                <TabsTrigger value="metrics" className="text-[11px] px-3 h-5">
                  Metrics
                </TabsTrigger>
                <TabsTrigger value="per-row" className="text-[11px] px-3 h-5">
                  Per-Row
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="metrics" className="flex-1 min-h-0 overflow-y-auto p-3 mt-0">
              {job.dataset_id ? (
                <TrainingMetricsSection
                  evalResults={evalResults}
                  isLoading={isLoadingEvals}
                  isRefreshing={isRefreshing}
                  error={evalsError}
                  onRefresh={handleRefresh}
                />
              ) : (
                <div className="text-xs text-muted-foreground py-2">
                  No dataset linked to this job
                </div>
              )}
            </TabsContent>
            <TabsContent value="per-row" className="flex-1 min-h-0 p-3 mt-0">
              {job.dataset_id && hasEvalData ? (
                <PerRowDetailsSection results={evalResults.results} datasetId={job.dataset_id} />
              ) : (
                <div className="text-xs text-muted-foreground py-2">
                  {isLoadingEvals ? "Loading..." : isActive ? "Evaluation data will appear as training progresses" : "No per-row data available"}
                </div>
              )}
            </TabsContent>
          </Tabs>
        );
      })()}
    </div>
  );
}
