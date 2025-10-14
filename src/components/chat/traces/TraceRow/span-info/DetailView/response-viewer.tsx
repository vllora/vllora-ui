import { JsonViewer } from "../JsonViewer";
import { MessageViewer } from "./message-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import {
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  StopIcon,
  FlagIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";
import { AlertTriangle } from "lucide-react";
import { SingleMessage } from "./single-message";

// Helper function to get finish reason styling and information
const getFinishReasonInfo = (finishReason: string) => {
    const reason = finishReason?.toLowerCase();
    
    switch (reason) {
        case 'stop':
            return {
                icon: CheckCircleIcon,
                label: 'Stop',
                description: 'The model completed the response naturally'
            };
        case 'length':
            return {
                icon: StopIcon,
                label: 'Length Limit',
                description: 'The response was cut off due to maximum length constraints'
            };
        case 'tool_calls':
            return {
                icon: WrenchScrewdriverIcon,
                label: 'Tool Called',
                description: 'The model made tool calls and is waiting for responses'
            };
        case 'content_filter':
            return {
                icon: XCircleIcon,
                label: 'Content Filtered',
                description: 'The response was blocked by content filtering policies'
            };
        case 'timeout':
            return {
                icon: ClockIcon,
                label: 'Timeout',
                description: 'The request timed out before completion'
            };
        case 'error':
            return {
                icon: AlertTriangle,
                label: 'Error',
                description: 'An error occurred during response generation'
            };
        default:
            return {
                icon: CheckCircleIcon,
                label: finishReason || 'Unknown',
                description: `Response finished with reason: ${finishReason || 'unknown'}`
            };
    }
};

// UI View Component
const ResponseUIView = ({ response, otherLevelMessages }: { response: any, otherLevelMessages?: string[] }) => {
    // Extract common parameters for UI view
    const {  tool_calls: responseToolCalls } = response || {};
    const keys = response && Object.keys(response);
    let messages = response && response.messages as any[];
    let finish_reason = response && response.finish_reason;
    const tool_calls = responseToolCalls && responseToolCalls.length > 0;
    const choices: any[] = response && response.choices as any[];
    const candidates = response && response.candidates as any[];

    if(!finish_reason && choices && choices.length === 1){
        finish_reason = choices[0].finish_reason;
    }
    if(!finish_reason && candidates && candidates.length === 1){
        finish_reason = candidates[0].finishReason;
    }
    if(!finish_reason && response && response.stop_reason){
        finish_reason = response.stop_reason;
    }
    if(!messages && choices && choices.length === 1){
        messages = [choices[0].message];
    }
    if(!messages && candidates && candidates.length === 1){
        messages = [candidates[0].content];
    }
    if(otherLevelMessages && !messages){
        messages = otherLevelMessages.map((message: string) => ({ content: message, role: 'assistant' }));
    }
    if((!messages || messages.length === 0 ) && response && response.content) {
        messages = [{ content: response.content, role: response.role || 'assistant' }];
    }

    const hideChoices = choices && choices.length === 1 ;
    let extraDataKeys = keys?.filter((key: string) => key !== 'finish_reason' && key !== 'tool_calls' && key !== 'messages' && key !== 'usage');
    if(hideChoices && extraDataKeys && extraDataKeys.length > 0){
        extraDataKeys = extraDataKeys?.filter((key: string) => key !== 'choices');
    }
    
    let extraDataDisplay: any = {}
    if(extraDataKeys && extraDataKeys.length > 0){
       extraDataKeys.forEach((key: string) => {
           extraDataDisplay[key] = response[key];
       })
    }
    return (
        <>
            {/* Finish reason */}
            {finish_reason && (() => {
                const finishInfo = getFinishReasonInfo(finish_reason);
                return (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-border/40" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Finish Reason
                            </div>
                            <div className="h-px flex-1 bg-border/40" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-200">
                            <FlagIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="flex items-center gap-1">
                                <span className="font-medium">{finishInfo.label}</span>
                            </div>
                        </div>
                        <p className="text-[11px] leading-relaxed text-zinc-500">
                            {finishInfo.description}
                        </p>
                    </div>
                );
            })()}
            {/* Messages Section */}
            {messages && messages.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Messages
                            </div>
                            <span className="text-[10px] font-medium text-zinc-500">
                                ({messages.length})
                            </span>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <MessageViewer messages={messages as any[]} />
                </div>
            )}
            {/* Tool calls */}
            {tool_calls && responseToolCalls && responseToolCalls.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <WrenchScrewdriverIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Tool Calls
                            </div>
                            <span className="text-[10px] font-medium text-zinc-500">
                                ({responseToolCalls.length})
                            </span>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <ToolDefinitionsViewer toolCalls={responseToolCalls} />
                </div>
            )}

            {/* Additional Parameters Section */}
            {extraDataKeys && extraDataKeys.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <CodeBracketIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Additional Fields
                            </div>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <JsonViewer data={extraDataDisplay} />
                </div>
            )}
        </>
    );
};


// Main RequestViewer Component
export const ResponseViewer = (props: { 
    response: any,
    otherLevelMessages?: string[],
    viewMode?: 'ui' | 'raw'
}) => {
    const { response, otherLevelMessages, viewMode = 'ui' } = props;
    if (typeof response === 'string') {
        return <SingleMessage role="assistant" content={response} />;
    }
    if (viewMode === 'raw') {
        return (
            <div className="rounded-2xl bg-[#101010] px-2 py-2 text-xs">
                <JsonViewer data={response} />
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-6 overflow-y-auto text-xs">
            <ResponseUIView response={response} otherLevelMessages={otherLevelMessages} />
        </div>
    );
}
