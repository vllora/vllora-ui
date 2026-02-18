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

  // Build rawText from page texts (for LLM section matching)
  const rawText = pages.map((p) => p.text).join('\n\n');

  // -------------------------------------------------------------------------
  // PRIMARY PATH: LLM section identification with native PDF
  // -------------------------------------------------------------------------
  try {
    onProgress?.({ step: 'Analyzing document structure with AI...', percent: 40 });

    const sections = await extractSectionsWithLLM(
      rawText, totalPages, objective, comment, base64Data, filename,
    );

    if (sections.length === 0) {
      throw new Error('LLM returned no sections');
    }

    onProgress?.({ step: 'Mapping sections to text...', percent: 75 });

    const chunks = buildChunksFromSections(sections, rawText, sentences);

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
// LLM Section Extraction (used by primary path)
// ---------------------------------------------------------------------------

const SECTION_LLM_MODEL = 'openai/gpt-5-mini';

const SECTION_LLM_SYSTEM = `You are a document structure analyzer.

{{OBJECTIVE_BLOCK}}

Identify the logical sections of this document that are most useful for the training objective above.

For each section provide:
- "heading": short descriptive title (max 10 words)
- "summary": 4-5 sentence summary
- "start_text": exact first ~40 chars of the section (copy-paste from document)
- "end_text": exact last ~40 chars of the section (copy-paste from document)

Rules:
- 5-20 sections depending on document length
- Follow the document's own structure (Articles, Chapters, Sections)
- Group content by what's relevant to the training objective
- Don't create sections smaller than a paragraph`;

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
              start_text: { type: 'string', description: 'Exact first ~40 chars of this section (copy-paste from document)' },
              end_text: { type: 'string', description: 'Exact last ~40 chars of this section (copy-paste from document)' },
            },
            required: ['heading', 'summary', 'start_text', 'end_text'],
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
  start_text: string;
  end_text: string;
}

/**
 * Single LLM call to identify proper document sections from the full text.
 * Returns section boundaries that can be matched against the sentence array.
 */
async function extractSectionsWithLLM(
  rawText: string,
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

  // Build user content: prefer sending the actual PDF file when available
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
        text: `Analyze this ${totalPages}-page document and identify its sections.`,
      } as TextContentBlock,
    ];
    console.log(`[extraction] Sending PDF as file content block: ${filename || 'document.pdf'}`);
  } else {
    userContent = `Document (${totalPages} pages):\n\n${rawText}`;
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
 * Match LLM-identified sections against the raw document text using start_text/end_text anchors,
 * then collect sentences that fall within each section's character range.
 */
function buildChunksFromSections(
  sections: LLMSection[],
  rawText: string,
  sentences: SentenceWithPage[],
): SemanticChunk[] {
  if (sections.length === 0 || sentences.length === 0) return [];

  const rawLower = rawText.toLowerCase();

  // Build a character-position index for each sentence in the raw text.
  // For each sentence, find its position in rawText so we can map char ranges → sentences.
  const sentencePositions: Array<{ start: number; end: number }> = [];
  let searchFrom = 0;
  for (const sent of sentences) {
    const sentLower = sent.text.toLowerCase().trim();
    // Find the first ~30 chars of the sentence in rawText (enough to be unique)
    const needle = sentLower.slice(0, Math.min(30, sentLower.length));
    let pos = rawLower.indexOf(needle, searchFrom);
    if (pos < 0) {
      // Fallback: search from beginning (sentence might be out of order due to page joins)
      pos = rawLower.indexOf(needle);
    }
    if (pos >= 0) {
      sentencePositions.push({ start: pos, end: pos + sentLower.length });
      searchFrom = pos + 1; // Advance to avoid matching the same spot
    } else {
      // Could not find sentence — use -1 as sentinel
      sentencePositions.push({ start: -1, end: -1 });
    }
  }

  // For each section, find char positions of start_text and end_text in rawText
  const chunks: SemanticChunk[] = [];
  for (const section of sections) {
    const startTarget = section.start_text.toLowerCase().trim();
    const endTarget = section.end_text.toLowerCase().trim();

    const startPos = rawLower.indexOf(startTarget);
    let endPos = rawLower.indexOf(endTarget);

    if (startPos < 0) {
      console.warn(`[buildChunksFromSections] Could not find start_text: "${section.start_text.slice(0, 50)}"`);
      continue;
    }

    // If end_text not found, fall back to end of document
    let sectionEndPos: number;
    if (endPos < 0) {
      console.warn(`[buildChunksFromSections] Could not find end_text: "${section.end_text.slice(0, 50)}", using document end`);
      sectionEndPos = rawText.length;
    } else {
      sectionEndPos = endPos + endTarget.length;
    }

    // Ensure end is after start
    if (sectionEndPos <= startPos) {
      sectionEndPos = rawText.length;
    }

    // Collect all sentences whose position falls within [startPos, sectionEndPos)
    const chunkSentences: SentenceWithPage[] = [];
    for (let i = 0; i < sentences.length; i++) {
      const sp = sentencePositions[i];
      if (sp.start < 0) continue; // Couldn't map this sentence
      // Sentence is in range if it starts within the section boundary
      if (sp.start >= startPos && sp.start < sectionEndPos) {
        chunkSentences.push(sentences[i]);
      }
    }

    if (chunkSentences.length === 0) continue;

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

    console.log(`[buildChunksFromSections] Section "${section.heading}": ${chunkSentences.length} sentences, pages ${pageStart}-${pageEnd}`);
  }

  return chunks;
}
