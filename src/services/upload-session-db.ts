/**
 * Upload Session Database Service
 *
 * Persists uploaded records in IndexedDB so they survive page refreshes.
 * Uses a separate database to avoid conflicts with dataset versioning.
 */

import type { ParsedJsonlRecord } from "@/utils/jsonl-parser";

const DB_NAME = "vllora-upload-session";
const DB_VERSION = 1;
const STORE_NAME = "uploadSession";

// Session key for the current upload
const SESSION_KEY = "current";

export interface UploadSession {
  key: string;
  fileName: string;
  records: ParsedJsonlRecord[];
  selectedIds: string[];
  uploadedAt: number;
}

let dbInstance: IDBDatabase | null = null;

// Initialize and get database connection
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

      // Create upload session store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

/**
 * Save upload session to IndexedDB
 */
export async function saveUploadSession(
  fileName: string,
  records: ParsedJsonlRecord[],
  selectedIds: string[]
): Promise<void> {
  const db = await getDB();

  const session: UploadSession = {
    key: SESSION_KEY,
    fileName,
    records,
    selectedIds,
    uploadedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(session);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load upload session from IndexedDB
 */
export async function loadUploadSession(): Promise<UploadSession | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(SESSION_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear upload session from IndexedDB
 */
export async function clearUploadSession(): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(SESSION_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update selected IDs in the session
 */
export async function updateSessionSelectedIds(selectedIds: string[]): Promise<void> {
  const session = await loadUploadSession();
  if (!session) return;

  session.selectedIds = selectedIds;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(session);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
