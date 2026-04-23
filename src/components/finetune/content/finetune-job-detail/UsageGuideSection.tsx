/**
 * UsageGuideDialog
 *
 * Info icon button + dialog showing local inference guidance for succeeded
 * finetune jobs. Placed next to the "Weights" download button in the header.
 */

import { useState, useCallback } from "react";
import { Info, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface UsageGuideDialogProps {
  jobId: string;
  baseModel: string;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label ? `Copied ${label}` : "Copied");
    setTimeout(() => setCopied(false), 1500);
  }, [text, label]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
    >
      {copied ? (
        <Check className="h-3 w-3 text-[rgb(var(--theme-500))]" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function CodeSnippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <CopyButton text={code} label={label} />
      </div>
      <pre className="px-3 py-2.5 text-xs font-mono text-foreground overflow-x-auto bg-muted/20">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function UsageGuideDialog({ jobId, baseModel }: UsageGuideDialogProps) {
  const [open, setOpen] = useState(false);

  const extractSnippet = `tar -xzf weights-${jobId}.tar.gz`;

  const inferenceSnippet = `from vllm import LLM, SamplingParams
from vllm.lora.request import LoRARequest

llm = LLM(
    model="${baseModel}",
    enable_lora=True,
    max_lora_rank=64,
    dtype="bfloat16",
)

output = llm.generate(
    ["Explain what machine learning is in one sentence."],
    SamplingParams(max_tokens=256, temperature=0.7),
    lora_request=LoRARequest("adapter", 1, "./weights-${jobId}"),
)
print(output[0].outputs[0].text)`;

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen(true)}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-white/5"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            How to use your model
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" overlayClassName="bg-black/40">
          <DialogHeader>
            <DialogTitle>How to use your model</DialogTitle>
            <DialogDescription>
              Run your fine-tuned model locally using vLLM with the downloaded
              LoRA adapter weights.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1 overflow-y-auto min-h-0">
            <CodeSnippet label="1. Extract weights" code={extractSnippet} />
            <CodeSnippet
              label="2. Run inference (Python)"
              code={inferenceSnippet}
            />

            <p className="text-xs text-muted-foreground">
              The downloaded file contains LoRA adapter weights. The base model (
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">
                {baseModel}
              </code>
              ) will be downloaded automatically on first run.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
