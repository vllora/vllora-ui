/**
 * API adapter for EvalJobService (Evaluation Jobs).
 *
 * Calls gateway /finetune/workflows/{workflowId}/evaluations endpoints.
 * Replaces IndexedDB adapter.
 *
 * Naming: FE uses "EvalJob" internally, BE uses "eval_jobs".
 * Mapping: FE workflowId -> BE workflowId (same ID after migration)
 *          FE evaluationRunId -> BE cloud_run_id
 */

import { api, handleApiResponse, parseUtcTimestamp } from '@/lib/api-client';
import type { EvalJobService } from '@/services/interfaces/eval-job-service';
import type { EvalJob, EvalJobStatus } from '@/types/eval-job';

// ─── BE → FE type mapping ────────────────────────────────────────────────────

interface DbEvalJobResponse {
  readonly id: string;
  readonly workflow_id: string;
  readonly cloud_run_id: string | null;
  readonly status: string;
  readonly sample_size: number | null;
  readonly rollout_model: string | null;
  readonly error: string | null;
  readonly completed_at: string | null;
  readonly started_at: string | null;
  readonly result: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function mapToFe(db: DbEvalJobResponse): EvalJob {
  return {
    id: db.id,
    workflowId: db.workflow_id,
    evaluationRunId: db.cloud_run_id ?? '',
    status: db.status as EvalJobStatus,
    sampleSize: db.sample_size ?? 0,
    rolloutModel: db.rollout_model ?? undefined,
    error: db.error ?? undefined,
    completedAt: db.completed_at ? parseUtcTimestamp(db.completed_at) : undefined,
    startedAt: db.started_at ? parseUtcTimestamp(db.started_at) : undefined,
    result: db.result ? JSON.parse(db.result) : undefined,
    createdAt: parseUtcTimestamp(db.created_at),
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

function basePath(workflowId: string): string {
  return `/finetune/workflows/${workflowId}/evaluations`;
}

export const apiEvalJobAdapter: EvalJobService = {
  async create(job: Omit<EvalJob, 'id'>): Promise<EvalJob> {
    void job;
    throw new Error(
      'Creating evaluation metadata rows is no longer supported via gateway API. Create an evaluation with POST /finetune/evaluations instead.',
    );
  },

  async get(id: string): Promise<EvalJob | null> {
    console.warn(
      '[apiEvalJobAdapter] get(id) requires workflow scope; returning null.',
      id,
    );
    return null;
  },

  async getByDataset(workflowId: string): Promise<EvalJob[]> {
    const response = await api.get(basePath(workflowId));
    const data = await handleApiResponse<{ jobs: DbEvalJobResponse[] }>(response);
    return data.jobs.map(mapToFe);
  },

  async getRunning(): Promise<EvalJob[]> {
    console.warn(
      '[apiEvalJobAdapter] getRunning() is cross-workflow and not supported; returning empty list.',
    );
    return [];
  },

  async getPending(): Promise<EvalJob[]> {
    console.warn(
      '[apiEvalJobAdapter] getPending() is cross-workflow and not supported; returning empty list.',
    );
    return [];
  },

  async update(id: string, updates: Partial<EvalJob>): Promise<EvalJob | null> {
    console.warn(
      '[apiEvalJobAdapter] update(id, updates) is not supported by gateway metadata routes; returning null.',
      id,
      updates,
    );
    return null;
  },

  async delete(id: string): Promise<void> {
    console.warn(
      '[apiEvalJobAdapter] delete(id) is not supported by gateway metadata routes; ignoring.',
      id,
    );
  },

  async deleteByDataset(workflowId: string): Promise<void> {
    const response = await api.delete(basePath(workflowId));
    await handleApiResponse<{ deleted: number }>(response);
  },
};
