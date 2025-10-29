import { Span } from "@/types/common-type";
import { BaseSpanUIDisplay } from "@/components/chat/traces/TraceRow/span-info/DetailView/BaseSpanUIDisplay";

interface StandaloneSpanUIDetailsDisplayProps {
  span: Span;
  relatedSpans?: Span[];
}

/**
 * A standalone version of SpanUIDetailsDisplay that doesn't depend on ChatWindowContext.
 * This component can be used in contexts where the ChatWindowContext is not available,
 * such as the debug console.
 *
 * Uses the shared BaseSpanUIDisplay component for routing logic.
 */
export const StandaloneSpanUIDetailsDisplay = ({ span, relatedSpans = [] }: StandaloneSpanUIDetailsDisplayProps) => {
  return <div className="p-2 flex flex-col flex-1 overflow-y-auto"><BaseSpanUIDisplay span={span} relatedSpans={relatedSpans} /></div>;
};
