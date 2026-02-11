/**
 * WorkflowStepIndicator
 *
 * Shows either:
 * - Setup plan execution progress (5 steps: Topics → Generate → Eval → Upload → Dry Run)
 * - Or simplified milestone-based workflow indicator (4 stages: Data → Eval → Train → Deploy)
 *
 * Automatically switches to execution mode when a setup plan is running.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type FinetuneStep,
  type FinetuneWorkflowState,
  getWorkflowByDataset,
} from "@/services/finetune-workflow-db";
import { emitter } from "@/utils/eventEmitter";
import type { ExecutionProgress, ExecutionStepStatus } from "@/lib/distri-finetune-tools/steps/execute-setup-plan";
import { Check, Loader2, Database, FlaskConical, Sparkles, Rocket, FolderTree, FileText, Upload, PlayCircle, XCircle } from "lucide-react";

// Map original workflow steps to milestones
const DATA_PREP_STEPS: FinetuneStep[] = ["topics_config", "categorize", "coverage_generation"];
const EVAL_CONFIG_STEPS: FinetuneStep[] = ["grader_config", "dry_run"];
const TRAINING_STEPS: FinetuneStep[] = ["training"];
const DEPLOY_STEPS: FinetuneStep[] = ["deployment"];

type MilestoneId = "data_prep" | "eval_config" | "finetune" | "deploy";

interface Milestone {
  id: MilestoneId;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  steps: FinetuneStep[];
}

const MILESTONES: Milestone[] = [
  {
    id: "data_prep",
    label: "Data",
    short: "Data",
    icon: Database,
    steps: DATA_PREP_STEPS,
  },
  {
    id: "eval_config",
    label: "Evaluation",
    short: "Eval",
    icon: FlaskConical,
    steps: EVAL_CONFIG_STEPS,
  },
  {
    id: "finetune",
    label: "Finetune",
    short: "Train",
    icon: Sparkles,
    steps: TRAINING_STEPS,
  },
  {
    id: "deploy",
    label: "Deploy",
    short: "Deploy",
    icon: Rocket,
    steps: DEPLOY_STEPS,
  },
];

interface WorkflowStepIndicatorProps {
  datasetId: string;
  className?: string;
  /** Whether the dataset has records */
  hasRecords?: boolean;
  /** Whether the grader/eval function is configured */
  hasEvalFunction?: boolean;
  /** Whether at least one finetune job has completed */
  hasCompletedFinetuneJob?: boolean;
  /** Whether a model has been deployed */
  hasDeployedModel?: boolean;
  /** Callback when eval config milestone is clicked */
  onEvalConfigClick?: () => void;
  /** Display variant: 'horizontal' (default) or 'checklist' */
  variant?: 'horizontal' | 'checklist';
}

type MilestoneStatus = "completed" | "in_progress" | "pending";

// Execution step icons mapping
const EXECUTION_STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  topics: FolderTree,
  generate: FileText,
  grader: FlaskConical,
  upload: Upload,
  dryrun: PlayCircle,
};

export function WorkflowStepIndicator({
  datasetId,
  className,
  hasRecords = false,
  hasEvalFunction = false,
  hasCompletedFinetuneJob = false,
  hasDeployedModel = false,
  onEvalConfigClick,
  variant = 'horizontal',
}: WorkflowStepIndicatorProps) {
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadWorkflow() {
      try {
        const wf = await getWorkflowByDataset(datasetId);
        if (mounted) {
          setWorkflow(wf);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load workflow:", err);
        if (mounted) setLoading(false);
      }
    }

    loadWorkflow();

    const handleWorkflowUpdate = (event: CustomEvent<{ datasetId: string }>) => {
      if (event.detail.datasetId === datasetId) {
        loadWorkflow();
      }
    };

    // Listen for execution progress events
    const handleExecutionProgress = ({ progress }: { progress: ExecutionProgress }) => {
      if (progress.dataset_id === datasetId) {
        setExecutionProgress(progress);
        // Auto-clear after completion
        if (progress.is_complete) {
          setTimeout(() => {
            if (mounted) {
              setExecutionProgress(null);
              loadWorkflow(); // Refresh workflow state
            }
          }, 3000);
        }
      }
    };

    window.addEventListener("finetune-workflow-updated" as any, handleWorkflowUpdate);
    emitter.on("vllora_setup_plan_progress" as any, handleExecutionProgress);

    return () => {
      mounted = false;
      window.removeEventListener("finetune-workflow-updated" as any, handleWorkflowUpdate);
      emitter.off("vllora_setup_plan_progress" as any, handleExecutionProgress);
    };
  }, [datasetId]);

  // Determine milestone status based on actual achievements and workflow state
  const getMilestoneStatus = (milestone: Milestone): MilestoneStatus => {
    // Check completion based on actual achievements (not workflow steps)
    switch (milestone.id) {
      case "data_prep":
        if (hasRecords) return "completed";
        break;
      case "eval_config":
        if (hasEvalFunction) return "completed";
        break;
      case "finetune":
        if (hasCompletedFinetuneJob) return "completed";
        break;
      case "deploy":
        if (hasDeployedModel) return "completed";
        break;
    }

    // Check if any underlying step is in progress
    if (workflow) {
      const currentStep = workflow.currentStep;
      if (milestone.steps.includes(currentStep as FinetuneStep)) {
        return "in_progress";
      }

      // Check step statuses for in_progress
      for (const step of milestone.steps) {
        const status = workflow.stepStatus[step];
        if (status === "in_progress") {
          return "in_progress";
        }
      }
    }

    return "pending";
  };

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show execution progress if a setup plan is running
  if (executionProgress && !executionProgress.is_complete) {
    return (
      <TooltipProvider delayDuration={100}>
        <div className={cn("flex items-center flex-1", className)}>
          {executionProgress.steps.map((step, index) => {
            const isLast = index === executionProgress.steps.length - 1;
            const Icon = EXECUTION_STEP_ICONS[step.id] || Database;

            const getStatusColor = (status: ExecutionStepStatus) => {
              switch (status) {
                case "completed":
                  return "bg-[rgba(var(--theme-500),0.2)] text-[rgb(var(--theme-500))]";
                case "running":
                  return "bg-primary/20 text-primary ring-2 ring-primary/30";
                case "failed":
                  return "bg-red-500/20 text-red-500";
                default:
                  return "bg-zinc-800 text-zinc-500";
              }
            };

            const getTextColor = (status: ExecutionStepStatus) => {
              switch (status) {
                case "completed":
                  return "text-[rgb(var(--theme-500))]";
                case "running":
                  return "text-primary";
                case "failed":
                  return "text-red-500";
                default:
                  return "text-zinc-500";
              }
            };

            const getConnectorColor = (status: ExecutionStepStatus) => {
              return status === "completed" ? "bg-[rgba(var(--theme-500),0.4)]" : "bg-zinc-700";
            };

            return (
              <div key={step.id} className="flex flex-1 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      {/* Circle indicator */}
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                          getStatusColor(step.status)
                        )}
                      >
                        {step.status === "running" ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : step.status === "completed" ? (
                          <Check className="w-3 h-3" />
                        ) : step.status === "failed" ? (
                          <XCircle className="w-3 h-3" />
                        ) : (
                          <Icon className="w-3 h-3" />
                        )}
                      </div>
                      {/* Short label */}
                      <span
                        className={cn(
                          "text-[11px] font-medium hidden sm:inline",
                          getTextColor(step.status)
                        )}
                      >
                        {step.name.split(" ")[0]}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <div className="space-y-1">
                      <div className="font-semibold">{step.name}</div>
                      {step.message && (
                        <p className="text-muted-foreground">{step.message}</p>
                      )}
                      {step.error && (
                        <p className="text-red-400">{step.error}</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>

                {/* Connector line */}
                {!isLast && (
                  <div
                    className={cn(
                      "flex-1 h-[2px] mx-2 min-w-4",
                      getConnectorColor(step.status)
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  // Checklist variant: vertical list with clean styling
  if (variant === 'checklist') {
    return (
      <TooltipProvider delayDuration={100}>
        <div className={cn("flex flex-col gap-1.5", className)}>
          {MILESTONES.map((milestone, index) => {
            const status = getMilestoneStatus(milestone);
            const isClickable = milestone.id === "eval_config" && onEvalConfigClick;
            const handleClick = isClickable ? onEvalConfigClick : undefined;

            return (
              <Tooltip key={milestone.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleClick}
                    disabled={!isClickable}
                    className={cn(
                      "flex items-center gap-2 text-xs transition-colors text-left",
                      isClickable && "cursor-pointer hover:text-[rgb(var(--theme-500))]",
                      !isClickable && "cursor-default"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded flex items-center justify-center text-[10px] font-medium shrink-0",
                        status === "completed" && "bg-[rgb(var(--theme-500))] text-white",
                        status === "in_progress" && "bg-[rgba(var(--theme-500),0.2)] text-[rgb(var(--theme-500))]",
                        status === "pending" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {status === "completed" ? (
                        <Check className="w-2.5 h-2.5" />
                      ) : status === "in_progress" ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        status === "completed" && "text-[rgb(var(--theme-600))]",
                        status === "in_progress" && "text-[rgb(var(--theme-500))] font-medium",
                        status === "pending" && "text-muted-foreground"
                      )}
                    >
                      {milestone.label}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {milestone.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  // Default: show milestone-based workflow indicator (horizontal)
  return (
    <TooltipProvider delayDuration={100}>
      <div className={cn("flex items-center flex-1", className)}>
        {MILESTONES.map((milestone, index) => {
          const status = getMilestoneStatus(milestone);
          const isLast = index === MILESTONES.length - 1;
          const Icon = milestone.icon;

          // Eval config is clickable
          const isClickable = milestone.id === "eval_config" && onEvalConfigClick;
          const handleClick = isClickable ? onEvalConfigClick : undefined;

          return (
            <div key={milestone.id} className="flex flex-1 items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleClick}
                    disabled={!isClickable}
                    className={cn(
                      "flex items-center gap-1.5 transition-all",
                      isClickable && "cursor-pointer hover:opacity-80",
                      !isClickable && "cursor-default"
                    )}
                  >
                    {/* Circle indicator */}
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                        status === "completed" && "bg-[rgba(var(--theme-500),0.2)] text-[rgb(var(--theme-500))]",
                        status === "in_progress" && "bg-primary/20 text-primary ring-2 ring-primary/30",
                        status === "pending" && "bg-zinc-800 text-zinc-500"
                      )}
                    >
                      {status === "in_progress" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : status === "completed" ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                    </div>
                    {/* Label */}
                    <span
                      className={cn(
                        "text-[11px] font-medium hidden sm:inline",
                        status === "completed" && "text-[rgb(var(--theme-500))]",
                        status === "in_progress" && "text-primary",
                        status === "pending" && "text-zinc-500"
                      )}
                    >
                      {milestone.short}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[280px]">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{milestone.label}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded capitalize",
                        status === "completed" && "bg-[rgba(var(--theme-500),0.2)] text-[rgb(var(--theme-500))]",
                        status === "in_progress" && "bg-primary/20 text-primary",
                        status === "pending" && "bg-muted text-muted-foreground"
                      )}>
                        {status === "in_progress" ? "In progress" : status}
                      </span>
                    </div>

                    {milestone.id === "data_prep" && (
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          Prepare your training data by organizing records into topics
                          and ensuring balanced coverage across categories.
                        </p>
                        <p className="text-foreground text-[10px]">
                          <span className="font-medium">Includes:</span> Topic configuration, categorization, synthetic data generation
                        </p>
                        {hasRecords ? (
                          <p className="text-[rgb(var(--theme-500))] text-[10px]">✓ Dataset has records ready</p>
                        ) : (
                          <p className="text-amber-500 text-[10px]">→ Add records to get started</p>
                        )}
                      </div>
                    )}

                    {milestone.id === "eval_config" && (
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          Configure how model outputs will be evaluated for quality.
                          Run dry runs to validate your setup before training.
                        </p>
                        <p className="text-foreground text-[10px]">
                          <span className="font-medium">Includes:</span> Grader configuration, validation dry runs
                        </p>
                        {hasEvalFunction ? (
                          <p className="text-[rgb(var(--theme-500))] text-[10px]">✓ Evaluation function configured</p>
                        ) : (
                          <p className="text-amber-500 text-[10px]">→ Set up an evaluation function</p>
                        )}
                      </div>
                    )}

                    {milestone.id === "finetune" && (
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          Train a custom model on your prepared dataset.
                          The model learns from your examples to match your use case.
                        </p>
                        {hasCompletedFinetuneJob ? (
                          <p className="text-[rgb(var(--theme-500))] text-[10px]">✓ Training completed successfully</p>
                        ) : (
                          <p className="text-amber-500 text-[10px]">→ Start a training job</p>
                        )}
                      </div>
                    )}

                    {milestone.id === "deploy" && (
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          Deploy your trained model to make it available for inference.
                          Once deployed, you can use it in your applications.
                        </p>
                        {hasDeployedModel ? (
                          <p className="text-[rgb(var(--theme-500))] text-[10px]">✓ Model deployed and ready</p>
                        ) : (
                          <p className="text-amber-500 text-[10px]">→ Deploy your trained model</p>
                        )}
                      </div>
                    )}

                    {isClickable && status !== "completed" && (
                      <div className="text-primary font-medium border-t border-zinc-700 pt-2 mt-2">
                        Click to configure →
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>

              {/* Connector line - flexible to fill space */}
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-[2px] mx-2 min-w-4",
                    status === "completed"
                      ? "bg-[rgba(var(--theme-500),0.4)]"
                      : "bg-zinc-700"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
