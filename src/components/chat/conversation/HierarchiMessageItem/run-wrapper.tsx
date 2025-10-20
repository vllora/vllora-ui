import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalMessageSpanItem } from ".";
import { SpanSeparator } from "../SpanSeparator";
import { useState, memo } from "react";
import { INDENT_PER_LEVEL } from "./constants";

const RunSpanMessageComponent = (props: {
    span_id: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { span_id, messages, level = 0 } = props;
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    // Calculate indentation based on level
    const indentStyle = level > 0 ? { marginLeft: `${INDENT_PER_LEVEL}px` } : {};

    return <div id={`run-span-conversation-${span_id}`} className="run-wrapper" style={indentStyle}>
        {/* SpanSeparator now handles getting span data and displaying status */}
        <SpanSeparator
            spanId={span_id}
            isCollapsed={isCollapsed}
            onToggle={toggleCollapse}
            level={level}
        />
        {!isCollapsed && (
            <div className={level > 0 ? "border-l-2 border-purple-500/20 pl-4 ml-2" : ""}>
                {messages.map((message) => (
                    <HierarchicalMessageSpanItem key={`message-${message.span_id}`} messageStructure={message} level={level + 1} />
                ))}
            </div>
        )}
    </div>
};

// Memoize with custom comparison to optimize re-renders
export const RunSpanMessage = memo(
    RunSpanMessageComponent,
    (prevProps, nextProps) => {
        // Re-render if span_id changes
        if (prevProps.span_id !== nextProps.span_id) return false;

        // Re-render if level changes
        if (prevProps.level !== nextProps.level) return false;

        // Re-render if messages structure changes (deep check)
        if (prevProps.messages.length !== nextProps.messages.length) return false;
        for (let i = 0; i < prevProps.messages.length; i++) {
            if (prevProps.messages[i].span_id !== nextProps.messages[i].span_id) {
                return false;
            }
        }

        // Don't re-render (props are equal)
        return true;
    }
);