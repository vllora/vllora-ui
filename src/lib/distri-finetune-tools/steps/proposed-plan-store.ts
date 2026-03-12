/**
 * Proposed Plan Store
 *
 * Persists plans to IndexedDB with lifecycle status tracking.
 * Plans survive page refresh and track their full lifecycle:
 * proposed → approved → executing → completed/failed/dismissed
 */

import type { Plan } from "./propose-plan";
import type { ExecutionProgress } from "./execute-plan";
import { normalizePlanSteps } from "./plan-step-normalization";

// =============================================================================
// Local IndexedDB access for proposedPlans store
// =============================================================================

const DB_NAME = 'vllora-finetune';
const DB_VERSION = 7;
let dbInstance: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;

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
      if (!db.objectStoreNames.contains('proposedPlans')) {
        db.createObjectStore('proposedPlans', { keyPath: 'datasetId' });
      }
    };
  });
}

// =============================================================================
// Types
// =============================================================================

export type PlanStatus = 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'dismissed';

export interface StoredPlan {
  datasetId: string;
  plan: Plan;
  status: PlanStatus;
  executionProgress: ExecutionProgress | null;
  createdAt: number;
  updatedAt: number;
}

// Backward compat alias
interface StoredProposedPlan {
  datasetId: string;
  plan: Plan;
  status?: PlanStatus;
  executionProgress?: ExecutionProgress | null;
  createdAt: number;
  updatedAt?: number;
}

// =============================================================================
// Helpers
// =============================================================================

function hasStore(db: IDBDatabase): boolean {
  if (!db.objectStoreNames.contains("proposedPlans")) {
    console.error(
      "[proposed-plan-store] proposedPlans store does not exist! DB version:",
      db.version,
    );
    return false;
  }
  return true;
}

function normalizeStored(raw: StoredProposedPlan): StoredPlan {
  const rawSteps = Array.isArray(raw.plan.steps_to_execute)
    ? (raw.plan.steps_to_execute as unknown as string[])
    : undefined;
  const stepNormalization = normalizePlanSteps(rawSteps, { fallbackToDefaultWhenEmpty: true });

  const normalizedPlan: Plan = stepNormalization.hadInput
    ? {
        ...raw.plan,
        steps_to_execute: stepNormalization.steps as unknown as Plan["steps_to_execute"],
      }
    : raw.plan;

  // Backward compat: old plans may not have plan_markdown.
  // Generate a minimal fallback so the frontend can render something.
  if (!normalizedPlan.plan_markdown) {
    const title = normalizedPlan.title || normalizedPlan.dataset_name || 'Plan';
    const objective = normalizedPlan.objective ? `> ${normalizedPlan.objective}\n\n` : '';
    const steps = (normalizedPlan.execution_steps ?? [])
      .map(s => `- [ ] ${s.step}`)
      .join('\n');
    normalizedPlan.plan_markdown = `# ${title}\n\n${objective}${steps || '_No steps configured_'}`;
  }

  return {
    datasetId: raw.datasetId,
    plan: normalizedPlan,
    status: raw.status || 'proposed',
    executionProgress: raw.executionProgress || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt || raw.createdAt,
  };
}

// =============================================================================
// Core CRUD
// =============================================================================

/**
 * Save a proposed plan for a dataset (status: 'proposed')
 */
export async function saveProposedPlan(
  datasetId: string,
  plan: Plan,
): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db)) return;

    const rawSteps = Array.isArray(plan.steps_to_execute)
      ? (plan.steps_to_execute as unknown as string[])
      : undefined;
    const stepNormalization = normalizePlanSteps(rawSteps, { fallbackToDefaultWhenEmpty: true });
    const normalizedPlan: Plan = stepNormalization.hadInput
      ? {
          ...plan,
          steps_to_execute: stepNormalization.steps as unknown as Plan["steps_to_execute"],
        }
      : plan;

    const stored: StoredPlan = {
      datasetId,
      plan: normalizedPlan,
      status: 'proposed',
      executionProgress: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(stored);

      request.onsuccess = () => {
        console.log("[proposed-plan-store] Plan saved for dataset:", datasetId, "status: proposed");
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to save plan:", error);
  }
}

/**
 * Get the full stored plan record for a dataset (includes status + execution progress)
 */
export async function getStoredPlan(
  datasetId: string,
): Promise<StoredPlan | null> {
  try {
    const db = await getDB();
    if (!hasStore(db)) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readonly");
      const store = tx.objectStore("proposedPlans");
      const request = store.get(datasetId);

      request.onsuccess = () => {
        const raw = request.result as StoredProposedPlan | undefined;
        if (!raw) {
          resolve(null);
          return;
        }
        resolve(normalizeStored(raw));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to get stored plan:", error);
    return null;
  }
}

/**
 * Get the proposed plan for a dataset (backward compat — returns just the plan data)
 */
export async function getProposedPlan(
  datasetId: string,
): Promise<Plan | null> {
  const stored = await getStoredPlan(datasetId);
  return stored?.plan || null;
}

/**
 * Update the status of a stored plan
 */
export async function updatePlanStatus(
  datasetId: string,
  status: PlanStatus,
): Promise<void> {
  try {
    const stored = await getStoredPlan(datasetId);
    if (!stored) {
      console.warn("[proposed-plan-store] No plan found to update status for:", datasetId);
      return;
    }

    const db = await getDB();
    if (!hasStore(db)) return;

    const updated: StoredPlan = {
      ...stored,
      status,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(updated);

      request.onsuccess = () => {
        console.log("[proposed-plan-store] Status updated:", datasetId, "→", status);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to update plan status:", error);
  }
}

/**
 * Update execution progress and set status to 'executing'
 */
export async function updatePlanExecution(
  datasetId: string,
  progress: ExecutionProgress,
): Promise<void> {
  try {
    const stored = await getStoredPlan(datasetId);
    if (!stored) return;

    const db = await getDB();
    if (!hasStore(db)) return;

    const updated: StoredPlan = {
      ...stored,
      status: 'executing',
      executionProgress: progress,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(updated);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to update execution:", error);
  }
}

/**
 * Mark plan as completed with final progress
 */
export async function completePlan(
  datasetId: string,
  finalProgress: ExecutionProgress | null,
): Promise<void> {
  try {
    const stored = await getStoredPlan(datasetId);
    if (!stored) return;

    const db = await getDB();
    if (!hasStore(db)) return;

    const updated: StoredPlan = {
      ...stored,
      status: 'completed',
      executionProgress: finalProgress ?? stored.executionProgress,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(updated);

      request.onsuccess = () => {
        console.log("[proposed-plan-store] Plan completed:", datasetId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to complete plan:", error);
  }
}

/**
 * Mark plan as failed with final progress
 */
export async function failPlan(
  datasetId: string,
  finalProgress: ExecutionProgress | null,
): Promise<void> {
  try {
    const stored = await getStoredPlan(datasetId);
    if (!stored) return;

    const db = await getDB();
    if (!hasStore(db)) return;

    const updated: StoredPlan = {
      ...stored,
      status: 'failed',
      executionProgress: finalProgress ?? stored.executionProgress,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(updated);

      request.onsuccess = () => {
        console.log("[proposed-plan-store] Plan failed:", datasetId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to mark plan as failed:", error);
  }
}

/**
 * Update only the plan_markdown field (preserves status, executionProgress, etc.)
 * Used by the update_plan_markdown tool during agent-driven execution.
 */
export async function updateStoredPlanMarkdown(
  datasetId: string,
  planMarkdown: string,
): Promise<void> {
  try {
    const stored = await getStoredPlan(datasetId);
    if (!stored) {
      console.warn("[proposed-plan-store] No plan found to update markdown for:", datasetId);
      return;
    }

    const db = await getDB();
    if (!hasStore(db)) return;

    const updated: StoredPlan = {
      ...stored,
      plan: { ...stored.plan, plan_markdown: planMarkdown },
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(updated);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to update plan markdown:", error);
  }
}

/**
 * Clear the plan for a dataset (on dismiss — removes entirely)
 */
export async function clearProposedPlan(datasetId: string): Promise<void> {
  try {
    const db = await getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.delete(datasetId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to clear plan:", error);
  }
}

/**
 * Check if a dataset has a proposed plan
 */
export async function hasProposedPlan(datasetId: string): Promise<boolean> {
  const stored = await getStoredPlan(datasetId);
  return stored !== null && stored.status === 'proposed';
}

// =============================================================================
// Plan Snapshots (for diff computation in save_plan)
// =============================================================================

const SNAPSHOT_KEY_PREFIX = 'previous:';

/**
 * Save snapshot of the last applied plan (for diff computation in save_plan).
 * Uses a separate key prefix so it doesn't interfere with the main plan lifecycle.
 */
export async function savePreviousPlanSnapshot(datasetId: string, plan: Plan): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db)) return;

    const rawSteps = Array.isArray(plan.steps_to_execute)
      ? (plan.steps_to_execute as unknown as string[])
      : undefined;
    const stepNormalization = normalizePlanSteps(rawSteps, { fallbackToDefaultWhenEmpty: true });
    const normalizedPlan: Plan = stepNormalization.hadInput
      ? {
          ...plan,
          steps_to_execute: stepNormalization.steps as unknown as Plan["steps_to_execute"],
        }
      : plan;

    const snapshot: StoredPlan = {
      datasetId: `${SNAPSHOT_KEY_PREFIX}${datasetId}`,
      plan: normalizedPlan,
      status: 'proposed',
      executionProgress: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(snapshot);

      request.onsuccess = () => {
        console.log("[proposed-plan-store] Previous plan snapshot saved for dataset:", datasetId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to save previous plan snapshot:", error);
  }
}

/**
 * Get the last applied plan snapshot (null if first proposal).
 * Used by save_plan to compute diff against previous plan.
 */
export async function getPreviousPlanSnapshot(datasetId: string): Promise<Plan | null> {
  try {
    const db = await getDB();
    if (!hasStore(db)) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readonly");
      const store = tx.objectStore("proposedPlans");
      const request = store.get(`${SNAPSHOT_KEY_PREFIX}${datasetId}`);

      request.onsuccess = () => {
        const raw = request.result as StoredProposedPlan | undefined;
        if (!raw) {
          resolve(null);
          return;
        }
        resolve(normalizeStored(raw).plan);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to get previous plan snapshot:", error);
    return null;
  }
}
