/**
 * FinetuneBottomPanel
 *
 * Split view for finetune jobs: job detail on left, job list sidebar on right.
 */

import { useEffect, useCallback, useMemo, useState } from "react";
import {
  List,
  Info,
  Loader2,
  StopCircle,
  Play,
  BarChart3,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { FinetuneJobStatusBadge } from "../FinetuneJobStatusBadge";
import { FinetuneJobDetailsSection } from "./FinetuneJobDetailsSection";
import { TrainingMetricsSection } from "./TrainingMetricsSection";
import { PerRowDetailsSection } from "./PerRowDetailsSection";
import { ErrorLogSection } from "./ErrorLogSection";
import { formatFinetuneJobDate, getModelDisplayName } from "./utils";
import {
  cancelReinforcementJob,
  resumeReinforcementJob,
} from "@/services/finetune-api";
import type { FinetuneJob } from "@/services/finetune-api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Inline job detail panel (left side of split view) */
function JobDetailInline({ job }: { job: FinetuneJob }) {
  const { getJobEvaluations, refreshJobEvaluations } = FinetuneJobsConsumer();
  const { data: evalResults, isLoading: isLoadingEvals, error: evalsError } = getJobEvaluations(job.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

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

  const canCancel = job.status === "pending" || job.status === "running";
  const canResume = job.status === "cancelled";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with status + actions */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60">
        <FinetuneJobStatusBadge status={job.status} className="text-[10px] px-1.5 py-0.5" />
        <span className="text-xs text-zinc-400">{getModelDisplayName(job.base_model)}</span>
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
      </div>

      {/* Error */}
      {job.error_message && (
        <div className="shrink-0 px-3 pt-2">
          <ErrorLogSection errorMessage={job.error_message} />
        </div>
      )}

      {/* Tabbed content: Details / Metrics / Per-Row */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="h-7 mb-2">
            <TabsTrigger value="details" className="text-[11px] gap-1 h-6">
              <Info className="h-3 w-3" />
              Details
            </TabsTrigger>
            {job.dataset_id && (
              <>
                <TabsTrigger value="metrics" className="text-[11px] gap-1 h-6">
                  <BarChart3 className="h-3 w-3" />
                  Metrics
                </TabsTrigger>
                <TabsTrigger value="rows" className="text-[11px] gap-1 h-6">
                  <List className="h-3 w-3" />
                  Per-Row
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="details" className="mt-2">
            <FinetuneJobDetailsSection job={job} />
          </TabsContent>

          {job.dataset_id && (
            <>
              <TabsContent value="metrics" className="mt-2">
                <TrainingMetricsSection
                  evalResults={evalResults}
                  isLoading={isLoadingEvals}
                  isRefreshing={isRefreshing}
                  error={evalsError}
                  onRefresh={handleRefresh}
                />
              </TabsContent>
              <TabsContent value="rows" className="mt-2">
                {evalResults && evalResults.results.length > 0 ? (
                  <PerRowDetailsSection results={evalResults.results} />
                ) : (
                  <div className="text-xs text-zinc-600 py-2">
                    No row data available yet
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}

export function FinetuneBottomPanel() {
  const { filteredJobs, isLoading } = FinetuneJobsConsumer();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const selectedJob = useMemo(
    () => filteredJobs.find((j) => j.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId]
  );

  // Auto-select latest job on first load
  useEffect(() => {
    if (!selectedJobId && filteredJobs.length > 0) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  // Auto-select running job when it starts
  useEffect(() => {
    const runningJob = filteredJobs.find((j) => j.status === "running" || j.status === "pending");
    if (runningJob) {
      setSelectedJobId(runningJob.id);
    }
  }, [filteredJobs]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      {/* Left: selected job detail */}
      <div className="flex-1 min-w-0 min-h-0 border-r border-zinc-800/60">
        {selectedJob ? (
          <JobDetailInline job={selectedJob} />
        ) : filteredJobs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">
            No finetune jobs yet. Configure training above and click Start Training.
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">
            Select a job from the list
          </div>
        )}
      </div>

      {/* Right: job list sidebar */}
      <div className="w-48 shrink-0 flex flex-col min-h-0 bg-zinc-900/30">
        <div className="shrink-0 px-2 py-1.5 border-b border-zinc-800/60">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
            Runs
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading && filteredJobs.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
            </div>
          ) : (
            filteredJobs.map((job) => {
              const isSelected = job.id === selectedJobId;
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 flex items-center gap-2 text-xs transition-colors border-l-2",
                    isSelected
                      ? "bg-zinc-800/60 border-l-[rgb(var(--theme-500))] text-zinc-200"
                      : "border-l-transparent text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300"
                  )}
                >
                  <StatusIcon status={job.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium truncate">
                        {getModelDisplayName(job.base_model)}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-600 truncate">
                      {formatFinetuneJobDate(job.created_at)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      job.status === "succeeded"
                        ? "bg-emerald-500"
                        : job.status === "failed"
                        ? "bg-red-500"
                        : job.status === "running" || job.status === "pending"
                        ? "bg-blue-500"
                        : "bg-zinc-500"
                    )}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running" || status === "pending")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />;
  if (status === "succeeded")
    return <div className="h-3.5 w-3.5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /></div>;
  if (status === "failed")
    return <div className="h-3.5 w-3.5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-red-500" /></div>;
  return <div className="h-3.5 w-3.5 rounded-full bg-zinc-500/20 flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-zinc-500" /></div>;
}
