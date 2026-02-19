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

/**
 * Get current execution progress for a dataset
 */
export function getCurrentExecution(datasetId: string): ExecutionProgress | null {
  return executionStore.get(datasetId) || null;
}

/**
 * Check if a dataset has an active (not complete) execution
 */
export function hasActiveExecution(datasetId: string): boolean {
  const progress = executionStore.get(datasetId);
  return !!progress && !progress.is_complete;
}

/**
 * Clear execution state for a dataset
 */
export function clearExecution(datasetId: string): void {
  executionStore.delete(datasetId);
  executingPlanStore.delete(datasetId);
}

/**
 * Get the plan currently being executed for a dataset
 */
export function getExecutingPlan(datasetId: string): Plan | null {
  return executingPlanStore.get(datasetId) || null;
}

/**
 * Set the plan being executed for a dataset
 */
export function setExecutingPlan(datasetId: string, plan: Plan): void {
  executingPlanStore.set(datasetId, plan);
}

// Subscribe to progress events and update the store (write-through to IndexedDB)
emitter.on('vllora_plan_progress' as any, ({ progress }: { progress: ExecutionProgress }) => {
  if (progress.dataset_id) {
    executionStore.set(progress.dataset_id, progress);

    // Write-through: persist execution progress to IndexedDB
    if (progress.is_complete) {
      if (progress.has_error) {
        failPlan(progress.dataset_id, progress);
      } else {
        completePlan(progress.dataset_id, progress);
      }
    } else {
      updatePlanExecution(progress.dataset_id, progress);
    }

    // Auto-clear in-memory store after a delay (IndexedDB retains the data)
    if (progress.is_complete) {
      setTimeout(() => {
        const current = executionStore.get(progress.dataset_id);
        // Only clear if it's still the same execution
        if (current && current.is_complete) {
          executionStore.delete(progress.dataset_id);
        }
      }, 5000);
    }
  }
});

// Store the plan when it's approved for execution
emitter.on('vllora_plan_approved', ({ datasetId, plan }: { datasetId: string; plan: unknown }) => {
  if (datasetId && plan) {
    executingPlanStore.set(datasetId, plan as Plan);
    // Persist status to IndexedDB (PlanContext also does this, but belt-and-suspenders)
    updatePlanStatus(datasetId, 'approved');
  }
});

// Clear on workflow updated (execution fully complete)
// Note: We don't immediately clear on workflow update - the auto-clear timeout handles cleanup
emitter.on('vllora_workflow_updated', (_event: { datasetId: string }) => {
  // Intentionally empty - timeout-based cleanup is sufficient
});
