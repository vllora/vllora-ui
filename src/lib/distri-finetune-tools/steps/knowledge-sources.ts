/**
 * Knowledge Source Tools
 *
 * Tools for managing knowledge sources used in data generation.
 * Knowledge sources are now managed via the backend API (gateway SQLite).
 */

import type { DistriFnTool } from '@distri/core';
import { knowledgeSourceService } from '@/services/service-registry';
import type { ToolHandler } from '../types';

// =============================================================================
// Tool Handlers
// =============================================================================

export const uploadKnowledgeSourceHandler: ToolHandler = async () => {
  return { success: false, error: 'Upload via CLI skill instead' };
};

interface ListKnowledgeSourcesParams {
  workflow_id: string;
}

export const listKnowledgeSourcesHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params as unknown as ListKnowledgeSourcesParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    const sources = await knowledgeSourceService.list(workflow_id);

    return {
      success: true,
      sources: sources.map((s) => {
        const textParts = s.parts.filter(p => p.type === 'text');
        const imageParts = s.parts.filter(p => p.type === 'image');
        const tableParts = s.parts.filter(p => p.type === 'table');
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          part_count: s.parts.length,
          parts_by_type: {
            text: textParts.length,
            image: imageParts.length,
            table: tableParts.length,
          },
          created_at: s.createdAt,
        };
      }),
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
  workflow_id: string;
  source_id?: string;
}

export const extractTopicsFromSourceHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, source_id } = params as unknown as ExtractTopicsParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    const allSources = await knowledgeSourceService.list(workflow_id);
    const sources = source_id
      ? allSources.filter(s => s.id === source_id)
      : allSources;

    const allTopics: string[] = [];
    const sourceTopics: Record<string, string[]> = {};

    for (const source of sources) {
      const titles = source.parts
        .filter(p => p.type === 'text')
        .map(p => p.title)
        .filter((t): t is string => Boolean(t));
      if (titles.length > 0) {
        sourceTopics[source.name] = titles;
        allTopics.push(...titles);
      }
    }

    // Deduplicate topics
    const uniqueTopics = [...new Set(allTopics)];

    return {
      success: true,
      topics: uniqueTopics,
      by_source: sourceTopics,
      total_sources: sources.length,
      ready_sources: sources.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract topics',
    };
  }
};

export const searchKnowledgeHandler: ToolHandler = async () => {
  return { success: false, error: 'Search not available in skill-first mode' };
};

// =============================================================================
// Tool Definitions
// =============================================================================

export const uploadKnowledgeSourceTool: DistriFnTool = {
  name: 'upload_knowledge_source',
  description: `Upload a knowledge source to use for grounded data generation.

Use this tool when:
- User wants to upload a document (PDF, text, markdown) for reference
- User provides a URL to use as knowledge base
- User wants to add context for data generation

Supported types:
- pdf: PDF documents (chess books, manuals, documentation)
- markdown: Markdown files (.md) - can be either:
  * Knowledge sources: Regular markdown content for topics/data generation
  * Process files: Agent definitions or workflow instructions (detected by TOML/YAML frontmatter)
- image: Images (chess positions, diagrams, screenshots)
- url: Web URLs (documentation sites, reference pages)
- text: Plain text content

The content will be extracted and indexed for use in data generation.
For markdown files, the system automatically detects whether it's a knowledge source or a process/agent file.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to associate this knowledge source with',
      },
      name: {
        type: 'string',
        description: 'Name/filename of the knowledge source',
      },
      type: {
        type: 'string',
        enum: ['pdf', 'image', 'url', 'text', 'markdown'],
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
      comment: {
        type: 'string',
        description: 'Optional user comment or objective describing what this document is for and how it should be used',
      },
      extraction_mode: {
        type: 'string',
        enum: ['local', 'llm', 'basic'],
        default: 'llm',
        description: 'Extraction mode for PDFs: "llm" for LLM section extraction with start/end anchors (default, no fallback), "local" for LLM section extraction with embeddings fallback, "basic" for fast regex-based extraction',
      },
    },
    required: ['workflow_id', 'name', 'type', 'content'],
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
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to list knowledge sources for',
      },
    },
    required: ['workflow_id'],
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
      workflow_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      source_id: {
        type: 'string',
        description: 'Optional: specific source ID to extract from',
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await extractTopicsFromSourceHandler(input as Record<string, unknown>)),
} as DistriFnTool;

export const searchKnowledgeTool: DistriFnTool = {
  name: 'search_knowledge',
  description: `Search knowledge sources or fetch a specific chunk's full text.

Two modes:
1. Search mode (provide query): Returns matching chunks with heading, summary, content preview (500 chars), and up to 3 matching sentences. Use this to find relevant content.
2. Fetch mode (provide chunk_id): Returns the full text of a specific chunk. Use this after searching to get complete content for data generation.

Call once per query. Do NOT retry if results seem incomplete.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'The dataset ID to search within',
      },
      query: {
        type: 'string',
        description: 'Search query (concept, topic, or phrase to find). Required unless chunk_id is provided.',
      },
      chunk_id: {
        type: 'string',
        description: 'Fetch full text for a specific chunk (e.g. "chunk-5"). Skips search.',
      },
      max_results: {
        type: 'number',
        default: 5,
        description: 'Maximum number of chunk results to return (default: 5)',
      },
    },
    required: ['workflow_id'],
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
