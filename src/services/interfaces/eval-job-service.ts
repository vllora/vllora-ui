/**
 * Eval Job Service Interface
 *
 * Abstraction over evaluation job persistence.
 * Backed by Gateway API (api-eval-job-adapter.ts).
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
