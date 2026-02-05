/**
 * JobTableRow
 *
 * Expandable table row component for displaying a finetune job.
 */

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
  StopCircle,
  Play,
  Clock,
} from "lucide-react";
import {
  FinetuneJob,
  cancelReinforcementJob,
  resumeReinforcementJob,
  getFinetuneEvaluations,
  FinetuneEvalResultsResponse,
} from "@/services/finetune-api";
import { toast } from "sonner";
import { FinetuneJobStatusBadge } from "../FinetuneJobStatusBadge";
import { TrainingMetricsChart } from "../TrainingMetricsChart";
import { EpochSummary } from "./EpochSummary";
import { formatFinetuneJobDate, formatDuration, getModelDisplayName } from "./utils";

interface JobTableRowProps {
  job: FinetuneJob;
  onJobAction?: () => void;
}

export function JobTableRow({ job, onJobAction }: JobTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [evalResults, setEvalResults] = useState<FinetuneEvalResultsResponse | null>(null);
  const [isLoadingEvals, setIsLoadingEvals] = useState(false);
  const [isRefreshingEvals, setIsRefreshingEvals] = useState(false);
  const [evalsError, setEvalsError] = useState<string | null>(null);

  const canCancel = job.status === 'pending' || job.status === 'running';
  const canResume = job.status === 'cancelled';
  const isActive = job.status === 'pending' || job.status === 'running';

  // Fetch evaluations function (reusable for initial, poll, and manual refresh)
  const fetchEvaluations = useCallback(async (options: { isInitial?: boolean; isManualRefresh?: boolean } = {}) => {
    const { isInitial = false, isManualRefresh = false } = options;

    if (!job.dataset_id) return;

    if (isInitial) {
      setIsLoadingEvals(true);
      setEvalsError(null);
    }
    if (isManualRefresh) {
      setIsRefreshingEvals(true);
    }

    try {
      const results = await getFinetuneEvaluations(job.dataset_id, job.provider_job_id);
      setEvalResults(results);
      setEvalsError(null);
    } catch (error) {
      setEvalsError(error instanceof Error ? error.message : 'Failed to load evaluations');
    } finally {
      if (isInitial) setIsLoadingEvals(false);
      if (isManualRefresh) setIsRefreshingEvals(false);
    }
  }, [job.dataset_id, job.provider_job_id]);

  // Fetch evaluation results when expanded, poll while running
  useEffect(() => {
    if (!isExpanded || !job.dataset_id) return;

    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // Initial fetch
    fetchEvaluations({ isInitial: true });

    // Poll every 20 seconds while job is running
    if (isActive) {
      pollInterval = setInterval(() => {
        if (isMounted) {
          fetchEvaluations();
        }
      }, 20000);
    }

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isExpanded, job.dataset_id, isActive, fetchEvaluations]);

  // Manual refresh handler
  const handleRefreshMetrics = useCallback(() => {
    fetchEvaluations({ isManualRefresh: true });
  }, [fetchEvaluations]);

  const handleCancel = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActionLoading) return;

    setIsActionLoading(true);
    try {
      await cancelReinforcementJob(job.provider_job_id);
      toast.success('Job cancelled successfully');
      onJobAction?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel job');
    } finally {
      setIsActionLoading(false);
    }
  }, [job.provider_job_id, isActionLoading, onJobAction]);

  const handleResume = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActionLoading) return;

    setIsActionLoading(true);
    try {
      await resumeReinforcementJob(job.provider_job_id);
      toast.success('Job resumed successfully');
      onJobAction?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resume job');
    } finally {
      setIsActionLoading(false);
    }
  }, [job.provider_job_id, isActionLoading, onJobAction]);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <>
      {/* Main Row */}
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors group"
        onClick={toggleExpand}
      >
        {/* Expand Icon + Run Name/ID */}
        <TableCell className="font-medium w-[220px]">
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate" title={job.provider_job_id}>
                {job.provider_job_id.slice(0, 12)}...
              </span>
              <span className="text-xs text-muted-foreground">
                {formatFinetuneJobDate(job.created_at)}
              </span>
            </div>
          </div>
        </TableCell>

        {/* Status */}
        <TableCell className="w-[120px]">
          <FinetuneJobStatusBadge status={job.status} />
        </TableCell>

        {/* Base Model */}
        <TableCell className="w-[180px]">
          <span className="text-sm">{getModelDisplayName(job.base_model)}</span>
        </TableCell>

        {/* Duration */}
        <TableCell className="w-[140px]">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDuration(job.created_at, job.completed_at)}</span>
            {isActive && <span className="text-xs">(running)</span>}
          </div>
        </TableCell>

        {/* Actions */}
        <TableCell className="w-[100px]">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-100"
                onClick={handleCancel}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <StopCircle className="h-3.5 w-3.5" />
                )}
                Cancel
              </Button>
            )}
            {canResume && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={handleResume}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Resume
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded Content Row */}
      {isExpanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={5} className="p-0">
            <div className="px-6 py-4 space-y-4">
              {/* Error Log Section */}
              {job.error_message && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-red-600 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Error Log
                  </h4>
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 rounded-md text-xs font-mono">
                    {job.error_message}
                  </div>
                </div>
              )}

              {/* Job Details */}
              <div className="grid grid-cols-2 gap-6">
                {/* Left Column - Job Info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Job Details
                  </h4>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                    <span className="text-muted-foreground">Provider:</span>
                    <span className="font-mono">{job.provider}</span>

                    <span className="text-muted-foreground">Full Job ID:</span>
                    <span className="font-mono truncate" title={job.provider_job_id}>
                      {job.provider_job_id}
                    </span>

                    {job.fine_tuned_model && (
                      <>
                        <span className="text-muted-foreground">Output Model:</span>
                        <span className="font-mono text-green-600 truncate" title={job.fine_tuned_model}>
                          {job.fine_tuned_model}
                        </span>
                      </>
                    )}

                    {job.completed_at && (
                      <>
                        <span className="text-muted-foreground">Completed:</span>
                        <span>{formatFinetuneJobDate(job.completed_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Column - Hyperparameters */}
                {job.training_config && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Hyperparameters
                    </h4>
                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                      <span className="text-muted-foreground">Learning Rate:</span>
                      <span className="font-mono">{job.training_config.learning_rate ?? "default"}</span>

                      <span className="text-muted-foreground">Epochs:</span>
                      <span className="font-mono">{job.training_config.epochs ?? "default"}</span>

                      <span className="text-muted-foreground">Batch Size:</span>
                      <span className="font-mono">{job.training_config.batch_size ?? "default"}</span>

                      <span className="text-muted-foreground">LoRA Rank:</span>
                      <span className="font-mono">{job.training_config.lora_rank ?? "default"}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Training Metrics Section */}
              {job.dataset_id && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      Training Metrics
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={handleRefreshMetrics}
                      disabled={isLoadingEvals || isRefreshingEvals}
                    >
                      <RefreshCw className={cn("h-3 w-3", isRefreshingEvals && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>
                  {isLoadingEvals ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading evaluation metrics...
                    </div>
                  ) : evalsError ? (
                    <div className="text-xs text-muted-foreground py-2">
                      {evalsError.includes('404') ? 'No evaluation metrics available yet' : evalsError}
                    </div>
                  ) : evalResults && evalResults.results.length > 0 ? (
                    <div className="space-y-4">
                      {/* Quick Summary */}
                      <EpochSummary results={evalResults.results} />

                      {/* Detailed Charts & Breakdown */}
                      <TrainingMetricsChart results={evalResults.results} />
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-2">
                      No evaluation metrics available yet
                    </div>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
