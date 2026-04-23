/**
 * Shared Knowledge Context Builder
 *
 * Provides common functionality for extracting and formatting
 * knowledge source context for LLM-based topic generation.
 *
 * Used by:
 * - propose-plan (for plan generation)
 * - generate-topics (for topic hierarchy generation)
 */

import { knowledgeSourceService } from '@/services/service-registry';
import type { FileContentBlock } from './lucy-client';
import type { KnowledgeSource } from '@/types/knowledge-types';

export interface KnowledgeSourceContext {
  /** Formatted context string for LLM prompts */
  contextString: string;
  /** Summary of sources for plan display */
  sourcesSummary: Array<{ name: string; section_headings: string[] }>;
  /** All extracted section headings (flat list, deduplicated) */
  allSectionHeadings: string[];
  /** Number of ready sources */
  readyCount: number;
  /** Number of processing sources (always 0 in skill-first mode) */
  processingCount: number;
  /** All valid chunk refs (sourceId:partId) for validation and fallback */
  validRefs: Set<string>;
  /** Map heading (lowercase) → refs for heading-based topic→chunk fallback */
  headingToRefs: Map<string, string[]>;
  /** Map ref → summary text for summary-based topic→chunk fallback */
  summaryMap: Map<string, string>;
}

export interface ExtractedSection {
  title: string;
  content: string;
  level: number;
}

/**
 * Build rich knowledge context from pre-fetched knowledge sources.
 * Core implementation — avoids redundant API calls so callers can reuse a single fetch.
 */
export function buildKnowledgeContextFromSources(
  allSources: readonly KnowledgeSource[],
): KnowledgeSourceContext {
  // In skill-first mode all sources are ready (no processing state)
  const readySources = allSources;

  const sourcesSummary: Array<{ name: string; section_headings: string[] }> = [];
  const allSectionHeadings: string[] = [];
  const contextParts: string[] = [];
  const validRefs = new Set<string>();
  const headingToRefs = new Map<string, string[]>();
  const summaryMap = new Map<string, string>();

  for (const source of readySources) {
    const textParts = source.parts.filter(p => p.type === 'text');
    const topics = textParts.map(p => p.title).filter((t): t is string => Boolean(t));
    const metadata = source.metadata as Record<string, unknown> | undefined;
    const extractionMethod = (metadata?.extractionMethod as string) || 'unknown';

    sourcesSummary.push({
      name: source.name,
      section_headings: topics,
    });
    allSectionHeadings.push(...topics);

    // Build rich context that emphasizes document structure
    const sourceParts: string[] = [`## Document: ${source.name}`];

    // Include user description if provided
    if (source.description) {
      sourceParts.push(`User Note: ${source.description}`);
    }

    // Check for semantic chunks in metadata
    const chunks = (metadata?.chunks as Array<{
      id: string;
      heading: string;
      summary: string;
      sentences: string[];
      pageStart: number;
      pageEnd: number;
    }>) || [];

    // --- Local-semantic extraction: use chunk structure ---
    if (extractionMethod === 'local-semantic' && chunks.length > 0) {
      const totalPages = (metadata?.totalPages as number) || 0;

      if (totalPages > 0) {
        sourceParts.push(`Pages: ${totalPages} | Chunks: ${chunks.length}`);
      }

      if (chunks[0].summary) {
        sourceParts.push(`Summary: ${chunks[0].summary}`);
      }

      if (topics.length > 0) {
        sourceParts.push(
          `\n### Document Section Headings:\n${topics.map((t) => `- ${t}`).join('\n')}`
        );
      }

      sourceParts.push(`\n### Document Chunks (semantic sections):`);
      sourceParts.push(`Use ref format "sourceId:chunkId" in source_chunks (e.g. "${source.id}:${chunks[0].id}")`);
      for (const chunk of chunks) {
        const ref = `${source.id}:${chunk.id}`;
        validRefs.add(ref);
        const headingKey = chunk.heading.toLowerCase().trim();
        if (!headingToRefs.has(headingKey)) headingToRefs.set(headingKey, []);
        headingToRefs.get(headingKey)!.push(ref);
        if (chunk.summary) summaryMap.set(ref, chunk.summary.toLowerCase());
        const pageRange = chunk.pageStart === chunk.pageEnd
          ? `p.${chunk.pageStart}`
          : `pp.${chunk.pageStart}–${chunk.pageEnd}`;
        const sentenceCount = chunk.sentences?.length || 0;
        sourceParts.push(
          `- [ref:${ref}] **${chunk.heading}** [${pageRange}, ${sentenceCount} sentences]: ${chunk.summary}`
        );
      }
    } else {
      // --- Parts-based extraction ---
      const docSummary = (metadata?.document_summary as string) || (metadata?.documentSummary as string) || '';
      const docType = (metadata?.document_type as string) || '';

      if (docType) {
        sourceParts.push(`Type: ${docType}`);
      }

      if (docSummary) {
        sourceParts.push(`Summary: ${docSummary}`);
      }

      if (topics.length > 0) {
        sourceParts.push(
          `\n### Document Section Headings:\n${topics.map((t) => `- ${t}`).join('\n')}`
        );
      }

      if (textParts.length > 0) {
        sourceParts.push(`\n### Document Sections (USE THESE FOR TOPIC GENERATION):`);
        sourceParts.push(`Use ref format "sourceId:partId" in source_chunks (e.g. "${source.id}:${textParts[0].id}")`);
        for (let i = 0; i < Math.min(textParts.length, 10); i++) {
          const part = textParts[i];
          const ref = `${source.id}:${part.id}`;
          validRefs.add(ref);
          const partTitle = part.title || 'Untitled';
          const headingKey = partTitle.toLowerCase().trim();
          if (!headingToRefs.has(headingKey)) headingToRefs.set(headingKey, []);
          headingToRefs.get(headingKey)!.push(ref);
          const contentPreview = part.content?.substring(0, 150) || '';
          sourceParts.push(
            `- [ref:${ref}] **${partTitle}**: ${contentPreview}${contentPreview.length >= 150 ? '...' : ''}`
          );
        }
        if (textParts.length > 10) {
          sourceParts.push(`  ...and ${textParts.length - 10} more sections`);
        }
      }
    }

    contextParts.push(sourceParts.join('\n'));
  }

  // Deduplicate section headings
  const uniqueSectionHeadings = [...new Set(allSectionHeadings)];

  return {
    contextString: contextParts.length > 0 ? contextParts.join('\n\n---\n\n') : '',
    sourcesSummary,
    allSectionHeadings: uniqueSectionHeadings,
    readyCount: readySources.length,
    processingCount: 0,
    validRefs,
    headingToRefs,
    summaryMap,
  };
}

/**
 * Build rich knowledge context from all knowledge sources for a dataset.
 * Convenience wrapper that fetches sources then delegates.
 */
export async function buildKnowledgeContext(
  workflowId: string
): Promise<KnowledgeSourceContext> {
  const sources = await knowledgeSourceService.list(workflowId);
  return buildKnowledgeContextFromSources(sources);
}

/**
 * Get the prompt instruction block that emphasizes document-derived topics.
 * Include this in both system and user prompts.
 */
export const DOCUMENT_DERIVED_TOPICS_INSTRUCTION = `## CRITICAL: TOPICS MUST BE DERIVED FROM UPLOADED DOCUMENTS

When knowledge sources are provided:
- **ALWAYS** base your topics on the ACTUAL CONTENT from the documents
- Use the extracted topics and document sections as your primary guide
- DO NOT generate generic topics - they must reflect what's in the documents
- If a document is about a specific subject (e.g., "Progressive Chess"), ALL topics should be about that subject
- Match the terminology, concepts, and sections found in the documents`;

// =============================================================================
// Native File Content Blocks
// =============================================================================

/** Max base64 size for a single file content block (20 MB) */
const MAX_FILE_BASE64_SIZE = 20 * 1024 * 1024;

export interface KnowledgeContentBlocks {
  /** Native file content blocks for LLM multipart messages */
  fileBlocks: FileContentBlock[];
  /** Text excerpt context (fallback for subsequent batches) */
  textExcerptContext: string;
  /** Whether any file blocks were produced */
  hasFileBlocks: boolean;
  /** Summary of sources for plan display */
  sourcesSummary: Array<{ name: string; section_headings: string[] }>;
  /** Number of ready sources */
  readyCount: number;
  /** Number of processing sources (always 0 in skill-first mode) */
  processingCount: number;
}

/**
 * Build native file content blocks from pre-fetched knowledge sources.
 * Core implementation — avoids redundant API calls so callers can reuse a single fetch.
 *
 * In skill-first mode, sources don't carry raw file content (base64).
 * File blocks are only produced if metadata has base64 data.
 */
export function buildContentBlocksFromSources(
  allSources: readonly KnowledgeSource[],
): KnowledgeContentBlocks {
  // All sources from the backend are ready in skill-first mode
  const readySources = allSources;

  const fileBlocks: FileContentBlock[] = [];
  const sourcesSummary: Array<{ name: string; section_headings: string[] }> = [];

  for (const source of readySources) {
    const textParts = source.parts.filter(p => p.type === 'text');
    const sectionHeadings = textParts
      .map(p => p.title)
      .filter((t): t is string => Boolean(t));
    sourcesSummary.push({ name: source.name, section_headings: sectionHeadings });

    // Check metadata for extraction method — skip file blocks for locally-extracted sources
    const metadata = source.metadata as Record<string, unknown> | undefined;
    const extractionMethod = (metadata?.extractionMethod as string) || '';
    if (extractionMethod === 'local-semantic') {
      continue;
    }

    // Check for base64 content in metadata (for sources that carry raw files)
    const rawContent = (metadata?.base64Content as string) || '';
    const mimeType = (metadata?.mimeType as string) || 'application/octet-stream';
    if (rawContent && rawContent.length <= MAX_FILE_BASE64_SIZE) {
      fileBlocks.push({
        type: 'file',
        file: {
          filename: source.name,
          file_data: `data:${mimeType};base64,${rawContent}`,
        },
      });
    }
  }

  // Build text context from the same sources (no extra fetch)
  const textCtx = buildKnowledgeContextFromSources(allSources);

  return {
    fileBlocks,
    textExcerptContext: textCtx.contextString,
    hasFileBlocks: fileBlocks.length > 0,
    sourcesSummary,
    readyCount: readySources.length,
    processingCount: 0,
  };
}

/**
 * Build native file content blocks from all knowledge sources for a dataset.
 * Convenience wrapper that fetches sources then delegates.
 */
export async function buildKnowledgeContentBlocks(
  workflowId: string,
): Promise<KnowledgeContentBlocks> {
  const sources = await knowledgeSourceService.list(workflowId);
  return buildContentBlocksFromSources(sources);
}

export function wrapKnowledgeContextForPrompt(
  knowledgeContext: string,
  hasKnowledgeSources: boolean
): string {
  if (hasKnowledgeSources && knowledgeContext) {
    return `## UPLOADED KNOWLEDGE SOURCES (BASE YOUR TOPICS ON THESE)

${knowledgeContext}

**IMPORTANT**: Your proposed topics MUST be derived from the topics and sections listed above. Do NOT create generic topics - use the SPECIFIC content from these documents.`;
  }
  return `## NO KNOWLEDGE SOURCES UPLOADED

Generate topics based on the training objective above. Create practical, actionable topic categories that:
- Support the stated training goal
- Cover key aspects the model needs to learn
- Are specific enough to generate meaningful training data

Example: For a "customer support assistant" objective, topics might include: handling_complaints, product_inquiries, order_status, refund_requests, technical_support.`;
}
