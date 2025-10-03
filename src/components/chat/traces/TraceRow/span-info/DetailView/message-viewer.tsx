import { SingleMessage } from "./single-message"



export const MessageViewer = ({ messages }: { messages: { role: string, content: any, parts?: any[], tool_calls?: any[] }[] }) => {
    return <div className="flex flex-col gap-1.5 text-xs">
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
                    isLast={index === messages.length - 1} />
            )
        })}
    </div>
}