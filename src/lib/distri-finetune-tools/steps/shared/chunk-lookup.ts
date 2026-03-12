/**
 * Chunk Lookup Utility
 *
 * Resolves composite "sourceId:chunkId" refs (produced by topic generation)
 * back to actual chunk content from knowledge sources. Used during data
 * generation to send only topic-relevant context to the LLM.
 */

import { knowledgeSourceService } from '@/services/service-registry';
import type { KnowledgeSource } from '@/types/dataset-types';

/**
 * Build a ready-source map from an array of knowledge sources.
 * Only includes sources with status "ready".
 */
export function buildReadySourceMap(
  sources: readonly KnowledgeSource[],
): ReadonlyMap<string, KnowledgeSource> {
  const map = new Map<string, KnowledgeSource>();
  for (const s of sources) {
    if (s.status === 'ready') map.set(s.id, s);
  }
  return map;
}

export interface ResolvedChunk {
  sourceId: string;
  sourceName: string;
  chunkId: string;
  heading: string;
  summary: string;
  text: string;
  pageStart?: number;
  pageEnd?: number;
}

/**
 * Parse a composite "sourceId:chunkId" ref string.
 * Splits on the first `:` so that chunk IDs containing colons still work.
 * Handles: "sourceId:chunkId", "ref:sourceId:chunkId", "[ref:sourceId:chunkId]"
 */
export function parseChunkRef(ref: string): { sourceId: string; chunkId: string } | null {
  let cleaned = ref.trim();
  // Strip [ref:...] or ref: prefix
  if (cleaned.startsWith('[ref:')) {
    cleaned = cleaned.slice(5, cleaned.endsWith(']') ? -1 : undefined);
  } else if (cleaned.startsWith('ref:')) {
    cleaned = cleaned.substring(4);
  }
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx <= 0 || colonIdx === cleaned.length - 1) return null;
  return {
    sourceId: cleaned.substring(0, colonIdx),
    chunkId: cleaned.substring(colonIdx + 1),
  };
}

/**
 * Normalize a ref to canonical "sourceId:chunkId" format.
 * Returns null if the ref cannot be parsed.
 */
export function normalizeChunkRef(ref: string): string | null {
  const parsed = parseChunkRef(ref);
  return parsed ? `${parsed.sourceId}:${parsed.chunkId}` : null;
}

/**
 * Resolve an array of composite chunk refs to their full content.
 *
 * - For `local-semantic` sources: looks up chunks from `metadata.chunks` by chunk ID
 * - For legacy sources: parses `section-{index}` and indexes into `extractedContent.sections`
 * - Unknown refs are silently skipped (graceful degradation)
 *
 * @param preloadedSources Optional pre-fetched source map (sourceId → KnowledgeSource).
 *   Pass this to avoid redundant IndexedDB fetches when calling resolveChunkRefs in a loop.
 */
export async function resolveChunkRefs(
  datasetId: string,
  refs: string[],
  preloadedSources?: ReadonlyMap<string, KnowledgeSource>,
): Promise<ResolvedChunk[]> {
  if (refs.length === 0) return [];

  let sourceMap: Map<string, KnowledgeSource>;
  if (preloadedSources) {
    sourceMap = new Map(preloadedSources);
  } else {
    const sources = await knowledgeSourceService.getByDataset(datasetId);
    sourceMap = new Map<string, KnowledgeSource>();
    for (const s of sources) {
      if (s.status === 'ready') sourceMap.set(s.id, s);
    }
  }

  const resolved: ResolvedChunk[] = [];

  for (const ref of refs) {
    const parsed = parseChunkRef(ref);
    if (!parsed) continue;

    const source = sourceMap.get(parsed.sourceId);
    if (!source) continue;

    const metadata = source.extractedContent?.metadata as Record<string, unknown> | undefined;
    const extractionMethod = (metadata?.extractionMethod as string) || 'unknown';

    if (extractionMethod === 'local-semantic') {
      // Look up by chunk ID in metadata.chunks
      const chunks = (metadata?.chunks as Array<{
        id: string;
        heading: string;
        summary: string;
        sentences: string[];
        pageStart: number;
        pageEnd: number;
      }>) || [];

      const chunk = chunks.find(c => c.id === parsed.chunkId);
      if (chunk) {
        resolved.push({
          sourceId: source.id,
          sourceName: source.name,
          chunkId: chunk.id,
          heading: chunk.heading,
          summary: chunk.summary,
          text: chunk.sentences?.join(' ') || chunk.summary,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
        });
      }
    } else {
      // Legacy sections: parse "section-{index}"
      const sectionMatch = parsed.chunkId.match(/^section-(\d+)$/);
      if (!sectionMatch) continue;

      const sectionIndex = parseInt(sectionMatch[1], 10);
      const sections = source.extractedContent?.sections || [];
      if (sectionIndex >= 0 && sectionIndex < sections.length) {
        const section = sections[sectionIndex];
        resolved.push({
          sourceId: source.id,
          sourceName: source.name,
          chunkId: parsed.chunkId,
          heading: section.title || 'Untitled',
          summary: section.content?.substring(0, 200) || '',
          text: section.content || '',
        });
      }
    }
  }

  return resolved;
}

/**
 * Format resolved chunks into a context string for LLM prompts.
 * Each chunk is labelled with its ref ID so the generation LLM can
 * report which chunks it actually used per example (`used_sources`).
 */
export function buildChunkContextSection(chunks: ResolvedChunk[]): string {
  if (chunks.length === 0) return '';

  const parts: string[] = [
    '\n--- RELEVANT KNOWLEDGE (topic-specific) ---',
  ];

  for (const chunk of chunks) {
    const ref = `${chunk.sourceId}:${chunk.chunkId}`;
    parts.push(`\n[ref:${ref} | ${chunk.sourceName} / ${chunk.heading}]\n${chunk.text}`);
  }

  parts.push('\n--- END RELEVANT KNOWLEDGE ---');
  parts.push('IMPORTANT: Generate examples grounded in the specific knowledge sections above.');
  parts.push('For each example, include the ref IDs (e.g. "sourceId:chunkId") of the chunks you referenced in the `used_sources` array.');

  return parts.join('\n');
}
