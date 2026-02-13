/**
 * Lucy Prompt Utilities
 *
 * Minimal intent signals sent to Lucy on dataset open.
 * Lucy already receives full dataset context (name, objective, workflow state,
 * plan status) via context injection (workflowToContext) and can call
 * get_dataset_state for details. These prompts just signal user intent.
 */

/**
 * Auto-trigger prompt when user opens a dataset.
 * Two cases:
 * - Empty dataset → direct Lucy to create a setup plan (matches Plan-First Trigger)
 * - Has records → let Lucy decide next steps based on injected context
 */
export function buildDatasetAnalysisPrompt(isEmpty: boolean): string {
  if (isEmpty) {
    return `I just opened this new dataset. Please create a setup plan so we can get started.`;
  }
  return `I just opened this dataset. What should we do next?`;
}
