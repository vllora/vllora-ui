/**
 * JobDetailPanel
 *
 * Displays job detail for the selected finetune job (left side of split view).
 * Shows status header, error log, and stacked Details → Metrics → Per-Row sections.
 */

import { useCallback, useState } from "react";
import { StopCircle, Play } from "lucide-react";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { FinetuneJobStatusBadge } from "../../FinetuneJobStatusBadge";
import { FinetuneJobDetailsSection } from "../FinetuneJobDetailsSection";
import { TrainingMetricsSection } from "../TrainingMetricsSection";
import { PerRowDetailsSection } from "../PerRowDetailsSection";
import { ErrorLogSection } from "../ErrorLogSection";
import { formatFinetuneJobDate, getModelDisplayName } from "../utils";
import {
  cancelReinforcementJob,
  resumeReinforcementJob,
} from "@/services/finetune-api";
import type { FinetuneJob } from "@/services/finetune-api";
import { toast } from "sonner";

export function JobDetailPanel({ job }: { job: FinetuneJob }) {
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

      {/* Stacked content: Details → Metrics → Per-Row */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        <FinetuneJobDetailsSection job={job} />

        {job.dataset_id && (
          <TrainingMetricsSection
            evalResults={evalResults}
            isLoading={isLoadingEvals}
            isRefreshing={isRefreshing}
            error={evalsError}
            onRefresh={handleRefresh}
          />
        )}

        {job.dataset_id && evalResults && evalResults.results.length > 0 && (
          <PerRowDetailsSection results={evalResults.results} />
        )}
      </div>
    </div>
  );
}
