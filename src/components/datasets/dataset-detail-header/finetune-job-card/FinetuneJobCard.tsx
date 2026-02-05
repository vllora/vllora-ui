/**
 * FinetuneJobCard
 *
 * Shows the latest finetune job status or a CTA to start training.
 * Uses FinetuneJobsContext to get job data.
 */

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useFinetuneJobs } from "@/contexts/FinetuneJobsContext";
import { EmptyState } from "./EmptyState";
import { JobStatusCard } from "./JobStatusCard";

export interface FinetuneJobCardProps {
  /** Click handler for empty state (start finetune) */
  onStartClick?: () => void;
  /** Click handler for job card (view details), receives job ID */
  onJobClick?: (jobId?: string) => void;
  /** Whether the dataset has enough records */
  canStartJob?: boolean;
}

export function FinetuneJobCard({
  onStartClick,
  onJobClick,
  canStartJob = true,
}: FinetuneJobCardProps) {
  const { filteredJobs, isLoading } = useFinetuneJobs();

  // Get the most recent job
  const latestJob = useMemo(() => {
    if (filteredJobs.length === 0) return null;
    return [...filteredJobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [filteredJobs]);

  // Show loading state
  if (isLoading && filteredJobs.length === 0) {
    return (
      <div className="px-4 py-3 rounded-lg bg-muted/50 min-h-[88px] flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // No jobs yet - show empty state with CTA
  if (!latestJob) {
    return <EmptyState onStartClick={onStartClick} canStartJob={canStartJob} />;
  }

  // Show job status
  return <JobStatusCard job={latestJob} onClick={() => onJobClick?.(latestJob.id)} />;
}
