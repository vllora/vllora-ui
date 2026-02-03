/**
 * FinetuneJobsContent
 *
 * Inline content for displaying finetune jobs within a tab.
 * Includes inline form for creating new finetune jobs with configurable parameters.
 */

import { useFinetuneJobs } from "@/contexts/FinetuneJobsContext";
import { FinetuneJobStatusBadge } from "./FinetuneJobStatusBadge";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
  Plus,
  X,
  Settings2,
  StopCircle,
  Play,
} from "lucide-react";
import { useState, useCallback } from "react";
import {
  FinetuneJob,
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_INFERENCE_PARAMETERS,
  ReinforcementTrainingConfig,
  ReinforcementInferenceParameters,
  cancelReinforcementJob,
  resumeReinforcementJob,
} from "@/services/finetune-api";
import { quickFinetune } from "@/services/quick-finetune";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// Available base models
const BASE_MODELS = [
  { value: "llama-v3-8b-instruct", label: "Llama 3 8B Instruct" },
  { value: "llama-v3-70b-instruct", label: "Llama 3 70B Instruct" },
  { value: "gemma-2-9b-it", label: "Gemma 2 9B IT" },
  { value: "gemma-2-27b-it", label: "Gemma 2 27B IT" },
];

function formatDate(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

interface JobItemProps {
  job: FinetuneJob;
  onJobAction?: () => void;
}

function JobItem({ job, onJobAction }: JobItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const canCancel = job.status === 'pending' || job.status === 'running';
  const canResume = job.status === 'cancelled';

  const handleCancel = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActionLoading) return;

    setIsActionLoading(true);
    try {
      await cancelReinforcementJob(job.provider_job_id);
      toast.success('Job cancelled successfully');
      onJobAction?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel job');
    } finally {
      setIsActionLoading(false);
    }
  }, [job.provider_job_id, isActionLoading, onJobAction]);

  const handleResume = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActionLoading) return;

    setIsActionLoading(true);
    try {
      await resumeReinforcementJob(job.provider_job_id);
      toast.success('Job resumed successfully');
      onJobAction?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resume job');
    } finally {
      setIsActionLoading(false);
    }
  }, [job.provider_job_id, isActionLoading, onJobAction]);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-start gap-3 hover:bg-accent/50 transition-colors text-left">
            <div className="mt-0.5">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm truncate">
                  {job.base_model}
                </span>
                <FinetuneJobStatusBadge status={job.status} />
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(job.created_at)}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-3 text-sm border-t">
            <div className="pt-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <span className="text-muted-foreground">Provider:</span>
                <span className="font-mono">{job.provider}</span>

                <span className="text-muted-foreground">Job ID:</span>
                <span className="font-mono truncate" title={job.provider_job_id}>
                  {job.provider_job_id}
                </span>

                {job.fine_tuned_model && (
                  <>
                    <span className="text-muted-foreground">Output Model:</span>
                    <span className="font-mono truncate text-green-600" title={job.fine_tuned_model}>
                      {job.fine_tuned_model}
                    </span>
                  </>
                )}

                {job.training_config && (
                  <>
                    <span className="text-muted-foreground">Epochs:</span>
                    <span>{job.training_config.epochs ?? "N/A"}</span>

                    <span className="text-muted-foreground">Batch Size:</span>
                    <span>{job.training_config.batch_size ?? "N/A"}</span>

                    <span className="text-muted-foreground">Learning Rate:</span>
                    <span>{job.training_config.learning_rate ?? "N/A"}</span>
                  </>
                )}

                {job.completed_at && (
                  <>
                    <span className="text-muted-foreground">Completed:</span>
                    <span>{formatDate(job.completed_at)}</span>
                  </>
                )}
              </div>
            </div>

            {job.error_message && (
              <div className="flex items-start gap-2 p-2 bg-red-50 text-red-800 rounded text-xs">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{job.error_message}</span>
              </div>
            )}

            {/* Job Actions */}
            {(canCancel || canResume) && (
              <div className="flex justify-end gap-2 pt-1">
                {canCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={handleCancel}
                    disabled={isActionLoading}
                  >
                    {isActionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <StopCircle className="h-3.5 w-3.5" />
                    )}
                    Cancel Job
                  </Button>
                )}
                {canResume && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={handleResume}
                    disabled={isActionLoading}
                  >
                    {isActionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Resume Job
                  </Button>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface NewJobFormProps {
  datasetId: string;
  onCancel: () => void;
  onSuccess: () => void;
  disabled?: boolean;
}

function NewJobForm({ datasetId, onCancel, onSuccess, disabled }: NewJobFormProps) {
  const [baseModel, setBaseModel] = useState("llama-v3-8b-instruct");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Training config
  const [learningRate, setLearningRate] = useState(String(DEFAULT_TRAINING_CONFIG.learning_rate));
  const [epochs, setEpochs] = useState(String(DEFAULT_TRAINING_CONFIG.epochs));
  const [batchSize, setBatchSize] = useState(String(DEFAULT_TRAINING_CONFIG.batch_size));
  const [loraRank, setLoraRank] = useState(String(DEFAULT_TRAINING_CONFIG.lora_rank));

  // Inference parameters
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(DEFAULT_INFERENCE_PARAMETERS.max_output_tokens));
  const [temperature, setTemperature] = useState(String(DEFAULT_INFERENCE_PARAMETERS.temperature));

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
        onSuccess();
      } else {
        toast.error(result.error || "Failed to start finetune job");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start finetune job");
    } finally {
      setIsSubmitting(false);
    }
  }, [datasetId, baseModel, learningRate, epochs, batchSize, loraRank, maxOutputTokens, temperature, isSubmitting, onSuccess]);

  return (
    <div className="border border-border rounded-lg bg-background/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2 text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          New Finetune Job
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Base Model Selection */}
      <div className="space-y-2">
        <Label htmlFor="base-model" className="text-xs text-muted-foreground">Base Model</Label>
        <Select value={baseModel} onValueChange={setBaseModel}>
          <SelectTrigger id="base-model" className="h-9 text-sm bg-background border-border">
            <SelectValue placeholder="Select base model" />
          </SelectTrigger>
          <SelectContent>
            {BASE_MODELS.map((model) => (
              <SelectItem key={model.value} value={model.value} className="text-sm">
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Advanced Settings Toggle */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs px-2 -ml-2 text-muted-foreground hover:text-foreground">
            <Settings2 className="h-3.5 w-3.5" />
            {showAdvanced ? "Hide" : "Show"} Advanced Settings
            {showAdvanced ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-3 space-y-4">
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
                  className="h-8 text-sm bg-background border-border"
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
                  className="h-8 text-sm bg-background border-border"
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
                  className="h-8 text-sm bg-background border-border"
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
                  className="h-8 text-sm bg-background border-border"
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
                  className="h-8 text-sm bg-background border-border"
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
                  className="h-8 text-sm bg-background border-border"
                  placeholder="0.7"
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleSubmit}
          disabled={isSubmitting || disabled}
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
    </div>
  );
}

interface FinetuneJobsContentProps {
  datasetId?: string;
  canCreateJob?: boolean;
}

export function FinetuneJobsContent({ datasetId, canCreateJob = true }: FinetuneJobsContentProps) {
  const { filteredJobs, isLoading, error, loadJobs } = useFinetuneJobs();
  const [showNewJobForm, setShowNewJobForm] = useState(false);

  // Calculate active jobs count from filtered jobs
  const activeJobsCount = filteredJobs.filter(
    (job) => job.status === 'pending' || job.status === 'running'
  ).length;
  const hasActiveJob = activeJobsCount > 0;
  const canStartNewJob = canCreateJob && datasetId && !hasActiveJob;

  const handleJobCreated = useCallback(() => {
    setShowNewJobForm(false);
    loadJobs();
  }, [loadJobs]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Finetune Jobs</span>
          {filteredJobs.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({filteredJobs.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {datasetId && !showNewJobForm && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowNewJobForm(true)}
              disabled={!canStartNewJob}
              title={hasActiveJob ? "A job is already in progress" : undefined}
            >
              <Plus className="h-3.5 w-3.5" />
              New Job
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => loadJobs()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          {/* New Job Form */}
          {showNewJobForm && datasetId && (
            <NewJobForm
              datasetId={datasetId}
              onCancel={() => setShowNewJobForm(false)}
              onSuccess={handleJobCreated}
              disabled={hasActiveJob}
            />
          )}

          {/* Job List */}
          {isLoading && filteredJobs.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 text-sm text-red-600 bg-red-50 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : filteredJobs.length === 0 && !showNewJobForm ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No finetune jobs yet</p>
              <p className="text-xs mt-1 max-w-xs mx-auto">
                {datasetId
                  ? "Click 'New Job' to start a finetune job"
                  : "Start a finetune job using the Finetune button to see your jobs here"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map((job) => (
                <JobItem key={job.id} job={job} onJobAction={loadJobs} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
