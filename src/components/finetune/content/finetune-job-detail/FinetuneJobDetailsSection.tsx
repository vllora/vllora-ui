/**
 * FinetuneJobDetailsSection
 *
 * Compact horizontal metadata strip showing provider, job ID, output model,
 * batch size, and LoRA rank separated by subtle dividers.
 */

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import type { FinetuneJob } from "@/services/finetune-api";
import { parseFinetuneJobDate } from "../utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Format duration between two ISO timestamps as "2h 15m" or "45m" or "12s" */
function computeDuration(startIso: string, endIso?: string): string | null {
  if (!endIso) return null;
  const ms = parseFinetuneJobDate(endIso).getTime() - parseFinetuneJobDate(startIso).getTime();
  if (ms < 0 || !isFinite(ms)) return null;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

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

  if (job.training_config?.epochs != null) {
    items.push(
      <span key="epochs" className="flex items-center gap-1.5">
        <span className="text-slate-500">Epochs</span>
        <span className="text-slate-300">{job.training_config.epochs}</span>
      </span>
    );
  }

  if (job.training_config?.gradient_accumulation_steps != null) {
    items.push(
      <span key="gas" className="flex items-center gap-1.5">
        <span className="text-slate-500">GAS</span>
        <span className="text-slate-300">{job.training_config.gradient_accumulation_steps}</span>
      </span>
    );
  }

  if (job.inference_parameters?.response_candidates_count != null) {
    items.push(
      <span key="g" className="flex items-center gap-1.5">
        <span className="text-slate-500">G</span>
        <span className="text-slate-300">{job.inference_parameters.response_candidates_count}</span>
      </span>
    );
  }

  // Training duration
  const duration = computeDuration(job.created_at, job.completed_at ?? (job.status === "running" ? new Date().toISOString() : undefined));
  if (duration) {
    items.push(
      <span key="duration" className="flex items-center gap-1.5">
        <span className="text-slate-500">{job.status === "running" ? "Elapsed" : "Duration"}</span>
        <span className="text-slate-300">{duration}</span>
      </span>
    );
  }

  const tooltipRows: Array<{ label: string; value: string; desc: string; sources?: Array<{ name: string; url: string }> }> = [];
  if (job.provider) tooltipRows.push({ label: "Provider", value: job.provider, desc: "Infrastructure provider running the training job" });
  if (job.training_config?.batch_size != null) tooltipRows.push({ label: "Batch", value: String(job.training_config.batch_size), desc: "Prompts per micro-batch. Total sequences per step = Batch × G", sources: [{ name: "DeepSeek-R1", url: "https://arxiv.org/abs/2501.12948" }, { name: "DAPO", url: "https://arxiv.org/abs/2503.14476" }] });
  if (job.training_config?.lora_rank != null) tooltipRows.push({ label: "LoRA", value: String(job.training_config.lora_rank), desc: "Low-Rank Adaptation rank. Higher = more capacity, more memory. Recommended: 16–64", sources: [{ name: "verl docs", url: "https://verl.readthedocs.io/en/latest/advance/ppo_lora.html" }] });
  if (job.training_config?.learning_rate != null) tooltipRows.push({ label: "LR", value: String(job.training_config.learning_rate), desc: "Optimizer step size. GRPO uses 10–20× lower than SFT. Typical: 1e-6 to 5e-6", sources: [{ name: "Dr. GRPO", url: "https://arxiv.org/abs/2503.20783" }, { name: "DAPO", url: "https://arxiv.org/abs/2503.14476" }] });
  if (job.training_config?.epochs != null) tooltipRows.push({ label: "Epochs", value: String(job.training_config.epochs), desc: "Passes over all prompts. Each pass re-samples fresh completions, so data is never exactly repeated", sources: [{ name: "OpenAI RFT", url: "https://platform.openai.com/docs/guides/reinforcement-fine-tuning" }] });
  if (job.training_config?.gradient_accumulation_steps != null) tooltipRows.push({ label: "GAS", value: String(job.training_config.gradient_accumulation_steps), desc: "Mini-batches accumulated before each weight update. Effective batch = Batch × GAS × num_GPUs", sources: [{ name: "TRL", url: "https://huggingface.co/docs/trl/main/en/grpo_trainer" }, { name: "DAPO", url: "https://arxiv.org/abs/2503.14476" }] });
  if (job.inference_parameters?.response_candidates_count != null) tooltipRows.push({ label: "G", value: String(job.inference_parameters.response_candidates_count), desc: "Completions sampled per prompt for group-relative advantage. Min: 2, typical: 8–16", sources: [{ name: "DeepSeek-R1", url: "https://arxiv.org/abs/2501.12948" }, { name: "TRL", url: "https://huggingface.co/docs/trl/main/en/grpo_trainer" }] });

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center flex-wrap gap-y-1 text-[11px] cursor-help">
            {items.map((item, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && <span className="mx-2 text-slate-600">·</span>}
                {item}
              </span>
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="w-max max-w-[600px] p-3">
          <p className="text-[11px] font-semibold text-zinc-200 mb-2">Training Configuration</p>
          <table className="text-[10px] w-full">
            <tbody>
              {tooltipRows.map((row) => (
                <tr key={row.label} className="border-t border-zinc-800/50">
                  <td className="py-1.5 pr-3 text-zinc-400 font-medium whitespace-nowrap align-top">{row.label}</td>
                  <td className="py-1.5 pr-3 font-mono text-zinc-200 whitespace-nowrap align-top">{row.value}</td>
                  <td className="py-1.5 text-zinc-500 align-top">
                    {row.desc}
                    {row.sources && row.sources.length > 0 && (
                      <span className="ml-1.5">
                        {row.sources.map((src, i) => (
                          <span key={src.name}>
                            {i > 0 && <span className="text-zinc-700">, </span>}
                            <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline" onClick={(e) => e.stopPropagation()}>{src.name}</a>
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
