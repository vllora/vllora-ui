import { CustomEvent } from "@/contexts/project-events/dto";
import { Span } from "@/types/common-type";

/**
 * Handle breakpoint_resume event - set isInDebug to false on the matching span
 */
export const handleBreakpointResumeEvent = (
  currentSpans: Span[],
  customEvent: CustomEvent
): Span[] => {
  if (customEvent.span_id) {
    let existingSpanIndex = currentSpans.findIndex(s => s.span_id === customEvent.span_id)
    if (existingSpanIndex !== -1) {
      currentSpans[existingSpanIndex].isInDebug = false;
      return [...currentSpans];
    }
  }
  return currentSpans;
};
