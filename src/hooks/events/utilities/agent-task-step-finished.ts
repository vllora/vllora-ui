import { ProjectEventUnion } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";


export const convertAgentTaskStepFinishedToSpan = (event: ProjectEventUnion): Span => {
    return {
        span_id: event.span_id || `agent_task_step_${Date.now()}`,
        parent_span_id: event.parent_span_id,
        operation_name: event.type === "AgentFinished" ? "agent" : event.type === "TaskFinished" ? "task" : "step",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: event.timestamp * 1000,
        finish_time_us: event.timestamp * 1000,
        attribute: {},
        isInProgress: false,
    };
}


export const handleAgentTaskStepFinishedEvent = (currentSpans: Span[], event: ProjectEventUnion): Span[] => {
    if (event.type !== "AgentFinished" && event.type !== "TaskFinished" && event.type !== "StepFinished") {
        return currentSpans;
    }
    const spanId = event.span_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) {
        // create new span
        const newSpan: Span = convertAgentTaskStepFinishedToSpan(event);
        return [...currentSpans, newSpan];
    }

    const updated = [...currentSpans];
    updated[existingIndex] = {
        ...updated[existingIndex],
        finish_time_us: event.timestamp * 1000,
        isInProgress: false,
    };
    return updated;
};