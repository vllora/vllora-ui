/**
 * Shared Knowledge Context Builder
 *
 * Provides common functionality for extracting and formatting
 * knowledge source context for LLM-based topic generation.
 *
 * Used by:
 * - propose-setup-plan (for plan generation)
 * - generate-topics (for topic hierarchy generation)
 */

import * as knowledgeDB from '@/services/knowledge-sources-db';
import type { FileContentBlock } from './lucy-client';
import type { KnowledgeSource } from '@/types/dataset-types';

export interface KnowledgeSourceContext {
  /** Formatted context string for LLM prompts */
  contextString: string;
  /** Summary of sources for plan display */
  sourcesSummary: Array<{ name: string; topics_extracted: string[] }>;
  /** All extracted topics (flat list, deduplicated) */
  allTopics: string[];
  /** Number of ready sources */
  readyCount: number;
  /** Number of processing sources */
  processingCount: number;
}

export interface ExtractedSection {
  title: string;
  content: string;
  level: number;
}

/**
 * Build rich knowledge context from all knowledge sources for a dataset.
 * This context emphasizes document-derived topics and sections.
 */
export async function buildKnowledgeContext(
  datasetId: string
): Promise<KnowledgeSourceContext> {
  const sources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);
  const readySources = sources.filter((s) => s.status === 'ready');
  const processingSources = sources.filter((s) => s.status === 'processing');

  const sourcesSummary: Array<{ name: string; topics_extracted: string[] }> = [];
  const allTopics: string[] = [];
  const contextParts: string[] = [];

  for (const source of readySources) {
    const extracted = source.extractedContent;
    const topics = extracted?.topics || [];
    const sections = (extracted?.sections || []) as ExtractedSection[];
    // Check metadata for additional info from LLM extraction
    const metadata = extracted?.metadata as Record<string, unknown> | undefined;
    const summary = (metadata?.document_summary as string) || '';
    const docType = (metadata?.document_type as string) || '';

    sourcesSummary.push({
      name: source.name,
      topics_extracted: topics,
    });
    allTopics.push(...topics);

    // Build rich context that emphasizes document structure
    const sourceParts: string[] = [`## Document: ${source.name}`];

    if (docType) {
      sourceParts.push(`Type: ${docType}`);
    }

    if (summary) {
      sourceParts.push(`Summary: ${summary}`);
    }

    if (topics.length > 0) {
      sourceParts.push(
        `\n### Extracted Topics (USE THESE FOR TOPIC GENERATION):\n${topics.map((t) => `- ${t}`).join('\n')}`
      );
    }

    if (sections.length > 0) {
      sourceParts.push(`\n### Document Sections (USE THESE FOR TOPIC GENERATION):`);
      for (const section of sections.slice(0, 10)) {
        const sectionTitle = section.title || 'Untitled';
        const contentPreview = section.content?.substring(0, 150) || '';
        sourceParts.push(
          `- **${sectionTitle}**: ${contentPreview}${contentPreview.length >= 150 ? '...' : ''}`
        );
      }
      if (sections.length > 10) {
        sourceParts.push(`  ...and ${sections.length - 10} more sections`);
      }
    }

    contextParts.push(sourceParts.join('\n'));
  }

  // Deduplicate topics
  const uniqueTopics = [...new Set(allTopics)];

  return {
    contextString: contextParts.length > 0 ? contextParts.join('\n\n---\n\n') : '',
    sourcesSummary,
    allTopics: uniqueTopics,
    readyCount: readySources.length,
    processingCount: processingSources.length,
  };
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

/**
 * Wrap knowledge context with appropriate instructions for topic generation.
 * Handles both cases: with documents and without documents.
 */
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
  sourcesSummary: Array<{ name: string; topics_extracted: string[] }>;
  /** Number of ready sources */
  readyCount: number;
  /** Number of processing sources */
  processingCount: number;
}

/**
 * Infer MIME type from a KnowledgeSource.
 * Uses mimeType if available, otherwise infers from source type.
 */
function inferMimeType(source: KnowledgeSource): string {
  if (source.mimeType) return source.mimeType;

  switch (source.type) {
    case 'pdf':
      return 'application/pdf';
    case 'text':
      return 'text/plain';
    case 'markdown':
      return 'text/markdown';
    case 'image':
      return 'image/png'; // default; mimeType field should have the real type
    default:
      return 'application/octet-stream';
  }
}

/**
 * Build native file content blocks from all knowledge sources for a dataset.
 *
 * For every source that has raw base64 content (stored in `source.content`),
 * a file content block is produced so the LLM can see the actual document.
 *
 * Also returns the text excerpt context (from `buildKnowledgeContext`) so
 * callers can fall back to excerpts for subsequent batches.
 */
export async function buildKnowledgeContentBlocks(
  datasetId: string,
): Promise<KnowledgeContentBlocks> {
  const sources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);
  const readySources = sources.filter((s) => s.status === 'ready');
  const processingSources = sources.filter((s) => s.status === 'processing');

  const fileBlocks: FileContentBlock[] = [];
  const sourcesSummary: Array<{ name: string; topics_extracted: string[] }> = [];

  for (const source of readySources) {
    const topics = source.extractedContent?.topics || [];
    sourcesSummary.push({ name: source.name, topics_extracted: topics });

    // Build file content block if raw base64 content is available
    if (source.content && source.content.length <= MAX_FILE_BASE64_SIZE) {
      const mimeType = inferMimeType(source);
      fileBlocks.push({
        type: 'file',
        file: {
          filename: source.name,
          file_data: `data:${mimeType};base64,${source.content}`,
        },
      });
      console.log(
        `[knowledge-context] File block for "${source.name}" (${mimeType}, ${(source.content.length / 1024).toFixed(0)} KB base64)`,
      );
    } else if (source.content && source.content.length > MAX_FILE_BASE64_SIZE) {
      console.warn(
        `[knowledge-context] Skipping file block for "${source.name}": base64 size ${(source.content.length / (1024 * 1024)).toFixed(1)} MB exceeds 20 MB limit`,
      );
    }
  }

  // Also build the text excerpt context for fallback / subsequent batches
  const textCtx = await buildKnowledgeContext(datasetId);

  return {
    fileBlocks,
    textExcerptContext: textCtx.contextString,
    hasFileBlocks: fileBlocks.length > 0,
    sourcesSummary,
    readyCount: readySources.length,
    processingCount: processingSources.length,
  };
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
