/**
 * NewJobDialog
 *
 * Dialog component for creating a new finetune job with configurable parameters.
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
  const defaultBaseModel = initialConfig?.base_model || "llama-v3-8b-instruct";
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            New Finetune Job
          </DialogTitle>
          <DialogDescription>
            Configure and start a new fine-tuning job for your dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Base Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="base-model" className="text-sm">Base Model</Label>
            <Select value={baseModel} onValueChange={setBaseModel}>
              <SelectTrigger id="base-model" className="h-10">
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
          </div>

          {/* Advanced Settings Toggle */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-sm px-0 text-muted-foreground hover:text-foreground">
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
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Training Configuration</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="learning-rate" className="text-xs text-muted-foreground">Learning Rate</Label>
                    <Input
                      id="learning-rate"
                      type="number"
                      step="0.00001"
                      value={learningRate}
                      onChange={(e) => setLearningRate(e.target.value)}
                      className="h-9"
                      placeholder="0.0001"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="epochs" className="text-xs text-muted-foreground">Epochs</Label>
                    <Input
                      id="epochs"
                      type="number"
                      step="0.5"
                      value={epochs}
                      onChange={(e) => setEpochs(e.target.value)}
                      className="h-9"
                      placeholder="2.0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="batch-size" className="text-xs text-muted-foreground">Batch Size</Label>
                    <Input
                      id="batch-size"
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(e.target.value)}
                      className="h-9"
                      placeholder="65536"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lora-rank" className="text-xs text-muted-foreground">LoRA Rank</Label>
                    <Input
                      id="lora-rank"
                      type="number"
                      value={loraRank}
                      onChange={(e) => setLoraRank(e.target.value)}
                      className="h-9"
                      placeholder="16"
                    />
                  </div>
                </div>
              </div>

              {/* Inference Parameters */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inference Parameters</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="max-output-tokens" className="text-xs text-muted-foreground">Max Output Tokens</Label>
                    <Input
                      id="max-output-tokens"
                      type="number"
                      value={maxOutputTokens}
                      onChange={(e) => setMaxOutputTokens(e.target.value)}
                      className="h-9"
                      placeholder="2048"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="temperature" className="text-xs text-muted-foreground">Temperature</Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="h-9"
                      placeholder="0.7"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || disabled}
            className="gap-1.5"
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
      </DialogContent>
    </Dialog>
  );
}
