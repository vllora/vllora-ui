/**
 * API adapter for WorkflowService.
 *
 * Stores the entire FinetuneWorkflowState as JSON in the `state` column
 * on the BE workflows table. Snapshots, generation history, and eval cache
 * are embedded within a compound blob alongside the workflow state.
 *
 * All mutation methods use read-modify-write on the JSON blob with
 * optimistic concurrency control via the `version` field. If a concurrent
 * write bumped the version, the mutate helper re-reads and retries.
 */

import { api, handleApiResponse } from '@/lib/api-client';
import { emitWorkflowUpdate } from '@/lib/distri-finetune-tools/workflow';
import type { WorkflowService, GenerationData } from '@/services/interfaces/workflow-service';
import type {
  FinetuneStep,
  StepStatus,
  FinetuneWorkflowState,
  WorkflowSnapshotStore,
  GenerationHistoryStore,
  CachedJobEvaluation,
} from '@/types/workflow-types';
import type { FinetuneEvalResultsResponse } from '@/services/finetune-api';

// ─── BE response type ────────────────────────────────────────────────────────

interface DbWorkflowResponse {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly eval_script: string | null;
  readonly state: string | null;
  readonly iteration_state: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

// ─── Compound blob stored in `state` column ──────────────────────────────────

interface WorkflowStateBlob {
  readonly workflow: FinetuneWorkflowState;
  readonly snapshots: WorkflowSnapshotStore[];
  readonly generationHistory: GenerationHistoryStore[];
  readonly evalCache: CachedJobEvaluation[];
  /** Monotonically increasing version for optimistic concurrency control */
  readonly version: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = '/finetune/workflows';
const MAX_RETRIES = 3;

function createInitialStepStatus(): Record<FinetuneStep, StepStatus> {
  return {
    not_started: 'completed',
    topics_config: 'pending',
    categorize: 'pending',
    coverage_generation: 'pending',
    grader_config: 'pending',
    dry_run: 'pending',
    skill_packaging: 'pending',
    training: 'pending',
    deployment: 'pending',
    completed: 'pending',
  };
}

function parseBlob(stateJson: string | null): WorkflowStateBlob | null {
  if (!stateJson) return null;
  try {
    const parsed = JSON.parse(stateJson) as WorkflowStateBlob;
    // Backfill version for blobs created before versioning was added
    if (parsed.version == null) {
      return { ...parsed, version: 0 };
    }
    return parsed;
  } catch {
    return null;
  }
}

function extractWorkflow(db: DbWorkflowResponse): FinetuneWorkflowState | null {
  const blob = parseBlob(db.state);
  return blob?.workflow ?? null;
}

async function fetchWorkflowRow(id: string): Promise<DbWorkflowResponse | null> {
  const response = await api.get(`${BASE}/${id}`);
  if (!response.ok && response.status === 404) return null;
  return handleApiResponse<DbWorkflowResponse>(response);
}

async function saveBlob(id: string, blob: WorkflowStateBlob): Promise<void> {
  const response = await api.put(`${BASE}/${id}`, {
    state: JSON.stringify(blob),
  });
  await handleApiResponse<DbWorkflowResponse>(response);
}

async function readBlob(id: string): Promise<WorkflowStateBlob | null> {
  const row = await fetchWorkflowRow(id);
  if (!row) return null;
  return parseBlob(row.state);
}

function newEmptyBlob(id: string): WorkflowStateBlob {
  return {
    workflow: createDefaultWorkflow(id),
    snapshots: [],
    generationHistory: [],
    evalCache: [],
    version: 1,
  };
}

async function readOrCreateBlob(id: string): Promise<WorkflowStateBlob> {
  return (await readBlob(id)) ?? newEmptyBlob(id);
}

/**
 * Atomically mutate a workflow blob with optimistic concurrency control.
 *
 * Reads the current blob, applies `mutate` to produce the next blob,
 * then writes it back with an incremented version. If a concurrent write
 * changed the version between read and write, retries up to MAX_RETRIES.
 */
async function mutateBlob(
  id: string,
  mutate: (blob: WorkflowStateBlob) => WorkflowStateBlob,
): Promise<WorkflowStateBlob> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const blob = await readOrCreateBlob(id);
    const next = { ...mutate(blob), version: blob.version + 1 };
    await saveBlob(id, next);

    // Re-read to verify our write landed (version matches)
    const verification = await readBlob(id);
    if (verification && verification.version === next.version) {
      return next;
    }

    // Version mismatch — another writer intervened. Retry.
    if (attempt < MAX_RETRIES - 1) {
      // Small jitter to reduce collision likelihood
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }

  // Last-resort: do the write without verification
  const blob = await readOrCreateBlob(id);
  const next = { ...mutate(blob), version: blob.version + 1 };
  await saveBlob(id, next);
  return next;
}

/** Generate a unique snapshot/record ID using crypto.randomUUID(). */
function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createDefaultWorkflow(workflowId: string): FinetuneWorkflowState {
  const now = Date.now();
  return {
    id: workflowId,
    workflowId,
    trainingGoals: '',
    currentStep: 'not_started',
    stepStatus: createInitialStepStatus(),
    inputValidation: null,
    topicsConfig: null,
    categorization: null,
    coverageGeneration: null,
    graderConfig: null,
    dryRun: null,
    skillPackaging: null,
    training: null,
    deployment: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const apiWorkflowAdapter: WorkflowService = {
  async create(workflowId: string, trainingGoals: string): Promise<FinetuneWorkflowState> {
    const now = Date.now();
    const workflow: FinetuneWorkflowState = {
      id: workflowId,
      workflowId,
      trainingGoals,
      currentStep: 'not_started',
      stepStatus: createInitialStepStatus(),
      inputValidation: null,
      topicsConfig: null,
      categorization: null,
      coverageGeneration: null,
      graderConfig: null,
      dryRun: null,
      skillPackaging: null,
      training: null,
      deployment: null,
      createdAt: now,
      updatedAt: now,
    };

    const blob: WorkflowStateBlob = {
      workflow,
      snapshots: [],
      generationHistory: [],
      evalCache: [],
      version: 1,
    };

    await saveBlob(workflowId, blob);
    return workflow;
  },

  async get(id: string): Promise<FinetuneWorkflowState | null> {
    const row = await fetchWorkflowRow(id);
    if (!row) return null;
    const workflow = extractWorkflow(row);
    if (workflow) return workflow;
    // Row exists but has no state blob yet (e.g. just created via
    // createDataset). Return a default workflow with the objective from
    // the DB row so tools don't fail with "Workflow not found".
    const defaultWf = createDefaultWorkflow(id);
    if (row.objective) {
      return { ...defaultWf, trainingGoals: row.objective };
    }
    return defaultWf;
  },

  async getByDataset(workflowId: string): Promise<FinetuneWorkflowState | null> {
    // In the API world, workflowId === workflowId (BE row ID)
    return apiWorkflowAdapter.get(workflowId);
  },

  async getAll(): Promise<FinetuneWorkflowState[]> {
    const response = await api.get(BASE);
    const rows = await handleApiResponse<DbWorkflowResponse[]>(response);
    const workflows: FinetuneWorkflowState[] = [];
    for (const row of rows) {
      const wf = extractWorkflow(row);
      if (wf) workflows.push(wf);
    }
    return workflows.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async update(workflow: FinetuneWorkflowState): Promise<void> {
    const id = workflow.workflowId;
    await mutateBlob(id, (blob) => ({
      ...blob,
      workflow: { ...workflow, updatedAt: Date.now() },
    }));
  },

  async delete(id: string): Promise<void> {
    // Clear the state blob (don't delete the workflow row — that's the dataset adapter's job)
    const response = await api.put(`${BASE}/${id}`, { state: null });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  // ─── Step management ─────────────────────────────────────────────────────

  async advanceToStep(id: string, step: FinetuneStep): Promise<FinetuneWorkflowState | null> {
    const result = await mutateBlob(id, (blob) => {
      const { workflow } = blob;
      const now = Date.now();

      const snapshot: WorkflowSnapshotStore = {
        id: uniqueId(`${workflow.id}-${workflow.currentStep}`),
        workflowId: workflow.id,
        step: workflow.currentStep,
        state: { ...workflow },
        createdAt: now,
      };

      const updatedStatus = { ...workflow.stepStatus };
      updatedStatus[workflow.currentStep] = 'completed';
      updatedStatus[step] = 'in_progress';

      return {
        ...blob,
        workflow: {
          ...workflow,
          currentStep: step,
          stepStatus: updatedStatus,
          updatedAt: now,
        },
        snapshots: [...blob.snapshots, snapshot],
      };
    });

    emitWorkflowUpdate(id, step);
    return result.workflow;
  },

  async markStepFailed(id: string): Promise<FinetuneWorkflowState | null> {
    const result = await mutateBlob(id, (blob) => {
      const { workflow } = blob;
      const updatedStatus = { ...workflow.stepStatus };
      updatedStatus[workflow.currentStep] = 'failed';

      return {
        ...blob,
        workflow: {
          ...workflow,
          stepStatus: updatedStatus,
          updatedAt: Date.now(),
        },
      };
    });

    return result.workflow;
  },

  async updateStepData<K extends keyof FinetuneWorkflowState>(
    id: string,
    key: K,
    data: FinetuneWorkflowState[K],
  ): Promise<FinetuneWorkflowState | null> {
    const result = await mutateBlob(id, (blob) => ({
      ...blob,
      workflow: {
        ...blob.workflow,
        [key]: data,
        updatedAt: Date.now(),
      },
    }));

    return result.workflow;
  },

  // ─── Snapshots ────────────────────────────────────────────────────────────

  async createSnapshot(workflow: FinetuneWorkflowState): Promise<string> {
    const id = workflow.workflowId;
    const snapshotId = uniqueId(`${workflow.id}-${workflow.currentStep}`);

    await mutateBlob(id, (blob) => {
      const snapshot: WorkflowSnapshotStore = {
        id: snapshotId,
        workflowId: workflow.id,
        step: workflow.currentStep,
        state: { ...workflow },
        createdAt: Date.now(),
      };

      return {
        ...blob,
        snapshots: [...blob.snapshots, snapshot],
      };
    });

    return snapshotId;
  },

  async getSnapshots(workflowId: string): Promise<WorkflowSnapshotStore[]> {
    const blob = await readBlob(workflowId);
    if (!blob) return [];
    return [...blob.snapshots].sort((a, b) => a.createdAt - b.createdAt);
  },

  async rollbackToSnapshot(snapshotId: string): Promise<FinetuneWorkflowState | null> {
    // Scan all workflows to find the one containing this snapshot.
    const response = await api.get(BASE);
    const rows = await handleApiResponse<DbWorkflowResponse[]>(response);

    for (const row of rows) {
      const blob = parseBlob(row.state);
      if (!blob) continue;

      const snapshot = blob.snapshots.find((s) => s.id === snapshotId);
      if (!snapshot) continue;

      const restoredWorkflow: FinetuneWorkflowState = {
        ...snapshot.state,
        updatedAt: Date.now(),
      };

      const updatedBlob: WorkflowStateBlob = {
        ...blob,
        workflow: restoredWorkflow,
        version: blob.version + 1,
      };

      await saveBlob(row.id, updatedBlob);
      return restoredWorkflow;
    }

    return null;
  },

  // ─── Generation history ───────────────────────────────────────────────────

  async recordGeneration(workflowId: string, data: GenerationData): Promise<string> {
    const recordId = uniqueId(`${workflowId}-gen`);

    await mutateBlob(workflowId, (blob) => {
      const record: GenerationHistoryStore = {
        id: recordId,
        workflowId,
        strategy: data.strategy,
        topicsTargeted: data.topicsTargeted,
        recordsGenerated: data.recordsGenerated,
        recordsValid: data.recordsValid,
        balanceScoreBefore: data.balanceScoreBefore,
        balanceScoreAfter: data.balanceScoreAfter,
        createdAt: Date.now(),
      };

      return {
        ...blob,
        generationHistory: [...blob.generationHistory, record],
      };
    });

    return recordId;
  },

  async getGenerationHistory(workflowId: string): Promise<GenerationHistoryStore[]> {
    const blob = await readBlob(workflowId);
    if (!blob) return [];
    return [...blob.generationHistory].sort((a, b) => a.createdAt - b.createdAt);
  },

  // ─── Job evaluation cache ─────────────────────────────────────────────────

  async getCachedJobEvaluations(jobId: string): Promise<CachedJobEvaluation | null> {
    // Eval cache is keyed by jobId, but stored inside workflow blobs.
    // We need to search all workflows for this jobId.
    const response = await api.get(BASE);
    const rows = await handleApiResponse<DbWorkflowResponse[]>(response);

    for (const row of rows) {
      const blob = parseBlob(row.state);
      if (!blob) continue;
      const cached = blob.evalCache.find((c) => c.jobId === jobId);
      if (cached) return cached;
    }

    return null;
  },

  async saveJobEvaluationsCache(jobId: string, data: FinetuneEvalResultsResponse): Promise<void> {
    const workflowId = await findWorkflowIdForJob(jobId);
    if (!workflowId) return;

    await mutateBlob(workflowId, (blob) => {
      const existing = blob.evalCache.find((c) => c.jobId === jobId);
      const cached: CachedJobEvaluation = {
        jobId,
        data,
        updatedAt: Date.now(),
        ...(existing?.scoresPersisted && { scoresPersisted: true }),
      };
      const filteredCache = blob.evalCache.filter((c) => c.jobId !== jobId);
      return { ...blob, evalCache: [...filteredCache, cached] };
    });
  },

  async deleteCachedJobEvaluations(jobId: string): Promise<void> {
    const workflowId = await findWorkflowIdForJob(jobId);
    if (!workflowId) return;

    await mutateBlob(workflowId, (blob) => ({
      ...blob,
      evalCache: blob.evalCache.filter((c) => c.jobId !== jobId),
    }));
  },

  async clearOldEvaluationsCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let deletedCount = 0;

    const response = await api.get(BASE);
    const rows = await handleApiResponse<DbWorkflowResponse[]>(response);

    for (const row of rows) {
      const blob = parseBlob(row.state);
      if (!blob || blob.evalCache.length === 0) continue;

      const kept = blob.evalCache.filter((c) => c.updatedAt > cutoff);
      const removed = blob.evalCache.length - kept.length;
      if (removed === 0) continue;

      deletedCount += removed;
      await saveBlob(row.id, { ...blob, evalCache: kept, version: blob.version + 1 });
    }

    return deletedCount;
  },

  async isJobScoresPersisted(jobId: string): Promise<boolean> {
    const cached = await apiWorkflowAdapter.getCachedJobEvaluations(jobId);
    return cached?.scoresPersisted === true;
  },

  async markJobScoresPersisted(jobId: string): Promise<void> {
    const workflowId = await findWorkflowIdForJob(jobId);
    if (!workflowId) return;

    await mutateBlob(workflowId, (blob) => ({
      ...blob,
      evalCache: blob.evalCache.map((c) =>
        c.jobId === jobId ? { ...c, scoresPersisted: true } : c,
      ),
    }));
  },
};

// ─── Helper: find workflow ID that owns a given eval job ─────────────────────

async function findWorkflowIdForJob(jobId: string): Promise<string | null> {
  // Try to find the eval job directly (uses the non-scoped route)
  try {
    const response = await api.get(`/finetune/eval-jobs/${jobId}`);
    if (response.ok) {
      const job = await handleApiResponse<{ id: string; workflow_id: string }>(response);
      return job.workflow_id;
    }
  } catch {
    // Fall through to scan approach
  }

  // Fallback: scan all workflows for cached entry
  try {
    const response = await api.get(BASE);
    const rows = await handleApiResponse<DbWorkflowResponse[]>(response);
    for (const row of rows) {
      const blob = parseBlob(row.state);
      if (!blob) continue;
      if (blob.evalCache.some((c) => c.jobId === jobId)) return row.id;
    }
  } catch {
    // Nothing we can do
  }

  return null;
}
