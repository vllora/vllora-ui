import { AgentStartedEvent, ProjectEventUnion } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

export const convertAgentStartedToSpan = (event: AgentStartedEvent): Span => {
  return {
    span_id: event.span_id || `agent_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "agent",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: event.name ? { "langdb.agent_name": event.name } : {},
    isInProgress: true,
  };
};

export const handleAgentStartedEvent = (currentSpans: Span[], event: ProjectEventUnion): Span[] => {
    if (event.type !== "AgentStarted") {
        return currentSpans;
    }
    const spanId = event.span_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) {
        // Create new span if it doesn't exist
        const newSpan: Span = convertAgentStartedToSpan(event);
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