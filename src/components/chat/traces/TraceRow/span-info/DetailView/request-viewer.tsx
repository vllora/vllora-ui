import { JsonViewer } from "../JsonViewer";
import { MessageViewer } from "./message-viewer";
import { ExtraParameters } from "./input-viewer";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import { CpuChipIcon, CodeBracketIcon, WrenchScrewdriverIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { Copy, CheckIcon } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// UI View Component
const RequestUIView = ({ jsonRequest }: { jsonRequest: any }) => {
    const [copied, setCopied] = useState(false);
    
    // Extract common parameters for UI view
    const { model, tools } = jsonRequest;
    const hasTools = tools && tools.length > 0;
    const keys = jsonRequest && Object.keys(jsonRequest);
    const hasExtraParameters = keys && keys.filter((key: string) => key !== 'messages' && key !== 'tools' && key !== 'model' && key !== 'contents').length > 0;
    const parameterCount = keys?.filter((key: string) => key !== 'messages' && key !== 'tools' && key !== 'model' && key !== 'contents').length || 0;
    let messages = jsonRequest?.messages;
    if(!messages && jsonRequest?.contents){
        messages = jsonRequest?.contents;
    }
    const handleCopyRequest = () => {
        navigator.clipboard.writeText(JSON.stringify(jsonRequest, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    return (
        <div className="overflow-hidden relative">
            {/* Floating Copy Button */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleCopyRequest}
                            className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded border border-border transition-colors"
                        >
                            {copied ? (
                                <CheckIcon className="h-3 w-3 text-green-400" />
                            ) : (
                                <Copy className="h-3 w-3 text-gray-400" />
                            )}
                            <span className="text-xs text-gray-400">
                                {copied ? 'Copied!' : 'Copy'}
                            </span>
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[250px] p-3">
                        <div className="space-y-1">
                            <p className="text-xs font-medium">Copy Full Request</p>
                            <p className="text-xs text-gray-300">
                                Copies the complete request object including model, messages, tools, and all parameters in JSON format.
                            </p>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <div className="divide-y divide-border">
                {/* Model Section */}
                {model && (
                    <div className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex items-center gap-1.5">
                                <CpuChipIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-white">Model</span>
                            </div>
                        </div>
                        <div className="pl-5">
                            <div className="inline-flex items-center px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded">
                                <span className="text-xs text-blue-300 font-mono">{model}</span>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Messages Section */}
                {messages && (
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
                
                {/* Tools Section */}
                {hasTools && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <WrenchScrewdriverIcon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-white">Tools</span>
                            </div>
                            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                {tools.length}
                            </span>
                        </div>
                        <div className="pl-5">
                            <ToolDefinitionsViewer toolCalls={tools} />
                        </div>
                    </div>
                )}
                
                {/* Additional Parameters Section */}
                {hasExtraParameters && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <CodeBracketIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                <span className="text-xs font-medium text-white">Additional Parameters</span>
                            </div>
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                                {parameterCount}
                            </span>
                        </div>
                        <div className="pl-5">
                            <ExtraParameters input={jsonRequest} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Raw JSON View Component
const RequestRawView = ({ jsonRequest }: { jsonRequest: any }) => {
    return <JsonViewer data={jsonRequest} />;
};

// Main RequestViewer Component
export const RequestViewer = (props: { jsonRequest: any, viewMode?: 'ui' | 'raw' }) => {
    const { jsonRequest, viewMode = 'ui' } = props;
    
    return (
        <div className="flex flex-col gap-4 overflow-y-auto rounded-lg text-xs">
            {viewMode === 'raw' ? (
                <RequestRawView jsonRequest={jsonRequest} />
            ) : (
                <RequestUIView jsonRequest={jsonRequest} />
            )}
        </div>
    );
}