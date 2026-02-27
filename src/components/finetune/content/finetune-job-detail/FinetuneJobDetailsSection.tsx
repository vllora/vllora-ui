/**
 * FinetuneJobDetailsSection
 *
 * Compact horizontal metadata strip showing provider, job ID, output model,
 * batch size, and LoRA rank separated by subtle dividers.
 */

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import type { FinetuneJob } from "@/services/finetune-api";

/** Truncate a long ID to first + last characters with ellipsis */
function truncateId(id: string, headLen = 6, tailLen = 4): string {
  if (id.length <= headLen + tailLen + 3) return id;
  return `${id.slice(0, headLen)}…${id.slice(-tailLen)}`;
}

function CopyButton({
  text,
}: {
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-white/5"
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 text-[#10b981]" />
      ) : (
        <Copy className="h-2.5 w-2.5" />
      )}
    </button>
  );
}

interface FinetuneJobDetailsSectionProps {
  job: FinetuneJob;
}

export function FinetuneJobDetailsSection({ job }: FinetuneJobDetailsSectionProps) {
  const items: React.ReactNode[] = [];

  items.push(
    <span key="provider" className="flex items-center gap-1.5">
      <span className="text-slate-500">Provider</span>
      <span className="text-slate-300">{job.provider}</span>
    </span>
  );

  items.push(
    <span key="job-id" className="flex items-center gap-1">
      <span className="text-slate-500">Job</span>
      <span className="font-mono text-slate-300" title={job.provider_job_id}>
        {truncateId(job.provider_job_id)}
      </span>
      <CopyButton text={job.provider_job_id} />
    </span>
  );

  if (job.fine_tuned_model) {
    items.push(
      <span key="model" className="flex items-center gap-1">
        <span className="text-slate-500">Model</span>
        <span className="font-mono text-[#10b981]" title={job.fine_tuned_model}>
          {truncateId(job.fine_tuned_model, 8, 6)}
        </span>
        <CopyButton text={job.fine_tuned_model} />
      </span>
    );
  }

  if (job.training_config?.batch_size != null) {
    items.push(
      <span key="batch" className="flex items-center gap-1.5">
        <span className="text-slate-500">Batch</span>
        <span className="text-slate-300">{job.training_config.batch_size}</span>
      </span>
    );
  }

  if (job.training_config?.lora_rank != null) {
    items.push(
      <span key="lora" className="flex items-center gap-1.5">
        <span className="text-slate-500">LoRA</span>
        <span className="text-slate-300">{job.training_config.lora_rank}</span>
      </span>
    );
  }

  if (job.training_config?.learning_rate != null) {
    items.push(
      <span key="lr" className="flex items-center gap-1.5">
        <span className="text-slate-500">LR</span>
        <span className="font-mono text-slate-300">{job.training_config.learning_rate}</span>
      </span>
    );
  }

  return (
    <div className="flex items-center flex-wrap gap-y-1 text-[11px]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span className="mx-2 text-slate-600">·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}
