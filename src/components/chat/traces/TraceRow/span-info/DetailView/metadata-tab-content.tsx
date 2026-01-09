import { IdDisplay } from "./spans-display/span-id-display";
import { Span } from "@/types/common-type";
import { ClockFadingIcon } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { CopyTextButton } from "./spans-display/span-id-display";

const TTFTInfoDisplay = ({ ttfNumber }: { ttfNumber: number }) => {
    // ttfNumber is in milliseconds
    const ttftSeconds = ttfNumber / 1000;
    const ttftMs = ttfNumber;

    // Always display as seconds with 2 decimal places
    const displayValue = `${ttftSeconds.toFixed(2)}s`;

    return (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help">
                                <ClockFadingIcon className="h-3.5 w-3.5 text-white" />
                                <span className="text-xs text-white w-[65px]">TTFT:</span>
                                <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500 font-mono">
                                    {displayValue}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="flex flex-col gap-2 p-3 bg-background border border-border rounded-md shadow-md">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <ClockFadingIcon className="h-4 w-4 text-purple-500" />
                                <span>Time to First Token</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-xs text-muted-foreground">Duration:</span>
                                    <span className="text-xs font-mono">{displayValue} ({ttftMs.toFixed(0)} ms)</span>
                                </div>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <CopyTextButton text={ttftMs.toFixed(0)} tooltipText="Copy TTFT (ms)" />
        </div>
    );
};

interface MetadataTabContentProps {
    span: Span;
}

export const MetadataTabContent = ({ span }: MetadataTabContentProps) => {
    const [ttfNumber, setTtfNumber] = useState<number | undefined>(undefined);
    const ttf_str = span?.attribute ? (span?.attribute as any)?.ttft : undefined;

    useEffect(() => {
        if (ttf_str) {
            try {
                const ttfNumber = parseFloat(ttf_str);
                if (!isNaN(ttfNumber)) {
                    setTtfNumber(ttfNumber / 1000);
                }
            } catch (error) {
                console.error("Error parsing TTF:", error);
                setTtfNumber(undefined);
            }
        }
    }, [ttf_str]);

    return (
        <div className="flex flex-col divide-y divide-border overflow-hidden">
            {span.thread_id && <IdDisplay id={span.thread_id} type="thread" />}
            {span.run_id && <IdDisplay id={span.run_id} type="run" />}
            {span.trace_id && <IdDisplay id={span.trace_id} type="trace" />}
            {span.span_id && <IdDisplay id={span.span_id} type="span" />}
            {ttfNumber && <TTFTInfoDisplay ttfNumber={ttfNumber} />}
        </div>
    );
};
