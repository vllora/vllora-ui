/**
 * Shared utilities for knowledge source display.
 */

import type { KnowledgeSourcePart } from "@/types/knowledge-types";

/**
 * Extract a human-readable page range from a part's extraction metadata.
 * Returns "p.4" for single page, "pp.3-7" for range, null if no page info.
 */
export function extractPageRange(part: KnowledgeSourcePart): string | null {
  const meta = part.extractionMetadata as Record<string, unknown> | undefined;
  if (!meta) return null;

  // Handle `pages` array (e.g. [4] or [3,4,5])
  const pages = meta.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    const nums = pages.filter((p): p is number => typeof p === "number");
    if (nums.length === 1) return `p.${nums[0]}`;
    if (nums.length > 1) return `pp.${Math.min(...nums)}-${Math.max(...nums)}`;
  }
  // Handle single `pages` value
  if (typeof pages === "number") return `p.${pages}`;
  if (typeof pages === "string") return `p.${pages}`;

  // Handle pageStart/pageEnd
  const pageStart = meta.pageStart as number | undefined;
  const pageEnd = meta.pageEnd as number | undefined;
  if (pageStart !== undefined && pageEnd !== undefined && pageStart !== pageEnd) {
    return `pp.${pageStart}-${pageEnd}`;
  }
  if (pageStart !== undefined) return `p.${pageStart}`;
  return null;
}

/**
 * Convert an extraction path slug into a human-readable section name.
 *
 * Input:  "fda-allergen-labeling-falcpa/contains-nonbinding-recommendations"
 * Output: "Contains Nonbinding Recommendations"
 *
 * Strips the document-name prefix if it matches `docSlug`.
 */
export function formatExtractionPath(
  path: string | null | undefined,
  docSlug?: string,
): string {
  if (!path) return "";

  let segments = path.split("/");

  // Strip doc-name prefix segment if it matches
  if (docSlug && segments.length > 1) {
    const firstLower = segments[0].toLowerCase();
    const slugLower = docSlug.toLowerCase().replace(/\s+/g, "-");
    if (firstLower === slugLower || firstLower.startsWith(slugLower)) {
      segments = segments.slice(1);
    }
  }

  // Convert each segment from slug to title case
  return segments
    .map((seg) =>
      seg
        .split("-")
        .map((word) => {
          if (word.length === 0) return "";
          // Keep short uppercase words like "FDA", "FD&C" as-is
          if (word.length <= 3 && word === word.toUpperCase()) return word;
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" "),
    )
    .join(" > ");
}

/**
 * Extract quality indicators from a part's extraction metadata.
 * Returns null if no quality data is available.
 */
export function extractQualityInfo(part: KnowledgeSourcePart): {
  confidence?: number;
  wordCount?: number;
  charCount: number;
  quality: "good" | "short" | "minimal";
} | null {
  const charCount = part.content?.length ?? 0;
  if (charCount === 0) return null;

  const meta = part.extractionMetadata as Record<string, unknown> | undefined;
  const confidence = typeof meta?.confidence === "number" ? meta.confidence : undefined;
  const wordCount = typeof meta?.word_count === "number" ? meta.word_count : undefined;

  // Quality heuristic based on content length
  const quality: "good" | "short" | "minimal" =
    charCount >= 200 ? "good" : charCount >= 50 ? "short" : "minimal";

  return { confidence, wordCount, charCount, quality };
}

/**
 * Count parts by relevance status.
 */
export function countByRelevance(parts: readonly KnowledgeSourcePart[]): {
  relevant: number;
  excluded: number;
  unclassified: number;
} {
  let relevant = 0;
  let excluded = 0;
  let unclassified = 0;
  for (const p of parts) {
    if (p.relevant === true) relevant++;
    else if (p.relevant === false) excluded++;
    else unclassified++;
  }
  return { relevant, excluded, unclassified };
}
