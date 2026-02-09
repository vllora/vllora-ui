/**
 * Lucy Prompt Utilities
 *
 * Pure utility functions for building Lucy assistant prompts.
 *
 * Note: Lucy already receives dataset context (name, objective, workflow state)
 * via the context injection system (workflowToContext). These prompts should
 * focus on user INTENT, not repeat context Lucy already has.
 */

import type { Dataset } from "@/types/dataset-types";
import type { FinetuneWorkflowState } from "@/services/finetune-workflow-db";

/**
 * Parameters for building the auto-analysis prompt
 */
interface BuildAnalysisPromptParams {
  dataset: Dataset;
  workflow?: FinetuneWorkflowState | null; // Not used - context injected separately
  recordCount?: number;
}

/**
 * Builds a contextual prompt for Lucy to auto-analyze a dataset.
 * Used when user first opens a dataset detail page.
 *
 * Special handling for empty datasets to guide users toward data generation.
 *
 * Note: Dataset name, objective, and workflow state are already available
 * to Lucy via context injection - prompts focus on intent/action.
 */
export function buildDatasetAnalysisPrompt({ dataset, recordCount }: BuildAnalysisPromptParams): string {
  const objective = dataset.datasetObjective;
  const hasTopics = !!(dataset.topicHierarchy?.hierarchy?.length);
  const isEmpty = recordCount === 0 || recordCount === undefined;

  // Special prompt for empty datasets - focus on getting started
  if (isEmpty) {
    if (objective) {
      if (hasTopics) {
        return `Help me generate initial training data. I'd like 10-15 seed examples distributed across the topic categories to get started.`;
      } else {
        return `Help me get started with this dataset. What's the best approach - generate topics first or start with data directly?`;
      }
    } else {
      return `Help me define the training objective for this dataset. What should this model be trained to do?`;
    }
  }

  // Standard prompt for datasets with records
  return `What should I do next with this dataset?`;
}
