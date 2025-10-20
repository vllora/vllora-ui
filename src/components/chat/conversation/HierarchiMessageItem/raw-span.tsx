import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { useMessageExtraceSpanById } from "@/hooks/useSpanById";
import { MessageStructure } from "@/utils/message-structure-from-span";
import React from "react";
import { Span } from "@/types/common-type";
import { MessageItem } from "../../MessageItem";
import { HierarchicalMessageSpanItem } from "./index";
import { INDENT_PER_LEVEL } from "./constants";


export const RawSpanMessage = React.memo((props: {
    messageStructure: MessageStructure;
    level?: number;
}) => {
    const { messageStructure, level = 0 } = props;
    const { flattenSpans } = ChatWindowConsumer()

    // Calculate indentation based on level
    const indentStyle = level > 0 ? { marginLeft: `${INDENT_PER_LEVEL}px` } : {};

    return <div style={indentStyle}>
        <InnerRawSpanMessage messageStructure={messageStructure} flattenSpans={flattenSpans} />
        {messageStructure.children && messageStructure.children.length > 0 && (
            <div className="space-y-4">
                {messageStructure.children.map((child) => (
                    <HierarchicalMessageSpanItem key={child.span_id} messageStructure={child} level={level + 1} />
                ))}
            </div>
        )}
    </div>
})

const InnerRawSpanMessage = React.memo(({ messageStructure, flattenSpans }: { messageStructure: MessageStructure; flattenSpans: Span[] }) => {
    const messages = useMessageExtraceSpanById(flattenSpans, messageStructure.span_id);
    if(messages.length === 0) return null;
    return <div>{messages.length > 0 && (
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
        </div>

      )}
      </div>
});

