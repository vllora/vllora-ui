import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { useMessageExtraceSpanById } from "@/hooks/useSpanById";
import { MessageStructure } from "@/utils/message-structure-from-span";
import React, { useMemo } from "react";
import { MessageItem } from "../../MessageItem";
import { compareMessageStructure, HierarchicalMessageSpanItem } from "./index";
import { INDENT_PER_LEVEL } from "./constants";


export const RawSpanMessage = React.memo((props: {
    messageStructure: MessageStructure;
    level?: number;
}) => {
    const { messageStructure, level = 0 } = props;
    const { flattenSpans } = ChatWindowConsumer()

    // Memoize the style object to prevent unnecessary re-renders
    const indentStyle = useMemo(() =>
        level > 0 ? { marginLeft: `${INDENT_PER_LEVEL}px` } : {},
        [level]
    );

    return <div style={indentStyle} className="pt-2">
        <InnerRawSpanMessage spanId={messageStructure.span_id} flattenSpans={flattenSpans} />
        {messageStructure.children && messageStructure.children.length > 0 && (
            <div className="space-y-4">
                {messageStructure.children.map((child) => (
                    <HierarchicalMessageSpanItem key={child.span_id} messageStructure={child} level={level + 1} />
                ))}
            </div>
        )}
    </div>
}, (prevProps, nextProps) => {
    // Early exit for simple checks (fastest comparisons first)
    if (prevProps.level !== nextProps.level) return false;
    if (prevProps.messageStructure.span_id !== nextProps.messageStructure.span_id) return false;

    const prevChildren = prevProps.messageStructure.children;
    const nextChildren = nextProps.messageStructure.children;

    if (prevChildren.length !== nextChildren.length) return false;

    // Only compare children if they exist
    if (prevChildren.length > 0) {
        for (let i = 0; i < prevChildren.length; i++) {
            if (!compareMessageStructure(prevChildren[i], nextChildren[i])) {
                return false;
            }
        }
    }

    return true;
})

// Simplified component - let useMessageExtraceSpanById handle the memoization
const InnerRawSpanMessage = React.memo(({ spanId, flattenSpans }: {
    spanId: string;
    flattenSpans: any[];
}) => {
    const messages = useMessageExtraceSpanById(flattenSpans, spanId);

    if (messages.length === 0) return null;

    return (
        <div className="space-y-4">
            {messages.map((message) => (
                <MessageItem key={message.id} message={message} />
            ))}
        </div>
    );
});

