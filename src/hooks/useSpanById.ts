import { useMemo } from "react";
import { Span } from "@/types/common-type";
import { Message } from "@/types/chat";
import { extractMessagesFromSpanById, ExtractMessagesFromSpanByIdOptions } from "@/utils/span-to-message";
import { findSpanById, findSpansByRunId } from "@/utils/span-hierarchy";

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
    return findSpanById(flattenSpans, spanId);
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
    return findSpansByRunId(flattenSpans, runId);
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

export const useMessageExtractSpanById = (
  flattenSpans: Span[],
  spanId: string,
  options: ExtractMessagesFromSpanByIdOptions = {}
): Message[] => {
  return useMemo(() => {
    return extractMessagesFromSpanById(flattenSpans, spanId, options);
  }, [flattenSpans, spanId, options]);
};
