import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { useMessageExtractSpanById, useSpanById } from "@/hooks/useSpanById";
import { MessageStructure } from "@/utils/message-structure-from-span";
import React, { useMemo } from "react";
import { MessageItem } from "../../MessageItem";
import { compareMessageStructure, HierarchicalMessageSpanItem } from "./index";
import { INDENT_PER_LEVEL } from "./constants";
import { getColorFromLabel, LabelTag } from "../../traces/TraceRow/new-timeline/timeline-row/label-tag";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

// Static options object to prevent re-renders from new object references
const EXTRACT_MESSAGE_OPTIONS = { excludeToolInvokeMessage: true } as const;

// Static style for labeled spans
const LABEL_BORDER_STYLE_BASE = { borderLeftWidth: '1px', paddingLeft: '5px' } as const;


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

    return <div style={indentStyle} className="flex flex-col">
        <InnerRawSpanMessage currentMessageStructure={messageStructure} flattenSpans={flattenSpans} />
        {messageStructure.children && messageStructure.children.length > 0 && (
            <div className="flex flex-col space-y-4">
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

// Simplified component - let useMessageExtractSpanById handle the memoization
const InnerRawSpanMessage = React.memo(({ currentMessageStructure, flattenSpans }: {
    currentMessageStructure: MessageStructure;
    flattenSpans: any[];
}) => {
    const span = useSpanById(flattenSpans, currentMessageStructure.span_id);
    const extractedMessages = useMessageExtractSpanById(
        flattenSpans,
        currentMessageStructure.span_id,
        EXTRACT_MESSAGE_OPTIONS
    );

    const attributes = span?.attribute;
    const labelAttribute = attributes?.['label'];
    const error = attributes?.error;
    const colorLabel = labelAttribute ? getColorFromLabel(labelAttribute) : undefined;
    const messages = currentMessageStructure.type === 'api_invoke' && currentMessageStructure.children.length > 0 ? [] : extractedMessages;

    // Memoize the label border style to avoid creating new object on each render
    const labelStyle = useMemo(() => {
        if (!labelAttribute || !colorLabel) return undefined;
        return { ...LABEL_BORDER_STYLE_BASE, borderLeftColor: colorLabel.background };
    }, [labelAttribute, colorLabel?.background]);

    if (messages.length === 0) return null;

    return (
        <div className={cn("flex flex-col")}>
            {labelAttribute && <div className="w-full flex justify-end py-4"><LabelTag label={labelAttribute} maxWidth={400} /></div>}
            <div className="flex flex-col gap-3" style={labelStyle}>
                {messages.map((message) => (
                    <MessageItem key={message.id} message={message} />
                ))}
                {error && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span className="text-sm break-words">{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
});

