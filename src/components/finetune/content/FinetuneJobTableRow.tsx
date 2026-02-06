/**
 * FinetuneJobTableRow
 *
 * Expandable table row component for displaying a finetune job.
 */

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  StopCircle,
  Play,
  Clock,
} from "lucide-react";
import {
  FinetuneJob,
  cancelReinforcementJob,
  resumeReinforcementJob,
} from "@/services/finetune-api";
import { toast } from "sonner";
import { FinetuneJobStatusBadge } from "../FinetuneJobStatusBadge";
import { JobExpandedContent } from "./JobExpandedContent";
import { formatFinetuneJobDate, formatDuration, getModelDisplayName } from "./utils";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";

interface FinetuneJobTableRowProps {
  job: FinetuneJob;
  onJobAction?: () => void;
}

export function FinetuneJobTableRow({ job, onJobAction }: FinetuneJobTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isRefreshingEvals, setIsRefreshingEvals] = useState(false);

  const canCancel = job.status === 'pending' || job.status === 'running';
  const canResume = job.status === 'cancelled';
  const isActive = job.status === 'pending' || job.status === 'running';

  // Get evaluations from context (single polling instance)
  const { getJobEvaluations, refreshJobEvaluations } = FinetuneJobsConsumer();
  const {
    data: evalResults,
    isLoading: isLoadingEvals,
    error: evalsError,
  } = isExpanded ? getJobEvaluations(job.id) : { data: null, isLoading: false, error: null };

  // Manual refresh handler with local refreshing state
  const handleRefreshMetrics = useCallback(() => {
    setIsRefreshingEvals(true);
    refreshJobEvaluations(job.id);
    // Clear refreshing state after a short delay (context doesn't track refresh separately)
    setTimeout(() => setIsRefreshingEvals(false), 1000);
  }, [job.id, refreshJobEvaluations]);

  // Listen for expand event from FinetuneJobCard
  useEffect(() => {
    const handleExpandJob = (event: CustomEvent<{ jobId: string }>) => {
      if (event.detail.jobId === job.id) {
        setIsExpanded(true);
      }
    };

    window.addEventListener('finetune-expand-job', handleExpandJob as EventListener);
    return () => {
      window.removeEventListener('finetune-expand-job', handleExpandJob as EventListener);
    };
  }, [job.id]);

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
        <JobExpandedContent
          job={job}
          evalResults={evalResults}
          isLoadingEvals={isLoadingEvals}
          isRefreshingEvals={isRefreshingEvals}
          evalsError={evalsError}
          onRefreshMetrics={handleRefreshMetrics}
        />
      )}
    </>
  );
}
