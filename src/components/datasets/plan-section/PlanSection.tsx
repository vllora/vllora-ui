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
import { cn } from "@/lib/utils";
import { emitter } from "@/utils/eventEmitter";
import { SetupPlanEditor, planToMarkdown } from "./SetupPlanEditor";
import { ExecutionProgressCard } from "./ExecutionProgressCard";
import { PlanEmptyState } from "./PlanEmptyState";
import { PlanLoadingState } from "./PlanLoadingState";
import { PlanExecutedView } from "./PlanExecutedView";
import type { SetupPlan } from "@/lib/distri-finetune-tools/steps/propose-setup-plan";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import type { ExecutionProgress } from "@/lib/distri-finetune-tools/steps/execute-setup-plan";
// Side-effect import to ensure the event listener for plan approval is registered
import "@/lib/distri-finetune-tools/steps/execute-setup-plan";
// Import execution state store to get current execution on mount
import { getCurrentExecution, getExecutingPlan } from "@/lib/distri-finetune-tools/steps/execution-state-store";
// Import proposed plan store for persistence across page refresh
import { getProposedPlan, clearProposedPlan } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";

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
  // Track the last executed plan to show as read-only after completion
  const [executedPlan, setExecutedPlan] = useState<SetupPlan | null>(null);
  const [showExecutedPlan, setShowExecutedPlan] = useState(false);

  // On mount, check for:
  // 1. Active execution in progress (handles tab switching during execution)
  // 2. Persisted proposed plan (handles page refresh)
  useEffect(() => {
    const loadState = async () => {
      console.log('[PlanSection] loadState called for datasetId:', datasetId);
      const currentExecution = getCurrentExecution(datasetId);
      const executingPlan = getExecutingPlan(datasetId);

      console.log('[PlanSection] currentExecution:', currentExecution);
      console.log('[PlanSection] executingPlan:', executingPlan);

      if (currentExecution && !currentExecution.is_complete) {
        setExecutionProgress(currentExecution);
        setIsExecuting(true);
        if (executingPlan) {
          setProposedPlan(executingPlan);
        }
      } else if (executingPlan) {
        // Execution completed but we have the plan - show it as read-only
        setExecutedPlan(executingPlan);
        setShowExecutedPlan(true);
      } else {
        // Check IndexedDB for a persisted proposed plan (survives page refresh)
        console.log('[PlanSection] Checking IndexedDB for proposed plan...');
        const persistedPlan = await getProposedPlan(datasetId);
        console.log('[PlanSection] Persisted plan from IndexedDB:', persistedPlan ? 'FOUND' : 'NOT FOUND');
        if (persistedPlan) {
          setProposedPlan(persistedPlan);
        }
      }
    };

    if (datasetId) {
      loadState();
    }
  }, [datasetId]);

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
        // Clear executed plan when new plan is proposed
        setShowExecutedPlan(false);
        setExecutedPlan(null);
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
        // If we receive progress and execution is not complete, ensure isExecuting is true
        // This handles the case where user navigates to Plan tab after execution started
        if (!progress.is_complete) {
          setIsExecuting(true);
        }
        if (progress.is_complete) {
          // Keep showing progress briefly, then transition to showing executed plan
          setTimeout(() => {
            setIsExecuting(false);
            setExecutionProgress(null);
            // Get plan from execution store to avoid stale closure issue
            // (proposedPlan captured at effect setup time may be stale)
            const planFromStore = getExecutingPlan(datasetId);
            if (planFromStore) {
              setExecutedPlan(planFromStore);
              setShowExecutedPlan(true);
            }
            setProposedPlan(null);
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
    // Clear persisted plan from IndexedDB (it's now being executed)
    clearProposedPlan(datasetId);
    // Emit the approved plan via event (Lucy will pick it up)
    emitter.emit("vllora_setup_plan_approved", { datasetId, plan: approvedPlan });
    // Send a simple prompt to Lucy (the plan data is passed via event, not in the message)
    emitter.emit("vllora_lucy_prompt", {
      prompt: `I approve the setup plan. Please execute it now.`,
    });
    // Start showing execution progress - keep the plan so we can show markdown
    setIsExecuting(true);
    // Keep proposedPlan so we can display markdown during execution
  };

  const handleDismiss = () => {
    // Clear persisted plan from IndexedDB
    clearProposedPlan(datasetId);
    emitter.emit("vllora_setup_plan_dismissed", { datasetId });
    setProposedPlan(null);
    setIsExecuting(false);
    setExecutionProgress(null);
  };

  // Show loading state while generating (controlled by parent)
  if (isGeneratingPlan) {
    return <PlanLoadingState className={className} />;
  }

  // Show execution progress while plan is being executed
  // Also show if we have in-progress execution data (handles tab switching during execution)
  if (isExecuting || (executionProgress && !executionProgress.is_complete)) {
    return (
      <div className={cn("flex-1 flex overflow-hidden", className)}>
        {/* Plan markdown on the left */}
        {proposedPlan && (
          <div className="flex-1 overflow-auto border-r border-border">
            <div className="p-4 text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
              <LazyMarkdownRenderer content={planToMarkdown(proposedPlan)} />
            </div>
          </div>
        )}
        {/* Execution progress on the right */}
        <div className={cn(
          "flex flex-col items-center justify-start p-6 overflow-auto",
          proposedPlan ? "w-[400px] shrink-0" : "flex-1"
        )}>
          <div className="w-full max-w-lg sticky top-0">
            <ExecutionProgressCard
              initialProgress={executionProgress || undefined}
              onComplete={() => {
                // Will auto-clear after timeout in the progress handler
              }}
            />
          </div>
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

  // Show executed plan in read-only mode after completion
  if (showExecutedPlan && executedPlan) {
    return (
      <PlanExecutedView
        plan={executedPlan}
        onClear={() => {
          setShowExecutedPlan(false);
          setExecutedPlan(null);
        }}
        className={className}
      />
    );
  }

  // Empty state - no plan active
  return <PlanEmptyState className={className} />;
}
