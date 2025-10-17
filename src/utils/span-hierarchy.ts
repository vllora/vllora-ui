import { Span } from '@/types/common-type';

/**
 * Builds a hierarchical tree from a flat list of spans
 *
 * This function takes a flat array of spans and constructs a tree structure
 * based on the parent_span_id relationships. Spans without a parent_span_id
 * are considered root spans.
 *
 * @param spans - Flat array of spans to build hierarchy from
 * @returns Array of root spans with nested children in the `spans` property
 *
 * @example
 * ```typescript
 * const flatSpans = [
 *   { span_id: '1', parent_span_id: null, ... },
 *   { span_id: '2', parent_span_id: '1', ... },
 *   { span_id: '3', parent_span_id: '1', ... },
 * ];
 *
 * const hierarchy = buildSpanHierarchy(flatSpans);
 * // Result: [{ span_id: '1', spans: [{ span_id: '2' }, { span_id: '3' }] }]
 * ```
 */
export function buildSpanHierarchy(spans: Span[]): Span[] {
  const spanMap = new Map<string, Span>();
  const rootSpans: Span[] = [];

  // Sort once and avoid mutating the original array
  const sortedSpans = [...spans].sort((a, b) => a.start_time_us - b.start_time_us);

  // First pass: Create map and initialize children arrays
  sortedSpans.forEach(span => {
    spanMap.set(span.span_id, { ...span, spans: [] });
  });

  // Second pass: Build hierarchy
  sortedSpans.forEach(span => {
    const spanWithChildren = spanMap.get(span.span_id)!;

    if (!span.parent_span_id) {
      // Root span
      rootSpans.push(spanWithChildren);
    } else {
      // Child span - add to parent
      const parent = spanMap.get(span.parent_span_id);
      if (parent) {
        parent.spans = parent.spans || [];
        parent.spans.push(spanWithChildren);
      } else {
        // Parent not found, treat as root
        rootSpans.push(spanWithChildren);
      }
    }
  });

  // Sort children recursively
  rootSpans.forEach(root => sortSpanChildren(root));

  return rootSpans;
}

/**
 * Recursively sorts children of a span by start_time_us
 *
 * @param span - The span whose children should be sorted
 */
function sortSpanChildren(span: Span) {
  if (span.spans && span.spans.length > 0) {
    span.spans.sort((a, b) => a.start_time_us - b.start_time_us);
    span.spans.forEach(child => sortSpanChildren(child));
  }
}

/**
 * Flattens a hierarchical span tree into a flat array
 * Useful for converting hierarchical view back to flat list
 *
 * @param spans - Array of hierarchical spans
 * @returns Flat array of all spans (including nested children)
 *
 * @example
 * ```typescript
 * const hierarchy = buildSpanHierarchy(flatSpans);
 * const flattened = flattenSpanHierarchy(hierarchy);
 * // Back to flat list sorted by timestamp
 * ```
 */
export function flattenSpanHierarchy(spans: Span[]): Span[] {
  const flat: Span[] = [];

  function traverse(span: Span) {
    flat.push(span);
    if (span.spans && span.spans.length > 0) {
      span.spans.forEach(traverse);
    }
  }

  spans.forEach(traverse);
  return flat.sort((a, b) => a.start_time_us - b.start_time_us);
}
