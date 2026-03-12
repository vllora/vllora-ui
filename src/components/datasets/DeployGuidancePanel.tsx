/**
 * DeployGuidancePanel
 *
 * Deploy tab content: shows the latest succeeded finetune model,
 * weights download, API usage snippets, and next-step guidance.
 * Shown when the Deploy tab is active and at least one job exists.
 */

import { useState, useCallback, useMemo } from "react";
import { RocketIcon, Download, Loader2, Copy, Check, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { getWeightsDownloadUrl } from "@/services/finetune-api";
import { getModelDisplayName, formatFinetuneJobDate, triggerFileDownload } from "@/components/finetune/content/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function DeployGuidancePanel() {
  const { filteredJobs } = FinetuneJobsConsumer();

  const succeededJobs = useMemo(
    () => filteredJobs.filter((j) => j.status === "succeeded").sort(
      (a, b) => new Date(b.completed_at ?? b.updated_at).getTime() - new Date(a.completed_at ?? a.updated_at).getTime()
    ),
    [filteredJobs]
  );

  const latestSucceeded = succeededJobs[0] ?? null;

  if (!latestSucceeded) {
    return <EmptyState hasJobs={filteredJobs.length > 0} />;
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Model card */}
        <ModelCard job={latestSucceeded} />

        {/* API usage */}
        <ApiUsageSection modelId={latestSucceeded.fine_tuned_model ?? latestSucceeded.provider_job_id} />

        {/* Local inference guide */}
        <LocalInferenceSection jobId={latestSucceeded.provider_job_id} baseModel={latestSucceeded.base_model} />

        {/* Other succeeded models */}
        {succeededJobs.length > 1 && (
          <section>
            <h3 className="text-sm font-medium text-foreground mb-2">Other trained models</h3>
            <div className="space-y-2">
              {succeededJobs.slice(1).map((job) => (
                <div key={job.id} className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-mono text-xs text-foreground">
                      {job.fine_tuned_model ?? job.provider_job_id}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-3">
                    {formatFinetuneJobDate(job.completed_at ?? job.updated_at)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModelCard({ job }: { job: { workflow_id: string; provider_job_id: string; base_model: string; fine_tuned_model?: string; completed_at?: string; updated_at: string } }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const { download_url } = await getWeightsDownloadUrl(job.workflow_id, job.provider_job_id);
      triggerFileDownload(download_url, `weights-${job.provider_job_id}.tar.gz`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to get download URL");
    } finally {
      setIsDownloading(false);
    }
  }, [job.workflow_id, job.provider_job_id]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <RocketIcon className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            <h2 className="text-sm font-semibold text-foreground">Ready to deploy</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Your fine-tuned model is trained and available for use.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Download Weights
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Model</span>
          <p className="font-mono text-foreground break-all">{job.fine_tuned_model ?? job.provider_job_id}</p>
        </div>
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Base model</span>
          <p className="text-foreground">{getModelDisplayName(job.base_model)}</p>
        </div>
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Completed</span>
          <p className="text-foreground">{formatFinetuneJobDate(job.completed_at ?? job.updated_at)}</p>
        </div>
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Job ID</span>
          <p className="font-mono text-foreground truncate">{job.provider_job_id}</p>
        </div>
      </div>
    </section>
  );
}

function ApiUsageSection({ modelId }: { modelId: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`Copied ${label}`);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const curlSnippet = `curl https://api.anthropic.com/v1/messages \\
  -H "content-type: application/json" \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "${modelId}",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`;

  const pythonSnippet = `import anthropic

client = anthropic.Anthropic()

message = client.messages.create(
    model="${modelId}",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)
print(message.content[0].text)`;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">API Usage</h3>

      <CodeBlock
        label="cURL"
        code={curlSnippet}
        copied={copied === "cURL"}
        onCopy={() => copyToClipboard(curlSnippet, "cURL")}
      />

      <CodeBlock
        label="Python"
        code={pythonSnippet}
        copied={copied === "Python"}
        onCopy={() => copyToClipboard(pythonSnippet, "Python")}
      />

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" />
        Replace <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">$ANTHROPIC_API_KEY</code> with your API key.
      </p>
    </section>
  );
}

function LocalInferenceSection({ jobId, baseModel }: { jobId: string; baseModel: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`Copied ${label}`);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const installSnippet = `pip install vllm transformers`;

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
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Local Inference</h3>
      <p className="text-xs text-muted-foreground">
        Run your fine-tuned model locally using vLLM with the downloaded LoRA adapter weights.
      </p>

      <CodeBlock
        label="1. Install"
        code={installSnippet}
        copied={copied === "install"}
        onCopy={() => copyToClipboard(installSnippet, "install")}
      />

      <CodeBlock
        label="2. Extract weights"
        code={extractSnippet}
        copied={copied === "extract"}
        onCopy={() => copyToClipboard(extractSnippet, "extract")}
      />

      <CodeBlock
        label="3. Run inference (Python)"
        code={inferenceSnippet}
        copied={copied === "inference"}
        onCopy={() => copyToClipboard(inferenceSnippet, "inference")}
      />

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" />
        The downloaded file contains LoRA adapter weights. The base model (<code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">{baseModel}</code>) will be downloaded automatically on first run.
      </p>
    </section>
  );
}

function CodeBlock({ label, code, copied, onCopy }: { label: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <button
          onClick={onCopy}
          className={cn(
            "flex items-center gap-1 text-[10px] transition-colors",
            copied ? "text-[rgb(var(--theme-500))]" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-xs font-mono text-foreground overflow-x-auto bg-muted/20">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EmptyState({ hasJobs }: { hasJobs: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
          <RocketIcon className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-base font-medium text-foreground mb-1">
            {hasJobs ? "No successful training yet" : "No deployment available"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasJobs
              ? "Your training jobs haven't completed successfully yet. Check the Fine-tune tab for job status."
              : "Complete a fine-tuning job first, then come back here to deploy your model."
            }
          </p>
        </div>
      </div>
    </div>
  );
}
