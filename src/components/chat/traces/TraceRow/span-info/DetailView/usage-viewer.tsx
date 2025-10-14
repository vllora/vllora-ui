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
        <div className="flex flex-col gap-6 overflow-y-auto text-xs">
            {/* Cost Section */}
            {(cost !== undefined || typeOfCost !== 'undefined') && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <CurrencyDollarIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Cost
                            </div>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <div className="flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                            {typeOfCost === 'number' && cost ? `$${cost.toFixed(6)}` : (typeOfCost === 'string' ? cost : typeOfCost === 'undefined' ? 'N/A' : typeOfCost === 'object' && cost?.cost && typeof cost?.cost === 'number' ? `$${cost?.cost.toFixed(6)}` : 'N/A')}
                        </span>
                    </div>
                </div>
            )}

            {/* TTFT Section */}
            {ttfNumber && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <ClockIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Time to First Token
                            </div>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <div className="flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                            {ttfNumber ? `${ttfNumber.toFixed(2)} ms` : ttft || 'N/A'}
                        </span>
                    </div>
                </div>
            )}

            {/* Token Usage Section */}
            {usage && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/40" />
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-3.5 w-3.5 text-zinc-400" />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Token Usage
                            </div>
                        </div>
                        <div className="h-px flex-1 bg-border/40" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            {inputTokens !== undefined && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-500">Input:</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs font-medium text-white">{formatNumber(inputTokens)}</span>
                                        <span className="text-xs text-zinc-500">tokens</span>
                                    </div>
                                </div>
                            )}

                            {outputTokens !== undefined && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-500">Output:</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs font-medium text-white">{formatNumber(outputTokens)}</span>
                                        <span className="text-xs text-zinc-500">tokens</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Cache tokens section */}
                        {isPromptCachingActive && (
                            <div className="flex flex-col gap-1.5 mt-1 pl-2">
                                {cacheTokenInfo.read > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                                        <span className="text-xs font-medium text-zinc-300">{formatNumber(cacheTokenInfo.read)}</span>
                                        <span className="text-xs text-zinc-500">tokens read from cache</span>
                                    </div>
                                )}
                                {cacheTokenInfo.write > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                                        <span className="text-xs font-medium text-zinc-300">{formatNumber(cacheTokenInfo.write)}</span>
                                        <span className="text-xs text-zinc-500">tokens write to cache</span>
                                    </div>
                                )}
                                {cacheTokenInfo.standard > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                                        <span className="text-xs font-medium text-zinc-300">{formatNumber(cacheTokenInfo.standard)}</span>
                                        <span className="text-xs text-zinc-500">tokens standard</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {totalTokens !== undefined && (
                            <div className="flex items-center justify-between pt-2 border-t border-border/40">
                                <div className="flex items-center gap-2">
                                    <ArrowsRightLeftIcon className="h-3 w-3 text-zinc-400" />
                                    <span className="text-xs text-zinc-500">Total:</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-xs font-medium text-white">{formatNumber(totalTokens)}</span>
                                    <span className="text-xs text-zinc-500">tokens</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};