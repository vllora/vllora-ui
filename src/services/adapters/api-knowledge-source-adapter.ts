/**
 * API adapter for KnowledgeSourceService.
 *
 * Calls gateway /finetune/workflows/{workflowId}/knowledge endpoints.
 * Replaces IndexedDB adapter (indexeddb-knowledge-source-adapter.ts).
 *
 * Mapping: FE workflowId → BE workflowId (same ID after migration)
 */

import { api, handleApiResponse } from '@/lib/api-client';
import type { KnowledgeSourceService, CreateKnowledgeSourceOptions, UpdateStatusOptions } from '@/services/interfaces/knowledge-source-service';
import type { SearchResult } from '@/types/knowledge-types';
import type {
  KnowledgeSource,
  KnowledgeSourceType,
  KnowledgeSourceStatus,
  KnowledgeSourceProgress,
  ExtractedContent,
} from '@/types/dataset-types';

// ─── BE → FE type mapping ────────────────────────────────────────────────────

interface DbKnowledgeSourceResponse {
  readonly id: string;
  readonly workflow_id: string;
  readonly name: string;
  readonly type: KnowledgeSourceType;
  readonly content: string | null;
  readonly extracted_content: string | null;
  readonly status: string;
  readonly progress: string | null;
  readonly created_at: string;
  readonly deleted_at: string | null;
}

function mapToFe(db: DbKnowledgeSourceResponse): KnowledgeSource {
  return {
    id: db.id,
    workflowId: db.workflow_id,
    name: db.name,
    type: db.type,
    status: db.status as KnowledgeSourceStatus,
    content: db.content ?? undefined,
    extractedContent: db.extracted_content ? JSON.parse(db.extracted_content) : undefined,
    progress: db.progress ? JSON.parse(db.progress) : undefined,
    createdAt: new Date(db.created_at).getTime(),
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

function basePath(workflowId: string): string {
  return `/finetune/workflows/${workflowId}/knowledge`;
}

export const apiKnowledgeSourceAdapter: KnowledgeSourceService = {
  async create(
    workflowId: string,
    name: string,
    type: KnowledgeSourceType,
    options?: CreateKnowledgeSourceOptions,
  ): Promise<KnowledgeSource> {
    const response = await api.post(basePath(workflowId), {
      name,
      type,
      content: options?.content,
    });
    const db = await handleApiResponse<DbKnowledgeSourceResponse>(response);
    return mapToFe(db);
  },

  async get(id: string): Promise<KnowledgeSource | null> {
    // Route requires workflow_id but handler ignores it. Use placeholder.
    const response = await api.get(`/finetune/workflows/_/knowledge/${id}`);
    if (!response.ok && response.status === 404) return null;
    const db = await handleApiResponse<DbKnowledgeSourceResponse>(response);
    return mapToFe(db);
  },

  async getByDataset(workflowId: string): Promise<KnowledgeSource[]> {
    const response = await api.get(basePath(workflowId));
    const data = await handleApiResponse<{ knowledge_sources: DbKnowledgeSourceResponse[] }>(response);
    return data.knowledge_sources.map(mapToFe);
  },

  async getCount(workflowId: string): Promise<number> {
    const response = await api.get(`${basePath(workflowId)}/count`);
    const data = await handleApiResponse<{ count: number }>(response);
    return data.count;
  },

  async updateStatus(
    id: string,
    status: KnowledgeSourceStatus,
    _options?: UpdateStatusOptions,
  ): Promise<void> {
    // We need the workflow_id for the route. Extract from a prior call or pass via context.
    // For now, use a workaround: the handler uses path (workflow_id, ks_id) but only uses ks_id.
    // We pass a placeholder workflow_id since the handler ignores it.
    const response = await api.patch(`/finetune/workflows/_/knowledge/${id}/status`, { status });
    await handleApiResponse<{ updated: boolean }>(response);
  },

  async updateProgress(_id: string, _progress: KnowledgeSourceProgress): Promise<void> {
    // Progress is tracked client-side during extraction. No BE endpoint needed.
    // This is a no-op in the API adapter.
  },

  async updateChunks(
    id: string,
    content: ExtractedContent,
    _phase: 'basic' | 'enhanced',
  ): Promise<void> {
    const response = await api.patch(`/finetune/workflows/_/knowledge/${id}/chunks`, {
      extracted_content: content,
    });
    await handleApiResponse<{ updated: boolean }>(response);
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete(`/finetune/workflows/_/knowledge/${id}`);
    await handleApiResponse<{ deleted: boolean }>(response);
  },

  async deleteByDataset(workflowId: string): Promise<void> {
    const response = await api.delete(basePath(workflowId));
    await handleApiResponse<{ deleted: number }>(response);
  },

  async search(_workflowId: string, _query: string): Promise<SearchResult[]> {
    // Search is done client-side with extracted content. No BE endpoint yet.
    // TODO: Implement POST /finetune/workflows/{id}/knowledge/search on BE
    return [];
  },
};
