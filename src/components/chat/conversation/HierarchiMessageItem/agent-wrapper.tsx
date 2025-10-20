


import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalMessageSpanItem } from ".";
import { SpanSeparator } from "../SpanSeparator";
import { useState, memo } from "react";
import { INDENT_PER_LEVEL } from "./constants";


export const AgentSpanMessage = memo((props: {
    spanId: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { spanId, messages, level = 0 } = props;
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    // Calculate indentation based on level
    const indentStyle = level > 0 ? { marginLeft: `${INDENT_PER_LEVEL}px` } : {};

    return <div id={`agent-span-conversation-${spanId}`} className="agent-wrapper" style={indentStyle}>
        <SpanSeparator
            spanId={spanId}
            isCollapsed={isCollapsed}
            onToggle={toggleCollapse}
            level={level}
        />
        {!isCollapsed && (
            <div className={level > 0 ? "border-l-2 border-green-500/20 pl-4 ml-2" : ""}>
                {messages.map((message) => (
                    <HierarchicalMessageSpanItem key={`message-${message.span_id}`} messageStructure={message} level={level + 1} />
                ))}
            </div>
        )}
    </div>
});