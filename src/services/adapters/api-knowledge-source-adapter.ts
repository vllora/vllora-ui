/**
 * API adapter for KnowledgeSourceService.
 *
 * Calls gateway /finetune/workflows/{workflowId}/knowledge endpoints.
 * Read-only visualization layer — writes happen via CLI skill.
 */

import { api, handleApiResponse } from '@/lib/api-client';
import { getBackendUrl } from '@/config/api';
import type { KnowledgeSourceService } from '@/services/interfaces/knowledge-source-service';
import type { KnowledgeSource, KnowledgeSourcePart, KnowledgePartType } from '@/types/knowledge-types';

// ─── BE → FE type mapping ────────────────────────────────────────────────────

interface DbPartResponse {
  readonly id: string;
  readonly reference_id: string | null;
  readonly source_id: string;
  readonly type: KnowledgePartType;
  readonly content: string;
  readonly content_metadata: unknown | null;
  readonly title: string | null;
  readonly extraction_path: string | null;
  readonly extraction_metadata: unknown | null;
}

interface DbSourceResponse {
  readonly id: string;
  readonly reference_id: string | null;
  readonly workflow_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly metadata: unknown | null;
  readonly part: DbPartResponse[];
  readonly created_at?: string;
}

function mapPart(db: DbPartResponse): KnowledgeSourcePart {
  const extractionMeta = db.extraction_metadata as Record<string, unknown> | null;
  return {
    id: db.id,
    referenceId: db.reference_id ?? undefined,
    sourceId: db.source_id,
    type: db.type,
    content: db.content,
    contentMetadata: (db.content_metadata as Record<string, unknown>) ?? undefined,
    title: db.title ?? undefined,
    extractionPath: db.extraction_path ?? undefined,
    extractionMetadata: extractionMeta ?? undefined,
    relevant: (extractionMeta?.relevant as boolean | null) ?? null,
  };
}

function mapSource(db: DbSourceResponse): KnowledgeSource {
  return {
    id: db.id,
    referenceId: db.reference_id ?? undefined,
    workflowId: db.workflow_id,
    name: db.name,
    description: db.description ?? undefined,
    metadata: (db.metadata as Record<string, unknown>) ?? undefined,
    parts: (db.part ?? []).map(mapPart),
    createdAt: db.created_at ?? '',
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

function basePath(workflowId: string): string {
  return `/finetune/workflows/${workflowId}/knowledge`;
}

export const apiKnowledgeSourceAdapter: KnowledgeSourceService = {
  async list(workflowId: string): Promise<KnowledgeSource[]> {
    const response = await api.get(basePath(workflowId));
    const data = await handleApiResponse<{ knowledge_sources: DbSourceResponse[] }>(response);
    return data.knowledge_sources.map(mapSource);
  },

  async get(workflowId: string, idOrRef: string): Promise<KnowledgeSource | null> {
    const response = await api.get(`${basePath(workflowId)}/${idOrRef}`);
    if (!response.ok && response.status === 404) return null;
    const db = await handleApiResponse<DbSourceResponse>(response);
    return mapSource(db);
  },

  async getCount(workflowId: string): Promise<number> {
    const response = await api.get(`${basePath(workflowId)}/count`);
    const data = await handleApiResponse<{ count: number }>(response);
    return data.count;
  },

  async delete(workflowId: string, idOrRef: string): Promise<void> {
    const response = await api.delete(`${basePath(workflowId)}/${idOrRef}`);
    await handleApiResponse<{ deleted: boolean }>(response);
  },

  getFileUrl(workflowId: string, sourceId: string): string {
    return `${getBackendUrl()}${basePath(workflowId)}/${sourceId}/file`;
  },

  async deleteAll(workflowId: string): Promise<void> {
    const response = await api.delete(basePath(workflowId));
    await handleApiResponse<{ deleted: number }>(response);
  },
};
