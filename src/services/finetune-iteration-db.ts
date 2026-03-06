/**
 * Finetune Iteration Persistence Service
 *
 * IndexedDB storage for cross-iteration memory.
 * Tracks iteration history, scores, changes, and decisions
 * so Lucy can compare across iterations and resume mid-iteration.
 *
 * Stored in the shared vllora-finetune database (iterationState store, added in v7).
 */

import { getDB } from './finetune-workflow-db';

// =============================================================================
// Types
// =============================================================================

export interface ProposedChange {
  lever: 'grader' | 'records' | 'distribution' | 'training_config' | 'topics';
  description: string;
  targetTopics?: string[];
  applied: boolean;
}

export type IterationPhase =
  | 'idle'
  | 'evaluating'
  | 'analyzing'
  | 'awaiting_user'
  | 'applying_changes'
  | 'training'
  | 'post_training';

export interface IterationHistoryEntry {
  iteration: number;
  timestamp: number;
  evalId: string;
  dryRunScores: {
    mean: number;
    perTopic: Record<string, number>;
  };
  changesMade: string;
  decision: 'iterate' | 'train' | 'escalate';
}

export interface IterationState {
  /** datasetId — one iteration state per dataset */
  id: string;
  iterationNumber: number;
  phase: IterationPhase;
  innerLoop: {
    lastEvalId?: string;
    lastDryRunScore?: number;
    proposedChanges?: ProposedChange[];
    userDecision?: 'accepted' | 'rejected' | 'modified';
  };
  outerLoop: {
    lastTrainingJobId?: string;
    lastEpochScores?: Record<string, number[]>;
    postTrainingEvalId?: string;
  };
  history: IterationHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get iteration state for a dataset
 */
export async function getIterationState(datasetId: string): Promise<IterationState | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('iterationState', 'readonly');
    const store = tx.objectStore('iterationState');
    const request = store.get(datasetId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save (upsert) iteration state for a dataset
 */
export async function saveIterationState(state: IterationState): Promise<void> {
  const db = await getDB();

  const updatedState: IterationState = {
    ...state,
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('iterationState', 'readwrite');
    const store = tx.objectStore('iterationState');
    const request = store.put(updatedState);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Create a fresh iteration state for a dataset (iteration 0)
 */
export async function createIterationState(datasetId: string): Promise<IterationState> {
  const now = Date.now();
  const state: IterationState = {
    id: datasetId,
    iterationNumber: 0,
    phase: 'idle',
    innerLoop: {},
    outerLoop: {},
    history: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveIterationState(state);
  return state;
}

/**
 * Get or create iteration state for a dataset
 */
export async function getOrCreateIterationState(datasetId: string): Promise<IterationState> {
  const existing = await getIterationState(datasetId);
  if (existing) return existing;
  return createIterationState(datasetId);
}

/**
 * Add an iteration history entry and bump the iteration number
 */
export async function addIterationEntry(
  datasetId: string,
  entry: Omit<IterationHistoryEntry, 'iteration' | 'timestamp'>
): Promise<IterationState> {
  const state = await getOrCreateIterationState(datasetId);

  const nextIteration = state.iterationNumber + 1;
  const fullEntry: IterationHistoryEntry = {
    ...entry,
    iteration: nextIteration,
    timestamp: Date.now(),
  };

  const updatedState: IterationState = {
    ...state,
    iterationNumber: nextIteration,
    history: [...state.history, fullEntry],
    updatedAt: Date.now(),
  };

  await saveIterationState(updatedState);
  return updatedState;
}

/**
 * Get iteration history for a dataset (sorted by iteration number)
 */
export async function getIterationHistory(datasetId: string): Promise<IterationHistoryEntry[]> {
  const state = await getIterationState(datasetId);
  if (!state) return [];
  return [...state.history].sort((a, b) => a.iteration - b.iteration);
}

/**
 * Update the phase of an iteration state
 */
export async function updateIterationPhase(
  datasetId: string,
  phase: IterationPhase
): Promise<IterationState> {
  const state = await getOrCreateIterationState(datasetId);

  const updatedState: IterationState = {
    ...state,
    phase,
    updatedAt: Date.now(),
  };

  await saveIterationState(updatedState);
  return updatedState;
}

/**
 * Delete iteration state for a dataset
 */
export async function deleteIterationState(datasetId: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('iterationState', 'readwrite');
    const store = tx.objectStore('iterationState');
    const request = store.delete(datasetId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// =============================================================================
// Export Service Object
// =============================================================================

export const iterationStateService = {
  getIterationState,
  saveIterationState,
  createIterationState,
  getOrCreateIterationState,
  addIterationEntry,
  getIterationHistory,
  updateIterationPhase,
  deleteIterationState,
};
