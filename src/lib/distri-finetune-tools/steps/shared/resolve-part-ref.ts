/**
 * Resolve a topic-source reference (either "sourceId:chunkId" composite
 * or plain partId UUID) into the matching KnowledgeSource + KnowledgeSourcePart.
 *
 * Used by TopicSourceReferences and KnowledgePartViewer backlinks.
 */

import type { KnowledgeSource, KnowledgeSourcePart } from '@/types/knowledge-types';

export interface ResolvedPartRef {
  readonly source: KnowledgeSource;
  readonly part: KnowledgeSourcePart;
}

export function resolvePartRef(
  ref: string,
  sources: readonly KnowledgeSource[],
): ResolvedPartRef | null {
  // Composite "sourceId:chunkId" format (Lucy path)
  if (ref.includes(':')) {
    const [sourceId, chunkId] = ref.split(':');
    const source = sources.find(s => s.id === sourceId || s.referenceId === sourceId);
    if (!source) return null;
    const part = source.parts.find(p => p.id === chunkId || p.referenceId === chunkId);
    return part ? { source, part } : null;
  }

  // Plain partId UUID (skill/relations path) — scan all sources
  for (const source of sources) {
    const part = source.parts.find(p => p.id === ref || p.referenceId === ref);
    if (part) return { source, part };
  }
  return null;
}

/** Resolve multiple refs grouped by source document */
export function resolveAndGroupBySource(
  refs: readonly string[],
  sources: readonly KnowledgeSource[],
): Map<string, { source: KnowledgeSource; parts: KnowledgeSourcePart[] }> {
  const groups = new Map<string, { source: KnowledgeSource; parts: KnowledgeSourcePart[] }>();

  for (const ref of refs) {
    const resolved = resolvePartRef(ref, sources);
    if (!resolved) continue;

    const existing = groups.get(resolved.source.id);
    if (existing) {
      // Avoid duplicate parts
      if (!existing.parts.some(p => p.id === resolved.part.id)) {
        existing.parts.push(resolved.part);
      }
    } else {
      groups.set(resolved.source.id, {
        source: resolved.source,
        parts: [resolved.part],
      });
    }
  }

  return groups;
}
