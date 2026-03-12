/**
 * API adapter for DatasetService.
 *
 * Calls gateway /finetune/workflows endpoints.
 * Replaces IndexedDB adapter (indexeddb-dataset-adapter.ts).
 *
 * Mapping: FE "Dataset" → BE "Workflow"
 *
 * The BE workflow only stores: name, objective, eval_script.
 * Derived metadata (coverageStats, evalStats, topicHierarchy, etc.)
 * is computed on-demand from records, topics, and eval jobs.
 * These update methods are no-ops in the API adapter — the data is
 * derived, not persisted.
 */

import { api, handleApiResponse } from '@/lib/api-client';
import type { DatasetService } from '@/services/interfaces/dataset-service';
import type {
  Dataset,
  TopicHierarchyConfig,
  CoverageStats,
  KnowledgeCoverageStats,
  EvalStats,
  DatasetStats,
  SampleTrainingConfig,
} from '@/types/dataset-types';

// ─── BE → FE type mapping ────────────────────────────────────────────────────

interface DbWorkflowResponse {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly eval_script: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

function mapToFe(db: DbWorkflowResponse): Dataset {
  return {
    id: db.id,
    name: db.name,
    datasetObjective: db.objective,
    evalScript: db.eval_script ?? undefined,
    createdAt: new Date(db.created_at).getTime(),
    updatedAt: new Date(db.updated_at).getTime(),
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

const BASE = '/finetune/workflows';

export const apiDatasetAdapter: DatasetService = {
  async getById(id: string): Promise<Dataset | null> {
    const response = await api.get(`${BASE}/${id}`);
    if (!response.ok && response.status === 404) return null;
    const db = await handleApiResponse<DbWorkflowResponse>(response);
    return mapToFe(db);
  },

  async getAll(): Promise<Dataset[]> {
    const response = await api.get(BASE);
    const workflows = await handleApiResponse<DbWorkflowResponse[]>(response);
    return workflows.map(mapToFe);
  },

  async create(name: string, objective?: string): Promise<Dataset> {
    const response = await api.post(BASE, {
      name,
      objective: objective ?? '',
    });
    const db = await handleApiResponse<DbWorkflowResponse>(response);
    return mapToFe(db);
  },

  async rename(id: string, name: string): Promise<void> {
    const response = await api.put(`${BASE}/${id}`, { name });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete(`${BASE}/${id}`);
    await handleApiResponse<{ id: string; deleted: boolean }>(response);
  },

  async updateObjective(id: string, objective: string, _normalizedObjective?: string): Promise<void> {
    const response = await api.put(`${BASE}/${id}`, { objective });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  async updateTopicHierarchy(_id: string, _topics: TopicHierarchyConfig): Promise<void> {
    // Topic hierarchy is stored in the workflow_topics table, not on the workflow.
    // Topics are managed via the separate topics CRUD endpoints.
  },

  async updateEvalScript(id: string, script: string): Promise<void> {
    const response = await api.put(`${BASE}/${id}`, { eval_script: script });
    await handleApiResponse<DbWorkflowResponse>(response);
  },

  async updateCoverageStats(_id: string, _stats: CoverageStats): Promise<void> {
    // Computed on-demand from records. No BE storage needed.
  },

  async updateKnowledgeCoverageStats(_id: string, _stats: KnowledgeCoverageStats): Promise<void> {
    // Computed on-demand from knowledge sources. No BE storage needed.
  },

  async updateEvalStats(_id: string, _stats: EvalStats): Promise<void> {
    // Computed on-demand from eval jobs. No BE storage needed.
  },

  async updateDatasetStats(_id: string, _stats: DatasetStats): Promise<void> {
    // Computed on-demand from records. No BE storage needed.
  },

  async updateTrainingConfig(_id: string, _config: SampleTrainingConfig): Promise<void> {
    // Training config is managed by the finetune job system. No BE storage needed.
    // TODO: Add a training_config column to workflows if we want to persist this.
  },

  async updateReadme(_id: string, _readme: string, _source?: 'template' | 'agent'): Promise<void> {
    // README is generated on-demand. No BE storage needed.
    // TODO: Add a readme column to workflows if we want to persist this.
  },
};
