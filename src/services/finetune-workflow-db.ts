/**
 * Finetune Workflow Persistence Service
 *
 * IndexedDB storage for finetune workflow state, snapshots, and generation history.
 * Allows Lucy to persist and resume workflows across sessions.
 */

import { emitWorkflowUpdate } from "@/lib/distri-finetune-tools/workflow";

// Note: topicHierarchy and evalScript are stored in the Dataset, not duplicated here.
// The workflow only tracks step progress and metadata, not the actual config data.

// =============================================================================
// Types
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

export interface FinetuneWorkflowState {
  id: string;
  datasetId: string;
  trainingGoals: string;
  currentStep: FinetuneStep;
  stepStatus: Record<FinetuneStep, StepStatus>;

  // Input validation (runs on start_workflow)
  inputValidation: {
    recordCount: number;
    validCount: number;
    invalidCount: number;
    validationErrors: ValidationError[];
  } | null;

  // Step-specific results (actual data stored in Dataset, workflow tracks metadata)
  topicsConfig: {
    // Note: hierarchy is stored in Dataset.topicHierarchy, not duplicated here
    topicCount: number;  // Number of topics generated
    depth: number;       // Hierarchy depth
    generatedAt: number;
    method: 'auto' | 'template' | 'manual';
  } | null;

  categorization: {
    assignedCount: number;
    lowConfidenceCount: number;
    confidenceThreshold: number;
  } | null;

  // Coverage & Generation (combined step)
  coverageGeneration: {
    balanceScore?: number;  // undefined when no topics configured
    topicDistribution: Record<string, number>;
    recommendations: string[];
    generationRounds: GenerationRound[];
    syntheticCount: number;
    syntheticPercentage: number;
  } | null;

  // Note: actual eval script is stored in Dataset.evalScript, not duplicated here
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

// =============================================================================
// Database Setup
// =============================================================================

const DB_NAME = 'vllora-finetune';
const DB_VERSION = 7;

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;

      // Clear cached instance if the DB is upgraded by another tab or closed unexpectedly
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create workflows store
      if (!db.objectStoreNames.contains('workflows')) {
        const workflowsStore = db.createObjectStore('workflows', { keyPath: 'id' });
        workflowsStore.createIndex('datasetId', 'datasetId', { unique: false });
        workflowsStore.createIndex('currentStep', 'currentStep', { unique: false });
        workflowsStore.createIndex('createdAt', 'createdAt', { unique: false });
        workflowsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Create snapshots store for rollback capability
      if (!db.objectStoreNames.contains('snapshots')) {
        const snapshotsStore = db.createObjectStore('snapshots', { keyPath: 'id' });
        snapshotsStore.createIndex('workflowId', 'workflowId', { unique: false });
        snapshotsStore.createIndex('step', 'step', { unique: false });
        snapshotsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Create generation history store for tracking
      if (!db.objectStoreNames.contains('generationHistory')) {
        const historyStore = db.createObjectStore('generationHistory', { keyPath: 'id' });
        historyStore.createIndex('workflowId', 'workflowId', { unique: false });
        historyStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Create dry run jobs store for background job tracking (added in v2)
      if (!db.objectStoreNames.contains('dryRunJobs')) {
        const dryRunJobsStore = db.createObjectStore('dryRunJobs', { keyPath: 'id' });
        dryRunJobsStore.createIndex('datasetId', 'datasetId', { unique: false });
        dryRunJobsStore.createIndex('status', 'status', { unique: false });
        dryRunJobsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Create job evaluations cache store (added in v3)
      if (!db.objectStoreNames.contains('jobEvaluations')) {
        const jobEvalsStore = db.createObjectStore('jobEvaluations', { keyPath: 'jobId' });
        jobEvalsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Create proposed plans store for persistence across page refresh (added in v4)
      if (!db.objectStoreNames.contains('proposedPlans')) {
        db.createObjectStore('proposedPlans', { keyPath: 'datasetId' });
      }

      // Create iteration state store for cross-iteration memory (added in v7)
      if (!db.objectStoreNames.contains('iterationState')) {
        const iterationStore = db.createObjectStore('iterationState', { keyPath: 'id' });
        iterationStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

// =============================================================================
// Helper: Create Initial Step Status
// =============================================================================

function createInitialStepStatus(): Record<FinetuneStep, StepStatus> {
  return {
    not_started: 'completed',
    topics_config: 'pending',
    categorize: 'pending',
    coverage_generation: 'pending',
    grader_config: 'pending',
    dry_run: 'pending',
    skill_packaging: 'pending',
    training: 'pending',
    deployment: 'pending',
    completed: 'pending',
  };
}

// =============================================================================
// Workflow CRUD Operations
// =============================================================================

/**
 * Create a new finetune workflow
 */
export async function createWorkflow(
  datasetId: string,
  trainingGoals: string
): Promise<FinetuneWorkflowState> {
  const db = await getDB();
  const now = Date.now();

  const workflow: FinetuneWorkflowState = {
    id: crypto.randomUUID(),
    datasetId,
    trainingGoals,
    currentStep: 'not_started',
    stepStatus: createInitialStepStatus(),
    inputValidation: null,
    topicsConfig: null,
    categorization: null,
    coverageGeneration: null,
    graderConfig: null,
    dryRun: null,
    skillPackaging: null,
    training: null,
    deployment: null,
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('workflows', 'readwrite');
    const store = tx.objectStore('workflows');
    const request = store.add(workflow);

    request.onsuccess = () => resolve(workflow);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get workflow by ID
 */
export async function getWorkflow(id: string): Promise<FinetuneWorkflowState | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('workflows', 'readonly');
    const store = tx.objectStore('workflows');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get active workflow for a dataset (most recent)
 */
export async function getWorkflowByDataset(datasetId: string): Promise<FinetuneWorkflowState | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('workflows', 'readonly');
    const store = tx.objectStore('workflows');
    const index = store.index('datasetId');
    const request = index.getAll(datasetId);

    request.onsuccess = () => {
      const workflows = request.result;
      if (workflows.length === 0) {
        resolve(null);
        return;
      }
      // Return most recently updated workflow
      const sorted = workflows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(sorted[0]);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all workflows (for history/list)
 */
export async function getAllWorkflows(): Promise<FinetuneWorkflowState[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('workflows', 'readonly');
    const store = tx.objectStore('workflows');
    const request = store.getAll();

    request.onsuccess = () => {
      const workflows = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(workflows);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update workflow state
 */
export async function updateWorkflow(workflow: FinetuneWorkflowState): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('workflows', 'readwrite');
    const store = tx.objectStore('workflows');

    const updatedWorkflow = {
      ...workflow,
      updatedAt: Date.now(),
    };

    const request = store.put(updatedWorkflow);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete workflow and all associated data
 */
export async function deleteWorkflow(id: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['workflows', 'snapshots', 'generationHistory'], 'readwrite');
    const workflowsStore = tx.objectStore('workflows');
    const snapshotsStore = tx.objectStore('snapshots');
    const historyStore = tx.objectStore('generationHistory');

    // Delete workflow
    workflowsStore.delete(id);

    // Delete all snapshots for this workflow
    const snapshotsIndex = snapshotsStore.index('workflowId');
    const snapshotsCursor = snapshotsIndex.openCursor(id);
    snapshotsCursor.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Delete all generation history for this workflow
    const historyIndex = historyStore.index('workflowId');
    const historyCursor = historyIndex.openCursor(id);
    historyCursor.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =============================================================================
// Snapshot Operations (for rollback)
// =============================================================================

/**
 * Create a snapshot of the current workflow state
 */
export async function createSnapshot(workflow: FinetuneWorkflowState): Promise<string> {
  const db = await getDB();
  const now = Date.now();

  const snapshot: WorkflowSnapshotStore = {
    id: `${workflow.id}-${workflow.currentStep}-${now}`,
    workflowId: workflow.id,
    step: workflow.currentStep,
    state: { ...workflow },
    createdAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const store = tx.objectStore('snapshots');
    const request = store.add(snapshot);

    request.onsuccess = () => resolve(snapshot.id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all snapshots for a workflow
 */
export async function getSnapshots(workflowId: string): Promise<WorkflowSnapshotStore[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const store = tx.objectStore('snapshots');
    const index = store.index('workflowId');
    const request = index.getAll(workflowId);

    request.onsuccess = () => {
      const snapshots = request.result.sort((a, b) => a.createdAt - b.createdAt);
      resolve(snapshots);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Rollback to a specific snapshot
 */
export async function rollbackToSnapshot(snapshotId: string): Promise<FinetuneWorkflowState | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['snapshots', 'workflows'], 'readwrite');
    const snapshotsStore = tx.objectStore('snapshots');
    const workflowsStore = tx.objectStore('workflows');

    let workflowId: string | null = null;

    const getRequest = snapshotsStore.get(snapshotId);
    getRequest.onsuccess = () => {
      const snapshot = getRequest.result as WorkflowSnapshotStore | undefined;
      if (!snapshot) {
        resolve(null);
        return;
      }

      // Capture the workflow ID from the snapshot record
      workflowId = snapshot.workflowId;

      // Restore workflow state from snapshot
      const restoredState = {
        ...snapshot.state,
        updatedAt: Date.now(),
      };

      workflowsStore.put(restoredState);
    };

    tx.oncomplete = async () => {
      if (!workflowId) {
        resolve(null);
        return;
      }
      // Fetch the restored state using the full workflow ID from the snapshot
      const restored = await getWorkflow(workflowId);
      resolve(restored);
    };
    tx.onerror = () => reject(tx.error);
  });
}

// =============================================================================
// Generation History Operations
// =============================================================================

/**
 * Record a generation run
 */
export async function recordGeneration(
  workflowId: string,
  data: {
    strategy: GenerationStrategy;
    topicsTargeted: string[];
    recordsGenerated: number;
    recordsValid: number;
    balanceScoreBefore: number;
    balanceScoreAfter: number;
  }
): Promise<string> {
  const db = await getDB();
  const now = Date.now();

  const record: GenerationHistoryStore = {
    id: `${workflowId}-gen-${now}`,
    workflowId,
    ...data,
    createdAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('generationHistory', 'readwrite');
    const store = tx.objectStore('generationHistory');
    const request = store.add(record);

    request.onsuccess = () => resolve(record.id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get generation history for a workflow
 */
export async function getGenerationHistory(workflowId: string): Promise<GenerationHistoryStore[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('generationHistory', 'readonly');
    const store = tx.objectStore('generationHistory');
    const index = store.index('workflowId');
    const request = index.getAll(workflowId);

    request.onsuccess = () => {
      const history = request.result.sort((a, b) => a.createdAt - b.createdAt);
      resolve(history);
    };
    request.onerror = () => reject(request.error);
  });
}

// =============================================================================
// Workflow Step Helpers
// =============================================================================

/**
 * Advance workflow to next step
 */
export async function advanceToStep(
  workflowId: string,
  step: FinetuneStep
): Promise<FinetuneWorkflowState | null> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return null;

  // Create snapshot before advancing
  await createSnapshot(workflow);

  // Update step status
  const updatedStatus = { ...workflow.stepStatus };
  updatedStatus[workflow.currentStep] = 'completed';
  updatedStatus[step] = 'in_progress';

  const updatedWorkflow: FinetuneWorkflowState = {
    ...workflow,
    currentStep: step,
    stepStatus: updatedStatus,
    updatedAt: Date.now(),
  };

  await updateWorkflow(updatedWorkflow);
  emitWorkflowUpdate(workflow.datasetId, step);
  return updatedWorkflow;
}

/**
 * Mark current step as failed
 */
export async function markStepFailed(
  workflowId: string
): Promise<FinetuneWorkflowState | null> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return null;

  const updatedStatus = { ...workflow.stepStatus };
  updatedStatus[workflow.currentStep] = 'failed';

  const updatedWorkflow: FinetuneWorkflowState = {
    ...workflow,
    stepStatus: updatedStatus,
    updatedAt: Date.now(),
  };

  await updateWorkflow(updatedWorkflow);
  return updatedWorkflow;
}

/**
 * Update step-specific data
 */
export async function updateStepData<K extends keyof FinetuneWorkflowState>(
  workflowId: string,
  key: K,
  data: FinetuneWorkflowState[K]
): Promise<FinetuneWorkflowState | null> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return null;

  const updatedWorkflow: FinetuneWorkflowState = {
    ...workflow,
    [key]: data,
    updatedAt: Date.now(),
  };

  await updateWorkflow(updatedWorkflow);
  return updatedWorkflow;
}

// =============================================================================
// Job Evaluations Cache (Stale-While-Revalidate)
// =============================================================================

import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";

export interface CachedJobEvaluation {
  jobId: string;
  data: FinetuneEvalResultsResponse;
  updatedAt: number;
  /** Whether finetune scores from this job have been persisted to records */
  scoresPersisted?: boolean;
}

/**
 * Get cached job evaluations
 */
export async function getCachedJobEvaluations(jobId: string): Promise<CachedJobEvaluation | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobEvaluations', 'readonly');
    const store = tx.objectStore('jobEvaluations');
    const request = store.get(jobId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save job evaluations to cache
 */
export async function saveJobEvaluationsCache(
  jobId: string,
  data: FinetuneEvalResultsResponse
): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobEvaluations', 'readwrite');
    const store = tx.objectStore('jobEvaluations');

    // Read existing entry to preserve scoresPersisted flag
    const getReq = store.get(jobId);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      const cached: CachedJobEvaluation = {
        jobId,
        data,
        updatedAt: Date.now(),
        ...(existing?.scoresPersisted && { scoresPersisted: true }),
      };
      store.put(cached);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete cached job evaluations
 */
export async function deleteCachedJobEvaluations(jobId: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobEvaluations', 'readwrite');
    const store = tx.objectStore('jobEvaluations');
    const request = store.delete(jobId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear old cached evaluations (older than maxAge in ms)
 */
export async function clearOldEvaluationsCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDB();
  const cutoff = Date.now() - maxAgeMs;
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobEvaluations', 'readwrite');
    const store = tx.objectStore('jobEvaluations');
    const index = store.index('updatedAt');
    const range = IDBKeyRange.upperBound(cutoff);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(deletedCount);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Check if finetune scores have been persisted for a job.
 * Uses the `scoresPersisted` flag on the cached evaluation entry.
 */
export async function isJobScoresPersisted(jobId: string): Promise<boolean> {
  const cached = await getCachedJobEvaluations(jobId);
  return cached?.scoresPersisted === true;
}

/**
 * Mark a job's finetune scores as persisted to records.
 * Sets `scoresPersisted = true` on the cached evaluation entry.
 */
export async function markJobScoresPersisted(jobId: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobEvaluations', 'readwrite');
    const store = tx.objectStore('jobEvaluations');
    const getReq = store.get(jobId);

    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        entry.scoresPersisted = true;
        store.put(entry);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =============================================================================
// Export Service Object
// =============================================================================

export const finetuneWorkflowService = {
  // Workflow CRUD
  createWorkflow,
  getWorkflow,
  getWorkflowByDataset,
  getAllWorkflows,
  updateWorkflow,
  deleteWorkflow,

  // Snapshots
  createSnapshot,
  getSnapshots,
  rollbackToSnapshot,

  // Generation History
  recordGeneration,
  getGenerationHistory,

  // Step Helpers
  advanceToStep,
  markStepFailed,
  updateStepData,

  // Job Evaluations Cache
  getCachedJobEvaluations,
  saveJobEvaluationsCache,
  deleteCachedJobEvaluations,
  clearOldEvaluationsCache,
  isJobScoresPersisted,
  markJobScoresPersisted,
};
