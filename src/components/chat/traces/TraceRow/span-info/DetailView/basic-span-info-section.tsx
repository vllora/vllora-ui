import { IdDisplay } from "./spans-display/span-id-display";
import { Span } from "@/types/common-type";
import { Clock, ClockFadingIcon, Timer } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const TimeInfoDisplay = ({ timestamp, type }: { timestamp: number; type: string }) => {
    const localTime = convertTimeMiliSecondsToLocalDateTime(timestamp / 1000);
    const utcTime = convertTimeMiliSecondsToUTCDateTime(timestamp / 1000, false, true);
    const displayType = type.charAt(0).toUpperCase() + type.slice(1);

    return (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help">
                                <Clock className="h-3.5 w-3.5 text-white" />
                                <span className="text-xs text-white w-[65px]">{displayType}:</span>
                                <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
                                    {localTime}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="flex flex-col gap-2 p-3 bg-background border border-border rounded-md shadow-md">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Clock className="h-4 w-4 text-purple-500" />
                                <span>Time Information</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">Local time:</span>
                                    <span className="text-xs font-mono">{localTime}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">UTC time:</span>
                                    <span className="text-xs font-mono">{utcTime}</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic mt-1">Times shown in your local timezone</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
};

const DurationInfoDisplay = ({ startTimestamp, endTimestamp }: { startTimestamp: number; endTimestamp: number }) => {
    const durationSeconds = getDurations(startTimestamp / 1000, endTimestamp / 1000);
    const durationMs = (endTimestamp - startTimestamp) / 1000;
    const startTime = convertTimeMiliSecondsToLocalDateTime(startTimestamp / 1000);
    const endTime = convertTimeMiliSecondsToLocalDateTime(endTimestamp / 1000);

    return (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help">
                                <Timer className="h-3.5 w-3.5 text-white" />
                                <span className="text-xs text-white w-[65px]">Duration:</span>
                                <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
                                    {durationSeconds}s
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Timer className="h-4 w-4 text-purple-500" />
                                <span>Duration Information</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">Start time:</span>
                                    <span className="text-xs font-mono">{startTime}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">End time:</span>
                                    <span className="text-xs font-mono">{endTime}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                                    <span className="text-xs font-medium">Duration:</span>
                                    <span className="text-xs font-mono">{durationSeconds}s ({durationMs.toFixed(0)} ms)</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic mt-1">Times shown in your local timezone</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
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

export const BasicSpanInfo = ({ span, ttf_str }: { span: Span, ttf_str?: string }) => {
     // try to parse ttf as a number
        const [ttfNumber, setTtfNumber] = useState<number | undefined>(undefined);
    
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
        <div className="flex flex-col divide-y divide-[#1a1a1a]">
            {span.trace_id && <IdDisplay id={span.trace_id} type="trace" />}
            {span.run_id && <IdDisplay id={span.run_id} type="run" />}
            {span.thread_id && <IdDisplay id={span.thread_id} type="thread" />}
            {span.start_time_us && <TimeInfoDisplay timestamp={span.start_time_us} type="start time" />}
            {span.start_time_us && span.finish_time_us && <DurationInfoDisplay startTimestamp={span.start_time_us} endTimestamp={span.finish_time_us} />}
            {ttfNumber && <TTFTInfoDisplay ttfNumber={ttfNumber} />}
        </div>
    );
};