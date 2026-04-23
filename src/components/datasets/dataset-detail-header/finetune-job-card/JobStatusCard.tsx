/**
 * JobStatusCard
 *
 * Displays the status and progress of a finetune job.
 */

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFinetuneJobDate, computeTrainingSummary } from "@/components/finetune/content/utils";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { STATUS_CONFIG } from "./constants";
import { CardHeader } from "../CardHeader";

interface JobStatusCardProps {
  onClick?: () => void;
}

export function JobStatusCard({ onClick }: JobStatusCardProps) {
  // Get latest job and evaluations from context
  const { latestJob, getJobEvaluations } = FinetuneJobsConsumer();

  // Early return if no job (shouldn't happen if parent checks)
  if (!latestJob) return null;

  const job = latestJob;
  const config = STATUS_CONFIG[job.status];
  const Icon = config.icon;
  const isActive = job.status === "pending" || job.status === "running";
  const isSucceeded = job.status === "succeeded";

  const { data: evalResults } = getJobEvaluations(job.id);

  // Compute training summary from evaluation results
  const trainingSummary = useMemo(() => {
    if (!evalResults || evalResults.results.length === 0) return null;
    return computeTrainingSummary(evalResults.results);
  }, [evalResults]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full flex flex-col px-4 py-3 rounded-lg min-h-[88px] overflow-hidden text-left",
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

      <CardHeader label="Training" />

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
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-400 border border-zinc-700/30">
              {job.base_model}
            </span>
          </div>
          {/* Show training progress for running jobs */}
          {isActive && trainingSummary ? (
            <div className="flex flex-col gap-0.5 mt-0.5">
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span>
                  <span className="text-zinc-500">Rows:</span>{" "}
                  <span className="font-mono">{trainingSummary.totalRows}</span>
                </span>
                <span>
                  <span className="text-zinc-500">Epoch:</span>{" "}
                  <span className="font-mono">{trainingSummary.latestEpoch ?? 0}</span>
                </span>
                {trainingSummary.latestAvgScore !== null && (
                  <span>
                    <span className="text-zinc-500">Avg:</span>{" "}
                    <span className={cn(
                      "font-mono",
                      trainingSummary.latestAvgScore >= 0.7
                        ? "text-green-400"
                        : trainingSummary.latestAvgScore >= 0.4
                        ? "text-yellow-400"
                        : "text-red-400"
                    )}>
                      {trainingSummary.latestAvgScore.toFixed(2)}
                    </span>
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-500">
                Started {formatFinetuneJobDate(job.created_at)}
              </span>
            </div>
          ) : isSucceeded && trainingSummary ? (
            <div className="flex flex-col gap-0.5 mt-0.5">
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span>
                  <span className="text-zinc-500">Epochs:</span>{" "}
                  <span className="font-mono">{trainingSummary.latestEpoch ?? 0}</span>
                </span>
                {trainingSummary.latestAvgScore !== null && (
                  <span>
                    <span className="text-zinc-500">Final Avg:</span>{" "}
                    <span className={cn(
                      "font-mono",
                      trainingSummary.latestAvgScore >= 0.7
                        ? "text-green-400"
                        : trainingSummary.latestAvgScore >= 0.4
                        ? "text-yellow-400"
                        : "text-red-400"
                    )}>
                      {trainingSummary.latestAvgScore.toFixed(2)}
                    </span>
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-500">
                Started {formatFinetuneJobDate(job.created_at)}
              </span>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 truncate mt-0.5">
              {job.status === "succeeded" && job.fine_tuned_model
                ? `Model: ${job.fine_tuned_model}`
                : job.status === "failed" && job.error_message
                ? job.error_message
                : `Started ${formatFinetuneJobDate(job.created_at)}`
              }
            </p>
          )}
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
