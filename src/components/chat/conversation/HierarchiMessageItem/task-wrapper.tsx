import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalMessageSpanItem } from ".";
import { SpanSeparator } from "../SpanSeparator";
import { memo, useMemo, useCallback } from "react";
import {  CONTENT_PADDING_LEFT } from "./constants";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";


export const TaskSpanMessage = memo((props: {
    span_id: string;
    run_id: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { span_id, run_id, messages, level = 0 } = props;
    const { setHoverSpanId, setRunHighlighted, setCollapsedSpans, collapsedSpans } = ChatWindowConsumer();
    const isCollapsed = useMemo(() => collapsedSpans.includes(span_id), [collapsedSpans, span_id]);
    // Memoize the toggle callback to prevent child re-renders
    const toggleCollapse = useCallback(() => {
        setCollapsedSpans(prev => {
            if (prev.includes(span_id)) {
                return prev.filter(id => id !== span_id);
            } else {
                return [...prev, span_id];
            }
        });
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
        <div id={`task-span-conversation-${span_id}`} className="task-wrapper flex flex-col gap-2 group">
            <SpanSeparator
                spanId={span_id}
                runId={run_id}
                isCollapsed={isCollapsed}
                onToggle={toggleCollapse}
                level={level}
                onHover={({
                    runId: run_id,
                    isHovering,
                    spanId
                }) => {
                    if(isHovering) {
                        setHoverSpanId(spanId);
                        setRunHighlighted(run_id);
                    } else {
                        setHoverSpanId(prev => prev === spanId ? '' : prev);
                        setRunHighlighted(prev => prev === run_id ? '' : prev);
                    }
                }}
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
        return prev.level === next.level && prev.span_id === next.span_id && prev.run_id === next.run_id;
    }

    // Quick checks first (cheapest comparisons)
    if (prev.level !== next.level) return false;
    if (prev.span_id !== next.span_id) return false;
    if (prev.run_id !== next.run_id) return false;

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