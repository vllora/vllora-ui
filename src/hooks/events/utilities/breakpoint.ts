import {
  CustomEvent,
  CustomBreakpointEventType,
} from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

/**
 * Handle breakpoint event - set isInDebug to true on the matching span
 * If span doesn't exist, create a new span with operation_name "api_invoke"
 */
export const handleBreakpointEvent = (
  currentSpans: Span[],
  customEvent: CustomEvent,
  breakpointEvent: CustomBreakpointEventType,
  timestamp: number
): Span[] => {
  if (!customEvent.span_id) {
    return currentSpans;
  }

  // Check if span already exists
  const existingSpanIndex = currentSpans.findIndex(
    (span) => span.span_id === customEvent.span_id
  );
  if (existingSpanIndex !== -1) {
    currentSpans[existingSpanIndex].isInDebug = true;
    currentSpans[existingSpanIndex].attribute = {
      ...currentSpans[existingSpanIndex].attribute,
      request: JSON.stringify(breakpointEvent.request),
    };
    return [...currentSpans];
  }
  const newSpan: Span = {
    span_id: customEvent.span_id,
    parent_span_id: customEvent.parent_span_id,
    operation_name: "api_invoke",
    thread_id: customEvent.thread_id || "",
    run_id: customEvent.run_id || "",
    trace_id: "",
    start_time_us: timestamp * 1000,
    finish_time_us: undefined,
    attribute: {
      request: JSON.stringify(breakpointEvent.request),
    },
    isInProgress: true,
    isInDebug: true,
  };

  return [...currentSpans, newSpan];
};
