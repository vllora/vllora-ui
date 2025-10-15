import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { SpanDetailsDisplay } from "./span-detail-display";


export const SpanInfo = () => {
    const { spanMap, detailSpanId, selectedRunId } = ChatWindowConsumer();
    const spanId = detailSpanId;
    const spanOrRunId = selectedRunId || detailSpanId || '';

    const detailSpan = spanMap[spanOrRunId]?.find(span => span.span_id === spanId);
    if (!detailSpan) {
        return <div className="p-4 text-sm text-gray-400">Span information not available</div>;
    }

    return <SpanDetailsDisplay/>
}