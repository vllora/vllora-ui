/**
 * E2E Test Cleanup Script
 *
 * Paste this into the browser console (localhost:5173) after E2E testing
 * to identify and remove test datasets created during the run.
 *
 * Test datasets are identified by the "[E2E]" prefix in their name.
 * The script cascades deletes across all 4 IndexedDB databases:
 *   - vllora-datasets: datasets, records, datasetFinetuneJobs
 *   - vllora-finetune: workflows, snapshots, generationHistory,
 *                       dryRunJobs, jobEvaluations, proposedPlans, iterationState
 *   - vllora-knowledge-sources: knowledge_sources
 *
 * Usage:
 *   1. Copy this entire file contents
 *   2. Open browser console on localhost:5173
 *   3. Paste and run
 *   4. Review the list of datasets found
 *   5. Confirm deletion when prompted
 *
 * Naming convention for E2E tests:
 *   Use "[E2E] " prefix when creating datasets, e.g.:
 *   "[E2E] Math Tutor - healthy eval test"
 */

(async function e2eCleanup() {
  const E2E_PREFIX = '[E2E]';

  // ─── Helpers ───────────────────────────────────────────────────────────

  function openDB(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function deleteByKey(db, storeName, key) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve();
        return;
      }
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function deleteByIndex(db, storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve(0);
        return;
      }
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.openCursor(IDBKeyRange.only(value));
      let count = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        } else {
          resolve(count);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ─── Find test datasets ───────────────────────────────────────────────

  let datasetsDb;
  try {
    datasetsDb = await openDB('vllora-datasets');
  } catch {
    console.error('Could not open vllora-datasets database');
    return;
  }

  const allDatasets = await getAllFromStore(datasetsDb, 'datasets');
  const testDatasets = allDatasets.filter(d => d.name?.startsWith(E2E_PREFIX));
  const nonTestDatasets = allDatasets.filter(d => !d.name?.startsWith(E2E_PREFIX));

  console.log('\n┌─────────────────────────────────────────────────┐');
  console.log('│           E2E Test Dataset Cleanup              │');
  console.log('└─────────────────────────────────────────────────┘\n');

  if (testDatasets.length === 0) {
    console.log(`No test datasets found (looking for "${E2E_PREFIX}" prefix).`);
    console.log(`\nAll ${allDatasets.length} datasets:`);
    allDatasets.forEach(d => console.log(`  • ${d.name} (${d.id})`));
    datasetsDb.close();
    return;
  }

  console.log(`Found ${testDatasets.length} test dataset(s) to clean up:\n`);
  testDatasets.forEach(d =>
    console.log(`  🗑  ${d.name}  (${d.id})`)
  );

  console.log(`\nKeeping ${nonTestDatasets.length} non-test dataset(s):\n`);
  nonTestDatasets.forEach(d =>
    console.log(`  ✓  ${d.name}  (${d.id})`)
  );

  // ─── Confirm ──────────────────────────────────────────────────────────

  const confirmed = confirm(
    `Delete ${testDatasets.length} test dataset(s) and all related data?\n\n` +
    testDatasets.map(d => `• ${d.name}`).join('\n')
  );

  if (!confirmed) {
    console.log('\nCancelled. No data was deleted.');
    datasetsDb.close();
    return;
  }

  // ─── Delete across all databases ──────────────────────────────────────

  let finetuneDb, knowledgeDb;
  try { finetuneDb = await openDB('vllora-finetune'); } catch { /* may not exist */ }
  try { knowledgeDb = await openDB('vllora-knowledge-sources'); } catch { /* may not exist */ }

  const summary = { datasets: 0, records: 0, finetuneJobs: 0, workflows: 0, dryRunJobs: 0, knowledgeSources: 0, other: 0 };

  for (const dataset of testDatasets) {
    const id = dataset.id;
    console.log(`\nDeleting: ${dataset.name} (${id})`);

    // vllora-datasets
    await deleteByKey(datasetsDb, 'datasets', id);
    summary.datasets++;

    const recordCount = await deleteByIndex(datasetsDb, 'records', 'datasetId', id);
    summary.records += recordCount;
    console.log(`  records: ${recordCount}`);

    const jobCount = await deleteByIndex(datasetsDb, 'datasetFinetuneJobs', 'datasetId', id);
    summary.finetuneJobs += jobCount;

    // vllora-finetune (all stores use datasetId index or datasetId as key)
    if (finetuneDb) {
      for (const store of ['workflows', 'snapshots', 'generationHistory', 'iterationState']) {
        if (finetuneDb.objectStoreNames.contains(store)) {
          const count = await deleteByIndex(finetuneDb, store, 'datasetId', id);
          summary.other += count;
        }
      }

      // dryRunJobs — need to find by datasetId, then also clean jobEvaluations
      if (finetuneDb.objectStoreNames.contains('dryRunJobs')) {
        const allJobs = await getAllFromStore(finetuneDb, 'dryRunJobs');
        const datasetJobs = allJobs.filter(j => j.datasetId === id);
        for (const job of datasetJobs) {
          await deleteByKey(finetuneDb, 'dryRunJobs', job.id);
          summary.dryRunJobs++;
          // Clean associated evaluations
          if (finetuneDb.objectStoreNames.contains('jobEvaluations')) {
            await deleteByKey(finetuneDb, 'jobEvaluations', job.id);
          }
        }
      }

      // proposedPlans — keyed by datasetId directly
      if (finetuneDb.objectStoreNames.contains('proposedPlans')) {
        await deleteByKey(finetuneDb, 'proposedPlans', id);
      }
    }

    // vllora-knowledge-sources
    if (knowledgeDb) {
      const count = await deleteByIndex(knowledgeDb, 'knowledge_sources', 'datasetId', id);
      summary.knowledgeSources += count;
    }
  }

  // ─── Close DBs ────────────────────────────────────────────────────────

  datasetsDb.close();
  if (finetuneDb) finetuneDb.close();
  if (knowledgeDb) knowledgeDb.close();

  // ─── Clean up E2E localStorage flags ──────────────────────────────────

  localStorage.removeItem('vllora_mock_data_generation');
  console.log('  Removed localStorage: vllora_mock_data_generation');

  // ─── Summary ──────────────────────────────────────────────────────────

  console.log('\n┌─────────────────────────────────────────────────┐');
  console.log('│                Cleanup Complete                  │');
  console.log('└─────────────────────────────────────────────────┘');
  console.log(`  Datasets deleted:     ${summary.datasets}`);
  console.log(`  Records deleted:      ${summary.records}`);
  console.log(`  Finetune jobs:        ${summary.finetuneJobs}`);
  console.log(`  Dry run jobs:         ${summary.dryRunJobs}`);
  console.log(`  Knowledge sources:    ${summary.knowledgeSources}`);
  console.log(`  Other (workflows):    ${summary.other}`);
  console.log('\n  Reload the page to see changes.');
})();
