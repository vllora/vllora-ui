/**
 * RunsSidebar
 *
 * Narrow sidebar listing dry-run job history.
 * Used in the split view layout (left: job detail, right: this sidebar).
 */

import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvalJob } from "@/types/eval-job";

interface RunsSidebarProps {
  jobs: EvalJob[];
  selectedId: string | null;
  onSelectJob: (jobId: string) => void;
}

function StatusIcon({ status }: { status: EvalJob["status"] }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  if (status === "cancelled") return <XCircle className="h-3.5 w-3.5 text-zinc-500" />;
  return <Clock className="h-3.5 w-3.5 text-zinc-500" />;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RunsSidebar({ jobs, selectedId, onSelectJob }: RunsSidebarProps) {
  return (
    <div className="w-40 shrink-0 flex flex-col min-h-0 bg-zinc-900/30">
      <div className="shrink-0 px-2 py-1.5 border-b border-zinc-800/60">
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          Runs
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {jobs.map((job) => {
          const isSelected = job.id === selectedId;
          const meanScore = job.result?.statistics?.mean;
          return (
            <button
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className={cn(
                "w-full text-left px-2 py-1.5 flex items-center gap-2 text-xs transition-colors border-l-2",
                isSelected
                  ? "bg-zinc-800/60 border-l-[rgb(var(--theme-500))] text-zinc-200"
                  : "border-l-transparent text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300"
              )}
            >
              <StatusIcon status={job.status} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {job.rolloutModel || `${job.sampleSize} samples`}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  <span>{job.sampleSize}s</span>
                  {meanScore !== undefined && (
                    <span className="font-mono ml-1">{meanScore.toFixed(2)}</span>
                  )}
                  <span className="text-zinc-600 ml-1">{formatTime(job.createdAt)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
