import { TextMessageStartEvent } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";



export const handleTextMessageStartedEvent = (currentSpans: Span[], event: TextMessageStartEvent): Span[] => {
   if (!event.span_id || event.type !== "TextMessageStart") return currentSpans;
     const timestamp = event.timestamp || Date.now();

    let textMessageStartEvent: TextMessageStartEvent =
      event as TextMessageStartEvent;
    if (!textMessageStartEvent) return currentSpans;
    // check if span exists
    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      const attr = updated[existingIndex].attribute as any;
      const currentContent = attr.content || "";
      updated[existingIndex] = {
        ...updated[existingIndex],
        parent_span_id: event.parent_span_id,
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        isInProgress: true,
        attribute: {
          ...updated[existingIndex].attribute,
          content: currentContent,
        } as any,
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        operation_name: "text_message",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {} as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
}