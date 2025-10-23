import { Span } from "@/types/common-type";
import { ProjectEventUnion, RunStartedEvent } from "@/contexts/project-events/dto";
export const convertRunStartedToSpan = (event: RunStartedEvent): Span => {
  return {
    span_id: event.span_id || event.run_id || `run_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "run",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: {},
    isInProgress: true,
  };
};
export const handleRunStartedEvent = (currentSpans: Span[], event: ProjectEventUnion): Span[] => {
    if (event.type !== "RunStarted") {
        return currentSpans;
    }
    const span = convertRunStartedToSpan(event);

    const existingIndex = currentSpans.findIndex(
        (s) => s.span_id === span.span_id
    );
    if (existingIndex >= 0) {
        const updatedSpans = [...currentSpans];
        updatedSpans[existingIndex] = span;
        return updatedSpans;
    }

    return [...currentSpans, span];
};