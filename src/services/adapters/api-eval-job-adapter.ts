/**
 * API adapter for EvalJobService (Evaluation Jobs).
 *
 * Calls gateway /finetune/workflows/{workflowId}/eval-jobs endpoints.
 * Replaces IndexedDB adapter.
 *
 * Naming: FE uses "EvalJob" internally, BE uses "eval_jobs".
 * Mapping: FE datasetId -> BE workflowId (same ID after migration)
 *          FE evaluationRunId -> BE cloud_run_id
 */

import { api, handleApiResponse } from '@/lib/api-client';
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
  readonly polling_snapshot: string | null;
  readonly result: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function mapToFe(db: DbEvalJobResponse): EvalJob {
  return {
    id: db.id,
    datasetId: db.workflow_id,
    evaluationRunId: db.cloud_run_id ?? '',
    status: db.status as EvalJobStatus,
    sampleSize: db.sample_size ?? 0,
    rolloutModel: db.rollout_model ?? undefined,
    error: db.error ?? undefined,
    completedAt: db.completed_at ? new Date(db.completed_at).getTime() : undefined,
    startedAt: db.started_at ? new Date(db.started_at).getTime() : undefined,
    pollingSnapshot: db.polling_snapshot ? JSON.parse(db.polling_snapshot) : undefined,
    result: db.result ? JSON.parse(db.result) : undefined,
    createdAt: new Date(db.created_at).getTime(),
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

function basePath(workflowId: string): string {
  return `/finetune/workflows/${workflowId}/eval-jobs`;
}

export const apiEvalJobAdapter: EvalJobService = {
  async create(job: Omit<EvalJob, 'id'>): Promise<EvalJob> {
    const response = await api.post(basePath(job.datasetId), {
      cloud_run_id: job.evaluationRunId || null,
      sample_size: job.sampleSize,
      rollout_model: job.rolloutModel,
    });
    const db = await handleApiResponse<DbEvalJobResponse>(response);
    return mapToFe(db);
  },

  async get(id: string): Promise<EvalJob | null> {
    // The route requires workflow_id, but handler ignores it. Use placeholder.
    const response = await api.get(`/finetune/workflows/_/eval-jobs/${id}`);
    if (!response.ok && response.status === 404) return null;
    const db = await handleApiResponse<DbEvalJobResponse>(response);
    return mapToFe(db);
  },

  async getByDataset(datasetId: string): Promise<EvalJob[]> {
    const response = await api.get(basePath(datasetId));
    const data = await handleApiResponse<{ jobs: DbEvalJobResponse[] }>(response);
    return data.jobs.map(mapToFe);
  },

  async getRunning(): Promise<EvalJob[]> {
    const response = await api.get('/finetune/eval-jobs?status=running');
    const data = await handleApiResponse<{ jobs: DbEvalJobResponse[] }>(response);
    return data.jobs.map(mapToFe);
  },

  async getPending(): Promise<EvalJob[]> {
    const response = await api.get('/finetune/eval-jobs?status=pending');
    const data = await handleApiResponse<{ jobs: DbEvalJobResponse[] }>(response);
    return data.jobs.map(mapToFe);
  },

  async update(id: string, updates: Partial<EvalJob>): Promise<EvalJob | null> {
    // Map FE fields to BE update payload
    const payload: Record<string, unknown> = {};
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.error !== undefined) payload.error = updates.error ?? null;
    if (updates.completedAt !== undefined) {
      payload.completed_at = updates.completedAt
        ? new Date(updates.completedAt).toISOString()
        : null;
    }
    if (updates.startedAt !== undefined) {
      payload.started_at = updates.startedAt
        ? new Date(updates.startedAt).toISOString()
        : null;
    }
    if (updates.pollingSnapshot !== undefined) {
      payload.polling_snapshot = updates.pollingSnapshot
        ? JSON.stringify(updates.pollingSnapshot)
        : null;
    }
    if (updates.result !== undefined) {
      payload.result = updates.result
        ? JSON.stringify(updates.result)
        : null;
    }

    if (Object.keys(payload).length === 0) return this.get(id);

    // Route requires workflow_id but handler ignores it
    const response = await api.patch(`/finetune/workflows/_/eval-jobs/${id}`, payload);
    const db = await handleApiResponse<DbEvalJobResponse>(response);
    return mapToFe(db);
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete(`/finetune/workflows/_/eval-jobs/${id}`);
    await handleApiResponse<{ deleted: boolean }>(response);
  },

  async deleteByDataset(datasetId: string): Promise<void> {
    const response = await api.delete(basePath(datasetId));
    await handleApiResponse<{ deleted: number }>(response);
  },
};
