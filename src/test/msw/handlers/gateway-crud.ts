/**
 * MSW Handler: Gateway CRUD endpoints
 *
 * In-memory stores for /finetune/workflows, records, and eval-jobs.
 * Used by integration tests (eval-analysis, training-analysis) whose
 * seed-helpers call the service adapters which hit these gateway endpoints.
 *
 * Stores are reset via `resetGatewayStores()` (called in afterEach).
 */

import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:8080';

// =============================================================================
// In-memory stores
// =============================================================================

interface WorkflowRow {
  id: string;
  name: string;
  objective: string;
  eval_script: string | null;
  state: string | null;
  iteration_state: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface RecordRow {
  id: string;
  workflow_id: string;
  data: string;
  topic: string | null;
  span_id: string | null;
  is_generated: number;
  source_record_id: string | null;
  dry_run_score: number | null;
  finetune_score: number | null;
  metadata: string | null;
  created_at: string;
}

interface EvalJobRow {
  id: string;
  workflow_id: string;
  cloud_run_id: string | null;
  status: string;
  sample_size: number | null;
  rollout_model: string | null;
  error: string | null;
  completed_at: string | null;
  started_at: string | null;
  polling_snapshot: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

const workflows = new Map<string, WorkflowRow>();
const records = new Map<string, RecordRow[]>(); // keyed by workflow_id
const evalJobs = new Map<string, EvalJobRow>(); // keyed by job id

/** Reset all in-memory stores between tests. */
export function resetGatewayStores(): void {
  workflows.clear();
  records.clear();
  evalJobs.clear();
}

// =============================================================================
// Helpers
// =============================================================================

function nowIso(): string {
  return new Date().toISOString();
}

function toWorkflowResponse(row: WorkflowRow): WorkflowRow {
  return { ...row };
}

// =============================================================================
// Handlers
// =============================================================================

export const gatewayCrudHandlers = [
  // ─── Workflows ──────────────────────────────────────────────────────────────

  // POST /finetune/workflows — Create workflow
  http.post(`${BASE}/finetune/workflows`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const id = crypto.randomUUID();
    const now = nowIso();

    const row: WorkflowRow = {
      id,
      name: (body.name as string) ?? '',
      objective: (body.objective as string) ?? '',
      eval_script: null,
      state: null,
      iteration_state: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    workflows.set(id, row);
    return HttpResponse.json(toWorkflowResponse(row));
  }),

  // GET /finetune/workflows — List all workflows
  http.get(`${BASE}/finetune/workflows`, () => {
    const all = [...workflows.values()].filter((w) => w.deleted_at == null);
    return HttpResponse.json(all.map(toWorkflowResponse));
  }),

  // GET /finetune/workflows/:id — Get single workflow
  http.get(`${BASE}/finetune/workflows/:id`, ({ params }) => {
    const id = params.id as string;
    const row = workflows.get(id);
    if (!row || row.deleted_at != null) {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json(toWorkflowResponse(row));
  }),

  // PUT /finetune/workflows/:id — Update workflow fields
  http.put(`${BASE}/finetune/workflows/:id`, async ({ params, request }) => {
    const id = params.id as string;
    const row = workflows.get(id);
    if (!row || row.deleted_at != null) {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updated: WorkflowRow = { ...row, updated_at: nowIso() };

    if ('name' in body) updated.name = body.name as string;
    if ('objective' in body) updated.objective = body.objective as string;
    if ('eval_script' in body) updated.eval_script = body.eval_script as string | null;
    if ('state' in body) updated.state = body.state as string | null;
    if ('iteration_state' in body) updated.iteration_state = body.iteration_state as string | null;

    workflows.set(id, updated);
    return HttpResponse.json(toWorkflowResponse(updated));
  }),

  // DELETE /finetune/workflows/:id — Soft-delete workflow
  http.delete(`${BASE}/finetune/workflows/:id`, ({ params }) => {
    const id = params.id as string;
    const row = workflows.get(id);
    if (!row) {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    }
    workflows.set(id, { ...row, deleted_at: nowIso() });
    return HttpResponse.json({ id, deleted: true });
  }),

  // ─── Records ────────────────────────────────────────────────────────────────

  // POST /finetune/workflows/:workflowId/records — Add records
  http.post(
    `${BASE}/finetune/workflows/:workflowId/records`,
    async ({ params, request }) => {
      const workflowId = params.workflowId as string;
      const body = (await request.json()) as { records: Array<Record<string, unknown>> };
      const existing = records.get(workflowId) ?? [];
      const now = nowIso();

      const newRows: RecordRow[] = body.records.map((r) => ({
        id: (r.id as string) ?? crypto.randomUUID(),
        workflow_id: workflowId,
        data: typeof r.data === 'string' ? r.data : JSON.stringify(r.data),
        topic: (r.topic as string) ?? null,
        span_id: (r.span_id as string) ?? null,
        is_generated: r.is_generated ? 1 : 0,
        source_record_id: (r.source_record_id as string) ?? null,
        dry_run_score: null,
        finetune_score: null,
        metadata: (r.metadata as string) ?? null,
        created_at: now,
      }));

      records.set(workflowId, [...existing, ...newRows]);
      return HttpResponse.json({ added: newRows.length });
    },
  ),

  // GET /finetune/workflows/:workflowId/records — List records
  http.get(
    `${BASE}/finetune/workflows/:workflowId/records`,
    ({ params }) => {
      const workflowId = params.workflowId as string;
      const rows = records.get(workflowId) ?? [];
      return HttpResponse.json({ records: rows });
    },
  ),

  // PATCH /finetune/workflows/:workflowId/records/:recordId/scores — Update scores
  http.patch(
    `${BASE}/finetune/workflows/:workflowId/records/:recordId/scores`,
    async ({ params, request }) => {
      const workflowId = params.workflowId as string;
      const recordId = params.recordId as string;
      const body = (await request.json()) as Record<string, unknown>;
      const rows = records.get(workflowId) ?? [];

      const idx = rows.findIndex((r) => r.id === recordId);
      if (idx === -1) {
        return HttpResponse.json({ error: 'Record not found' }, { status: 404 });
      }

      const row = rows[idx];
      const updated: RecordRow = { ...row };

      if ('dry_run_score' in body) {
        updated.dry_run_score = body.dry_run_score as number | null;
      }
      if ('finetune_score' in body) {
        updated.finetune_score = body.finetune_score as number | null;
      }

      const updatedRows = [...rows];
      updatedRows[idx] = updated;
      records.set(workflowId, updatedRows);

      return HttpResponse.json({ updated: true });
    },
  ),

  // ─── Eval Jobs ──────────────────────────────────────────────────────────────

  // POST /finetune/workflows/:workflowId/eval-jobs — Create eval job
  http.post(
    `${BASE}/finetune/workflows/:workflowId/eval-jobs`,
    async ({ params, request }) => {
      const workflowId = params.workflowId as string;
      const body = (await request.json()) as Record<string, unknown>;
      const id = crypto.randomUUID();
      const now = nowIso();

      const row: EvalJobRow = {
        id,
        workflow_id: workflowId,
        cloud_run_id: (body.cloud_run_id as string) ?? null,
        status: 'pending',
        sample_size: (body.sample_size as number) ?? null,
        rollout_model: (body.rollout_model as string) ?? null,
        error: null,
        completed_at: null,
        started_at: null,
        polling_snapshot: null,
        result: null,
        created_at: now,
        updated_at: now,
      };

      evalJobs.set(id, row);
      return HttpResponse.json(row);
    },
  ),

  // GET /finetune/workflows/:workflowId/eval-jobs — List eval jobs for workflow
  http.get(
    `${BASE}/finetune/workflows/:workflowId/eval-jobs`,
    ({ params }) => {
      const workflowId = params.workflowId as string;
      const jobs = [...evalJobs.values()].filter((j) => j.workflow_id === workflowId);
      return HttpResponse.json({ jobs });
    },
  ),

  // GET /finetune/workflows/_/eval-jobs/:id — Get single eval job (wildcard workflow)
  http.get(
    `${BASE}/finetune/workflows/_/eval-jobs/:id`,
    ({ params }) => {
      const id = params.id as string;
      const row = evalJobs.get(id);
      if (!row) {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return HttpResponse.json(row);
    },
  ),

  // PATCH /finetune/workflows/_/eval-jobs/:id — Update eval job
  http.patch(
    `${BASE}/finetune/workflows/_/eval-jobs/:id`,
    async ({ params, request }) => {
      const id = params.id as string;
      const row = evalJobs.get(id);
      if (!row) {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const body = (await request.json()) as Record<string, unknown>;
      const updated: EvalJobRow = { ...row, updated_at: nowIso() };

      if ('status' in body) updated.status = body.status as string;
      if ('error' in body) updated.error = body.error as string | null;
      if ('completed_at' in body) updated.completed_at = body.completed_at as string | null;
      if ('started_at' in body) updated.started_at = body.started_at as string | null;
      if ('polling_snapshot' in body) updated.polling_snapshot = body.polling_snapshot as string | null;
      if ('result' in body) updated.result = body.result as string | null;

      evalJobs.set(id, updated);
      return HttpResponse.json(updated);
    },
  ),

  // GET /finetune/eval-jobs?status=... — List eval jobs by status (global)
  http.get(`${BASE}/finetune/eval-jobs`, ({ request }) => {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    let jobs = [...evalJobs.values()];
    if (statusFilter) {
      jobs = jobs.filter((j) => j.status === statusFilter);
    }
    return HttpResponse.json({ jobs });
  }),

  // DELETE /finetune/workflows/_/eval-jobs/:id — Delete eval job
  http.delete(
    `${BASE}/finetune/workflows/_/eval-jobs/:id`,
    ({ params }) => {
      const id = params.id as string;
      if (!evalJobs.has(id)) {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }
      evalJobs.delete(id);
      return HttpResponse.json({ deleted: true });
    },
  ),
];
