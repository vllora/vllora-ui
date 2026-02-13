/**
 * Analyze Knowledge Sources Tool
 *
 * Pure data-access tool — returns extracted knowledge source metadata
 * from IndexedDB. No LLM calls.
 *
 * Lucy uses this to check what knowledge sources exist, then calls
 * generate_topics to get a topic hierarchy (which handles document-grounding
 * internally), then constructs a plan with propose_setup_plan.
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

interface KnowledgeSourceInfo {
  name: string;
  type: string;
  document_type: string;
  summary: string;
  topics_extracted: string[];
  sections: { title: string; content_preview: string }[];
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
  /** All extracted topics across all sources (deduplicated) */
  all_topics?: string[];
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
        error: `${statusMessage} STOP: Do NOT call this tool again. Tell the user their documents are still being processed (usually 30-60 seconds per document) and that you will create the setup plan once processing is complete. The frontend will notify you when documents are ready.`,
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
      const topics = extracted?.topics || [];
      const sections = ((extracted?.sections || []) as ExtractedSection[]).slice(0, 15);
      const metadata = extracted?.metadata as Record<string, unknown> | undefined;

      return {
        name: source.name,
        type: source.type || 'unknown',
        document_type: (metadata?.document_type as string) || '',
        summary: (metadata?.document_summary as string) || '',
        topics_extracted: topics,
        sections: sections.map((s) => ({
          title: s.title || 'Untitled',
          content_preview: s.content?.substring(0, 200) || '',
        })),
      };
    });

    // Collect all unique topics
    const allTopics = [...new Set(knowledgeSources.flatMap((s) => s.topics_extracted))];

    console.log('[analyzeKnowledgeSources] Extracted:', {
      sources: knowledgeSources.length,
      totalTopics: allTopics.length,
    });

    return {
      success: true,
      objective,
      source_count: readySources.length,
      knowledge_sources: knowledgeSources,
      all_topics: allTopics,
      message: `Found ${readySources.length} knowledge source(s) with ${allTopics.length} extracted topics.`,
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

Returns per-source: document name, type, summary, extracted topics, section previews.
Also returns the training objective and a flat list of all extracted topics.

This is a pure data-access tool (no LLM calls). Use it to understand what documents exist before deciding next steps.`,
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
