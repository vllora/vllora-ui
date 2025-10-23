import { ProjectEventUnion, TaskStartedEvent } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const convertTaskStartedToSpan = (event: TaskStartedEvent): Span => {
  return {
    span_id: event.span_id || `task_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "task",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: event.name ? { "langdb.task_name": event.name } : {},
    isInProgress: true,
  };
};

export const handleTaskStartedEvent = (currentSpans: Span[], event: ProjectEventUnion): Span[] => {
    if (event.type !== "TaskStarted") {
        return currentSpans;
    }
    const spanId = event.span_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) {
        // Create new span if it doesn't exist
        const newSpan: Span = convertTaskStartedToSpan(event);
        return [...currentSpans, newSpan];
    }

    const updated = [...currentSpans];
    updated[existingIndex] = {
        ...updated[existingIndex],
        finish_time_us: event.timestamp * 1000,
        isInProgress: true,
    };
    return updated;
};