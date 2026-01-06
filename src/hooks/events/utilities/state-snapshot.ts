import { StateSnapshotEvent } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const handleStateSnapshotEvent = (
  currentSpans: Span[],
  event: StateSnapshotEvent
): Span[] => {
  if (!event.span_id) return currentSpans;

  const existingIndex = currentSpans.findIndex(
    (s) => s.span_id === event.span_id
  );
  if (existingIndex >= 0) {
    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      trace_id: event.snapshot.trace_id,
      finish_time_us: event.timestamp * 1000,
      isInProgress: false,
    };
    return updated;
  } else {
    let snapshotInfo = event.snapshot;
    // Create new span if it doesn't exist
    const newSpan: Span = {
      span_id: event.span_id,
      parent_span_id: event.parent_span_id,
      operation_name: snapshotInfo?.operation_name || "state_snapshot",
      thread_id: event.thread_id || "",
      run_id: event.run_id || "",
      start_time_us: event.timestamp * 1000,
      finish_time_us: event.timestamp * 1000,
      trace_id: event.snapshot.trace_id,
      isInProgress: false,
      attribute: {} as any,
    };
    return [...currentSpans, newSpan];
  }
};
