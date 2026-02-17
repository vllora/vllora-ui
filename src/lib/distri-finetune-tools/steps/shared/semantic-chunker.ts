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

/**
 * Clean raw PDF text: fix hyphenated line breaks, normalize whitespace,
 * remove common header/footer patterns.
 */
export function preprocessText(raw: string): string {
  let text = raw;

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
