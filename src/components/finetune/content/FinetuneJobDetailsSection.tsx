/**
 * FinetuneJobDetailsSection
 *
 * Displays job details and hyperparameters for a finetune job.
 */

import { useState, useCallback } from "react";
import { FinetuneJob, getWeightsDownloadUrl } from "@/services/finetune-api";
import { formatFinetuneJobDate, triggerFileDownload } from "./utils";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FinetuneJobDetailsSectionProps {
  job: FinetuneJob;
}

export function FinetuneJobDetailsSection({ job }: FinetuneJobDetailsSectionProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadWeights = useCallback(async () => {
    setIsDownloading(true);
    try {
      const { download_url } = await getWeightsDownloadUrl(job.provider_job_id);
      triggerFileDownload(download_url, `weights-${job.provider_job_id}.tar.gz`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to get download URL');
    } finally {
      setIsDownloading(false);
    }
  }, [job.provider_job_id]);

  return (
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
              <span className="font-mono text-green-500 truncate" title={job.fine_tuned_model}>
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

      {/* Download Weights - spans both columns for succeeded jobs */}
      {job.status === 'succeeded' && (
        <div className="col-span-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleDownloadWeights}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download Weights
          </Button>
        </div>
      )}
    </div>
  );
}
