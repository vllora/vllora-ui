import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalSpanItem } from ".";
import { TaskEndSeparator, TaskStartSeparator } from "../TaskSeperator";


export const TaskSpanMessage = (props: {
    spanId: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { spanId, messages, level = 0 } = props;
    return <div id={`task-span-conversation-${spanId}`} className="task-wrapper">
        <TaskStartSeparator spanId={spanId} />
        {messages.map((message) => (
            <HierarchicalSpanItem key={`message-${message.span_id}`} messageStructure={message} level={level + 1} />
        ))}
        <TaskEndSeparator />
    </div>
}