/**
 * Orphan Data Cleanup Service
 *
 * Scans all IndexedDB stores for data referencing dataset IDs that no longer
 * exist in the datasets table, and removes them. Runs once on app startup.
 *
 * Stores checked:
 *   vllora-datasets DB:     records, datasetFinetuneJobs
 *   vllora-finetune DB:     workflows, dryRunJobs, proposedPlans
 *   vllora-knowledge-sources DB: knowledge_sources
 */

import * as datasetsDB from './datasets-db';
import { getDB as getFinetuneDB } from './finetune-workflow-db';
import { deleteKnowledgeSourcesByDataset } from './knowledge-sources-db';

let hasRun = false;

/**
 * Clean up orphaned data across all IndexedDB stores.
 * Safe to call multiple times — only runs once per session.
 */
export async function cleanupOrphanedData(): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  try {
    // Get all valid dataset IDs
    const datasets = await datasetsDB.getAllDatasets();
    const validIds = new Set(datasets.map(d => d.id));

    // Run all cleanup tasks in parallel
    const results = await Promise.allSettled([
      cleanupOrphanedRecords(validIds),
      cleanupOrphanedFinetuneJobs(validIds),
      cleanupOrphanedWorkflows(validIds),
      cleanupOrphanedDryRunJobs(validIds),
      cleanupOrphanedProposedPlans(validIds),
      cleanupOrphanedKnowledgeSources(validIds),
    ]);

    const totalCleaned = results.reduce((sum, r) => {
      if (r.status === 'fulfilled') return sum + r.value;
      console.warn('[orphan-cleanup] Task failed:', r.reason);
      return sum;
    }, 0);

    if (totalCleaned > 0) {
      console.log(`[orphan-cleanup] Removed ${totalCleaned} orphaned entries`);
    }
  } catch (err) {
    console.warn('[orphan-cleanup] Failed:', err);
  }
}

/** Delete records whose datasetId doesn't exist */
async function cleanupOrphanedRecords(validIds: Set<string>): Promise<number> {
  const db = await datasetsDB.getDB();
  return deleteOrphansByIndex(db, 'records', 'datasetId', validIds);
}

/** Delete datasetFinetuneJobs whose datasetId doesn't exist */
async function cleanupOrphanedFinetuneJobs(validIds: Set<string>): Promise<number> {
  const db = await datasetsDB.getDB();
  return deleteOrphansByIndex(db, 'datasetFinetuneJobs', 'datasetId', validIds);
}

/** Delete workflows whose datasetId doesn't exist (cascades to snapshots + generationHistory) */
async function cleanupOrphanedWorkflows(validIds: Set<string>): Promise<number> {
  const db = await getFinetuneDB();

  // Find orphaned workflow IDs
  const orphanWorkflowIds = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction('workflows', 'readonly');
    const store = tx.objectStore('workflows');
    const request = store.getAll();

    request.onsuccess = () => {
      const ids = request.result
        .filter((w: { datasetId: string }) => !validIds.has(w.datasetId))
        .map((w: { id: string }) => w.id);
      resolve(ids);
    };
    request.onerror = () => reject(request.error);
  });

  if (orphanWorkflowIds.length === 0) return 0;

  // Delete workflows + cascading snapshots + generationHistory
  const { deleteWorkflow } = await import('./finetune-workflow-db');
  for (const id of orphanWorkflowIds) {
    await deleteWorkflow(id);
  }

  return orphanWorkflowIds.length;
}

/** Delete dry run jobs whose datasetId doesn't exist */
async function cleanupOrphanedDryRunJobs(validIds: Set<string>): Promise<number> {
  const db = await getFinetuneDB();
  return deleteOrphansByIndex(db, 'dryRunJobs', 'datasetId', validIds);
}

/** Delete proposed plans whose datasetId doesn't exist */
async function cleanupOrphanedProposedPlans(validIds: Set<string>): Promise<number> {
  const db = await getFinetuneDB();

  // proposedPlans uses datasetId as keyPath, not an index
  return new Promise((resolve, reject) => {
    const tx = db.transaction('proposedPlans', 'readwrite');
    const store = tx.objectStore('proposedPlans');
    const request = store.getAll();
    let deleted = 0;

    request.onsuccess = () => {
      for (const plan of request.result) {
        if (!validIds.has(plan.datasetId)) {
          store.delete(plan.datasetId);
          deleted++;
        }
      }
    };

    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete knowledge sources whose datasetId doesn't exist */
async function cleanupOrphanedKnowledgeSources(validIds: Set<string>): Promise<number> {
  // Knowledge sources are in a separate DB — use the existing service functions
  // We need to get all unique datasetIds from knowledge sources and check against valid set
  const { getDB: getKsDB } = await import('./knowledge-sources-db');
  const db = await getKsDB();

  // Get all unique orphaned datasetIds
  const orphanDatasetIds = await new Promise<Set<string>>((resolve, reject) => {
    const tx = db.transaction('knowledge_sources', 'readonly');
    const store = tx.objectStore('knowledge_sources');
    const request = store.getAll();

    request.onsuccess = () => {
      const ids = new Set<string>();
      for (const source of request.result) {
        if (!validIds.has(source.datasetId)) {
          ids.add(source.datasetId);
        }
      }
      resolve(ids);
    };
    request.onerror = () => reject(request.error);
  });

  let deleted = 0;
  for (const datasetId of orphanDatasetIds) {
    await deleteKnowledgeSourcesByDataset(datasetId);
    deleted++;
  }

  return deleted;
}

/**
 * Generic helper: scan an index for entries whose key is not in validIds, delete them.
 */
function deleteOrphansByIndex(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  validIds: Set<string>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const cursorRequest = store.openCursor();
    let deleted = 0;

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value;
        if (record[indexName] && !validIds.has(record[indexName])) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error);
  });
}
