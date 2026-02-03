/**
 * WorkflowStepIndicator
 *
 * Compact stepper showing the full finetune workflow with all steps visible.
 * Users can see the complete flow at a glance.
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
import { Check, Loader2 } from "lucide-react";
import { StepIcon } from "./StepIcon";

// Steps in order (excluding not_started and completed which are pseudo-steps)
const WORKFLOW_STEPS: { step: FinetuneStep; label: string; short: string }[] = [
  { step: "topics_config", label: "Topics Configuration", short: "Topics" },
  { step: "categorize", label: "Categorization", short: "Categorize" },
  { step: "coverage_generation", label: "Coverage & Generation", short: "Coverage" },
  { step: "grader_config", label: "Grader Configuration", short: "Grader" },
  { step: "dry_run", label: "Dry Run Validation", short: "Dry Run" },
  { step: "training", label: "Training", short: "Train" },
  { step: "deployment", label: "Deployment", short: "Deploy" },
];

interface WorkflowStepIndicatorProps {
  datasetId: string;
  className?: string;
}

export function WorkflowStepIndicator({ datasetId, className }: WorkflowStepIndicatorProps) {
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadWorkflow() {
      try {
        const wf = await getWorkflowByDataset(datasetId);
        console.log("=== Workflow:", wf);
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

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workflow) {
    return null;
  }

  const isCompleted = workflow.currentStep === "completed";
  const isNotStarted = workflow.currentStep === "not_started";

  return (
    <TooltipProvider delayDuration={100}>
      <div className={cn("flex items-center gap-1", className)}>
        <span className="text-xs text-muted-foreground mr-1">Finetune:</span>

        {WORKFLOW_STEPS.map((stepInfo, index) => {
          const status = workflow.stepStatus[stepInfo.step];
          // When not started, no step is current
          const isCurrent = !isNotStarted && workflow.currentStep === stepInfo.step;
          const isLast = index === WORKFLOW_STEPS.length - 1;

          return (
            <div key={stepInfo.step} className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors cursor-default",
                      isCurrent && "bg-primary/10 text-primary font-medium",
                      status === "completed" && "text-emerald-600",
                      status === "failed" && "bg-destructive/10 text-destructive",
                      status === "skipped" && "text-muted-foreground/50",
                      status === "pending" && !isCurrent && "text-muted-foreground"
                    )}
                  >
                    <div className="w-3.5 h-3.5 flex items-center justify-center">
                      <StepIcon status={status} isCurrent={isCurrent} />
                    </div>
                    <span className="hidden sm:inline">{stepInfo.short}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="font-medium">{stepInfo.label}</div>
                  <div className="text-muted-foreground capitalize">
                    {isCurrent ? "In progress" : status}
                  </div>
                </TooltipContent>
              </Tooltip>

              {/* Connector */}
              {!isLast && (
                <div
                  className={cn(
                    "w-2 h-px mx-0.5",
                    status === "completed" || status === "skipped"
                      ? "bg-emerald-500/50"
                      : "bg-muted-foreground/20"
                  )}
                />
              )}
            </div>
          );
        })}

        {/* Completed badge */}
        {isCompleted && (
          <div className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[11px] font-medium">
            <Check className="w-3 h-3" />
            <span>Done</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
