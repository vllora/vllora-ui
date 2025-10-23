import { CustomEvent, CustomSpanStartEventType } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const convertCustomSpanStartToSpan = (
  event: CustomEvent,
  spanStart: CustomSpanStartEventType
): Span => {
  return {
    span_id: event.span_id || `span_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: spanStart.operation_name,
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: spanStart.attributes || {},
    isInProgress: true,
  };
};

export const handleCustomSpanStartEvent = (
  currentSpans: Span[],
  event: CustomEvent,
  spanStart: CustomSpanStartEventType
): Span[] => {
  const span = convertCustomSpanStartToSpan(event, spanStart);
  return [...currentSpans, span];
};
