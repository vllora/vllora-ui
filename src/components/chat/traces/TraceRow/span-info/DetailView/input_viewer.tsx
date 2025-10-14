import { MessageViewer } from "./message-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";


// Main RequestViewer Component
export const InputViewer = (props: { jsonRequest: any, viewMode?: 'ui' | 'raw' }) => {
    const { jsonRequest} = props;
     let messages = jsonRequest?.messages;
    if (!messages && jsonRequest?.contents) {
        messages = jsonRequest?.contents;
    }

    const tools = jsonRequest?.tools;

    const tool_choice = jsonRequest?.tool_choice;
    return (
        <div className="flex flex-col gap-6 overflow-y-auto text-xs">
            {messages && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                            Messages
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <MessageViewer
                        messages={messages as any}
                    />
                </div>
            )}


            {tools && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Tools
                            </div>
                            {tool_choice && (
                                <div className="text-[10px] font-medium tracking-wide text-zinc-500">
                                    ({tool_choice})
                                </div>
                            )}
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <ToolDefinitionsViewer toolCalls={tools} />
                </div>
            )}
        </div>
    );
}