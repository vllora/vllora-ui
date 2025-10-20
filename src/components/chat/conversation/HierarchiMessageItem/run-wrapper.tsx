import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalMessageSpanItem } from ".";
import { RunStartSeparator } from "../SpanSeparator";
import { useState } from "react";
import { INDENT_PER_LEVEL } from "./constants";


export const RunSpanMessage = (props: {
    runId: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { runId, messages, level = 0 } = props;
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    // Calculate indentation based on level
    const indentStyle = level > 0 ? { marginLeft: `${INDENT_PER_LEVEL}px` } : {};

    return <div id={`run-span-conversation-${runId}`} className="run-wrapper" style={indentStyle}>
        <RunStartSeparator
            runId={runId}
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
}