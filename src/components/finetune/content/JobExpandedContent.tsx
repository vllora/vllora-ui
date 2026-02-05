/**
 * JobExpandedContent
 *
 * Expanded content panel for a finetune job showing details, hyperparameters, and training metrics.
 */

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { FinetuneJob, FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { TrainingMetricsChart } from "../TrainingMetricsChart";
import { EpochSummary } from "./EpochSummary";
import { formatFinetuneJobDate } from "./utils";

interface JobExpandedContentProps {
  job: FinetuneJob;
  evalResults: FinetuneEvalResultsResponse | null;
  isLoadingEvals: boolean;
  isRefreshingEvals: boolean;
  evalsError: string | null;
  onRefreshMetrics: () => void;
}

export function JobExpandedContent({
  job,
  evalResults,
  isLoadingEvals,
  isRefreshingEvals,
  evalsError,
  onRefreshMetrics,
}: JobExpandedContentProps) {
  return (
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
                  onClick={onRefreshMetrics}
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
  );
}
