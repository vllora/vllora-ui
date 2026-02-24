/**
 * FinetuneConfigPanel
 *
 * Full-height finetune jobs view with header bar.
 * Training config lives in a settings popover (like dry-run config in EvaluationConfigPanel).
 * Main content is the jobs split view (job detail left, job list right).
 */

import { useState, useCallback } from "react";
import {
  Loader2,
  Rocket,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronRight,
  Settings2,
  AlertCircle,
} from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { FinetuneJobsPanel } from "./finetune-job-detail";
import { BASE_MODELS } from "./constants";
import {
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_INFERENCE_PARAMETERS,
} from "@/services/finetune-api";
import type { ReinforcementTrainingConfig, ReinforcementInferenceParameters } from "@/services/finetune-api";
import { quickFinetune } from "@/services/quick-finetune";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SampleTrainingConfig } from "@/types/dataset-types";

interface FinetuneConfigPanelProps {
  datasetId: string;
  canStartJob: boolean;
  initialConfig?: SampleTrainingConfig;
}

export function FinetuneConfigPanel({ datasetId, canStartJob, initialConfig }: FinetuneConfigPanelProps) {
  const defaultBaseModel = initialConfig?.base_model || "google/gemma-3-4b-it";
  const defaultLearningRate = initialConfig?.training_config?.learning_rate ?? DEFAULT_TRAINING_CONFIG.learning_rate;
  const defaultEpochs = initialConfig?.training_config?.epochs ?? DEFAULT_TRAINING_CONFIG.epochs;
  const defaultBatchSize = initialConfig?.training_config?.batch_size ?? DEFAULT_TRAINING_CONFIG.batch_size;
  const defaultLoraRank = initialConfig?.training_config?.lora_rank ?? DEFAULT_TRAINING_CONFIG.lora_rank;
  const defaultMaxOutputTokens = initialConfig?.inference_parameters?.max_output_tokens ?? DEFAULT_INFERENCE_PARAMETERS.max_output_tokens;
  const defaultTemperature = initialConfig?.inference_parameters?.temperature ?? DEFAULT_INFERENCE_PARAMETERS.temperature;

  // Form state
  const [baseModel, setBaseModel] = useState(defaultBaseModel);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [learningRate, setLearningRate] = useState(String(defaultLearningRate));
  const [epochs, setEpochs] = useState(String(defaultEpochs));
  const [batchSize, setBatchSize] = useState(String(defaultBatchSize));
  const [loraRank, setLoraRank] = useState(String(defaultLoraRank));
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(defaultMaxOutputTokens));
  const [temperature, setTemperature] = useState(String(defaultTemperature));

  // Context
  const { filteredJobs, isLoading, loadJobs } = FinetuneJobsConsumer();
  const hasActiveJob = filteredJobs.some(
    (job) => job.status === "pending" || job.status === "running"
  );

  const handleSubmit = useCallback(async () => {
    if (!datasetId || isSubmitting || !canStartJob || hasActiveJob) return;

    setIsSubmitting(true);
    try {
      const trainingConfig: Partial<ReinforcementTrainingConfig> = {};
      const lr = parseFloat(learningRate);
      if (!isNaN(lr) && lr !== DEFAULT_TRAINING_CONFIG.learning_rate) trainingConfig.learning_rate = lr;
      const ep = parseFloat(epochs);
      if (!isNaN(ep) && ep !== DEFAULT_TRAINING_CONFIG.epochs) trainingConfig.epochs = ep;
      const bs = parseInt(batchSize, 10);
      if (!isNaN(bs) && bs !== DEFAULT_TRAINING_CONFIG.batch_size) trainingConfig.batch_size = bs;
      const lr_rank = parseInt(loraRank, 10);
      if (!isNaN(lr_rank) && lr_rank !== DEFAULT_TRAINING_CONFIG.lora_rank) trainingConfig.lora_rank = lr_rank;

      const inferenceParameters: Partial<ReinforcementInferenceParameters> = {};
      const mot = parseInt(maxOutputTokens, 10);
      if (!isNaN(mot) && mot !== DEFAULT_INFERENCE_PARAMETERS.max_output_tokens) inferenceParameters.max_output_tokens = mot;
      const temp = parseFloat(temperature);
      if (!isNaN(temp) && temp !== DEFAULT_INFERENCE_PARAMETERS.temperature) inferenceParameters.temperature = temp;

      const result = await quickFinetune({
        datasetId,
        baseModel,
        trainingConfig: Object.keys(trainingConfig).length > 0 ? trainingConfig : undefined,
        inferenceParameters: Object.keys(inferenceParameters).length > 0 ? inferenceParameters : undefined,
      });

      if (result.success) {
        toast.success(`Finetune job started! Job ID: ${result.jobId}`);
        loadJobs();
      } else {
        toast.error(result.error || "Failed to start finetune job");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start finetune job");
    } finally {
      setIsSubmitting(false);
    }
  }, [datasetId, baseModel, learningRate, epochs, batchSize, loraRank, maxOutputTokens, temperature, isSubmitting, canStartJob, hasActiveJob, loadJobs]);

  const canStart = canStartJob && !hasActiveJob && !isSubmitting;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/40 shrink-0">
          <span className="text-xs font-medium text-muted-foreground px-1">Finetune Jobs</span>

          {filteredJobs.length > 0 && (
            <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
              {filteredJobs.length}
            </span>
          )}

          {!canStartJob && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 ml-2 text-[10px] text-muted-foreground/50">
                  <AlertCircle className="h-3 w-3" />
                  <span>Prerequisites missing</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Add training data and set up evaluation to enable fine-tuning
              </TooltipContent>
            </Tooltip>
          )}

          <div className="flex-1" />

          {/* Training config popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-72 p-3">
              <div className="space-y-3">
                {/* Base Model */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Base Model
                  </label>
                  <Select value={baseModel} onValueChange={setBaseModel}>
                    <SelectTrigger className="h-8 bg-muted/50 border-border/50 text-xs text-foreground focus:ring-ring focus:ring-offset-0">
                      <SelectValue />
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

                {/* Advanced */}
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      <Settings2 className="h-3 w-3" />
                      Advanced
                      {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Learning Rate</Label>
                        <Input
                          type="number"
                          step="0.00001"
                          value={learningRate}
                          onChange={(e) => setLearningRate(e.target.value)}
                          className="h-7 text-xs bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Epochs</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={epochs}
                          onChange={(e) => setEpochs(e.target.value)}
                          className="h-7 text-xs bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Batch Size</Label>
                        <Input
                          type="number"
                          value={batchSize}
                          onChange={(e) => setBatchSize(e.target.value)}
                          className="h-7 text-xs bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">LoRA Rank</Label>
                        <Input
                          type="number"
                          value={loraRank}
                          onChange={(e) => setLoraRank(e.target.value)}
                          className="h-7 text-xs bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Max Tokens</Label>
                        <Input
                          type="number"
                          value={maxOutputTokens}
                          onChange={(e) => setMaxOutputTokens(e.target.value)}
                          className="h-7 text-xs bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Temperature</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          value={temperature}
                          onChange={(e) => setTemperature(e.target.value)}
                          className="h-7 text-xs bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </PopoverContent>
          </Popover>

          {/* Refresh */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => loadJobs()}
                disabled={isLoading}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Refresh jobs
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-3.5 bg-border mx-0.5" />

          {/* Start Training */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSubmit}
                disabled={!canStart}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  canStart
                    ? "text-[rgb(var(--theme-400))] hover:text-[rgb(var(--theme-300))] hover:bg-muted"
                    : "text-muted-foreground/50 cursor-not-allowed"
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Rocket className="w-3 h-3" />
                )}
                {isSubmitting ? "Starting..." : hasActiveJob ? "Job Running" : "Start Training"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {!canStartJob
                ? "Add training data and evaluator first"
                : hasActiveJob
                ? "A job is already running"
                : "Start a new finetune job"}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Full-height jobs view */}
      <div className="flex-1 min-h-0">
        <FinetuneJobsPanel />
      </div>
    </div>
  );
}
