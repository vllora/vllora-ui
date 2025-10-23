import { Span } from "@/types/common-type";
import { ToolCallResultEvent } from "@/contexts/project-events/dto";

export const handleToolCallResultEvent = (currentSpans: Span[], event: ToolCallResultEvent): Span[] => {
    const spanId = event.span_id || event.tool_call_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          result: event.content,
          result_role: event.role,
        },
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: spanId,
        parent_span_id: event.parent_span_id,
        operation_name: "tool_call",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: event.timestamp * 1000,
        finish_time_us: undefined,
        attribute: {
          tool_call_id: event.tool_call_id,
          result: event.content,
          result_role: event.role,
        } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
};