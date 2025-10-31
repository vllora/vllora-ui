import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalMessageSpanItem } from ".";
import { SpanSeparator } from "../SpanSeparator";
import { memo, useMemo, useCallback } from "react";
import { CONTENT_PADDING_LEFT } from "./constants";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { useSpanById } from "@/hooks/useSpanById";
import { errorFromApiInvokeSpansInSameRun } from "@/hooks/useSpanById";

const RunSpanMessageComponent = (props: {
    span_id: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { span_id, messages, level = 0 } = props;

    const { openTraces, setOpenTraces, flattenSpans, runHighlighted, setRunHighlighted, setHoverSpanId, collapsedSpans } = ChatWindowConsumer();
    const span = useSpanById(flattenSpans, span_id);
    const errors = errorFromApiInvokeSpansInSameRun({ flattenSpans, runId: span?.run_id || '' });

    // Memoize the toggle callback to prevent child re-renders
    const toggleCollapse = useCallback(() => {
        if (span && span.run_id) {
            setOpenTraces(prev => {
                let alreadyOpen = prev?.find((trace) => trace.run_id === span.run_id);
                if (alreadyOpen) {
                    return prev?.filter((trace) => trace.run_id !== span.run_id);
                } else {
                    return [...(prev || []), { run_id: span.run_id, tab: "trace" }];
                }
            });
        }
    }, [span, setOpenTraces]);

    const isCollapsed = useMemo(() => {
        let isOpen = openTraces.find((trace) => trace.run_id === span?.run_id);
        return collapsedSpans.includes(span?.span_id || '') || !isOpen;
    }, [openTraces, span, collapsedSpans]);



    // Memoize the className for connector line - subtle vertical line on the left
    const contentClassName = useMemo(() =>
        "relative before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[1px] before:bg-border",
        []
    );

    // Add padding for nested content
    const contentStyle = useMemo(() =>
        level > 0 ? { paddingLeft: `${CONTENT_PADDING_LEFT}px` } : { paddingLeft: `${CONTENT_PADDING_LEFT}px` },
        [level]
    );

    const isHighlighted = runHighlighted === span_id;

    return (
        <div
            id={`run-span-conversation-${span?.run_id}`}
            className={`run-wrapper transition-colors ${isHighlighted ? 'bg-muted/30' : ''}`}
        >
            {/* SpanSeparator now handles getting span data and displaying status */}
            <SpanSeparator
                spanId={span_id}
                isCollapsed={isCollapsed}
                onToggle={toggleCollapse}
                level={level}
                errors={errors}
                onHover={({
                    runId,
                    isHovering
                }) => {
                    if (isHovering) {
                        setRunHighlighted(runId);
                        setHoverSpanId(span_id);
                    } else {
                        setRunHighlighted(prev => prev === runId ? '' : prev);
                        setHoverSpanId(prev => prev === span_id ? '' : prev);
                    }
                }}
            />
            {!isCollapsed && (
                <div className={contentClassName} style={contentStyle}>
                    {errors && <> <div className="flex flex-col gap-1 mt-1">{errors?.length > 0 && errors.map((error, index) => (
                        <div key={index} className="rounded-md p-3 border border-red-500/30 bg-red-500/5">
                            <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">{error}</pre>
                        </div>
                    ))}</div>
                    </>
                    }
                    {messages.length > 0 && messages.map((message) => (
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