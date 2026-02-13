/**
 * Native PDF Content Extraction
 *
 * Uses a single LLM call with a native file content block to extract
 * structured content from PDFs. The model reads the PDF directly —
 * no client-side pdfjs extraction needed.
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

interface NativeExtractionResult {
  text: string;
  topics: string[];
  sections: Array<{
    title: string;
    summary: string;
    key_concepts: string[];
    level: number;
  }>;
  document_summary: string;
  document_type: string;
}

interface ExtractionOptions {
  onProgress?: ExtractionProgressCallback;
}

// =============================================================================
// Prompts & Schema
// =============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are an expert document analyzer. Your task is to extract meaningful structure and comprehensive text content from a PDF document.

CRITICAL RULES:
1. ONLY extract actual content topics - NOT metadata like "Copyright", "Preface", "Acknowledgments", "Table of Contents", "Bibliography", "References", "Index"
2. Focus on the SUBJECT MATTER of the document, not the document structure
3. Topics should be concepts that could be used for training data generation
4. Sections should represent logical content divisions, not administrative sections
5. Be concise but informative in summaries
6. The "text" field must contain comprehensive extracted text content from the document - not just a summary. Include all substantive text.

SKIP these types of sections entirely:
- Copyright notices, legal disclaimers
- Author biographies, acknowledgments, dedications
- Table of contents, index, bibliography
- Preface, foreword (unless they contain substantial subject matter content)
- Page numbers, headers, footers
- Publisher information`;

const EXTRACTION_USER_PROMPT = `Analyze this PDF document and extract its full content and structure.

Extract:
1. **text**: The comprehensive text content of the document. Include all substantive text — this will be used for search and reference. Do not truncate or summarize.
2. **topics**: List of 10-30 key concepts/subjects covered (NOT metadata like "Copyright", author names, or section types)
3. **sections**: Main content sections with summaries (SKIP preface, acknowledgments, bibliography, etc.)
4. **document_summary**: 2-3 sentence overview of what the document teaches
5. **document_type**: Category (e.g., "technical manual", "educational textbook", "research paper")

Respond in JSON format.`;

const EXTRACTION_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'pdf_native_extraction',
    strict: true,
    schema: {
      type: 'object',
      required: ['text', 'topics', 'sections', 'document_summary', 'document_type'],
      additionalProperties: false,
      properties: {
        text: {
          type: 'string',
          description: 'Comprehensive extracted text content from the document (not just a summary — include all substantive text for search and reference)',
        },
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key concepts and subjects covered in the document (10-30 items)',
        },
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
        document_summary: {
          type: 'string',
          description: 'Overall summary of the document (2-3 sentences)',
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
// Validation
// =============================================================================

/**
 * Validate and clean up the extracted content — filter noise topics/sections
 */
function validateExtraction(result: NativeExtractionResult): NativeExtractionResult {
  const noisePatterns = [
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

  const cleanedTopics = result.topics.filter((topic) => {
    const trimmed = topic.trim();
    if (trimmed.length < 3) return false;
    return !noisePatterns.some((pattern) => pattern.test(trimmed));
  });

  const cleanedSections = result.sections.filter((section) => {
    const title = section.title.toLowerCase();
    return !noisePatterns.some((pattern) => pattern.test(title));
  });

  return {
    ...result,
    topics: cleanedTopics.slice(0, 50),
    sections: cleanedSections,
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Extract content from a PDF using a native file content block.
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
    // Step 1: Build file block
    onProgress?.({ step: 'Preparing PDF for analysis...', percent: 10 });
    console.log(`[pdf-native-extractor] Sending ${filename} as native file block`);

    const fileBlock: FileContentBlock = {
      type: 'file',
      file: {
        filename,
        file_data: `data:application/pdf;base64,${base64Data}`,
      },
    };

    // Step 2: Send to LLM
    onProgress?.({ step: 'Analyzing document with AI...', percent: 30 });

    const userContent: ContentBlock[] = [
      fileBlock,
      { type: 'text', text: EXTRACTION_USER_PROMPT },
    ];

    const messages: LucyMessage[] = [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    const responseText = await callLucy(messages, {
      model: 'openai/gpt-4.1',
      temperature: 0.3,
      response_format: EXTRACTION_RESPONSE_SCHEMA,
      label: 'pdf_native_extraction',
    });

    // Step 3: Parse and validate
    onProgress?.({ step: 'Processing extraction results...', percent: 85 });

    const parsed = JSON.parse(responseText.trim()) as NativeExtractionResult;
    const validated = validateExtraction(parsed);

    console.log(
      `[pdf-native-extractor] Extracted ${validated.topics.length} topics, ${validated.sections.length} sections from ${filename}`,
    );

    // Convert to ExtractedContent format
    const result: ExtractedContent = {
      text: validated.text,
      sections: validated.sections.map((s) => ({
        title: s.title,
        content: s.summary + (s.key_concepts.length > 0 ? `\n\nKey concepts: ${s.key_concepts.join(', ')}` : ''),
        level: s.level,
      })),
      topics: validated.topics,
      metadata: {
        type: 'pdf',
        documentType: validated.document_type,
        documentSummary: validated.document_summary,
        extractionMethod: 'native-file-block',
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
      topics: [],
      metadata: {
        type: 'pdf',
        error: error instanceof Error ? error.message : 'Native extraction failed',
        extractionMethod: 'native-file-block',
      },
    };
  }
}
