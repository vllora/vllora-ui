/**
 * Native PDF Content Extraction — 3-Pass Parallel
 *
 * Splits extraction into 3 focused parallel LLM calls:
 *   1. Structure (sections + document_type) — gpt-4.1
 *   2. Topics (topics + document_summary) — gpt-4.1-mini
 *   3. Full Text (text) — gpt-4.1-mini
 *
 * Wall-clock time ≈ max(pass1, pass2, pass3) instead of one long sequential call.
 */

import {
  callLucy,
  type FileContentBlock,
  type ContentBlock,
  type LucyMessage,
} from './shared/lucy-client';
import type { ExtractedContent } from '@/types/dataset-types';

// =============================================================================
// Types
// =============================================================================

/** Progress callback for extraction */
export type ExtractionProgressCallback = (progress: {
  step: string;
  current?: number;
  total?: number;
  percent?: number;
}) => void;

interface StructureResult {
  sections: Array<{
    title: string;
    summary: string;
    key_concepts: string[];
    level: number;
  }>;
  document_type: string;
}

interface TopicsResult {
  topics: string[];
  document_summary: string;
}

interface TextResult {
  text: string;
}

interface ExtractionOptions {
  onProgress?: ExtractionProgressCallback;
}

// =============================================================================
// Pass 1: Structure — sections + document_type
// =============================================================================

const STRUCTURE_SYSTEM_PROMPT = `You are an expert document analyzer. Your task is to identify the logical structure and type of a PDF document.

CRITICAL RULES:
1. Sections should represent logical content divisions, NOT administrative sections
2. SKIP these entirely: copyright notices, legal disclaimers, author biographies, acknowledgments, dedications, table of contents, index, bibliography, preface, foreword (unless containing substantial subject matter), page numbers, headers, footers, publisher information
3. Be concise but informative in summaries
4. Classify the document type accurately based on its content and purpose`;

const STRUCTURE_USER_PROMPT = `Analyze this PDF document and extract its structure.

Extract:
1. **sections**: Main content sections with summaries. Each section needs a title, brief summary, key concepts covered, and heading level (1=chapter, 2=section, 3=subsection). SKIP preface, acknowledgments, bibliography, etc.
2. **document_type**: Category of the document (e.g., "technical manual", "educational textbook", "research paper", "API documentation")

Respond in JSON format.`;

const STRUCTURE_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'pdf_structure_extraction',
    strict: true,
    schema: {
      type: 'object',
      required: ['sections', 'document_type'],
      additionalProperties: false,
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'summary', 'key_concepts', 'level'],
            additionalProperties: false,
            properties: {
              title: { type: 'string', description: 'Section title' },
              summary: { type: 'string', description: 'Brief summary of section content' },
              key_concepts: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key concepts covered in this section',
              },
              level: { type: 'number', description: 'Heading level (1=chapter, 2=section, 3=subsection)' },
            },
          },
        },
        document_type: {
          type: 'string',
          description: 'Category of document (e.g., technical manual, textbook, research paper)',
        },
      },
    },
  },
};

// =============================================================================
// Pass 2: Topics — topics + document_summary
// =============================================================================

const TOPICS_SYSTEM_PROMPT = `You are an expert document analyzer. Your task is to identify the key topics and provide a summary of a PDF document.

CRITICAL RULES:
1. ONLY extract actual content topics — NOT metadata like "Copyright", "Preface", "Acknowledgments", "Table of Contents", "Bibliography", "References", "Index"
2. Focus on the SUBJECT MATTER of the document, not the document structure
3. Topics should be concepts that could be used for training data generation
4. Be concise but informative in the summary`;

const TOPICS_USER_PROMPT = `Analyze this PDF document and extract its topics and summary.

Extract:
1. **topics**: List of 10-30 key concepts/subjects covered (NOT metadata like "Copyright", author names, or section types)
2. **document_summary**: 2-3 sentence overview of what the document teaches or covers

Respond in JSON format.`;

const TOPICS_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'pdf_topics_extraction',
    strict: true,
    schema: {
      type: 'object',
      required: ['topics', 'document_summary'],
      additionalProperties: false,
      properties: {
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key concepts and subjects covered in the document (10-30 items)',
        },
        document_summary: {
          type: 'string',
          description: 'Overall summary of the document (2-3 sentences)',
        },
      },
    },
  },
};

// =============================================================================
// Pass 3: Full Text
// =============================================================================

const TEXT_SYSTEM_PROMPT = `You are an expert document transcriber. Your task is to extract the comprehensive text content from a PDF document.

CRITICAL RULES:
1. Include ALL substantive text content — this will be used for search and reference
2. Do NOT truncate or summarize — faithfully reproduce the document's text
3. Skip page numbers, headers/footers, and other repeated navigational elements
4. Preserve the logical reading order of the content`;

const TEXT_USER_PROMPT = `Extract the full text content from this PDF document.

The **text** field must contain comprehensive extracted text content — not just a summary. Include all substantive text for search and reference purposes. Do not truncate.

Respond in JSON format.`;

const TEXT_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'pdf_text_extraction',
    strict: true,
    schema: {
      type: 'object',
      required: ['text'],
      additionalProperties: false,
      properties: {
        text: {
          type: 'string',
          description: 'Comprehensive extracted text content from the document (not just a summary — include all substantive text for search and reference)',
        },
      },
    },
  },
};

// =============================================================================
// Validation
// =============================================================================

const NOISE_PATTERNS = [
  /^page\s*(break|number)?$/i,
  /^copyright$/i,
  /^all\s*rights\s*reserved$/i,
  /^table\s*of\s*contents$/i,
  /^bibliography$/i,
  /^references?$/i,
  /^index$/i,
  /^acknowledgment/i,
  /^preface$/i,
  /^foreword$/i,
  /^appendix$/i,
];

/** Validate and clean up structure pass output — filter noise sections */
function validateStructure(result: StructureResult): StructureResult {
  const cleanedSections = result.sections.filter((section) => {
    const title = section.title.toLowerCase();
    return !NOISE_PATTERNS.some((pattern) => pattern.test(title));
  });

  return {
    ...result,
    sections: cleanedSections,
  };
}

/** Validate and clean up topics pass output — filter noise topics */
function validateTopics(result: TopicsResult): TopicsResult {
  const cleanedTopics = result.topics.filter((topic) => {
    const trimmed = topic.trim();
    if (trimmed.length < 3) return false;
    return !NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
  });

  return {
    ...result,
    topics: cleanedTopics.slice(0, 50),
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Extract content from a PDF using 3 parallel native file content block passes.
 *
 * Sends the raw PDF to the LLM as a file block — the model reads it directly
 * and returns structured extraction output plus comprehensive text.
 */
export async function extractPdfContentNative(
  base64Data: string,
  filename: string,
  options: ExtractionOptions = {},
): Promise<ExtractedContent> {
  const { onProgress } = options;

  try {
    // Step 1: Build shared file block
    onProgress?.({ step: 'Preparing PDF...', percent: 5 });
    console.log(`[pdf-native-extractor] Sending ${filename} as native file block (3 parallel passes)`);

    const fileBlock: FileContentBlock = {
      type: 'file',
      file: {
        filename,
        file_data: `data:application/pdf;base64,${base64Data}`,
      },
    };

    // Step 2: Fire 3 parallel passes
    onProgress?.({ step: 'Analyzing document...', percent: 20 });

    const buildMessages = (systemPrompt: string, userPrompt: string): LucyMessage[] => [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          fileBlock,
          { type: 'text', text: userPrompt },
        ] as ContentBlock[],
      },
    ];

    const [structureRaw, topicsRaw, textRaw] = await Promise.all([
      callLucy(buildMessages(STRUCTURE_SYSTEM_PROMPT, STRUCTURE_USER_PROMPT), {
        model: 'openai/gpt-4.1',
        temperature: 0.3,
        response_format: STRUCTURE_RESPONSE_SCHEMA,
        label: 'pdf_structure_extraction',
      }),
      callLucy(buildMessages(TOPICS_SYSTEM_PROMPT, TOPICS_USER_PROMPT), {
        model: 'openai/gpt-4.1-mini',
        temperature: 0.3,
        response_format: TOPICS_RESPONSE_SCHEMA,
        label: 'pdf_topics_extraction',
      }),
      callLucy(buildMessages(TEXT_SYSTEM_PROMPT, TEXT_USER_PROMPT), {
        model: 'openai/gpt-4.1-mini',
        temperature: 0.3,
        response_format: TEXT_RESPONSE_SCHEMA,
        label: 'pdf_text_extraction',
      }),
    ]);

    // Step 3: Parse, validate, and merge
    onProgress?.({ step: 'Processing extraction results...', percent: 85 });

    const structure = validateStructure(JSON.parse(structureRaw.trim()) as StructureResult);
    const topics = validateTopics(JSON.parse(topicsRaw.trim()) as TopicsResult);
    const text = JSON.parse(textRaw.trim()) as TextResult;

    console.log(
      `[pdf-native-extractor] 3-pass complete for ${filename}: ${topics.topics.length} topics, ${structure.sections.length} sections`,
    );

    // Convert to ExtractedContent format
    const result: ExtractedContent = {
      text: text.text,
      sections: structure.sections.map((s) => ({
        title: s.title,
        content: s.summary + (s.key_concepts.length > 0 ? `\n\nKey concepts: ${s.key_concepts.join(', ')}` : ''),
        level: s.level,
      })),
      sectionHeadings: topics.topics,
      metadata: {
        type: 'pdf',
        documentType: structure.document_type,
        documentSummary: topics.document_summary,
        extractionMethod: 'native-file-block-parallel',
      },
    };

    onProgress?.({ step: 'Complete', percent: 100 });
    return result;
  } catch (error) {
    console.error(`[pdf-native-extractor] Extraction failed for ${filename}:`, error);

    // Return fallback with error info
    return {
      text: `[PDF content - native extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}]`,
      sections: [],
      sectionHeadings: [],
      metadata: {
        type: 'pdf',
        error: error instanceof Error ? error.message : 'Native extraction failed',
        extractionMethod: 'native-file-block-parallel',
      },
    };
  }
}
