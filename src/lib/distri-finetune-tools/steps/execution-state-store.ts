/**
 * Execution State Store
 *
 * A simple shared store for tracking plan execution progress.
 * This persists the current execution state so components that mount
 * after execution started can still access the current progress.
 */

import type { ExecutionProgress } from './execute-plan';
import type { Plan } from './propose-plan';
import { emitter } from '@/utils/eventEmitter';
import { updatePlanStatus, updatePlanExecution, completePlan, failPlan } from './proposed-plan-store';

// Simple in-memory store for current execution per dataset
const executionStore = new Map<string, ExecutionProgress>();

// Store the plan being executed (so we can show it during execution)
const executingPlanStore = new Map<string, Plan>();

// Cancellation flags — checked between steps during execution
const cancelledDatasets = new Set<string>();

/**
 * Get current execution progress for a dataset
 */
export function getCurrentExecution(workflowId: string): ExecutionProgress | null {
  return executionStore.get(workflowId) || null;
}

/**
 * Check if a dataset has an active (not complete) execution
 */
export function hasActiveExecution(workflowId: string): boolean {
  const progress = executionStore.get(workflowId);
  return !!progress && !progress.is_complete;
}

/**
 * Clear execution state for a dataset
 */
export function clearExecution(workflowId: string): void {
  executionStore.delete(workflowId);
  executingPlanStore.delete(workflowId);
}

/**
 * Get the plan currently being executed for a dataset
 */
export function getExecutingPlan(workflowId: string): Plan | null {
  return executingPlanStore.get(workflowId) || null;
}

/**
 * Set the plan being executed for a dataset
 */
export function setExecutingPlan(workflowId: string, plan: Plan): void {
  executingPlanStore.set(workflowId, plan);
}

/**
 * Request cancellation of an active execution.
 * The execution loop checks this flag between steps.
 */
export function cancelExecution(workflowId: string): void {
  cancelledDatasets.add(workflowId);
}

/**
 * Check if execution has been cancelled for a dataset.
 */
export function isExecutionCancelled(workflowId: string): boolean {
  return cancelledDatasets.has(workflowId);
}

/**
 * Clear the cancellation flag (called after the execution loop acknowledges it).
 */
export function clearCancellation(workflowId: string): void {
  cancelledDatasets.delete(workflowId);
}

// Subscribe to progress events and update the store (write-through to IndexedDB)
emitter.on('vllora_plan_progress' as any, ({ progress }: { progress: ExecutionProgress }) => {
  if (progress.workflow_id) {
    executionStore.set(progress.workflow_id, progress);

    // Write-through: persist execution progress to IndexedDB
    if (progress.is_complete) {
      if (progress.has_error) {
        failPlan(progress.workflow_id, progress);
      } else {
        completePlan(progress.workflow_id, progress);
      }
    } else {
      updatePlanExecution(progress.workflow_id, progress);
    }

    // Auto-clear in-memory store after a delay (IndexedDB retains the data)
    if (progress.is_complete) {
      setTimeout(() => {
        const current = executionStore.get(progress.workflow_id);
        // Only clear if it's still the same execution
        if (current && current.is_complete) {
          executionStore.delete(progress.workflow_id);
        }
      }, 5000);
    }
  }
});

// Store the plan when it's approved for execution
emitter.on('vllora_plan_approved', ({ workflowId, plan }: { workflowId: string; plan: unknown }) => {
  if (workflowId && plan) {
    executingPlanStore.set(workflowId, plan as Plan);
    // Persist status to IndexedDB (PlanContext also does this, but belt-and-suspenders)
    updatePlanStatus(workflowId, 'approved');
  }
});

// Clear on workflow updated (execution fully complete)
// Note: We don't immediately clear on workflow update - the auto-clear timeout handles cleanup
emitter.on('vllora_workflow_updated', (_event: { workflowId: string }) => {
  // Intentionally empty - timeout-based cleanup is sufficient
});
