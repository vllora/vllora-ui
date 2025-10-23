import { CustomEvent, CustomLlmStopEventType } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const handleCustomLlmStopEvent = (
  currentSpans: Span[],
  event: CustomEvent,
  llmStopEvent: CustomLlmStopEventType,
  timestamp: number
): Span[] => {
  const customEventSpanId = event.span_id;
  if (!customEventSpanId) return currentSpans;
  if (!llmStopEvent) return currentSpans;

  const existingIndex = currentSpans.findIndex(
    (s) => s.span_id === customEventSpanId
  );
  if (existingIndex >= 0) {
    // Update existing in-progress span
    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      finish_time_us: timestamp * 1000,
      isInProgress: false,
    };
    return updated;
  } else {
    let newSpanFromLLMStop: Span = {
      span_id: customEventSpanId,
      parent_span_id: event.parent_span_id,
      operation_name: "llm_stop",
      thread_id: event.thread_id || "",
      run_id: event.run_id || "",
      trace_id: "",
      start_time_us: timestamp * 1000,
      finish_time_us: timestamp * 1000,
      attribute: {
        ...llmStopEvent,
      } as any,
      isInProgress: false,
    };
    // Add new completed span
    return [...currentSpans, newSpanFromLLMStop];
  }
};
