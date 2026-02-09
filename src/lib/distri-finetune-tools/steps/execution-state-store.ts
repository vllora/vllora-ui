/**
 * Execution State Store
 *
 * A simple shared store for tracking setup plan execution progress.
 * This persists the current execution state so components that mount
 * after execution started can still access the current progress.
 */

import type { ExecutionProgress } from './execute-setup-plan';
import { emitter } from '@/utils/eventEmitter';

// Simple in-memory store for current execution per dataset
const executionStore = new Map<string, ExecutionProgress>();

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
}

// Subscribe to progress events and update the store
emitter.on('vllora_setup_plan_progress' as any, ({ progress }: { progress: ExecutionProgress }) => {
  if (progress.dataset_id) {
    executionStore.set(progress.dataset_id, progress);

    // Auto-clear completed executions after a delay
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

// Clear on workflow updated (execution fully complete)
// Note: We don't immediately clear on workflow update - the auto-clear timeout handles cleanup
emitter.on('vllora_workflow_updated', (_event: { datasetId: string }) => {
  // Intentionally empty - timeout-based cleanup is sufficient
});
