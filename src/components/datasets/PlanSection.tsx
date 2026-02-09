/**
 * PlanSection
 *
 * Dedicated section for setup plan management:
 * - Loading state when Lucy is generating a setup plan
 * - SetupPlanEditor when a plan is proposed
 * - ExecutionProgressCard when plan is being executed
 * - Empty state when no plan is active
 */

import { useEffect, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import { SetupPlanEditor, ExecutionProgressCard } from "./lucy-plan-card";
import type { SetupPlan } from "@/lib/distri-finetune-tools/steps/propose-setup-plan";
import type { ExecutionProgress } from "@/lib/distri-finetune-tools/steps/execute-setup-plan";
// Side-effect import to ensure the event listener for plan approval is registered
import "@/lib/distri-finetune-tools/steps/execute-setup-plan";

interface PlanSectionProps {
  datasetId: string;
  isGeneratingPlan?: boolean;
  className?: string;
}

export function PlanSection({
  datasetId,
  isGeneratingPlan = false,
  className,
}: PlanSectionProps) {
  const [proposedPlan, setProposedPlan] = useState<SetupPlan | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);

  // Listen for setup plan events
  useEffect(() => {
    const handlePlanProposed = ({
      datasetId: planDatasetId,
      plan,
    }: {
      datasetId: string;
      plan: unknown;
    }) => {
      if (planDatasetId === datasetId) {
        setProposedPlan(plan as SetupPlan);
        setIsExecuting(false);
        setExecutionProgress(null);
      }
    };

    const handlePlanDismissed = ({
      datasetId: dismissedDatasetId,
    }: {
      datasetId: string;
    }) => {
      if (dismissedDatasetId === datasetId) {
        setProposedPlan(null);
        setIsExecuting(false);
        setExecutionProgress(null);
      }
    };

    const handleWorkflowUpdated = ({
      datasetId: updatedDatasetId,
    }: {
      datasetId: string;
    }) => {
      if (updatedDatasetId === datasetId) {
        // Only clear if execution is complete
        if (executionProgress?.is_complete) {
          setProposedPlan(null);
          setIsExecuting(false);
          setExecutionProgress(null);
        }
      }
    };

    const handleExecutionProgress = ({
      progress,
    }: {
      progress: ExecutionProgress;
    }) => {
      if (progress.dataset_id === datasetId) {
        setExecutionProgress(progress);
        if (progress.is_complete) {
          // Keep showing progress for 2 seconds then clear
          setTimeout(() => {
            setIsExecuting(false);
            setProposedPlan(null);
            setExecutionProgress(null);
          }, 2000);
        }
      }
    };

    emitter.on("vllora_setup_plan_proposed", handlePlanProposed);
    emitter.on("vllora_setup_plan_dismissed", handlePlanDismissed);
    emitter.on("vllora_workflow_updated", handleWorkflowUpdated);
    emitter.on("vllora_setup_plan_progress" as any, handleExecutionProgress);

    return () => {
      emitter.off("vllora_setup_plan_proposed", handlePlanProposed);
      emitter.off("vllora_setup_plan_dismissed", handlePlanDismissed);
      emitter.off("vllora_workflow_updated", handleWorkflowUpdated);
      emitter.off("vllora_setup_plan_progress" as any, handleExecutionProgress);
    };
  }, [datasetId, executionProgress?.is_complete]);

  const handleApprove = (approvedPlan: SetupPlan) => {
    // Emit the approved plan via event (Lucy will pick it up)
    emitter.emit("vllora_setup_plan_approved", { datasetId, plan: approvedPlan });
    // Send a simple prompt to Lucy (the plan data is passed via event, not in the message)
    emitter.emit("vllora_lucy_prompt", {
      prompt: `I approve the setup plan. Please execute it now.`,
    });
    // Start showing execution progress instead of clearing
    setIsExecuting(true);
    setProposedPlan(null);
  };

  const handleDismiss = () => {
    emitter.emit("vllora_setup_plan_dismissed", { datasetId });
    setProposedPlan(null);
    setIsExecuting(false);
    setExecutionProgress(null);
  };

  const handleGeneratePlan = () => {
    emitter.emit("vllora_lucy_prompt", {
      prompt: `Please analyze my dataset and create a setup plan using the propose_setup_plan tool.`,
    });
  };

  // Show loading state while generating (controlled by parent)
  if (isGeneratingPlan) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
        <div className="flex flex-col items-center gap-6 max-w-sm text-center">
          <div className="space-y-2">
            <h3 className="text-base font-medium text-foreground">
              Creating your setup plan
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Lucy is analyzing your documents and creating a customized plan for generating training data...
            </p>
          </div>
          <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[rgb(var(--theme-500))] rounded-full"
              style={{
                animation: "progress 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>
        <style>{`
          @keyframes progress {
            0% { width: 0%; }
            50% { width: 100%; }
            100% { width: 0%; }
          }
        `}</style>
      </div>
    );
  }

  // Show execution progress while plan is being executed
  if (isExecuting) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
        <div className="w-full max-w-lg">
          <ExecutionProgressCard
            initialProgress={executionProgress || undefined}
            onComplete={() => {
              // Will auto-clear after timeout in the progress handler
            }}
          />
        </div>
      </div>
    );
  }

  // Show the plan editor if a plan is proposed
  if (proposedPlan) {
    return (
      <div className={cn("flex-1 overflow-hidden", className)}>
        <SetupPlanEditor
          plan={proposedPlan}
          onApprove={handleApprove}
          onDismiss={handleDismiss}
        />
      </div>
    );
  }

  // Empty state - no plan active
  return (
    <div className={cn("flex-1 flex flex-col items-center justify-center p-8", className)}>
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(var(--theme-500))]/15 to-[rgb(var(--theme-500))]/5 flex items-center justify-center">
          <Wand2 className="w-6 h-6 text-[rgb(var(--theme-500))]" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-foreground">
            Setup Plan
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Let Lucy analyze your dataset and create a customized setup plan.
            She'll suggest topics, generate training data, and configure evaluation.
          </p>
        </div>

        {/* CTA */}
        <Button
          onClick={handleGeneratePlan}
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          <Sparkles className="w-4 h-4" />
          Generate Setup Plan
        </Button>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          You can also ask Lucy directly in the chat to create a plan
        </p>
      </div>
    </div>
  );
}
