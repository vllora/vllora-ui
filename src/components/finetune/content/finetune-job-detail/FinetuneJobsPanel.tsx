/**
 * FinetuneJobsPanel
 *
 * Split view for finetune jobs: job detail on left, job list sidebar on right.
 */

import { useEffect, useMemo, useState } from "react";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { JobDetailPanel } from "./JobDetailPanel";

const OPEN_FINETUNE_JOB_EVENT = "vllora_select_finetune_job";

export function FinetuneJobsPanel() {
  const { filteredJobs } = FinetuneJobsConsumer();
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

  // Allow Overview activity timeline to navigate and open a specific finetune job.
  useEffect(() => {
    const handleSelectFinetuneJob = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string }>).detail;
      if (!detail?.jobId) return;
      setSelectedJobId(detail.jobId);
    };

    window.addEventListener(OPEN_FINETUNE_JOB_EVENT, handleSelectFinetuneJob as EventListener);
    return () => {
      window.removeEventListener(OPEN_FINETUNE_JOB_EVENT, handleSelectFinetuneJob as EventListener);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <div className="flex-1 min-w-0 min-h-0">
        {selectedJob ? (
          <JobDetailPanel job={selectedJob} />
        ) : filteredJobs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">
            No finetune jobs yet. Click "New Job" above to start training.
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">
            Select a job from the list
          </div>
        )}
      </div>
    </div>
  );
}
