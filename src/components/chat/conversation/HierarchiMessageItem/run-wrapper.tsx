import { MessageStructure } from "@/utils/message-structure-from-span";
import { HierarchicalSpanItem } from ".";
import { RunEndSeparator, RunStartSeparator } from "../RunSeparator";


export const RunSpanMessage = (props: {
    runId: string;
    messages: MessageStructure[];
    level?: number;
}) => {
    const { runId, messages, level = 0 } = props;
    return <div id={`run-span-conversation-${runId}`} className="run-wrapper">
        <RunStartSeparator runId={runId} />
        {messages.map((message) => (
            <HierarchicalSpanItem key={`message-${message.span_id}`} messageStructure={message} level={level + 1} />
        ))}
        <RunEndSeparator />
    </div>
}