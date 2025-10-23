import { ToolCallStartEvent } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";
export const convertToolCallStartToSpan = (event: ToolCallStartEvent): Span => {
  return {
    span_id: event.span_id || event.tool_call_id || `tool_call_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "tools",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: {
      tool_call_id: event.tool_call_id,
      tool_call_name: event.tool_call_name,
    },
    isInProgress: true,
  };
};

export const handleToolCallStartedEvent = (currentSpans: Span[], event: ToolCallStartEvent): Span[] => {
   const span = convertToolCallStartToSpan(event);
   const spanIndex = currentSpans.findIndex((s) => s.span_id === span.span_id);
   if (spanIndex !== -1) {
    // update span
    currentSpans[spanIndex] = span;
    return [...currentSpans];
  }
    return [...currentSpans, span];
};