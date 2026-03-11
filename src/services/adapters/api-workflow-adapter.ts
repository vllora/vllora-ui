/**
 * API adapter for WorkflowService.
 *
 * Stores the entire FinetuneWorkflowState as JSON in the `state` column
 * on the BE workflows table. Snapshots, generation history, and eval cache
 * are embedded within a compound blob alongside the workflow state.
 *
 * All mutation methods use read-modify-write on the JSON blob.
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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = '/finetune/workflows';

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
    return JSON.parse(stateJson) as WorkflowStateBlob;
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

async function readOrCreateBlob(id: string): Promise<WorkflowStateBlob> {
  const blob = await readBlob(id);
  if (blob) return blob;
  return {
    workflow: createDefaultWorkflow(id),
    snapshots: [],
    generationHistory: [],
    evalCache: [],
  };
}

function createDefaultWorkflow(datasetId: string): FinetuneWorkflowState {
  const now = Date.now();
  return {
    id: datasetId,
    datasetId,
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
  async create(datasetId: string, trainingGoals: string): Promise<FinetuneWorkflowState> {
    const now = Date.now();
    const workflow: FinetuneWorkflowState = {
      id: datasetId,
      datasetId,
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
    };

    await saveBlob(datasetId, blob);
    return workflow;
  },

  async get(id: string): Promise<FinetuneWorkflowState | null> {
    const row = await fetchWorkflowRow(id);
    if (!row) return null;
    return extractWorkflow(row);
  },

  async getByDataset(datasetId: string): Promise<FinetuneWorkflowState | null> {
    // In the API world, datasetId === workflowId (BE row ID)
    return apiWorkflowAdapter.get(datasetId);
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
    const id = workflow.datasetId;
    const blob = await readOrCreateBlob(id);
    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      workflow: { ...workflow, updatedAt: Date.now() },
    };
    await saveBlob(id, updatedBlob);
  },

  async delete(id: string): Promise<void> {
    // Clear the state blob (don't delete the workflow row — that's the dataset adapter's job)
    const response = await api.put(`${BASE}/${id}`, { state: null });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  // ─── Step management ─────────────────────────────────────────────────────

  async advanceToStep(id: string, step: FinetuneStep): Promise<FinetuneWorkflowState | null> {
    const blob = await readBlob(id);
    if (!blob) return null;

    const { workflow } = blob;

    // Create snapshot before advancing
    const now = Date.now();
    const snapshot: WorkflowSnapshotStore = {
      id: `${workflow.id}-${workflow.currentStep}-${now}`,
      workflowId: workflow.id,
      step: workflow.currentStep,
      state: { ...workflow },
      createdAt: now,
    };

    const updatedStatus = { ...workflow.stepStatus };
    updatedStatus[workflow.currentStep] = 'completed';
    updatedStatus[step] = 'in_progress';

    const updatedWorkflow: FinetuneWorkflowState = {
      ...workflow,
      currentStep: step,
      stepStatus: updatedStatus,
      updatedAt: now,
    };

    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      workflow: updatedWorkflow,
      snapshots: [...blob.snapshots, snapshot],
    };

    await saveBlob(id, updatedBlob);
    emitWorkflowUpdate(workflow.datasetId, step);
    return updatedWorkflow;
  },

  async markStepFailed(id: string): Promise<FinetuneWorkflowState | null> {
    const blob = await readBlob(id);
    if (!blob) return null;

    const { workflow } = blob;
    const updatedStatus = { ...workflow.stepStatus };
    updatedStatus[workflow.currentStep] = 'failed';

    const updatedWorkflow: FinetuneWorkflowState = {
      ...workflow,
      stepStatus: updatedStatus,
      updatedAt: Date.now(),
    };

    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      workflow: updatedWorkflow,
    };

    await saveBlob(id, updatedBlob);
    return updatedWorkflow;
  },

  async updateStepData<K extends keyof FinetuneWorkflowState>(
    id: string,
    key: K,
    data: FinetuneWorkflowState[K],
  ): Promise<FinetuneWorkflowState | null> {
    const blob = await readBlob(id);
    if (!blob) return null;

    const updatedWorkflow: FinetuneWorkflowState = {
      ...blob.workflow,
      [key]: data,
      updatedAt: Date.now(),
    };

    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      workflow: updatedWorkflow,
    };

    await saveBlob(id, updatedBlob);
    return updatedWorkflow;
  },

  // ─── Snapshots ────────────────────────────────────────────────────────────

  async createSnapshot(workflow: FinetuneWorkflowState): Promise<string> {
    const id = workflow.datasetId;
    const blob = await readOrCreateBlob(id);
    const now = Date.now();

    const snapshot: WorkflowSnapshotStore = {
      id: `${workflow.id}-${workflow.currentStep}-${now}`,
      workflowId: workflow.id,
      step: workflow.currentStep,
      state: { ...workflow },
      createdAt: now,
    };

    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      snapshots: [...blob.snapshots, snapshot],
    };

    await saveBlob(id, updatedBlob);
    return snapshot.id;
  },

  async getSnapshots(workflowId: string): Promise<WorkflowSnapshotStore[]> {
    const blob = await readBlob(workflowId);
    if (!blob) return [];
    return [...blob.snapshots].sort((a, b) => a.createdAt - b.createdAt);
  },

  async rollbackToSnapshot(snapshotId: string): Promise<FinetuneWorkflowState | null> {
    // We need to find which workflow contains this snapshot.
    // Since snapshot IDs are prefixed with the workflow ID, extract it.
    // Format: `{workflowId}-{step}-{timestamp}`
    // We can't easily parse this, so scan all workflows.
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
      };

      await saveBlob(row.id, updatedBlob);
      return restoredWorkflow;
    }

    return null;
  },

  // ─── Generation history ───────────────────────────────────────────────────

  async recordGeneration(workflowId: string, data: GenerationData): Promise<string> {
    const blob = await readOrCreateBlob(workflowId);
    const now = Date.now();

    const record: GenerationHistoryStore = {
      id: `${workflowId}-gen-${now}`,
      workflowId,
      strategy: data.strategy,
      topicsTargeted: data.topicsTargeted,
      recordsGenerated: data.recordsGenerated,
      recordsValid: data.recordsValid,
      balanceScoreBefore: data.balanceScoreBefore,
      balanceScoreAfter: data.balanceScoreAfter,
      createdAt: now,
    };

    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      generationHistory: [...blob.generationHistory, record],
    };

    await saveBlob(workflowId, updatedBlob);
    return record.id;
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
    // Find the workflow that owns this job by checking eval jobs
    const workflowId = await findWorkflowIdForJob(jobId);
    if (!workflowId) return;

    const blob = await readOrCreateBlob(workflowId);
    const existing = blob.evalCache.find((c) => c.jobId === jobId);

    const cached: CachedJobEvaluation = {
      jobId,
      data,
      updatedAt: Date.now(),
      ...(existing?.scoresPersisted && { scoresPersisted: true }),
    };

    const updatedCache = blob.evalCache.filter((c) => c.jobId !== jobId);

    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      evalCache: [...updatedCache, cached],
    };

    await saveBlob(workflowId, updatedBlob);
  },

  async deleteCachedJobEvaluations(jobId: string): Promise<void> {
    const workflowId = await findWorkflowIdForJob(jobId);
    if (!workflowId) return;

    const blob = await readBlob(workflowId);
    if (!blob) return;

    const updatedBlob: WorkflowStateBlob = {
      ...blob,
      evalCache: blob.evalCache.filter((c) => c.jobId !== jobId),
    };

    await saveBlob(workflowId, updatedBlob);
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
      const updatedBlob: WorkflowStateBlob = { ...blob, evalCache: kept };
      await saveBlob(row.id, updatedBlob);
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

    const blob = await readBlob(workflowId);
    if (!blob) return;

    const updatedCache = blob.evalCache.map((c) =>
      c.jobId === jobId ? { ...c, scoresPersisted: true } : c,
    );

    const updatedBlob: WorkflowStateBlob = { ...blob, evalCache: updatedCache };
    await saveBlob(workflowId, updatedBlob);
  },
};

// ─── Helper: find workflow ID that owns a given eval job ─────────────────────

async function findWorkflowIdForJob(jobId: string): Promise<string | null> {
  // Try to find the eval job to get its workflow_id
  try {
    const response = await api.get(`/finetune/eval-jobs?status=completed`);
    if (response.ok) {
      const jobs = await handleApiResponse<Array<{ id: string; workflow_id: string }>>(response);
      const job = jobs.find((j) => j.id === jobId);
      if (job) return job.workflow_id;
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
