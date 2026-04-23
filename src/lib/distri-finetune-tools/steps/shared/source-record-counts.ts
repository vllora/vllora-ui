/**
 * Source Record Counts Utility
 *
 * Computes per-document record counts and coverage stats from the
 * existing provenance data in record.metadata.sourceChunkRefs.
 * All synchronous — works from data already in React contexts.
 */

import type { DatasetRecord, KnowledgeCoverageStats } from '@/types/dataset-types';
import { parseChunkRef } from './chunk-lookup';

// ============================================================================
// Types
// ============================================================================

export interface SourceRecordStats {
  sourceId: string;
  /** Number of unique records referencing chunks from this source */
  recordCount: number;
  /** Coverage percentage from KnowledgeCoverageStats (if available) */
  coveragePercent?: number;
  /** Total chunks in this source */
  totalChunks?: number;
  /** Covered chunks in this source */
  coveredChunks?: number;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Compute per-source record counts from record metadata.
 *
 * @param records - All records in the dataset
 * @param coverageStats - Pre-computed coverage stats (from dataset.knowledgeCoverageStats)
 * @returns Map from sourceId to stats
 */
export function computeSourceRecordStats(
  records: DatasetRecord[],
  coverageStats?: KnowledgeCoverageStats | null,
): Map<string, SourceRecordStats> {
  // Count unique records per source
  const sourceRecordSets = new Map<string, Set<string>>();

  for (const record of records) {
    const refs = (record.metadata?.sourceChunkRefs as string[]) || [];
    if (refs.length === 0) continue;

    // Collect unique source IDs referenced by this record
    const recordSourceIds = new Set<string>();
    for (const ref of refs) {
      const parsed = parseChunkRef(ref);
      if (parsed) recordSourceIds.add(parsed.sourceId);
    }

    // Add this record to each source's set
    for (const sourceId of recordSourceIds) {
      if (!sourceRecordSets.has(sourceId)) {
        sourceRecordSets.set(sourceId, new Set());
      }
      sourceRecordSets.get(sourceId)!.add(record.id);
    }
  }

  // Build result map, merging with coverage stats
  const result = new Map<string, SourceRecordStats>();

  for (const [sourceId, recordIds] of sourceRecordSets) {
    const stats: SourceRecordStats = {
      sourceId,
      recordCount: recordIds.size,
    };

    // Merge coverage stats if available
    const sourceCoverage = coverageStats?.bySource?.[sourceId];
    if (sourceCoverage) {
      stats.coveragePercent = sourceCoverage.coveragePercent;
      stats.totalChunks = sourceCoverage.totalChunks;
      stats.coveredChunks = sourceCoverage.coveredChunks;
    }

    result.set(sourceId, stats);
  }

  return result;
}
