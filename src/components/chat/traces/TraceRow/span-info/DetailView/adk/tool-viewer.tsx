import { WrenchScrewdriverIcon, ChevronDownIcon, DocumentTextIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { JsonViewer } from "../../JsonViewer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ADKToolViewerProps {
    toolName: string;
    toolDescription: string;
    toolArgs: any;
    toolResponse: string;
    isSuccess?: boolean;
}

const tryParseJson = (str: string) => {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
};

export const ADKToolViewer = ({ 
    toolName, 
    toolDescription, 
    toolArgs, 
    toolResponse,
}: ADKToolViewerProps) => {
    const [isDescriptionOpen, setIsDescriptionOpen] = useState(true);
    const [isArgsOpen, setIsArgsOpen] = useState(true);
    const [isResponseOpen, setIsResponseOpen] = useState(true);
    
    // Try to parse JSON for better display
    const parsedArgs = typeof toolArgs === 'string' ? tryParseJson(toolArgs) : toolArgs;
    const parsedResponse = typeof toolResponse === 'string' ? tryParseJson(toolResponse) : toolResponse;
    
    return (
        <div className="border border-border rounded-md overflow-hidden">
            <div className="flex items-center justify-between w-full p-2 bg-[#111111] border-b border-border">
                <div className="flex items-center gap-2">
                    <WrenchScrewdriverIcon className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-xs text-white">{toolName}</span>
                </div>
            </div>
            
            {toolDescription && (
                <Collapsible open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-[#151515] transition-colors border-b border-border">
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-4 w-4" />
                            <span className="font-medium text-xs">Description</span>
                        </div>
                        <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isDescriptionOpen ? 'rotate-180' : 'rotate-0'}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="p-3  border-b border-border">
                            <p className="text-xs text-white leading-relaxed whitespace-pre-wrap">{toolDescription}</p>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
            
            {toolArgs && (
                <Collapsible open={isArgsOpen} onOpenChange={setIsArgsOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-[#151515] transition-colors border-b border-border">
                        <div className="flex items-center gap-2">
                            <CodeBracketIcon className="h-4 w-4" />
                            <span className="font-medium text-xs">Arguments</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {parsedArgs && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Badge className="text-xs text-white bg-[#1a1a1a] border-border">
                                                JSON
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="bg-[#1a1a1a] border-border text-white">
                                            <p className="text-xs max-w-[250px]">Arguments formatted as JSON</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                            <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isArgsOpen ? 'rotate-180' : 'rotate-0'}`} />
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="p-3  border-b border-border overflow-auto">
                            {parsedArgs ? (
                                <JsonViewer 
                                    data={parsedArgs} 
                                    style={{
                                        fontSize: '11px',
                                        backgroundColor: '#0d0d0d',
                                    }} 
                                />
                            ) : (
                                <pre className="text-xs text-white font-mono whitespace-pre-wrap">{String(toolArgs)}</pre>
                            )}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
            
            {toolResponse && (
                <Collapsible open={isResponseOpen} onOpenChange={setIsResponseOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-[#151515] transition-colors border-b border-border">
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-4 w-4" />
                            <span className="font-medium text-xs">Response</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {parsedResponse ? (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Badge className="text-xs text-white bg-[#1a1a1a] border-border">
                                                JSON
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="bg-[#1a1a1a] border-border text-white">
                                            <p className="text-xs max-w-[250px]">Response formatted as JSON</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : (
                                <Badge className="text-xs text-white bg-[#1a1a1a] border-border">
                                    Text
                                </Badge>
                            )}
                            <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isResponseOpen ? 'rotate-180' : 'rotate-0'}`} />
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="p-3 overflow-auto">
                            {parsedResponse ? (
                                <JsonViewer 
                                    data={parsedResponse} 
                                    style={{
                                        fontSize: '11px',
                                        backgroundColor: '#0d0d0d',
                                    }} 
                                />
                            ) : (
                                <pre className="text-xs text-white font-mono whitespace-pre-wrap">{toolResponse}</pre>
                            )}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
};