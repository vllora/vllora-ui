/**
 * Knowledge Sources Database Service
 *
 * IndexedDB storage for knowledge sources used in data generation.
 * Knowledge sources can be PDFs, images, URLs, or text that provide
 * context for generating high-quality training data.
 */

import type {
  KnowledgeSource,
  KnowledgeSourceType,
  KnowledgeSourceStatus,
  KnowledgeSourceProgress,
  ExtractedContent,
} from '@/types/dataset-types';

// =============================================================================
// Database Setup
// =============================================================================

const DB_NAME = 'vllora-knowledge-sources';
const DB_VERSION = 1;
const STORE_NAME = 'knowledge_sources';

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('datasetId', 'datasetId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
  });
}

// =============================================================================
// ID Generation
// =============================================================================

function generateId(): string {
  return `ks-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new knowledge source
 */
export async function createKnowledgeSource(
  datasetId: string,
  name: string,
  type: KnowledgeSourceType,
  options?: {
    content?: string;
    size?: number;
    mimeType?: string;
  }
): Promise<KnowledgeSource> {
  const db = await getDB();
  const now = Date.now();

  const source: KnowledgeSource = {
    id: generateId(),
    datasetId,
    name,
    type,
    status: 'pending',
    size: options?.size,
    mimeType: options?.mimeType,
    content: options?.content,
    createdAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add(source);

    tx.oncomplete = () => resolve(source);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a knowledge source by ID
 */
export async function getKnowledgeSource(id: string): Promise<KnowledgeSource | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all knowledge sources for a dataset
 */
export async function getKnowledgeSourcesByDataset(
  datasetId: string
): Promise<KnowledgeSource[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('datasetId');
    const request = index.getAll(datasetId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update a knowledge source's status
 */
export async function updateKnowledgeSourceStatus(
  id: string,
  status: KnowledgeSourceStatus,
  options?: {
    extractedContent?: ExtractedContent;
    error?: string;
  }
): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const source = getRequest.result;
      if (source) {
        source.status = status;
        if (options?.extractedContent) {
          source.extractedContent = options.extractedContent;
        }
        if (options?.error) {
          source.error = options.error;
        }
        if (status === 'ready' || status === 'failed') {
          source.processedAt = Date.now();
        }
        store.put(source);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Update a knowledge source's progress (without changing status)
 */
export async function updateKnowledgeSourceProgress(
  id: string,
  progress: KnowledgeSourceProgress
): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const source = getRequest.result;
      if (source) {
        source.progress = progress;
        store.put(source);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete a knowledge source
 */
export async function deleteKnowledgeSource(id: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete all knowledge sources for a dataset
 */
export async function deleteKnowledgeSourcesByDataset(datasetId: string): Promise<void> {
  const sources = await getKnowledgeSourcesByDataset(datasetId);
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const source of sources) {
      store.delete(source.id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get the count of knowledge sources for a dataset
 */
export async function getKnowledgeSourceCount(datasetId: string): Promise<number> {
  const sources = await getKnowledgeSourcesByDataset(datasetId);
  return sources.length;
}

/**
 * Search knowledge sources by content
 * Simple text search across extracted content
 */
export async function searchKnowledgeSources(
  datasetId: string,
  query: string
): Promise<Array<{ source: KnowledgeSource; matches: string[] }>> {
  const sources = await getKnowledgeSourcesByDataset(datasetId);
  const queryLower = query.toLowerCase();
  const results: Array<{ source: KnowledgeSource; matches: string[] }> = [];

  for (const source of sources) {
    if (source.status !== 'ready' || !source.extractedContent) continue;

    const matches: string[] = [];

    // Find matching sentences/paragraphs
    const sentences = source.extractedContent.text.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(queryLower)) {
        matches.push(sentence.trim());
      }
    }

    // Also check sections
    if (source.extractedContent.sections) {
      for (const section of source.extractedContent.sections) {
        if (
          section.title.toLowerCase().includes(queryLower) ||
          section.content.toLowerCase().includes(queryLower)
        ) {
          matches.push(`[${section.title}] ${section.content.substring(0, 200)}...`);
        }
      }
    }

    if (matches.length > 0) {
      results.push({ source, matches: matches.slice(0, 5) }); // Limit matches
    }
  }

  return results;
}
