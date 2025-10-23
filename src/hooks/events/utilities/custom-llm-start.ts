import { CustomEvent, CustomLlmStartEventType } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const handleCustomLlmStartEvent = (
  currentSpans: Span[],
  event: CustomEvent,
  llmStartEvent: CustomLlmStartEventType,
  timestamp: number
): Span[] => {
  const customEventSpanId = event.span_id;
  if (!customEventSpanId) return currentSpans;
  if (!llmStartEvent) return currentSpans;

  const existingIndex = currentSpans.findIndex(
    (s) => s.span_id === customEventSpanId
  );
  if (existingIndex >= 0) {
    // Update existing in-progress span
    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      attribute: {
        ...updated[existingIndex].attribute,
        model_name: llmStartEvent.model_name,
        input: llmStartEvent.input,
      },
    };
    return updated;
  } else {
    let newSpanFromLLMStart: Span = {
      span_id: customEventSpanId,
      parent_span_id: event.parent_span_id,
      operation_name: llmStartEvent.provider_name,
      thread_id: event.thread_id || "",
      run_id: event.run_id || "",
      trace_id: "",
      start_time_us: timestamp * 1000,
      finish_time_us: undefined,
      attribute: {
        ...llmStartEvent,
      } as any,
      isInProgress: true,
    };
    // Add new completed span
    return [...currentSpans, newSpanFromLLMStart];
  }
};
