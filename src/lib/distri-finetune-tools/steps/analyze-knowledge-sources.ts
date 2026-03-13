/**
 * Analyze Knowledge Sources Tool
 *
 * Pure data-access tool — returns extracted knowledge source metadata
 * from IndexedDB. No LLM calls.
 *
 * Lucy uses this to check what knowledge sources exist, then calls
 * suggest_topics to get a topic hierarchy (which handles document-grounding
 * internally), then constructs a plan with propose_plan.
 */

import type { DistriFnTool } from '@distri/core';
import { datasetService, knowledgeSourceService } from '@/services/service-registry';
import type { ToolHandler } from '../types';

// =============================================================================
// Types
// =============================================================================

interface AnalyzeKnowledgeSourcesParams {
  workflow_id: string;
}

interface ChunkInfo {
  id: string;
  /** Composite ref for topic→chunk linking: "sourceId:chunkId" */
  ref: string;
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
  sections?: { title: string; content_preview: string; ref: string }[];
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
    const { workflow_id } = params as unknown as AnalyzeKnowledgeSourcesParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    // Get dataset
    const dataset = await datasetService.getById(workflow_id);
    if (!dataset) {
      return { success: false, error: `Dataset ${workflow_id} not found` };
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

    // Get knowledge sources from backend (all sources from BE are ready)
    const sources = await knowledgeSourceService.list(workflow_id);

    // No knowledge sources
    if (sources.length === 0) {
      return {
        success: true,
        objective,
        source_count: 0,
        message: 'No knowledge sources uploaded.',
      };
    }

    // Extract data from knowledge sources
    const knowledgeSources: KnowledgeSourceInfo[] = sources.map((source) => {
      const metadata = source.metadata;
      const textParts = source.parts.filter(p => p.type === 'text');
      const topics = textParts
        .map(p => p.title)
        .filter((t): t is string => Boolean(t));

      return {
        name: source.name,
        type: 'document',
        extraction_method: 'backend',
        comment: source.description,
        document_type: (metadata?.document_type as string) || '',
        summary: (metadata?.document_summary as string) || (metadata?.documentSummary as string) || '',
        sections: textParts.slice(0, 15).map((p, i) => ({
          title: p.title || 'Untitled',
          content_preview: p.content?.substring(0, 200) || '',
          ref: `${source.id}:${p.id || `part-${i}`}`,
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
      source_count: sources.length,
      knowledge_sources: knowledgeSources,
      document_sections: allSectionHeadings,
      message: `Found ${sources.length} knowledge source(s) with ${allSectionHeadings.length} document section headings.`,
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
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to analyze',
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await analyzeKnowledgeSourcesHandler(input as Record<string, unknown>)),
} as DistriFnTool;
