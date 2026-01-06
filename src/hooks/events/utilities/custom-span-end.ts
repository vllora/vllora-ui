import { CustomEvent, CustomSpanEndEventType } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const convertCustomSpanEndToSpan = (
  event: CustomEvent,
  spanEnd: CustomSpanEndEventType
): Span => {
  return {
    span_id: event.span_id || "",
    parent_span_id: event.parent_span_id,
    operation_name: spanEnd.operation_name,
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: spanEnd.start_time_unix_nano / 1000,
    finish_time_us: spanEnd.finish_time_unix_nano / 1000,
    attribute: spanEnd.attributes || {},
    isInProgress: false,
    isInDebug: false
  };
};

export const handleCustomSpanEndEvent = (
  currentSpans: Span[],
  event: CustomEvent,
  spanEnd: CustomSpanEndEventType
): Span[] => {
  const span = convertCustomSpanEndToSpan(event, spanEnd);
  const existingIndex = currentSpans.findIndex(
    (s) => s.span_id === span.span_id
  );
  if (existingIndex >= 0) {
    // Update existing in-progress span
    const updated = [...currentSpans];
    updated[existingIndex] = span;
    return updated;
  } else {
    // Add new completed span
    return [...currentSpans, span];
  }
};
