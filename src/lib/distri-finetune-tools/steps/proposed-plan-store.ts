/**
 * Proposed Plan Store
 *
 * Persists proposed setup plans to IndexedDB so they survive page refresh.
 * Plans are stored per dataset and cleared when approved or dismissed.
 */

import type { SetupPlan } from "./propose-setup-plan";
import { getDB } from "@/services/finetune-workflow-db";

interface StoredProposedPlan {
  datasetId: string;
  plan: SetupPlan;
  createdAt: number;
}

/**
 * Save a proposed plan for a dataset
 */
export async function saveProposedPlan(
  datasetId: string,
  plan: SetupPlan,
): Promise<void> {
  try {
    const db = await getDB();

    // Check if store exists
    if (!db.objectStoreNames.contains("proposedPlans")) {
      console.error(
        "[proposed-plan-store] proposedPlans store does not exist! DB version:",
        db.version,
      );
      return;
    }

    const stored: StoredProposedPlan = {
      datasetId,
      plan,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readwrite");
      const store = tx.objectStore("proposedPlans");
      const request = store.put(stored);

      request.onsuccess = () => {
        console.log("[proposed-plan-store] Plan saved for dataset:", datasetId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to save plan:", error);
  }
}

/**
 * Get the proposed plan for a dataset (if any)
 */
export async function getProposedPlan(
  datasetId: string,
): Promise<SetupPlan | null> {
  try {
   
    const db = await getDB();

    // Check if store exists
    if (!db.objectStoreNames.contains("proposedPlans")) {
      console.warn(
        "[proposed-plan-store] proposedPlans store does not exist! DB version:",
        db.version,
      );
      console.warn(
        "[proposed-plan-store] You may need to clear IndexedDB and refresh. Available stores:",
        Array.from(db.objectStoreNames),
      );
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction("proposedPlans", "readonly");
      const store = tx.objectStore("proposedPlans");
      const request = store.get(datasetId);

      request.onsuccess = () => {
        const stored = request.result as StoredProposedPlan | undefined;
        console.log(
          "[proposed-plan-store] Get plan for dataset:",
          datasetId,
          stored ? "FOUND" : "NOT FOUND",
        );
        resolve(stored?.plan || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[proposed-plan-store] Failed to get plan:", error);
    return null;
  }
}

/**
 * Clear the proposed plan for a dataset (on approve or dismiss)
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
  const plan = await getProposedPlan(datasetId);
  return plan !== null;
}
