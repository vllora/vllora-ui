/**
 * Workflow Service Interface
 *
 * Abstraction over finetune workflow state persistence.
 * Currently backed by IndexedDB (finetune-workflow-db.ts).
 * Will be swapped to gateway API adapter when workflow state endpoints are ready.
 *
 * Re-exports types from the DB module to ensure interface compatibility.
 */

import type {
  FinetuneWorkflowState,
  FinetuneStep,
  GenerationStrategy,
  WorkflowSnapshotStore,
  GenerationHistoryStore,
  CachedJobEvaluation,
} from '@/types/workflow-types';
import type { FinetuneEvalResultsResponse } from '@/services/finetune-api';

export interface GenerationData {
  readonly strategy: GenerationStrategy;
  readonly topicsTargeted: string[];
  readonly recordsGenerated: number;
  readonly recordsValid: number;
  readonly balanceScoreBefore: number;
  readonly balanceScoreAfter: number;
}

export interface WorkflowService {
  // CRUD
  create(datasetId: string, trainingGoals: string): Promise<FinetuneWorkflowState>;
  get(id: string): Promise<FinetuneWorkflowState | null>;
  getByDataset(datasetId: string): Promise<FinetuneWorkflowState | null>;
  getAll(): Promise<FinetuneWorkflowState[]>;
  update(workflow: FinetuneWorkflowState): Promise<void>;
  delete(id: string): Promise<void>;

  // Step management
  advanceToStep(id: string, step: FinetuneStep): Promise<FinetuneWorkflowState | null>;
  markStepFailed(id: string): Promise<FinetuneWorkflowState | null>;
  updateStepData<K extends keyof FinetuneWorkflowState>(
    id: string,
    key: K,
    data: FinetuneWorkflowState[K],
  ): Promise<FinetuneWorkflowState | null>;

  // Snapshots
  createSnapshot(workflow: FinetuneWorkflowState): Promise<string>;
  getSnapshots(workflowId: string): Promise<WorkflowSnapshotStore[]>;
  rollbackToSnapshot(snapshotId: string): Promise<FinetuneWorkflowState | null>;

  // Generation history
  recordGeneration(workflowId: string, data: GenerationData): Promise<string>;
  getGenerationHistory(workflowId: string): Promise<GenerationHistoryStore[]>;

  // Job evaluation cache
  getCachedJobEvaluations(jobId: string): Promise<CachedJobEvaluation | null>;
  saveJobEvaluationsCache(jobId: string, data: FinetuneEvalResultsResponse): Promise<void>;
  deleteCachedJobEvaluations(jobId: string): Promise<void>;
  clearOldEvaluationsCache(maxAgeMs?: number): Promise<number>;
  isJobScoresPersisted(jobId: string): Promise<boolean>;
  markJobScoresPersisted(jobId: string): Promise<void>;
}
