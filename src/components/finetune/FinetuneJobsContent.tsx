/**
 * FinetuneJobsContent
 *
 * Inline content for displaying finetune jobs within a tab.
 * Extracted from FinetuneJobsPanel for use as tab content.
 */

import { useFinetuneJobs } from "@/contexts/FinetuneJobsContext";
import { FinetuneJobStatusBadge } from "./FinetuneJobStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { FinetuneJob } from "@/services/finetune-api";
import { formatDistanceToNow } from "date-fns";

function formatDate(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

function JobItem({ job }: { job: FinetuneJob }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-start gap-3 hover:bg-accent/50 transition-colors text-left">
            <div className="mt-0.5">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm truncate">
                  {job.base_model}
                </span>
                <FinetuneJobStatusBadge status={job.status} />
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(job.created_at)}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-2 text-sm border-t">
            <div className="pt-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <span className="text-muted-foreground">Provider:</span>
                <span className="font-mono">{job.provider}</span>

                <span className="text-muted-foreground">Job ID:</span>
                <span className="font-mono truncate" title={job.provider_job_id}>
                  {job.provider_job_id}
                </span>

                {job.fine_tuned_model && (
                  <>
                    <span className="text-muted-foreground">Output Model:</span>
                    <span className="font-mono truncate text-green-600" title={job.fine_tuned_model}>
                      {job.fine_tuned_model}
                    </span>
                  </>
                )}

                {job.training_config && (
                  <>
                    <span className="text-muted-foreground">Epochs:</span>
                    <span>{job.training_config.epochs ?? "N/A"}</span>

                    <span className="text-muted-foreground">Batch Size:</span>
                    <span>{job.training_config.batch_size ?? "N/A"}</span>

                    <span className="text-muted-foreground">Learning Rate:</span>
                    <span>{job.training_config.learning_rate ?? "N/A"}</span>
                  </>
                )}

                {job.completed_at && (
                  <>
                    <span className="text-muted-foreground">Completed:</span>
                    <span>{formatDate(job.completed_at)}</span>
                  </>
                )}
              </div>
            </div>

            {job.error_message && (
              <div className="flex items-start gap-2 p-2 bg-red-50 text-red-800 rounded text-xs">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{job.error_message}</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function FinetuneJobsContent() {
  const {
    filteredJobs,
    isLoading,
    error,
    loadJobs,
  } = useFinetuneJobs();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Finetune Jobs</span>
          {filteredJobs.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({filteredJobs.length})
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => loadJobs()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && filteredJobs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 text-sm text-red-600 bg-red-50 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No finetune jobs yet</p>
            <p className="text-xs mt-1 max-w-xs mx-auto">
              Start a finetune job using the Finetune button to see your jobs here
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {filteredJobs.map((job) => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
