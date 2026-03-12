/**
 * Knowledge Source Tools
 *
 * Tools for managing knowledge sources used in data generation.
 * Supports PDFs, images, URLs, and text content.
 */

import type { DistriFnTool } from '@distri/core';
import { knowledgeSourceService, datasetService } from '@/services/service-registry';
import type { ToolHandler } from '../types';
import type { KnowledgeSourceType, ExtractedContent, MarkdownPurpose, KnowledgeSourceProgress } from '@/types/dataset-types';
import { extractPdfContentNative, type ExtractionProgressCallback } from './pdf-native-extractor';
import { extractPdfContentLocal } from './semantic-pdf-extractor';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Markdown Classification
// =============================================================================

/**
 * Detect if markdown content is a process/agent file or a knowledge source.
 *
 * Process files typically have TOML/YAML frontmatter with agent-like fields:
 * - name, description, tools, model_settings, sub_agents, etc.
 *
 * Knowledge files are regular markdown content without such frontmatter.
 */
export function classifyMarkdownPurpose(content: string): {
  purpose: MarkdownPurpose;
  frontmatter?: Record<string, unknown>;
  markdownContent: string;
} {
  // Check for TOML frontmatter (---\n...\n---)
  const tomlFrontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (tomlFrontmatterMatch) {
    const frontmatterRaw = tomlFrontmatterMatch[1];
    const markdownContent = tomlFrontmatterMatch[2];

    // Check for agent/process-like fields in frontmatter
    const processIndicators = [
      /^name\s*=/m,           // name = "agent_name"
      /^tools\s*=/m,          // tools.builtin = [...]
      /^\[tools\]/m,          // [tools] section
      /^\[model_settings\]/m, // [model_settings] section
      /^sub_agents\s*=/m,     // sub_agents = [...]
      /^max_iterations\s*=/m, // max_iterations = 30
      /^tool_format\s*=/m,    // tool_format = "provider"
    ];

    const isProcessFile = processIndicators.some(pattern => pattern.test(frontmatterRaw));

    if (isProcessFile) {
      // Parse TOML-like frontmatter (simple key-value extraction)
      const frontmatter: Record<string, unknown> = {};
      const lines = frontmatterRaw.split('\n');

      for (const line of lines) {
        const match = line.match(/^(\w+)\s*=\s*(.+)$/);
        if (match) {
          const key = match[1];
          let value: unknown = match[2].trim();

          // Parse simple types
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (/^\d+$/.test(value as string)) value = parseInt(value as string, 10);
          else if (/^\d+\.\d+$/.test(value as string)) value = parseFloat(value as string);
          else if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
            value = (value as string).slice(1, -1);
          }

          frontmatter[key] = value;
        }
      }

      return {
        purpose: 'process',
        frontmatter,
        markdownContent,
      };
    }
  }

  // Check for YAML frontmatter (also uses --- delimiters but with YAML syntax)
  const yamlFrontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (yamlFrontmatterMatch) {
    const frontmatterRaw = yamlFrontmatterMatch[1];
    const markdownContent = yamlFrontmatterMatch[2];

    // Check for process/workflow YAML indicators
    const processYamlIndicators = [
      /^steps:/m,           // workflow steps
      /^workflow:/m,        // workflow definition
      /^agent:/m,           // agent definition
      /^actions:/m,         // action definitions
      /^execute:/m,         // execution instructions
    ];

    if (processYamlIndicators.some(pattern => pattern.test(frontmatterRaw))) {
      return {
        purpose: 'process',
        frontmatter: { raw: frontmatterRaw },
        markdownContent,
      };
    }
  }

  // No process frontmatter detected - treat as knowledge source
  return {
    purpose: 'knowledge',
    markdownContent: content,
  };
}

// =============================================================================
// Content Extraction
// =============================================================================

/**
 * Extract content from a knowledge source
 * - PDF: Uses native file block LLM call for extraction (no client-side pdfjs)
 * - Text: Parses markdown-style headings and structures content
 * - Image: Placeholder (requires Vision API integration)
 * - URL: Placeholder (would fetch and parse HTML)
 */
/**
 * Extract sections and topics from markdown content.
 * Handles headings, lists, and structured content.
 */
function extractMarkdownSections(content: string): {
  sections: Array<{ title: string; content: string; level: number }>;
  topics: string[];
} {
  const lines = content.split('\n');
  const sections: Array<{ title: string; content: string; level: number }> = [];
  const topics: string[] = [];
  let currentSection = { title: 'Content', content: '', level: 1 };

  for (const line of lines) {
    // Detect headings (# ## ### etc.)
    if (line.startsWith('#')) {
      // Save previous section if it has content
      if (currentSection.content.trim()) {
        sections.push({ ...currentSection, content: currentSection.content.trim() });
      }
      const level = line.match(/^#+/)?.[0].length || 1;
      const title = line.replace(/^#+\s*/, '').trim();
      currentSection = {
        title,
        content: '',
        level,
      };

      // Extract topics from headings (level 1-3 are likely topic-worthy)
      if (level <= 3 && title && !title.match(/^(table of contents|toc|contents|introduction|conclusion|references|bibliography)$/i)) {
        topics.push(title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
      }
    } else {
      currentSection.content += line + '\n';
    }
  }

  // Save last section
  if (currentSection.content.trim()) {
    sections.push({ ...currentSection, content: currentSection.content.trim() });
  }

  // Deduplicate topics
  const uniqueTopics = [...new Set(topics)].filter(t => t.length > 0);

  return { sections, topics: uniqueTopics };
}

/**
 * Decode base64 content to text.
 * Handles both raw base64 and data URI format (e.g., "data:text/markdown;base64,...")
 */
function decodeBase64ToText(content: string): string {
  try {
    // Check if it's a data URI
    const dataUriMatch = content.match(/^data:[^;]+;base64,(.+)$/);
    const base64Content = dataUriMatch ? dataUriMatch[1] : content;

    // Try to decode as base64
    const decoded = atob(base64Content);

    // Check if the decoded content looks like valid text (not binary)
    // Valid text should not have too many control characters
    const controlCharCount = (decoded.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
    if (controlCharCount / decoded.length > 0.1) {
      // Too many control characters - probably not text, return original
      return content;
    }

    return decoded;
  } catch {
    // Not valid base64, return as-is (already plain text)
    return content;
  }
}

/**
 * Check if content appears to be base64-encoded
 */
function isLikelyBase64(content: string): boolean {
  // Data URI format
  if (content.startsWith('data:')) return true;

  // Check if it looks like base64 (only base64 chars, length divisible by 4)
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  if (content.length > 100 && base64Regex.test(content.slice(0, 100))) {
    return true;
  }

  return false;
}

async function extractContent(
  type: KnowledgeSourceType,
  content: string,
  _name: string,
  _extractionMode: 'basic' | 'llm' | 'local' = 'llm',
  onProgress?: ExtractionProgressCallback,
  objective?: string,
  comment?: string,
): Promise<ExtractedContent> {

  // Handle markdown files with dual-purpose detection
  if (type === 'markdown') {
    // Decode base64 if needed (files uploaded via file picker are base64-encoded)
    const textContent = isLikelyBase64(content) ? decodeBase64ToText(content) : content;
    const classification = classifyMarkdownPurpose(textContent);

    if (classification.purpose === 'process') {
      // Process/agent file - extract instructions and metadata
      const { sections, topics } = extractMarkdownSections(classification.markdownContent);

      return {
        text: classification.markdownContent,
        sections,
        sectionHeadings: topics,
        metadata: {
          type: 'markdown',
          purpose: 'process',
          frontmatter: classification.frontmatter,
          isProcessFile: true,
          agentName: classification.frontmatter?.name as string | undefined,
          description: classification.frontmatter?.description as string | undefined,
        },
      };
    } else {
      // Knowledge source markdown - extract sections and topics
      const { sections, topics } = extractMarkdownSections(classification.markdownContent);

      return {
        text: textContent,  // Use decoded text, not base64
        sections,
        sectionHeadings: topics,
        metadata: {
          type: 'markdown',
          purpose: 'knowledge',
          isProcessFile: false,
        },
      };
    }
  }

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
      sectionHeadings: [], // Would be extracted by LLM
    };
  }

  if (type === 'url') {
    // For URLs, we'd fetch and parse
    return {
      text: `Content from URL: ${content}`,
      sections: [{ title: 'Web Content', content: 'URL content would be fetched here', level: 1 }],
      sectionHeadings: [],
    };
  }

  if (type === 'pdf') {
    if (_extractionMode === 'llm') {
      const result = await extractPdfContentLocal(content, _name, {
        onProgress,
        objective,
        comment,
        allowFallback: false,
      });
      return result;
    }
    if (_extractionMode === 'local') {
      const result = await extractPdfContentLocal(content, _name, {
        onProgress,
        objective,
        comment,
        allowFallback: true,
      });
      return result;
    }
    const result = await extractPdfContentNative(content, _name, { onProgress });
    return result;
  }

  // For image, return placeholder (requires Vision API)
  return {
    text: `[${type.toUpperCase()} content - extraction would happen here]`,
    sections: [],
    sectionHeadings: [],
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
  workflow_id: string;
  name: string;
  type: KnowledgeSourceType;
  content: string;
  mime_type?: string;
  /** Optional user comment / objective describing what this document is for */
  comment?: string;
  /**
   * Extraction mode for PDFs:
   * - 'llm': LLM section extraction with start/end anchors (default, no fallback)
   * - 'local': LLM section extraction with embeddings fallback
   * - 'basic': Fast, regex-based extraction
   */
  extraction_mode?: 'basic' | 'llm' | 'local';
}

export const uploadKnowledgeSourceHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, name, type, content, mime_type, comment, extraction_mode = 'llm' } = params as unknown as UploadKnowledgeSourceParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    if (!name || !type || !content) {
      return { success: false, error: 'name, type, and content are required' };
    }

    // Create the knowledge source
    const source = await knowledgeSourceService.create(workflow_id, name, type, {
      content,
      mimeType: mime_type,
      size: content.length,
      comment,
    });

    // Update status to processing
    await knowledgeSourceService.updateStatus(source.id, 'processing');

    // Extract content in background (non-blocking)
    // This allows the UI to proceed immediately while extraction happens async
    processExtractionInBackground(source.id, workflow_id, type, content, name, extraction_mode, comment);

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
  workflowId: string,
  type: KnowledgeSourceType,
  content: string,
  name: string,
  extractionMode: 'basic' | 'llm' | 'local',
  comment?: string,
): Promise<void> {
  try {
    console.log(`[processExtractionInBackground] Starting extraction for ${sourceId}`);

    // Create progress callback that updates DB and emits events
    const onProgress: ExtractionProgressCallback = async (progress) => {
      const progressInfo: KnowledgeSourceProgress = {
        step: progress.step,
        current: progress.current,
        total: progress.total,
        percent: progress.percent,
      };

      // Update progress in DB
      await knowledgeSourceService.updateProgress(sourceId, progressInfo);

      // Emit event to notify UI of progress change
      emitter.emit('vllora_knowledge_source_updated', { workflowId, sourceId, progress: progressInfo });
    };

    // Fetch objective from dataset (for PDF LLM extraction context)
    let objective: string | undefined;
    if (type === 'pdf') {
      const dataset = await datasetService.getById(workflowId);
      objective = dataset?.datasetObjective;
    }

    // Extract content (LLM-primary for PDFs with embeddings fallback)
    const extractedContent = await extractContent(type, content, name, extractionMode, onProgress, objective, comment);
    await knowledgeSourceService.updateStatus(sourceId, 'ready', { extractedContent });
    console.log(`[processExtractionInBackground] Extraction complete for ${sourceId}`);
    // Emit event to notify UI of status change
    emitter.emit('vllora_knowledge_source_updated', { workflowId });
  } catch (error) {
    console.error(`[processExtractionInBackground] Extraction failed for ${sourceId}:`, error);
    await knowledgeSourceService.updateStatus(sourceId, 'failed', {
      error: error instanceof Error ? error.message : 'Extraction failed',
    });
    // Also emit event on failure so UI can show the failed state
    emitter.emit('vllora_knowledge_source_updated', { workflowId });
  }
}

interface ListKnowledgeSourcesParams {
  workflow_id: string;
}

export const listKnowledgeSourcesHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id } = params as unknown as ListKnowledgeSourcesParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    const sources = await knowledgeSourceService.getByDataset(workflow_id);

    return {
      success: true,
      sources: sources.map((s) => {
        const metadata = s.extractedContent?.metadata as Record<string, unknown> | undefined;
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          status: s.status,
          comment: s.comment,
          extraction_method: (metadata?.extractionMethod as string) || undefined,
          total_pages: (metadata?.totalPages as number) || undefined,
          total_chunks: (metadata?.totalChunks as number) || undefined,
          extraction_phase: s.extractionPhase || (metadata?.extractionPhase as string) || undefined,
          created_at: s.createdAt,
          processed_at: s.processedAt,
          section_count: s.extractedContent?.sections?.length || 0,
          topic_count: s.extractedContent?.sectionHeadings?.length || 0,
          error: s.error,
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

    let sources;
    if (source_id) {
      const source = await knowledgeSourceService.get(source_id);
      sources = source ? [source] : [];
    } else {
      sources = await knowledgeSourceService.getByDataset(workflow_id);
    }

    const allTopics: string[] = [];
    const sourceTopics: Record<string, string[]> = {};

    for (const source of sources) {
      if (source.status === 'ready' && source.extractedContent?.sectionHeadings) {
        sourceTopics[source.name] = source.extractedContent.sectionHeadings;
        allTopics.push(...source.extractedContent.sectionHeadings);
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
  workflow_id: string;
  query?: string;
  chunk_id?: string;
  max_results?: number;
}

export const searchKnowledgeHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, query, chunk_id, max_results = 5 } = params as unknown as SearchKnowledgeParams;

    if (!workflow_id) {
      return { success: false, error: 'workflow_id is required' };
    }

    // Fetch mode: return full text for a specific chunk
    if (chunk_id) {
      const sources = await knowledgeSourceService.getByDataset(workflow_id);
      for (const source of sources) {
        if (source.status !== 'ready' || !source.extractedContent) continue;
        const metadata = source.extractedContent.metadata as Record<string, unknown> | undefined;
        const chunks = (metadata?.chunks as Array<{ id: string; heading: string; summary: string; text: string; pageStart: number; pageEnd: number }>) || [];
        const chunk = chunks.find((c) => c.id === chunk_id);
        if (chunk) {
          const pages = chunk.pageStart === chunk.pageEnd ? `p.${chunk.pageStart}` : `pp.${chunk.pageStart}–${chunk.pageEnd}`;
          return {
            success: true,
            mode: 'fetch',
            chunk_id,
            source_name: source.name,
            heading: chunk.heading,
            summary: chunk.summary,
            pages,
            text: chunk.text,
          };
        }
      }
      return { success: false, error: `Chunk ${chunk_id} not found` };
    }

    if (!query) {
      return { success: false, error: 'Either query or chunk_id is required' };
    }

    const results = await knowledgeSourceService.search(workflow_id, query);

    return {
      success: true,
      query,
      results: results.slice(0, max_results).map((r) => {
        // Return chunk-structured results for local-semantic sources
        if (r.chunk_matches && r.chunk_matches.length > 0) {
          return {
            source_id: r.source.id,
            source_name: r.source.name,
            source_type: r.source.type,
            chunks: r.chunk_matches.slice(0, 5).map((c) => ({
              chunk_id: c.chunk_id,
              heading: c.heading,
              summary: c.summary,
              pages: c.pages,
              matching_sentences: c.matching_sentences.slice(0, 3),
              content_preview: c.text.length > 500
                ? c.text.slice(0, 500) + '...'
                : c.text,
            })),
            total_chunk_matches: r.chunk_matches.length,
          };
        }

        // Legacy format for non-chunked sources
        return {
          source_id: r.source.id,
          source_name: r.source.name,
          source_type: r.source.type,
          matches: r.matches,
        };
      }),
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
