import { DataInfo, Dataset, DatasetEvaluation, DatasetRecord, TopicHierarchyConfig } from '@/types/dataset-types';
import { Span } from '@/types/common-type';
import { tryParseJson } from '@/utils/modelUtils';

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

      // New indexes for hierarchical topics
      if (!recordsStore.indexNames.contains('topic_root')) {
        recordsStore.createIndex('topic_root', 'topic_root', { unique: false });
      }
      if (!recordsStore.indexNames.contains('topic_path_str')) {
        recordsStore.createIndex('topic_path_str', 'topic_path_str', { unique: false });
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
export async function getRecordsByDatasetId(datasetId: string): Promise<DatasetRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.getAll(datasetId);

    request.onsuccess = () => {
      // Sort by createdAt descending
      const records = request.result
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => {
          // Derive display fields from topic_paths without persisting duplicates.
          if (r.topic_paths && Array.isArray(r.topic_paths)) {
            return { ...r, ...deriveTopicFieldsFromTopicPaths(r.topic_paths) } as DatasetRecord;
          }
          return r as DatasetRecord;
        });
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

// Helpers to normalize/derive hierarchical topic data
function normalizeTopicPaths(topicPaths?: string[][]): string[][] {
  if (!topicPaths) return [];
  return topicPaths
    .filter((p) => Array.isArray(p))
    .map((p) => p.map((t) => (t || '').trim()).filter(Boolean))
    .filter((p) => p.length > 0);
}

function deriveTopicFieldsFromTopicPaths(topicPaths?: string[][]) {
  const normalized = normalizeTopicPaths(topicPaths);
  if (normalized.length === 0) return {} as Partial<DatasetRecord>;

  // Root is the first segment of a 1-length path if present, else first segment of any path.
  const rootPath = normalized.find((p) => p.length === 1);
  const root = rootPath?.[0] || normalized[0][0];

  // Choose a deterministic "display" path: deepest path; tie-break by joined string.
  let chosen = normalized[0];
  for (const p of normalized) {
    if (p.length > chosen.length) {
      chosen = p;
    } else if (p.length === chosen.length && p.join('/') < chosen.join('/')) {
      chosen = p;
    }
  }

  return {
    topic: root,
    topic_root: root,
    topic_path: chosen,
    topic_path_str: chosen ? chosen.join('/') : undefined,
  } as Partial<DatasetRecord>;
}

function topicPathsFromSingleTopic(topic?: string): string[][] | undefined {
  const t = (topic || '').trim();
  return t ? [[t]] : undefined;
}

function topicPathsFromPath(path: string[]): string[][] {
  const clean = path.map((t) => (t || '').trim()).filter(Boolean);
  const out: string[][] = [];
  for (let i = 1; i <= clean.length; i++) {
    out.push(clean.slice(0, i));
  }
  return out;
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
      let spanAttributes = span.attribute as Record<string, unknown>;
      let requestStr  = spanAttributes.request as string;
      let outputStr = spanAttributes.output as string;
      let finishReason = spanAttributes.finish_reason as string;
      let requestJson = tryParseJson(requestStr);
      let outputJson = tryParseJson(outputStr);
      let inputMessages = requestJson?.messages as any[] || [];
      let outputMessage = outputJson?.choices?.[0]?.message as any;

      let dataInfo:DataInfo = {input: {messages: inputMessages}, output: {messages: outputMessage}}

      // Note: keep DataInfo limited to request/response shape; avoid embedding metadata in data


      if(finishReason){
        dataInfo.output.finish_reason = finishReason;
      }
      if(requestJson?.tools){
        dataInfo.input.tools = requestJson.tools;
      }
      if(outputJson?.choices?.[0]?.tool_calls){
        dataInfo.output.tool_calls = outputJson.choices[0].tool_calls;
      }

      const topicPaths = topicPathsFromSingleTopic(topic);

      const record: DatasetRecord = {
        id: crypto.randomUUID(),
        datasetId,
        data: dataInfo,
        spanId: span.span_id,
        topic_paths: topicPaths,
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

// Update a record's topic (legacy flat)
export async function updateRecordTopic(
  datasetId: string,
  recordId: string,
  topic: string
): Promise<void> {
  const topicPaths = topicPathsFromSingleTopic(topic) || [];
  return updateRecordTopicHierarchy(datasetId, recordId, topicPaths);
}

// Update a record's hierarchical topic tree (topic_paths is the single persisted source of truth)
export async function updateRecordTopicHierarchy(
  datasetId: string,
  recordId: string,
  topicPaths: string[][]
): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const normalized = normalizeTopicPaths(topicPaths);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update record
    const getRecordRequest = recordsStore.get(recordId);
    getRecordRequest.onsuccess = () => {
      const record = getRecordRequest.result;
      if (record) {
        record.topic_paths = normalized;
        // Do not persist derived duplicates (topic/topic_path/etc); they are derived on read.
        record.topic = undefined;
        record.topic_path = undefined;
        record.topic_root = undefined;
        record.topic_path_str = undefined;
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

// Convenience: set a single chosen path and expand it to all prefixes.
export async function updateRecordTopicPath(
  datasetId: string,
  recordId: string,
  topicPath: string[]
): Promise<void> {
  return updateRecordTopicHierarchy(datasetId, recordId, topicPathsFromPath(topicPath));
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
    topic_paths?: string[][];
    is_generated?: boolean;
    evaluation?: DatasetEvaluation;
  }>,
  defaultTopic?: string
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
    records.forEach((recordData) => {
      const topicPaths = recordData.topic_paths || topicPathsFromSingleTopic(recordData.topic?.trim() || defaultTopic?.trim());

      const record: DatasetRecord = {
        id: crypto.randomUUID(),
        datasetId,
        data: recordData.data,
        metadata: recordData.metadata,
        topic_paths: topicPaths,
        is_generated: recordData.is_generated ?? false,
        evaluation: recordData.evaluation,
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

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

