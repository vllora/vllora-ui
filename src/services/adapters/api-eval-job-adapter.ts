/**
 * API adapter for EvalJobService (Evaluation Jobs).
 *
 * Calls gateway /finetune/workflows/{workflowId}/eval-jobs endpoints.
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
  return `/finetune/workflows/${workflowId}/eval-jobs`;
}

export const apiEvalJobAdapter: EvalJobService = {
  async create(_job: Omit<EvalJob, 'id'>): Promise<EvalJob> {
    // Eval jobs are created gateway-side as a side effect of
    // POST /finetune/evaluations (see gateway create_evaluation handler).
    // Callers should use createEvaluation() + evalJobService.getByDataset()
    // to retrieve the row the gateway just inserted.
    throw new Error(
      'evalJobService.create is no longer supported — use createEvaluation() from finetune-api instead',
    );
  },

  async get(id: string): Promise<EvalJob | null> {
    const response = await api.get(`/finetune/eval-jobs/${id}`);
    if (!response.ok && response.status === 404) return null;
    const db = await handleApiResponse<DbEvalJobResponse>(response);
    return mapToFe(db);
  },

  async getByDataset(workflowId: string): Promise<EvalJob[]> {
    const response = await api.get(basePath(workflowId));
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
    // Eval job persistence is owned by the gateway's EvalJobStateTracker
    // (gateway/src/eval_state_tracker.rs), which polls the cloud every 30s
    // and writes status + per-record scores directly to SQLite. The gateway
    // no longer exposes PATCH /finetune/eval-jobs/{id} (removed in BE commit
    // 27cb5b4). This method is retained as a client-side merge so callers
    // get an updated EvalJob back for in-memory UI state + event emission,
    // without a round-trip. The authoritative state will arrive on the next
    // gateway read once the state tracker has picked it up.
    const current = await this.get(id);
    if (!current) return null;
    return { ...current, ...updates };
  },

  async delete(_id: string): Promise<void> {
    // Per-id delete is not exposed by the gateway (only workflow-bulk delete).
    // Callers should use deleteByDataset() instead.
  },

  async deleteByDataset(workflowId: string): Promise<void> {
    const response = await api.delete(basePath(workflowId));
    await handleApiResponse<{ deleted: number }>(response);
  },
};
