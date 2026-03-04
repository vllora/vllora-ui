/**
 * Semantic Chunker
 *
 * Text preprocessing, wink-nlp sentence splitting, cosine similarity,
 * and sliding-window clustering for semantic document chunking.
 */

import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// Initialize wink-nlp once
const nlp = winkNLP(model);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentenceWithPage {
  text: string;
  pageNumber: number;
}

export interface SemanticChunk {
  id: string;
  sentences: string[];
  text: string;
  pageStart: number;
  pageEnd: number;
  heading: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Text Preprocessing
// ---------------------------------------------------------------------------

/** Minimum non-space characters to attempt doubled-character detection. */
const MIN_DOUBLED_DETECT_CHARS = 6;

/**
 * Ratio threshold for doubled-character detection.
 * If >70% of consecutive character-pairs in a line are identical,
 * the line is treated as a pdfjs duplicate-glyph artifact.
 */
const DOUBLED_RATIO_THRESHOLD = 0.7;

/**
 * Ratio threshold for garbage-line detection.
 * If <30% of a line's non-space characters are alphabetic (a-zA-Z),
 * the line is likely diagram/symbol garbage and is stripped.
 */
const GARBAGE_ALPHA_THRESHOLD = 0.3;

/**
 * Detect and fix doubled characters from pdfjs overlapping text extraction.
 *
 * Some PDFs render each glyph twice at the same position (fake bold, shadow).
 * pdfjs concatenates both, producing "TTeenn sstteeppss" instead of
 * "Ten steps". We detect lines where ≥70 % of character-pairs are duplicates
 * and collapse them.
 */
function fixDoubledCharacters(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const chars = line.replace(/\s/g, '');
      if (chars.length < MIN_DOUBLED_DETECT_CHARS) return line;

      const totalPairs = Math.floor(chars.length / 2);
      let doubledPairs = 0;
      for (let i = 0; i < chars.length - 1; i += 2) {
        if (chars[i] === chars[i + 1]) doubledPairs++;
      }

      if (doubledPairs / totalPairs <= DOUBLED_RATIO_THRESHOLD) return line;

      // Collapse consecutive same-character pairs: "TTeenn" → "Ten"
      return line.replace(/(.)\1/g, '$1');
    })
    .join('\n');
}

/**
 * Strip inline garbage that appears mixed with valid text:
 *   - Control characters (\x00–\x08, \x0B, \x0C, \x0E–\x1F)
 *   - Runs of 3+ identical non-alphanumeric characters (diagram borders: `"""""""`)
 *   - Sequences of consecutive special characters (residual symbol noise)
 *
 * Font-level filtering in the PDF extractor handles the bulk of diagram/symbol
 * removal. This is a general-purpose safety net for any residual fragments.
 */
function stripInlineGarbage(text: string): string {
  let result = text;

  // Remove control characters (keep \t, \n, \r)
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Remove runs of 3+ identical non-alphanumeric characters ("""""", ###, etc.)
  result = result.replace(/([^a-zA-Z0-9\s])\1{2,}/g, '');

  // Remove sequences of 3+ consecutive special characters (residual diagram/symbol
  // noise that wasn't caught by font-level filtering in the PDF extractor).
  result = result.replace(
    /(?:[^a-zA-Z0-9\s.,;:!?()\-–—]{2,}[a-zA-Z0-9]?){2,}/g,
    ' ',
  );

  return result;
}

/**
 * Remove lines that are mostly non-alphabetic.
 *
 * Chess PDFs (and others using symbol fonts for diagrams) extract as ASCII
 * garbage like "$H*E@'*;% & < <*< <%". We check the ratio of alphabetic
 * characters among non-space characters — if below 30 %, the line is garbage.
 * This avoids the false-positive from punctuation/spaces inflating the ratio.
 */
function removeGarbageLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true; // keep blank lines for paragraph structure

      const nonSpace = trimmed.replace(/\s/g, '');
      if (!nonSpace) return false;

      // Ratio of alphabetic chars among non-space chars
      const alphaCount = nonSpace.replace(/[^a-zA-Z]/g, '').length;
      return alphaCount / nonSpace.length >= GARBAGE_ALPHA_THRESHOLD;
    })
    .join('\n');
}

/**
 * Clean raw PDF text: strip inline garbage, deduplicate glyphs,
 * strip garbage lines, fix hyphenated line breaks, and normalise whitespace.
 */
export function preprocessText(raw: string): string {
  let text = raw;

  // Strip inline garbage (control chars, diagram font sequences) first
  text = stripInlineGarbage(text);

  // Fix doubled characters from pdfjs overlapping text
  text = fixDoubledCharacters(text);

  // Strip lines that are mostly non-alphanumeric (diagram fonts, etc.)
  text = removeGarbageLines(text);

  // Fix hyphenated line breaks (e.g., "docu-\nment" → "document")
  text = text.replace(/(\w)-\n(\w)/g, '$1$2');

  // Collapse multiple newlines into double newline (paragraph break)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Normalize whitespace within lines (but preserve paragraph breaks)
  text = text.replace(/[ \t]+/g, ' ');

  // Remove common page header/footer patterns (e.g., "Page 5 of 20")
  text = text.replace(/\bPage\s+\d+\s+(of\s+\d+)?\s*/gi, '');

  // Trim lines
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  return text.trim();
}

// ---------------------------------------------------------------------------
// Sentence Splitting
// ---------------------------------------------------------------------------

/**
 * Split text into sentences using wink-nlp.
 */
export function splitSentences(text: string): string[] {
  const doc = nlp.readDoc(text);
  const sentences = doc.sentences().out();
  // Filter out very short fragments (< 10 chars)
  return sentences.filter((s: string) => s.trim().length >= 10);
}

/**
 * Split page-attributed text into sentences, preserving page numbers.
 * Input: array of { text, pageNumber } per page.
 * Output: flat array of SentenceWithPage.
 */
export function splitSentencesWithPages(
  pages: Array<{ text: string; pageNumber: number }>
): SentenceWithPage[] {
  const result: SentenceWithPage[] = [];

  for (const page of pages) {
    const cleaned = preprocessText(page.text);
    if (!cleaned) continue;

    const sentences = splitSentences(cleaned);
    for (const s of sentences) {
      result.push({ text: s, pageNumber: page.pageNumber });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cosine Similarity
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Sliding-Window Clustering
// ---------------------------------------------------------------------------

const DEFAULT_SIMILARITY_THRESHOLD = 0.3;
const MIN_CHUNK_SENTENCES = 5;
const MAX_CHUNK_SENTENCES = 60;

/**
 * Cluster sentences into semantic chunks using a sliding-window approach.
 *
 * Compares consecutive sentence embeddings; when similarity drops below
 * the threshold, a new chunk boundary is created. Preserves document order.
 */
export function clusterSentences(
  sentences: SentenceWithPage[],
  embeddings: number[][],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): SemanticChunk[] {
  if (sentences.length === 0) return [];

  const chunks: SemanticChunk[] = [];
  let currentSentences: SentenceWithPage[] = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const sim = cosineSimilarity(embeddings[i - 1], embeddings[i]);
    const atMaxSize = currentSentences.length >= MAX_CHUNK_SENTENCES;

    if ((sim < threshold && currentSentences.length >= MIN_CHUNK_SENTENCES) || atMaxSize) {
      // Finalize current chunk
      chunks.push(buildChunk(currentSentences, chunks.length + 1));
      currentSentences = [sentences[i]];
    } else {
      currentSentences.push(sentences[i]);
    }
  }

  // Finalize last chunk
  if (currentSentences.length > 0) {
    chunks.push(buildChunk(currentSentences, chunks.length + 1));
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChunk(sentences: SentenceWithPage[], index: number): SemanticChunk {
  const texts = sentences.map((s) => s.text);
  const fullText = texts.join(' ');
  const pageStart = Math.min(...sentences.map((s) => s.pageNumber));
  const pageEnd = Math.max(...sentences.map((s) => s.pageNumber));

  // Heading: first sentence, truncated to 80 chars
  const heading = texts[0].length > 80 ? texts[0].slice(0, 77) + '...' : texts[0];

  // Summary: first 1-2 sentences
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
