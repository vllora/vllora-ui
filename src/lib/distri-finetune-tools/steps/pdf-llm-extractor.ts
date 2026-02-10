/**
 * LLM-assisted PDF Content Extraction
 *
 * Uses LLM to intelligently extract topics, sections, and summaries
 * from PDF text content. Much better quality than regex-based extraction.
 *
 * Supports two-pass extraction for large documents:
 * - Pass 1: Extract document structure and overview
 * - Pass 2: Extract detailed topics from each section
 */

import { getInferObjectiveUrl } from '@/config/api';

// =============================================================================
// Types
// =============================================================================

export interface LLMExtractedContent {
  /** Main topics/concepts from the document */
  topics: string[];
  /** Structured sections with summaries */
  sections: Array<{
    title: string;
    summary: string;
    key_concepts: string[];
    level: number;
  }>;
  /** Overall document summary */
  document_summary: string;
  /** Document type/category */
  document_type: string;
}

/** Progress callback for extraction */
export type ExtractionProgressCallback = (progress: {
  step: string;
  current?: number;
  total?: number;
  percent?: number;
}) => void;

interface DocumentStructure {
  sections: Array<{
    title: string;
    start_marker: string;
    level: number;
  }>;
  document_type: string;
  document_summary: string;
}

interface SectionTopics {
  topics: string[];
  key_concepts: string[];
  summary: string;
}

// =============================================================================
// Configuration
// =============================================================================

/** Maximum text length for single-pass extraction */
const SINGLE_PASS_MAX_LENGTH = 50000;

/** Chunk size for two-pass extraction (characters) */
const CHUNK_SIZE = 40000;

/** Maximum sections to process in detail */
const MAX_SECTIONS_TO_PROCESS = 25;

/** Sample size per segment (beginning, middle, end) for structure analysis */
const STRUCTURE_SAMPLE_SIZE = 20000;

// =============================================================================
// Prompts - Pass 1 (Structure)
// =============================================================================

const STRUCTURE_SYSTEM_PROMPT = `You are an expert document analyzer. Your task is to identify ALL chapters, sections, and subsections of a document.

CRITICAL RULES:
1. Identify ALL content sections - not just top-level chapters, but also subsections and sub-topics
2. SKIP administrative sections like: Copyright, Preface, Acknowledgments, Table of Contents, Bibliography, References, Index
3. Be thorough - a technical book may have 15-30+ meaningful sections
4. Include both major chapters AND their important subsections
5. Each section should represent a distinct topic that could be used for training data`;

const STRUCTURE_USER_PROMPT = `Analyze this document sample and identify its COMPLETE structure including all sections and subsections.

DOCUMENT SAMPLE (beginning, middle, and end):
---
{{document_sample}}
---

Identify:
1. **sections**: List ALL content sections, chapters, AND subsections (aim for 15-30 sections for a comprehensive book). Include:
   - Main chapters/parts
   - Important subsections within chapters
   - Any distinct topics that could stand alone
   Each section needs: title and a unique start marker phrase (exact text from the document)
2. **document_type**: Category (e.g., "technical manual", "educational textbook", "research paper")
3. **document_summary**: 2-3 sentence overview of what the document covers

Be thorough - extract more sections rather than fewer. Each section should represent content that could be used for training data generation.

Respond in JSON format.`;

const STRUCTURE_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'document_structure',
    strict: true,
    schema: {
      type: 'object',
      required: ['sections', 'document_type', 'document_summary'],
      additionalProperties: false,
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'start_marker', 'level'],
            additionalProperties: false,
            properties: {
              title: { type: 'string', description: 'Section/chapter title' },
              start_marker: { type: 'string', description: 'Unique phrase that marks the start of this section' },
              level: { type: 'number', description: 'Heading level (1=chapter, 2=section)' },
            },
          },
        },
        document_type: {
          type: 'string',
          description: 'Category of document',
        },
        document_summary: {
          type: 'string',
          description: 'Overall summary of the document',
        },
      },
    },
  },
};

// =============================================================================
// Prompts - Pass 2 (Topics)
// =============================================================================

const TOPICS_SYSTEM_PROMPT = `You are an expert at extracting key concepts and topics from document sections.

CRITICAL RULES:
1. Extract meaningful topics that represent the subject matter
2. Focus on concepts that could be used for training data generation
3. Be specific - prefer "Sicilian Defense" over "chess openings"
4. Skip generic terms and metadata`;

const TOPICS_USER_PROMPT = `Extract key topics and concepts from this document section.

SECTION: {{section_title}}
CONTENT:
---
{{section_content}}
---

Extract:
1. **topics**: 5-15 key concepts/subjects covered in this section
2. **key_concepts**: 3-5 most important concepts
3. **summary**: 1-2 sentence summary of this section

Respond in JSON format.`;

const TOPICS_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'section_topics',
    strict: true,
    schema: {
      type: 'object',
      required: ['topics', 'key_concepts', 'summary'],
      additionalProperties: false,
      properties: {
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key topics covered in this section',
        },
        key_concepts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Most important concepts',
        },
        summary: {
          type: 'string',
          description: 'Brief summary of section content',
        },
      },
    },
  },
};

// =============================================================================
// Prompts - Single Pass (for small documents)
// =============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are an expert document analyzer. Your task is to extract meaningful structure and content from document text.

CRITICAL RULES:
1. ONLY extract actual content topics - NOT metadata like "Copyright", "Preface", "Acknowledgments", "Table of Contents", "Bibliography", "References", "Index"
2. Focus on the SUBJECT MATTER of the document, not the document structure
3. Topics should be concepts that could be used for training data generation
4. Sections should represent logical content divisions, not administrative sections
5. Be concise but informative in summaries

SKIP these types of sections entirely:
- Copyright notices, legal disclaimers
- Author biographies, acknowledgments, dedications
- Table of contents, index, bibliography
- Preface, foreword (unless they contain substantial subject matter content)
- Page numbers, headers, footers
- Publisher information`;

const EXTRACTION_USER_PROMPT = `Analyze this document and extract its meaningful content structure.

DOCUMENT TEXT:
---
{{document_text}}
---

Extract:
1. **topics**: List of 10-20 key concepts/subjects covered (NOT metadata like "Copyright", author names, or section types)
2. **sections**: Main content sections with summaries (SKIP preface, acknowledgments, bibliography, etc.)
3. **document_summary**: 2-3 sentence overview of what the document teaches
4. **document_type**: Category (e.g., "technical manual", "educational textbook", "research paper")

Respond in JSON format.`;

const EXTRACTION_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'document_extraction',
    strict: true,
    schema: {
      type: 'object',
      required: ['topics', 'sections', 'document_summary', 'document_type'],
      additionalProperties: false,
      properties: {
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key concepts and subjects covered in the document (10-20 items)',
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
// LLM Service
// =============================================================================

/**
 * Call LLM with retry logic
 */
async function callLLM<T>(
  systemPrompt: string,
  userPrompt: string,
  responseSchema: object,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[pdf-llm-extractor] ${label} (attempt ${attempt + 1}/3)...`);

      const response = await fetch(getInferObjectiveUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-label': `pdf_extraction_${label}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          response_format: responseSchema,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM request failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('LLM returned empty response');
      }

      return JSON.parse(content.trim()) as T;
    } catch (err) {
      lastError = err;
      console.error(`[pdf-llm-extractor] ${label} attempt ${attempt + 1} failed:`, err);
      if (attempt < 2) {
        const backoffMs = 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

/**
 * Clean text by removing excessive whitespace and page breaks
 */
function cleanText(text: string): string {
  return text
    .replace(/--- Page Break ---/g, '\n\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/**
 * Create a document sample for structure analysis (beginning + middle + end)
 */
function createDocumentSample(text: string, sampleSize: number = STRUCTURE_SAMPLE_SIZE): string {
  if (text.length <= sampleSize * 3) {
    return text;
  }

  const beginning = text.slice(0, sampleSize);
  const middleStart = Math.floor(text.length / 2) - Math.floor(sampleSize / 2);
  const middle = text.slice(middleStart, middleStart + sampleSize);
  const end = text.slice(-sampleSize);

  return `[BEGINNING OF DOCUMENT]\n${beginning}\n\n[MIDDLE OF DOCUMENT]\n${middle}\n\n[END OF DOCUMENT]\n${end}`;
}

/**
 * Find section content in the document
 */
function findSectionContent(
  text: string,
  sectionMarker: string,
  nextSectionMarker?: string
): string {
  const startIdx = text.indexOf(sectionMarker);
  if (startIdx === -1) {
    return '';
  }

  let endIdx = text.length;
  if (nextSectionMarker) {
    const nextIdx = text.indexOf(nextSectionMarker, startIdx + sectionMarker.length);
    if (nextIdx !== -1) {
      endIdx = nextIdx;
    }
  }

  // Limit section content to chunk size
  const sectionContent = text.slice(startIdx, Math.min(endIdx, startIdx + CHUNK_SIZE));
  return sectionContent;
}

/**
 * Two-pass extraction for large documents
 */
async function extractWithTwoPass(
  documentText: string,
  onProgress?: ExtractionProgressCallback
): Promise<LLMExtractedContent> {
  const cleanedText = cleanText(documentText);
  console.log(`[pdf-llm-extractor] Using two-pass extraction for ${cleanedText.length} chars`);

  // Pass 1: Extract document structure
  console.log('[pdf-llm-extractor] Pass 1: Extracting document structure...');
  onProgress?.({ step: 'Analyzing document structure...', percent: 5 });

  const documentSample = createDocumentSample(cleanedText);
  const structurePrompt = STRUCTURE_USER_PROMPT.replace('{{document_sample}}', documentSample);

  const structure = await callLLM<DocumentStructure>(
    STRUCTURE_SYSTEM_PROMPT,
    structurePrompt,
    STRUCTURE_RESPONSE_SCHEMA,
    'structure_extraction'
  );

  console.log(`[pdf-llm-extractor] Found ${structure.sections.length} sections`);
  onProgress?.({ step: `Found ${structure.sections.length} sections`, percent: 15 });

  // Pass 2: Extract topics from each section
  console.log('[pdf-llm-extractor] Pass 2: Extracting topics from sections...');
  const allTopics: string[] = [];
  const allSections: LLMExtractedContent['sections'] = [];

  // Limit sections to process
  const sectionsToProcess = structure.sections.slice(0, MAX_SECTIONS_TO_PROCESS);
  const totalSections = sectionsToProcess.length;

  for (let i = 0; i < sectionsToProcess.length; i++) {
    const section = sectionsToProcess[i];
    const nextSection = sectionsToProcess[i + 1];

    // Report progress for each section
    const sectionPercent = 15 + Math.round((i / totalSections) * 80);
    onProgress?.({
      step: `Extracting: ${section.title}`,
      current: i + 1,
      total: totalSections,
      percent: sectionPercent,
    });

    try {
      // Find section content
      const sectionContent = findSectionContent(
        cleanedText,
        section.start_marker,
        nextSection?.start_marker
      );

      if (sectionContent.length < 100) {
        console.log(`[pdf-llm-extractor] Skipping section "${section.title}" - too short`);
        continue;
      }

      // Extract topics from this section
      const topicsPrompt = TOPICS_USER_PROMPT
        .replace('{{section_title}}', section.title)
        .replace('{{section_content}}', sectionContent.slice(0, CHUNK_SIZE));

      const sectionTopics = await callLLM<SectionTopics>(
        TOPICS_SYSTEM_PROMPT,
        topicsPrompt,
        TOPICS_RESPONSE_SCHEMA,
        `section_${i + 1}_topics`
      );

      // Collect results
      allTopics.push(...sectionTopics.topics);
      allSections.push({
        title: section.title,
        summary: sectionTopics.summary,
        key_concepts: sectionTopics.key_concepts,
        level: section.level,
      });

      console.log(`[pdf-llm-extractor] Processed section ${i + 1}/${sectionsToProcess.length}: "${section.title}"`);
    } catch (err) {
      console.error(`[pdf-llm-extractor] Failed to process section "${section.title}":`, err);
      // Continue with other sections
    }
  }

  onProgress?.({ step: 'Finalizing extraction...', percent: 95 });

  // Deduplicate topics
  const uniqueTopics = [...new Set(allTopics)];

  const result: LLMExtractedContent = {
    topics: uniqueTopics,
    sections: allSections,
    document_summary: structure.document_summary,
    document_type: structure.document_type,
  };

  onProgress?.({ step: 'Complete', percent: 100 });

  return validateExtraction(result);
}

/**
 * Single-pass extraction for small documents
 */
async function extractWithSinglePass(
  documentText: string,
  onProgress?: ExtractionProgressCallback
): Promise<LLMExtractedContent> {
  const cleanedText = cleanText(documentText);
  console.log(`[pdf-llm-extractor] Using single-pass extraction for ${cleanedText.length} chars`);

  onProgress?.({ step: 'Analyzing document...', percent: 20 });

  const userPrompt = EXTRACTION_USER_PROMPT.replace('{{document_text}}', cleanedText);

  onProgress?.({ step: 'Extracting content and topics...', percent: 50 });

  const result = await callLLM<LLMExtractedContent>(
    EXTRACTION_SYSTEM_PROMPT,
    userPrompt,
    EXTRACTION_RESPONSE_SCHEMA,
    'single_pass_extraction'
  );

  onProgress?.({ step: 'Complete', percent: 100 });

  return validateExtraction(result);
}

/**
 * Use LLM to extract meaningful content from document text
 *
 * Automatically chooses between single-pass and two-pass extraction
 * based on document size.
 */
export async function extractContentWithLLM(
  documentText: string,
  options: { maxTextLength?: number; onProgress?: ExtractionProgressCallback } = {}
): Promise<LLMExtractedContent> {
  const { maxTextLength = SINGLE_PASS_MAX_LENGTH, onProgress } = options;

  // Clean the text first
  const cleanedText = cleanText(documentText);

  // Choose extraction strategy based on document size
  if (cleanedText.length <= maxTextLength) {
    return extractWithSinglePass(cleanedText, onProgress);
  } else {
    return extractWithTwoPass(cleanedText, onProgress);
  }
}

/**
 * Validate and clean up the extracted content
 */
function validateExtraction(result: LLMExtractedContent): LLMExtractedContent {
  // Filter out any remaining noise from topics
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

  // Filter sections similarly
  const cleanedSections = result.sections.filter((section) => {
    const title = section.title.toLowerCase();
    return !noisePatterns.some((pattern) => pattern.test(title));
  });

  return {
    ...result,
    topics: cleanedTopics.slice(0, 50), // Allow more topics for large docs
    sections: cleanedSections,
  };
}

/**
 * Fallback extraction when LLM is unavailable
 * Uses basic heuristics but filters out noise
 */
export function extractContentFallback(documentText: string): LLMExtractedContent {
  const lines = documentText.split('\n');
  const topics = new Set<string>();
  const sections: LLMExtractedContent['sections'] = [];

  // Noise words to filter out
  const noiseWords = new Set([
    'the', 'this', 'that', 'these', 'those', 'when', 'where', 'what', 'which',
    'page', 'break', 'copyright', 'author', 'editor', 'publisher', 'isbn',
    'acknowledgment', 'preface', 'foreword', 'introduction', 'conclusion',
    'bibliography', 'references', 'index', 'appendix', 'table', 'contents',
  ]);

  // Extract potential topics from text (improved heuristics)
  const topicPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
  let match;
  while ((match = topicPattern.exec(documentText)) !== null) {
    const phrase = match[1];
    const words = phrase.toLowerCase().split(/\s+/);
    // Only add if no noise words and reasonable length
    if (words.length >= 1 && !words.some((w) => noiseWords.has(w)) && phrase.length > 4) {
      topics.add(phrase);
    }
  }

  // Extract sections from headings (improved detection)
  let currentSection: { title: string; content: string[] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip noise sections
    if (/^(copyright|preface|foreword|acknowledgment|bibliography|references|index)/i.test(line)) {
      continue;
    }

    // Detect headings
    if (
      line.length > 3 &&
      line.length < 80 &&
      /^(chapter|section|part|\d+\.)\s+/i.test(line)
    ) {
      if (currentSection && currentSection.content.length > 0) {
        sections.push({
          title: currentSection.title,
          summary: currentSection.content.slice(0, 3).join(' ').slice(0, 200),
          key_concepts: [],
          level: 2,
        });
      }
      currentSection = { title: line, content: [] };
    } else if (currentSection && line.length > 20) {
      currentSection.content.push(line);
    }
  }

  return {
    topics: Array.from(topics).slice(0, 15),
    sections: sections.slice(0, 20),
    document_summary: 'Document content extracted with basic analysis.',
    document_type: 'document',
  };
}
