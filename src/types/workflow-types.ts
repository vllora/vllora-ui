/**
 * Finetune Workflow Types
 *
 * Standalone type definitions for finetune workflow state.
 * Extracted from finetune-workflow-db.ts to remove IndexedDB dependency.
 */

import type { FinetuneEvalResultsResponse } from '@/services/finetune-api';

// =============================================================================
// Step & Status Types
// =============================================================================

export type FinetuneStep =
  | 'not_started'
  | 'topics_config'
  | 'categorize'
  | 'coverage_generation'
  | 'grader_config'
  | 'dry_run'
  | 'skill_packaging'
  | 'training'
  | 'deployment'
  | 'completed';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export type GenerationStrategy =
  | 'message_variation'
  | 'few_shot'
  | 'topic_description'
  | 'scenario_expansion'
  | 'tool_chain';

export type DryRunVerdict = 'GO' | 'NO-GO' | 'WARNING';

// =============================================================================
// Sub-types
// =============================================================================

export interface ValidationError {
  recordId: string;
  error: string;
}

export interface DryRunSample {
  recordId: string;
  prompt: string;
  response: string;
  score: number;
  reasoning: string;
}

export interface TrainingMetrics {
  trainReward: number;
  validReward: number;
  loss: number;
  currentEpoch: number;
  totalEpochs: number;
}

export interface GenerationRound {
  strategy: GenerationStrategy;
  topicsTargeted: string[];
  recordsGenerated: number;
  timestamp: number;
}

// =============================================================================
// Main State
// =============================================================================

export interface FinetuneWorkflowState {
  id: string;
  datasetId: string;
  trainingGoals: string;
  currentStep: FinetuneStep;
  stepStatus: Record<FinetuneStep, StepStatus>;

  inputValidation: {
    recordCount: number;
    validCount: number;
    invalidCount: number;
    validationErrors: ValidationError[];
  } | null;

  topicsConfig: {
    topicCount: number;
    depth: number;
    generatedAt: number;
    method: 'auto' | 'template' | 'manual';
  } | null;

  categorization: {
    assignedCount: number;
    lowConfidenceCount: number;
    confidenceThreshold: number;
  } | null;

  coverageGeneration: {
    balanceScore?: number;
    topicDistribution: Record<string, number>;
    recommendations: string[];
    generationRounds: GenerationRound[];
    syntheticCount: number;
    syntheticPercentage: number;
  } | null;

  graderConfig: {
    type: 'js';
    configuredAt: number;
  } | null;

  dryRun: {
    mean: number;
    std: number;
    percentAboveZero: number;
    percentPerfect: number;
    verdict: DryRunVerdict;
    sampleResults: DryRunSample[];
    recommendations: string[];
  } | null;

  skillPackaging: {
    recordCount: number;
    packagedAt: number;
    skillName: string;
  } | null;

  training: {
    jobId: string;
    baseModel: string;
    status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
    startedAt: number;
    progress?: number;
    metrics: TrainingMetrics | null;
    modelId: string | null;
  } | null;

  deployment: {
    deployedAt: number;
    modelId: string;
    deploymentName: string;
    endpoint: string;
  } | null;

  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Storage types (snapshots, history, cache)
// =============================================================================

export interface WorkflowSnapshotStore {
  id: string;
  workflowId: string;
  step: FinetuneStep;
  state: FinetuneWorkflowState;
  createdAt: number;
}

export interface GenerationHistoryStore {
  id: string;
  workflowId: string;
  strategy: GenerationStrategy;
  topicsTargeted: string[];
  recordsGenerated: number;
  recordsValid: number;
  balanceScoreBefore: number;
  balanceScoreAfter: number;
  createdAt: number;
}

export interface CachedJobEvaluation {
  jobId: string;
  data: FinetuneEvalResultsResponse;
  updatedAt: number;
  scoresPersisted?: boolean;
}
