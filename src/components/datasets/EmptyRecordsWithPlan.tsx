/**
 * EmptyRecordsWithPlan
 *
 * Wrapper component that shows either the EmptyRecordsState or a SetupPlanCard
 * when Lucy proposes a setup plan. This allows the plan to be displayed in the
 * main content area (right panel) instead of inline in the chat.
 */

import { useEffect, useState } from "react";
import { emitter } from "@/utils/eventEmitter";
import { EmptyRecordsState } from "./EmptyRecordsState";
import { SetupPlanCard } from "./lucy-plan-card";
import type { SetupPlan } from "@/lib/distri-finetune-tools/steps/propose-setup-plan";

interface EmptyRecordsWithPlanProps {
  datasetId: string;
  datasetObjective?: string;
  hasTopicHierarchy?: boolean;
}

export function EmptyRecordsWithPlan({
  datasetId,
  datasetObjective,
  hasTopicHierarchy,
}: EmptyRecordsWithPlanProps) {
  const [proposedPlan, setProposedPlan] = useState<SetupPlan | null>(null);

  // Listen for setup plan proposed events
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
      }
    };

    const handlePlanDismissed = ({
      datasetId: dismissedDatasetId,
    }: {
      datasetId: string;
    }) => {
      if (dismissedDatasetId === datasetId) {
        setProposedPlan(null);
      }
    };

    // Also clear plan when workflow is updated (after execution)
    const handleWorkflowUpdated = ({
      datasetId: updatedDatasetId,
    }: {
      datasetId: string;
    }) => {
      if (updatedDatasetId === datasetId) {
        setProposedPlan(null);
      }
    };

    emitter.on("vllora_setup_plan_proposed", handlePlanProposed);
    emitter.on("vllora_setup_plan_dismissed", handlePlanDismissed);
    emitter.on("vllora_workflow_updated", handleWorkflowUpdated);

    return () => {
      emitter.off("vllora_setup_plan_proposed", handlePlanProposed);
      emitter.off("vllora_setup_plan_dismissed", handlePlanDismissed);
      emitter.off("vllora_workflow_updated", handleWorkflowUpdated);
    };
  }, [datasetId]);

  const handleApprove = (approvedPlan: SetupPlan) => {
    // Emit event to trigger Lucy with approval message
    emitter.emit("vllora_lucy_prompt", {
      prompt: `I approve the setup plan. Please execute it now using the execute_setup_plan tool with the following plan:\n\n${JSON.stringify(approvedPlan)}`,
    });
    // Clear the plan from the right panel - execution progress will be shown in chat
    setProposedPlan(null);
  };

  // If we have a proposed plan, show the SetupPlanCard
  if (proposedPlan) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-auto">
        <div className="w-full max-w-2xl">
          <SetupPlanCard plan={proposedPlan} onApprove={handleApprove} />
        </div>
      </div>
    );
  }

  // Otherwise show the default empty state
  return (
    <EmptyRecordsState
      datasetObjective={datasetObjective}
      hasTopicHierarchy={hasTopicHierarchy}
    />
  );
}
