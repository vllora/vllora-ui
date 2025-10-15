import { IdDisplay } from "./spans-display/span-id-display";
import { Span } from "@/types/common-type";
import { Clock, ClockFadingIcon, Timer } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useEffect, useState } from "react";

export const convertTimeMiliSecondsToUTCDateTime = (
    inputTime: number,
    isShortFormat?: boolean,
    hideAfixUTC?: boolean
) => {
    // Convert micro seconds to seconds
    const miliseconds = inputTime;
    // convert to dd/mm/yyyy hh:mm:ss in UTC timezone
    const date = new Date(miliseconds);
    if (isShortFormat) {
        return `${date.toLocaleString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC' // Explicitly use UTC timezone
        })} ${!hideAfixUTC ? 'UTC' : ''}`;
    }
    return `${date.toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC' // Explicitly use UTC timezone
    })} ${!hideAfixUTC ? 'UTC' : ''}`;
};

export const convertTimeMiliSecondsToLocalDateTime = (
    inputTime: number,
    isShortFormat?: boolean
) => {
    // Convert milliseconds to local time
    const miliseconds = inputTime;
    const date = new Date(miliseconds);

    if (isShortFormat) {
        return date.toLocaleString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
            // No timeZone specified = uses browser's local timezone
        });
    }
    return date.toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
        // No timeZone specified = uses browser's local timezone
    });
};

export const getDurations = (startTime: number, endTime: number) => {
    // Convert micro seconds to seconds
    const seconds = (endTime - startTime) / 1000;
    const seconds_with2Decimals = seconds.toFixed(2);
    if (seconds_with2Decimals === '0.00') {
        return '<0.01';
    }
    return seconds_with2Decimals;
};


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
        </div>
    );
};

export const BasicSpanInfo = ({ span }: { span: Span, relatedSpan?: Span[] }) => {
    // try to parse ttf as a number
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
        <Dialog>
            <DialogTrigger asChild>
                <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1a1a1a] border border-border/40 hover:bg-[#1f1f1f] hover:border-border transition-colors">
                    <span className="text-xs font-medium text-gray-400">Metadata</span>
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-background border border-border">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">
                        Span Metadata
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col divide-y divide-[#1a1a1a]">
                    {span.trace_id && <IdDisplay id={span.trace_id} type="trace" />}
                    {span.run_id && <IdDisplay id={span.run_id} type="run" />}
                    {span.thread_id && <IdDisplay id={span.thread_id} type="thread" />}
                    {ttfNumber && <TTFTInfoDisplay ttfNumber={ttfNumber} />}
                </div>
            </DialogContent>
        </Dialog>
    );
};