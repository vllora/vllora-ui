/**
 * Proposed Plan Store
 *
 * IndexedDB-backed plan store with in-memory cache for fast reads.
 * Plans survive page refresh so Lucy can resume mid-execution.
 */

import type { Plan } from "./propose-plan";
import type { ExecutionProgress, ExecutionSummary } from "./execute-plan";
import { normalizePlanSteps } from "./plan-step-normalization";

// =============================================================================
// Types
// =============================================================================

export type PlanStatus = 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'dismissed';

export interface StoredPlan {
  workflowId: string;
  plan: Plan;
  status: PlanStatus;
  executionProgress: ExecutionProgress | null;
  executionSummary: ExecutionSummary | null;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// IndexedDB + in-memory cache
// =============================================================================

const DB_NAME = 'vllora-plan-store';
const DB_VERSION = 1;
const STORE_NAME = 'plans';
const SNAPSHOT_KEY_PREFIX = 'previous:';

/** In-memory cache — mirrors IndexedDB for synchronous-fast reads */
const cache = new Map<string, StoredPlan>();

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'workflowId' });
      }
    };
  });
}

/** Write a StoredPlan to IndexedDB (fire-and-forget with error logging) */
async function persistToDB(stored: StoredPlan): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(stored);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[plan-store] Failed to persist plan to IndexedDB:', error);
  }
}

/** Delete a key from IndexedDB */
async function deleteFromDB(key: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[plan-store] Failed to delete plan from IndexedDB:', error);
  }
}

/** Load a single plan from IndexedDB (cache miss fallback) */
async function loadFromDB(key: string): Promise<StoredPlan | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[plan-store] Failed to load plan from IndexedDB:', error);
    return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function normalizePlan(plan: Plan): Plan {
  const rawSteps = Array.isArray(plan.steps_to_execute)
    ? (plan.steps_to_execute as unknown as string[])
    : undefined;
  const stepNormalization = normalizePlanSteps(rawSteps, { fallbackToDefaultWhenEmpty: true });

  const normalized: Plan = stepNormalization.hadInput
    ? {
        ...plan,
        steps_to_execute: stepNormalization.steps as unknown as Plan["steps_to_execute"],
      }
    : plan;

  // Generate fallback plan_markdown if missing
  if (!normalized.plan_markdown) {
    const title = normalized.title || normalized.dataset_name || 'Plan';
    const objective = normalized.objective ? `> ${normalized.objective}\n\n` : '';
    const steps = (normalized.execution_steps ?? [])
      .map(s => `- [ ] ${s.step}`)
      .join('\n');
    normalized.plan_markdown = `# ${title}\n\n${objective}${steps || '_No steps configured_'}`;
  }

  return normalized;
}

/** Write to both cache and IndexedDB */
async function put(key: string, stored: StoredPlan): Promise<void> {
  cache.set(key, stored);
  await persistToDB(stored);
}

/** Read from cache first, then IndexedDB */
async function get(key: string): Promise<StoredPlan | null> {
  const cached = cache.get(key);
  if (cached) return cached;

  const fromDB = await loadFromDB(key);
  if (fromDB) {
    cache.set(key, fromDB);
  }
  return fromDB;
}

/** Delete from both cache and IndexedDB */
async function remove(key: string): Promise<void> {
  cache.delete(key);
  await deleteFromDB(key);
}

// =============================================================================
// Core CRUD
// =============================================================================

/**
 * Save a proposed plan (status: 'proposed')
 */
export async function saveProposedPlan(
  workflowId: string,
  plan: Plan,
): Promise<void> {
  const stored: StoredPlan = {
    workflowId,
    plan: normalizePlan(plan),
    status: 'proposed',
    executionProgress: null,
    executionSummary: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await put(workflowId, stored);
}

/**
 * Get the full stored plan record (includes status + execution progress + summary)
 */
export async function getStoredPlan(
  workflowId: string,
): Promise<StoredPlan | null> {
  return get(workflowId);
}

/**
 * Get the proposed plan (returns just the plan data)
 */
export async function getProposedPlan(
  workflowId: string,
): Promise<Plan | null> {
  const stored = await get(workflowId);
  return stored?.plan ?? null;
}

/**
 * Update the status of a stored plan
 */
export async function updatePlanStatus(
  workflowId: string,
  status: PlanStatus,
): Promise<void> {
  const stored = await get(workflowId);
  if (!stored) return;

  await put(workflowId, {
    ...stored,
    status,
    updatedAt: Date.now(),
  });
}

/**
 * Update execution progress and set status to 'executing'
 */
export async function updatePlanExecution(
  workflowId: string,
  progress: ExecutionProgress,
  summary?: ExecutionSummary | null,
): Promise<void> {
  const stored = await get(workflowId);
  if (!stored) return;

  await put(workflowId, {
    ...stored,
    status: 'executing',
    executionProgress: progress,
    executionSummary: summary ?? stored.executionSummary,
    updatedAt: Date.now(),
  });
}

/**
 * Mark plan as completed with final progress and summary
 */
export async function completePlan(
  workflowId: string,
  finalProgress: ExecutionProgress | null,
  summary?: ExecutionSummary | null,
): Promise<void> {
  const stored = await get(workflowId);
  if (!stored) return;

  await put(workflowId, {
    ...stored,
    status: 'completed',
    executionProgress: finalProgress ?? stored.executionProgress,
    executionSummary: summary ?? stored.executionSummary,
    updatedAt: Date.now(),
  });
}

/**
 * Mark plan as failed with final progress and summary
 */
export async function failPlan(
  workflowId: string,
  finalProgress: ExecutionProgress | null,
  summary?: ExecutionSummary | null,
): Promise<void> {
  const stored = await get(workflowId);
  if (!stored) return;

  await put(workflowId, {
    ...stored,
    status: 'failed',
    executionProgress: finalProgress ?? stored.executionProgress,
    executionSummary: summary ?? stored.executionSummary,
    updatedAt: Date.now(),
  });
}

/**
 * Update only the plan_markdown field (preserves status, executionProgress, etc.)
 */
export async function updateStoredPlanMarkdown(
  workflowId: string,
  planMarkdown: string,
): Promise<void> {
  const stored = await get(workflowId);
  if (!stored) return;

  await put(workflowId, {
    ...stored,
    plan: { ...stored.plan, plan_markdown: planMarkdown },
    updatedAt: Date.now(),
  });
}

/**
 * Clear the plan (on dismiss — removes entirely)
 */
export async function clearProposedPlan(workflowId: string): Promise<void> {
  await remove(workflowId);
}

/**
 * Check if a workflow has a proposed plan
 */
export async function hasProposedPlan(workflowId: string): Promise<boolean> {
  const stored = await get(workflowId);
  return stored !== null && stored !== undefined && stored.status === 'proposed';
}

// =============================================================================
// Plan Snapshots (for diff computation in save_plan)
// =============================================================================

/**
 * Save snapshot of the last applied plan (for diff computation in save_plan).
 */
export async function savePreviousPlanSnapshot(workflowId: string, plan: Plan): Promise<void> {
  const snapshot: StoredPlan = {
    workflowId: `${SNAPSHOT_KEY_PREFIX}${workflowId}`,
    plan: normalizePlan(plan),
    status: 'proposed',
    executionProgress: null,
    executionSummary: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await put(snapshot.workflowId, snapshot);
}

/**
 * Get the last applied plan snapshot (null if first proposal).
 */
export async function getPreviousPlanSnapshot(workflowId: string): Promise<Plan | null> {
  const snapshot = await get(`${SNAPSHOT_KEY_PREFIX}${workflowId}`);
  return snapshot?.plan ?? null;
}
