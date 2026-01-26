/**
 * FinetuneJobDialog
 *
 * Dialog for creating a finetuning job from a dataset.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { DatasetWithRecords } from "@/types/dataset-types";
import { createFinetuningJob, Hyperparameters } from "@/services/finetune-api";
import { toast } from "sonner";

// Providers that support finetuning
const FINETUNE_PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "together", label: "Together AI" },
  { value: "fireworks", label: "Fireworks AI" },
  { value: "mistral", label: "Mistral AI" },
] as const;

// Base models for finetuning by provider
const FINETUNE_MODELS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: "gpt-4o-mini-2024-07-18", label: "GPT-4o Mini (2024-07-18)" },
    { value: "gpt-4o-2024-08-06", label: "GPT-4o (2024-08-06)" },
    { value: "gpt-3.5-turbo-0125", label: "GPT-3.5 Turbo (0125)" },
    { value: "gpt-3.5-turbo-1106", label: "GPT-3.5 Turbo (1106)" },
  ],
  together: [
    { value: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", label: "Llama 3.1 8B Instruct" },
    { value: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", label: "Llama 3.1 70B Instruct" },
    { value: "mistralai/Mistral-7B-Instruct-v0.3", label: "Mistral 7B Instruct v0.3" },
  ],
  fireworks: [
    { value: "accounts/fireworks/models/llama-v3p1-8b-instruct", label: "Llama 3.1 8B Instruct" },
    { value: "accounts/fireworks/models/llama-v3p1-70b-instruct", label: "Llama 3.1 70B Instruct" },
  ],
  mistral: [
    { value: "open-mistral-7b", label: "Mistral 7B" },
    { value: "mistral-small-latest", label: "Mistral Small" },
  ],
};

interface FinetuneJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: DatasetWithRecords | null;
  onSuccess?: () => void;
}

export function FinetuneJobDialog({
  open,
  onOpenChange,
  dataset,
  onSuccess,
}: FinetuneJobDialogProps) {
  const [provider, setProvider] = useState<string>("openai");
  const [baseModel, setBaseModel] = useState<string>("");
  const [suffix, setSuffix] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hyperparameters, setHyperparameters] = useState<Hyperparameters>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get available models for selected provider
  const availableModels = useMemo(() => {
    return FINETUNE_MODELS[provider] || [];
  }, [provider]);

  // Reset model when provider changes
  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setBaseModel("");
  };

  const resetState = () => {
    setProvider("openai");
    setBaseModel("");
    setSuffix("");
    setShowAdvanced(false);
    setHyperparameters({});
    setIsSubmitting(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    if (!dataset || !baseModel) return;

    setIsSubmitting(true);
    try {
      const result = await createFinetuningJob({
        dataset,
        base_model: baseModel,
        provider,
        hyperparameters: Object.keys(hyperparameters).length > 0 ? hyperparameters : undefined,
        suffix: suffix.trim() || undefined,
      });

      toast.success("Finetuning job created", {
        description: `Job ID: ${result.id}`,
      });

      handleOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Failed to create finetuning job:", err);
      toast.error("Failed to create finetuning job", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const recordCount = dataset?.records?.length || 0;
  const minRecords = 10; // Minimum records recommended for finetuning

  // Determine if submit is possible and why not
  const getDisabledReason = (): string | null => {
    if (isSubmitting) return "Creating finetuning job...";
    if (!dataset) return "No dataset selected";
    if (recordCount === 0) return "Dataset has no records";
    if (!baseModel) return "Please select a base model";
    return null;
  };

  const disabledReason = getDisabledReason();
  const canSubmit = !disabledReason;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[rgb(var(--theme-500))]" />
            Start Finetuning Job
          </DialogTitle>
          <DialogDescription>
            Create a finetuning job using the records from "{dataset?.name || "dataset"}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning for low record count */}
          {recordCount < minRecords && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-600">Low record count</p>
                <p className="text-muted-foreground">
                  This dataset has only {recordCount} record{recordCount !== 1 ? "s" : ""}.
                  For better results, we recommend at least {minRecords} training examples.
                </p>
              </div>
            </div>
          )}

          {/* Provider selection */}
          <div className="space-y-2">
            <Label>
              Provider <span className="text-red-500">*</span>
            </Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {FINETUNE_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Base model selection */}
          <div className="space-y-2">
            <Label>
              Base Model <span className="text-red-500">*</span>
            </Label>
            <Select value={baseModel} onValueChange={setBaseModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a base model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model suffix */}
          <div className="space-y-2">
            <Label htmlFor="suffix">Model Suffix (optional)</Label>
            <Input
              id="suffix"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder="e.g., customer-support-v1"
            />
            <p className="text-xs text-muted-foreground">
              A suffix to identify your finetuned model
            </p>
          </div>

          {/* Advanced options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-muted-foreground hover:text-foreground"
              >
                Advanced Options
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              {/* Epochs */}
              <div className="space-y-2">
                <Label htmlFor="epochs">Number of Epochs</Label>
                <Input
                  id="epochs"
                  type="number"
                  min={1}
                  max={50}
                  value={hyperparameters.n_epochs || ""}
                  onChange={(e) =>
                    setHyperparameters((prev) => ({
                      ...prev,
                      n_epochs: e.target.value ? parseInt(e.target.value) : undefined,
                    }))
                  }
                  placeholder="Auto (provider default)"
                />
              </div>

              {/* Batch size */}
              <div className="space-y-2">
                <Label htmlFor="batch_size">Batch Size</Label>
                <Input
                  id="batch_size"
                  type="number"
                  min={1}
                  max={256}
                  value={hyperparameters.batch_size || ""}
                  onChange={(e) =>
                    setHyperparameters((prev) => ({
                      ...prev,
                      batch_size: e.target.value ? parseInt(e.target.value) : undefined,
                    }))
                  }
                  placeholder="Auto (provider default)"
                />
              </div>

              {/* Learning rate multiplier */}
              <div className="space-y-2">
                <Label htmlFor="learning_rate">Learning Rate Multiplier</Label>
                <Input
                  id="learning_rate"
                  type="number"
                  step={0.01}
                  min={0.01}
                  max={10}
                  value={hyperparameters.learning_rate_multiplier || ""}
                  onChange={(e) =>
                    setHyperparameters((prev) => ({
                      ...prev,
                      learning_rate_multiplier: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    }))
                  }
                  placeholder="Auto (provider default)"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Summary */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Training records:</span>
              <span className="font-medium">{recordCount}</span>
            </div>
            {baseModel && (
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Base model:</span>
                <span className="font-medium truncate ml-2">
                  {availableModels.find((m) => m.value === baseModel)?.label || baseModel}
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={!canSubmit ? 0 : undefined}>
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white disabled:pointer-events-none"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Start Finetuning
                      </>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {disabledReason && (
                <TooltipContent>
                  <p>{disabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
