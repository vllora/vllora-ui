import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { SpanDetailsDisplay } from "./span-detail-display";


export const SpanInfo = () => {
    const { detailSpan } = ChatWindowConsumer();

    if (!detailSpan) {
        return <div className="p-4 text-sm text-gray-400">Span information not available</div>;
    }

    return <SpanDetailsDisplay/>
}