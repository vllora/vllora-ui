/**
 * Lucy Prompt Utilities
 *
 * Pure utility functions for building Lucy assistant prompts.
 */

import type { Dataset } from "@/types/dataset-types";
import type { FinetuneWorkflowState } from "@/services/finetune-workflow-db";

/**
 * Parameters for building the auto-analysis prompt
 */
interface BuildAnalysisPromptParams {
  dataset: Dataset;
  workflow: FinetuneWorkflowState | null;
}

/**
 * Builds a contextual prompt for Lucy to auto-analyze a dataset.
 * Used when user first opens a dataset detail page.
 */
export function buildDatasetAnalysisPrompt({ dataset, workflow }: BuildAnalysisPromptParams): string {
  const name = dataset.name;
  const objective = dataset.datasetObjective;
  const hasTopics = !!(dataset.topicHierarchy?.hierarchy?.length);
  const hasEvaluator = !!(
    dataset.evaluationConfig &&
    ((dataset.evaluationConfig.type === 'js' && dataset.evaluationConfig.script) ||
     (dataset.evaluationConfig.type === 'llm_as_judge' && dataset.evaluationConfig.promptTemplate))
  );
  const workflowStep = workflow?.currentStep || 'not_started';

  let prompt = `I'm viewing the dataset "${name}". `;

  if (objective) {
    prompt += `Training objective: "${objective}". `;
  }

  if (hasTopics) {
    prompt += `Has topic hierarchy configured. `;
  }

  if (hasEvaluator) {
    prompt += `Has evaluator configured. `;
  }

  if (workflow && workflowStep !== 'not_started' && workflowStep !== 'completed') {
    prompt += `Workflow is at step: ${workflowStep}. `;
  }

  prompt += `Please analyze the current state and recommend what I should do next.`;

  return prompt;
}
