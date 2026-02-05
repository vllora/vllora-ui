/**
 * FinetuneJobCard
 *
 * Shows the latest finetune job status or a CTA to start training.
 * Uses FinetuneJobsContext to get job data.
 */

import { useMemo } from "react";
import { Cpu, Play, CheckCircle, XCircle, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFinetuneJobs } from "@/contexts/FinetuneJobsContext";
import type { FinetuneJob, FinetuneJobStatus } from "@/services/finetune-api";
import { formatFinetuneJobDate } from "@/components/finetune/content/utils";

export interface FinetuneJobCardProps {
  /** Click handler for empty state (start finetune) */
  onStartClick?: () => void;
  /** Click handler for job card (view details) */
  onJobClick?: () => void;
  /** Whether the dataset has enough records */
  canStartJob?: boolean;
}

const STATUS_CONFIG: Record<FinetuneJobStatus, {
  label: string;
  icon: typeof Loader2;
  color: string;
  bgGradient: string;
  iconColor: string;
  animate?: boolean;
}> = {
  pending: {
    label: "Pending",
    icon: Loader2,
    color: "text-amber-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-amber-950/20",
    iconColor: "text-amber-400",
    animate: true,
  },
  running: {
    label: "Training",
    icon: Cpu,
    color: "text-blue-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-blue-950/20",
    iconColor: "text-blue-400",
    animate: true,
  },
  succeeded: {
    label: "Completed",
    icon: CheckCircle,
    color: "text-emerald-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-emerald-950/20",
    iconColor: "text-emerald-400",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-red-950/20",
    iconColor: "text-red-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-zinc-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-zinc-800/50",
    iconColor: "text-zinc-400",
  },
};

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
  return <JobStatusCard job={latestJob} onClick={onJobClick} />;
}

function EmptyState({ onStartClick, canStartJob }: { onStartClick?: () => void; canStartJob: boolean }) {
  return (
    <button
      onClick={onStartClick}
      disabled={!canStartJob}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        "bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-800/50",
        "border border-zinc-800/80 border-dashed",
        canStartJob && "hover:border-violet-600/40 hover:from-zinc-900/95 hover:via-zinc-800/80 hover:to-violet-950/20",
        "transition-all duration-300",
        canStartJob ? "cursor-pointer" : "cursor-not-allowed opacity-60"
      )}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "16px 16px",
          }}
        />
      </div>

      {/* Glow effect on hover */}
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-zinc-800/50 border border-zinc-700/50",
            canStartJob && "group-hover:bg-violet-950/30 group-hover:border-violet-700/30",
            "transition-all duration-300"
          )}
        >
          <Play
            className={cn(
              "w-5 h-5 text-zinc-500",
              canStartJob && "group-hover:text-violet-400",
              "transition-colors duration-300"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn(
              "text-sm font-medium text-zinc-300",
              canStartJob && "group-hover:text-zinc-200",
              "transition-colors"
            )}>
              Start fine-tuning
            </span>
            {canStartJob && (
              <Sparkles className="w-3 h-3 text-amber-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <p className={cn(
            "text-xs text-zinc-500",
            canStartJob && "group-hover:text-zinc-400",
            "transition-colors"
          )}>
            {canStartJob
              ? "Train a custom model on your dataset"
              : "Add records to start training"
            }
          </p>
        </div>

        {/* Arrow indicator */}
        {canStartJob && (
          <ArrowRight
            className={cn(
              "w-4 h-4 text-zinc-600",
              "opacity-0 -translate-x-2",
              "group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-violet-400",
              "transition-all duration-300"
            )}
          />
        )}
      </div>
    </button>
  );
}

function JobStatusCard({ job, onClick }: { job: FinetuneJob; onClick?: () => void }) {
  const config = STATUS_CONFIG[job.status];
  const Icon = config.icon;
  const isActive = job.status === "pending" || job.status === "running";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full px-4 py-3 rounded-lg min-h-[88px] overflow-hidden",
        `bg-gradient-to-br ${config.bgGradient}`,
        "border border-zinc-800/60",
        "hover:border-zinc-700/60",
        "transition-all duration-300 cursor-pointer"
      )}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "16px 16px",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Icon container */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg",
            "bg-zinc-800/50 border border-zinc-700/50",
            "transition-all duration-300"
          )}
        >
          <Icon
            className={cn(
              "w-5 h-5",
              config.iconColor,
              config.animate && "animate-spin"
            )}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium", config.color)}>
              {config.label}
            </span>
            {isActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-400 border border-zinc-700/30">
                {job.base_model}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate mt-0.5">
            {job.status === "succeeded" && job.fine_tuned_model
              ? `Model: ${job.fine_tuned_model}`
              : job.status === "failed" && job.error_message
              ? job.error_message
              : `Started ${formatFinetuneJobDate(job.created_at)}`
            }
          </p>
        </div>

        {/* Arrow indicator */}
        <ArrowRight
          className={cn(
            "w-4 h-4 text-zinc-600 flex-shrink-0",
            "opacity-0 -translate-x-2",
            "group-hover:opacity-100 group-hover:translate-x-0",
            `group-hover:${config.color}`,
            "transition-all duration-300"
          )}
        />
      </div>
    </button>
  );
}
