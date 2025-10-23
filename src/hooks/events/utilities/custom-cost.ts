import { CustomEvent, CustomCostEventType } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const handleCustomCostEvent = (
  currentSpans: Span[],
  event: CustomEvent,
  costEvent: CustomCostEventType,
  timestamp: number
): Span[] => {
  const customEventSpanId = event.span_id;
  if (!customEventSpanId) return currentSpans;
  if (!costEvent) return currentSpans;

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
      attribute: {
        ...updated[existingIndex].attribute,
        ...costEvent.value,
      },
    };
    return updated;
  } else {
    let newSpanFromCost: Span = {
      span_id: customEventSpanId,
      parent_span_id: event.parent_span_id,
      operation_name: "cost",
      thread_id: event.thread_id || "",
      run_id: event.run_id || "",
      trace_id: "",
      start_time_us: timestamp * 1000,
      finish_time_us: undefined,
      attribute: {
        ...costEvent.value,
      } as any,
      isInProgress: true,
    };
    // Add new completed span
    return [...currentSpans, newSpanFromCost];
  }
};
