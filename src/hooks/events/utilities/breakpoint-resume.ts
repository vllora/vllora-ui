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
    return currentSpans.map((span) =>
      span.span_id === customEvent.span_id
        ? { ...span, isInDebug: false }
        : span
    );
  }
  return currentSpans;
};
