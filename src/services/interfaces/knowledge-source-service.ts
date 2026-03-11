/**
 * Knowledge Source Service Interface
 *
 * Abstraction over knowledge source persistence.
 * Currently backed by IndexedDB (knowledge-sources-db.ts).
 * Will be swapped to gateway API adapter when knowledge source endpoints are ready.
 *
 * Re-exports types directly from the DB module to ensure compatibility.
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
    datasetId: string,
    name: string,
    type: KnowledgeSourceType,
    options?: CreateKnowledgeSourceOptions,
  ): Promise<KnowledgeSource>;
  get(id: string): Promise<KnowledgeSource | null>;
  getByDataset(datasetId: string): Promise<KnowledgeSource[]>;
  getCount(datasetId: string): Promise<number>;
  updateStatus(id: string, status: KnowledgeSourceStatus, options?: UpdateStatusOptions): Promise<void>;
  updateProgress(id: string, progress: KnowledgeSourceProgress): Promise<void>;
  updateChunks(id: string, content: ExtractedContent, phase: 'basic' | 'enhanced'): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByDataset(datasetId: string): Promise<void>;
  search(datasetId: string, query: string): Promise<SearchResult[]>;
}
