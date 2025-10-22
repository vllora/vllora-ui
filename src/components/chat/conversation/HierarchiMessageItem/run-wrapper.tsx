import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalMessageSpanItem } from ".";
import { SpanSeparator } from "../SpanSeparator";
import { useState, memo, useMemo, useCallback } from "react";
import { CONNECTOR_WIDTH, CONTENT_PADDING_LEFT } from "./constants";

const RunSpanMessageComponent = (props: {
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

    // Memoize the className for connector line - subtle vertical line on the left
    const contentClassName = useMemo(() =>
        level > 0
            ? "relative before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-purple-500/10"
            : "relative before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-purple-500/10",
        [level]
    );

    // Add padding for nested content
    const contentStyle = useMemo(() =>
        level > 0 ? { paddingLeft: `${CONTENT_PADDING_LEFT}px` } : { paddingLeft: `${CONTENT_PADDING_LEFT}px` },
        [level]
    );

    return (
        <div id={`run-span-conversation-${span_id}`} className="run-wrapper">
            {/* SpanSeparator now handles getting span data and displaying status */}
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
};

// Memoize with custom comparison to optimize re-renders
export const RunSpanMessage = memo(
    RunSpanMessageComponent,
    (prev, next) => {
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
    }
);