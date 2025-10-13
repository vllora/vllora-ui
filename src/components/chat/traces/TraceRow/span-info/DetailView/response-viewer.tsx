import { JsonViewer } from "../JsonViewer";
import { MessageViewer } from "./message-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import { WrenchScrewdriverIcon, CheckCircleIcon, XCircleIcon, ClockIcon, StopIcon, FlagIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SingleMessage } from "./single-message";

// Helper function to get finish reason styling and information
const getFinishReasonInfo = (finishReason: string) => {
    const reason = finishReason?.toLowerCase();
    
    switch (reason) {
        case 'stop':
            return {
                icon: <CheckCircleIcon className="w-3.5 h-3.5" />,
                color: 'text-green-400',
                bgColor: 'bg-green-500/10',
                borderColor: 'border-green-500/20',
                label: 'Stop',
                description: 'The model completed the response naturally',
                badgeColor: 'bg-green-900/30 text-green-400 border-green-800/50'
            };
        case 'length':
            return {
                icon: <StopIcon className="w-3.5 h-3.5" />,
                color: 'text-amber-400',
                bgColor: 'bg-amber-500/10',
                borderColor: 'border-amber-500/20',
                label: 'Length Limit',
                description: 'The response was cut off due to maximum length constraints',
                badgeColor: 'bg-amber-900/30 text-amber-400 border-amber-800/50'
            };
        case 'tool_calls':
            return {
                icon: <WrenchScrewdriverIcon className="w-3.5 h-3.5" />,
                color: 'text-blue-400',
                bgColor: 'bg-blue-500/10',
                borderColor: 'border-blue-500/20',
                label: 'Tool Called',
                description: 'The model made tool calls and is waiting for responses',
                badgeColor: 'bg-blue-900/30 text-blue-400 border-blue-800/50'
            };
        case 'content_filter':
            return {
                icon: <XCircleIcon className="w-3.5 h-3.5" />,
                color: 'text-red-400',
                bgColor: 'bg-red-500/10',
                borderColor: 'border-red-500/20',
                label: 'Content Filtered',
                description: 'The response was blocked by content filtering policies',
                badgeColor: 'bg-red-900/30 text-red-400 border-red-800/50'
            };
        case 'timeout':
            return {
                icon: <ClockIcon className="w-3.5 h-3.5" />,
                color: 'text-orange-400',
                bgColor: 'bg-orange-500/10',
                borderColor: 'border-orange-500/20',
                label: 'Timeout',
                description: 'The request timed out before completion',
                badgeColor: 'bg-orange-900/30 text-orange-400 border-orange-800/50'
            };
        case 'error':
            return {
                icon: <AlertTriangle className="w-3.5 h-3.5" />,
                color: 'text-red-400',
                bgColor: 'bg-red-500/10',
                borderColor: 'border-red-500/20',
                label: 'Error',
                description: 'An error occurred during response generation',
                badgeColor: 'bg-red-900/30 text-red-400 border-red-800/50'
            };
        default:
            return {
                icon: <CheckCircleIcon className="w-3.5 h-3.5" />,
                color: 'text-gray-400',
                bgColor: 'bg-gray-500/10',
                borderColor: 'border-gray-500/20',
                label: finishReason || 'Unknown',
                description: `Response finished with reason: ${finishReason || 'unknown'}`,
                badgeColor: 'bg-gray-900/30 text-gray-400 border-gray-800/50'
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
        <div className="overflow-hidden">
            <div className="divide-y divide-border">
                
                
                
                {/* Finish reason */}
                {finish_reason && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <FlagIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-white">Finish Reason</span>
                            </div>
                        </div>
                        <div className="pl-5">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-help ${getFinishReasonInfo(finish_reason).badgeColor}`}>
                                            {getFinishReasonInfo(finish_reason).icon}
                                            <span className="text-xs font-medium">
                                                {getFinishReasonInfo(finish_reason).label}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[300px] p-3">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                {getFinishReasonInfo(finish_reason).icon}
                                                <span className="font-semibold text-sm">
                                                    {getFinishReasonInfo(finish_reason).label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-300">
                                                {getFinishReasonInfo(finish_reason).description}
                                            </p>
                                            <div className="text-xs text-gray-500 pt-1 border-t border-border">
                                                Raw value: <code className="bg-[#1a1a1a] px-1 py-0.5 rounded">{finish_reason}</code>
                                            </div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </div>
                )}
                {/* Messages Section */}
                {messages && messages.length > 0 && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-white">Messages</span>
                            </div>
                            <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded font-medium">
                                {messages.length}
                            </span>
                        </div>
                        <div className="pl-5">
                            <MessageViewer messages={messages as any[]} />
                        </div>
                    </div>
                )}
                {/* Tool calls */}
                {tool_calls && responseToolCalls && responseToolCalls.length > 0 && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <WrenchScrewdriverIcon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-white">Tool Calls</span>
                            </div>
                            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                {responseToolCalls.length}
                            </span>
                        </div>
                        <div className="pl-5">
                            <ToolDefinitionsViewer toolCalls={responseToolCalls} />
                        </div>
                    </div>
                )}
                
                {/* Additional Parameters Section */}
                {/* {hasExtraParameters && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <CodeBracketIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-white">Others Properties</span>
                            </div>
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                                {parameterCount}
                            </span>
                        </div>
                        <div className="pl-5">
                            <ExtraParameters input={extraDataDisplay} />
                        </div>
                    </div>
                )} */}
                
            </div>
        </div>
    );
};


// Main RequestViewer Component
export const ResponseViewer = (props: { 
    response: any,
    otherLevelMessages?: string[],
    viewMode?: 'ui' | 'raw' }) => {
    const { response, otherLevelMessages, viewMode = 'ui' } = props;
    if (typeof response === 'string') {
        return <SingleMessage role="assistant" content={response} />;
    }
    return (
        <div className="flex flex-col gap-4 overflow-y-auto rounded-lg text-xs">
            <ResponseUIView response={response} otherLevelMessages={otherLevelMessages} />
        </div>
    );
}