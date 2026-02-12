/**
 * FinetuneJobsPanel
 *
 * Split view for finetune jobs: job detail on left, job list sidebar on right.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { formatFinetuneJobDate, getModelDisplayName } from "../utils";
import { cn } from "@/lib/utils";
import { JobDetailPanel } from "./JobDetailPanel";
import { StatusIcon } from "./StatusIcon";

export function FinetuneJobsPanel() {
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
          <JobDetailPanel job={selectedJob} />
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
      <div className="w-40 shrink-0 flex flex-col min-h-0 bg-zinc-900/30">
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
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
