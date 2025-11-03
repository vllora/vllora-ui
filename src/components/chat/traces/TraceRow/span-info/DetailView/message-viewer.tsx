import { SingleMessage } from "./single-message"
import { ViewerCollapsibleSection } from "./ViewerCollapsibleSection"

export const MessageViewer = ({
    messages,
    collapsed,
    onCollapsedChange,
    showSection = true
}: {
    messages: { role: string, content: any, parts?: any[], tool_calls?: any[], tool_call_id?: string }[]
    collapsed?: boolean
    onCollapsedChange?: (collapsed: boolean) => void
    showSection?: boolean
}) => {
    const content = (
        <div className="flex flex-col text-xs divide-y divide-border/50">
            {messages.map((message, index) => {
                    // check if content is string
                    if (message.content && typeof message.content !== 'string') {
                        return (
                            <SingleMessage
                                key={index}
                                role={message.role}
                                objectContent={message.content}
                                toolCalls={message.tool_calls}
                                isFirst={index === 0}
                                tool_call_id={message.tool_call_id}
                                isLast={index === messages.length - 1} />
                        )
                    }
                    return (
                        <SingleMessage
                            key={index}
                            role={message.role}
                            parts={message.parts}
                            content={message.content}
                            toolCalls={message.tool_calls}
                            isFirst={index === 0}
                            tool_call_id={message.tool_call_id}
                            isLast={index === messages.length - 1} />
                    )
                })}
        </div>
    );

    if (!showSection) {
        return content;
    }

    return (
        <ViewerCollapsibleSection
            title="Messages"
            count={messages.length}
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
        >
            {content}
        </ViewerCollapsibleSection>
    );
}