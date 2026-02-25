/**
 * Semantic PDF Extractor — LLM-Primary with Embeddings Fallback
 *
 * Pipeline:
 *   PDF (base64) → pdfjs-dist text extraction
 *     → text cleanup → wink-nlp sentence splitting
 *     → PRIMARY: LLM section identification (native PDF file block)
 *       → match sections to sentences → structured markdown
 *     → FALLBACK (on LLM failure): local embeddings + clustering + LLM enrichment
 *       → structured markdown
 *
 * Exports:
 *   - extractPdfContentLocal()  — main entry point
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedContent } from '@/types/dataset-types';
import type { ExtractionProgressCallback } from './pdf-native-extractor';
import { embed } from './shared/local-embeddings';
import {
  splitSentencesWithPages,
  clusterSentences,
  type SemanticChunk,
  type SentenceWithPage,
} from './shared/semantic-chunker';
import {
  callLucy,
  type LucyMessage,
  type FileContentBlock,
  type TextContentBlock,
  type ContentBlock,
} from './shared/lucy-client';

// Configure pdf.js worker (use bundled worker from pdfjs-dist)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LocalExtractionOptions {
  onProgress?: ExtractionProgressCallback;
  similarityThreshold?: number;
  objective?: string;
  comment?: string;
  allowFallback?: boolean;
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

/**
 * Extract PDF content locally using pdfjs + embeddings + semantic chunking.
 *
 * @param base64Data  Base64-encoded PDF content (or data URI)
 * @param filename    Original filename for display
 * @param options     Progress callback and tuning knobs
 */
export async function extractPdfContentLocal(
  base64Data: string,
  filename: string,
  options: LocalExtractionOptions = {}
): Promise<ExtractedContent> {
  const {
    onProgress,
    similarityThreshold,
    objective,
    comment,
    allowFallback = true,
  } = options;

  // Step 1: Decode base64 → load PDF
  onProgress?.({ step: 'Loading PDF...', percent: 5 });

  const raw = base64Data.startsWith('data:')
    ? base64Data.replace(/^data:[^;]+;base64,/, '')
    : base64Data;

  const binaryData = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({ data: binaryData }).promise;
  const totalPages = pdf.numPages;

  // Step 2: Extract text per page
  onProgress?.({ step: 'Extracting text...', current: 0, total: totalPages, percent: 10 });

  const pages: Array<{ text: string; pageNumber: number }> = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Build page text preserving line structure using hasEOL flag
    const parts: string[] = [];
    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      parts.push(item.str);
      if ('hasEOL' in item && item.hasEOL) {
        parts.push('\n');
      }
    }
    const pageText = parts.join('');

    if (pageText.trim()) {
      pages.push({ text: pageText, pageNumber: i });
    }

    onProgress?.({
      step: `Extracting text (page ${i}/${totalPages})...`,
      current: i,
      total: totalPages,
      percent: 10 + Math.round((i / totalPages) * 20),
    });
  }

  if (pages.length === 0) {
    return {
      text: `# ${filename}\n\nNo extractable text found in this PDF. It may be an image-only document.`,
      sections: [],
      sectionHeadings: [],
      metadata: {
        type: 'pdf',
        extractionMethod: 'local-semantic',
        totalChunks: 0,
        totalPages,
        error: 'no-text',
      },
    };
  }

  // Step 3: Split into sentences with page attribution
  onProgress?.({ step: 'Splitting sentences...', percent: 35 });

  const sentences = splitSentencesWithPages(pages);

  if (sentences.length === 0) {
    return {
      text: `# ${filename}\n\nNo sentences could be extracted from this PDF.`,
      sections: [],
      sectionHeadings: [],
      metadata: {
        type: 'pdf',
        extractionMethod: 'local-semantic',
        totalChunks: 0,
        totalPages,
        error: 'no-sentences',
      },
    };
  }

  // -------------------------------------------------------------------------
  // PRIMARY PATH: LLM section identification with native PDF
  // -------------------------------------------------------------------------
  try {
    onProgress?.({ step: 'Analyzing document structure with AI...', percent: 40 });

    const sections = await extractSectionsWithLLM(
      sentences, totalPages, objective, comment, base64Data, filename,
    );

    if (sections.length === 0) {
      throw new Error('LLM returned no sections');
    }

    onProgress?.({ step: 'Mapping sections to text...', percent: 75 });

    const chunks = buildChunksFromSections(sections, sentences);

    if (chunks.length === 0) {
      throw new Error('Could not match any LLM sections to document text');
    }

    onProgress?.({ step: 'Generating structured markdown...', percent: 90 });
    const markdown = generateMarkdown(filename, chunks, totalPages);

    onProgress?.({ step: 'Complete', percent: 100 });

    return {
      text: markdown,
      sections: chunks.map((c) => ({
        title: c.heading,
        content: c.summary,
        level: 1,
      })),
      sectionHeadings: chunks.map((c) => c.heading),
      metadata: {
        type: 'pdf',
        extractionMethod: 'local-semantic',
        extractionPhase: 'enhanced',
        totalChunks: chunks.length,
        totalPages,
        chunks,
      },
    };
  } catch (llmError) {
    console.warn(
      `[semantic-pdf-extractor] LLM primary path failed, falling back to embeddings:`,
      llmError,
    );
    if (!allowFallback) {
      throw llmError;
    }
  }

  // -------------------------------------------------------------------------
  // FALLBACK: Embeddings + clustering + LLM enrichment
  // -------------------------------------------------------------------------
  onProgress?.({
    step: 'Generating embeddings (fallback)...',
    percent: 45,
  });

  const sentenceTexts = sentences.map((s) => s.text);
  const embeddings = await embed(sentenceTexts, (info) => {
    if (info.status === 'progress' && info.progress !== undefined) {
      onProgress?.({
        step: `Loading embedding model... ${Math.round(info.progress)}%`,
        percent: 45 + Math.round(info.progress * 0.2),
      });
    }
  });

  onProgress?.({ step: 'Clustering sentences (fallback)...', percent: 65 });

  const chunks = clusterSentences(sentences, embeddings, similarityThreshold);

  onProgress?.({ step: 'Summarizing chunks (fallback)...', percent: 70 });

  await enrichChunksWithLLM(chunks, (completed, total) => {
    const pct = 70 + Math.round((completed / total) * 15);
    onProgress?.({
      step: `Summarizing chunks (${completed}/${total}, fallback)...`,
      current: completed,
      total,
      percent: pct,
    });
  });

  onProgress?.({ step: 'Generating structured markdown...', percent: 90 });

  const markdown = generateMarkdown(filename, chunks, totalPages);

  onProgress?.({ step: 'Complete', percent: 100 });

  return {
    text: markdown,
    sections: chunks.map((c) => ({
      title: c.heading,
      content: c.summary,
      level: 1,
    })),
    sectionHeadings: chunks.map((c) => c.heading),
    metadata: {
      type: 'pdf',
      extractionMethod: 'local-semantic',
      totalChunks: chunks.length,
      totalPages,
      chunks,
    },
  };
}

// ---------------------------------------------------------------------------
// LLM Chunk Enrichment
// ---------------------------------------------------------------------------

const CHUNK_ENRICH_MODEL = 'openai/gpt-5-nano';
const CHUNK_ENRICH_BATCH_SIZE = 5;

const CHUNK_ENRICH_SYSTEM = `You summarize document chunks. Given a text chunk from a PDF, produce:
- "heading": A short, descriptive title (max 10 words) that captures the main topic of this chunk. Do NOT just repeat the first sentence.
- "summary": A 4-5 sentence summary covering the chunk's key concepts, arguments, and details. Be specific — mention names, terms, and relationships found in the text.

Respond in JSON only.`;

const CHUNK_ENRICH_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'chunk_enrichment',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', description: 'Short descriptive title (max 10 words)' },
        summary: { type: 'string', description: 'Specific 4-5 sentence summary' },
      },
      required: ['heading', 'summary'],
      additionalProperties: false,
    },
  },
};

/**
 * Enrich chunks in-place with LLM-generated headings and summaries.
 * Sends parallel requests in batches to avoid overwhelming the API.
 * Falls back to original heading/summary on failure.
 */
async function enrichChunksWithLLM(
  chunks: SemanticChunk[],
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  let completed = 0;

  for (let i = 0; i < chunks.length; i += CHUNK_ENRICH_BATCH_SIZE) {
    const batch = chunks.slice(i, i + CHUNK_ENRICH_BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (chunk) => {
        // Truncate chunk text to ~2000 chars to keep requests small
        const text = chunk.text.length > 2000
          ? chunk.text.slice(0, 2000) + '...'
          : chunk.text;

        const messages: LucyMessage[] = [
          { role: 'system', content: CHUNK_ENRICH_SYSTEM },
          { role: 'user', content: text },
        ];

        const response = await callLucy(messages, {
          model: CHUNK_ENRICH_MODEL,
          temperature: 0.2,
          max_tokens: 350,
          response_format: CHUNK_ENRICH_RESPONSE_FORMAT,
          label: 'chunk_enrichment',
        });

        return JSON.parse(response) as { heading: string; summary: string };
      }),
    );

    // Apply results to chunks (in-place mutation)
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled' && result.value) {
        const chunkIdx = i + j;
        chunks[chunkIdx].heading = result.value.heading;
        chunks[chunkIdx].summary = result.value.summary;
      } else {
        const reason = result.status === 'rejected' ? result.reason : 'empty response';
        console.error(`[semantic-pdf-extractor] Chunk ${i + j + 1} enrichment failed:`, reason);
      }
      completed++;
    }

    onProgress?.(completed, chunks.length);
  }

  console.log(`[semantic-pdf-extractor] Enriched ${completed}/${chunks.length} chunks with LLM summaries`);
}

// ---------------------------------------------------------------------------
// Markdown Generation
// ---------------------------------------------------------------------------

function generateMarkdown(filename: string, chunks: SemanticChunk[], totalPages: number): string {
  const overallSummary = chunks.length > 0 ? chunks[0].summary : 'No content extracted.';

  const lines: string[] = [
    `# ${filename}`,
    '',
    `**Overall Summary:** ${overallSummary}`,
    `**Total Chunks:** ${chunks.length} | **Pages:** 1–${totalPages}`,
    '',
    '---',
  ];

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const pageRange = c.pageStart === c.pageEnd ? `${c.pageStart}` : `${c.pageStart}–${c.pageEnd}`;

    lines.push('');
    lines.push(`## Chunk ${i + 1}: ${c.heading}`);
    lines.push(`**Pages:** ${pageRange} | **Topic:** ${c.heading}`);
    lines.push('');
    lines.push(`**Summary:** ${c.summary}`);
    lines.push('');
    lines.push(c.text);
    lines.push('');
    lines.push('---');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Indexed Text Builder
// ---------------------------------------------------------------------------

/**
 * Build a numbered text representation of sentences for LLM consumption.
 * Format: "[0] First sentence\n[1] Second sentence\n..."
 */
function buildIndexedText(sentences: SentenceWithPage[]): string {
  return sentences.map((s, i) => `[${i}] ${s.text}`).join('\n');
}

// ---------------------------------------------------------------------------
// LLM Section Extraction (used by primary path)
// ---------------------------------------------------------------------------

const SECTION_LLM_MODEL = 'openai/gpt-5-mini';

const SECTION_LLM_SYSTEM = `You are a document structure analyzer.

{{OBJECTIVE_BLOCK}}

You will receive the document's sentences in numbered format:
[0] First sentence text
[1] Second sentence text
...

Identify the logical sections of this document. For each section provide:
- "heading": short descriptive title (max 10 words)
- "summary": 4-5 sentence summary
- "start_index": the integer index of the first sentence in this section
- "end_index": the integer index of the last sentence in this section (inclusive)

Rules:
- 5-20 sections depending on document length
- Follow the document's own structure (Articles, Chapters, Sections)
- Group content by what's relevant to the training objective
- Sections must be contiguous: no gaps between sections, no overlapping indices
- Sections must be in document order (ascending start_index)
- Each section must contain at least 3 sentences
- The first section should start at index 0
- The last section should end at the last sentence index`;

const SECTION_LLM_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'document_sections',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'Short descriptive title (max 10 words)' },
              summary: { type: 'string', description: '4-5 sentence summary' },
              start_index: { type: 'integer', description: 'Index of the first sentence in this section' },
              end_index: { type: 'integer', description: 'Index of the last sentence in this section (inclusive)' },
            },
            required: ['heading', 'summary', 'start_index', 'end_index'],
            additionalProperties: false,
          },
        },
      },
      required: ['sections'],
      additionalProperties: false,
    },
  },
};

interface LLMSection {
  heading: string;
  summary: string;
  start_index: number;
  end_index: number;
}

/**
 * Single LLM call to identify proper document sections from indexed sentences.
 * Returns section boundaries as start_index / end_index integers.
 */
async function extractSectionsWithLLM(
  sentences: SentenceWithPage[],
  totalPages: number,
  objective?: string,
  comment?: string,
  pdfBase64?: string,
  filename?: string,
): Promise<LLMSection[]> {
  // Build objective block for the system prompt
  const objectiveLines: string[] = [];
  if (objective) objectiveLines.push(`Training objective: ${objective}`);
  if (comment) objectiveLines.push(`Document purpose: ${comment}`);
  const objectiveBlock = objectiveLines.length > 0
    ? objectiveLines.join('\n')
    : 'Identify the most logical and useful sections of this document.';

  const systemPrompt = SECTION_LLM_SYSTEM.replace('{{OBJECTIVE_BLOCK}}', objectiveBlock);

  // Build indexed text from sentences
  const indexedText = buildIndexedText(sentences);

  // Build user content: when PDF is available, send BOTH the native PDF (visual context)
  // AND the indexed text (for index references)
  let userContent: string | ContentBlock[];
  if (pdfBase64) {
    const base64Only = pdfBase64.startsWith('data:')
      ? pdfBase64.replace(/^data:[^;]+;base64,/, '')
      : pdfBase64;
    userContent = [
      {
        type: 'file',
        file: {
          filename: filename || 'document.pdf',
          file_data: `data:application/pdf;base64,${base64Only}`,
        },
      } as FileContentBlock,
      {
        type: 'text',
        text: `Analyze this ${totalPages}-page document and identify its sections.\n\nHere are the numbered sentences — use these indices in your response:\n\n${indexedText}`,
      } as TextContentBlock,
    ];
    console.log(`[extraction] Sending PDF file block + ${sentences.length} indexed sentences`);
  } else {
    userContent = `Document (${totalPages} pages, ${sentences.length} sentences):\n\n${indexedText}`;
  }

  const messages: LucyMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  const response = await callLucy(messages, {
    model: SECTION_LLM_MODEL,
    temperature: 0.2,
    response_format: SECTION_LLM_RESPONSE_FORMAT,
    label: 'section_extraction',
  });

  const parsed = JSON.parse(response) as { sections: LLMSection[] };
  return parsed.sections;
}

/**
 * Build chunks from LLM sections using deterministic index-based slicing.
 * Sections reference sentence indices directly — no string matching needed.
 */
function buildChunksFromSections(
  sections: LLMSection[],
  sentences: SentenceWithPage[],
): SemanticChunk[] {
  if (sections.length === 0 || sentences.length === 0) return [];

  const maxIdx = sentences.length - 1;

  // Pre-sort sections by start_index for robustness
  const sorted = [...sections].sort((a, b) => a.start_index - b.start_index);

  const chunks: SemanticChunk[] = [];
  let prevEndIndex = -1;

  for (const section of sorted) {
    // Clamp indices to valid range
    let startIdx = Math.max(0, Math.min(section.start_index, maxIdx));
    let endIdx = Math.max(0, Math.min(section.end_index, maxIdx));

    // Contiguity failsafe: adjust start if it overlaps with previous section
    if (startIdx <= prevEndIndex) {
      startIdx = prevEndIndex + 1;
    }

    // Skip sections that are empty after adjustment
    if (endIdx < startIdx) {
      console.warn(`[buildChunksFromSections] Skipping "${section.heading}": endIdx ${endIdx} < startIdx ${startIdx} after adjustment`);
      continue;
    }

    const chunkSentences = sentences.slice(startIdx, endIdx + 1);
    const texts = chunkSentences.map((s) => s.text);
    const pageStart = Math.min(...chunkSentences.map((s) => s.pageNumber));
    const pageEnd = Math.max(...chunkSentences.map((s) => s.pageNumber));

    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      sentences: texts,
      text: texts.join(' '),
      pageStart,
      pageEnd,
      heading: section.heading,
      summary: section.summary,
    });

    console.log(`[buildChunksFromSections] Section "${section.heading}": indices [${startIdx}–${endIdx}], ${chunkSentences.length} sentences, pages ${pageStart}–${pageEnd}`);
    prevEndIndex = endIdx;
  }

  return chunks;
}
