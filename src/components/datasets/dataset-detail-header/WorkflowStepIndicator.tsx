/**
 * WorkflowStepIndicator
 *
 * Simplified milestone-based workflow indicator showing 4 key stages:
 * 1. Data Preparation (topics_config, categorize, coverage_generation)
 * 2. Evaluation Config (grader_config, dry_run)
 * 3. Finetune (training)
 * 4. Deploy (deployment)
 *
 * Milestones are marked complete based on actual achievements, not workflow steps.
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
import { Check, Loader2, Database, FlaskConical, Sparkles, Rocket } from "lucide-react";

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
    label: "Data Preparation",
    short: "Data",
    icon: Database,
    steps: DATA_PREP_STEPS,
  },
  {
    id: "eval_config",
    label: "Evaluation Config",
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
}

type MilestoneStatus = "completed" | "in_progress" | "pending";

export function WorkflowStepIndicator({
  datasetId,
  className,
  hasRecords = false,
  hasEvalFunction = false,
  hasCompletedFinetuneJob = false,
  hasDeployedModel = false,
  onEvalConfigClick,
}: WorkflowStepIndicatorProps) {
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [loading, setLoading] = useState(true);

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

    window.addEventListener("finetune-workflow-updated" as any, handleWorkflowUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("finetune-workflow-updated" as any, handleWorkflowUpdate);
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
                        status === "completed" && "bg-emerald-500/20 text-emerald-500",
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
                        status === "completed" && "text-emerald-500",
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
                        status === "completed" && "bg-emerald-500/20 text-emerald-500",
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
                          <p className="text-emerald-500 text-[10px]">✓ Dataset has records ready</p>
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
                          <p className="text-emerald-500 text-[10px]">✓ Evaluation function configured</p>
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
                          <p className="text-emerald-500 text-[10px]">✓ Training completed successfully</p>
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
                          <p className="text-emerald-500 text-[10px]">✓ Model deployed and ready</p>
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
                      ? "bg-emerald-500/40"
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
