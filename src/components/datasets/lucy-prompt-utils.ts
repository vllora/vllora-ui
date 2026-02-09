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
  knowledgeSourcesCount?: number;
}

/**
 * Builds a contextual prompt for Lucy to auto-analyze a dataset.
 * Used when user first opens a dataset detail page.
 *
 * Special handling for empty datasets to guide users through the onboarding flow:
 * 1. If no objective: Help define it
 * 2. If objective but no knowledge sources: Prompt to upload documents
 * 3. If objective and knowledge sources: Generate a setup plan
 *
 * Note: Dataset name, objective, and workflow state are already available
 * to Lucy via context injection - prompts focus on intent/action.
 */
export function buildDatasetAnalysisPrompt({
  dataset,
  recordCount,
  knowledgeSourcesCount = 0,
}: BuildAnalysisPromptParams): string {
  const objective = dataset.datasetObjective;
  const hasTopics = !!(dataset.topicHierarchy?.hierarchy?.length);
  const isEmpty = recordCount === 0 || recordCount === undefined;
  const hasKnowledgeSources = knowledgeSourcesCount > 0;

  // Special prompt for empty datasets - guide through onboarding
  if (isEmpty) {
    // No objective yet - help define it
    if (!objective) {
      return `Help me define the training objective for this dataset. What should this model be trained to do?`;
    }

    // Has objective and knowledge sources - propose a setup plan
    if (hasKnowledgeSources) {
      return `I have uploaded ${knowledgeSourcesCount} document(s) for this dataset. Please use the propose_setup_plan tool to analyze my documents and create a comprehensive setup plan including topic hierarchy, data generation strategy, and evaluation criteria. I'd like to see the full plan before we proceed.`;
    }

    // Has objective but no knowledge sources - prompt to upload
    if (!hasKnowledgeSources) {
      return `This is a new dataset and I want to set it up for fine-tuning. Do you have any reference documents (PDFs, text files) that contain the knowledge you want the model to learn? You can drag & drop them here. If you don't have documents, I can help you get started with a general approach based on the training objective.`;
    }

    // Has topics already (rare for empty dataset)
    if (hasTopics) {
      return `Help me generate initial training data. I'd like 10-15 seed examples distributed across the topic categories to get started.`;
    }
  }

  // Standard prompt for datasets with records
  return `What should I do next with this dataset?`;
}

/**
 * Builds a prompt specifically for the guided onboarding flow
 * after user uploads knowledge sources.
 */
export function buildPostUploadPrompt(knowledgeSourcesCount: number): string {
  return `I've uploaded ${knowledgeSourcesCount} document(s). Please analyze them and use the propose_setup_plan tool to create a complete setup plan for this dataset. Show me the plan with topic hierarchy, data generation strategy, and evaluation criteria so I can review and approve it.`;
}
