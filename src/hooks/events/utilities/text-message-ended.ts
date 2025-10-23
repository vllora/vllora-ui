import { Span } from "@/types/common-type";
import { TextMessageEndEvent } from "@/contexts/project-events/dto";


export const handleTextMessageEndedEvent = (currentSpans: Span[], event: TextMessageEndEvent): Span[] => {
   if (!event.span_id) return currentSpans;
   const timestamp = event.timestamp || Date.now();
   const existingIndex = currentSpans.findIndex(
     (s) => s.span_id === event.span_id
   );
   if (existingIndex === -1) {
    return currentSpans;
   };
   const updated = [...currentSpans];
   updated[existingIndex] = {
     ...updated[existingIndex],
     finish_time_us: timestamp * 1000,
     isInProgress: false,
   };
   return updated;
}   