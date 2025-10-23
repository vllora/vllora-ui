import { Span } from "@/types/common-type";
import { TextMessageContentEvent } from "@/contexts/project-events/dto";



export const handleTextMessageContentEvent = (currentSpans: Span[], event: TextMessageContentEvent): Span[] => {
   if (!event.span_id) return currentSpans;
   const timestamp = event.timestamp || Date.now();
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
           finish_time_us: timestamp * 1000,
           attribute: {
             ...updated[existingIndex].attribute,
             content: currentContent + event.delta,
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
           finish_time_us: timestamp * 1000,
           attribute: { content: event.delta } as any,
           isInProgress: true,
         };
         return [...currentSpans, newSpan];
       }
}