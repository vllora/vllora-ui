/**
 * Chunk Lookup Utility
 *
 * Resolves composite "sourceId:chunkId" refs (produced by topic generation)
 * back to actual chunk content from knowledge sources. Used during data
 * generation to send only topic-relevant context to the LLM.
 */

import * as knowledgeDB from '@/services/knowledge-sources-db';
import type { KnowledgeSource } from '@/types/dataset-types';

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
 */
export function parseChunkRef(ref: string): { sourceId: string; chunkId: string } | null {
  // Strip "ref:" prefix if present (added by knowledge context formatting)
  const cleaned = ref.startsWith('ref:') ? ref.substring(4) : ref;
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx <= 0 || colonIdx === cleaned.length - 1) return null;
  return {
    sourceId: cleaned.substring(0, colonIdx),
    chunkId: cleaned.substring(colonIdx + 1),
  };
}

/**
 * Resolve an array of composite chunk refs to their full content.
 *
 * - For `local-semantic` sources: looks up chunks from `metadata.chunks` by chunk ID
 * - For legacy sources: parses `section-{index}` and indexes into `extractedContent.sections`
 * - Unknown refs are silently skipped (graceful degradation)
 */
export async function resolveChunkRefs(
  datasetId: string,
  refs: string[],
): Promise<ResolvedChunk[]> {
  if (refs.length === 0) return [];

  const sources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);
  const sourceMap = new Map<string, KnowledgeSource>();
  for (const s of sources) {
    if (s.status === 'ready') sourceMap.set(s.id, s);
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
 */
export function buildChunkContextSection(chunks: ResolvedChunk[]): string {
  if (chunks.length === 0) return '';

  const parts: string[] = [
    '\n--- RELEVANT KNOWLEDGE (topic-specific) ---',
  ];

  for (const chunk of chunks) {
    parts.push(`\n[${chunk.sourceName} / ${chunk.heading}]\n${chunk.text}`);
  }

  parts.push('\n--- END RELEVANT KNOWLEDGE ---');
  parts.push('IMPORTANT: Generate examples grounded in the specific knowledge sections above.');

  return parts.join('\n');
}
