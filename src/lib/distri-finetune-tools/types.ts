/**
 * Distri Finetune Tools - Types
 *
 * Type definitions for finetune workflow tools.
 */

import { FinetuneWorkflowState, FinetuneStep, GenerationStrategy, DryRunVerdict } from '@/services/finetune-workflow-db';
import { TopicHierarchyNode } from '@/types/dataset-types';
import type { PlanStatus } from './steps/proposed-plan-store';
import type { ExecutionProgress, ExecutionStepId } from './steps/execute-plan';
import { STEP_ORDER } from './steps/execute-plan';

// Tool handler function type
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

// =============================================================================
// Workflow Control Results
// =============================================================================

export interface StartWorkflowResult {
  success: boolean;
  error?: string;
  workflow_id?: string;
  current_step?: FinetuneStep;
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
    balance_score?: number;    // undefined when no topics configured
    balance_rating?: string;   // undefined when no topics configured
    distribution: Record<string, {
      count: number;
      percentage: number;
      target_percentage: number;
      gap: number;
      status: 'under' | 'ok' | 'over';
    }>;
    recommendations: string[];
    uncategorized_count: number;
    knowledge_coverage?: {
      total_chunks: number;
      covered_chunks: number;
      coverage_percent: number;
      by_source: Record<string, { name: string; covered: number; total: number; percent: number }>;
    };
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
  grader_type?: 'js';
  model?: string;
  temperature?: number;
  max_tokens?: number;
  configured_at?: number;
}

export interface TestGraderResult {
  readonly success: boolean;
  readonly error?: string;
  readonly test_results?: {
    readonly sample_size: number;
    readonly average_score: number;
    readonly results: ReadonlyArray<{
      readonly record_id: string;
      readonly row_index: number;
      readonly score: number;
      readonly reason: string;
      readonly status: string;
    }>;
    readonly evaluation_run_id: string;
    readonly grader_type: 'js';
  };
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
// Evaluation Analysis Results (Phase 1: Give Lucy Eyes)
// =============================================================================

export interface EvaluationDetailsResult {
  success: boolean;
  error?: string;
  evaluation_id?: string;
  evaluation_run_id?: string;
  summary?: {
    total_records: number;
    scored_records: number;
    mean_score: number;
    std_score: number;
    min_score: number | null;
    max_score: number | null;
    pass_rate: number;
  };
  per_topic?: Array<{
    topic: string;
    record_count: number;
    avg_score: number;
    min_score: number;
    max_score: number;
    pass_count: number;
    fail_count: number;
  }>;
  worst_records?: Array<{
    record_id: string;
    topic: string;
    score: number;
    reason: string;
  }>;
}

export interface LogIterationResult {
  success: boolean;
  error?: string;
  iteration_number?: number;
  total_iterations?: number;
}

export interface IterationHistoryResult {
  success: boolean;
  error?: string;
  current_iteration?: number;
  phase?: string;
  inner_loop?: {
    last_eval_id: string | null;
    last_dry_run_score: number | null;
    proposed_changes: unknown[];
    user_decision: string | null;
  };
  outer_loop?: {
    last_training_job_id: string | null;
    last_epoch_scores: Record<string, number[]> | null;
    post_training_eval_id: string | null;
  };
  history?: Array<{
    iteration: number;
    timestamp: number;
    eval_id: string;
    mean_score: number;
    per_topic_scores: Record<string, number>;
    changes_made: string;
    decision: string;
  }>;
}

export interface MarkJobReviewedResult {
  success: boolean;
  error?: string;
  job_id?: string;
  reviewed_at?: number;
}

// =============================================================================
// Evaluation Analysis Results (Phase 2: Give Lucy Autonomy)
// =============================================================================

export interface AnalyzeEvaluationResult {
  success: boolean;
  error?: string;
  health?: {
    overall: 'healthy' | 'warning' | 'critical';
    mean_score: number;
    std_score: number;
    mean_verdict: 'hard_stop' | 'too_hard' | 'healthy_range' | 'getting_easy' | 'too_easy';
    std_verdict: 'no_differentiation' | 'good_variance' | 'bimodal';
    percent_above_zero: number;
    percent_perfect: number;
  };
  per_topic?: Array<{
    topic: string;
    record_count: number;
    avg_score: number;
    classification: 'failing' | 'weak' | 'moderate' | 'strong' | 'over_performing';
    recommendation?: string;
  }>;
  grader_health?: {
    binary_scoring: boolean;
    low_variance: boolean;
    verdict: 'healthy' | 'needs_attention' | 'problematic';
  };
  iteration_comparison?: {
    iteration_number: number;
    previous_mean: number;
    current_mean: number;
    delta: number;
    trend: 'improving' | 'stalled' | 'regressing';
    per_topic_deltas: Array<{
      topic: string;
      previous: number;
      current: number;
      delta: number;
      trend: 'improving' | 'stalled' | 'regressing';
    }>;
    stall_count: number;
  };
  escalation?: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    description: string;
    reason: string;
  };
  recommendations?: Array<{
    priority: 'high' | 'medium' | 'low';
    lever: 'grader' | 'records' | 'distribution' | 'training_config' | 'topics';
    action: string;
    target_topics?: string[];
    rationale: string;
  }>;
  next_action?: 'iterate' | 'train' | 'escalate' | 'hard_stop';
}

// =============================================================================
// Training Analysis Results (Phase 3: Give Lucy Wisdom)
// =============================================================================

export type TrainingNextAction = 'deploy_eval' | 'investigate' | 'retrain' | 'inner_loop';

export type TrainingPattern =
  | 'all_improving'
  | 'overfitting'
  | 'no_learning'
  | 'reward_hacking'
  | 'training_failure';

export interface TopicEpochProgression {
  readonly topic: string;
  readonly record_count: number;
  readonly epoch_scores: Record<number, number>;
  readonly first_epoch_score: number;
  readonly last_epoch_score: number;
  readonly peak_epoch: number;
  readonly peak_score: number;
  readonly pattern: TrainingPattern | 'mixed';
}

export interface AnalyzeTrainingResult {
  success: boolean;
  error?: string;
  job_id?: string;
  job_status?: string;
  total_epochs?: number;
  total_rows?: number;
  overall_progression?: {
    first_epoch_mean: number;
    last_epoch_mean: number;
    delta: number;
    peak_epoch: number;
    peak_mean: number;
  };
  per_topic?: TopicEpochProgression[];
  patterns_detected?: TrainingPattern[];
  recommendations?: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    rationale: string;
    target_topics?: string[];
  }>;
  next_action?: TrainingNextAction;
}

// =============================================================================
// Task Viability Pre-Check Results (Phase 4B)
// =============================================================================

export interface CheckViabilityResult {
  readonly success: boolean;
  readonly error?: string;
  readonly viability?: {
    readonly verdict: 'viable' | 'marginal' | 'not_viable';
    readonly mean_score: number;
    readonly sample_size: number;
    readonly scored_count: number;
    readonly per_record: ReadonlyArray<{
      readonly record_id: string;
      readonly score: number;
      readonly reason: string;
    }>;
    readonly evaluation_run_id: string;
    readonly recommendation: string;
  };
}

// =============================================================================
// Context for Finetune Agent
// =============================================================================

export interface FinetuneContext {
  page: 'datasets';
  current_dataset_id: string;
  plan?: {
    status: PlanStatus;
    has_active_plan: boolean;
    /** When status is 'executing', details about which steps completed/failed before interruption */
    execution_progress?: {
      current_step: number;
      total_steps: number;
      completed_steps: string[];
      failed_steps: string[];
      resume_from_step: ExecutionStepId | null;
    };
  };
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
  datasetHasEvalScript?: boolean,
  planStatus?: PlanStatus | null,
  executionProgress?: ExecutionProgress | null,
): FinetuneContext {
  // Build execution progress details for interrupted plans
  let executionProgressDetails: {
    current_step: number;
    total_steps: number;
    completed_steps: string[];
    failed_steps: string[];
    resume_from_step: ExecutionStepId | null;
  } | undefined;
  if (planStatus === 'executing' && executionProgress) {
    const completedSteps = executionProgress.steps.filter(s => s.status === 'completed').map(s => s.id);
    const failedSteps = executionProgress.steps.filter(s => s.status === 'failed').map(s => s.id);
    const resumeFrom = STEP_ORDER.find(id => !completedSteps.includes(id)) || null;
    executionProgressDetails = {
      current_step: executionProgress.current_step,
      total_steps: executionProgress.total_steps,
      completed_steps: completedSteps,
      failed_steps: failedSteps,
      resume_from_step: resumeFrom as ExecutionStepId | null,
    };
  }

  return {
    page: 'datasets',
    current_dataset_id: datasetId,
    ...(planStatus ? {
      plan: {
        status: planStatus,
        has_active_plan: planStatus === 'proposed' || planStatus === 'approved' || planStatus === 'executing',
        ...(executionProgressDetails ? { execution_progress: executionProgressDetails } : {}),
      },
    } : {}),
    finetune_workflow: workflow
      ? {
          workflow_id: workflow.id,
          current_step: workflow.currentStep,
          step_status: workflow.stepStatus as Record<FinetuneStep, string>,
          coverage: workflow.coverageGeneration?.balanceScore,
          // Check both workflow.graderConfig and dataset.evalScript
          has_grader: !!workflow.graderConfig || !!datasetHasEvalScript,
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
  datasetHasEvalScript?: boolean
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
      // Check both workflow.graderConfig and dataset.evalScript
      has_grader: !!workflow.graderConfig || !!datasetHasEvalScript,
      dry_run_verdict: workflow.dryRun?.verdict,
      training_status: workflow.training?.status,
      created_at: workflow.createdAt,
      updated_at: workflow.updatedAt,
    },
  };
}
