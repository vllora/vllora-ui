/**
 * Eval Job Service Interface
 *
 * Abstraction over evaluation job persistence.
 * Currently backed by IndexedDB.
 * Will be swapped to gateway API adapter when eval job endpoints are ready.
 */

import type { EvalJob } from '@/types/eval-job';

export interface EvalJobService {
  create(job: Omit<EvalJob, 'id'>): Promise<EvalJob>;
  get(id: string): Promise<EvalJob | null>;
  getByDataset(datasetId: string): Promise<EvalJob[]>;
  getRunning(): Promise<EvalJob[]>;
  getPending(): Promise<EvalJob[]>;
  update(id: string, updates: Partial<EvalJob>): Promise<EvalJob | null>;
  delete(id: string): Promise<void>;
  deleteByDataset(datasetId: string): Promise<void>;
}
