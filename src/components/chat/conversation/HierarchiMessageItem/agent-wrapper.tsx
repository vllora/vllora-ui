import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalMessageSpanItem } from ".";
import { SpanSeparator } from "../SpanSeparator";
import { useState, memo, useMemo, useCallback } from "react";
import { CONTENT_PADDING_LEFT } from "./constants";


export const AgentSpanMessage = memo((props: {
    span_id: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { span_id, messages, level = 0 } = props;
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Memoize the toggle callback to prevent child re-renders
    const toggleCollapse = useCallback(() => {
        setIsCollapsed(prev => !prev);
    }, []);

    const contentClassName = useMemo(() =>
        "relative before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[1px] before:bg-border",
        []
    );

    // Add padding for nested content
    const contentStyle = useMemo(() =>
        level > 0 ? { paddingLeft: `${CONTENT_PADDING_LEFT}px` } : {},
        [level]
    );

    return (
        <div id={`agent-span-conversation-${span_id}`} className="agent-wrapper">
            <SpanSeparator
                spanId={span_id}
                isCollapsed={isCollapsed}
                onToggle={toggleCollapse}
                level={level}
            />
            {!isCollapsed && (
                <div className={contentClassName} style={contentStyle}>
                    {messages.map((message) => (
                        <HierarchicalMessageSpanItem
                            key={message.span_id}
                            messageStructure={message}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // Fast path: if messages array reference is the same, check other props only
    if (prev.messages === next.messages) {
        return prev.level === next.level && prev.span_id === next.span_id;
    }

    // Quick checks first (cheapest comparisons)
    if (prev.level !== next.level) return false;
    if (prev.span_id !== next.span_id) return false;

    const prevMessages = prev.messages;
    const nextMessages = next.messages;

    if (prevMessages.length !== nextMessages.length) return false;

    // Only check span_ids if we have messages (structure comparison)
    if (prevMessages.length > 0) {
        for (let i = 0; i < prevMessages.length; i++) {
            if (prevMessages[i] !== nextMessages[i]) {
                return false;
            }
        }
    }
    return true;
});