/**
 * Source Attribution Utility
 *
 * Synchronous lookup from record metadata.sourceChunkRefs → source names.
 * Uses the already-loaded KnowledgeSourcesContext sources array to avoid
 * async IndexedDB calls on every render.
 */

import type { KnowledgeSource } from '@/types/knowledge-types';
import { parseChunkRef } from './chunk-lookup';

// ============================================================================
// Types
// ============================================================================

export interface SourceAttribution {
  sourceId: string;
  sourceName: string;
  /** How many chunks from this source are referenced by the record */
  chunkCount: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Map a record's sourceChunkRefs to deduplicated source attributions.
 *
 * @param sourceChunkRefs - From `record.metadata.sourceChunkRefs`
 * @param sources - All knowledge sources (from KnowledgeSourcesConsumer)
 * @returns Deduplicated attributions sorted by chunk count descending
 */
export function getRecordSourceAttributions(
  sourceChunkRefs: string[] | undefined,
  sources: KnowledgeSource[],
): SourceAttribution[] {
  if (!sourceChunkRefs || sourceChunkRefs.length === 0 || sources.length === 0) {
    return [];
  }

  // Build a quick lookup from source ID → name
  const sourceNameMap = new Map<string, string>();
  for (const src of sources) {
    sourceNameMap.set(src.id, src.name);
  }

  // Group refs by source ID and count
  const countMap = new Map<string, number>();
  for (const ref of sourceChunkRefs) {
    const parsed = parseChunkRef(ref);
    if (!parsed) continue;
    countMap.set(parsed.sourceId, (countMap.get(parsed.sourceId) || 0) + 1);
  }

  // Build attributions, skip sources we can't resolve
  const attributions: SourceAttribution[] = [];
  for (const [sourceId, chunkCount] of countMap) {
    const name = sourceNameMap.get(sourceId);
    if (!name) continue; // source was deleted or not loaded
    attributions.push({ sourceId, sourceName: name, chunkCount });
  }

  // Sort by chunk count descending (most relevant source first)
  attributions.sort((a, b) => b.chunkCount - a.chunkCount);

  return attributions;
}
