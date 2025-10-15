import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { SpanDetailsDisplay } from "./span-detail-display";


export const SpanInfo = () => {
    const { spanMap, selectedSpanId, selectedRunId } = ChatWindowConsumer();
    const spanId = selectedSpanId;
    const spanOrRunId = selectedRunId || selectedSpanId || '';

    const selectedSpan = spanMap[spanOrRunId]?.find(span => span.span_id === spanId);
    if (!selectedSpan) {
        return <div className="p-4 text-sm text-gray-400">Span information not available</div>;
    }

    return <SpanDetailsDisplay
    />
}