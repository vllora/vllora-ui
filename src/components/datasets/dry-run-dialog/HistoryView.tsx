/**
 * HistoryView
 *
 * Displays the history of dry run jobs for the current dataset.
 */

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, XCircle, History, Clock } from "lucide-react";
import { VerdictBadge } from "./VerdictBadge";
import { cn } from "@/lib/utils";
import type { DryRunJob } from "@/types/dry-run-job";
import { getJobTotalRows, getJobCompletedRows } from "@/types/dry-run-job";

interface HistoryViewProps {
  jobs: DryRunJob[];
  onSelectJob: (job: DryRunJob) => void;
  onBack: () => void;
}

export function HistoryView({ jobs, onSelectJob, onBack }: HistoryViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Dry Run History</span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {jobs.map((job) => (
          <button
            key={job.id}
            className={cn(
              "w-full text-left p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors",
              job.status === "running" && "border-blue-500/50"
            )}
            onClick={() => job.status === "completed" && onSelectJob(job)}
            disabled={job.status !== "completed"}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {job.status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : job.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : job.status === "failed" ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {job.sampleSize} samples
                </span>
              </div>
              {job.result && (
                <VerdictBadge verdict={job.result.diagnosis.verdict} />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span>{new Date(job.createdAt).toLocaleString()}</span>
              {job.status === "running" && (
                <span>{getJobCompletedRows(job)} / {getJobTotalRows(job)}</span>
              )}
              {job.status === "failed" && job.error && (
                <span className="text-red-500 truncate max-w-[200px]">{job.error}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <Separator />

      <div className="flex justify-start">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
