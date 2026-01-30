/**
 * Finetune Workflow Persistence Service
 *
 * IndexedDB storage for finetune workflow state, snapshots, and generation history.
 * Allows Lucy to persist and resume workflows across sessions.
 */

// Note: topicHierarchy and evaluationConfig are stored in the Dataset, not duplicated here.
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
    balanceScore: number;
    topicDistribution: Record<string, number>;
    recommendations: string[];
    generationRounds: GenerationRound[];
    syntheticCount: number;
    syntheticPercentage: number;
  } | null;

  // Note: actual evaluationConfig is stored in Dataset.evaluationConfig, not duplicated here
  graderConfig: {
    type: 'llm_as_judge' | 'js';
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
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
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

    const getRequest = snapshotsStore.get(snapshotId);
    getRequest.onsuccess = () => {
      const snapshot = getRequest.result as WorkflowSnapshotStore | undefined;
      if (!snapshot) {
        resolve(null);
        return;
      }

      // Restore workflow state from snapshot
      const restoredState = {
        ...snapshot.state,
        updatedAt: Date.now(),
      };

      workflowsStore.put(restoredState);
    };

    tx.oncomplete = async () => {
      // Fetch the restored state
      const restored = await getWorkflow(snapshotId.split('-')[0]);
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
};
