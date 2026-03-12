/**
 * Knowledge Source Search Types
 *
 * Extracted from knowledge-sources-db.ts to remove IndexedDB dependency.
 */

import type { KnowledgeSource } from '@/types/dataset-types';

export interface ChunkMatch {
  chunk_id: string;
  heading: string;
  summary: string;
  pages: string;
  sentence_count: number;
  /** Matching sentences from this chunk */
  matching_sentences: string[];
  /** Full chunk text (for grounded generation) */
  text: string;
}

export interface SearchResult {
  source: KnowledgeSource;
  /** Legacy string matches (for non-chunked sources) */
  matches: string[];
  /** Structured chunk matches (for local-semantic sources) */
  chunk_matches?: ChunkMatch[];
}
