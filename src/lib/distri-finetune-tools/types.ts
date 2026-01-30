/**
 * Distri Finetune Tools - Types
 *
 * Type definitions for finetune workflow tools.
 */

import { FinetuneWorkflowState, FinetuneStep, GenerationStrategy, DryRunVerdict } from '@/services/finetune-workflow-db';
import { TopicHierarchyNode } from '@/types/dataset-types';

// Tool handler function type
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

// =============================================================================
// Workflow Control Results
// =============================================================================

export interface StartWorkflowResult {
  success: boolean;
  error?: string;
  workflow_id?: string;
  validation?: {
    record_count: number;
    valid_count: number;
    invalid_count: number;
    errors?: Array<{ recordId: string; error: string }>;
  };
}

export interface WorkflowStatusResult {
  success: boolean;
  error?: string;
  workflow?: {
    id: string;
    dataset_id: string;
    training_goals: string;
    current_step: FinetuneStep;
    step_status: Record<FinetuneStep, string>;
    coverage_score?: number;
    has_grader: boolean;
    dry_run_verdict?: DryRunVerdict;
    training_status?: string;
    created_at: number;
    updated_at: number;
  };
}

export interface AdvanceStepResult {
  success: boolean;
  error?: string;
  previous_step?: FinetuneStep;
  current_step?: FinetuneStep;
}

export interface RollbackResult {
  success: boolean;
  error?: string;
  rolled_back_to?: FinetuneStep;
  available_snapshots?: Array<{
    id: string;
    step: FinetuneStep;
    created_at: number;
  }>;
}

// =============================================================================
// Step Execution Results
// =============================================================================

export interface ValidateRecordsResult {
  success: boolean;
  error?: string;
  validation?: {
    total_records: number;
    valid_count: number;
    invalid_count: number;
    errors: Array<{ record_id: string; error: string }>;
  };
}

export interface GenerateTopicsResult {
  success: boolean;
  error?: string;
  hierarchy?: TopicHierarchyNode[];
  method?: 'auto' | 'template' | 'manual';
  topic_count?: number;
  depth?: number;
}

export interface ApplyHierarchyResult {
  success: boolean;
  error?: string;
  applied_hierarchy?: TopicHierarchyNode[];
  topic_count?: number;
}

export interface CategorizeRecordsResult {
  success: boolean;
  error?: string;
  categorization?: {
    assigned_count: number;
    low_confidence_count: number;
    confidence_threshold: number;
    by_topic: Record<string, { count: number; avg_confidence: number }>;
  };
}

export interface AnalyzeCoverageResult {
  success: boolean;
  error?: string;
  coverage?: {
    balance_score: number;
    balance_rating: string;
    distribution: Record<string, {
      count: number;
      percentage: number;
      target_percentage: number;
      gap: number;
      status: 'under' | 'ok' | 'over';
    }>;
    recommendations: string[];
    uncategorized_count: number;
  };
}

export interface GenerateDataResult {
  success: boolean;
  error?: string;
  generation?: {
    strategy: GenerationStrategy;
    topics_targeted: string[];
    records_generated: number;
    records_valid: number;
    records_rejected: number;
    by_topic: Record<string, { generated: number; valid: number }>;
    balance_score_before: number;
    balance_score_after: number;
    /** Indicates which workflow mode was used for generation */
    workflow_mode?: 'data_first' | 'topics_first';
  };
}

export interface ConfigureGraderResult {
  success: boolean;
  error?: string;
  grader_type?: 'llm_as_judge' | 'js';
  configured_at?: number;
}

export interface TestGraderResult {
  success: boolean;
  error?: string;
  samples?: Array<{
    record_id: string;
    prompt: string;
    response: string;
    score: number;
    reasoning: string;
  }>;
}

export interface DryRunResult {
  success: boolean;
  error?: string;
  dry_run?: {
    verdict: DryRunVerdict;
    mean: number;
    std: number;
    percent_above_zero: number;
    percent_perfect: number;
    sample_count: number;
    samples?: Array<{
      record_id: string;
      score: number;
      reasoning: string;
    }>;
    diagnosis?: string;
    recommendations: string[];
  };
}

export interface StartTrainingResult {
  success: boolean;
  error?: string;
  training?: {
    job_id: string;
    status: 'pending' | 'running';
    estimated_duration?: string;
  };
}

export interface TrainingStatusResult {
  success: boolean;
  error?: string;
  training?: {
    job_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;
    current_epoch?: number;
    total_epochs?: number;
    metrics?: {
      train_reward: number;
      valid_reward: number;
      loss: number;
    };
    model_id?: string;
    error_message?: string;
  };
}

export interface DeployModelResult {
  success: boolean;
  error?: string;
  deployment?: {
    model_id: string;
    endpoint: string;
    deployed_at: number;
  };
}

// =============================================================================
// Data Access Results
// =============================================================================

export interface GetDatasetRecordsResult {
  success: boolean;
  error?: string;
  records?: Array<{
    id: string;
    topic?: string;
    is_generated: boolean;
    has_evaluation: boolean;
    created_at: number;
  }>;
  total_count?: number;
}

export interface DatasetStatsResult {
  success: boolean;
  error?: string;
  stats?: {
    dataset_id: string;
    dataset_name: string;
    record_count: number;
    synthetic_count: number;
    topic_count: number;
    topics: Record<string, number>;
    evaluated_count: number;
    has_hierarchy: boolean;
    has_grader: boolean;
    training_goals?: string;
  };
}

// =============================================================================
// Context for Finetune Agent
// =============================================================================

export interface FinetuneContext {
  page: 'datasets';
  current_dataset_id: string;
  finetune_workflow: {
    workflow_id: string;
    current_step: FinetuneStep;
    step_status: Record<FinetuneStep, string>;
    coverage?: number;
    has_grader: boolean;
    dry_run_verdict?: DryRunVerdict;
    training_status?: string;
  } | null;
}

// =============================================================================
// Workflow to Context Conversion
// =============================================================================

export function workflowToContext(
  datasetId: string,
  workflow: FinetuneWorkflowState | null,
  datasetHasEvaluator?: boolean
): FinetuneContext {
  return {
    page: 'datasets',
    current_dataset_id: datasetId,
    finetune_workflow: workflow
      ? {
          workflow_id: workflow.id,
          current_step: workflow.currentStep,
          step_status: workflow.stepStatus as Record<FinetuneStep, string>,
          coverage: workflow.coverageGeneration?.balanceScore,
          // Check both workflow.graderConfig and dataset.evaluationConfig
          has_grader: !!workflow.graderConfig || !!datasetHasEvaluator,
          dry_run_verdict: workflow.dryRun?.verdict,
          training_status: workflow.training?.status,
        }
      : null,
  };
}

// =============================================================================
// Workflow to Status Result Conversion
// =============================================================================

export function workflowToStatusResult(
  workflow: FinetuneWorkflowState | null,
  datasetHasEvaluator?: boolean
): WorkflowStatusResult {
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  return {
    success: true,
    workflow: {
      id: workflow.id,
      dataset_id: workflow.datasetId,
      training_goals: workflow.trainingGoals,
      current_step: workflow.currentStep,
      step_status: workflow.stepStatus as Record<FinetuneStep, string>,
      coverage_score: workflow.coverageGeneration?.balanceScore,
      // Check both workflow.graderConfig and dataset.evaluationConfig
      has_grader: !!workflow.graderConfig || !!datasetHasEvaluator,
      dry_run_verdict: workflow.dryRun?.verdict,
      training_status: workflow.training?.status,
      created_at: workflow.createdAt,
      updated_at: workflow.updatedAt,
    },
  };
}
