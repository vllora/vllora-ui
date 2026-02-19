/**
 * Analyze Knowledge Sources Tool
 *
 * Pure data-access tool — returns extracted knowledge source metadata
 * from IndexedDB. No LLM calls.
 *
 * Lucy uses this to check what knowledge sources exist, then calls
 * generate_topics to get a topic hierarchy (which handles document-grounding
 * internally), then constructs a plan with propose_plan.
 */

import type { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';
import type { ToolHandler } from '../types';
import { type ExtractedSection } from './shared/knowledge-context';
import * as knowledgeDB from '@/services/knowledge-sources-db';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Types
// =============================================================================

interface AnalyzeKnowledgeSourcesParams {
  dataset_id: string;
}

interface ChunkInfo {
  id: string;
  heading: string;
  pages: string;
}

interface KnowledgeSourceInfo {
  name: string;
  type: string;
  extraction_method: string;
  /** 'basic' = Phase 1 embedding chunks, 'enhanced' = Phase 2 LLM-restructured */
  extraction_phase?: string;
  comment?: string;
  document_type: string;
  summary: string;
  total_pages?: number;
  total_chunks?: number;
  /** Chunk-level structure (for local-semantic extraction) */
  chunks?: ChunkInfo[];
  /** Legacy section-level structure (for LLM extraction) */
  sections?: { title: string; content_preview: string }[];
  section_headings: string[];
}

interface AnalyzeKnowledgeSourcesResult {
  success: boolean;
  error?: string;
  /** Training objective from the dataset */
  objective?: string;
  /** Number of ready knowledge sources */
  source_count?: number;
  /** Detailed info per knowledge source */
  knowledge_sources?: KnowledgeSourceInfo[];
  /** All document section headings across all sources (deduplicated) */
  document_sections?: string[];
  /** True if knowledge sources exist but are still processing */
  sources_processing?: boolean;
  message?: string;
}

// =============================================================================
// Handler
// =============================================================================

export const analyzeKnowledgeSourcesHandler: ToolHandler = async (
  params
): Promise<AnalyzeKnowledgeSourcesResult> => {
  try {
    const { dataset_id } = params as unknown as AnalyzeKnowledgeSourcesParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    // Get dataset
    const dataset = await datasetsDB.getDatasetById(dataset_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${dataset_id} not found` };
    }

    // Get training objective
    const objective = dataset.datasetObjective;
    if (!objective || !objective.trim()) {
      return {
        success: false,
        error: 'Dataset has no training objective. Please set a training objective first.',
        message: 'Before I can analyze knowledge sources, I need to know what you want to train the model to do. Could you describe your training objective?',
      };
    }

    // Check knowledge source status
    const sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);
    const readySources = sources.filter((s) => s.status === 'ready');
    const processingSources = sources.filter((s) => s.status === 'processing');

    // If ANY documents are still processing, wait for ALL to complete
    if (processingSources.length > 0) {
      const total = readySources.length + processingSources.length;
      const statusMessage = readySources.length === 0
        ? `${processingSources.length} document(s) are still processing.`
        : `${readySources.length} of ${total} document(s) are ready, ${processingSources.length} still processing.`;

      // Signal the UI to auto-prompt Lucy when processing completes
      emitter.emit('vllora_docs_awaiting_plan', { datasetId: dataset_id });

      return {
        success: false,
        sources_processing: true,
        error: `${statusMessage} STOP: Do NOT call this tool again. Tell the user their documents are still being processed (usually 30-60 seconds per document) and that you will create the plan once processing is complete. The frontend will notify you when documents are ready.`,
      };
    }

    // No knowledge sources
    if (readySources.length === 0) {
      return {
        success: true,
        objective,
        source_count: 0,
        message: 'No knowledge sources uploaded.',
      };
    }

    // Extract data from knowledge sources (pure IndexedDB read)
    console.log('[analyzeKnowledgeSources] Extracting data from', readySources.length, 'knowledge sources');

    const knowledgeSources: KnowledgeSourceInfo[] = readySources.map((source) => {
      const extracted = source.extractedContent;
      const topics = extracted?.sectionHeadings || [];
      const metadata = extracted?.metadata as Record<string, unknown> | undefined;
      const extractionMethod = (metadata?.extractionMethod as string) || 'unknown';

      // Local-semantic extraction: use chunk structure
      if (extractionMethod === 'local-semantic') {
        const chunks = (metadata?.chunks as Array<{
          id: string;
          heading: string;
          summary: string;
          sentences: string[];
          pageStart: number;
          pageEnd: number;
        }>) || [];
        const totalPages = (metadata?.totalPages as number) || 0;
        const totalChunks = (metadata?.totalChunks as number) || chunks.length;

        // Build first chunk's summary as overall document summary
        const overallSummary = chunks.length > 0
          ? chunks[0].summary
          : '';

        return {
          name: source.name,
          type: source.type || 'unknown',
          extraction_method: extractionMethod,
          extraction_phase: source.extractionPhase || (metadata?.extractionPhase as string) || 'basic',
          comment: source.comment,
          document_type: 'pdf',
          summary: overallSummary,
          total_pages: totalPages,
          total_chunks: totalChunks,
          chunks: chunks.map((c) => {
            const pageRange = c.pageStart === c.pageEnd
              ? `${c.pageStart}`
              : `${c.pageStart}–${c.pageEnd}`;
            return {
              id: c.id,
              heading: c.heading,
              pages: pageRange,
            };
          }),
          section_headings: topics,
        };
      }

      // LLM extraction: use legacy sections format
      const sections = ((extracted?.sections || []) as ExtractedSection[]).slice(0, 15);

      return {
        name: source.name,
        type: source.type || 'unknown',
        extraction_method: extractionMethod,
        extraction_phase: source.extractionPhase || (metadata?.extractionPhase as string) || undefined,
        comment: source.comment,
        document_type: (metadata?.document_type as string) || '',
        summary: (metadata?.document_summary as string) || (metadata?.documentSummary as string) || '',
        sections: sections.map((s) => ({
          title: s.title || 'Untitled',
          content_preview: s.content?.substring(0, 200) || '',
        })),
        section_headings: topics,
      };
    });

    // Collect all unique section headings
    const allSectionHeadings = [...new Set(knowledgeSources.flatMap((s) => s.section_headings))];

    console.log('[analyzeKnowledgeSources] Extracted:', {
      sources: knowledgeSources.length,
      totalSectionHeadings: allSectionHeadings.length,
    });

    return {
      success: true,
      objective,
      source_count: readySources.length,
      knowledge_sources: knowledgeSources,
      document_sections: allSectionHeadings,
      message: `Found ${readySources.length} knowledge source(s) with ${allSectionHeadings.length} document section headings.`,
    };
  } catch (error) {
    console.error('[analyzeKnowledgeSources] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze knowledge sources',
    };
  }
};

// =============================================================================
// Tool Definition
// =============================================================================

export const analyzeKnowledgeSourcesTool: DistriFnTool = {
  name: 'analyze_knowledge_sources',
  description: `Check what knowledge sources are uploaded for a dataset.

Returns a lightweight overview per source:
- Document name, type, user comment/objective, summary, total pages/chunks
- Chunk table of contents: heading + page range per chunk (no full text)
- Extracted topics

This is a quick overview tool. To read actual chunk content or search for specific topics, use search_knowledge instead.

Pure data-access (no LLM calls). Call once to understand what's available, then proceed.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to analyze',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await analyzeKnowledgeSourcesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
