/**
 * NewJobDialog
 *
 * Compact dialog for creating a new finetune job.
 * Styled consistently with NewEvaluationDialog for visual coherence.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/* ── Shared input classes (matches NewEvaluationDialog) ── */
const SELECT_CLS =
  "h-8 text-xs border-border/50 bg-muted/30 focus:ring-0 focus:ring-offset-0";
const INPUT_CLS =
  "h-8 text-xs border-border/50 bg-muted/30 focus-visible:ring-0 focus-visible:ring-offset-0";

interface NewJobDialogProps {
  datasetId: string;
  onSuccess: () => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial training config (from sample dataset or user-configured) */
  initialConfig?: SampleTrainingConfig;
}

export function NewJobDialog({
  datasetId,
  onSuccess,
  disabled,
  open,
  onOpenChange,
  initialConfig,
}: NewJobDialogProps) {
  // Use initial config from sample dataset if available, otherwise use defaults
  const defaultBaseModel = initialConfig?.base_model || "unsloth/Qwen3.5-4B";
  const defaultLearningRate =
    initialConfig?.training_config?.learning_rate ??
    DEFAULT_TRAINING_CONFIG.learning_rate;
  const defaultEpochs =
    initialConfig?.training_config?.epochs ?? DEFAULT_TRAINING_CONFIG.epochs;
  const defaultBatchSize =
    initialConfig?.training_config?.batch_size ??
    DEFAULT_TRAINING_CONFIG.batch_size;
  const defaultLoraRank =
    initialConfig?.training_config?.lora_rank ??
    DEFAULT_TRAINING_CONFIG.lora_rank;
  const defaultMaxOutputTokens =
    initialConfig?.inference_parameters?.max_output_tokens ??
    DEFAULT_INFERENCE_PARAMETERS.max_output_tokens;
  const defaultTemperature =
    initialConfig?.inference_parameters?.temperature ??
    DEFAULT_INFERENCE_PARAMETERS.temperature;
  const defaultResponseCandidatesCount =
    initialConfig?.inference_parameters?.response_candidates_count ??
    DEFAULT_INFERENCE_PARAMETERS.response_candidates_count;

  const [baseModel, setBaseModel] = useState(defaultBaseModel);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Training config
  const [learningRate, setLearningRate] = useState(String(defaultLearningRate));
  const [epochs, setEpochs] = useState(String(defaultEpochs));
  const [batchSize, setBatchSize] = useState(String(defaultBatchSize));
  const [loraRank, setLoraRank] = useState(String(defaultLoraRank));

  // Inference parameters
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    String(defaultMaxOutputTokens),
  );
  const [temperature, setTemperature] = useState(String(defaultTemperature));
  const [responseCandidatesCount, setResponseCandidatesCount] = useState(String(defaultResponseCandidatesCount));

  const handleSubmit = useCallback(async () => {
    if (!datasetId || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Build training config (only include values that differ from defaults)
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
      if (
        !isNaN(mot) &&
        mot !== DEFAULT_INFERENCE_PARAMETERS.max_output_tokens
      ) {
        inferenceParameters.max_output_tokens = mot;
      }
      const temp = parseFloat(temperature);
      if (!isNaN(temp) && temp !== DEFAULT_INFERENCE_PARAMETERS.temperature) {
        inferenceParameters.temperature = temp;
      }
      const rcc = parseInt(responseCandidatesCount, 10);
      if (!isNaN(rcc) && rcc !== DEFAULT_INFERENCE_PARAMETERS.response_candidates_count) {
        inferenceParameters.response_candidates_count = rcc;
      }

      const result = await quickFinetune({
        datasetId,
        baseModel,
        trainingConfig:
          Object.keys(trainingConfig).length > 0 ? trainingConfig : undefined,
        inferenceParameters:
          Object.keys(inferenceParameters).length > 0
            ? inferenceParameters
            : undefined,
      });

      if (result.success) {
        toast.success(`Finetune job started! Job ID: ${result.jobId}`);
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error || "Failed to start finetune job");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start finetune job",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    datasetId,
    baseModel,
    learningRate,
    epochs,
    batchSize,
    loraRank,
    maxOutputTokens,
    temperature,
    responseCandidatesCount,
    isSubmitting,
    onSuccess,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Start Training
          </DialogTitle>
          <DialogDescription className="text-xs">
            Fine-tune a model with your dataset.
          </DialogDescription>
        </DialogHeader>

        {/* Base Model */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Base Model</label>
          <Select value={baseModel} onValueChange={setBaseModel}>
            <SelectTrigger className={SELECT_CLS}>
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

        {/* Advanced Settings */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
              <Settings2 className="h-3 w-3" />
              Advanced settings
              {showAdvanced ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="pt-3 space-y-3">
            {/* Training Config */}
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                Training
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Learning Rate
                  </label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={learningRate}
                    onChange={(e) => setLearningRate(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Epochs
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={epochs}
                    onChange={(e) => setEpochs(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Batch Size
                  </label>
                  <Input
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    LoRA Rank
                  </label>
                  <Input
                    type="number"
                    value={loraRank}
                    onChange={(e) => setLoraRank(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            </div>

            {/* Inference Parameters */}
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                Inference
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Max Tokens
                  </label>
                  <Input
                    type="number"
                    value={maxOutputTokens}
                    onChange={(e) => setMaxOutputTokens(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Temperature
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">
                    Response Candidates
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={responseCandidatesCount}
                    onChange={(e) => setResponseCandidatesCount(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || disabled}
            className="gap-1.5 bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Start Training
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
