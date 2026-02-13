/**
 * SetupPlanContext
 *
 * Single source of truth for setup plan state.
 * Manages plan lifecycle: generation → proposal → approval → execution → completion.
 *
 * Previously plan state was split between PlanSection (local component state)
 * and this context (just isGenerating/hasPlanProposed). Now all state lives here
 * so both sidebar PlanCard and workspace PlanPreview can access it.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { emitter } from "@/utils/eventEmitter";
import {
  getStoredPlan,
  clearProposedPlan,
  updatePlanStatus,
  updatePlanExecution,
  completePlan,
  failPlan,
  type PlanStatus,
} from "@/lib/distri-finetune-tools/steps/proposed-plan-store";
import { getCurrentExecution, getExecutingPlan } from "@/lib/distri-finetune-tools/steps/execution-state-store";
import type { SetupPlan } from "@/lib/distri-finetune-tools/steps/propose-setup-plan";
import type { ExecutionProgress } from "@/lib/distri-finetune-tools/steps/execute-setup-plan";

// ============================================================================
// Types
// ============================================================================

interface SetupPlanContextType {
  // Plan status (single source of truth, persisted to IndexedDB)
  /** Persisted plan lifecycle status: proposed → approved → executing → completed/failed/dismissed */
  planStatus: PlanStatus | null;

  // Loading state
  /** Whether plan data is being loaded from IndexedDB on mount */
  isLoadingPlan: boolean;

  // Generation state
  /** Whether Lucy is currently generating a setup plan */
  isGeneratingPlan: boolean;
  /** Whether a plan has been proposed and is waiting for user action */
  hasPlanProposed: boolean;

  // Plan data
  /** The currently proposed plan (null if no plan) */
  proposedPlan: SetupPlan | null;

  // Execution state
  /** Whether plan execution is in progress */
  isExecuting: boolean;
  /** Current execution progress (null if not executing) */
  executionProgress: ExecutionProgress | null;
  /** The plan that was last executed (shown after completion) */
  executedPlan: SetupPlan | null;

  // Workspace overlay state
  /** Whether the plan preview is shown in workspace (replaces tab content) */
  isPlanPreviewActive: boolean;
  /** Current plan display mode */
  planEditMode: "display" | "edit";

  // Actions
  setIsPlanPreviewActive: (active: boolean) => void;
  setPlanEditMode: (mode: "display" | "edit") => void;
  approvePlan: (plan: SetupPlan) => void;
  dismissPlan: () => void;
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
  // Plan status (persisted to IndexedDB — single source of truth)
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);

  // Loading state (true until initial IndexedDB check completes)
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);

  // Generation state
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [hasPlanProposed, setHasPlanProposed] = useState(false);

  // Plan data
  const [proposedPlan, setProposedPlan] = useState<SetupPlan | null>(null);

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);
  const [executedPlan, setExecutedPlan] = useState<SetupPlan | null>(null);

  // Workspace overlay state
  const [isPlanPreviewActive, setIsPlanPreviewActive] = useState(false);
  const [planEditMode, setPlanEditMode] = useState<"display" | "edit">("display");

  // Ref to track current datasetId for use in setTimeout callbacks
  const datasetIdRef = useRef(datasetId);
  datasetIdRef.current = datasetId;

  // Check for persisted state on mount (IndexedDB + in-memory stores)
  // Uses a cancelled flag for proper cleanup — safe with React strict mode
  useEffect(() => {
    if (!datasetId) return;

    let cancelled = false;

    const loadState = async () => {
      // Check for active execution first (in-memory, lost on refresh)
      const currentExecution = getCurrentExecution(datasetId);
      const executingPlanData = getExecutingPlan(datasetId);

      if (currentExecution && !currentExecution.is_complete) {
        if (cancelled) return;
        setExecutionProgress(currentExecution);
        setIsExecuting(true);
        setPlanStatus('executing');
        if (executingPlanData) {
          setProposedPlan(executingPlanData);
        }
        setIsLoadingPlan(false);
        return;
      }

      if (executingPlanData) {
        if (cancelled) return;
        // Execution completed but we have the plan — show as executed
        setExecutedPlan(executingPlanData);
        setPlanStatus('completed');
        setIsLoadingPlan(false);
        return;
      }

      // Check IndexedDB for a persisted plan (survives page refresh)
      try {
        const storedPlan = await getStoredPlan(datasetId);
        if (cancelled) return;
        if (storedPlan) {
          setPlanStatus(storedPlan.status);
          setProposedPlan(storedPlan.plan);

          switch (storedPlan.status) {
            case 'proposed':
              setHasPlanProposed(true);
              setIsPlanPreviewActive(true);
              setPlanEditMode("display");
              break;
            case 'approved':
            case 'executing':
              setIsExecuting(true);
              if (storedPlan.executionProgress) {
                setExecutionProgress(storedPlan.executionProgress);
              }
              break;
            case 'completed':
              setExecutedPlan(storedPlan.plan);
              break;
            case 'failed':
              setExecutedPlan(storedPlan.plan);
              if (storedPlan.executionProgress) {
                setExecutionProgress(storedPlan.executionProgress);
              }
              break;
          }
        }
      } catch (error) {
        console.error('[SetupPlanContext] Failed to load persisted plan:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingPlan(false);
        }
      }
    };

    loadState();

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  // Listen for plan lifecycle events
  useEffect(() => {
    const handleGenerating = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        setIsGeneratingPlan(true);
      }
    };

    const handleProposed = ({ datasetId: id, plan }: { datasetId: string; plan: unknown }) => {
      if (id === datasetId) {
        setPlanStatus('proposed');
        setIsGeneratingPlan(false);
        setHasPlanProposed(true);
        setProposedPlan(plan as SetupPlan);
        setIsExecuting(false);
        setExecutionProgress(null);
        // Clear executed plan when new plan is proposed
        setExecutedPlan(null);
        // Show the plan preview in workspace
        setIsPlanPreviewActive(true);
        setPlanEditMode("display");
      }
    };

    const handleDismissed = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        setPlanStatus(null);
        setIsGeneratingPlan(false);
        setHasPlanProposed(false);
        setProposedPlan(null);
        setIsExecuting(false);
        setExecutionProgress(null);
        setIsPlanPreviewActive(false);
      }
    };

    const handleWorkflowUpdated = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        // Only transition if execution is complete
        if (executionProgress?.is_complete) {
          setIsExecuting(false);
          setExecutionProgress(null);
          // Keep proposedPlan and hasPlanProposed so the plan is still viewable
        }
      }
    };

    const handleExecutionProgress = ({ progress }: { progress: ExecutionProgress }) => {
      if (progress.dataset_id === datasetId) {
        setExecutionProgress(progress);
        if (!progress.is_complete) {
          setIsExecuting(true);
          setPlanStatus('executing');
          // Persist progress to IndexedDB (write-through)
          updatePlanExecution(datasetId, progress);
        }
        if (progress.is_complete) {
          // Persist final status to IndexedDB
          if (progress.has_error) {
            failPlan(datasetId, progress);
            setPlanStatus('failed');
          } else {
            completePlan(datasetId, progress);
            setPlanStatus('completed');
          }
          // Keep showing progress briefly, then transition
          setTimeout(() => {
            // Guard: if user navigated to a different dataset, skip stale update
            if (datasetIdRef.current !== progress.dataset_id) return;
            setIsExecuting(false);
            setExecutionProgress(null);
            // Get plan from execution store for executedPlan reference
            const planFromStore = getExecutingPlan(datasetIdRef.current);
            if (planFromStore) {
              setExecutedPlan(planFromStore);
            }
            // Keep proposedPlan intact so the user can still view it.
            // Plan is only cleared on explicit dismiss or new plan generation.
            setIsPlanPreviewActive(false);
          }, 2000);
        }
      }
    };

    emitter.on("vllora_setup_plan_generating", handleGenerating);
    emitter.on("vllora_setup_plan_proposed", handleProposed);
    emitter.on("vllora_setup_plan_dismissed", handleDismissed);
    emitter.on("vllora_workflow_updated", handleWorkflowUpdated);
    emitter.on("vllora_setup_plan_progress", handleExecutionProgress);

    return () => {
      emitter.off("vllora_setup_plan_generating", handleGenerating);
      emitter.off("vllora_setup_plan_proposed", handleProposed);
      emitter.off("vllora_setup_plan_dismissed", handleDismissed);
      emitter.off("vllora_workflow_updated", handleWorkflowUpdated);
      emitter.off("vllora_setup_plan_progress", handleExecutionProgress);
    };
  }, [datasetId, executionProgress?.is_complete]);

  // Actions
  const approvePlan = useCallback((plan: SetupPlan) => {
    // Update plan status to 'approved' in IndexedDB (keep the plan data!)
    updatePlanStatus(datasetId, 'approved');
    setPlanStatus('approved');
    // Emit the approved plan via event (Lucy will pick it up)
    emitter.emit("vllora_setup_plan_approved", { datasetId, plan });
    // Send a simple prompt to Lucy
    emitter.emit("vllora_lucy_prompt", {
      prompt: `I approve the setup plan. Please execute it now.`,
    });
    // Start showing execution progress
    setIsExecuting(true);
    // Hide plan preview during execution (workspace returns to tabs)
    setIsPlanPreviewActive(false);
  }, [datasetId]);

  const dismissPlan = useCallback(() => {
    clearProposedPlan(datasetId);
    emitter.emit("vllora_setup_plan_dismissed", { datasetId });
    setProposedPlan(null);
    setHasPlanProposed(false);
    setIsExecuting(false);
    setExecutionProgress(null);
    setIsPlanPreviewActive(false);
  }, [datasetId]);

  const value: SetupPlanContextType = {
    planStatus,
    isLoadingPlan,
    isGeneratingPlan,
    hasPlanProposed,
    proposedPlan,
    isExecuting,
    executionProgress,
    executedPlan,
    isPlanPreviewActive,
    planEditMode,
    setIsPlanPreviewActive,
    setPlanEditMode,
    approvePlan,
    dismissPlan,
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
