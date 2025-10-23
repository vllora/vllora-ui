import { Span } from "@/types/common-type";
import { ToolCallEndEvent } from "@/contexts/project-events/dto";

export const handleToolCallEndEvent = (currentSpans: Span[], event: ToolCallEndEvent): Span[] => {
   const spanId = event.span_id || event.tool_call_id;
    if (!spanId) return currentSpans;
    const timestamp = event.timestamp;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) {
      // span not exist, create new span
      const newSpan: Span = {
        span_id: spanId,
        parent_span_id: event.parent_span_id,
        operation_name: "tools",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {
          tool_call_id: event.tool_call_id,
        } as any,
        isInProgress: false,
      };
      return [...currentSpans, newSpan];
    };

    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      finish_time_us: timestamp * 1000,
      isInProgress: false,
    };
    return updated;
};