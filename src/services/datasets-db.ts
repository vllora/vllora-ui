import { Dataset, DatasetEvaluation, DatasetRecord, TopicHierarchyConfig } from '@/types/dataset-types';
import { Span } from '@/types/common-type';
import { extractDataInfoFromSpan } from '@/utils/modelUtils';
import { emitter } from '@/utils/eventEmitter';
import { generateDatasetReadme } from './dataset-readme-generator';

// Event type for dataset changes - context listens for this to refresh
export const DATASET_REFRESH_EVENT = 'vllora_dataset_refresh';

const DB_NAME = 'vllora-datasets';
const DB_VERSION = 3;

let dbInstance: IDBDatabase | null = null;

// Initialize and get database connection
export async function getDB(): Promise<IDBDatabase> {
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
      const tx = (event.target as IDBOpenDBRequest).transaction as IDBTransaction;

      // Create datasets store
      if (!db.objectStoreNames.contains('datasets')) {
        const datasetsStore = db.createObjectStore('datasets', { keyPath: 'id' });
        datasetsStore.createIndex('name', 'name', { unique: false });
        datasetsStore.createIndex('createdAt', 'createdAt', { unique: false });
        datasetsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Create or upgrade records store
      let recordsStore: IDBObjectStore;
      if (!db.objectStoreNames.contains('records')) {
        recordsStore = db.createObjectStore('records', { keyPath: 'id' });
        recordsStore.createIndex('datasetId', 'datasetId', { unique: false });
        recordsStore.createIndex('topic', 'topic', { unique: false });
        recordsStore.createIndex('createdAt', 'createdAt', { unique: false });
        recordsStore.createIndex('spanId', 'spanId', { unique: false });
        // Composite index for duplicate detection within a dataset
        recordsStore.createIndex('datasetId_spanId', ['datasetId', 'spanId'], { unique: false });
      } else {
        recordsStore = tx.objectStore('records');
      }

      // Create datasetFinetuneJobs store for tracking which datasets created which finetune jobs
      if (!db.objectStoreNames.contains('datasetFinetuneJobs')) {
        const finetuneJobsStore = db.createObjectStore('datasetFinetuneJobs', { keyPath: 'id' });
        finetuneJobsStore.createIndex('datasetId', 'datasetId', { unique: false });
        finetuneJobsStore.createIndex('jobId', 'jobId', { unique: false });
      }
    };
  });
}

// Get a dataset by ID
export async function getDatasetById(datasetId: string): Promise<Dataset | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const request = store.get(datasetId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Find a local dataset by its backend dataset ID
export async function getDatasetByBackendId(backendDatasetId: string): Promise<Dataset | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const request = store.getAll();

    request.onsuccess = () => {
      const match = request.result.find(
        (d: Dataset) => d.backendDatasetId === backendDatasetId
      );
      resolve(match || null);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get all datasets (metadata only)
export async function getAllDatasets(): Promise<Dataset[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by updatedAt descending
      const datasets = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(datasets);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get records for a dataset
export async function getRecordsByDatasetId(
  datasetId: string,
  recordIds?: string[]
): Promise<DatasetRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.getAll(datasetId);

    request.onsuccess = () => {
      // Filter by recordIds if provided
      let filteredResults = request.result;
      if (recordIds && recordIds.length > 0) {
        const idSet = new Set(recordIds);
        filteredResults = filteredResults.filter((r) => idSet.has(r.id));
      }

      // Sort by createdAt descending
      const records = filteredResults.sort((a, b) => b.createdAt - a.createdAt) as DatasetRecord[];
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get record count for a dataset
export async function getRecordCount(datasetId: string): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.count(datasetId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get topic coverage stats for a dataset (total records and records with topic assigned)
export async function getTopicCoverageStats(datasetId: string): Promise<{ total: number; withTopic: number }> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.getAll(datasetId);

    request.onsuccess = () => {
      const records = request.result as DatasetRecord[];
      const total = records.length;
      const withTopic = records.filter(r => r.topic && r.topic.trim() !== '').length;
      resolve({ total, withTopic });
    };
    request.onerror = () => reject(request.error);
  });
}

// Create a new dataset and auto-start workflow if objective is provided
export async function createDataset(name: string, datasetObjective?: string): Promise<Dataset> {
  const db = await getDB();
  const now = Date.now();
  const baseDataset: Dataset = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    ...(datasetObjective?.trim() && { datasetObjective: datasetObjective.trim() }),
  };
  const initialReadme = generateDatasetReadme({
    dataset: baseDataset,
    records: [],
    workflow: null,
    knowledgeSources: [],
    planSummary: undefined,
  });
  const dataset: Dataset = {
    ...baseDataset,
    readme: initialReadme,
    readmeUpdatedAt: now,
  };

  // First, save the dataset to IndexedDB
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');
    const request = store.add(dataset);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // Then, create workflow if dataset has an objective (separate transaction)
  // Note: Workflow starts at 'not_started' - Lucy will advance it when user begins finetune process
  if (datasetObjective?.trim()) {
    try {
      const { createWorkflow } = await import('./finetune-workflow-db');
      await createWorkflow(dataset.id, datasetObjective.trim());
    } catch (err) {
      console.warn('[createDataset] Failed to create workflow:', err);
      // Don't fail dataset creation if workflow creation fails
    }
  }

  return dataset;
}


// Add spans to a dataset
export async function addSpansToDataset(
  datasetId: string,
  spans: Span[],
  topic?: string
): Promise<number> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update dataset's updatedAt
    const getRequest = datasetsStore.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };
  

    // Add records
    let addedCount = 0;
    spans.forEach((span) => {
      const dataInfo = extractDataInfoFromSpan(span);

      const record: DatasetRecord = {
        id: crypto.randomUUID(),
        datasetId,
        data: dataInfo,
        spanId: span.span_id,
        topic: topic?.trim() || undefined,
        is_generated: false,
        createdAt: now,
        updatedAt: now,
      };
      const addRequest = recordsStore.add(record);
      addRequest.onsuccess = () => addedCount++;
    });

    tx.oncomplete = () => resolve(addedCount);
    tx.onerror = () => reject(tx.error);
  });
}

// Delete a dataset and all its records (including datasetFinetuneJobs)
export async function deleteDataset(datasetId: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records', 'datasetFinetuneJobs'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');
    const finetuneJobsStore = tx.objectStore('datasetFinetuneJobs');

    // Delete dataset
    datasetsStore.delete(datasetId);

    // Delete all records for this dataset
    const recordsIndex = recordsStore.index('datasetId');
    const recordsCursor = recordsIndex.openCursor(datasetId);

    recordsCursor.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Delete all finetune job associations for this dataset
    const jobsIndex = finetuneJobsStore.index('datasetId');
    const jobsCursor = jobsIndex.openCursor(datasetId);

    jobsCursor.onsuccess = (event) => {
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

// Clear all records from a dataset (keeps the dataset itself)
export async function clearDatasetRecords(datasetId: string): Promise<number> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update dataset's updatedAt
    const getRequest = datasetsStore.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    // Count and delete all records for this dataset
    let deletedCount = 0;
    const index = recordsStore.index('datasetId');
    const cursorRequest = index.openCursor(datasetId);

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

// Delete a single record
export async function deleteRecord(datasetId: string, recordId: string): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Delete record
    recordsStore.delete(recordId);

    // Update dataset's updatedAt
    const getRequest = datasetsStore.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Update a record's topic
export async function updateRecordTopic(
  datasetId: string,
  recordId: string,
  topic: string
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update record
    const getRecordRequest = recordsStore.get(recordId);
    getRecordRequest.onsuccess = () => {
      const record = getRecordRequest.result;
      if (record) {
        record.topic = topic?.trim() || undefined;
        record.updatedAt = now;
        recordsStore.put(record);
      }
    };

    // Update dataset's updatedAt
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Batch update multiple records' topics in a single transaction
export async function updateRecordTopicsBatch(
  datasetId: string,
  updates: Map<string, string> // recordId -> topic
): Promise<number> {
  if (updates.size === 0) return 0;

  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    let updatedCount = 0;

    // Update all records
    for (const [recordId, topic] of updates) {
      const getRecordRequest = recordsStore.get(recordId);
      getRecordRequest.onsuccess = () => {
        const record = getRecordRequest.result;
        if (record) {
          record.topic = topic?.trim() || undefined;
          record.updatedAt = now;
          recordsStore.put(record);
          updatedCount++;
        }
      };
    }

    // Update dataset's updatedAt once
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve(updatedCount);
    tx.onerror = () => reject(tx.error);
  });
}

// Update a record's data
export async function updateRecordData(
  datasetId: string,
  recordId: string,
  data: unknown
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update record
    const getRecordRequest = recordsStore.get(recordId);
    getRecordRequest.onsuccess = () => {
      const record = getRecordRequest.result;
      if (record) {
        record.data = data;
        record.updatedAt = now;
        recordsStore.put(record);
      }
    };

    // Update dataset's updatedAt
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Update a record's evaluation
export async function updateRecordEvaluation(
  datasetId: string,
  recordId: string,
  score: number | undefined
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update record
    const getRecordRequest = recordsStore.get(recordId);
    getRecordRequest.onsuccess = () => {
      const record = getRecordRequest.result;
      if (record) {
        if (score === undefined) {
          record.evaluation = undefined;
        } else {
          record.evaluation = {
            score,
            evaluatedAt: now,
          };
        }
        record.updatedAt = now;
        recordsStore.put(record);
      }
    };

    // Update dataset's updatedAt
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Update a record's evaluation with specific dry-run or finetune scores
export async function updateRecordEvaluationScores(
  datasetId: string,
  recordId: string,
  update: {
    dryRunScore?: number;
    dryRunModel?: string;
    finetuneScore?: number;
    finetuneModel?: string;
    incrementDryRunCount?: boolean;
    incrementFinetuneCount?: boolean;
  }
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records'], 'readwrite');
    const recordsStore = tx.objectStore('records');

    const getRequest = recordsStore.get(recordId);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (!record || record.datasetId !== datasetId) {
        console.warn('[updateRecordEvaluationScores] Record not found or dataset mismatch:', { recordId, datasetId, found: !!record });
        return;
      }

      const existing = record.evaluation || {};

      if (update.dryRunScore !== undefined) {
        existing.dryRunScore = update.dryRunScore;
        // Compute running average: new_avg = (old_avg * old_count + new) / (old_count + 1)
        const oldCount = existing.dryRunCount || 0;
        const oldAvg = existing.dryRunAvg ?? existing.dryRunScore ?? update.dryRunScore;
        existing.dryRunAvg = oldCount > 0
          ? (oldAvg * oldCount + update.dryRunScore) / (oldCount + 1)
          : update.dryRunScore;
        existing.score = update.dryRunScore;
        existing.dryRunEvaluatedAt = now;
        if (update.dryRunModel) existing.dryRunModel = update.dryRunModel;
      }
      if (update.finetuneScore !== undefined) {
        existing.finetuneScore = update.finetuneScore;
        const oldCount = existing.finetuneCount || 0;
        const oldAvg = existing.finetuneAvg ?? existing.finetuneScore ?? update.finetuneScore;
        existing.finetuneAvg = oldCount > 0
          ? (oldAvg * oldCount + update.finetuneScore) / (oldCount + 1)
          : update.finetuneScore;
        existing.score = update.finetuneScore; // Finetune takes precedence
        existing.finetuneEvaluatedAt = now;
        if (update.finetuneModel) existing.finetuneModel = update.finetuneModel;
      }
      if (update.incrementDryRunCount) {
        existing.dryRunCount = (existing.dryRunCount || 0) + 1;
      }
      if (update.incrementFinetuneCount) {
        existing.finetuneCount = (existing.finetuneCount || 0) + 1;
      }
      existing.evaluatedAt = now;

      record.evaluation = existing;
      record.updatedAt = now;
      recordsStore.put(record);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Backfill dryRunCount/dryRunAvg for records that were evaluated by old dry-run
 * code which only set `evaluation.score` but not the newer typed fields.
 *
 * Scans completed jobs' pollingSnapshot results, groups scores per record,
 * and writes count + average + latest score for records missing `dryRunCount`.
 *
 * Idempotent: skips records that already have `dryRunCount` set.
 */
export async function backfillDryRunScoresFromJobs(
  datasetId: string,
  completedJobs: Array<{
    pollingSnapshot?: { results: Array<{
      row_index: number;
      epochs?: Record<string, Array<{
        dataset_row_id?: string;
        score?: number | null;
        status?: string;
      }>>;
    }> };
  }>
): Promise<number> {
  // 1. Collect per-record scores from all completed jobs
  const scoresByRecordId = new Map<string, number[]>();

  for (const job of completedJobs) {
    const results = job.pollingSnapshot?.results;
    if (!results || results.length === 0) continue;

    for (const row of results) {
      if (!row.epochs) continue;
      for (const entries of Object.values(row.epochs)) {
        for (const entry of entries) {
          const rid = entry.dataset_row_id;
          const score = entry.score;
          if (rid && typeof score === 'number') {
            const existing = scoresByRecordId.get(rid) || [];
            existing.push(score);
            scoresByRecordId.set(rid, existing);
          }
        }
      }
    }
  }

  if (scoresByRecordId.size === 0) return 0;

  // 2. Update records that are missing dryRunCount
  const db = await getDB();
  const now = Date.now();
  let backfilled = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records'], 'readwrite');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.openCursor(IDBKeyRange.only(datasetId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) return; // done

      const record = cursor.value as DatasetRecord;
      const scores = scoresByRecordId.get(record.id);

      // Only backfill records that have job scores but are missing dryRunCount
      if (scores && scores.length > 0 && !record.evaluation?.dryRunCount) {
        const count = scores.length;
        const avg = scores.reduce((sum, s) => sum + s, 0) / count;
        const latest = scores[scores.length - 1]; // last job = most recent

        record.evaluation = {
          ...(record.evaluation || {}),
          dryRunScore: latest,
          dryRunAvg: avg,
          dryRunCount: count,
          score: record.evaluation?.finetuneScore ?? latest,
          evaluatedAt: now,
        };
        record.updatedAt = now;
        cursor.update(record);
        backfilled++;
      }

      cursor.continue();
    };

    tx.oncomplete = () => resolve(backfilled);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Backfill dryRunModel for records that have dryRunScore but no dryRunModel.
 * Uses the most recent completed dry run job's rolloutModel for the dataset.
 *
 * Idempotent: skips records that already have dryRunModel set.
 */
export async function backfillDryRunModel(
  datasetId: string,
  rolloutModel: string,
): Promise<number> {
  const db = await getDB();
  let backfilled = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records'], 'readwrite');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.openCursor(IDBKeyRange.only(datasetId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) return;

      const record = cursor.value as DatasetRecord;

      if (record.evaluation?.dryRunScore != null && !record.evaluation.dryRunModel) {
        record.evaluation.dryRunModel = rolloutModel;
        cursor.update(record);
        backfilled++;
      }

      cursor.continue();
    };

    tx.oncomplete = () => resolve(backfilled);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Persist finetune evaluation scores to records.
 *
 * For each row result, computes the average score across all epochs and
 * calls updateRecordEvaluationScores with finetuneScore + incrementFinetuneCount.
 *
 * @param backendDatasetId - Backend dataset ID (to look up local dataset)
 * @param results - Finetune evaluation results (RowEpochResults[])
 * @returns Object with number of records persisted and the local dataset ID
 */
export async function persistFinetuneScoresToRecords(
  backendDatasetId: string,
  results: Array<{
    row_index: number;
    row: { id: string; [key: string]: unknown };
    epochs: Record<number, Array<{ score?: number; [key: string]: unknown }>>;
  }>,
  /** When true, only updates the score without incrementing finetuneCount (for in-progress jobs) */
  previewOnly = false,
  /** Model name to store with the finetune evaluation */
  finetuneModel?: string,
): Promise<{ persisted: number; localDatasetId?: string }> {
  // Look up local dataset
  const dataset = await getDatasetByBackendId(backendDatasetId);
  if (!dataset) {
    console.warn('[persistFinetuneScores] No local dataset found for backend ID:', backendDatasetId);
    return { persisted: 0 };
  }

  let persisted = 0;

  for (const row of results) {
    const recordId = row.row?.id;
    if (!recordId) continue;

    // Compute average score across all epochs
    const allScores: number[] = [];
    for (const epochEntries of Object.values(row.epochs)) {
      for (const entry of epochEntries) {
        if (typeof entry.score === 'number') {
          allScores.push(entry.score);
        }
      }
    }

    if (allScores.length === 0) continue;

    const avgScore = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;

    await updateRecordEvaluationScores(dataset.id, recordId, {
      finetuneScore: avgScore,
      finetuneModel,
      incrementFinetuneCount: !previewOnly,
    });
    persisted++;
  }

  console.log(`[persistFinetuneScores] Persisted ${persisted}/${results.length} scores (preview=${previewOnly}) for dataset ${dataset.id}`);
  return { persisted, localDatasetId: dataset.id };
}

// Clear all record topics for a dataset
export async function clearAllRecordTopics(datasetId: string): Promise<number> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');
    const index = recordsStore.index('datasetId');

    let clearedCount = 0;
    const request = index.openCursor(IDBKeyRange.only(datasetId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value;
        if (record.topic) {
          record.topic = undefined;
          record.updatedAt = now;
          cursor.update(record);
          clearedCount++;
        }
        cursor.continue();
      }
    };

    // Update dataset's updatedAt
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve(clearedCount);
    tx.onerror = () => reject(tx.error);
  });
}

// Rename a topic across all records in a dataset
export async function renameTopicInRecords(
  datasetId: string,
  oldName: string,
  newName: string
): Promise<number> {
  if (!oldName || !newName || oldName === newName) return 0;

  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');
    const index = recordsStore.index('datasetId');

    let renamedCount = 0;
    const request = index.openCursor(IDBKeyRange.only(datasetId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value;
        if (record.topic === oldName) {
          record.topic = newName.trim();
          record.updatedAt = now;
          cursor.update(record);
          renamedCount++;
        }
        cursor.continue();
      }
    };

    // Update dataset's updatedAt
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve(renamedCount);
    tx.onerror = () => reject(tx.error);
  });
}

// Clear topic from all records that have a specific topic name
export async function clearTopicFromRecords(
  datasetId: string,
  topicName: string
): Promise<number> {
  if (!topicName) return 0;

  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');
    const index = recordsStore.index('datasetId');

    let clearedCount = 0;
    const request = index.openCursor(IDBKeyRange.only(datasetId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value;
        if (record.topic === topicName) {
          record.topic = undefined;
          record.updatedAt = now;
          cursor.update(record);
          clearedCount++;
        }
        cursor.continue();
      }
    };

    // Update dataset's updatedAt
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve(clearedCount);
    tx.onerror = () => reject(tx.error);
  });
}

// Rename a dataset
export async function renameDataset(datasetId: string, newName: string): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.name = newName.trim();
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateDatasetObjective(datasetId: string, objective: string): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        const trimmed = objective.trim();
        if (trimmed) {
          dataset.datasetObjective = trimmed;
        } else {
          delete dataset.datasetObjective;
        }
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Update a dataset's backend dataset ID (set after uploading to cloud provider)
export async function updateDatasetBackendId(
  datasetId: string,
  backendDatasetId: string
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.backendDatasetId = backendDatasetId;
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Check if span already exists in a dataset
export async function spanExistsInDataset(datasetId: string, spanId: string): Promise<boolean> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId_spanId');
    const request = index.count([datasetId, spanId]);

    request.onsuccess = () => resolve(request.result > 0);
    request.onerror = () => reject(request.error);
  });
}

// Add raw records to a dataset (for importing from file)
export async function addRecordsToDataset(
  datasetId: string,
  records: Array<{
    data: unknown;
    metadata?: Record<string, unknown>;
    topic?: string;
    is_generated?: boolean;
    sourceRecordId?: string;
    evaluation?: DatasetEvaluation;
  }>,
  defaultTopic?: string
): Promise<DatasetRecord[]> {
  const db = await getDB();
  const now = Date.now();

  // Build all record objects first so we can return them
  const createdRecords: DatasetRecord[] = records.map((recordData) => {
    const topic = recordData.topic?.trim() || defaultTopic?.trim();

    return {
      id: crypto.randomUUID(),
      datasetId,
      data: recordData.data,
      metadata: recordData.metadata,
      topic: topic || undefined,
      is_generated: recordData.is_generated ?? false,
      sourceRecordId: recordData.sourceRecordId,
      evaluation: recordData.evaluation,
      createdAt: now,
      updatedAt: now,
    };
  });

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update dataset's updatedAt
    const getRequest = datasetsStore.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    // Add records with error tracking
    let addedCount = 0;
    let addErrors: string[] = [];
    createdRecords.forEach((record, index) => {
      const addRequest = recordsStore.add(record);
      addRequest.onsuccess = () => {
        addedCount++;
        console.log(`[datasetsDB] Record ${index + 1}/${createdRecords.length} added successfully (id: ${record.id.substring(0, 8)}...)`);
      };
      addRequest.onerror = () => {
        const errMsg = addRequest.error?.message || 'Unknown error';
        addErrors.push(`Record ${index + 1}: ${errMsg}`);
        console.error(`[datasetsDB] Failed to add record ${index + 1}:`, addRequest.error);
      };
    });

    tx.oncomplete = () => {
      console.log(`[datasetsDB] Transaction complete: ${addedCount}/${createdRecords.length} records added`);
      if (addErrors.length > 0) {
        console.warn(`[datasetsDB] Add errors:`, addErrors);
      }
      // Emit refresh event so UI updates with new records
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve(createdRecords);
    };
    tx.onerror = () => {
      console.error(`[datasetsDB] Transaction error:`, tx.error);
      reject(tx.error);
    };
  });
}

// Get all datasets that contain a specific spanId
export async function getDatasetsBySpanId(spanId: string): Promise<Dataset[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records', 'datasets'], 'readonly');
    const recordsStore = tx.objectStore('records');
    const datasetsStore = tx.objectStore('datasets');
    const index = recordsStore.index('spanId');
    const request = index.getAll(spanId);

    request.onsuccess = () => {
      const records = request.result;
      // Get unique datasetIds
      const datasetIds = [...new Set(records.map(r => r.datasetId))];

      // Fetch dataset metadata for each datasetId
      const datasets: Dataset[] = [];
      let completed = 0;

      if (datasetIds.length === 0) {
        resolve([]);
        return;
      }

      datasetIds.forEach(datasetId => {
        const getDatasetRequest = datasetsStore.get(datasetId);
        getDatasetRequest.onsuccess = () => {
          if (getDatasetRequest.result) {
            datasets.push(getDatasetRequest.result);
          }
          completed++;
          if (completed === datasetIds.length) {
            resolve(datasets);
          }
        };
        getDatasetRequest.onerror = () => {
          completed++;
          if (completed === datasetIds.length) {
            resolve(datasets);
          }
        };
      });
    };
    request.onerror = () => reject(request.error);
  });
}

// Update a dataset's topic hierarchy configuration
export async function updateDatasetTopicHierarchy(
  datasetId: string,
  topicHierarchy: TopicHierarchyConfig
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.topicHierarchy = topicHierarchy;
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => {
      // Emit refresh event so context auto-syncs with IndexedDB
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Update a dataset's eval script (grader)
export async function updateDatasetEvalScript(
  datasetId: string,
  evalScript: string
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.evalScript = evalScript;
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => {
      // Emit refresh event so context auto-syncs with IndexedDB
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Update a dataset's coverage statistics
export async function updateDatasetCoverageStats(
  datasetId: string,
  coverageStats: import('@/types/dataset-types').CoverageStats
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.coverageStats = coverageStats;
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => {
      // Emit refresh event so context auto-syncs with IndexedDB
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Update dry run statistics for a dataset
 */
export async function updateDatasetDryRunStats(
  datasetId: string,
  dryRunStats: import('@/types/dataset-types').DryRunStats
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.dryRunStats = dryRunStats;
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => {
      // Emit refresh event so context auto-syncs with IndexedDB
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Update dataset statistics
 */
export async function updateDatasetStats(
  datasetId: string,
  stats: import('@/types/dataset-types').DatasetStats
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.stats = stats;
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => {
      // Emit refresh event so context auto-syncs with IndexedDB
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Update dataset training configuration (from sample or user-configured)
 */
export async function updateDatasetTrainingConfig(
  datasetId: string,
  trainingConfig: import('@/types/dataset-types').SampleTrainingConfig
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.trainingConfig = trainingConfig;
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => {
      // Emit refresh event so context auto-syncs with IndexedDB
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Update the README for a dataset
 */
export async function updateDatasetReadme(
  datasetId: string,
  readme: string,
  source?: 'template' | 'agent'
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.readme = readme;
        dataset.readmeUpdatedAt = now;
        dataset.updatedAt = now;
        if (source) dataset.readmeSource = source;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => {
      // Emit refresh event so context auto-syncs with IndexedDB
      emitter.emit(DATASET_REFRESH_EVENT as any, { datasetId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
