import { useMemo } from "react";
import { Span } from "@/types/common-type";
import { extractMessagesFromSpan } from "@/utils/span-to-message";
import { Message } from "@/types/chat";
import { getParentApiInvoke } from "@/components/chat/traces/TraceRow/span-info/DetailView";
import { buildFlowDiagramFromSpans } from "@/utils/flow-diagram";

/**
 * Hook that returns a specific span by span_id from the flattenSpans array.
 *
 * This hook is optimized to only cause a re-render when the SPECIFIC span changes,
 * not when any other span in the array changes.
 *
 * @param flattenSpans - Array of all spans
 * @param spanId - The span_id to look up
 * @returns The span with the matching span_id, or undefined if not found
 *
 * @example
 * ```tsx
 * const MyMessage = React.memo(({ spanId, flattenSpans }) => {
 *   const span = useSpanById(flattenSpans, spanId);
 *   return <div>{span?.attribute?.content}</div>;
 * });
 * ```
 */
export function useSpanById(
  flattenSpans: Span[],
  spanId: string
): Span | undefined {
  // Find the span and memoize based on its actual data, not the array reference
  const span = useMemo(() => {
    return flattenSpans.find((s) => s.span_id === spanId);
  }, [flattenSpans, spanId]);

  // Return a memoized span that only changes when the span's data actually changes
  // This prevents unnecessary re-renders when other spans in the array change
  return useMemo(() => {
    if (!span) return undefined;

    // Create a stable reference based on span's serialized data
    // This will only trigger re-render when this specific span's data changes
    return span;
  }, [
    span?.span_id,
    span?.operation_name,
    span?.start_time_us,
    span?.finish_time_us,
    span?.isInProgress,
    // Serialize attribute to detect content changes
    span?.attribute ? JSON.stringify(span.attribute) : undefined,
  ]);
}

export const useSpansInSameRun = (
  flattenSpans: Span[],
  runId: string
): Span[] => {
  return useMemo(() => {
    return flattenSpans.filter((s) => s.run_id === runId);
  }, [flattenSpans, runId]);
};

export const useApiInvokeSpanInSameRun = (props: {
  flattenSpans: Span[];
  runId: string;
}) => {
  const { flattenSpans, runId } = props;
  const spans = useSpansInSameRun(flattenSpans, runId);
  return useMemo(() => {
    return spans.filter((s) => s.operation_name === "api_invoke");
  }, [spans]);
};

export const errorFromApiInvokeSpansInSameRun = (props: {
  flattenSpans: Span[];
  runId: string;
}): string[] => {
  const { flattenSpans, runId } = props;
  const apiInvokeSpans = useApiInvokeSpanInSameRun({ flattenSpans, runId });
  return useMemo(() => {
    return apiInvokeSpans
      .map((s) => s.attribute?.error)
      .filter((e) => e) as string[];
  }, [apiInvokeSpans]);
};

export interface UniqueMessageWithHash {
  type?: string;
  model?: string;
  role?: string;
  content?: string;
  hash: string;
  tool_calls?: {
    id: string;
    [key: string]: any;
  }[];
  tool_call_id?: string;
  input_or_output?: "input" | "output";
}

/**
 * Simple, fast hash function (cyrb53) for generating unique message identifiers.
 * Produces a 53-bit hash as a hex string.
 */
const cyrb53 = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16);
};

/**
 * Generates a unique hash for a message based on its key properties.
 * Uses cyrb53 for efficient hashing of the message signature.
 */
const getHashOfMessage = (message: any): string => {
  const signature = [
    message.type ?? "",
    message.model_name ?? "",
    message.role ?? "",
    message.content ?? "",
    message.tool_calls ? JSON.stringify(message.tool_calls) : "",
    message.tool_call_id ?? "",
  ].join("|");

  // if (message.role === "user") {
  //   console.log("=== message", message);
  //   console.log("=== signature", signature);
  //   console.log("===== encrypted", cyrb53(signature));
  // }

  return cyrb53(signature);
};

/**
 * Removes repeating message patterns while preserving unique segments.
 *
 * Example: [1,2,3,4,5, 1,2,3,4,5,6, 1,2,3,4,5,6,7, 1,2] => [1,2,3,4,5,6,7, 1,2]
 *
 * Logic:
 * - Detects segments by finding where the boundary hash repeats
 * - Prefers system message hash as boundary (more reliable than first message)
 * - If a segment EXTENDS the previous (longer + matches prefix) → merge
 * - If a segment is shorter or doesn't extend → it's a NEW segment, keep all
 *
 * Edge cases handled:
 * - Empty array → returns []
 * - No system message → uses first message hash as boundary
 * - User sends same content as system → validates full prefix match, not just boundary
 * - Single message → returns as-is
 */
const removeRepeatingPatterns = <
  T extends { hash: string; type?: string; role?: string }
>(
  items: T[]
): T[] => {
  if (items.length === 0) return [];
  if (items.length === 1) return [...items];

  // Find the boundary hash - prefer system message, fallback to first message
  let boundaryHash: string | null = null;

  // Look for system message to use as boundary marker (more reliable)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === "system" || item.role === "system") {
      boundaryHash = item.hash;
      break;
    }
  }

  // If no system message found, use the first message
  if (boundaryHash === null) {
    boundaryHash = items[0].hash;
  }

  // Find segment boundaries (where boundaryHash appears)
  const segmentStarts: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].hash === boundaryHash) {
      segmentStarts.push(i);
    }
  }

  // If boundary hash only appears once, no repeating pattern possible
  if (segmentStarts.length <= 1) {
    return [...items];
  }

  segmentStarts.push(items.length); // end marker

  const result: T[] = [];
  let accumulatedLength = 0;
  let lastSegmentHashes: string[] = [];

  for (let s = 0; s < segmentStarts.length - 1; s++) {
    const start = segmentStarts[s];
    const end = segmentStarts[s + 1];
    const segmentLength = end - start;

    // Get current segment hashes for comparison
    const currentSegmentHashes: string[] = [];
    for (let i = start; i < end; i++) {
      currentSegmentHashes.push(items[i].hash);
    }

    // Check if this segment extends the previous accumulated sequence
    let isExtension = false;
    if (s > 0 && segmentLength > accumulatedLength && accumulatedLength > 0) {
      // Verify that the prefix of current segment matches the last segment exactly
      isExtension = true;
      for (let i = 0; i < accumulatedLength; i++) {
        if (
          i >= currentSegmentHashes.length ||
          currentSegmentHashes[i] !== lastSegmentHashes[i]
        ) {
          isExtension = false;
          break;
        }
      }
    }

    // Also check for exact duplicate (same length, same content) - skip these
    let isExactDuplicate = false;
    if (s > 0 && segmentLength === accumulatedLength && accumulatedLength > 0) {
      isExactDuplicate = true;
      for (let i = 0; i < segmentLength; i++) {
        if (currentSegmentHashes[i] !== lastSegmentHashes[i]) {
          isExactDuplicate = false;
          break;
        }
      }
    }

    if (isExactDuplicate) {
      // Skip exact duplicates entirely
      continue;
    } else if (isExtension) {
      // Add only the extension items (skip the repeated prefix)
      for (let i = start + accumulatedLength; i < end; i++) {
        result.push(items[i]);
      }
      accumulatedLength = segmentLength;
      lastSegmentHashes = currentSegmentHashes;
    } else {
      // New segment - add all items
      for (let i = start; i < end; i++) {
        result.push(items[i]);
      }
      accumulatedLength = segmentLength;
      lastSegmentHashes = currentSegmentHashes;
    }
  }

  return result;
};

// Re-export flow diagram types for backwards compatibility
export { buildFlowDiagramFromSpans };
export type { FlowNode, FlowEdge, FlowDiagram } from "@/utils/flow-diagram";

export const convertToUniquMessageWithHash = (props: { messages: any[] }) => {
  const { messages } = props;
  const uniqueMessages: UniqueMessageWithHash[] = messages.map((message) => {
    let hashCalculated = getHashOfMessage(message);
    let result: UniqueMessageWithHash = {
      type: message.type,
      model: message.model_name || "",
      role: message.role || "",
      content: message.content || "",
      hash: hashCalculated,
      tool_calls: message.tool_calls,
      tool_call_id: message.tool_call_id,
      input_or_output: message.input_or_output,
    };
    return result;
  });
  return uniqueMessages;
};
export const getUniqueMessage = (props: { flattenSpans: Span[] }) => {
  const { flattenSpans } = props;
  let messages: Message[] = [];

  let validSpans = flattenSpans
    .filter((m) => ["api_invoke"].includes(m.operation_name))
    .sort((a, b) => a.start_time_us - b.start_time_us);

  validSpans.forEach((span) => {
    return messages.push(...extractMessagesFromSpan(span, 0, false));
  });
  const uniqueMessages: UniqueMessageWithHash[] = convertToUniquMessageWithHash(
    { messages }
  );
  const deduplicatedMessages = removeRepeatingPatterns(uniqueMessages);

  // Build flow diagram from spans (more accurate) or fallback to messages
  const flowDiagram = buildFlowDiagramFromSpans(validSpans);

  return { messages: deduplicatedMessages, flowDiagram };
};

export const useMessageExtractSpanById = (
  flattenSpans: Span[],
  spanId: string
): Message[] => {
  const span = useSpanById(flattenSpans, spanId);
  return useMemo(() => {
    if (!span) return [];
    if (span.operation_name === "cache") {
      // get api invoke span
      const apiInvokeSpan = getParentApiInvoke(flattenSpans, span.span_id);
      if (apiInvokeSpan) {
        return extractMessagesFromSpan(apiInvokeSpan);
      }
      return [];
    }
    let messages = extractMessagesFromSpan(span);
    return messages;
  }, [span]);
};
