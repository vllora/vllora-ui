/**
 * NewJobDialog
 *
 * Compact dialog for creating a new finetune job.
 * Shows an eval summary card at the top when evaluation data is available.
 * Adapts to 3 states: first-run, returning (with previous best), grader-changed.
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
  TriangleAlert,
} from "lucide-react";
import {
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_INFERENCE_PARAMETERS,
} from "@/services/finetune-api";
import { quickFinetune } from "@/services/quick-finetune";
import { toast } from "sonner";
import { BASE_MODELS } from "./constants";
import {
  EvalSummaryCard,
  PreviousBestCard,
  AdvancedTrainingFields,
  AdvancedInferenceFields,
  buildTrainingConfig,
  buildInferenceParams,
} from "./NewJobDialogParts";
import type { SampleTrainingConfig } from "@/types/dataset-types";

/* ── Shared input classes (matches NewEvaluationDialog) ── */
const SELECT_CLS =
  "h-8 text-xs border-border/50 bg-muted/30 focus:ring-0 focus:ring-offset-0";
const INPUT_CLS =
  "h-8 text-xs border-border/50 bg-muted/30 focus-visible:ring-0 focus-visible:ring-offset-0";

export interface LatestEvalInfo {
  readonly score: number;
  readonly timestamp: number;
  readonly sampleSize: number;
  readonly model: string;
}

export interface TrainingEvalContext {
  readonly latestEval?: LatestEvalInfo;
  readonly evaluatorVersion?: number | null;
  readonly isGraderModified?: boolean;
  readonly previousBestTrainingScore?: number;
  readonly previousBestTimestamp?: number;
}

interface NewJobDialogProps {
  readonly workflowId: string;
  readonly onSuccess: () => void;
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Initial training config (from sample dataset or user-configured) */
  readonly initialConfig?: SampleTrainingConfig;
  /** Eval context for showing eval summary card */
  readonly evalContext?: TrainingEvalContext;
}

export function NewJobDialog({
  workflowId,
  onSuccess,
  disabled,
  open,
  onOpenChange,
  initialConfig,
  evalContext,
}: NewJobDialogProps) {
  const defaultBaseModel = initialConfig?.base_model || "Qwen3.5-4B";
  const defaultEpochs =
    initialConfig?.training_config?.epochs ?? DEFAULT_TRAINING_CONFIG.epochs;

  const [baseModel, setBaseModel] = useState(defaultBaseModel);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Training config
  const [learningRate, setLearningRate] = useState(
    String(initialConfig?.training_config?.learning_rate ?? DEFAULT_TRAINING_CONFIG.learning_rate),
  );
  const [epochs, setEpochs] = useState(String(defaultEpochs));
  const [batchSize, setBatchSize] = useState(
    String(initialConfig?.training_config?.batch_size ?? DEFAULT_TRAINING_CONFIG.batch_size),
  );
  const [loraRank, setLoraRank] = useState(
    String(initialConfig?.training_config?.lora_rank ?? DEFAULT_TRAINING_CONFIG.lora_rank),
  );

  // Inference parameters
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    String(initialConfig?.inference_parameters?.max_output_tokens ?? DEFAULT_INFERENCE_PARAMETERS.max_output_tokens),
  );
  const [temperature, setTemperature] = useState(
    String(initialConfig?.inference_parameters?.temperature ?? DEFAULT_INFERENCE_PARAMETERS.temperature),
  );
  const [responseCandidatesCount, setResponseCandidatesCount] = useState(
    String(initialConfig?.inference_parameters?.response_candidates_count ?? DEFAULT_INFERENCE_PARAMETERS.response_candidates_count),
  );

  const isGraderStale = evalContext?.isGraderModified ?? false;
  const hasEvalVersion = (evalContext?.evaluatorVersion ?? 0) > 0;
  const epochCount = parseFloat(epochs) || defaultEpochs;

  const handleSubmit = useCallback(async () => {
    if (!workflowId || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const trainingConfig = buildTrainingConfig(learningRate, epochs, batchSize, loraRank);
      const inferenceParameters = buildInferenceParams(maxOutputTokens, temperature, responseCandidatesCount);

      const result = await quickFinetune({
        workflowId,
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
    workflowId, baseModel, learningRate, epochs, batchSize, loraRank,
    maxOutputTokens, temperature, responseCandidatesCount,
    isSubmitting, onSuccess, onOpenChange,
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
            Fine-tune a model with your evaluated dataset
          </DialogDescription>
        </DialogHeader>

        {/* Eval summary card */}
        {evalContext?.latestEval && (
          <EvalSummaryCard
            eval={evalContext.latestEval}
            evaluatorVersion={evalContext.evaluatorVersion}
            isStale={isGraderStale}
          />
        )}

        {/* Stale warning banner */}
        {isGraderStale && hasEvalVersion && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/12 bg-amber-500/[0.04] px-2.5 py-2 text-[11px] text-amber-600 dark:text-amber-400/80">
            <TriangleAlert className="h-3 w-3 shrink-0" />
            Grader was modified since the last eval (v{evalContext?.evaluatorVersion}).
            Consider re-running evaluation before training.
          </div>
        )}

        {/* Config: Base Model + Epochs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Base Model
            </label>
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
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
            <AdvancedTrainingFields
              learningRate={learningRate}
              batchSize={batchSize}
              loraRank={loraRank}
              onLearningRateChange={setLearningRate}
              onBatchSizeChange={setBatchSize}
              onLoraRankChange={setLoraRank}
            />
            <AdvancedInferenceFields
              maxOutputTokens={maxOutputTokens}
              temperature={temperature}
              responseCandidatesCount={responseCandidatesCount}
              onMaxOutputTokensChange={setMaxOutputTokens}
              onTemperatureChange={setTemperature}
              onResponseCandidatesCountChange={setResponseCandidatesCount}
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Previous best training score */}
        {evalContext?.previousBestTrainingScore != null && (
          <PreviousBestCard
            score={evalContext.previousBestTrainingScore}
            timestamp={evalContext.previousBestTimestamp}
          />
        )}

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
                Start Training &middot; {epochCount} epochs
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
