/**
 * SetupPlanContext
 *
 * Single source of truth for setup plan generation state.
 * Eliminates duplicate state — previously both DatasetDetailContentV2
 * and PlanSection independently tracked isGeneratingPlan/hasPlanProposed
 * from the same events.
 *
 * Now this context listens once and shares the result.
 *
 * Note: PlanSection still maintains its own internal state for
 * proposedPlan, isExecuting, executionProgress, executedPlan —
 * those are UI-specific to the plan editor and not shared.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { emitter } from "@/utils/eventEmitter";
import { getProposedPlan } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";

// ============================================================================
// Types
// ============================================================================

interface SetupPlanContextType {
  /** Whether Lucy is currently generating a setup plan */
  isGeneratingPlan: boolean;
  /** Whether a plan has been proposed and is waiting for user action */
  hasPlanProposed: boolean;
}

// ============================================================================
// Context
// ============================================================================

const SetupPlanContext = createContext<SetupPlanContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface SetupPlanProviderProps {
  datasetId: string;
  children: ReactNode;
}

export function SetupPlanProvider({ datasetId, children }: SetupPlanProviderProps) {
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [hasPlanProposed, setHasPlanProposed] = useState(false);

  // Check IndexedDB for persisted proposed plan on mount (survives page refresh)
  const hasCheckedPersistedPlan = useRef(false);
  useEffect(() => {
    const checkPersistedPlan = async () => {
      if (!datasetId || hasCheckedPersistedPlan.current) return;
      hasCheckedPersistedPlan.current = true;

      const persistedPlan = await getProposedPlan(datasetId);
      if (persistedPlan) {
        setHasPlanProposed(true);
      }
    };

    checkPersistedPlan();
  }, [datasetId]);

  // Listen for plan lifecycle events
  useEffect(() => {
    const handleGenerating = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        setIsGeneratingPlan(true);
      }
    };

    const handleProposed = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        setIsGeneratingPlan(false);
        setHasPlanProposed(true);
      }
    };

    const handleDismissed = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        setIsGeneratingPlan(false);
        setHasPlanProposed(false);
      }
    };

    const handleWorkflowUpdated = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        setIsGeneratingPlan(false);
        setHasPlanProposed(false);
      }
    };

    emitter.on("vllora_setup_plan_generating", handleGenerating);
    emitter.on("vllora_setup_plan_proposed", handleProposed);
    emitter.on("vllora_setup_plan_dismissed", handleDismissed);
    emitter.on("vllora_workflow_updated", handleWorkflowUpdated);

    return () => {
      emitter.off("vllora_setup_plan_generating", handleGenerating);
      emitter.off("vllora_setup_plan_proposed", handleProposed);
      emitter.off("vllora_setup_plan_dismissed", handleDismissed);
      emitter.off("vllora_workflow_updated", handleWorkflowUpdated);
    };
  }, [datasetId]);

  const value: SetupPlanContextType = {
    isGeneratingPlan,
    hasPlanProposed,
  };

  return (
    <SetupPlanContext.Provider value={value}>
      {children}
    </SetupPlanContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function SetupPlanConsumer() {
  const context = useContext(SetupPlanContext);
  if (context === undefined) {
    throw new Error("SetupPlanConsumer must be used within a SetupPlanProvider");
  }
  return context;
}
