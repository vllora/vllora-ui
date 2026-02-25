/**
 * JobDetailPanel
 *
 * Premium job detail view for the selected finetune job (left side of split view).
 * Layout: Header → Stat Cards → [Collapsible Details] → [Error] → Tabs (Metrics | Per-Row)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StopCircle,
  Play,
  Download,
  Loader2,
  ChevronDown,
  RefreshCw,
  Layers,
  BarChart3,
  Rows3,
  Zap,
  TrendingUp,
  TrendingDown,
  FileText,
  Package,
} from "lucide-react";
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
  formatDuration,
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

/** Stat card used in the quick-summary row */
function StatCard({
  label,
  value,
  subValue,
  delta,
  icon: Icon,
  valueClassName,
  children,
}: {
  label: string;
  value: string;
  subValue?: string;
  /** Score change from previous epoch (shown as +X% / -X% badge) */
  delta?: number | null;
  icon: React.ElementType;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-zinc-500" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-lg font-semibold font-mono tabular-nums leading-none",
            valueClassName ?? "text-zinc-200"
          )}
        >
          {value}
        </span>
        {subValue && (
          <span className="text-[10px] text-zinc-600 font-mono">{subValue}</span>
        )}
        {delta != null && delta !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium font-mono",
              delta > 0
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" />
            )}
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Thin epoch progress bar */
function EpochProgressBar({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <div className="mt-1.5 h-1 w-full rounded-full bg-zinc-800/80 overflow-hidden">
      <div
        className="h-full rounded-full bg-[rgb(var(--theme-500))] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

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
  const [showDetails, setShowDetails] = useState(false);
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
        window.dispatchEvent(
          new CustomEvent("vllora_highlight_eval_result", {
            detail: { recordId, _fromJobPanel: true },
          })
        );
      }, 200);
    };

    window.addEventListener("vllora_highlight_eval_result", handleHighlight);
    return () => {
      window.removeEventListener(
        "vllora_highlight_eval_result",
        handleHighlight
      );
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
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel"
      );
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
      toast.error(
        error instanceof Error ? error.message : "Failed to resume"
      );
    } finally {
      setIsActionLoading(false);
    }
  }, [job.provider_job_id, isActionLoading]);

  const handleDownloadWeights = useCallback(async () => {
    setIsDownloading(true);
    try {
      const { download_url } = await getWeightsDownloadUrl(
        job.provider_job_id
      );
      triggerFileDownload(
        download_url,
        `weights-${job.provider_job_id}.tar.gz`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to get download URL"
      );
    } finally {
      setIsDownloading(false);
    }
  }, [job.provider_job_id]);

  const canCancel = job.status === "pending" || job.status === "running";
  const canResume = job.status === "cancelled";
  const totalEpochs = job.training_config?.epochs ?? null;
  const duration = formatDuration(
    job.created_at,
    job.completed_at ?? (job.status === "running" ? undefined : null)
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-zinc-800/60">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-2 px-3 py-1.5">
            {/* Status + Model */}
            <FinetuneJobStatusBadge
              status={job.status}
              className="text-[10px] px-1.5 py-0.5"
            />
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-800/60 text-[10px] font-medium text-zinc-300 border border-zinc-700/40 font-mono">
              {getModelDisplayName(job.base_model)}
            </span>

            {/* Duration */}
            <span className="text-[10px] text-zinc-600 font-mono">
              {duration}
            </span>

            {/* Spacer */}
            <span className="flex-1" />

            {/* Created date */}
            <span className="text-[10px] text-zinc-600">
              {formatFinetuneJobDate(job.created_at)}
            </span>

            {/* Refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleRefresh}
                  disabled={isLoadingEvals || isRefreshing}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                >
                  <RefreshCw
                    className={cn(
                      "h-3 w-3",
                      isRefreshing && "animate-spin"
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                Refresh metrics
              </TooltipContent>
            </Tooltip>

            {/* Actions */}
            {canCancel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCancel}
                    disabled={isActionLoading}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <StopCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  Cancel job
                </TooltipContent>
              </Tooltip>
            )}
            {canResume && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleResume}
                    disabled={isActionLoading}
                    className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  Resume job
                </TooltipContent>
              </Tooltip>
            )}
            {job.status === "succeeded" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDownloadWeights}
                    disabled={isDownloading}
                    className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  Download weights
                </TooltipContent>
              </Tooltip>
            )}

            {/* Details toggle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-zinc-800/50"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform duration-200",
                  !showDetails && "-rotate-90"
                )}
              />
              Details
            </button>
          </div>
        </TooltipProvider>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────── */}
      {summary && (
        <div className="shrink-0 flex gap-2 px-3 py-2 border-b border-zinc-800/60">
          {/* Epoch — backend uses 0-based epochs, display as 1-based */}
          <StatCard
            label="Epoch"
            icon={Layers}
            value={summary.latestEpoch != null ? String(summary.latestEpoch + 1) : "-"}
            subValue={totalEpochs ? `/ ${totalEpochs}` : undefined}
          >
            {totalEpochs && summary.latestEpoch != null && (
              <EpochProgressBar
                current={summary.latestEpoch + 1}
                total={totalEpochs}
              />
            )}
          </StatCard>

          {/* Avg Score with delta */}
          <StatCard
            label="Avg Score"
            icon={BarChart3}
            value={
              summary.latestAvgScore !== null
                ? formatScore(summary.latestAvgScore)
                : "-"
            }
            valueClassName={
              summary.latestAvgScore !== null
                ? getScoreColorClass(summary.latestAvgScore)
                : "text-zinc-500"
            }
            delta={summary.scoreDelta}
          />

          {/* Rows */}
          <StatCard
            label="Rows"
            icon={Rows3}
            value={String(summary.totalRows)}
            subValue="evaluated"
          />

          {/* Learning Rate */}
          {job.training_config?.learning_rate != null && (
            <StatCard
              label="Learning Rate"
              icon={Zap}
              value={String(job.training_config.learning_rate)}
            />
          )}
        </div>
      )}

      {/* ── Collapsible Details ────────────────────────────────── */}
      {showDetails && (
        <div className="shrink-0 px-3 py-2.5 border-b border-zinc-800/60 bg-zinc-900/20">
          <FinetuneJobDetailsSection job={job} hideDownload />
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────── */}
      {job.error_message && (
        <div className="shrink-0 px-3 pt-2">
          <ErrorLogSection errorMessage={job.error_message} />
        </div>
      )}

      {/* ── Tabbed Content ─────────────────────────────────────── */}
      {(() => {
        const hasEvalData = evalResults && evalResults.results.length > 0;
        const isFailed = job.status === "failed";
        const isActive = job.status === "running" || job.status === "pending";

        // Failed with no eval data: skip tabs entirely
        if (isFailed && !hasEvalData && !isLoadingEvals) {
          return null;
        }

        return (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 min-h-0 flex flex-col"
          >
            <div className="shrink-0 px-3 pt-1.5 border-b border-zinc-800/60">
              <TabsList className="h-8 bg-transparent p-0 gap-0">
                <TabsTrigger
                  value="metrics"
                  className="text-[11px] px-3 h-8 rounded-none border-b-2 data-[state=active]:border-b-[rgb(var(--theme-500))] data-[state=active]:text-zinc-200 data-[state=inactive]:border-b-transparent data-[state=inactive]:text-zinc-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-zinc-300 transition-colors"
                >
                  Metrics
                </TabsTrigger>
                <TabsTrigger
                  value="per-row"
                  className="text-[11px] px-3 h-8 rounded-none border-b-2 data-[state=active]:border-b-[rgb(var(--theme-500))] data-[state=active]:text-zinc-200 data-[state=inactive]:border-b-transparent data-[state=inactive]:text-zinc-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-zinc-300 transition-colors"
                >
                  Per-Row
                </TabsTrigger>
                <TabsTrigger
                  value="logs"
                  className="text-[11px] px-3 h-8 rounded-none border-b-2 data-[state=active]:border-b-[rgb(var(--theme-500))] data-[state=active]:text-zinc-200 data-[state=inactive]:border-b-transparent data-[state=inactive]:text-zinc-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-zinc-300 transition-colors"
                >
                  Logs
                </TabsTrigger>
                <TabsTrigger
                  value="artifacts"
                  className="text-[11px] px-3 h-8 rounded-none border-b-2 data-[state=active]:border-b-[rgb(var(--theme-500))] data-[state=active]:text-zinc-200 data-[state=inactive]:border-b-transparent data-[state=inactive]:text-zinc-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-zinc-300 transition-colors"
                >
                  Artifacts
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="metrics"
              className="flex-1 min-h-0 overflow-y-auto p-3 mt-0"
            >
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
                  No experiment linked to this job
                </div>
              )}
            </TabsContent>
            <TabsContent
              value="per-row"
              className="flex-1 min-h-0 p-3 mt-0"
            >
              {job.dataset_id && hasEvalData ? (
                <PerRowDetailsSection
                  results={evalResults.results}
                  datasetId={job.dataset_id}
                />
              ) : (
                <div className="text-xs text-muted-foreground py-2">
                  {isLoadingEvals
                    ? "Loading..."
                    : isActive
                      ? "Evaluation data will appear as training progresses"
                      : "No per-row data available"}
                </div>
              )}
            </TabsContent>
            <TabsContent
              value="logs"
              className="flex-1 min-h-0 overflow-y-auto p-3 mt-0"
            >
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
                <FileText className="h-5 w-5 opacity-40" />
                <span className="text-xs">Training logs will appear here</span>
                <span className="text-[10px] text-zinc-600">
                  Logs are captured during training execution
                </span>
              </div>
            </TabsContent>
            <TabsContent
              value="artifacts"
              className="flex-1 min-h-0 overflow-y-auto p-3 mt-0"
            >
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-500">
                <Package className="h-5 w-5 opacity-40" />
                <span className="text-xs">No artifacts yet</span>
                <span className="text-[10px] text-zinc-600">
                  Model weights and checkpoints will appear here after training
                </span>
              </div>
            </TabsContent>
          </Tabs>
        );
      })()}
    </div>
  );
}
