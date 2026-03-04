/**
 * Semantic PDF Extractor — Local-First with LLM Enrichment
 *
 * Pipeline:
 *   PDF (base64) → pdfjs-dist text extraction (local)
 *     → text cleanup → wink-nlp sentence splitting (local)
 *     → heading-based section detection (local, regex)
 *     → FALLBACK: embedding clustering if no headings found (local)
 *     → batch LLM enrichment for chunk headings + summaries (small calls)
 *     → structured markdown
 *
 * This approach:
 *   - Extracts text 100% locally (pdfjs, no LLM)
 *   - Chunks locally by detecting heading patterns (no LLM)
 *   - Only uses LLM for lightweight per-chunk enrichment (small batched calls)
 *   - Falls back to embedding-based clustering for unstructured documents
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
// Configure pdf.js worker (use bundled worker from pdfjs-dist)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ---------------------------------------------------------------------------
// Chunk limits
// ---------------------------------------------------------------------------

/**
 * Maximum number of chunks sent to LLM enrichment.
 * Embedding clustering can produce hundreds of tiny chunks for large PDFs
 * (e.g. 201 chunks for a 2.7 MB PDF). Each chunk costs one LLM call,
 * so we cap and merge the smallest adjacent pairs to stay under budget.
 */
const MAX_ENRICHED_CHUNKS = 50;

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
    // objective and comment reserved for future per-chunk context enrichment
    objective: _objective,
    comment: _comment,
    allowFallback: _allowFallback = true,
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

    // Build page text, deduplicating overlapping text items.
    // Some PDFs render each glyph twice at the same position (fake bold
    // via double-strike). We skip items whose position matches the
    // previous item within a 0.5 pt tolerance.
    const parts: string[] = [];
    let prevItemX = -Infinity;
    let prevItemY = -Infinity;
    let prevItemStr = '';

    for (const item of textContent.items) {
      if (!('str' in item)) continue;

      // Position-based dedup for overlapping text
      const transform = 'transform' in item ? (item.transform as number[]) : null;
      if (transform) {
        const x = transform[4];
        const y = transform[5];
        if (
          Math.abs(x - prevItemX) < 0.5 &&
          Math.abs(y - prevItemY) < 0.5 &&
          item.str === prevItemStr
        ) {
          continue; // skip duplicate at same position
        }
        prevItemX = x;
        prevItemY = y;
        prevItemStr = item.str;
      }

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
  // LOCAL CHUNKING: heading detection → fallback to embeddings
  // -------------------------------------------------------------------------

  // Step 4: Try heading-based section detection (purely local, no LLM)
  onProgress?.({ step: 'Detecting document structure...', percent: 40 });

  let chunks: SemanticChunk[] = chunkByHeadings(sentences);
  let chunkingMethod: 'headings' | 'embeddings' = 'headings';

  console.log(`[semantic-pdf-extractor] Heading detection found ${chunks.length} chunks`);

  // If heading detection found too few sections, fall back to embeddings
  if (chunks.length < 3) {
    chunkingMethod = 'embeddings';
    console.log(`[semantic-pdf-extractor] Too few heading-based chunks (${chunks.length}), falling back to embedding clustering`);

    onProgress?.({ step: 'Generating embeddings...', percent: 45 });

    const sentenceTexts = sentences.map((s) => s.text);
    const embeddings = await embed(sentenceTexts, (info) => {
      if (info.status === 'progress' && info.progress !== undefined) {
        onProgress?.({
          step: `Loading embedding model... ${Math.round(info.progress)}%`,
          percent: 45 + Math.round(info.progress * 0.2),
        });
      }
    });

    onProgress?.({ step: 'Clustering sentences...', percent: 65 });
    chunks = clusterSentences(sentences, embeddings, similarityThreshold);

    // Cap chunk count — embedding clustering can produce 200+ tiny chunks
    // for large PDFs. Merge smallest adjacent pairs to stay under budget.
    if (chunks.length > MAX_ENRICHED_CHUNKS) {
      console.log(
        `[semantic-pdf-extractor] Merging ${chunks.length} clusters → ${MAX_ENRICHED_CHUNKS} max`,
      );
      chunks = mergeChunksToLimit(chunks, MAX_ENRICHED_CHUNKS);
    }
  }

  // Step 5: Generate structured markdown
  // Headings and summaries are already set by buildChunk() (heuristic: first
  // sentence as heading, first 1-2 sentences as summary). Research shows this
  // matches what LangChain, LlamaIndex, and Unstructured use — no LLM needed.
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
      chunkingMethod,
      totalChunks: chunks.length,
      totalPages,
      chunks,
    },
  };
}

// ---------------------------------------------------------------------------
// Chunk Merging (cap embedding-clustered chunks)
// ---------------------------------------------------------------------------

/**
 * Merge adjacent chunks until count ≤ limit.
 *
 * Strategy: repeatedly find the smallest chunk (by word count) and merge it
 * with its smaller neighbor (left or right). This preserves document order
 * while eliminating the tiniest fragments first.
 */
function mergeChunksToLimit(
  input: readonly SemanticChunk[],
  limit: number,
): SemanticChunk[] {
  const chunks = input.map((c) => ({ ...c, sentences: [...c.sentences] }));

  while (chunks.length > limit) {
    // Find the smallest chunk by word count
    let minIdx = 0;
    let minWords = Infinity;
    for (let i = 0; i < chunks.length; i++) {
      const words = chunks[i].text.split(/\s+/).length;
      if (words < minWords) {
        minWords = words;
        minIdx = i;
      }
    }

    // Pick merge direction: prefer smaller neighbor, fallback to right then left
    const leftIdx = minIdx - 1;
    const rightIdx = minIdx + 1;
    const leftWords =
      leftIdx >= 0 ? chunks[leftIdx].text.split(/\s+/).length : Infinity;
    const rightWords =
      rightIdx < chunks.length
        ? chunks[rightIdx].text.split(/\s+/).length
        : Infinity;

    const mergeWithIdx = leftWords <= rightWords ? leftIdx : rightIdx;
    const [keepIdx, removeIdx] =
      mergeWithIdx < minIdx
        ? [mergeWithIdx, minIdx]
        : [minIdx, mergeWithIdx];

    // Merge: append remove into keep (preserves order)
    const keep = chunks[keepIdx];
    const remove = chunks[removeIdx];
    chunks[keepIdx] = {
      id: keep.id,
      sentences: [...keep.sentences, ...remove.sentences],
      text: keep.text + ' ' + remove.text,
      pageStart: Math.min(keep.pageStart, remove.pageStart),
      pageEnd: Math.max(keep.pageEnd, remove.pageEnd),
      heading: keep.heading,
      summary: keep.summary,
    };
    chunks.splice(removeIdx, 1);
  }

  // Re-number chunk IDs
  for (let i = 0; i < chunks.length; i++) {
    chunks[i] = { ...chunks[i], id: `chunk-${i + 1}` };
  }

  return chunks;
}

// NOTE: LLM enrichment removed — research showed that heuristic headings
// (first sentence) + heuristic summaries (first 1-2 sentences) from buildChunk
// match what LangChain, LlamaIndex, and Unstructured use in production.
// This makes extraction 100% local with zero API calls.

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
// Heading-Based Chunking (Local, No LLM)
// ---------------------------------------------------------------------------

/** Target ~500 words per chunk; hard-split at 1000 words; merge chunks below 150. */
const TARGET_CHUNK_WORDS = 500;
const MAX_CHUNK_WORDS = 1000;
const MIN_CHUNK_WORDS = 150;
const MIN_HEADING_SECTIONS = 3;

/**
 * Patterns that identify heading-like sentences in extracted PDF text.
 *
 * Order matters — earlier patterns are more specific and checked first.
 */
const HEADING_PATTERNS: RegExp[] = [
  /^#{1,3}\s+.+/,                             // Markdown: # Heading
  /^(?:chapter|part)\s+[\divxlc]+/i,          // Chapter / Part markers
  /^(?:section|article|appendix)\s+\d+/i,     // Section / Article / Appendix
  /^\d+(?:\.\d+)*\s+[A-Z]/,                   // Numbered: "1.2 Title" or "3.1.4 Details"
  /^[A-Z][A-Z\s]{8,}$/,                       // ALL CAPS (≥ ~3 words)
];

/**
 * Heuristic: does `text` look like a section heading?
 *
 * Checks explicit patterns first, then falls back to a length / punctuation
 * heuristic for short, capitalised lines without sentence-ending punctuation.
 */
function isLikelyHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 150) return false;

  // Check explicit heading patterns
  for (const pattern of HEADING_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Short line, starts with a capital, no sentence-ending punctuation → possible heading.
  // Be conservative: max 60 chars, 3-8 words, must have at least one letter after first word
  // to avoid matching chess moves, figure captions, and other short fragments.
  if (
    trimmed.length < 60 &&
    !/[.!?;,:]$/.test(trimmed) &&
    /^[A-Z]/.test(trimmed)
  ) {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 3 && wordCount <= 8) return true;
  }

  return false;
}

/**
 * Build a SemanticChunk from a slice of sentences.
 *
 * heading / summary are preliminary — the LLM enrichment step (enrichChunksWithLLM)
 * will overwrite them with better versions.
 */
function buildChunkFromSentences(
  sentences: SentenceWithPage[],
  index: number,
  headingText?: string,
): SemanticChunk {
  const texts = sentences.map((s) => s.text);
  const fullText = texts.join(' ');
  const pageStart = Math.min(...sentences.map((s) => s.pageNumber));
  const pageEnd = Math.max(...sentences.map((s) => s.pageNumber));

  const heading = headingText
    ? (headingText.length > 80 ? headingText.slice(0, 77) + '...' : headingText)
    : (texts[0].length > 80 ? texts[0].slice(0, 77) + '...' : texts[0]);

  const summary = texts.slice(0, 2).join(' ');

  return {
    id: `chunk-${index}`,
    sentences: texts,
    text: fullText,
    pageStart,
    pageEnd,
    heading,
    summary,
  };
}

/**
 * Chunk sentences by detecting heading patterns in the text.
 *
 * 1. Scan sentences for heading-like patterns (ALL CAPS, numbered sections, etc.)
 * 2. Split at heading boundaries
 * 3. Sub-split sections > MAX_CHUNK_WORDS at ~TARGET_CHUNK_WORDS boundaries
 * 4. Return SemanticChunk[] with preliminary headings/summaries
 *
 * Returns [] (empty) when fewer than MIN_HEADING_SECTIONS headings are found,
 * signalling to the caller to fall back to embedding-based clustering.
 */
function chunkByHeadings(sentences: SentenceWithPage[]): SemanticChunk[] {
  if (sentences.length === 0) return [];

  // Step 1: Find heading indices
  const headingIndices: number[] = [];
  for (let i = 0; i < sentences.length; i++) {
    if (isLikelyHeading(sentences[i].text)) {
      headingIndices.push(i);
    }
  }

  // Not enough structure detected → signal caller to use fallback
  if (headingIndices.length < MIN_HEADING_SECTIONS) {
    return [];
  }

  // Step 2: Split at heading boundaries into raw sections
  const rawSections: Array<{ headingSentence: string; sentences: SentenceWithPage[] }> = [];

  // Include any sentences before the first heading as a preamble
  if (headingIndices[0] > 0) {
    const preambleSentences = sentences.slice(0, headingIndices[0]);
    rawSections.push({
      headingSentence: preambleSentences[0].text,
      sentences: preambleSentences,
    });
  }

  for (let h = 0; h < headingIndices.length; h++) {
    const start = headingIndices[h];
    const end = h + 1 < headingIndices.length ? headingIndices[h + 1] : sentences.length;
    const sectionSentences = sentences.slice(start, end);
    rawSections.push({
      headingSentence: sentences[start].text,
      sentences: sectionSentences,
    });
  }

  // Step 3: Sub-split large sections at ~TARGET_CHUNK_WORDS boundaries
  const rawChunks: SemanticChunk[] = [];

  for (const section of rawSections) {
    const wordCount = section.sentences.reduce(
      (sum, s) => sum + s.text.split(/\s+/).length, 0,
    );

    if (wordCount <= MAX_CHUNK_WORDS) {
      // Section fits in one chunk
      rawChunks.push(
        buildChunkFromSentences(section.sentences, rawChunks.length + 1, section.headingSentence),
      );
    } else {
      // Sub-split at ~TARGET_CHUNK_WORDS boundaries
      let currentBatch: SentenceWithPage[] = [];
      let currentWords = 0;
      let isFirst = true;

      for (const sentence of section.sentences) {
        const sentenceWords = sentence.text.split(/\s+/).length;

        if (currentWords + sentenceWords > TARGET_CHUNK_WORDS && currentBatch.length >= 3) {
          const heading = isFirst ? section.headingSentence : currentBatch[0].text;
          rawChunks.push(buildChunkFromSentences(currentBatch, rawChunks.length + 1, heading));
          currentBatch = [sentence];
          currentWords = sentenceWords;
          isFirst = false;
        } else {
          currentBatch.push(sentence);
          currentWords += sentenceWords;
        }
      }

      if (currentBatch.length > 0) {
        const heading = isFirst ? section.headingSentence : currentBatch[0].text;
        rawChunks.push(buildChunkFromSentences(currentBatch, rawChunks.length + 1, heading));
      }
    }
  }

  // Step 4: Merge small chunks (< MIN_CHUNK_WORDS) with their next neighbor.
  // This handles false-positive headings (chess moves, captions, etc.) that
  // create tiny chunks. Merging keeps the chunk count reasonable for LLM enrichment.
  const chunks: SemanticChunk[] = [];
  let pendingSentences: SentenceWithPage[] = [];
  let pendingHeading: string | undefined;

  for (const chunk of rawChunks) {
    const chunkWords = chunk.text.split(/\s+/).length;

    if (chunkWords < MIN_CHUNK_WORDS && chunks.length > 0) {
      // Too small — accumulate sentences for merging into next chunk
      if (pendingSentences.length === 0) {
        pendingHeading = chunks[chunks.length - 1].heading;
      }
      // Append current small chunk's sentences to pending
      const chunkSentenceObjs: SentenceWithPage[] = chunk.sentences.map((text, idx) => ({
        text,
        pageNumber: chunk.pageStart + Math.floor(idx / Math.max(1, chunk.sentences.length) * (chunk.pageEnd - chunk.pageStart)),
      }));

      if (pendingSentences.length === 0) {
        // Pull the previous chunk back for merging
        const prev = chunks.pop()!;
        pendingHeading = prev.heading;
        pendingSentences = prev.sentences.map((text, idx) => ({
          text,
          pageNumber: prev.pageStart + Math.floor(idx / Math.max(1, prev.sentences.length) * (prev.pageEnd - prev.pageStart)),
        }));
      }

      pendingSentences.push(...chunkSentenceObjs);
    } else if (pendingSentences.length > 0) {
      // We have pending sentences from a merge — combine with this chunk
      const chunkSentenceObjs: SentenceWithPage[] = chunk.sentences.map((text, idx) => ({
        text,
        pageNumber: chunk.pageStart + Math.floor(idx / Math.max(1, chunk.sentences.length) * (chunk.pageEnd - chunk.pageStart)),
      }));
      const allSentences = [...pendingSentences, ...chunkSentenceObjs];
      chunks.push(buildChunkFromSentences(allSentences, chunks.length + 1, pendingHeading));
      pendingSentences = [];
      pendingHeading = undefined;
    } else {
      chunks.push(chunk);
    }
  }

  // Flush any remaining pending sentences
  if (pendingSentences.length > 0) {
    chunks.push(buildChunkFromSentences(pendingSentences, chunks.length + 1, pendingHeading));
  }

  // Re-number chunk IDs
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].id = `chunk-${i + 1}`;
  }

  return chunks;
}
