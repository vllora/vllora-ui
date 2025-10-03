import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, InfoIcon } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { CopyTextButton } from './spans-display/span-id-display';
export const HeadersViewer = (props: { input: any }) => {
    const { input } = props;
    const [showAllHeaders, setShowAllHeaders] = useState(false);

    if (!input) {
        return <div className="p-2 text-gray-400 italic border border-gray-700 rounded-md bg-black">No input</div>;
    }
    
    // LangDB headers with descriptions for tooltips
    const langdbHeaders = [
        { key: 'x-project-id', description: 'Unique identifier for the project' },
        { key: 'x-thread-id', description: 'Unique identifier for the conversation thread' },
        { key: 'x-run-id', description: 'Unique identifier for the execution run' },
        { key: 'x-label', description: 'Custom label for the trace' },
        { key: 'x-agent-name', description: 'Name of the agent that generated this trace' }
    ];

    const langdbHeaderKeys = langdbHeaders.map(header => header.key);
    let keys = Object.keys(input);
    // sort langdb headers to the top
    keys.sort((a, b) => {
        if (langdbHeaderKeys.includes(a)) {
            return -1;
        }
        if (langdbHeaderKeys.includes(b)) {
            return 1;
        }
        return a.localeCompare(b);
    });
    
    // Check if any LangDB headers exist
    const hasLangdbHeaders = keys.some(key => langdbHeaderKeys.includes(key));
    
    // If no LangDB headers exist, show all headers by default
    useEffect(() => {
        if (!hasLangdbHeaders) {
            setShowAllHeaders(true);
        }
    }, [hasLangdbHeaders]);



    return (
        <div className="flex flex-col gap-2 overflow-y-auto rounded-lg">
            {/* LangDB Headers Section */}
            {keys.some(key => langdbHeaderKeys.includes(key)) && (
                <div className="mb-2">
                    <div className="flex flex-col gap-2">
                        {/* LangDB Headers */}
                        {keys.filter(key => langdbHeaderKeys.includes(key)).map((key: string) => {
                            const headerInfo = langdbHeaders.find(h => h.key === key);
                            return (
                                <div key={key} className="flex flex-col gap-1 bg-[#111111] p-2 rounded-md border border-border hover:border-border transition-colors">
                                    <div className="flex justify-between items-center gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-bold text-white">{key}</span>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <InfoIcon className="h-3.5 w-3.5 cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="bg-black border-primary text-white">
                                                        <p className="text-xs">{headerInfo?.description || 'LangDB header'}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-1 justify-between">
                                        <span className="text-xs text-gray-400 font-mono break-all">
                                            {typeof input[key] === 'object' ? JSON.stringify(input[key]) : String(input[key])}
                                        </span>
                                        <CopyTextButton text={typeof input[key] === 'object' ? JSON.stringify(input[key]) : String(input[key])} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Show Other Headers Button (when collapsed) */}
            {!showAllHeaders && hasLangdbHeaders && keys.filter(key => key !== 'messages' && !langdbHeaderKeys.includes(key)).length > 0 && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllHeaders(true)}
                    className="flex items-center gap-2 mt-1 w-full justify-center bg-[#111111] border-border hover:bg-[#1a1a1a] text-gray-300"
                >
                    <span>Show Other Headers</span>
                    <ChevronDown className="h-4 w-4" />
                </Button>
            )}

            {/* Other Headers Section */}
            {showAllHeaders && keys.filter(key => key !== 'messages' && !langdbHeaderKeys.includes(key)).length > 0 && (
                <div className="flex flex-col gap-2">
                    {keys.filter(key => key !== 'messages' && !langdbHeaderKeys.includes(key)).map((key: string) => {
                        return <div key={key} className="flex flex-col gap-1 bg-[#111111] p-2 rounded-md border border-border">
                            <div className="flex justify-between items-center gap-2">
                                <span className="text-xs font-medium text-gray-300">{key}</span>
                            </div>
                            {typeof input[key] === 'boolean' ? (
                                <input
                                    type="checkbox"
                                    checked={input[key]}
                                    readOnly
                                    className="input-checkbox"
                                />
                            ) : (
                                <div className="flex items-center gap-2 flex-1 justify-between">
                                    <span className="text-xs text-gray-400 font-mono break-all">
                                        {typeof input[key] === 'object' ? JSON.stringify(input[key]) : String(input[key])}
                                    </span>
                                    <CopyTextButton text={typeof input[key] === 'object' ? JSON.stringify(input[key]) : String(input[key])} />
                                </div>
                            )}
                        </div>
                    })}
                    
                    {/* Hide Other Headers Button (when expanded) */}
                    {hasLangdbHeaders && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAllHeaders(false)}
                            className="flex items-center gap-2 mt-2 w-full justify-center bg-[#111111] border-border hover:bg-[#1a1a1a] text-gray-300"
                        >
                            <span>Hide Other Headers</span>
                            <ChevronUp className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
