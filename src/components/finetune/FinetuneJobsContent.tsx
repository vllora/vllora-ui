/**
 * FinetuneJobsContent
 *
 * Table-based display for finetune jobs with expandable rows.
 * Uses dialog for creating new finetune jobs with configurable parameters.
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
  Plus,
  Settings2,
  StopCircle,
  Play,
  Clock,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import {
  FinetuneJob,
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_INFERENCE_PARAMETERS,
  ReinforcementTrainingConfig,
  ReinforcementInferenceParameters,
  cancelReinforcementJob,
  resumeReinforcementJob,
  getFinetuneEvaluations,
  FinetuneEvalResultsResponse,
} from "@/services/finetune-api";
import { quickFinetune } from "@/services/quick-finetune";
import { formatDistanceToNow, differenceInSeconds, differenceInMinutes, differenceInHours } from "date-fns";
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

function formatDuration(startDate: string, endDate?: string | null): string {
  try {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();

    const hours = differenceInHours(end, start);
    const minutes = differenceInMinutes(end, start) % 60;
    const seconds = differenceInSeconds(end, start) % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  } catch {
    return "-";
  }
}

function getModelDisplayName(modelId: string): string {
  const model = BASE_MODELS.find(m => m.value === modelId);
  return model?.label || modelId;
}

// ============================================================================
// Epoch Summary Component
// ============================================================================

interface EpochSummaryProps {
  results: FinetuneEvalResultsResponse['results'];
}

function EpochSummary({ results }: EpochSummaryProps) {
  // Collect all epochs across all rows
  const epochStats = new Map<number, { scores: number[]; count: number }>();

  for (const row of results) {
    for (const [epochStr, evalResults] of Object.entries(row.epochs)) {
      const epoch = parseInt(epochStr, 10);
      if (!epochStats.has(epoch)) {
        epochStats.set(epoch, { scores: [], count: 0 });
      }
      const stats = epochStats.get(epoch)!;
      for (const result of evalResults) {
        stats.count++;
        if (typeof result.score === 'number') {
          stats.scores.push(result.score);
        }
      }
    }
  }

  // Sort epochs
  const sortedEpochs = Array.from(epochStats.entries()).sort(([a], [b]) => a - b);

  if (sortedEpochs.length === 0) {
    return <div className="text-xs text-muted-foreground">No epoch data available</div>;
  }

  // Calculate average scores per epoch
  const epochData = sortedEpochs.map(([epoch, stats]) => {
    const avgScore = stats.scores.length > 0
      ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
      : null;
    return { epoch, avgScore, count: stats.count };
  });

  return (
    <div className="space-y-2">
      {/* Epoch Progress Bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-16">Epochs:</span>
        <div className="flex gap-1">
          {epochData.map(({ epoch, avgScore }) => (
            <div
              key={epoch}
              className={cn(
                "w-8 h-6 rounded text-xs flex items-center justify-center font-mono",
                avgScore !== null
                  ? avgScore >= 0.7
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : avgScore >= 0.4
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
              )}
              title={`Epoch ${epoch}: ${avgScore !== null ? `${(avgScore * 100).toFixed(1)}%` : 'No score'}`}
            >
              {epoch}
            </div>
          ))}
        </div>
      </div>

      {/* Score Summary Table */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">Total Rows:</span>
        <span className="font-mono">{results.length}</span>

        <span className="text-muted-foreground">Latest Epoch:</span>
        <span className="font-mono">{epochData[epochData.length - 1]?.epoch ?? '-'}</span>

        {epochData.length > 0 && epochData[epochData.length - 1].avgScore !== null && (
          <>
            <span className="text-muted-foreground">Latest Avg Score:</span>
            <span className={cn(
              "font-mono",
              epochData[epochData.length - 1].avgScore! >= 0.7
                ? "text-green-600"
                : epochData[epochData.length - 1].avgScore! >= 0.4
                ? "text-yellow-600"
                : "text-red-600"
            )}>
              {(epochData[epochData.length - 1].avgScore! * 100).toFixed(1)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Job Table Row Component
// ============================================================================

interface JobTableRowProps {
  job: FinetuneJob;
  onJobAction?: () => void;
}

function JobTableRow({ job, onJobAction }: JobTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [evalResults, setEvalResults] = useState<FinetuneEvalResultsResponse | null>(null);
  const [isLoadingEvals, setIsLoadingEvals] = useState(false);
  const [isRefreshingEvals, setIsRefreshingEvals] = useState(false);
  const [evalsError, setEvalsError] = useState<string | null>(null);

  const canCancel = job.status === 'pending' || job.status === 'running';
  const canResume = job.status === 'cancelled';
  const isActive = job.status === 'pending' || job.status === 'running';

  // Fetch evaluations function (reusable for initial, poll, and manual refresh)
  const fetchEvaluations = useCallback(async (options: { isInitial?: boolean; isManualRefresh?: boolean } = {}) => {
    const { isInitial = false, isManualRefresh = false } = options;

    if (!job.dataset_id) return;

    if (isInitial) {
      setIsLoadingEvals(true);
      setEvalsError(null);
    }
    if (isManualRefresh) {
      setIsRefreshingEvals(true);
    }

    try {
      const results = await getFinetuneEvaluations(job.dataset_id, job.provider_job_id);
      setEvalResults(results);
      setEvalsError(null);
    } catch (error) {
      setEvalsError(error instanceof Error ? error.message : 'Failed to load evaluations');
    } finally {
      if (isInitial) setIsLoadingEvals(false);
      if (isManualRefresh) setIsRefreshingEvals(false);
    }
  }, [job.dataset_id, job.provider_job_id]);

  // Fetch evaluation results when expanded, poll while running
  useEffect(() => {
    if (!isExpanded || !job.dataset_id) return;

    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // Initial fetch
    fetchEvaluations({ isInitial: true });

    // Poll every 20 seconds while job is running
    if (isActive) {
      pollInterval = setInterval(() => {
        if (isMounted) {
          fetchEvaluations();
        }
      }, 20000);
    }

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isExpanded, job.dataset_id, isActive, fetchEvaluations]);

  // Manual refresh handler
  const handleRefreshMetrics = useCallback(() => {
    fetchEvaluations({ isManualRefresh: true });
  }, [fetchEvaluations]);

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

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <>
      {/* Main Row */}
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors group"
        onClick={toggleExpand}
      >
        {/* Expand Icon + Run Name/ID */}
        <TableCell className="font-medium w-[220px]">
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate" title={job.provider_job_id}>
                {job.provider_job_id.slice(0, 12)}...
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(job.created_at)}
              </span>
            </div>
          </div>
        </TableCell>

        {/* Status */}
        <TableCell className="w-[120px]">
          <FinetuneJobStatusBadge status={job.status} />
        </TableCell>

        {/* Base Model */}
        <TableCell className="w-[180px]">
          <span className="text-sm">{getModelDisplayName(job.base_model)}</span>
        </TableCell>

        {/* Duration */}
        <TableCell className="w-[140px]">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDuration(job.created_at, job.completed_at)}</span>
            {isActive && <span className="text-xs">(running)</span>}
          </div>
        </TableCell>

        {/* Actions */}
        <TableCell className="w-[100px]">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-100"
                onClick={handleCancel}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <StopCircle className="h-3.5 w-3.5" />
                )}
                Cancel
              </Button>
            )}
            {canResume && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={handleResume}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Resume
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded Content Row */}
      {isExpanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={5} className="p-0">
            <div className="px-6 py-4 space-y-4">
              {/* Error Log Section */}
              {job.error_message && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-red-600 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Error Log
                  </h4>
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 rounded-md text-xs font-mono">
                    {job.error_message}
                  </div>
                </div>
              )}

              {/* Job Details */}
              <div className="grid grid-cols-2 gap-6">
                {/* Left Column - Job Info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Job Details
                  </h4>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                    <span className="text-muted-foreground">Provider:</span>
                    <span className="font-mono">{job.provider}</span>

                    <span className="text-muted-foreground">Full Job ID:</span>
                    <span className="font-mono truncate" title={job.provider_job_id}>
                      {job.provider_job_id}
                    </span>

                    {job.fine_tuned_model && (
                      <>
                        <span className="text-muted-foreground">Output Model:</span>
                        <span className="font-mono text-green-600 truncate" title={job.fine_tuned_model}>
                          {job.fine_tuned_model}
                        </span>
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

                {/* Right Column - Hyperparameters */}
                {job.training_config && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Hyperparameters
                    </h4>
                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                      <span className="text-muted-foreground">Learning Rate:</span>
                      <span className="font-mono">{job.training_config.learning_rate ?? "default"}</span>

                      <span className="text-muted-foreground">Epochs:</span>
                      <span className="font-mono">{job.training_config.epochs ?? "default"}</span>

                      <span className="text-muted-foreground">Batch Size:</span>
                      <span className="font-mono">{job.training_config.batch_size ?? "default"}</span>

                      <span className="text-muted-foreground">LoRA Rank:</span>
                      <span className="font-mono">{job.training_config.lora_rank ?? "default"}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Training Metrics Section */}
              {job.dataset_id && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      Training Metrics
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={handleRefreshMetrics}
                      disabled={isLoadingEvals || isRefreshingEvals}
                    >
                      <RefreshCw className={cn("h-3 w-3", isRefreshingEvals && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>
                  {isLoadingEvals ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading evaluation metrics...
                    </div>
                  ) : evalsError ? (
                    <div className="text-xs text-muted-foreground py-2">
                      {evalsError.includes('404') ? 'No evaluation metrics available yet' : evalsError}
                    </div>
                  ) : evalResults && evalResults.results.length > 0 ? (
                    <div className="space-y-3">
                      {/* Summary Stats */}
                      <EpochSummary results={evalResults.results} />
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-2">
                      No evaluation metrics available yet
                    </div>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ============================================================================
// New Job Dialog Component
// ============================================================================

interface NewJobDialogProps {
  datasetId: string;
  onSuccess: () => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NewJobDialog({ datasetId, onSuccess, disabled, open, onOpenChange }: NewJobDialogProps) {
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

// ============================================================================
// Main Component
// ============================================================================

interface FinetuneJobsContentProps {
  datasetId?: string;
  canCreateJob?: boolean;
}

export function FinetuneJobsContent({ datasetId, canCreateJob = true }: FinetuneJobsContentProps) {
  const { filteredJobs, isLoading, error, loadJobs } = useFinetuneJobs();
  const [showNewJobDialog, setShowNewJobDialog] = useState(false);

  // Calculate active jobs count from filtered jobs
  const activeJobsCount = filteredJobs.filter(
    (job) => job.status === 'pending' || job.status === 'running'
  ).length;
  const hasActiveJob = activeJobsCount > 0;
  const canStartNewJob = canCreateJob && datasetId && !hasActiveJob;

  const handleJobCreated = useCallback(() => {
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
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {filteredJobs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {datasetId && (
            <Button
              variant="default"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowNewJobDialog(true)}
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
      <div className="flex-1 overflow-auto">
        {isLoading && filteredJobs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="m-4 flex items-center gap-2 p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : filteredJobs.length === 0 ? (
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[220px]">Run Name / ID</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[180px]">Base Model</TableHead>
                <TableHead className="w-[140px]">Duration</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => (
                <JobTableRow key={job.id} job={job} onJobAction={loadJobs} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* New Job Dialog */}
      {datasetId && (
        <NewJobDialog
          datasetId={datasetId}
          onSuccess={handleJobCreated}
          disabled={hasActiveJob}
          open={showNewJobDialog}
          onOpenChange={setShowNewJobDialog}
        />
      )}
    </div>
  );
}
