import { ProjectEventUnion, StepStartedEvent } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const convertStepStartedToSpan = (event: StepStartedEvent): Span => {
  return {
    span_id: event.span_id || `step_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "step",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: { "langdb.step_name": event.step_name },
    isInProgress: true,
  };
};

export const handleStepStartedEvent = (currentSpans: Span[], event: ProjectEventUnion): Span[] => {
    if (event.type !== "StepStarted") {
        return currentSpans;
    }
    const spanId = event.span_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) {
        // Create new span if it doesn't exist
        const newSpan: Span = convertStepStartedToSpan(event);
        return [...currentSpans, newSpan];
    }

    const updated = [...currentSpans];
    updated[existingIndex] = {
        ...updated[existingIndex],
        start_time_us: event.timestamp * 1000,
        isInProgress: true,
    };
    return updated;
};  