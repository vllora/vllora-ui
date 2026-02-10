/**
 * Knowledge Source Tools
 *
 * Tools for managing knowledge sources used in data generation.
 * Supports PDFs, images, URLs, and text content.
 */

import type { DistriFnTool } from '@distri/core';
import * as knowledgeDB from '@/services/knowledge-sources-db';
import type { ToolHandler } from '../types';
import type { KnowledgeSourceType, ExtractedContent } from '@/types/dataset-types';
import { extractPdfContent } from './pdf-extractor';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Content Extraction
// =============================================================================

/**
 * Extract content from a knowledge source
 * - PDF: Uses pdfjs-dist for client-side text extraction with section detection
 *        Supports 'llm' mode (default) for better quality or 'basic' for speed
 * - Text: Parses markdown-style headings and structures content
 * - Image: Placeholder (requires Vision API integration)
 * - URL: Placeholder (would fetch and parse HTML)
 */
async function extractContent(
  type: KnowledgeSourceType,
  content: string,
  _name: string,
  extractionMode: 'basic' | 'llm' = 'llm'
): Promise<ExtractedContent> {

  if (type === 'text') {
    // For plain text, just structure it
    const lines = content.split('\n').filter((l) => l.trim());
    const sections = [];
    let currentSection = { title: 'Content', content: '', level: 1 };

    for (const line of lines) {
      // Simple heuristic: lines starting with # are headers
      if (line.startsWith('#')) {
        if (currentSection.content) {
          sections.push({ ...currentSection });
        }
        const level = line.match(/^#+/)?.[0].length || 1;
        currentSection = {
          title: line.replace(/^#+\s*/, ''),
          content: '',
          level,
        };
      } else {
        currentSection.content += line + '\n';
      }
    }

    if (currentSection.content) {
      sections.push(currentSection);
    }

    return {
      text: content,
      sections,
      topics: [], // Would be extracted by LLM
    };
  }

  if (type === 'url') {
    // For URLs, we'd fetch and parse
    return {
      text: `Content from URL: ${content}`,
      sections: [{ title: 'Web Content', content: 'URL content would be fetched here', level: 1 }],
      topics: [],
    };
  }

  if (type === 'pdf') {
    // Use pdfjs-dist for client-side PDF text extraction
    try {
      const pdfResult = await extractPdfContent(content, { extractionMode });
      return {
        text: pdfResult.text,
        sections: pdfResult.sections,
        topics: pdfResult.topics,
        metadata: {
          ...pdfResult.metadata,
          type: 'pdf',
        },
      };
    } catch (error) {
      console.error('[extractContent] PDF extraction failed:', error);
      // Fall back to placeholder if extraction fails
      return {
        text: `[PDF content - extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}]`,
        sections: [],
        topics: [],
        metadata: {
          type: 'pdf',
          error: error instanceof Error ? error.message : 'Extraction failed',
        },
      };
    }
  }

  // For image, return placeholder (requires Vision API)
  return {
    text: `[${type.toUpperCase()} content - extraction would happen here]`,
    sections: [],
    topics: [],
    metadata: {
      type,
      note: 'Image extraction requires Vision API integration',
    },
  };
}

// =============================================================================
// Tool Handlers
// =============================================================================

interface UploadKnowledgeSourceParams {
  dataset_id: string;
  name: string;
  type: KnowledgeSourceType;
  content: string;
  mime_type?: string;
  /**
   * Extraction mode for PDFs:
   * - 'llm': LLM-assisted extraction for better quality (default)
   * - 'basic': Fast, regex-based extraction
   */
  extraction_mode?: 'basic' | 'llm';
}

export const uploadKnowledgeSourceHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id, name, type, content, mime_type, extraction_mode = 'llm' } = params as unknown as UploadKnowledgeSourceParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    if (!name || !type || !content) {
      return { success: false, error: 'name, type, and content are required' };
    }

    // Create the knowledge source
    const source = await knowledgeDB.createKnowledgeSource(dataset_id, name, type, {
      content,
      mimeType: mime_type,
      size: content.length,
    });

    // Update status to processing
    await knowledgeDB.updateKnowledgeSourceStatus(source.id, 'processing');

    // Extract content in background (non-blocking)
    // This allows the UI to proceed immediately while extraction happens async
    processExtractionInBackground(source.id, dataset_id, type, content, name, extraction_mode);

    // Return immediately with 'processing' status
    return {
      success: true,
      source_id: source.id,
      name: source.name,
      type: source.type,
      status: 'processing',
      message: 'Knowledge source created. Content extraction is processing in the background.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload knowledge source',
    };
  }
};

/**
 * Process content extraction in background (fire-and-forget)
 * Updates the knowledge source status when complete and emits event for UI refresh
 */
async function processExtractionInBackground(
  sourceId: string,
  datasetId: string,
  type: KnowledgeSourceType,
  content: string,
  name: string,
  extractionMode: 'basic' | 'llm'
): Promise<void> {
  try {
    console.log(`[processExtractionInBackground] Starting extraction for ${sourceId}`);
    const extractedContent = await extractContent(type, content, name, extractionMode);
    await knowledgeDB.updateKnowledgeSourceStatus(sourceId, 'ready', { extractedContent });
    console.log(`[processExtractionInBackground] Extraction complete for ${sourceId}`);
    // Emit event to notify UI of status change
    emitter.emit('vllora_knowledge_source_updated', { datasetId });
  } catch (error) {
    console.error(`[processExtractionInBackground] Extraction failed for ${sourceId}:`, error);
    await knowledgeDB.updateKnowledgeSourceStatus(sourceId, 'failed', {
      error: error instanceof Error ? error.message : 'Extraction failed',
    });
    // Also emit event on failure so UI can show the failed state
    emitter.emit('vllora_knowledge_source_updated', { datasetId });
  }
}

interface ListKnowledgeSourcesParams {
  dataset_id: string;
}

export const listKnowledgeSourcesHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id } = params as unknown as ListKnowledgeSourcesParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    const sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);

    return {
      success: true,
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        status: s.status,
        created_at: s.createdAt,
        processed_at: s.processedAt,
        section_count: s.extractedContent?.sections?.length || 0,
        topic_count: s.extractedContent?.topics?.length || 0,
        error: s.error,
      })),
      total: sources.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list knowledge sources',
    };
  }
};

interface ExtractTopicsParams {
  dataset_id: string;
  source_id?: string;
}

export const extractTopicsFromSourceHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id, source_id } = params as unknown as ExtractTopicsParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    let sources;
    if (source_id) {
      const source = await knowledgeDB.getKnowledgeSource(source_id);
      sources = source ? [source] : [];
    } else {
      sources = await knowledgeDB.getKnowledgeSourcesByDataset(dataset_id);
    }

    const allTopics: string[] = [];
    const sourceTopics: Record<string, string[]> = {};

    for (const source of sources) {
      if (source.status === 'ready' && source.extractedContent?.topics) {
        sourceTopics[source.name] = source.extractedContent.topics;
        allTopics.push(...source.extractedContent.topics);
      }
    }

    // Deduplicate topics
    const uniqueTopics = [...new Set(allTopics)];

    return {
      success: true,
      topics: uniqueTopics,
      by_source: sourceTopics,
      total_sources: sources.length,
      ready_sources: sources.filter((s) => s.status === 'ready').length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract topics',
    };
  }
};

interface SearchKnowledgeParams {
  dataset_id: string;
  query: string;
  max_results?: number;
}

export const searchKnowledgeHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id, query, max_results = 10 } = params as unknown as SearchKnowledgeParams;

    if (!dataset_id) {
      return { success: false, error: 'dataset_id is required' };
    }

    if (!query) {
      return { success: false, error: 'query is required' };
    }

    const results = await knowledgeDB.searchKnowledgeSources(dataset_id, query);

    return {
      success: true,
      query,
      results: results.slice(0, max_results).map((r) => ({
        source_id: r.source.id,
        source_name: r.source.name,
        source_type: r.source.type,
        matches: r.matches,
      })),
      total_matches: results.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search knowledge sources',
    };
  }
};

// =============================================================================
// Tool Definitions
// =============================================================================

export const uploadKnowledgeSourceTool: DistriFnTool = {
  name: 'upload_knowledge_source',
  description: `Upload a knowledge source to use for grounded data generation.

Use this tool when:
- User wants to upload a document (PDF, text) for reference
- User provides a URL to use as knowledge base
- User wants to add context for data generation

Supported types:
- pdf: PDF documents (chess books, manuals, documentation)
- image: Images (chess positions, diagrams, screenshots)
- url: Web URLs (documentation sites, reference pages)
- text: Plain text content

The content will be extracted and indexed for use in data generation.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to associate this knowledge source with',
      },
      name: {
        type: 'string',
        description: 'Name/filename of the knowledge source',
      },
      type: {
        type: 'string',
        enum: ['pdf', 'image', 'url', 'text'],
        description: 'Type of knowledge source',
      },
      content: {
        type: 'string',
        description: 'The content: base64-encoded data for files, URL string for urls, or plain text',
      },
      mime_type: {
        type: 'string',
        description: 'MIME type of the content (optional)',
      },
      extraction_mode: {
        type: 'string',
        enum: ['llm', 'basic'],
        default: 'llm',
        description: 'Extraction mode for PDFs: "llm" for LLM-assisted high-quality extraction (default), "basic" for fast regex-based extraction',
      },
    },
    required: ['dataset_id', 'name', 'type', 'content'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await uploadKnowledgeSourceHandler(input as Record<string, unknown>)),
} as DistriFnTool;

export const listKnowledgeSourcesTool: DistriFnTool = {
  name: 'list_knowledge_sources',
  description: `List all knowledge sources for a dataset.

Returns a list of uploaded knowledge sources with their processing status,
extracted topics, and section counts.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to list knowledge sources for',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await listKnowledgeSourcesHandler(input as Record<string, unknown>)),
} as DistriFnTool;

export const extractTopicsFromSourceTool: DistriFnTool = {
  name: 'extract_topics_from_source',
  description: `Extract topics/concepts from knowledge sources.

Use this tool to:
- Get a list of topics covered by uploaded knowledge sources
- Suggest topic hierarchy based on source content
- Identify what concepts can be used for data generation

If source_id is not provided, extracts from all sources for the dataset.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      source_id: {
        type: 'string',
        description: 'Optional: specific source ID to extract from',
      },
    },
    required: ['dataset_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await extractTopicsFromSourceHandler(input as Record<string, unknown>)),
} as DistriFnTool;

export const searchKnowledgeTool: DistriFnTool = {
  name: 'search_knowledge',
  description: `Search across indexed knowledge sources for specific content.

Use this tool to:
- Find relevant content for a topic
- Ground data generation in source material
- Verify facts against uploaded sources

Returns matching passages from knowledge sources.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to search within',
      },
      query: {
        type: 'string',
        description: 'Search query (concept, topic, or phrase to find)',
      },
      max_results: {
        type: 'number',
        default: 10,
        description: 'Maximum number of results to return (default: 10)',
      },
    },
    required: ['dataset_id', 'query'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await searchKnowledgeHandler(input as Record<string, unknown>)),
} as DistriFnTool;

// Export all tools
export const knowledgeSourceTools = [
  uploadKnowledgeSourceTool,
  listKnowledgeSourcesTool,
  extractTopicsFromSourceTool,
  searchKnowledgeTool,
];
