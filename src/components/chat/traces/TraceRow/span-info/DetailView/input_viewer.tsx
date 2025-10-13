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
        <div className="flex flex-col gap-4 overflow-y-auto rounded-lg text-xs">
            {messages && (
                <div className="rounded-2xl bg-[#101010] px-2 space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Messages
                    </div>
                    <MessageViewer
                        messages={messages as any}
                    />
                </div>
            )}


            {tools && (
                <div className="rounded-2xl bg-[#101010] px-2 space-y-1">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Tools
                        </div>
                        {tool_choice && (
                            <div className="text-xs font-semibold tracking-wide text-zinc-500">
                                {tool_choice}
                            </div>
                        )}
                    </div>
                    <ToolDefinitionsViewer toolCalls={tools} />
                </div>
            )}
        </div>
    );
}