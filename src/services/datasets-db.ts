import { Dataset, DatasetEvaluation, DatasetRecord, TopicHierarchyConfig } from '@/types/dataset-types';
import { Span } from '@/types/common-type';
import { extractDataInfoFromSpan } from '@/utils/modelUtils';
import { emitter } from '@/utils/eventEmitter';

// Event type for dataset changes - context listens for this to refresh
const DATASET_REFRESH_EVENT = 'vllora_dataset_refresh';

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

// Create a new dataset
export async function createDataset(name: string): Promise<Dataset> {
  const db = await getDB();
  const now = Date.now();
  const dataset: Dataset = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');
    const request = store.add(dataset);

    request.onsuccess = () => resolve(dataset);
    request.onerror = () => reject(request.error);
  });
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

// Delete a dataset and all its records
export async function deleteDataset(datasetId: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Delete dataset
    datasetsStore.delete(datasetId);

    // Delete all records for this dataset
    const index = recordsStore.index('datasetId');
    const cursorRequest = index.openCursor(datasetId);

    cursorRequest.onsuccess = (event) => {
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

    // Add records
    createdRecords.forEach((record) => {
      recordsStore.add(record);
    });

    tx.oncomplete = () => resolve(createdRecords);
    tx.onerror = () => reject(tx.error);
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

// Update a dataset's evaluation configuration (grader)
export async function updateDatasetEvaluationConfig(
  datasetId: string,
  evaluationConfig: import('@/types/dataset-types').EvaluationConfig
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
        dataset.evaluationConfig = evaluationConfig;
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

