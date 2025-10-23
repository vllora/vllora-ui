import { Span } from "@/types/common-type";
import { ToolCallArgsEvent } from "@/contexts/project-events/dto";


export const handleToolCallArgsEvent = (currentSpans: Span[], event: ToolCallArgsEvent): Span[] => {
   const spanId = event.span_id || event.tool_call_id;
   const timestamp = event.timestamp;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      const attr = updated[existingIndex].attribute as any;
      const currentArgs = attr.tool_arguments || "";
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          tool_arguments: currentArgs + event.delta,
        } as any,
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
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
          tool_arguments: event.delta,
        } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
};