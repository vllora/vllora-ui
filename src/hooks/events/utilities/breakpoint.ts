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
  const existingSpan = currentSpans.find(
    (span) => span.span_id === customEvent.span_id
  );
  console.log("==== existingSpan", existingSpan);
  console.log("==== handleBreakpointEvent", customEvent, breakpointEvent);

  if (existingSpan) {
    // Update existing span
    return currentSpans.map((span) =>
      span.span_id === customEvent.span_id
        ? {
            ...span,
            isInDebug: true,
            attribute: {
              ...span.attribute,
              request: JSON.stringify(breakpointEvent.request),
            },
          }
        : span
    );
  }
  console.log("===== breakpoint event", customEvent, currentSpans);
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
