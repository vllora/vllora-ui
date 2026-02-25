/**
 * NewJobDialog
 *
 * Dialog component for creating a new finetune job with configurable parameters.
 * Styled consistently with DryRunDialog for visual coherence.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Settings2,
} from "lucide-react";
import {
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_INFERENCE_PARAMETERS,
  ReinforcementTrainingConfig,
  ReinforcementInferenceParameters,
} from "@/services/finetune-api";
import { quickFinetune } from "@/services/quick-finetune";
import { toast } from "sonner";
import { BASE_MODELS } from "./constants";
import type { SampleTrainingConfig } from "@/types/dataset-types";

interface NewJobDialogProps {
  datasetId: string;
  onSuccess: () => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial training config (from sample dataset or user-configured) */
  initialConfig?: SampleTrainingConfig;
}

export function NewJobDialog({ datasetId, onSuccess, disabled, open, onOpenChange, initialConfig }: NewJobDialogProps) {
  // Use initial config from sample dataset if available, otherwise use defaults
  const defaultBaseModel = initialConfig?.base_model || "unsloth/Qwen3-4B";
  const defaultLearningRate = initialConfig?.training_config?.learning_rate ?? DEFAULT_TRAINING_CONFIG.learning_rate;
  const defaultEpochs = initialConfig?.training_config?.epochs ?? DEFAULT_TRAINING_CONFIG.epochs;
  const defaultBatchSize = initialConfig?.training_config?.batch_size ?? DEFAULT_TRAINING_CONFIG.batch_size;
  const defaultLoraRank = initialConfig?.training_config?.lora_rank ?? DEFAULT_TRAINING_CONFIG.lora_rank;
  const defaultMaxOutputTokens = initialConfig?.inference_parameters?.max_output_tokens ?? DEFAULT_INFERENCE_PARAMETERS.max_output_tokens;
  const defaultTemperature = initialConfig?.inference_parameters?.temperature ?? DEFAULT_INFERENCE_PARAMETERS.temperature;

  const [baseModel, setBaseModel] = useState(defaultBaseModel);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Training config
  const [learningRate, setLearningRate] = useState(String(defaultLearningRate));
  const [epochs, setEpochs] = useState(String(defaultEpochs));
  const [batchSize, setBatchSize] = useState(String(defaultBatchSize));
  const [loraRank, setLoraRank] = useState(String(defaultLoraRank));

  // Inference parameters
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(defaultMaxOutputTokens));
  const [temperature, setTemperature] = useState(String(defaultTemperature));

  const handleSubmit = useCallback(async () => {
    if (!datasetId || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Build training config (only include values that differ from defaults or are set)
      const trainingConfig: Partial<ReinforcementTrainingConfig> = {};
      const lr = parseFloat(learningRate);
      if (!isNaN(lr) && lr !== DEFAULT_TRAINING_CONFIG.learning_rate) {
        trainingConfig.learning_rate = lr;
      }
      const ep = parseFloat(epochs);
      if (!isNaN(ep) && ep !== DEFAULT_TRAINING_CONFIG.epochs) {
        trainingConfig.epochs = ep;
      }
      const bs = parseInt(batchSize, 10);
      if (!isNaN(bs) && bs !== DEFAULT_TRAINING_CONFIG.batch_size) {
        trainingConfig.batch_size = bs;
      }
      const lr_rank = parseInt(loraRank, 10);
      if (!isNaN(lr_rank) && lr_rank !== DEFAULT_TRAINING_CONFIG.lora_rank) {
        trainingConfig.lora_rank = lr_rank;
      }

      // Build inference parameters
      const inferenceParameters: Partial<ReinforcementInferenceParameters> = {};
      const mot = parseInt(maxOutputTokens, 10);
      if (!isNaN(mot) && mot !== DEFAULT_INFERENCE_PARAMETERS.max_output_tokens) {
        inferenceParameters.max_output_tokens = mot;
      }
      const temp = parseFloat(temperature);
      if (!isNaN(temp) && temp !== DEFAULT_INFERENCE_PARAMETERS.temperature) {
        inferenceParameters.temperature = temp;
      }

      const result = await quickFinetune({
        datasetId,
        baseModel,
        trainingConfig: Object.keys(trainingConfig).length > 0 ? trainingConfig : undefined,
        inferenceParameters: Object.keys(inferenceParameters).length > 0 ? inferenceParameters : undefined,
      });

      if (result.success) {
        toast.success(`Finetune job started! Job ID: ${result.jobId}`);
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error || "Failed to start finetune job");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start finetune job");
    } finally {
      setIsSubmitting(false);
    }
  }, [datasetId, baseModel, learningRate, epochs, batchSize, loraRank, maxOutputTokens, temperature, isSubmitting, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[70vw] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            New Finetune Job
          </DialogTitle>
          <DialogDescription>
            Configure and start a new fine-tuning job for your dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 py-2">
          {/* Base Model Selection */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Base Model</label>
            <Select value={baseModel} onValueChange={setBaseModel}>
              <SelectTrigger className="w-full bg-zinc-800/50 border-zinc-700 text-zinc-300 ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus:outline-none">
                <SelectValue placeholder="Select base model" />
              </SelectTrigger>
              <SelectContent>
                {BASE_MODELS.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500 mt-2">
              Model to fine-tune with your dataset
            </p>
          </div>

          {/* Advanced Settings Toggle */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-sm px-0 text-zinc-400 hover:text-zinc-200 hover:bg-transparent">
                <Settings2 className="h-4 w-4" />
                {showAdvanced ? "Hide" : "Show"} Advanced Settings
                {showAdvanced ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-4 space-y-4">
              {/* Training Config */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Training Configuration</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="learning-rate" className="text-xs text-zinc-400">Learning Rate</Label>
                    <Input
                      id="learning-rate"
                      type="number"
                      step="0.00001"
                      value={learningRate}
                      onChange={(e) => setLearningRate(e.target.value)}
                      className="h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 focus-visible:ring-zinc-600"
                      placeholder="0.00001"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="epochs" className="text-xs text-zinc-400">Epochs</Label>
                    <Input
                      id="epochs"
                      type="number"
                      step="0.5"
                      value={epochs}
                      onChange={(e) => setEpochs(e.target.value)}
                      className="h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 focus-visible:ring-zinc-600"
                      placeholder="3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="batch-size" className="text-xs text-zinc-400">Batch Size</Label>
                    <Input
                      id="batch-size"
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(e.target.value)}
                      className="h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 focus-visible:ring-zinc-600"
                      placeholder="10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lora-rank" className="text-xs text-zinc-400">LoRA Rank</Label>
                    <Input
                      id="lora-rank"
                      type="number"
                      value={loraRank}
                      onChange={(e) => setLoraRank(e.target.value)}
                      className="h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 focus-visible:ring-zinc-600"
                      placeholder="8"
                    />
                  </div>
                </div>
              </div>

              {/* Inference Parameters */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Inference Parameters</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="max-output-tokens" className="text-xs text-zinc-400">Max Output Tokens</Label>
                    <Input
                      id="max-output-tokens"
                      type="number"
                      value={maxOutputTokens}
                      onChange={(e) => setMaxOutputTokens(e.target.value)}
                      className="h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 focus-visible:ring-zinc-600"
                      placeholder="1000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="temperature" className="text-xs text-zinc-400">Temperature</Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="h-9 bg-zinc-800/50 border-zinc-700 text-zinc-300 focus-visible:ring-zinc-600"
                      placeholder="0.7"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Footer */}
        <div className="shrink-0 pt-2">
          <Separator className="bg-zinc-800 mb-4" />
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || disabled}
              className="gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Start Training
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
