import { Span } from "@/types/common-type";
import { ProjectEventUnion } from "@/contexts/project-events/dto";

export const createRunSpanFromFinishOrErrorEvent = (event: ProjectEventUnion): Span => {
    return {
        span_id: event.span_id || event.run_id || `run_${Date.now()}`,
        parent_span_id: event.parent_span_id,
        operation_name: "run",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        start_time_us: event.timestamp * 1000,
        finish_time_us: event.timestamp * 1000,
        isInProgress: false,
        attribute: event.type === "RunError" ? {
            error: event?.message,
            error_code: event?.code,
        } : {},
        trace_id: "",
    };
}
export const handleRunFinishedErrorEvent = (currentSpans: Span[], event: ProjectEventUnion): Span[] => {
    if (event.type !== "RunFinished" && event.type !== "RunError") {
        return currentSpans;
    }
    const spanId = event.span_id || event.run_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) {
        // Create new span if it doesn't exist
        const newSpan: Span = createRunSpanFromFinishOrErrorEvent(event);
        return [...currentSpans, newSpan];
    }

    const updated = [...currentSpans];
    updated[existingIndex] = {
        ...updated[existingIndex],
        finish_time_us: event.timestamp * 1000,
        isInProgress: false,
        ...(event.type === "RunError" && {
            attribute: {
                ...updated[existingIndex].attribute,
                error: event.message,
                error_code: event.code,
            },
        }),
    };
    return updated;
};