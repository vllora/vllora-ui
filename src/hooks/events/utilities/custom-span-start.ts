import {
  CustomEvent,
  CustomSpanStartEventType,
} from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const convertCustomSpanStartToSpan = (
  event: CustomEvent,
  spanStart: CustomSpanStartEventType
): Span => {
  let attributes = spanStart.attributes || {};
  if (attributes.request && typeof attributes.request === "object") {
    // have to string request to have same behavior like we do when fetching spans from backend
    attributes.request = JSON.stringify(attributes.request);
  }
  return {
    span_id: event.span_id || `span_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: spanStart.operation_name,
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: attributes || {},
    isInProgress: true,
  };
};

export const handleCustomSpanStartEvent = (
  currentSpans: Span[],
  event: CustomEvent,
  spanStart: CustomSpanStartEventType
): Span[] => {
  const span = convertCustomSpanStartToSpan(event, spanStart);
  // check span is already exist
  const spanIndex = currentSpans.findIndex((s) => s.span_id === span.span_id);
  if (spanIndex !== -1) {
    // update span
    currentSpans[spanIndex] = span;
    return [...currentSpans];
  }
  return [...currentSpans, span];
};
