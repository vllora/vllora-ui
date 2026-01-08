import { useState } from "react";
import { Check } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const CopyableToolCallId = ({ toolCallId, className }: { toolCallId: string, className?: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(toolCallId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <code
                        onClick={handleCopy}
                        className={cn("text-[10px] font-mono text-zinc-400 bg-zinc-800/50 px-1.5 py-0.5 rounded cursor-pointer hover:bg-zinc-700/50 transition-colors inline-flex items-center gap-1", className)}
                    >
                        {toolCallId}
                        {copied && <Check className="w-3 h-3 text-green-500" />}
                    </code>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-zinc-900 text-zinc-100 border-zinc-800">
                    <p>{copied ? 'Copied!' : 'Click to copy Tool Call ID'}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
