import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalSpanItem } from ".";
import { TaskStartSeparator } from "../SpanSeparator";
import { useState } from "react";
import { INDENT_PER_LEVEL } from "./constants";


export const TaskSpanMessage = (props: {
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

    return <div id={`task-span-conversation-${spanId}`} className="task-wrapper" style={indentStyle}>
        <TaskStartSeparator
            spanId={spanId}
            isCollapsed={isCollapsed}
            onToggle={toggleCollapse}
            level={level}
        />
        {!isCollapsed && (
            <div className={level > 0 ? "border-l-2 border-blue-500/20 pl-4 ml-2" : ""}>
                {messages.map((message) => (
                    <HierarchicalSpanItem key={`message-${message.span_id}`} messageStructure={message} level={level + 1} />
                ))}
            </div>
        )}
    </div>
}