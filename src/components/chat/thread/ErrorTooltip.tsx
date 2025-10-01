import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ErrorTooltipProps {
    errors: string[];
    children: React.ReactNode;
    side?: "top" | "bottom" | "left" | "right";
    className?: string;
}

export const ErrorTooltip = ({ errors, children, side = "top", className = "" }: ErrorTooltipProps) => {
    if (!errors || errors.length === 0) {
        return <>{children}</>;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={`cursor-help ${className}`}>
                        {children}
                    </div>
                </TooltipTrigger>
                <TooltipContent
                    side={side}
                    className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md"
                >
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                        <span>Errors ({errors.length})</span>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-auto">
                        {errors.map((err, idx) => (
                            <div
                                key={idx}
                                className="p-2 bg-muted/50 border-l-2 border-yellow-500 rounded text-xs whitespace-pre-wrap break-words"
                            >
                                {err}
                            </div>
                        ))}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
