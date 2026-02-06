/**
 * Dry Run Jobs Persistence Service
 *
 * IndexedDB storage for background dry run jobs.
 * Stored in the vllora-finetune database alongside workflow data.
 */

import type { DryRunJob } from '@/types/dry-run-job';
import { emitter } from '@/utils/eventEmitter';
import { getDB } from './finetune-workflow-db';

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new dry run job
 */
export async function createDryRunJob(
  job: Omit<DryRunJob, 'id'>
): Promise<DryRunJob> {
  const db = await getDB();

  const newJob: DryRunJob = {
    ...job,
    id: crypto.randomUUID(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dryRunJobs', 'readwrite');
    const store = tx.objectStore('dryRunJobs');
    const request = store.add(newJob);

    request.onsuccess = () => {
      emitDryRunJobUpdate(newJob);
      resolve(newJob);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a dry run job by ID
 */
export async function getDryRunJob(id: string): Promise<DryRunJob | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dryRunJobs', 'readonly');
    const store = tx.objectStore('dryRunJobs');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all dry run jobs for a dataset
 */
export async function getDryRunJobsByDataset(
  datasetId: string
): Promise<DryRunJob[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dryRunJobs', 'readonly');
    const store = tx.objectStore('dryRunJobs');
    const index = store.index('datasetId');
    const request = index.getAll(datasetId);

    request.onsuccess = () => {
      // Sort by creation date, newest first
      const jobs = request.result.sort((a, b) => b.createdAt - a.createdAt);
      resolve(jobs);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all running dry run jobs (for recovery on page load)
 */
export async function getRunningDryRunJobs(): Promise<DryRunJob[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dryRunJobs', 'readonly');
    const store = tx.objectStore('dryRunJobs');
    const index = store.index('status');
    const request = index.getAll('running');

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get pending dry run jobs (for recovery)
 */
export async function getPendingDryRunJobs(): Promise<DryRunJob[]> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dryRunJobs', 'readonly');
    const store = tx.objectStore('dryRunJobs');
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update a dry run job
 */
export async function updateDryRunJob(
  id: string,
  updates: Partial<DryRunJob>
): Promise<DryRunJob | null> {
  const db = await getDB();
  const existingJob = await getDryRunJob(id);

  if (!existingJob) return null;

  const updatedJob: DryRunJob = {
    ...existingJob,
    ...updates,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dryRunJobs', 'readwrite');
    const store = tx.objectStore('dryRunJobs');
    const request = store.put(updatedJob);

    request.onsuccess = () => {
      emitDryRunJobUpdate(updatedJob);
      resolve(updatedJob);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a dry run job
 */
export async function deleteDryRunJob(id: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dryRunJobs', 'readwrite');
    const store = tx.objectStore('dryRunJobs');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete all dry run jobs for a dataset
 */
export async function deleteDryRunJobsByDataset(datasetId: string): Promise<void> {
  const jobs = await getDryRunJobsByDataset(datasetId);

  for (const job of jobs) {
    await deleteDryRunJob(job.id);
  }
}

// =============================================================================
// Event Emission
// =============================================================================

/**
 * Emit event when a dry run job is updated
 */
function emitDryRunJobUpdate(job: DryRunJob): void {
  emitter.emit('vllora_dry_run_job_update', { jobId: job.id, job });
}

// =============================================================================
// Export Service Object
// =============================================================================

export const dryRunJobsService = {
  createDryRunJob,
  getDryRunJob,
  getDryRunJobsByDataset,
  getRunningDryRunJobs,
  getPendingDryRunJobs,
  updateDryRunJob,
  deleteDryRunJob,
  deleteDryRunJobsByDataset,
};
