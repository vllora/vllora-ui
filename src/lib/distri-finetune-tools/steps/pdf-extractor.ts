/**
 * PDF Content Extractor
 *
 * Uses pdfjs-dist to extract text content from PDF files.
 * Works client-side without requiring a backend server.
 *
 * Supports two extraction modes:
 * - 'basic': Fast, regex-based extraction (original implementation)
 * - 'llm': LLM-assisted extraction for better quality (default)
 */

import * as pdfjsLib from 'pdfjs-dist';
import { extractContentWithLLM } from './pdf-llm-extractor';

// Configure the worker source
// In Vite/modern bundlers, we can use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// =============================================================================
// Types
// =============================================================================

export interface PdfExtractionResult {
  /** Full extracted text */
  text: string;
  /** Extracted sections (based on heading detection) */
  sections: Array<{
    title: string;
    content: string;
    level: number;
    pageNumber: number;
  }>;
  /** Metadata from the PDF */
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    pageCount: number;
    creationDate?: string;
    /** Document type (from LLM extraction) */
    documentType?: string;
    /** Document summary (from LLM extraction) */
    documentSummary?: string;
  };
  /** Detected topics/keywords */
  topics: string[];
}

export interface PdfExtractionOptions {
  /** Maximum pages to extract (default: all) */
  maxPages?: number;
  /** Whether to attempt section detection (default: true) */
  detectSections?: boolean;
  /**
   * Extraction mode:
   * - 'basic': Fast, regex-based extraction (original implementation)
   * - 'llm': LLM-assisted extraction for better quality (default)
   */
  extractionMode?: 'basic' | 'llm';
}

// =============================================================================
// Text Processing Helpers
// =============================================================================

/**
 * Detect if a line is likely a heading/title based on common patterns
 */
function isLikelyHeading(line: string, _prevLine: string, nextLine: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 100) return false;

  // Check for common heading patterns
  const patterns = [
    /^(chapter|section|part)\s+\d+/i,
    /^\d+\.\s+[A-Z]/,
    /^[IVXLCDM]+\.\s+/,
    /^[A-Z][A-Z\s]+$/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(trimmed)) return true;
  }

  // Short line followed by longer content might be a heading
  if (trimmed.length < 50 && !trimmed.endsWith('.') && nextLine && nextLine.length > trimmed.length * 2) {
    return true;
  }

  return false;
}

/**
 * Extract topics/keywords from text using simple heuristics
 */
function extractTopics(text: string): string[] {
  const topics = new Set<string>();

  // Find capitalized phrases (potential proper nouns/topics)
  const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match;
  while ((match = capitalizedPattern.exec(text)) !== null) {
    const phrase = match[1];
    // Filter out common words and keep meaningful phrases
    if (phrase.length > 3 && !['The', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What', 'Which'].includes(phrase)) {
      topics.add(phrase);
    }
  }

  // Find quoted terms
  const quotedPattern = /"([^"]+)"/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    if (match[1].length > 2 && match[1].length < 50) {
      topics.add(match[1]);
    }
  }

  // Limit to top topics by frequency or uniqueness
  return Array.from(topics).slice(0, 20);
}

// =============================================================================
// Main Extraction Function
// =============================================================================

/**
 * Extract text and structure from a PDF file
 *
 * @param base64Data - Base64 encoded PDF data
 * @param options - Extraction options
 * @returns Extracted content with text, sections, and metadata
 */
export async function extractPdfContent(
  base64Data: string,
  options: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
  const { maxPages, detectSections = true, extractionMode = 'llm' } = options;

  try {
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    // Get metadata
    const metadataObj = await pdf.getMetadata();
    const info = metadataObj.info as Record<string, unknown> || {};

    const metadata: PdfExtractionResult['metadata'] = {
      title: info.Title as string | undefined,
      author: info.Author as string | undefined,
      subject: info.Subject as string | undefined,
      pageCount: pdf.numPages,
      creationDate: info.CreationDate as string | undefined,
    };

    // Extract text from each page
    const pageTexts: string[] = [];
    const pagesToProcess = maxPages ? Math.min(maxPages, pdf.numPages) : pdf.numPages;

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Combine text items with proper spacing
      let pageText = '';
      let lastY: number | null = null;

      for (const item of textContent.items) {
        if ('str' in item) {
          const textItem = item as { str: string; transform: number[] };
          const currentY = textItem.transform[5];

          // Add newline if Y position changed significantly (new line)
          if (lastY !== null && Math.abs(currentY - lastY) > 5) {
            pageText += '\n';
          } else if (pageText && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
            pageText += ' ';
          }

          pageText += textItem.str;
          lastY = currentY;
        }
      }

      pageTexts.push(pageText);
    }

    // Combine all page texts
    const fullText = pageTexts.join('\n\n--- Page Break ---\n\n');

    // Use LLM extraction mode (default) or basic mode
    if (extractionMode === 'llm') {
      console.log('[extractPdfContent] Using LLM-assisted extraction');
      try {
        const llmResult = await extractContentWithLLM(fullText);

        // Convert LLM sections to our format
        const sections: PdfExtractionResult['sections'] = llmResult.sections.map((s, idx) => ({
          title: s.title,
          content: s.summary + (s.key_concepts.length > 0 ? `\n\nKey concepts: ${s.key_concepts.join(', ')}` : ''),
          level: s.level,
          pageNumber: idx + 1, // Approximate
        }));

        return {
          text: fullText,
          sections,
          metadata: {
            ...metadata,
            documentType: llmResult.document_type,
            documentSummary: llmResult.document_summary,
          },
          topics: llmResult.topics,
        };
      } catch (llmError) {
        console.warn('[extractPdfContent] LLM extraction failed, falling back to basic:', llmError);
        // Fall through to basic extraction
      }
    }

    // Basic extraction mode (original implementation)
    console.log('[extractPdfContent] Using basic extraction');
    const sections: PdfExtractionResult['sections'] = [];
    if (detectSections) {
      const lines = fullText.split('\n');
      let currentSection: { title: string; content: string[]; level: number; pageNumber: number } | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prevLine = i > 0 ? lines[i - 1] : '';
        const nextLine = i < lines.length - 1 ? lines[i + 1] : '';

        // Estimate page number based on position
        const pageNum = Math.floor(i / (lines.length / pagesToProcess)) + 1;

        if (isLikelyHeading(line, prevLine, nextLine)) {
          // Save previous section
          if (currentSection && currentSection.content.length > 0) {
            sections.push({
              title: currentSection.title,
              content: currentSection.content.join('\n').trim(),
              level: currentSection.level,
              pageNumber: currentSection.pageNumber,
            });
          }

          // Determine heading level (1 for chapter, 2 for section, etc.)
          let level = 2;
          if (/^(chapter|part)\s+/i.test(line.trim())) level = 1;
          if (/^\d+\.\d+/.test(line.trim())) level = 3;

          currentSection = {
            title: line.trim(),
            content: [],
            level,
            pageNumber: pageNum,
          };
        } else if (currentSection) {
          currentSection.content.push(line);
        }
      }

      // Save final section
      if (currentSection && currentSection.content.length > 0) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join('\n').trim(),
          level: currentSection.level,
          pageNumber: currentSection.pageNumber,
        });
      }
    }

    // Extract topics (basic mode)
    const topics = extractTopics(fullText);

    return {
      text: fullText,
      sections,
      metadata,
      topics,
    };
  } catch (error) {
    console.error('[extractPdfContent] Failed to extract PDF:', error);
    throw new Error(
      `Failed to extract PDF content: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if pdfjs-dist is available and working
 */
export async function isPdfExtractionAvailable(): Promise<boolean> {
  try {
    // Simple check that the library is loaded
    return typeof pdfjsLib.getDocument === 'function';
  } catch {
    return false;
  }
}
