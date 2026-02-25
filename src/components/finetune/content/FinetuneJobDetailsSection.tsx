/**
 * FinetuneJobDetailsSection
 *
 * Displays job details and hyperparameters for a finetune job.
 * Rendered inside the collapsible "Details" panel of JobDetailPanel.
 */

import { useState, useCallback } from "react";
import { FinetuneJob, getWeightsDownloadUrl } from "@/services/finetune-api";
import { formatFinetuneJobDate, triggerFileDownload } from "./utils";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FinetuneJobDetailsSectionProps {
  job: FinetuneJob;
  hideDownload?: boolean;
}

/** Key-value row for the details grid */
function DetailRow({ label, value, mono, className }: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <>
      <span className="text-zinc-500 text-[11px]">{label}</span>
      <span
        className={`text-[11px] truncate ${mono ? "font-mono" : ""} ${className ?? "text-zinc-300"}`}
        title={value}
      >
        {value}
      </span>
    </>
  );
}

export function FinetuneJobDetailsSection({ job, hideDownload }: FinetuneJobDetailsSectionProps) {
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
    <div className="grid grid-cols-2 gap-x-6 gap-y-0">
      {/* Left Column - Job Info */}
      <div className="space-y-1.5">
        <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Job Info
        </h4>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <DetailRow label="Provider" value={job.provider} mono />
          <DetailRow label="Job ID" value={job.provider_job_id} mono />
          {job.fine_tuned_model && (
            <DetailRow
              label="Output Model"
              value={job.fine_tuned_model}
              mono
              className="text-emerald-400"
            />
          )}
          {job.completed_at && (
            <DetailRow label="Completed" value={formatFinetuneJobDate(job.completed_at)} />
          )}
        </div>
      </div>

      {/* Right Column - Hyperparameters */}
      {job.training_config && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Hyperparameters
          </h4>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <DetailRow
              label="Learning Rate"
              value={String(job.training_config.learning_rate ?? "default")}
              mono
            />
            <DetailRow
              label="Epochs"
              value={String(job.training_config.epochs ?? "default")}
              mono
            />
            <DetailRow
              label="Batch Size"
              value={String(job.training_config.batch_size ?? "default")}
              mono
            />
            <DetailRow
              label="LoRA Rank"
              value={String(job.training_config.lora_rank ?? "default")}
              mono
            />
          </div>
        </div>
      )}

      {/* Download Weights - spans both columns for succeeded jobs */}
      {!hideDownload && job.status === 'succeeded' && (
        <div className="col-span-2 pt-2 mt-2 border-t border-zinc-800/60">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs h-7 border-zinc-700/60 hover:bg-zinc-800/50"
            onClick={handleDownloadWeights}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download Weights
          </Button>
        </div>
      )}
    </div>
  );
}
