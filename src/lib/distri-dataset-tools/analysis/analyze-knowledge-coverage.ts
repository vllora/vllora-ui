/**
 * Knowledge Coverage Analysis
 *
 * Computes which knowledge source chunks are covered by training data.
 * Uses record-level sourceChunkRefs (Phase 1 lineage) when available,
 * falls back to topic → hierarchy → sourceChunkRefs for older records.
 */

import { datasetService, recordService, knowledgeSourceService } from '@/services/service-registry';
import type { KnowledgeCoverageStats, TopicHierarchyNode } from '@/types/dataset-types';

/** Collect all leaf nodes from a hierarchy */
function collectLeafNodes(
  nodes: TopicHierarchyNode[],
  result: Map<string, string[]> = new Map(),
): Map<string, string[]> {
  for (const node of nodes) {
    if (node.children?.length) {
      collectLeafNodes(node.children, result);
    } else if (node.sourceChunkRefs?.length) {
      // Leaf node with chunk refs → map topic id to its refs
      result.set(node.id || node.name, node.sourceChunkRefs);
    }
  }
  return result;
}

/**
 * Analyze which knowledge source chunks are covered by training data records.
 *
 * @returns KnowledgeCoverageStats with per-source and overall coverage metrics
 */
export async function analyzeKnowledgeCoverage(
  workflowId: string,
): Promise<KnowledgeCoverageStats | null> {
  const sources = await knowledgeSourceService.list(workflowId);

  if (sources.length === 0) return null;

  // Build the universe of all parts across all sources
  const allChunkRefs = new Map<string, { sourceName: string; sourceId: string; chunkId: string }>();

  for (const source of sources) {
    for (const part of source.parts) {
      const ref = `${source.id}:${part.id}`;
      allChunkRefs.set(ref, { sourceName: source.name, sourceId: source.id, chunkId: part.id });
    }
  }

  if (allChunkRefs.size === 0) return null;

  // Count chunk usage across all records
  const chunkUsageCounts: Record<string, number> = {};
  const records = await recordService.getByDatasetId(workflowId);

  // Pass 1: Direct lineage from record metadata (Phase 1 records)
  for (const record of records) {
    const refs = (record.metadata?.sourceChunkRefs as string[]) || [];
    for (const ref of refs) {
      // Normalize: strip "ref:" prefix if present
      const normalized = ref.replace(/^ref:/, '');
      if (allChunkRefs.has(normalized)) {
        chunkUsageCounts[normalized] = (chunkUsageCounts[normalized] || 0) + 1;
      }
    }
  }

  // Pass 2: Backward compatibility — infer from topic → hierarchy → sourceChunkRefs
  // for records that don't have sourceChunkRefs in metadata
  const dataset = await datasetService.getById(workflowId);
  const hierarchy = dataset?.topicHierarchy?.hierarchy;
  if (hierarchy?.length) {
    const topicToChunkRefs = collectLeafNodes(hierarchy);

    for (const record of records) {
      // Skip records that already have direct lineage
      const directRefs = (record.metadata?.sourceChunkRefs as string[]) || [];
      if (directRefs.length > 0) continue;

      // Infer from topic
      if (record.topic) {
        const inferred = topicToChunkRefs.get(record.topic);
        if (inferred) {
          for (const ref of inferred) {
            const normalized = ref.replace(/^ref:/, '');
            if (allChunkRefs.has(normalized)) {
              chunkUsageCounts[normalized] = (chunkUsageCounts[normalized] || 0) + 1;
            }
          }
        }
      }
    }
  }

  // Build per-source breakdown
  const bySource: KnowledgeCoverageStats['bySource'] = {};
  let totalChunks = 0;
  let coveredChunks = 0;

  // Group chunk refs by source
  const sourceChunkMap = new Map<string, { sourceName: string; chunkIds: string[]; coveredIds: string[] }>();

  for (const [ref, info] of allChunkRefs.entries()) {
    if (!sourceChunkMap.has(info.sourceId)) {
      sourceChunkMap.set(info.sourceId, { sourceName: info.sourceName, chunkIds: [], coveredIds: [] });
    }
    const entry = sourceChunkMap.get(info.sourceId)!;
    entry.chunkIds.push(info.chunkId);
    totalChunks++;

    if ((chunkUsageCounts[ref] || 0) > 0) {
      entry.coveredIds.push(info.chunkId);
      coveredChunks++;
    }
  }

  for (const [sourceId, info] of sourceChunkMap.entries()) {
    const uncoveredChunkIds = info.chunkIds.filter((id) => !info.coveredIds.includes(id));
    bySource[sourceId] = {
      sourceName: info.sourceName,
      totalChunks: info.chunkIds.length,
      coveredChunks: info.coveredIds.length,
      coveragePercent: info.chunkIds.length > 0
        ? Math.round((info.coveredIds.length / info.chunkIds.length) * 100)
        : 0,
      uncoveredChunkIds,
    };
  }

  return {
    totalChunks,
    coveredChunks,
    coveragePercent: totalChunks > 0 ? Math.round((coveredChunks / totalChunks) * 100) : 0,
    bySource,
    chunkUsageCounts,
    lastCalculatedAt: Date.now(),
  };
}
