/**
 * Dataset Context Store
 *
 * A simple store that holds the current dataset page context.
 * The datasets page updates this store, and composite tools read from it.
 *
 * This solves the problem where context is lost when orchestrator calls sub-agents,
 * since the sub-agent call only passes the task description, not the full context.
 */

import type { DatasetContext } from './types';

/**
 * The current dataset context, updated by the datasets page.
 * Tools can read from this as a fallback when context is not passed through the agent chain.
 */
let currentContext: DatasetContext | null = null;

/**
 * Update the stored context. Called by the datasets page when context changes.
 */
export function setDatasetContext(context: DatasetContext): void {
  currentContext = context;
}

/**
 * Get the current stored context.
 * Returns null if no context has been set.
 */
export function getDatasetContext(): DatasetContext | null {
  return currentContext;
}

/**
 * Clear the stored context. Called when leaving the datasets page.
 */
export function clearDatasetContext(): void {
  currentContext = null;
}

/**
 * Merge passed context with stored context.
 * Uses passed context values when available, falls back to stored context.
 * This allows tools to work even when context is partially passed or not passed at all.
 */
export function mergeWithStoredContext(passedContext?: Partial<DatasetContext>): DatasetContext | null {
  if (!currentContext && !passedContext) {
    return null;
  }

  if (!currentContext) {
    return passedContext as DatasetContext;
  }

  if (!passedContext) {
    return currentContext;
  }

  // Merge: passed context takes precedence, but fill in missing fields from stored context
  return {
    ...currentContext,
    ...passedContext,
    // Ensure arrays are properly merged (don't overwrite with undefined)
    dataset_names: passedContext.dataset_names ?? currentContext.dataset_names,
    selected_record_ids: passedContext.selected_record_ids ?? currentContext.selected_record_ids,
    expanded_dataset_ids: passedContext.expanded_dataset_ids ?? currentContext.expanded_dataset_ids,
  };
}
