import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCost } from "@/utils/formatCost";

interface StatsBarProps {
    latency?: string;
    startTime?: number;
    endTime?: number;
    usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
    };
    cost?: number;
}

const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp / 1000); // Convert microseconds to milliseconds
    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
};

export const StatsBar = ({ latency, startTime, endTime, usage, cost }: StatsBarProps) => {
    const hasStats = latency || usage?.total_tokens || cost !== undefined;
    if (!hasStats) return null;

    // Handle both naming conventions
    const inputTokens = usage?.prompt_tokens ?? usage?.input_tokens;
    const outputTokens = usage?.completion_tokens ?? usage?.output_tokens;

    const durationMs = startTime && endTime ? (endTime - startTime) / 1000 : undefined;

    return (
        <div className="flex items-stretch gap-2 mb-2">
            {latency && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex-1 flex flex-col gap-1 px-2 py-2 rounded-lg border border-border cursor-help">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Duration</span>
                                <span className="text-base font-semibold text-teal-400">{latency}s</span>
                            </div>
                        </TooltipTrigger>
                        {startTime && endTime && (
                            <TooltipContent className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-xs text-muted-foreground">Start time:</span>
                                        <span className="text-xs font-mono">{formatTimestamp(startTime)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-xs text-muted-foreground">End time:</span>
                                        <span className="text-xs font-mono">{formatTimestamp(endTime)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 pt-1 border-t border-border">
                                        <span className="text-xs font-medium">Duration:</span>
                                        <span className="text-xs font-mono">{latency} ({durationMs?.toFixed(0)} ms)</span>
                                    </div>
                                </div>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
            )}
            {usage?.total_tokens !== undefined && (
                <div className="flex-1 flex flex-col gap-1 px-2 py-2 rounded-lg border border-border">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Tokens</span>
                    <span className="text-base font-semibold text-white">{usage.total_tokens.toLocaleString()}</span>
                    {(inputTokens !== undefined || outputTokens !== undefined) && (
                        <code className="text-[10px] text-zinc-500">
                            {inputTokens?.toLocaleString() ?? 0} in · {outputTokens?.toLocaleString() ?? 0} out
                        </code>
                    )}
                </div>
            )}
            {cost !== undefined && (
                <div className="flex-1 flex flex-col gap-1 px-2 py-2 rounded-lg border border-border bg-[#0d0d0d]">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Cost</span>
                    <span className="text-base font-semibold text-emerald-400">{formatCost(cost, 5)}</span>
                </div>
            )}
        </div>
    );
};
