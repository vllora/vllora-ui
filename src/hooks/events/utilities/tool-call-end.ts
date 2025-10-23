import { Span } from "@/types/common-type";
import { ToolCallEndEvent } from "@/contexts/project-events/dto";

export const handleToolCallEndEvent = (currentSpans: Span[], event: ToolCallEndEvent): Span[] => {
   const spanId = event.span_id || event.tool_call_id;
    if (!spanId) return currentSpans;
    const timestamp = event.timestamp;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) return currentSpans;

    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      finish_time_us: timestamp * 1000,
      isInProgress: false,
    };
    return updated;
};