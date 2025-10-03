import { useEffect, useState } from "react";
import { CurrencyDollarIcon, ClockIcon, DocumentTextIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { getCachedTokens } from "./spans-display/prompt-caching-tooltip";

const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
};

export const UsageViewer = (props: {
    cost: any | undefined,
    ttft: string | undefined,
    usage: any | undefined,
}) => {
    const { cost, ttft, usage } = props;
    // try to parse ttf as a number
    const [ttfNumber, setTtfNumber] = useState<number | undefined>(undefined);

    useEffect(() => {
        if (ttft) {
            try {
                const ttfNumber = parseFloat(ttft);
                if (!isNaN(ttfNumber)) {
                    setTtfNumber(ttfNumber / 1000);
                }
            } catch (error) {
                console.error("Error parsing TTF:", error);
                setTtfNumber(undefined);
            }
        }
    }, [ttft]);

    // Support both input_tokens and prompt_tokens formats
    const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens;
    const outputTokens = usage?.output_tokens ?? usage?.completion_tokens;
    const totalTokens = usage?.total_tokens;
    const cacheTokenInfo = getCachedTokens(usage);
    const isPromptCachingActive = cacheTokenInfo.read > 0 || cacheTokenInfo.write > 0;
    const typeOfCost = typeof cost;
    return (
        <div className="flex flex-col gap-3 overflow-y-auto">
            {/* Cost Section */}
            <div className="flex items-center justify-between p-2 rounded-md border border-border">
                <div className="flex items-center gap-2">
                    <CurrencyDollarIcon className="h-4 w-4 text-green-500" />
                    <span className="text-xs text-gray-300">Cost</span>
                </div>
                <span className="text-xs font-medium text-white">
                    {typeOfCost === 'number' && cost ? `$${cost.toFixed(6)}` : (typeOfCost === 'string' ? cost : typeOfCost === 'undefined' ? 'N/A' : typeOfCost === 'object' && cost?.cost && typeof cost?.cost === 'number' ? `$${cost?.cost.toFixed(6)}` : 'N/A')}
                </span>
            </div>

            {/* TTFT Section */}
            {ttfNumber && <div className="flex items-center justify-between p-2  rounded-md border border-border">
                <div className="flex items-center gap-2">
                    <ClockIcon className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-gray-300">Time to First Token</span>
                </div>
                <span className="text-xs font-medium text-white">
                    {ttfNumber ? `${ttfNumber.toFixed(2)} ms` : ttft || 'N/A'}
                </span>
            </div>}

            {/* Token Usage Section */}
            {usage && (
                <div className="flex flex-col gap-2 p-2 rounded-md border border-border">
                    <div className="flex items-center gap-2 mb-1">
                        <DocumentTextIcon className="h-4 w-4 text-violet-500" />
                        <span className="text-xs text-gray-300">Token Usage</span>
                    </div>

                    <div className="flex flex-col gap-2 w-full pl-6">
                        <div className="flex justify-between w-full">
                            {inputTokens !== undefined && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Input:</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs font-medium text-white">{formatNumber(inputTokens)}</span>
                                        <span className="text-xs text-gray-500">tokens</span>
                                    </div>
                                </div>
                            )}

                            {outputTokens !== undefined && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Output:</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs font-medium text-white">{formatNumber(outputTokens)}</span>
                                        <span className="text-xs text-gray-500">tokens</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Cache tokens section */}

                        {isPromptCachingActive && <>
                            <div className="flex flex-col gap-1.5 mt-1">
                               
                            <div className="flex flex-col gap-2 cursor-help">
                                                {cacheTokenInfo.read > 0 && <div className="flex items-center gap-1">
                                                    <div className="w-1 h-1 bg-zinc-600 rounded-full" />
                                                    <span className="text-xs font-medium text-zinc-300">{formatNumber(cacheTokenInfo.read)}</span>
                                                    <span className="text-xs text-gray-600"> tokens read from cache</span>
                                                </div>}
                                                {cacheTokenInfo.write > 0 && <div className="flex items-center gap-1">
                                                    <div className="w-1 h-1 bg-zinc-600 rounded-full" />
                                                    <span className="text-xs font-medium text-zinc-300">{formatNumber(cacheTokenInfo.write)}</span>
                                                    <span className="text-xs text-gray-600"> tokens write to cache</span>
                                                </div>}
                                                {cacheTokenInfo.standard > 0 && <div className="flex items-center gap-1">
                                                    <div className="w-1 h-1 bg-zinc-600 rounded-full" />
                                                    <span className="text-xs font-medium text-zinc-300">{formatNumber(cacheTokenInfo.standard)}</span>
                                                    <span className="text-xs text-gray-600"> tokens standard</span>
                                                </div>}
                                            </div>
                            </div>

                        </>}
                      
                    </div>

                    {totalTokens !== undefined && (
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-border">
                            <div className="flex items-center gap-2">
                                <ArrowsRightLeftIcon className="h-3 w-3 text-amber-500" />
                                <span className="text-xs text-gray-400">Total:</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-white">{formatNumber(totalTokens)}</span>
                                <span className="text-xs text-gray-500">tokens</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};