/**
 * Proposed Plan Store
 *
 * Persists setup plans to IndexedDB with lifecycle status tracking.
 * Plans survive page refresh and track their full lifecycle:
 * proposed → approved → executing → completed/failed/dismissed
 */

import type { SetupPlan } from "./propose-setup-plan";
import type { ExecutionProgress } from "./execute-setup-plan";
import { getDB } from "@/services/finetune-workflow-db";

// =============================================================================
// Types
// =============================================================================

export type PlanStatus = 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'dismissed';

export interface StoredPlan {
  datasetId: string;
  plan: SetupPlan;
  status: PlanStatus;
  executionProgress: ExecutionProgress | null;
  createdAt: number;
  updatedAt: number;
}

// Backward compat alias
interface StoredProposedPlan {
  datasetId: string;
  plan: SetupPlan;
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
  return {
    datasetId: raw.datasetId,
    plan: raw.plan,
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
  plan: SetupPlan,
): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db)) return;

    const stored: StoredPlan = {
      datasetId,
      plan,
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
): Promise<SetupPlan | null> {
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
  finalProgress: ExecutionProgress,
): Promise<void> {
  try {
    const stored = await getStoredPlan(datasetId);
    if (!stored) return;

    const db = await getDB();
    if (!hasStore(db)) return;

    const updated: StoredPlan = {
      ...stored,
      status: 'completed',
      executionProgress: finalProgress,
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
  finalProgress: ExecutionProgress,
): Promise<void> {
  try {
    const stored = await getStoredPlan(datasetId);
    if (!stored) return;

    const db = await getDB();
    if (!hasStore(db)) return;

    const updated: StoredPlan = {
      ...stored,
      status: 'failed',
      executionProgress: finalProgress,
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
