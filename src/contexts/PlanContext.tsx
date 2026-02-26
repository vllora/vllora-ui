/**
 * PlanContext
 *
 * Single source of truth for plan state.
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
import { toast } from "sonner";
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
import { getCurrentExecution, getExecutingPlan, cancelExecution as cancelExecutionInStore } from "@/lib/distri-finetune-tools/steps/execution-state-store";
import type { Plan } from "@/lib/distri-finetune-tools/steps/propose-plan";
import { STEP_ORDER, validatePlanForExecution } from "@/lib/distri-finetune-tools/steps/execute-plan";
import type { ExecutionProgress, ExecutionStepId } from "@/lib/distri-finetune-tools/steps/execute-plan";
import type { PlanDiff } from "@/components/datasets/plan-section/plan-markdown-utils";

// ============================================================================
// Types
// ============================================================================

interface PlanContextType {
  // Plan status (single source of truth, persisted to IndexedDB)
  /** Persisted plan lifecycle status: proposed → approved → executing → completed/failed/dismissed */
  planStatus: PlanStatus | null;

  // Loading state
  /** Whether plan data is being loaded from IndexedDB on mount */
  isLoadingPlan: boolean;

  // Generation state
  /** Whether Lucy is currently generating a plan */
  isGeneratingPlan: boolean;
  /** Whether a plan has been proposed and is waiting for user action */
  hasPlanProposed: boolean;

  // Plan data
  /** The currently proposed plan (null if no plan) */
  proposedPlan: Plan | null;
  /** Diff between the current plan and the previous committed plan (null if first proposal or no diff) */
  planDiff: PlanDiff | null;

  // Execution state
  /** Whether plan execution is in progress */
  isExecuting: boolean;
  /** Current execution progress (null if not executing) */
  executionProgress: ExecutionProgress | null;
  /** The plan that was last executed (shown after completion) */
  executedPlan: Plan | null;

  // Workspace overlay state
  /** Whether the plan preview is shown in workspace (replaces tab content) */
  isPlanPreviewActive: boolean;
  /** Current plan display mode */
  planEditMode: "display" | "edit";

  // Actions
  setIsPlanPreviewActive: (active: boolean) => void;
  setPlanEditMode: (mode: "display" | "edit") => void;
  approvePlan: (plan: Plan) => void;
  dismissPlan: () => void;
  cancelExecution: () => void;
}

// ============================================================================
// Context
// ============================================================================

const PlanContext = createContext<PlanContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface PlanProviderProps {
  datasetId: string;
  children: ReactNode;
}

export function PlanProvider({ datasetId, children }: PlanProviderProps) {
  // Plan status (persisted to IndexedDB — single source of truth)
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);

  // Loading state (true until initial IndexedDB check completes)
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);

  // Generation state
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [hasPlanProposed, setHasPlanProposed] = useState(false);

  // Plan data
  const [proposedPlan, setProposedPlan] = useState<Plan | null>(null);
  const [planDiff, setPlanDiff] = useState<PlanDiff | null>(null);

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);
  const [executedPlan, setExecutedPlan] = useState<Plan | null>(null);

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
              // Don't auto-open plan preview on reload — the banner will show instead.
              // Plans auto-open via the 'vllora_plan_proposed' event during the
              // session when they're first proposed, but on reload we let the user
              // choose to view it. This also avoids showing stale "Approve & Execute"
              // for plans whose status was never updated to 'completed'.
              break;
            case 'approved':
            case 'executing': {
              setIsExecuting(true);
              if (storedPlan.executionProgress) {
                setExecutionProgress(storedPlan.executionProgress);
              }
              // Stale execution detected (page refreshed mid-execution):
              // No in-memory execution exists, but IndexedDB says 'executing'.
              // Auto-prompt Lucy to resume from the next incomplete step.
              if (storedPlan.status === 'executing' && storedPlan.executionProgress) {
                const completedStepIds = storedPlan.executionProgress.steps
                  .filter(s => s.status === 'completed')
                  .map(s => s.id);
                const resumeFromStep = STEP_ORDER.find(id => !completedStepIds.includes(id));
                if (resumeFromStep) {
                  // Delay the auto-prompt slightly so the agent has time to connect
                  setTimeout(() => {
                    if (cancelled) return;
                    emitter.emit("vllora_lucy_prompt", {
                      prompt: `The plan execution was interrupted. Steps completed: [${completedStepIds.join(', ')}]. Please call get_dataset_state first to check what already exists, then call execute_plan with only the steps that still need to run (using steps_to_execute and overrides).`,
                    });
                  }, 2000);
                }
              }
              break;
            }
            case 'completed':
              setExecutedPlan(storedPlan.plan);
              // Restore progress so plan checkboxes show all steps as completed
              if (storedPlan.executionProgress) {
                setExecutionProgress(storedPlan.executionProgress);
              }
              break;
            case 'failed':
              setExecutedPlan(storedPlan.plan);
              // Restore progress so plan checkboxes show which steps succeeded
              if (storedPlan.executionProgress) {
                setExecutionProgress(storedPlan.executionProgress);
              }
              break;
          }
        }
      } catch (error) {
        console.error('[PlanContext] Failed to load persisted plan:', error);
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

    const handleProposed = ({ datasetId: id, plan, diff }: { datasetId: string; plan: unknown; diff?: PlanDiff }) => {
      if (id === datasetId) {
        setPlanStatus('proposed');
        setIsGeneratingPlan(false);
        setHasPlanProposed(true);
        setProposedPlan(plan as Plan);
        setPlanDiff(diff ?? null);
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
            // Keep executionProgress so plan checkboxes remain checked when the
            // user navigates back to the plan tab. For both success and failure,
            // preserving progress shows which steps completed.
            // Get plan from execution store for executedPlan reference
            const planFromStore = getExecutingPlan(datasetIdRef.current);
            if (planFromStore) {
              setExecutedPlan(planFromStore);
            }
            // Keep proposedPlan intact so the user can still view it.
            // Plan is only cleared on explicit dismiss or new plan generation.

            // Don't auto-switch tabs — the user is on the plan tab watching
            // checkboxes update in real-time. Let them see the final all-green
            // state and navigate away when ready. A toast message guides them.
            if (!progress.has_error) {
              toast.success('Plan executed successfully!', {
                description: 'View your generated data in the Records tab.',
              });
            }
          }, 2000);
        }
      }
    };

    emitter.on("vllora_plan_generating", handleGenerating);
    emitter.on("vllora_plan_proposed", handleProposed);
    emitter.on("vllora_plan_dismissed", handleDismissed);
    emitter.on("vllora_workflow_updated", handleWorkflowUpdated);
    emitter.on("vllora_plan_progress", handleExecutionProgress);

    return () => {
      emitter.off("vllora_plan_generating", handleGenerating);
      emitter.off("vllora_plan_proposed", handleProposed);
      emitter.off("vllora_plan_dismissed", handleDismissed);
      emitter.off("vllora_workflow_updated", handleWorkflowUpdated);
      emitter.off("vllora_plan_progress", handleExecutionProgress);
    };
  }, [datasetId, executionProgress?.is_complete]);

  // Actions
  const approvePlan = useCallback((plan: Plan) => {
    // Validate before approving
    const stepsToRun = new Set<ExecutionStepId>(plan.steps_to_execute ?? STEP_ORDER);
    const validation = validatePlanForExecution(plan, stepsToRun, plan.overrides);
    if (!validation.valid) {
      const errorMsg = validation.errors.join('; ');
      toast.error('Plan has issues', { description: validation.errors[0] });
      emitter.emit('vllora_lucy_prompt', {
        prompt: `The plan failed validation and cannot be approved. Error: "${errorMsg}". Please fix the plan and re-propose it using adjust_plan followed by save_plan.`,
      });
      return; // Block approval
    }

    // Update plan status to 'approved' in IndexedDB (keep the plan data!)
    updatePlanStatus(datasetId, 'approved');
    setPlanStatus('approved');
    // Emit the approved plan via event (Lucy will pick it up)
    emitter.emit("vllora_plan_approved", { datasetId, plan });
    // Send a simple prompt to Lucy
    emitter.emit("vllora_lucy_prompt", {
      prompt: `I approve the plan. Please execute it now.`,
    });
    // Start showing execution progress
    setIsExecuting(true);
    // Hide plan preview during execution (workspace returns to tabs)
    setIsPlanPreviewActive(false);
  }, [datasetId]);

  const dismissPlan = useCallback(() => {
    clearProposedPlan(datasetId);
    emitter.emit("vllora_plan_dismissed", { datasetId });
    setProposedPlan(null);
    setHasPlanProposed(false);
    setIsExecuting(false);
    setExecutionProgress(null);
    setIsPlanPreviewActive(false);
  }, [datasetId]);

  const cancelExecution = useCallback(() => {
    cancelExecutionInStore(datasetId);
    toast.info("Cancelling execution after current step completes...");
  }, [datasetId]);

  const value: PlanContextType = {
    planStatus,
    isLoadingPlan,
    isGeneratingPlan,
    hasPlanProposed,
    proposedPlan,
    planDiff,
    isExecuting,
    executionProgress,
    executedPlan,
    isPlanPreviewActive,
    planEditMode,
    setIsPlanPreviewActive,
    setPlanEditMode,
    approvePlan,
    dismissPlan,
    cancelExecution,
  };

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function PlanConsumer() {
  const context = useContext(PlanContext);
  if (context === undefined) {
    throw new Error("PlanConsumer must be used within a PlanProvider");
  }
  return context;
}
