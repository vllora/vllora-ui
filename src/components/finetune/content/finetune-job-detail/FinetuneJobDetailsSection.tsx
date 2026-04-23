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
  currentStep?: number;
  maxSteps?: number;
}

export function FinetuneJobDetailsSection({ job, currentStep, maxSteps }: FinetuneJobDetailsSectionProps) {
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
        <span className="text-slate-500">Learning Rate</span>
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
        <span className="text-slate-500">Grad. Accum. Steps</span>
        <span className="text-slate-300">{job.training_config.gradient_accumulation_steps}</span>
      </span>
    );
  }

  if (job.inference_parameters?.response_candidates_count != null) {
    items.push(
      <span key="g" className="flex items-center gap-1.5">
        <span className="text-slate-500">Generations</span>
        <span className="text-slate-300">{job.inference_parameters.response_candidates_count}</span>
      </span>
    );
  }

  if (job.training_config?.beta != null) {
    items.push(
      <span key="beta" className="flex items-center gap-1.5">
        <span className="text-slate-500">Beta</span>
        <span className="text-slate-300">{job.training_config.beta}</span>
      </span>
    );
  }

  if (job.inference_parameters?.max_output_tokens != null) {
    items.push(
      <span key="max-tokens" className="flex items-center gap-1.5">
        <span className="text-slate-500">Max Tokens</span>
        <span className="text-slate-300">{job.inference_parameters.max_output_tokens}</span>
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

  // ETA — compute from elapsed time and step progress
  if (job.status === "running" && currentStep && maxSteps && currentStep > 0 && currentStep < maxSteps) {
    const elapsedMs = Date.now() - parseFinetuneJobDate(job.created_at).getTime();
    const msPerStep = elapsedMs / currentStep;
    const remainingMs = msPerStep * (maxSteps - currentStep);
    const remainingSec = Math.floor(remainingMs / 1000);
    let etaStr: string;
    if (remainingSec < 60) etaStr = `~${remainingSec}s`;
    else if (remainingSec < 3600) etaStr = `~${Math.ceil(remainingSec / 60)}m`;
    else {
      const h = Math.floor(remainingSec / 3600);
      const m = Math.ceil((remainingSec % 3600) / 60);
      etaStr = m > 0 ? `~${h}h ${m}m` : `~${h}h`;
    }
    items.push(
      <span key="eta" className="flex items-center gap-1.5">
        <span className="text-amber-500">ETA</span>
        <span className="text-amber-400">{etaStr}</span>
      </span>
    );
  }

  const tooltipRows: Array<{ label: string; value: string; desc: string; sources?: Array<{ name: string; url: string }> }> = [];
  if (job.provider) tooltipRows.push({ label: "Provider", value: job.provider, desc: "Infrastructure provider running the training job" });
  if (job.training_config?.batch_size != null) tooltipRows.push({ label: "Batch Size", value: String(job.training_config.batch_size), desc: "Completions each GPU processes per step. Effective prompts per update = Batch \u00d7 Grad. Accum. Steps \u00d7 GPUs \u00f7 Generations. Must divide evenly by Generations", sources: [{ name: "TRL GRPOConfig", url: "https://huggingface.co/docs/trl/main/en/grpo_trainer" }, { name: "Unsloth", url: "https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide" }] });
  if (job.training_config?.lora_rank != null) tooltipRows.push({ label: "LoRA Rank", value: String(job.training_config.lora_rank), desc: "Controls how many trainable parameters LoRA adds. Higher = more capacity to learn new behavior but more VRAM. Unsloth recommends \u226532 for GRPO to avoid slow convergence", sources: [{ name: "Unsloth LoRA Guide", url: "https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/lora-hyperparameters-guide" }] });
  if (job.training_config?.learning_rate != null) tooltipRows.push({ label: "Learning Rate", value: String(job.training_config.learning_rate), desc: "How large each weight update is. GRPO needs ~40\u00d7 lower than SFT \u2014 Unsloth recommends 5e-6. Above 1e-5 commonly causes reward collapse", sources: [{ name: "Unsloth RL Guide", url: "https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide" }, { name: "Unsloth LoRA Guide", url: "https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/lora-hyperparameters-guide" }] });
  if (job.training_config?.epochs != null) tooltipRows.push({ label: "Epochs", value: String(job.training_config.epochs), desc: "Full passes through all prompts. GRPO re-samples fresh completions each step, so no two passes see identical data. More epochs = more exploration but higher compute cost", sources: [{ name: "TRL GRPO Trainer", url: "https://huggingface.co/docs/trl/main/en/grpo_trainer" }, { name: "Unsloth RL Guide", url: "https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide" }] });
  if (job.training_config?.gradient_accumulation_steps != null) tooltipRows.push({ label: "Grad. Accum. Steps", value: String(job.training_config.gradient_accumulation_steps), desc: "Mini-batches processed before one weight update. Multiplies effective batch size without increasing VRAM. Effective batch = Batch \u00d7 Grad. Accum. Steps \u00d7 GPUs", sources: [{ name: "TRL GRPOConfig", url: "https://huggingface.co/docs/trl/main/en/grpo_trainer" }, { name: "Unsloth", url: "https://unsloth.ai/blog/gradient" }] });
  if (job.inference_parameters?.response_candidates_count != null) tooltipRows.push({ label: "Generations", value: String(job.inference_parameters.response_candidates_count), desc: "Candidate answers generated per prompt. GRPO compares these to compute which were better or worse (group-relative advantage). Min: 2, typical: 8. Higher = more stable training but linear compute cost", sources: [{ name: "TRL GRPOConfig", url: "https://huggingface.co/docs/trl/main/en/grpo_trainer" }, { name: "Unsloth RL Guide", url: "https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide" }] });
  if (job.training_config?.beta != null) tooltipRows.push({ label: "Beta", value: String(job.training_config.beta), desc: "Penalty for drifting from the original model behavior (KL divergence weight). 0 = no penalty, no reference model loaded (saves VRAM). Standard for GRPO per DAPO and Dr. GRPO. Set >0 only if reward hacking is observed", sources: [{ name: "TRL GRPO Trainer", url: "https://huggingface.co/docs/trl/main/en/grpo_trainer" }, { name: "DAPO", url: "https://arxiv.org/abs/2503.14476" }] });
  if (job.inference_parameters?.max_output_tokens != null) tooltipRows.push({ label: "Max Tokens", value: String(job.inference_parameters.max_output_tokens), desc: "Maximum tokens per generated completion. Truncated completions contribute zero gradient (wasted compute). Watch clipped_ratio metric \u2014 above ~0.2 means this value is too low", sources: [{ name: "TRL GRPOConfig", url: "https://github.com/huggingface/trl/blob/main/trl/trainer/grpo_config.py" }, { name: "Unsloth Advanced RL", url: "https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide/advanced-rl-documentation" }] });

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
