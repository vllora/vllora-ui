/**
 * Knowledge Source Service Interface
 *
 * Read-only visualization layer. Writes happen via CLI skill → gateway API.
 */

import type { KnowledgeSource } from '@/types/knowledge-types';

export interface KnowledgeSourceService {
  list(workflowId: string, pagination?: { limit: number; offset: number }): Promise<KnowledgeSource[]>;
  get(workflowId: string, idOrRef: string): Promise<KnowledgeSource | null>;
  getCount(workflowId: string): Promise<number>;
  /** URL to download the original uploaded file (PDF, image, etc.) */
  getFileUrl(workflowId: string, sourceId: string): string;
  delete(workflowId: string, idOrRef: string): Promise<void>;
  deleteAll(workflowId: string): Promise<void>;
}
