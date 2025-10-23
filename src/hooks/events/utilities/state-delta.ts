import { StateDelta } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const handleStateDeltaEvent = (
  currentSpans: Span[],
  event: StateDelta,
  timestamp: number
): Span[] => {
  if (!event.span_id) return currentSpans;

  const existingIndex = currentSpans.findIndex(
    (s) => s.span_id === event.span_id
  );
  if (existingIndex >= 0) {
    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      attribute: {
        ...updated[existingIndex].attribute,
        state_delta: event.delta,
      },
    };
    return updated;
  } else {
    // Create new span if it doesn't exist
    const newSpan: Span = {
      span_id: event.span_id,
      parent_span_id: event.parent_span_id,
      operation_name: "span",
      thread_id: event.thread_id || "",
      run_id: event.run_id || "",
      trace_id: "",
      start_time_us: timestamp * 1000,
      finish_time_us: undefined,
      attribute: {
        state_delta: event.delta,
      } as any,
      isInProgress: true,
    };
    return [...currentSpans, newSpan];
  }
};
