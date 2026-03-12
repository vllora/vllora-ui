/**
 * Knowledge Source Service Interface
 *
 * Abstraction over knowledge source persistence.
 * Backed by Gateway API (api-knowledge-source-adapter.ts).
 */

import type {
  KnowledgeSource,
  KnowledgeSourceType,
  KnowledgeSourceStatus,
  KnowledgeSourceProgress,
  ExtractedContent,
} from '@/types/dataset-types';

export type { SearchResult, ChunkMatch } from '@/types/knowledge-types';

import type { SearchResult } from '@/types/knowledge-types';

export interface CreateKnowledgeSourceOptions {
  readonly content?: string;
  readonly size?: number;
  readonly mimeType?: string;
  readonly comment?: string;
}

export interface UpdateStatusOptions {
  readonly extractedContent?: ExtractedContent;
  readonly error?: string;
}

export interface KnowledgeSourceService {
  create(
    workflowId: string,
    name: string,
    type: KnowledgeSourceType,
    options?: CreateKnowledgeSourceOptions,
  ): Promise<KnowledgeSource>;
  get(id: string): Promise<KnowledgeSource | null>;
  getByDataset(workflowId: string): Promise<KnowledgeSource[]>;
  getCount(workflowId: string): Promise<number>;
  updateStatus(id: string, status: KnowledgeSourceStatus, options?: UpdateStatusOptions): Promise<void>;
  updateProgress(id: string, progress: KnowledgeSourceProgress): Promise<void>;
  updateChunks(id: string, content: ExtractedContent, phase: 'basic' | 'enhanced'): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByDataset(workflowId: string): Promise<void>;
  search(workflowId: string, query: string): Promise<SearchResult[]>;
}
