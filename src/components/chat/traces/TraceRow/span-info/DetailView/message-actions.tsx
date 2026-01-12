import { Copy, Check, Eye, EyeOff } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageActionsProps {
    rawMode: boolean;
    onRawModeToggle: () => void;
    copied: boolean;
    onCopy: () => void;
}

export const MessageActions = ({ rawMode, onRawModeToggle, copied, onCopy }: MessageActionsProps) => {
    return (
        <div className="flex items-center gap-1">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onRawModeToggle}
                            className="flex items-center justify-center w-7 h-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 border border-transparent hover:border-zinc-600/50 rounded-lg transition-all duration-200"
                        >
                            {rawMode ? (
                                <EyeOff className="w-3 h-3" />
                            ) : (
                                <Eye className="w-3 h-3" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="px-2 py-1">
                        <span className="text-xs">{rawMode ? "Show formatted" : "Show raw"}</span>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onCopy}
                            className="flex items-center justify-center w-7 h-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 border border-transparent hover:border-zinc-600/50 rounded-lg transition-all duration-200"
                        >
                            {copied ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                                <Copy className="w-3 h-3" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="px-2 py-1">
                        <span className="text-xs">{copied ? "Copied!" : "Copy content"}</span>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
};
